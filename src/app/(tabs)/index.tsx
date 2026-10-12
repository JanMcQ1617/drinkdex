import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, type FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { EmptyArt } from '@/components/DexCard';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { groupPours, storyMap } from '@/components/home/groupPours';
import { HOME_BAR_HEIGHT, HomeChrome } from '@/components/home/HomeChrome';
import { NotInDexYet, type NotInDexYetPick } from '@/components/home/NotInDexYet';
import { TodaysPours, useExpiryClock } from '@/components/home/TodaysPours';
import { PostCard } from '@/components/PostCard';
import { useTabScroll } from '@/components/ScrollChrome';
import { Button, EmptyState, Hold, Notice } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { notInDexYet } from '@/lib/cabinet';
import { isRenderablePost } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { isLater, useSeen } from '@/store/seen';
import { useSocial } from '@/store/social';
import { useTournaments } from '@/store/tournaments';
import type { Post } from '@/types';

/* ==================================================================== */
/* Home                                                                 */
/*                                                                      */
/* Laid out like Instagram's feed (v4.1; Jan: "you changed the home     */
/* section can you make it look the same as instagram"; specs/v4-       */
/* mockups/home-ig). The 44pt bar (the wordmark; create and the         */
/* Activity heart), the stories tray, then the posts of the people you  */
/* follow and your own, newest first, each with Instagram's anatomy     */
/* (PostCard): header, a full-bleed square photo, heart · share · save, */
/* liked by, the caption and the time. At rest on a 440 x 956 phone:    */
/* the bar, the tray with its sixth ring cut by the edge, post 1 whole  */
/* and post 2's header above the tab bar.                               */
/*                                                                      */
/* ALL PAGE, SEPARATED BY SPACE. No band, no shelf, no sunk gaps, no    */
/* rules: the bar, the stories and the posts stand on the one white     */
/* page, and a post ends in 14 points of air. Twice down the feed       */
/* (after the 5th and the 15th post) a row shows drinks your friends    */
/* posted that are not in your Dex yet.                                 */
/*                                                                      */
/* THE BAR FLOATS. The list runs from the top of the screen and its     */
/* header holds the bar's place; the bar itself is laid over the list   */
/* (HomeChrome), so it can slide away on scroll down and come back on   */
/* scroll up, moved by the list's own native scroll events              */
/* (ScrollChrome), never by a timer.                                    */
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
/** The "Not in your Dex yet" rows follow these posts (1-based), and show only with two picks or more. */
const MODULE_AFTER: readonly number[] = [5, 15];
const MODULE_MIN = 2;

