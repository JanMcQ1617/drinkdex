import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { type GridRow, GridRowView, gridRows, useDrinkColumn } from '@/components/collections/CollectionGrid';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { announce, Avatar, Button, EmptyState, haptic, Hold } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import {
  collectionsSupported,
  copyShared,
  failureReason,
  fetchOwner,
  fetchPostTiles,
  fetchShared,
  isUuid,
  removeItems,
  type SharedCollection,
} from '@/lib/collections';
import { useAuth } from '@/store/auth';
import { useCollections } from '@/store/collections';
import { useSocial } from '@/store/social';
import { useTaste, WANT_TO_TRY_MAX } from '@/store/taste';
import type { Drink, Post, UserProfile } from '@/types';
import { showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Someone's shared collection (spec §4.8; frame `shared`)              */
/*                                                                      */
/* Where drinkdex://collection/<share id> lands (+native-intent), and   */
/* the web page's Open in Sipply. One read, get_shared_collection,      */
/* which answers signed out too.                                        */
/*                                                                      */
/* READ-ONLY, as a collection's own page is drawn (no •••, no boxes),   */
/* with the owner under the title: their face and username (it opens    */
/* their profile) and what is in it. The drinks are drawn against YOUR  */
/* Dex: colour where you have caught one. The posts are the ones you    */
/* may see; signed out the line says to sign in for them.               */
/*                                                                      */
/* SAVE COLLECTION makes your private copy (copy_shared_collection),    */
/* then saves each thing into your All saved by the usual paths, the    */
/* drinks through the taste store and the posts through the social      */
/* store's save, so "in a collection ⇒ saved" holds. Drinks past All    */
/* saved's 200 are taken back out of the copy, and a notice says how    */
/* many; so is anything else that did not reach All saved (a post whose */
/* save failed, a drink this build does not know). Signed out, it opens */
/* the sign-in first.                                                   */
/*                                                                      */
/* ONE EMPTY STATE for a link that is off, unknown, deleted, or whose   */
/* owner is blocked with you either way: a block never says it is one.  */
/* Before 023: "Shared collections aren't open yet." Your own link      */
/* opens your collection instead.                                       */
/* ==================================================================== */

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; shared: SharedCollection; posts: Post[]; owner: UserProfile | null }
  | { status: 'gone' }
  | { status: 'notyet' }
  | { status: 'failed' };

export default function SharedCollectionScreen() {
  const params = useLocalSearchParams<{ share: string }>();
  const share = String(params.share ?? '').toLowerCase();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id ?? null);
  // Save collection signed out: the sign-in, over this page, until a session arrives or it is closed.
  const [asking, setAsking] = useState(false);

  /* Back is the stack's; opened cold from a link, the Dex, which works signed in or out. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  const body = (
    <SharedBody key={`${myId ?? ''}:${share}`} myId={myId} share={share} onBack={leave} onSignIn={() => setAsking(true)} />
  );
  /*
   * Kept round the page once asked, so a brand-new account still meets
   * the gate's username and welcome steps before it comes back here.
   */
  if (asking) return <AuthGate onClose={() => setAsking(false)}>{body}</AuthGate>;
  return body;
}

