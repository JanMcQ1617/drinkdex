import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { AllSavedTab, useSavedPosts } from '@/components/collections/AllSaved';
import { Cover, type CoverPiece } from '@/components/collections/Cover';
import { NewCollectionSheet } from '@/components/collections/SaveSheet';
import { EmptyArt } from '@/components/DexCard';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { ScreenTopBar, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { EmptyState, haptic, PressableScale } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { type Collection, contentsLine, contentsSpoken } from '@/lib/collections';
import { useAuth } from '@/store/auth';
import { useCollections, useCollectionsOn } from '@/store/collections';
import { useTaste } from '@/store/taste';

/* ==================================================================== */
/* Saved                                                                */
/*                                                                      */
/* A tab, in My Bar's old slot (Jan, 13 Oct 2026: "where the my bar     */
/* section was add a section where you can save drinks and have them    */
/* accessed quickly there"), at the same /saved, so every link to it    */
/* still lands.                                                         */
/*                                                                      */
/* TWO PAGES, ONE TAB (v4.2 §4.5).                                      */
/*                                                                      */
/*   Collections on (an account, and migration 023 there): Instagram's  */
/*   Saved on the Dex's grid. All saved first, then your collections,   */
/*   the one saved to last first, then New collection, two to a row as  */
/*   the Dex's prints. All saved opens what this tab showed until now   */
/*   (app/saved/all.tsx); a collection opens its page (/saved/[id]).    */
/*   Collections off (signed out, or before 023): build 23's page,      */
/*   exactly (components/collections/AllSaved), so nothing is one tap   */
/*   further away for them.                                             */
/*                                                                      */
/* SAVED DRINKS ARE THE PHONE'S FIRST, so they show signed out, before  */
/* any account exists. Signed in, the page is behind the gate as Home   */
/* and Profile are, so the welcome and username steps come first; keyed */
/* by account, so one account's posts are never drawn for the next.     */
/* Nothing saved at all and no collections: today's empty state, no     */
/* tiles.                                                               */
/*                                                                      */
/* The list refreshes when the tab comes to the front (stale-gated in    */
/* store/collections), so a collection made on another phone shows.     */
/* ==================================================================== */

export default function SavedTab() {
  const myId = useAuth((s) => s.session?.user.id ?? null);
  if (myId) {
    return (
      <AuthGate>
        <SavedRoot key={myId} myId={myId} />
      </AuthGate>
    );
  }
  return <AllSavedTab myId={null} />;
}

function SavedRoot({ myId }: { myId: string }) {
  const on = useCollectionsOn();
  /*
   * The list is read again whenever the tab comes to the front, from here
   * rather than from the tiles: a first read that failed (offline at
   * launch) leaves collections off, so the tiles are not mounted to ask,
   * and this is what turns them on once the phone is back online. Stale-
   * gated in the store, and a no-op before 023 (collectionsSupported).
   */
  const refresh = useCollections((s) => s.refresh);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  return on ? <SavedTiles myId={myId} /> : <AllSavedTab myId={myId} />;
}

/** A tile: All saved, a collection, or New collection. */
type Tile =
  | { key: 'all'; kind: 'all'; pieces: CoverPiece[]; meta: string; spoken: string }
  | { key: string; kind: 'collection'; collection: Collection }
  | { key: 'new'; kind: 'new' };

/** The cover and the two lines under it: 8 to the name, the line under it. */
const NAME_GAP = space.sm;

function SavedTiles({ myId }: { myId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();

  const [scrolled, onScrolledPast] = useScrolledPast();
  const { onScroll } = useTabScroll('saved', onScrolledPast);
  const listRef = useRef<Animated.FlatList<Tile[]>>(null);
  useScrollToTop(listRef);

  const list = useCollections((s) => s.list);
  const refresh = useCollections((s) => s.refresh);

  // All saved's count and cover: the drinks are the phone's, the posts the same read the page makes.
  const { status, posts, reloading, reload } = useSavedPosts(myId);
  const tasteReady = useTaste((s) => s.hydrated);
  const savedIds = useTaste((s) => s.saved);
  const drinkIds = tasteReady ? savedIds.filter((id) => getDrink(id) !== undefined) : [];

  const [creating, setCreating] = useState(false);
  const [pulling, setPulling] = useState(false);

  const allPieces: CoverPiece[] = [
    ...drinkIds.slice(0, 4).map((id): CoverPiece => ({ kind: 'drink', drinkId: id, photoPath: null })),
    ...posts.slice(0, 4).map((p): CoverPiece => ({ kind: 'post', drinkId: p.drinkId, photoPath: p.photoPath ?? null })),
  ].slice(0, 4);
  const allItems = [
    ...drinkIds.map(() => ({ kind: 'drink' as const })),
    ...posts.map(() => ({ kind: 'post' as const })),
  ];

  const nothing = tasteReady && status === 'ready' && drinkIds.length === 0 && posts.length === 0 && list.length === 0;

  /* Two to a row, as the Dex's prints; one at the largest text sizes, so a name has room (spec §6). */
  const columns = fontScale > 1.6 ? 1 : 2;
  const column = (width - 2 * layout.gutter - layout.dexGap * (columns - 1)) / columns;

  const tiles: Tile[] = [
    { key: 'all', kind: 'all', pieces: allPieces, meta: contentsLine(allItems), spoken: contentsSpoken(allItems) },
    ...list.map((c): Tile => ({ key: c.id, kind: 'collection', collection: c })),
    { key: 'new', kind: 'new' },
  ];
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += columns) rows.push(tiles.slice(i, i + columns));

  const pull = () => {
    setPulling(true);
    reload();
    void refresh(true).finally(() => setPulling(false));
  };

  const open = (tile: Tile) => {
    haptic.tap();
    if (tile.kind === 'all') router.push('/saved/all');
    else if (tile.kind === 'collection') router.push({ pathname: '/saved/[id]', params: { id: tile.collection.id } });
    else setCreating(true);
  };

  const renderRow = ({ item }: { item: Tile[] }) => (
    <View style={styles.row}>
      {item.map((tile) => (
        <TileView key={tile.key} tile={tile} size={column} onPress={() => open(tile)} />
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* A tab root: the title set left, and no icon (v4: at most one, and this page needs none). */}
      <ScreenTopBar size="lg" title="Saved" showRule={scrolled} />
      <Animated.FlatList<Tile[]>
        ref={listRef}
        data={nothing ? [] : rows}
        keyExtractor={(row) => row.map((t) => t.key).join('|')}
        renderItem={renderRow}
        ListHeaderComponent={
          <Text style={styles.privacy}>Only you can see what you save, until you share a collection.</Text>
        }
        ListEmptyComponent={
          <EmptyState
            art={<EmptyArt drinkId="paper-plane" mode="proof" />}
            title="Save drinks to find them here"
            body="Tap the bookmark at the top of any drink's page."
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshing={pulling || reloading}
        onRefresh={pull}
        // Each row is two covers: three rows fill the first screen.
        initialNumToRender={3}
        windowSize={5}
        style={styles.list}
        // The tab bar is docked over the foot of the list, so the last row has to clear it.
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      />
      <NewCollectionSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onMade={(made) => {
          // Its page, with Add from All saved open on it (spec §4.4); Skip there leaves it empty.
          router.push({ pathname: '/saved/[id]', params: { id: made.id, add: '1' } });
        }}
      />
    </View>
  );
}

function TileView({ tile, size, onPress }: { tile: Tile; size: number; onPress: () => void }) {
  const side = Math.floor(size);
  if (tile.kind === 'new') {
    return (
      <PressableScale
        noHaptic
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="New collection"
        style={[styles.tile, { width: size }]}>
        <View style={[styles.newCover, { width: side, height: side }]}>
          <Icon name="plus" size={32} color={colors.text} />
        </View>
        <Text numberOfLines={1} style={styles.name}>
          New collection
        </Text>
      </PressableScale>
    );
  }

  const c = tile.kind === 'collection' ? tile.collection : null;
  const name = c ? c.name : 'All saved';
  const meta = c ? `${contentsLine(c.items)}${c.shareId ? ' · Shared' : ''}` : tile.kind === 'all' ? tile.meta : '';
  const spoken = c ? `${contentsSpoken(c.items)}${c.shareId ? ', shared' : ''}` : tile.kind === 'all' ? tile.spoken : '';
  return (
    <PressableScale
      /* A media tile, as the Dex's prints: a short delay before the press state, so a flick that starts on it scrolls. */
      noHaptic
      unstable_pressDelay={120}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${spoken}`}
      style={[styles.tile, { width: size }]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Cover pieces={c ? c.items : tile.kind === 'all' ? tile.pieces : []} size={side} />
      </View>
      <Text numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <Text numberOfLines={1} style={styles.meta}>
        {meta}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  privacy: {
    ...textRole.small,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  /* The Dex's columns: 184 at x 24 and 232 at 440, rows on a 258 pitch (cover, name, line, the 24 ledge). */
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: layout.dexGap,
    paddingHorizontal: layout.gutter,
    paddingBottom: layout.dexLedge,
  },
  tile: {},
  newCover: { backgroundColor: colors.bgSunk, alignItems: 'center', justifyContent: 'center' },
  name: { ...textRole.bodyMedium, color: colors.text, marginTop: NAME_GAP },
  meta: { ...textRole.small, color: colors.textMuted },
});
