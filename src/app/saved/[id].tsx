import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { AddFromSaved } from '@/components/collections/AddFromSaved';
import { type GridRow, GridRowView, gridRows, pickKey, postOf, useDrinkColumn } from '@/components/collections/CollectionGrid';
import { RenameSheet } from '@/components/collections/RenameSheet';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarButton, TopBarTextButton, useScrolledPast } from '@/components/ScreenTopBar';
import { ActionSheet, type SheetAction } from '@/components/Sheet';
import { announce, Button, EmptyState, haptic, Hold } from '@/components/ui';
import { colors, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { type Collection, contentsLine, type ItemKind, type ItemRef, isUuid, shareLink } from '@/lib/collections';
import { useAuth } from '@/store/auth';
import { useCollectionPrefs, useCollections } from '@/store/collections';
import type { Drink } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* A collection (spec §4.6, §4.7; frames `collection`, `more`, `share`) */
/*                                                                      */
/* Pushed from its tile on Saved. The bar holds only the back chevron   */
/* (layout spec rule 8); the name is the page's title, with ••• on its  */
/* first line, then "9 drinks · 2 posts · Private" (or "· Shared by     */
/* link"), then the grid (components/collections/CollectionGrid).       */
/*                                                                      */
/* •••, headed by that line:                                            */
/*   Rename           a one-field sheet. A shared collection's new name */
/*                    goes through the content filter (023), and a      */
/*                    refusal keeps the old one.                        */
/*   Share            turns the link on, then the iOS share sheet with  */
/*                    the https link. The first share ever carries one  */
/*                    ink line above the share sheet: who sees what,    */
/*                    and where to stop. Once shared: Share link (the   */
/*                    same link again) and Stop sharing (the link dies, */
/*                    in the app and on the web; sharing again mints a  */
/*                    new one).                                         */
/*   Remove items     boxes on every tile, Cancel in the bar, Remove 2  */
/*                    at the foot. They stay in All saved.              */
/*   Delete           the system confirm, then back to Saved. Its       */
/*                    things stay in All saved.                         */
/*                                                                      */
/* The page draws from store/collections, so every change shows at      */
/* once; it reads its collection again each time it comes to the front, */
/* so one changed on another phone is current. `add=1` (from New        */
/* collection on the Saved tab) opens Add from All saved on arrival.    */
/* ==================================================================== */

export default function CollectionScreen() {
  const params = useLocalSearchParams<{ id: string; add?: string }>();
  const id = String(params.id ?? '').toLowerCase();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /* Back is the stack's; opened with nothing under it, Saved. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/saved');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <CollectionBody key={`${myId}:${id}`} myId={myId} id={id} openAdd={params.add === '1'} onBack={leave} />;
}

function CollectionBody({
  myId,
  id,
  openAdd,
  onBack,
}: {
  myId: string;
  id: string;
  openAdd: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const column = useDrinkColumn();
  const [scrolled, onScroll] = useScrolledPast();

  const status = useCollections((s) => s.status);
  const collection = useCollections((s) => s.list.find((c) => c.id === id));
  const refreshOne = useCollections((s) => s.refreshOne);
  const removeItems = useCollections((s) => s.removeItems);
  const removeCollection = useCollections((s) => s.remove);
  const share = useCollections((s) => s.share);
  const unshare = useCollections((s) => s.unshare);
  const shareNoticeSeen = useCollectionPrefs((s) => s.shareNoticeSeen);
  const markShareNoticeSeen = useCollectionPrefs((s) => s.markShareNoticeSeen);

  /* Read again on every arrival: 'gone' once the server says it is not there (deleted, or not yours). */
  const valid = isUuid(id);
  const [read, setRead] = useState<'reading' | 'read' | 'gone' | 'failed'>('reading');
  const readAgain = useCallback(() => {
    if (!valid) return undefined;
    let alive = true;
    void refreshOne(id).then((fresh) => {
      if (alive) setRead(fresh === 'failed' ? 'failed' : fresh ? 'read' : 'gone');
    });
    return () => {
      alive = false;
    };
  }, [id, refreshOne, valid]);
  useFocusEffect(readAgain);

  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // Straight from New collection, Add from All saved is the page it arrives on (spec §4.4).
  const [adding, setAdding] = useState(openAdd);
  const [freshAdd, setFreshAdd] = useState(openAdd);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [sharing, setSharing] = useState<'idle' | 'notice'>('idle');
  // Deleted from here: the page is leaving, and draws nothing in the moment before it has gone.
  const [deleted, setDeleted] = useState(false);

  if (!collection) {
    const waiting = valid && (status === 'loading' || (read === 'reading' && status !== 'off'));
    return (
      <View style={styles.screen}>
        <ScreenTopBar
          title="Collection"
          titleVisible={false}
          showRule={false}
          left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        />
        {deleted ? null : waiting ? (
          <Hold slowMessage="Still loading this collection." />
        ) : valid && read === 'failed' ? (
          <EmptyState
            icon="alert"
            title="Could not load this collection"
            body="Check your connection and try again."
            actionVariant="secondary"
            action={{
              label: 'Try again',
              onPress: () => {
                setRead('reading');
                readAgain();
              },
            }}
          />
        ) : (
          <EmptyState
            icon="bookmark"
            title="This collection isn't here any more"
            body="It was deleted, maybe on another phone."
            actionVariant="secondary"
            action={{ label: 'Back', onPress: onBack }}
          />
        )}
      </View>
    );
  }

  const c: Collection = collection;
  const drinks = c.items.flatMap((i): Drink[] => {
    if (i.kind !== 'drink') return [];
    const d = getDrink(i.id);
    return d ? [d] : [];
  });
  const posts = c.items.filter((i) => i.kind === 'post').map(postOf);
  const rows: GridRow[] = gridRows(drinks, posts);
  const meta = `${contentsLine(c.items)} · ${c.shareId ? 'Shared by link' : 'Private'}`;

  const openDrink = (drinkId: string) => router.navigate({ pathname: '/drink/[id]', params: { id: drinkId } });

  /* ---- Remove items ---- */
  const toggle = (kind: ItemKind, itemId: string) => {
    const key = pickKey(kind, itemId);
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    haptic.select();
    setPicked(next);
  };
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const removePicked = () => {
    const refs: ItemRef[] = c.items.filter((i) => picked.has(pickKey(i.kind, i.id))).map((i) => ({ kind: i.kind, id: i.id }));
    setRemoving(true);
    void removeItems(c.id, refs).then((ok) => {
      setRemoving(false);
      if (!ok) {
        showNotice('Could not remove them', 'Check your connection and try again.');
        return;
      }
      haptic.success();
      announce(`Removed ${refs.length} from ${c.name}. ${refs.length === 1 ? 'It stays' : 'They stay'} in All saved.`);
      stopSelecting();
    });
  };
  /* VoiceOver's way, without the mode: one tile at a time. */
  const removeOne = (kind: ItemKind, itemId: string) => {
    void removeItems(c.id, [{ kind, id: itemId }]).then((ok) => {
      announce(ok ? `Removed from ${c.name}` : `Could not remove it from ${c.name}`);
    });
  };

  /* ---- Share ---- */
  const shareNow = async () => {
    /*
     * Asked of the server every time, Share link too: share_collection
     * hands back the live id when the link is on, so a link stopped on
     * another phone since this one last read it is never the one sent.
     * Offline, a link this phone knows is still worth sending.
     */
    const done = await share(c.id);
    let shareId: string;
    if (done.ok) {
      shareId = done.value;
    } else if (done.reason === 'failed' && c.shareId) {
      shareId = c.shareId;
    } else {
      if (done.reason === 'objectionable') Alert.alert('Rename it to share it', 'A shared link shows its name, and this one can’t go on it.');
      else showNotice('Could not share it', 'Check your connection and try again.');
      return;
    }
    // The first share ever carries its line for the share sheet's whole life (spec §4.7).
    const first = !shareNoticeSeen;
    if (first) {
      setSharing('notice');
      announce(SHARE_NOTICE.replace('•••', 'More'));
    }
    try {
      await Share.share({ message: `My ${c.name} collection on Sipply`, url: shareLink(shareId) });
    } catch {
      // A share sheet that will not open leaves the link on; ••• has Share link again.
    } finally {
      if (first) markShareNoticeSeen();
      setSharing('idle');
    }
  };
  const stopSharing = () => {
    void unshare(c.id).then((ok) => {
      if (ok) announce('Sharing stopped. The link no longer works.');
      else showNotice('Could not stop sharing', 'Check your connection and try again.');
    });
  };

  /* ---- Delete ---- */
  const confirmDelete = () =>
    confirmDestructive(
      `Delete ${c.name}?`,
      `Its drinks and posts stay in All saved.${c.shareId ? ' The link stops working.' : ''}`,
      'Delete',
      () => {
        // Marked first: the store lets the collection go before this promise settles.
        setDeleted(true);
        void removeCollection(c.id).then((ok) => {
          if (ok) {
            announce(`Deleted ${c.name}`);
            onBack();
          } else {
            setDeleted(false);
            showNotice('Could not delete it', 'Check your connection and try again.');
          }
        });
      },
    );

  const actions: SheetAction[] = [
    { label: 'Rename', onPress: () => setRenaming(true) },
    ...(c.shareId
      ? [
          { label: 'Share link', onPress: () => void shareNow() },
          { label: 'Stop sharing', onPress: stopSharing },
        ]
      : [{ label: 'Share', onPress: () => void shareNow() }]),
    ...(c.items.length > 0 ? [{ label: 'Remove items', onPress: () => setSelecting(true) }] : []),
    { label: 'Delete collection', destructive: true, onPress: confirmDelete },
  ];

  const head = (
    <View style={styles.head}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.title}>
          {c.name}
        </Text>
        {!selecting ? (
          <Pressable
            onPress={() => setMenu(true)}
            // The slot is the title's 34pt line; the slop makes it the 44pt hit (spec §4.6).
            hitSlop={{ top: MORE_SLOP, bottom: MORE_SLOP }}
            accessibilityRole="button"
            accessibilityLabel={`More for ${c.name}`}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
            <Icon name="more" size={24} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.meta}>{meta}</Text>
    </View>
  );

  const empty = (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon="bookmark"
        title="Nothing here yet"
        body={`Long-press a bookmark to save something straight into ${c.name}.`}
        action={{
          label: 'Add from All saved',
          onPress: () => {
            setFreshAdd(false);
            setAdding(true);
          },
        }}
        actionVariant="secondary"
      />
    </View>
  );

  if (adding) {
    return (
      <AddFromSaved
        collection={c}
        myId={myId}
        fresh={freshAdd}
        onClose={() => {
          setAdding(false);
          setFreshAdd(false);
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title={c.name}
        titleVisible={false}
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        right={selecting ? <TopBarTextButton label="Cancel" onPress={stopSelecting} /> : undefined}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => (
          <GridRowView
            row={item}
            column={column}
            selection={selecting ? { on: true, picked, toggle } : undefined}
            removal={selecting ? undefined : { label: `Remove from ${c.name}`, remove: removeOne }}
            onOpenDrink={openDrink}
          />
        )}
        ListHeaderComponent={head}
        ListEmptyComponent={empty}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={4}
        windowSize={5}
        contentContainerStyle={{ paddingBottom: insets.bottom + (selecting ? FOOT + space.lg : space.xl) }}
        showsVerticalScrollIndicator={false}
      />

      {selecting ? (
        <View style={[styles.foot, { paddingBottom: insets.bottom + space.md }]}>
          <Button
            label={picked.size > 0 ? `Remove ${picked.size}` : 'Remove'}
            onPress={removePicked}
            disabled={picked.size === 0}
            loading={removing}
            block
          />
        </View>
      ) : null}

      {sharing === 'notice' ? (
        /* Above the share sheet's medium height, for the sheet's whole life (frame `share`). */
        <View pointerEvents="none" style={[styles.shareNotice, { bottom: Math.round(height / 2) + space.lg }]}>
          <Text style={styles.shareNoticeText}>{SHARE_NOTICE}</Text>
        </View>
      ) : null}

      <ActionSheet visible={menu} onClose={() => setMenu(false)} header={`${c.name} · ${meta}`} actions={actions} />
      <RenameSheet visible={renaming} collection={c} onClose={() => setRenaming(false)} />
    </View>
  );
}

/** The foot slab's key and its padding, which the list keeps clear of. */
const FOOT = layout.control + space.md;
/** Above and below •••, so its hit is 44 tall on the title's shorter line. */
const MORE_SLOP = Math.max(0, Math.ceil((layout.hit - textRole.title.lineHeight) / 2));
/** The first share's line (spec §4.7). Drawn over the page and spoken, since the share sheet keeps VoiceOver to itself. */
const SHARE_NOTICE = 'Anyone with the link sees the name, its drinks and your username. Stop sharing any time in •••.';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: layout.gutter, paddingTop: space.sm },
  /* The name wraps; ••• sits on its first line, its glyph on the far gutter. */
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  title: { ...textRole.title, color: colors.text, flex: 1 },
  more: {
    width: layout.hit,
    height: textRole.title.lineHeight,
    marginRight: -(layout.hit - 24) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  meta: { ...textRole.small, color: colors.textMuted, marginTop: space.xs },
  emptyWrap: { paddingTop: space.xl },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bg,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
  },
  shareNotice: {
    position: 'absolute',
    left: layout.gutter,
    right: layout.gutter,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.text,
  },
  shareNoticeText: { ...textRole.body, color: colors.onInk },
});