function SharedBody({
  myId,
  share,
  onBack,
  onSignIn,
}: {
  myId: string | null;
  share: string;
  onBack: () => void;
  onSignIn: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const column = useDrinkColumn();
  const [scrolled, onScroll] = useScrolledPast();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [copyId, setCopyId] = useState<string | null>(null);

  /*
   * Two answers need no request: a malformed id is a link that is not
   * shared (any more), and a runtime that has already met a missing 023
   * knows the answer to that too.
   */
  const valid = isUuid(share);
  const supported = collectionsSupported();
  useEffect(() => {
    if (!valid || !supported) return;
    let alive = true;
    (async () => {
      try {
        const shared = await fetchShared(share);
        if (!alive) return;
        if (!shared) {
          setLoaded({ status: 'gone' });
          return;
        }
        // Your own link: your collection, where ••• is.
        if (shared.mine && shared.collectionId) {
          router.replace({ pathname: '/saved/[id]', params: { id: shared.collectionId } });
          return;
        }
        // Signed in only: signed out there are no post ids, and profiles are not readable.
        const postIds = shared.items.flatMap((i) => (i.kind === 'post' && i.postId ? [i.postId] : []));
        const [posts, owner] = myId
          ? await Promise.all([fetchPostTiles(postIds).catch(() => [] as Post[]), fetchOwner(shared.owner)])
          : [[] as Post[], null];
        if (alive) setLoaded({ status: 'ready', shared, posts, owner });
      } catch (e) {
        if (alive) setLoaded({ status: failureReason(e) === 'unsupported' ? 'notyet' : 'failed' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [share, myId, attempt, router, valid, supported]);
  const state: Loaded = !valid ? { status: 'gone' } : !supported ? { status: 'notyet' } : loaded;

  const bar = (
    <ScreenTopBar
      title={state.status === 'ready' ? state.shared.name : 'Shared collection'}
      titleVisible={false}
      showRule={scrolled}
      left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
    />
  );

  if (state.status !== 'ready') {
    return (
      <View style={styles.screen}>
        {bar}
        {state.status === 'loading' ? (
          <Hold slowMessage="Still opening the collection." />
        ) : state.status === 'failed' ? (
          <EmptyState
            icon="alert"
            title="Couldn't reach Sipply"
            body="Check your connection and try again."
            actionVariant="secondary"
            action={{
              label: 'Try again',
              onPress: () => {
                setLoaded({ status: 'loading' });
                setAttempt((a) => a + 1);
              },
            }}
          />
        ) : (
          <EmptyState
            icon="bookmark"
            title={state.status === 'notyet' ? "Shared collections aren't open yet." : "This collection isn't shared any more."}
            body={
              state.status === 'notyet'
                ? 'They open with an update to Sipply. Try the link again soon.'
                : 'Whoever shared it stopped sharing, or it was deleted.'
            }
            actionVariant="secondary"
            action={{ label: 'Back', onPress: onBack }}
          />
        )}
      </View>
    );
  }

  const { shared, posts, owner } = state;
  const drinks = [
    ...new Map(
      shared.items.flatMap((i): [string, Drink][] => {
        const d = i.kind === 'drink' ? getDrink(i.drinkId) : undefined;
        return d ? [[d.id, d]] : [];
      }),
    ).values(),
  ];
  const postCount = myId ? posts.length : shared.items.filter((i) => i.kind === 'post').length;
  const rows: GridRow[] = gridRows(drinks, myId ? posts : []);
  const counts = [
    drinks.length > 0 ? `${drinks.length} ${drinks.length === 1 ? 'drink' : 'drinks'}` : null,
    postCount > 0
      ? `${postCount} ${postCount === 1 ? 'post' : 'posts'}${myId ? '' : ', sign in to see them'}`
      : null,
  ].filter(Boolean);

  const openDrink = (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } });
  const openOwner = () => {
    if (!owner) return;
    if (owner.id === myId) router.navigate('/profile');
    else router.navigate({ pathname: '/user/[id]', params: { id: owner.id } });
  };

  const save = async () => {
    if (!myId) {
      onSignIn();
      return;
    }
    setSaving(true);
    try {
      const made = await copyShared(share);
      /*
       * Into All saved, oldest first, so the newest lands first as it is in
       * the collection. A drink saved already stays where it is; one past
       * the 200 is refused by the store and taken back out of the copy.
       */
      const left: string[] = [];
      for (const d of [...drinks].reverse()) {
        const taste = useTaste.getState();
        if (taste.saved.includes(d.id)) continue;
        if (!taste.toggleSaved(d.id)) left.push(d.id);
      }
      const savedPosts = new Set<string>();
      for (const p of [...posts].reverse()) {
        if (await useSocial.getState().toggleSave(myId, p.id, false)) savedPosts.add(p.id);
      }
      /*
       * The copy holds every drink on the link and every post you may see,
       * so whatever did not reach All saved comes back out of it, or the
       * copy would hold things that are not saved: the drinks past the
       * cap, posts whose save failed or whose tiles did not load, and
       * what this build cannot draw (lib/collections `undrawable`).
       */
      const unsavedPosts = [
        ...new Set(shared.items.flatMap((i) => (i.kind === 'post' && i.postId && !savedPosts.has(i.postId) ? [i.postId] : []))),
      ];
      const out = [
        ...left.map((id) => ({ kind: 'drink' as const, id })),
        ...unsavedPosts.map((id) => ({ kind: 'post' as const, id })),
        ...shared.undrawable,
      ];
      if (out.length > 0) await removeItems(made, out).catch(() => undefined);
      await useCollections.getState().refresh(true);
      setCopyId(made);
      haptic.success();
      if (left.length > 0) {
        showNotice(
          'Saved',
          `${left.length} ${left.length === 1 ? "drink didn't" : "drinks didn't"} fit in All saved (${WANT_TO_TRY_MAX} is the most), so ${left.length === 1 ? 'it was' : 'they were'} left out.`,
        );
      } else {
        announce('Saved to your collections');
      }
    } catch (e) {
      const reason = failureReason(e);
      if (reason === 'collections_full') showNotice('Could not save it', 'You have 50 collections. Delete one to save this one.');
      else if (reason === 'not_found') setLoaded({ status: 'gone' });
      else if (reason === 'unsupported') setLoaded({ status: 'notyet' });
      else showNotice('Could not save it', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const head = (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={styles.title}>
        {shared.name}
      </Text>
      <View style={styles.byline}>
        <Pressable
          onPress={openOwner}
          disabled={!owner}
          accessibilityRole={owner ? 'button' : 'text'}
          accessibilityLabel={owner ? `${shared.owner}. Opens their profile` : shared.owner}
          hitSlop={{ top: 10, bottom: 10 }}
          style={({ pressed }) => [styles.owner, pressed && styles.pressed]}>
          <Avatar
            name={owner?.displayName ?? shared.owner}
            accent={owner?.accent ?? ''}
            avatarPath={owner?.avatarPath}
            size={24}
          />
          <Text style={styles.ownerName}>{shared.owner}</Text>
        </Pressable>
        {counts.length > 0 ? <Text style={styles.meta}>{` · ${counts.join(' · ')}`}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      {bar}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => <GridRowView row={item} column={column} onOpenDrink={openDrink} />}
        ListHeaderComponent={head}
        ListEmptyComponent={<Text style={styles.empty}>Nothing in it yet.</Text>}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={4}
        windowSize={5}
        contentContainerStyle={{ paddingBottom: FOOT + insets.bottom + space.lg }}
        showsVerticalScrollIndicator={false}
      />
      <View style={[styles.foot, { paddingBottom: insets.bottom + space.md }]}>
        {copyId ? (
          <Button
            label="Saved to your collections"
            variant="secondary"
            onPress={() => router.navigate({ pathname: '/saved/[id]', params: { id: copyId } })}
            accessibilityHint="Opens your copy"
            block
          />
        ) : (
          <Button label="Save collection" onPress={() => void save()} loading={saving} block />
        )}
      </View>
    </View>
  );
}

/** The foot slab's key and its padding, which the list keeps clear of. */
const FOOT = layout.control + space.md;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: layout.gutter, paddingTop: space.sm },
  title: { ...textRole.title, color: colors.text },
  byline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: space.sm },
  owner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ownerName: { ...textRole.small, fontFamily: textRole.bodyStrong.fontFamily, color: colors.text },
  meta: { ...textRole.small, color: colors.textMuted },
  pressed: { opacity: 0.6 },
  empty: { ...textRole.body, color: colors.textMuted, paddingHorizontal: layout.gutter, paddingTop: space.xl },
  /* One key over a page slab with a 1pt line rule (frame `shared`). */
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
});
