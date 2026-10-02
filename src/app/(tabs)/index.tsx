import { useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { TodaysPours } from '@/components/home/TodaysPours';
import { PostCard } from '@/components/PostCard';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { EmptyState, Hold, Notice } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { isRenderablePost } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { isLater, useSeen } from '@/store/seen';
import { useSocial } from '@/store/social';
import type { Post } from '@/types';

/* ==================================================================== */
/* Home                                                                 */
/*                                                                      */
/* The feed: a top bar (log on the left, the wordmark, Activity on the  */
/* right), the row of today's pours, then the posts of the people you   */
/* follow and your own, newest first, each running edge to edge.        */
/*                                                                      */
/* NOTHING HERE ANIMATES IN. The first three posts used to fade up in a */
/* stagger, and they were visible only once that entrance finished:     */
/* after a cold start in a Release build Reanimated can stall for       */
/* seconds, and a stalled entrance left the feed blank under the row    */
/* with no way back (specs/06-tab-switch-bug.md, cause 1). Posts are    */
/* simply there.                                                        */
/* ==================================================================== */

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
  const listRef = useRef<FlatList<Post>>(null);
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
    (id: string) => router.push({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  const openLog = useCallback(() => router.push('/log'), [router]);

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
      else router.push({ pathname: '/user/[id]', params: { id } });
    },
    [myId, router],
  );

  /* A person's pours today, in the viewer: a modal over the tabs. */
  const openPours = useCallback(
    (authorId: string) => router.push({ pathname: '/pours/[authorId]', params: { authorId } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard
        post={item}
        author={profiles[item.authorId]}
        onOpenDrink={openDrink}
        onOpenAuthor={openPerson}
        // A block takes their posts and their pours tile off screen at
        // once; RLS keeps them off from the next fetch on.
        onBlocked={dropAuthor}
      />
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

  const header = (
    <View>
      {/*
        A refresh that fails over a feed already on screen says so here,
        as the list's first item. The posts stay: they are still the last
        good copy.
      */}
      {feedError && visibleFeed.length > 0 ? (
        <Notice tone="error" style={styles.notice}>
          Could not refresh. Pull down to try again.
        </Notice>
      ) : null}
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
    </View>
  );

  return (
    <View style={styles.screen}>
      {/*
        The wordmark is the one place the brand name is set, so it is set
        as the brand sets it: Playfair, in wine. Everything else in the bar
        is plain chrome.
      */}
      <ScreenTopBar
        title="Sipply"
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
        data={visibleFeed}
        renderItem={renderItem}
        keyExtractor={(post) => post.id}
        /*
         * A post is about a screen tall — a full-width 3:4 photo plus its
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
              icon="users"
              title="Nothing poured yet"
              body="Follow friends and their pours land here. Yours will too."
              action={{ label: 'Find friends', onPress: openFindFriends }}
            />
          )
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  wordmark: { color: colors.wine },
  notice: { marginHorizontal: layout.gutter, marginTop: space.sm },
});
