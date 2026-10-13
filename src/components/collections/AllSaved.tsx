import { useIsFocused, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DexCard, EmptyArt } from '@/components/DexCard';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { chunk, PostGridRow } from '@/components/profile/PostGrid';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { EmptyState, Hold, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { fetchSavedPosts, isRenderablePost, primeSignedUrls } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import { useTaste } from '@/store/taste';
import type { Drink, Post } from '@/types';

/* ==================================================================== */
/* All saved                                                            */
/*                                                                      */
/* What the Saved tab showed until v4.2, moved here unchanged (spec     */
/* §4.5) so it can be drawn two ways:                                   */
/*                                                                      */
/*   AllSavedTab   the Saved tab itself, exactly as build 23, whenever  */
/*                 collections are off: signed out, or before 023. So  */
/*                 nothing is one tap further away for them.            */
/*   AllSavedPage  app/saved/all.tsx, pushed from the All saved tile    */
/*                 once collections are on: the same page under a back */
/*                 chevron, its name as the page's title.               */
/*                                                                      */
/* Build 23's notes, kept:                                              */
/*                                                                      */
/*   DRINKS  first: every drink saved with the bookmark on its page, or */
/*           with "Save to try" on the first picks, newest first, two   */
/*           to a row as the Dex draws them. Caught is the colour print */
/*           with its name in ink, not yet the grey proof. A tap opens  */
/*           the drink. Any drink, caught or not: these are bookmarks,  */
/*           and catching one leaves it here (store/taste).             */
/*   POSTS   then the posts you bookmarked, three to a row as the       */
/*           profile's grid, the drinks not in your Dex yet first.      */
/*           Split on the phone, from each post's drink against your    */
/*           own collection: no new fetch, and nothing about your       */
/*           collection leaves the phone. Only while the server has the */
/*           saves table (017): without it there are none to show.      */
/*                                                                      */
/* SAVED DRINKS ARE THE PHONE'S FIRST, so they show signed out, before  */
/* any account exists. Saved posts need the account.                    */
/*                                                                      */
/* Private: drinks and posts are each readable by their owner only      */
/* (migrations 022 and 017), and the first line says so, because a      */
/* bookmark that might be public is one nobody uses.                    */
/*                                                                      */
/* The posts refetch when the page comes back to the front after a save */
/* or unsave made elsewhere (the social store counts them in            */
/* savesVersion), so a post unsaved from its own screen is gone when    */
/* you return, and nothing is fetched while the page is not in front.   */
/* The drinks are the store's, so they are always current.              */
/* ==================================================================== */

const NO_POSTS: Post[] = [];
const COLUMNS = 2;

type Row =
  | {
      key: string;
      kind: 'head';
      title: string;
      count: number;
      noun: 'post' | 'drink';
      /** The first head on the page, or the one straight after the drink grid (whose rows carry their own foot). */
      place: 'first' | 'afterGrid' | 'after';
    }
  | { key: string; kind: 'drinks'; drinks: Drink[]; first: boolean }
  | { key: string; kind: 'posts'; posts: Post[] };

/** Own keys only: the stores are plain objects, and 'constructor' is not a drink. */
const has = (map: Record<string, unknown>, id: string) => Object.prototype.hasOwnProperty.call(map, id);

/** The drinks' head and their rows of two. Nothing when none are saved. */
function drinkRows(drinks: Drink[]): Row[] {
  if (drinks.length === 0) return [];
  return [
    { key: 'drinks:head', kind: 'head', title: 'Drinks', count: drinks.length, noun: 'drink', place: 'first' },
    ...chunk(drinks, COLUMNS).map(
      (r, i): Row => ({ key: `drinks:${r[0]!.id}`, kind: 'drinks', drinks: r, first: i === 0 }),
    ),
  ];
}

/** One posts section: its head, then its posts three to a row. Nothing for an empty section. */
function postRows(key: string, title: string, posts: Post[], place: 'first' | 'afterGrid' | 'after'): Row[] {
  if (posts.length === 0) return [];
  return [
    { key: `${key}:head`, kind: 'head', title, count: posts.length, noun: 'post', place },
    ...chunk(posts, 3).map((r): Row => ({ key: `${key}:${r[0]!.id}`, kind: 'posts', posts: r })),
  ];
}

/**
 * The saved posts for an account, refetched as the header note says. Null
 * (signed out) is no posts and nothing to fetch. Also read by the Saved
 * tab's tiles, for All saved's count and cover.
 */
export function useSavedPosts(myId: string | null) {
  const focused = useIsFocused();
  const savesVersion = useSocial((s) => s.savesVersion);

  /*
   * Keyed by account, saves version and explicit retries. The version only
   * moves the key while the page is focused: out of focus it keeps the key
   * it last fetched, and the change is picked up the moment it is in
   * front again.
   *
   * A retry is stamped with the key it was asked on, as usePostsByAuthor
   * does, so a refetch the version caused never shows the pull spinner
   * just because a pull happened earlier.
   */
  const [seenVersion, setSeenVersion] = useState(savesVersion);
  if (focused && seenVersion !== savesVersion) setSeenVersion(savesVersion);
  const base = `${myId ?? ''}#${seenVersion}`;
  const [asked, setAsked] = useState({ base: '', n: 0 });
  const request = `${base}#${asked.n}`;

  const [loaded, setLoaded] = useState<{
    myId: string;
    request: string;
    posts: Post[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!myId) return;
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

  const reload = () => setAsked({ base, n: asked.n + 1 });
  if (!myId) return { status: 'ready' as const, posts: NO_POSTS, reloading: false, reload };

  const mine = loaded?.myId === myId ? loaded : null;
  const current = mine?.request === request;
  const status: 'loading' | 'ready' | 'error' =
    !mine || (mine.failed && !current) ? 'loading' : mine.failed ? 'error' : 'ready';
  return {
    status,
    posts: (mine?.posts ?? NO_POSTS).filter(isRenderablePost),
    reloading: asked.n > 0 && asked.base === base && !current && !!mine,
    reload,
  };
}

/**
 * One saved drink as the Dex's card, holding its own subscription so
 * catching one drink re-renders that card, not the grid (the Dex's
 * GridCell does the same).
 */
export const SavedCell = React.memo(function SavedCell({
  drink,
  cardWidth,
  onPress,
}: {
  drink: Drink;
  cardWidth: number;
  onPress: (id: string) => void;
}) {
  // The whole record, not just the boolean: the card shows your own pour once you have one.
  const record = useCollection((s) => (has(s.unlocks, drink.id) ? s.unlocks[drink.id] : undefined));
  return (
    <DexCard
      drink={drink}
      cardWidth={cardWidth}
      collected={Boolean(record)}
      userPhotoUri={record?.photoUri}
      onPress={onPress}
    />
  );
});

/** The Saved tab while collections are off: build 23's page, exactly. */
export function AllSavedTab({ myId }: { myId: string | null }) {
  /*
   * The list is the Saved tab's scroll source for ScrollChrome, with the
   * bar's rule signal riding along as its listener. Tapping Saved again
   * while here returns it to the top.
   */
  const [scrolled, onScrolledPast] = useScrolledPast();
  const { onScroll } = useTabScroll('saved', onScrolledPast);
  const listRef = useRef<Animated.FlatList<Row>>(null);
  useScrollToTop(listRef);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      {/* A tab root: the title set left, and no icon (v4: at most one, and this page needs none). */}
      <ScreenTopBar size="lg" title="Saved" showRule={scrolled} />
      <AllSavedList
        myId={myId}
        listRef={listRef}
        onScroll={onScroll}
        // The tab bar is docked over the foot of the list, so the last row has to clear it.
        paddingBottom={insets.bottom + TAB_BAR_CLEARANCE}
      />
    </View>
  );
}

/** All saved, pushed from its tile (app/saved/all.tsx). */
export function AllSavedPage({ myId, onBack }: { myId: string | null; onBack: () => void }) {
  const [scrolled, onScroll] = useScrolledPast();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      {/* A pushed page: the chevron alone in the bar, its name the page's own title (layout spec rule 8). */}
      <ScreenTopBar
        title="All saved"
        titleVisible={false}
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
      />
      <AllSavedList
        myId={myId}
        onScroll={onScroll}
        title="All saved"
        paddingBottom={insets.bottom + space.xl}
      />
    </View>
  );
}

