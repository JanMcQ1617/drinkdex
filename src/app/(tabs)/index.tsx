import { useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { LiningBand } from '@/components/cabinet';
import { EmptyArt } from '@/components/DexCard';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { NotInDexYet, type NotInDexYetPick } from '@/components/home/NotInDexYet';
import { TodaysPours } from '@/components/home/TodaysPours';
import { PostCard } from '@/components/PostCard';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Button, EmptyState, Hold, Notice } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { notInDexYet } from '@/lib/cabinet';
import { isRenderablePost } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { isLater, useSeen } from '@/store/seen';
import { useSocial } from '@/store/social';
import type { Post } from '@/types';

/* ==================================================================== */
/* Home                                                                 */
/*                                                                      */
/* The feed: a top bar (log on the left, the wordmark, Activity on the  */
/* right), the rail of today's pours, then the posts of the people you  */
/* follow and your own, newest first, each running edge to edge.        */
/*                                                                      */
/* ONE WINE BAND, THEN PAPER. The bar and the rail are the cabinet's    */
/* lining, read as one band from the status bar down past the tiles;    */
/* the feed under it is paper, because you read on paper. Where the     */
/* band meets the first post it leaves a 1pt lip and a 12pt shade,      */
/* hung over the post (the header is lifted above the cells for it).    */
/* Pulled past the top, the overscroll is lining too, not a cream gap.  */
/* Twice down the feed (after the 5th and the 15th post) a second band  */
/* shows drinks your friends poured that are not in your Dex yet.       */
/*                                                                      */
/* NOTHING HERE ANIMATES IN. The first three posts used to fade up in a */
/* stagger, and they were visible only once that entrance finished:     */
/* after a cold start in a Release build Reanimated can stall for       */
/* seconds, and a stalled entrance left the feed blank under the row    */
/* with no way back (specs/06-tab-switch-bug.md, cause 1). Posts are    */
/* simply there.                                                        */
/* ==================================================================== */

/**
 * The most posts one feed fetch returns (lib/social's FEED_SIZE, which it
 * does not export). A feed this long may have older posts the phone was
 * never sent, so its footer says "the newest", not "every".
 */
const FEED_CAP = 100;
/** The interleaved bands follow these posts (1-based), and show only with two picks or more. */
const MODULE_AFTER: readonly number[] = [5, 15];
const MODULE_MIN = 2;

/** One row of the feed: a post, or a "Not in your Dex yet" band. */
type Row =
  | {
      kind: 'post';
      key: string;
      post: Post;
      /** A band follows: no sunk gap after this post, the band's own edge separates them. */
      beforeModule: boolean;
    }
  | { kind: 'notYet'; key: string; picks: NotInDexYetPick[] };

/**
 * The 12pt sunk gap between two posts, ruled top and bottom. Not next to
 * a band: the lining's own edge and shade do that job.
 */
function FeedGap({ leadingItem }: { leadingItem?: Row }) {
  if (!leadingItem || leadingItem.kind === 'notYet' || leadingItem.beforeModule) return null;
  return <View style={styles.gap} />;
}

export default function HomeScreen() {
  return (
    <AuthGate>
      <HomeFeed />
    </AuthGate>
  );
}

