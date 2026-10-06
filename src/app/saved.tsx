import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { EmptyArt } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { chunk, PostGridRow } from '@/components/profile/PostGrid';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { EmptyState, Hold, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { fetchSavedPosts, isRenderablePost, primeSignedUrls, savesSupported } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Post } from '@/types';

/* ==================================================================== */
/* Saved                                                                */
/*                                                                      */
/* The posts you bookmarked, most recently saved first, as the profile's */
/* grid. Private: the saves table is readable by its owner only, and the */
/* first line says so, because a bookmark that might be public is one    */
/* nobody uses.                                                          */
/*                                                                      */
/* It refetches when you come back to it after a save or unsave made     */
/* elsewhere (the social store counts them in savesVersion), so a post   */
/* unsaved from its own screen is gone when you return, and nothing is   */
/* fetched while the screen sits under another.                          */
/*                                                                      */
/* A HUNTING LIST. A bookmark in a drinks app is nearly always "I want   */
/* to try this", so the saves are split in two: the drinks not in your  */
/* Dex yet first, then the ones already in it. Worked out on the phone,  */
/* from each post's drink against your own collection: no new fetch, and */
/* nothing about your collection leaves the phone.                       */
/* ==================================================================== */

const NO_POSTS: Post[] = [];

type Row =
  | { key: string; kind: 'head'; title: string; count: number; first: boolean }
  | { key: string; kind: 'posts'; posts: Post[] };

/** One section's rows: its header, then its posts three to a row. Nothing for an empty section. */
function sectionRows(key: string, title: string, posts: Post[], first: boolean): Row[] {
  if (posts.length === 0) return [];
  return [
    { key: `${key}:head`, kind: 'head', title, count: posts.length, first },
    ...chunk(posts, 3).map((r): Row => ({ key: `${key}:${r[0]!.id}`, kind: 'posts', posts: r })),
  ];
}

export default function SavedScreen() {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  // Opened cold there is nothing under it; the Dex works signed out.
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <Saved myId={myId} onBack={leave} />;
}

function Saved({ myId, onBack }: { myId: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [scrolled, onScroll] = useScrolledPast();
  const savesVersion = useSocial((s) => s.savesVersion);

  /*
   * Keyed by account, saves version and explicit retries. The version only
   * moves the key while the screen is focused: under another screen it
   * keeps the key it last fetched, and the change is picked up the moment
   * it is in front again.
   *
   * A retry is stamped with the key it was asked on, as usePostsByAuthor
   * does, so a refetch the version caused never shows the pull spinner
   * just because a pull happened earlier.
   */
  const [seenVersion, setSeenVersion] = useState(savesVersion);
  if (focused && seenVersion !== savesVersion) setSeenVersion(savesVersion);
  const base = `${myId}#${seenVersion}`;
  const [asked, setAsked] = useState({ base: '', n: 0 });
  const request = `${base}#${asked.n}`;

  const [loaded, setLoaded] = useState<{
    myId: string;
    request: string;
    posts: Post[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSavedPosts(myId)
      .then((posts) => {
        if (!alive) return;
        // One signing request for the grid rather than one per tile; see usePostsByAuthor.
        void primeSignedUrls(
          'pours',
          posts.flatMap((p) => (p.photoPath ? [p.photoPath] : [])),
        );
        setLoaded({ myId, request, posts, failed: false });
      })
      .catch(() => {
        if (!alive) return;
        setLoaded((prev) => ({
          myId,
          request,
          posts: prev?.myId === myId ? prev.posts : NO_POSTS,
          failed: true,
        }));
      });
    return () => {
      alive = false;
    };
  }, [myId, request]);

  const mine = loaded?.myId === myId ? loaded : null;
  const current = mine?.request === request;
  const status: 'loading' | 'ready' | 'error' =
    !mine || (mine.failed && !current) ? 'loading' : mine.failed ? 'error' : 'ready';
  const posts = (mine?.posts ?? NO_POSTS).filter(isRenderablePost);
  const reloading = asked.n > 0 && asked.base === base && !current && !!mine;
  const reload = () => setAsked({ base, n: asked.n + 1 });

  /*
   * Split against your collection once it has been read from disk. Before
   * that every drink would read as not in your Dex, so the list waits on
   * it (normally it is read before the splash lifts).
   */
  const unlocks = useCollection((s) => s.unlocks);
  const collectionReady = useCollection((s) => s.hydrated);
  const inDex = (p: Post) => Object.prototype.hasOwnProperty.call(unlocks, p.drinkId);
  const hunting = posts.filter((p) => !inDex(p));
  const caught = posts.filter(inDex);
  const waiting = status === 'loading' || (posts.length > 0 && !collectionReady);
  const rows: Row[] = collectionReady
    ? [
        ...sectionRows('hunting', 'Not in your Dex yet', hunting, true),
        ...sectionRows('caught', 'Already in your Dex', caught, hunting.length === 0),
      ]
    : [];

  const renderRow = ({ item }: { item: Row }) =>
    item.kind === 'posts' ? (
      <PostGridRow posts={item.posts} />
    ) : (
      <View style={[styles.head, item.first && styles.headFirst]}>
        <SectionHeader title={item.title} style={styles.headTitle} />
        <Text
          style={styles.headCount}
          accessibilityLabel={`${formatCount(item.count)} ${item.count === 1 ? 'post' : 'posts'}`}>
          {formatCount(item.count)}
        </Text>
      </View>
    );

  const empty =
    waiting ? (
      <Hold fill={false} slowMessage="Still loading your saved posts." />
    ) : status === 'error' ? (
      <EmptyState
        icon="alert"
        title="Could not load saved posts"
        body="Check your connection and try again."
        action={{ label: 'Try again', onPress: reload }}
        actionVariant="secondary"
      />
    ) : !savesSupported() ? (
      /*
       * The server has no saves table yet (migration 017 not applied):
       * not "nothing saved", which would be a confident wrong answer.
       */
      <EmptyState
        icon="bookmark"
        title="Saving isn't available right now"
        body="Try again after the next update."
      />
    ) : (
      /*
       * A drink still to catch, as a recess in the cabinet: what this list
       * is for, drawn rather than told with a bookmark glyph.
       */
      <EmptyState
        art={<EmptyArt drinkId="paper-plane" mode="ghost" />}
        title="Nothing saved yet"
        body="Save a pour to hunt it down later."
      />
    );

  return (
    <View style={styles.screen}>
      <Grain />
      <ScreenTopBar
        title="Saved"
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        showRule={scrolled}
      />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            <Text style={styles.privacy}>Only you can see what you save.</Text>
            {status === 'error' && posts.length > 0 ? (
              <Notice tone="error" style={styles.notice}>
                Could not refresh. Pull down to try again.
              </Notice>
            ) : null}
          </>
        }
        ListEmptyComponent={empty}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshing={reloading}
        onRefresh={reload}
        initialNumToRender={6}
        windowSize={7}
        // Transparent, so the page's grain shows between the tiles.
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  headFirst: { paddingTop: space.sm },
  headTitle: { flex: 1 },
  headCount: { ...textRole.helper, ...tabular, color: colors.textMuted },
  privacy: {
    ...textRole.helper,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  notice: { marginHorizontal: layout.gutter, marginBottom: space.sm },
});