function AllSavedList({
  myId,
  listRef,
  onScroll,
  title,
  paddingBottom,
}: {
  myId: string | null;
  listRef?: React.RefObject<Animated.FlatList<Row> | null>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** The page's own title, drawn over the list on the pushed page. */
  title?: string;
  paddingBottom: number;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const authReady = useAuth((s) => s.ready);

  const { status, posts, reloading, reload } = useSavedPosts(myId);

  /*
   * Drawn once both stores have been read from disk: before the Dex has,
   * every drink would show as its grey proof and every post as not in
   * your Dex; before the list has, the page would read as empty
   * (normally both are read before the splash lifts).
   */
  const unlocks = useCollection((s) => s.unlocks);
  const collectionReady = useCollection((s) => s.hydrated);
  const tasteReady = useTaste((s) => s.hydrated);
  const savedIds = useTaste((s) => s.saved);
  const ready = collectionReady && tasteReady;

  /* Catalogue drinks only (the store checks too), newest first as the store keeps them. */
  const drinks = ready
    ? savedIds.flatMap((id) => {
        const drink = getDrink(id);
        return drink ? [drink] : [];
      })
    : [];
  const inDex = (p: Post) => has(unlocks, p.drinkId);
  const hunting = posts.filter((p) => !inDex(p));
  const caught = posts.filter(inDex);

  const rows: Row[] = ready
    ? [
        ...drinkRows(drinks),
        ...postRows('hunting', 'Posts not in your Dex yet', hunting, drinks.length > 0 ? 'afterGrid' : 'first'),
        ...postRows(
          'caught',
          'Posts already in your Dex',
          caught,
          hunting.length > 0 ? 'after' : drinks.length > 0 ? 'afterGrid' : 'first',
        ),
      ]
    : [];

  /* The Dex's two columns: 184pt prints at 440, 160 at 393. Unrounded, as DexCard asks. */
  const column = (width - 2 * layout.gutter - layout.dexGap * (COLUMNS - 1)) / COLUMNS;
  // `navigate`, as the Dex: a double tap opens the drink once.
  const openDrink = useCallback(
    (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  const renderRow = ({ item }: { item: Row }) =>
    item.kind === 'drinks' ? (
      <View style={[styles.drinkRow, item.first && styles.drinkRowFirst]}>
        {item.drinks.map((drink) => (
          <SavedCell key={drink.id} drink={drink} cardWidth={column} onPress={openDrink} />
        ))}
      </View>
    ) : item.kind === 'posts' ? (
      <PostGridRow posts={item.posts} />
    ) : (
      <View
        style={[
          styles.head,
          item.place === 'first' && styles.headFirst,
          item.place === 'afterGrid' && styles.headAfterGrid,
        ]}>
        <SectionHeader title={item.title} style={styles.headTitle} />
        <Text
          style={styles.headCount}
          accessibilityLabel={`${formatCount(item.count)} ${item.count === 1 ? item.noun : `${item.noun}s`}`}>
          {formatCount(item.count)}
        </Text>
      </View>
    );

  const loadFailed = (
    <EmptyState
      icon="alert"
      title="Could not load saved posts"
      body="Check your connection and try again."
      action={{ label: 'Try again', onPress: reload }}
      actionVariant="secondary"
    />
  );

  /*
   * With drinks on screen, the posts' part says only what is worth saying
   * under them: that it is still loading, or that it could not load.
   * Signed out there is nothing to load, so nothing.
   */
  const footer =
    drinks.length === 0 || posts.length > 0 ? null : status === 'loading' ? (
      <Hold fill={false} slowMessage="Still loading your saved posts." />
    ) : status === 'error' ? (
      loadFailed
    ) : null;

  const empty =
    !ready || status === 'loading' ? (
      <Hold fill={false} slowMessage={ready ? 'Still loading your saved posts.' : 'Still loading what you saved.'} />
    ) : status === 'error' ? (
      loadFailed
    ) : (
      /*
       * Nothing saved at all, drinks or posts. A drink not caught yet, as
       * its grey proof, and the one place a drink is saved from: calm, and
       * no button, since the Dex is the next tab along.
       */
      <EmptyState
        art={<EmptyArt drinkId="paper-plane" mode="proof" />}
        title="Save drinks to find them here"
        body="Tap the bookmark at the top of any drink's page."
      />
    );

  /*
   * Signed out (once sign-in has started up), the drinks are on this phone
   * alone, and the line says that instead: making an account takes them
   * with it.
   */
  const privacy = !myId && authReady ? 'Kept on this phone until you sign in.' : 'Only you can see what you save.';

  return (
    <Animated.FlatList<Row>
      ref={listRef}
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      ListHeaderComponent={
        <>
          {title ? (
            <Text accessibilityRole="header" style={styles.pageTitle}>
              {title}
            </Text>
          ) : null}
          <Text style={styles.privacy}>{privacy}</Text>
          {status === 'error' && posts.length > 0 ? (
            <Notice tone="error" style={styles.notice}>
              Could not refresh. Pull down to try again.
            </Notice>
          ) : null}
        </>
      }
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onScroll={onScroll}
      scrollEventThrottle={16}
      // Signed out there is nothing to pull for: the drinks are already the phone's.
      refreshing={reloading}
      onRefresh={myId ? reload : undefined}
      /*
       * A row of drinks is two big prints, nearly half a screen, so four
       * rows fill the first screen; five screens stay mounted, each
       * holding decoded prints. No removeClippedSubviews, which can
       * blank a whole list on iOS (specs/06).
       */
      initialNumToRender={4}
      windowSize={5}
      style={styles.list}
      contentContainerStyle={{ paddingBottom }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  /*
   * A section head, then its prints: 32 above every head (layout.section),
   * counted from the foot of the drink grid's last row, which already
   * carries 24 of it; 16 above the first.
   */
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingTop: layout.section,
    paddingBottom: space.xs,
  },
  headFirst: { paddingTop: space.lg },
  headAfterGrid: { paddingTop: layout.section - layout.dexLedge },
  headTitle: { flex: 1 },
  headCount: { ...textRole.small, ...tabular, color: colors.textMuted },
  /* The pushed page's own title, where a collection's name sits on its page (spec §4.6). */
  pageTitle: { ...textRole.title, color: colors.text, paddingHorizontal: layout.gutter, paddingTop: space.sm },
  privacy: {
    ...textRole.small,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  notice: { marginHorizontal: layout.gutter, marginBottom: space.sm },
  /* The Dex's grid row: two cards stretched to the taller, so a long name grows its row, never overlaps the next. */
  drinkRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: layout.dexGap,
    paddingHorizontal: layout.gutter,
    paddingBottom: layout.dexLedge,
  },
  /* 4 under the head and 8 here: the same 12 the posts' first row stands under it. */
  drinkRowFirst: { paddingTop: layout.gridGap },
});