function HomeFeed() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const myId = useAuth((s) => s.session?.user.id);

  const feed = useSocial((s) => s.feed);
  const profiles = useSocial((s) => s.profiles);
  const pours = useSocial((s) => s.pours);
  const poursStatus = useSocial((s) => s.poursStatus);
  const activityLatestAt = useSocial((s) => s.activityLatestAt);
  const loadingFeed = useSocial((s) => s.loadingFeed);
  const feedError = useSocial((s) => s.feedError);
  const load = useSocial((s) => s.load);
  const refreshFeed = useSocial((s) => s.refreshFeed);
  const dropAuthor = useSocial((s) => s.dropAuthor);

  const unlocks = useCollection((s) => s.unlocks);
  const collectionReady = useCollection((s) => s.hydrated);

  const seenHydrated = useSeen((s) => s.hydrated);
  const activitySeenAt = useSeen((s) => (myId ? s.activity[myId] : undefined));

  /*
   * What the list draws. PostCard draws nothing for a drink that is not in
   * this build (the wine and beer removed on 20 Sep 2026 still have posts),
   * and as cells those posts were empty gaps; a feed made only of them never
   * reached the empty state. Filtered here, with the card's own rule, so the
   * empty state follows what is actually on screen (specs/06, cause 3).
   */
  const visibleFeed = feed.filter(isRenderablePost);

  const [refreshing, setRefreshing] = useState(false);
  const [scrolled, onScroll] = useScrolledPast();

  // Tapping Home while already on it returns the feed to the top.
  const listRef = useRef<FlatList<Row>>(null);
  useScrollToTop(listRef);

  // Re-runs when the signed-in user changes, so switching accounts doesn't
  // leave the previous person's feed on screen. `load` handles its own errors.
  useEffect(() => {
    if (myId) void load(myId);
  }, [myId, load]);

  // After a failed load this is a full reload: refreshFeed checks feedError
  // itself, so the follow list that never arrived is fetched again.
  const onRefresh = useCallback(() => {
    if (!myId) return;
    setRefreshing(true);
    void refreshFeed(myId).finally(() => setRefreshing(false));
  }, [myId, refreshFeed]);

  const openDrink = useCallback(
    (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  const openLog = useCallback(() => router.navigate('/log'), [router]);

  const openFindFriends = useCallback(() => router.push('/find-friends'), [router]);

  const openActivity = useCallback(() => router.push('/activity'), [router]);

  /*
   * Someone else is their own screen, pushed over the tabs, so Back and the
   * swipe return here and the tab bar never lights Profile for them. Your
   * own name (on your own posts, which the feed also carries) is the
   * Profile tab, where Edit profile is.
   */
  const openPerson = useCallback(
    (id: string) => {
      if (id === myId) router.navigate('/profile');
      else router.navigate({ pathname: '/user/[id]', params: { id } });
    },
    [myId, router],
  );

  /* A person's pours today, in the viewer: a modal over the tabs. */
  const openPours = useCallback(
    (authorId: string) => router.navigate({ pathname: '/pours/[authorId]', params: { authorId } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'post' ? (
        <PostCard
          post={item.post}
          author={profiles[item.post.authorId]}
          onOpenDrink={openDrink}
          onOpenAuthor={openPerson}
          // A block takes their posts and their pours tile off screen at
          // once; RLS keeps them off from the next fetch on.
          onBlocked={dropAuthor}
        />
      ) : (
        <NotInDexYet picks={item.picks} profiles={profiles} onOpenDrink={openDrink} />
      ),
    [dropAuthor, openDrink, openPerson, profiles],
  );

  if (!myId) return null;

  /*
   * The heart's dot: a like or a follow newer than the last time Activity
   * was opened. Not before the seen marks have been read, so it never
   * shows for a moment at launch and then goes out.
   */
  const unread =
    seenHydrated &&
    !!activityLatestAt &&
    (!activitySeenAt || isLater(activityLatestAt, activitySeenAt));

  /*
   * "Not answered yet" covers the first frame too. The store starts with
   * loadingFeed false and sets it only once the load effect has run, so
   * this screen's first render used to say "Nothing poured yet" for a frame
   * before the spinner. poursStatus leaves 'idle' with the first answer
   * (and returns to it on an account switch), so it marks a feed that has
   * never come back.
   */
  const waiting = loadingFeed || (poursStatus === 'idle' && !feedError);

  /*
   * The feed's rows. The "Not in your Dex yet" picks are drinks other
   * people in this feed posted that are not in your collection (no new
   * query); the second band skips the first's drinks. Not before the
   * collection has been read from disk, or the first band would offer
   * drinks you already have. Keys are by position, so a band stays the
   * same cell across refreshes.
   */
  const picks: NotInDexYetPick[][] = [];
  if (collectionReady && visibleFeed.length >= MODULE_AFTER[0]!) {
    const first = notInDexYet(visibleFeed, myId, unlocks);
    picks.push(first);
    if (visibleFeed.length >= MODULE_AFTER[1]!) {
      picks.push(notInDexYet(visibleFeed, myId, unlocks, { skip: new Set(first.map((p) => p.drink.id)) }));
    }
  }
  const rows: Row[] = [];
  visibleFeed.forEach((post, i) => {
    const slot = MODULE_AFTER.indexOf(i + 1);
    const chosen = slot >= 0 ? picks[slot] : undefined;
    const module = chosen && chosen.length >= MODULE_MIN ? chosen : null;
    rows.push({ kind: 'post', key: post.id, post, beforeModule: !!module });
    if (module) rows.push({ kind: 'notYet', key: `notYet:${slot}`, picks: module });
  });

  const header = (
    <View>
      {/*
        The overscroll above the band: a pull past the top shows lining,
        not a cream gap above a wine band. Hung above the header's top edge,
        outside the content, so it only shows when pulled.
      */}
      <View pointerEvents="none" style={styles.overscroll}>
        <Grain tone="lining" />
      </View>
      <LiningBand lip shade="overlay">
        <TodaysPours
          myId={myId}
          pours={pours}
          status={poursStatus}
          profiles={profiles}
          seenHydrated={seenHydrated}
          onLog={openLog}
          onOpen={openPours}
          onFindFriends={openFindFriends}
        />
      </LiningBand>
      {/*
        A refresh that fails over a feed already on screen says so here,
        on paper under the band. The posts stay: they are still the last
        good copy.
      */}
      {feedError && visibleFeed.length > 0 ? (
        <Notice tone="error" style={styles.notice}>
          Could not refresh. Pull down to try again.
        </Notice>
      ) : null}
    </View>
  );

  /*
   * The foot of a feed with posts: where it ends, in Sipply's words, and
   * the one thing to do there.
   */
  const footer =
    visibleFeed.length > 0 ? (
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {feed.length >= FEED_CAP ? `That's the newest ${FEED_CAP} pours.` : "That's every pour so far."}
        </Text>
        <Button label="Log a pour" variant="secondary" size="sm" onPress={openLog} />
      </View>
    ) : null;

  return (
    <View style={styles.screen}>
      {/* The paper's grain, under the list: posts are transparent and sit on it. */}
      <Grain />
      {/*
        The wordmark is the one place the brand name is set, so it is set
        as the brand sets it: Playfair, here in bone on the lining. The
        bar's own buttons take the lining's ink from the bar.
      */}
      <ScreenTopBar
        title="Sipply"
        tone="lining"
        showRule={scrolled}
        titleNode={
          <Text
            style={[textRole.wordmark, styles.wordmark]}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.2}>
            Sipply
          </Text>
        }
        left={<TopBarButton icon="plus" label="Log a pour" onPress={openLog} />}
        right={<TopBarButton icon="heart" label="Activity" badge={unread} onPress={openActivity} />}
      />
      <FlatList
        ref={listRef}
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        ItemSeparatorComponent={FeedGap}
        /*
         * A post is about a screen tall — a full-width 4:5 photo plus its
         * author row, actions and caption — so the default window (10 items
         * up front, 21 screens kept mounted) held twenty-odd full-size photos
         * in memory to show one.
         */
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.list}
        contentContainerStyle={{
          // The tab bar floats over the feed, so the last post has to clear it.
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        }}
        ListHeaderComponent={header}
        // Lifted over the first post, so the band's shade lies across it.
        ListHeaderComponentStyle={styles.header}
        ListFooterComponent={footer}
        /*
         * Three states, never confused. A failed load used to fall through to
         * "Nothing poured yet", which told someone offline with twenty follows
         * to go and find people. While a pull is already spinning, the body
         * stays empty rather than showing a second spinner.
         */
        ListEmptyComponent={
          waiting ? (
            refreshing ? null : (
              <Hold fill={false} slowMessage="Still loading your feed." />
            )
          ) : feedError ? (
            <EmptyState
              icon="alert"
              title="Could not load your feed"
              body="Check your connection and try again."
              actionVariant="secondary"
              action={{ label: 'Try again', onPress: () => void load(myId) }}
            />
          ) : (
            <EmptyState
              art={<EmptyArt drinkId="negroni" />}
              title="Nothing poured yet"
              body="Follow friends and their pours land here. Yours will too."
              action={{ label: 'Find friends', onPress: openFindFriends }}
            />
          )
        }
        refreshControl={
          /*
           * Bone, so the spinner reads on the lining it is pulled over. And
           * lifted: UIKit keeps a scroll view's refresh control behind its
           * content, where the overscroll lining (part of the content) would
           * cover it. RN maps this zIndex onto the control's layer zPosition.
           */
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.onLining}
            style={styles.refresh}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** How far above the band the overscroll lining reaches: past any pull. */
const OVERSCROLL = 1000;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  header: { zIndex: 1 },
  refresh: { zIndex: 2 },
  overscroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -OVERSCROLL,
    height: OVERSCROLL,
    backgroundColor: colors.lining,
  },
  wordmark: { color: colors.onLining },
  // 12pt down, so the band's shade falls on paper rather than across the notice.
  notice: { marginHorizontal: layout.gutter, marginTop: space.md },
  gap: {
    height: 12,
    backgroundColor: colors.bgSunk,
    borderTopWidth: stroke.edge,
    borderBottomWidth: stroke.edge,
    borderColor: colors.line,
  },
  footer: {
    paddingTop: space.xxl,
    paddingHorizontal: layout.gutter,
    alignItems: 'center',
    gap: space.md,
  },
  footerText: { ...textRole.prose, color: colors.textMuted, textAlign: 'center' },
});