/** One row of the feed: a post, or a "Not in your Dex yet" row. Each carries its own space below. */
type Row = { kind: 'post'; key: string; post: Post } | { kind: 'notYet'; key: string; picks: NotInDexYetPick[] };

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
  const seenPours = useSeen((s) => (myId ? s.pours[myId] : undefined));

  /*
   * Who has a story today, for the rings on the post headers: read off
   * the same groups the tray draws, against the same clock, so a header
   * and its circle never disagree and both expire at the same moment.
   * Others count once the row has its answer, as in the tray; nobody is
   * ringed until the seen marks have been read.
   */
  const now = useExpiryClock(pours);
  const groups = groupPours(pours, myId ?? '', seenPours, now);
  const story = storyMap(
    { mine: groups.mine, others: poursStatus === 'ready' ? groups.others : [] },
    seenHydrated,
  );

  /*
   * What the list draws. PostCard draws nothing for a drink that is not in
   * this build (the wine and beer removed on 20 Sep 2026 still have posts),
   * and as cells those posts were empty gaps; a feed made only of them never
   * reached the empty state. Filtered here, with the card's own rule, so the
   * empty state follows what is actually on screen (specs/06, cause 3).
   */
  const visibleFeed = feed.filter(isRenderablePost);

  const [refreshing, setRefreshing] = useState(false);
  /*
   * Home's list drives this screen's own bar (it hides on scroll down and
   * draws its rule once the feed runs under it). One native event, made
   * once (ScrollChrome).
   */
  const { onScroll, scrollY } = useTabScroll('index');

  // Tapping Home while already on it returns the feed to the top.
  const listRef = useRef<FlatList<Row>>(null);
  useScrollToTop(listRef);

  /*
   * Tournament invitations, asked for each time Home is focused. The
   * trophy left Home's bar (Profile's ••• carries Tournaments and the
   * pending count now), but Home is the screen that opens with the app,
   * so this keeps the store warm for that sheet and for Activity; the
   * tournament screens refetch after their own actions. A server without
   * migration 020 answers by switching tournaments off.
   */
  useFocusEffect(
    useCallback(() => {
      if (myId) void useTournaments.getState().load();
    }, [myId]),
  );

  // Re-runs when the signed-in user changes, so switching accounts doesn't
  // leave the previous person's feed on screen. `load` handles its own errors.
  useEffect(() => {
    if (myId) void load(myId);
  }, [myId, load]);

  // After a failed load this is a full reload: refreshFeed checks feedError
  // itself, so the follow list that never arrived is fetched again. The
  // invitations are asked for again too; the spinner waits only for the feed.
  const onRefresh = useCallback(() => {
    if (!myId) return;
    setRefreshing(true);
    void useTournaments.getState().load();
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

  /* A person's posts from today, in the story viewer: a modal over the tabs. */
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
          // A block takes their posts and their story off screen at
          // once; RLS keeps them off from the next fetch on.
          onBlocked={dropAuthor}
          story={story[item.post.authorId]}
          onOpenStory={openPours}
        />
      ) : (
        <NotInDexYet picks={item.picks} profiles={profiles} onOpenDrink={openDrink} />
      ),
    [dropAuthor, openDrink, openPerson, openPours, profiles, story],
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
   * this screen's first render used to say "Nothing posted yet" for a frame
   * before the spinner. poursStatus leaves 'idle' with the first answer
   * (and returns to it on an account switch), so it marks a feed that has
   * never come back.
   */
  const waiting = loadingFeed || (poursStatus === 'idle' && !feedError);

  /*
   * The feed's rows. The "Not in your Dex yet" picks are drinks other
   * people in this feed posted that are not in your collection (no new
   * query); the second row skips the first's drinks. Not before the
   * collection has been read from disk, or the first row would offer
   * drinks you already have. Keys are by position, so a row stays the
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
    rows.push({ kind: 'post', key: post.id, post });
    if (module) rows.push({ kind: 'notYet', key: `notYet:${slot}`, picks: module });
  });

  const header = (
    <View style={styles.header}>
      {/* The bar's place: HomeChrome draws the bar over it. */}
      <View style={{ height: insets.top + HOME_BAR_HEIGHT }} />
      <TodaysPours
        myId={myId}
        pours={pours}
        now={now}
        status={poursStatus}
        profiles={profiles}
        seenHydrated={seenHydrated}
        onPost={openLog}
        onOpen={openPours}
        onFindFriends={openFindFriends}
      />
      {/*
        A refresh that fails over a feed already on screen says so here,
        under the stories. The posts stay: they are still the last good copy.
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
          {feed.length >= FEED_CAP ? `That's the newest ${FEED_CAP} posts.` : "That's every post so far."}
        </Text>
        <Button label="Post a drink" variant="secondary" size="sm" onPress={openLog} />
      </View>
    ) : null;

  return (
    <View style={styles.screen}>
      <Animated.FlatList
        ref={listRef}
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        /*
         * A post is most of a screen tall (616 to 634: the header, a
         * square photo the screen's width, the actions, liked by, the
         * caption and the time), so the default window (10 items up front,
         * 21 screens kept mounted) held twenty-odd full-size photos in
         * memory to show one.
         */
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.list}
        contentContainerStyle={{
          // The tab bar is docked over the foot of the feed, so the last post has to clear it.
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        /*
         * Three states, never confused. A failed load used to fall through to
         * "Nothing posted yet", which told someone offline with twenty follows
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
              title="Nothing posted yet"
              body="Follow friends to see what others are drinking. Your posts land here too."
              action={{ label: 'Find friends', onPress: openFindFriends }}
            />
          )
        }
        refreshControl={
          /*
           * Ink on the page. Offset below the bar: the list starts at the
           * top of the screen, so without it the spinner would turn under
           * the status strip and the bar laid over it.
           */
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
            progressViewOffset={insets.top + HOME_BAR_HEIGHT}
          />
        }
        showsVerticalScrollIndicator={false}
      />
      {/* Over the list, last, so it draws on top and takes its own taps. */}
      <HomeChrome scrollY={scrollY} unread={unread} onActivity={openActivity} onPost={openLog} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  // Nothing under the tray: it ends in its own 8pt foot, and the first post's header follows it (home-ig 5.2).
  header: { paddingBottom: 0 },
  // A failed refresh's line, between the tray's foot and the first header, on Home's column.
  notice: { marginHorizontal: layout.feedGutter, marginTop: space.sm, marginBottom: space.sm },
  // The last post ends in its own space; the foot adds a little more before its words.
  footer: {
    paddingTop: space.sm,
    paddingHorizontal: layout.gutter,
    alignItems: 'center',
    gap: space.md,
  },
  footerText: { ...textRole.small, color: colors.textMuted, textAlign: 'center' },
});
