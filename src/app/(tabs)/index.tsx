import { useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { PostCard } from '@/components/PostCard';
import { Avatar, EmptyState, PressableScale } from '@/components/ui';
import { colors, fonts, motion, radius, space, type as typeScale } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/* ------------------------------------------------------------------ */
/* Friends row                                                         */
/* ------------------------------------------------------------------ */

function PersonBubble({
  name,
  accent,
  avatarPath,
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  badge,
}: {
  name: string;
  accent: string;
  avatarPath?: string | null;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  badge?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={styles.bubble}>
      <View>
        <Avatar name={name} accent={accent} size={66} ring avatarPath={avatarPath} />
        {badge ? (
          <View style={styles.bubbleBadge}>
            <Icon name="plus" size={13} color={colors.textOnWine} />
          </View>
        ) : null}
      </View>
      <Text style={styles.bubbleLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

function FriendsRow({
  me,
  followed,
  onOpenPerson,
  onLog,
}: {
  me: { name: string; accent: string; avatarPath?: string | null };
  followed: UserProfile[];
  onOpenPerson: (id: string) => void;
  onLog: () => void;
}) {
  /*
   * scrollsToTop off: UIKit honours a status-bar tap only when exactly one
   * scroll view on screen opts in, and every ScrollView opts in by default.
   * With this row in too, the tap reached neither, and the feed never went
   * back to the top.
   */
  return (
    <ScrollView
      horizontal
      scrollsToTop={false}
      showsHorizontalScrollIndicator={false}
      style={styles.bubbleRow}
      contentContainerStyle={styles.bubbleRowContent}>
      {/*
        Your own bubble is the log action, and says so in the same words as
        the tab bar's centre plus — it used to read "Your pour" and open the
        Dex grid, so one glyph did two different things on one screen.
      */}
      <PersonBubble
        name={me.name}
        accent={me.accent}
        avatarPath={me.avatarPath}
        label="Log a pour"
        badge
        onPress={onLog}
        accessibilityLabel="Log a pour"
        accessibilityHint="Take a photo and pick what you drank"
      />
      {followed.map((p) => (
        <PersonBubble
          key={p.id}
          name={p.displayName}
          accent={p.accent}
          avatarPath={p.avatarPath}
          label={p.username}
          onPress={() => onOpenPerson(p.id)}
          accessibilityLabel={`Open ${p.displayName}'s profile`}
        />
      ))}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

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
  const reduced = useReducedMotion();

  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);

  const feed = useSocial((s) => s.feed);
  const profiles = useSocial((s) => s.profiles);
  const following = useSocial((s) => s.following);
  const loadingFeed = useSocial((s) => s.loadingFeed);
  const feedError = useSocial((s) => s.feedError);
  const load = useSocial((s) => s.load);
  const refreshFeed = useSocial((s) => s.refreshFeed);
  const dropAuthor = useSocial((s) => s.dropAuthor);

  const [refreshing, setRefreshing] = useState(false);

  // Tapping Home while already on it returns the feed to the top.
  const listRef = useRef<FlatList<Post>>(null);
  useScrollToTop(listRef);

  /*
   * Whether the reader has started scrolling. The entrance stagger is for
   * the feed arriving, not for a card the list re-mounts on the way back
   * up, so once the list has been dragged no card animates in again.
   */
  const [scrolled, setScrolled] = useState(false);
  const markScrolled = useCallback(() => setScrolled(true), []);

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

  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => (
      <Animated.View
        entering={
          reduced || scrolled || index > 2
            ? undefined
            : // The first screenful only: past it the delay just feels like lag.
              FadeInDown.duration(motion.base).delay(index * motion.stagger)
        }>
        <PostCard
          post={item}
          author={profiles[item.authorId]}
          onOpenDrink={openDrink}
          onOpenAuthor={openPerson}
          // A block takes their posts and bubble off screen at once; RLS
          // keeps them off from the next fetch on.
          onBlocked={dropAuthor}
        />
      </Animated.View>
    ),
    [dropAuthor, openDrink, openPerson, profiles, reduced, scrolled],
  );

  // Follow order, minus anyone whose profile hasn't been fetched yet.
  const followed = following.flatMap((id) => profiles[id] ?? []);

  const header = (
    <View>
      <View style={styles.masthead}>
        <Text style={styles.wordmark} accessibilityRole="header">
          Sipply
        </Text>
        {/*
          A refresh that fails over a feed already on screen says so here,
          in the subtitle's place, rather than adding a line that would push
          the posts down. The posts stay: they are still the last good copy.
        */}
        <Text style={styles.subtitle}>
          {feedError && feed.length > 0
            ? 'Could not refresh. Pull down to try again.'
            : 'Pours from the accounts you follow.'}
        </Text>
      </View>
      <FriendsRow
        me={{
          name: profile?.display_name ?? 'You',
          accent: profile?.accent ?? colors.wine,
          avatarPath: profile?.avatar_path,
        }}
        followed={followed}
        onOpenPerson={openPerson}
        onLog={openLog}
      />
    </View>
  );

  return (
    <FlatList
      ref={listRef}
      data={feed}
      renderItem={renderItem}
      keyExtractor={(post) => post.id}
      /*
       * A post is about a screen tall — a 1:1.3 photo plus its header and
       * caption — so the default window (10 items up front, 21 screens kept
       * mounted) held twenty-odd full-size photos in memory to show one.
       */
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={5}
      onScrollBeginDrag={scrolled ? undefined : markScrolled}
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + space.md,
          // The tab bar floats over the feed now, so the last post has to
          // clear it rather than stop where the old opaque bar began.
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        },
      ]}
      ListHeaderComponent={header}
      /*
       * Three states, never confused. A failed load used to fall through to
       * "Nothing poured yet — follow a few collectors", which told someone
       * offline with twenty follows to go and find people. While a pull is
       * already spinning, the body stays empty rather than showing a second
       * spinner.
       */
      ListEmptyComponent={
        loadingFeed ? (
          refreshing ? null : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.wine} />
            </View>
          )
        ) : feedError ? (
          <EmptyState
            icon="close"
            title="Could not load your feed"
            body="Check your connection and try again. The people you follow are still there."
            action={{ label: 'Try again', onPress: () => myId && void load(myId) }}
          />
        ) : (
          <EmptyState
            icon="users"
            title="Nothing poured yet"
            body="Follow friends and their pours land here. Yours will too, once you log one."
            action={{ label: 'Find friends', onPress: openFindFriends }}
          />
        )
      }
      refreshing={refreshing}
      onRefresh={onRefresh}
      showsVerticalScrollIndicator={false}
    />
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl, gap: space.lg },
  loading: { paddingVertical: space.xxxl, alignItems: 'center' },

  /* Masthead */
  /*
   * The handoff's feed header: the wordmark centred over the page in
   * Playfair 700, in wine, at 26. It is the only place in the app the
   * brand name is set, so it is set as the brand sets it.
   */
  masthead: { paddingHorizontal: space.xl, alignItems: 'center' },
  wordmark: {
    fontFamily: fonts.displayBold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.wine,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
    textAlign: 'center',
  },

  /* Friends */
  bubbleRow: { marginTop: space.lg },
  bubbleRowContent: {
    paddingHorizontal: space.xl,
    gap: space.lg,
    paddingBottom: space.xs,
  },
  bubble: { width: 70, alignItems: 'center', gap: space.sm },
  bubbleBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    color: colors.textMuted,
    maxWidth: 70,
    textAlign: 'center',
  },
});
