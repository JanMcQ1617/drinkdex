import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
  label,
  onPress,
  accessibilityLabel,
  badge,
}: {
  name: string;
  accent: string;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.bubble}>
      <View>
        <Avatar name={name} accent={accent} size={66} ring />
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
  me: { name: string; accent: string };
  followed: UserProfile[];
  onOpenPerson: (id: string) => void;
  onLog: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bubbleRow}
      contentContainerStyle={styles.bubbleRowContent}>
      <PersonBubble
        name={me.name}
        accent={me.accent}
        label="Your pour"
        badge
        onPress={onLog}
        accessibilityLabel="Log a new entry in the Dex"
      />
      {followed.map((p) => (
        <PersonBubble
          key={p.id}
          name={p.displayName}
          accent={p.accent}
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
  const load = useSocial((s) => s.load);
  const refreshFeed = useSocial((s) => s.refreshFeed);

  const [refreshing, setRefreshing] = useState(false);

  // Re-runs when the signed-in user changes, so switching accounts doesn't
  // leave the previous person's feed on screen. `load` handles its own errors.
  useEffect(() => {
    if (myId) void load(myId);
  }, [myId, load]);

  const onRefresh = useCallback(() => {
    if (!myId) return;
    setRefreshing(true);
    void refreshFeed(myId).finally(() => setRefreshing(false));
  }, [myId, refreshFeed]);

  const openDrink = useCallback(
    (id: string) => router.push({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  const openDex = useCallback(() => router.push('/dex'), [router]);

  const openProfile = useCallback(() => router.push('/profile'), [router]);

  const openPerson = useCallback(
    (id: string) => router.push({ pathname: '/profile', params: { user: id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => (
      <Animated.View
        entering={
          reduced
            ? undefined
            : // Capped: past the first screenful the delay only feels like lag.
              FadeInDown.duration(motion.base).delay(Math.min(index, 4) * motion.stagger)
        }>
        <PostCard
          post={item}
          author={profiles[item.authorId]}
          onOpenDrink={openDrink}
          onOpenAuthor={openPerson}
        />
      </Animated.View>
    ),
    [openDrink, openPerson, profiles, reduced],
  );

  // Follow order, minus anyone whose profile hasn't been fetched yet.
  const followed = following.flatMap((id) => profiles[id] ?? []);

  const header = (
    <View>
      <View style={styles.masthead}>
        <Text style={styles.wordmark}>Sipply</Text>
        <Text style={styles.subtitle}>Pours from the accounts you follow.</Text>
      </View>
      <FriendsRow
        me={{ name: profile?.display_name ?? 'You', accent: profile?.accent ?? colors.wine }}
        followed={followed}
        onOpenPerson={openPerson}
        onLog={openDex}
      />
    </View>
  );

  return (
    <FlatList
      data={feed}
      renderItem={renderItem}
      keyExtractor={(post) => post.id}
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
      ListEmptyComponent={
        loadingFeed ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.wine} />
          </View>
        ) : (
          <EmptyState
            icon="users"
            title="Nothing poured yet"
            body="Follow a few collectors from the Accounts list on your profile — their pours land here. Yours will too, once you log an entry."
            action={{ label: 'Find people', onPress: openProfile }}
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
