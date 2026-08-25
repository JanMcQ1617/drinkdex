import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { deriveStats } from '@/components/CollectionStats';
import { DrinkArt } from '@/components/artwork';
import { FindFriends } from '@/components/FindFriends';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon, type IconName } from '@/components/icons';
import { PostCard, timeAgo, useSignedPhoto } from '@/components/PostCard';
import {
  Avatar,
  Button,
  Card,
  Divider,
  PressableScale,
  EmptyState,
  haptic,
  ProgressBar,
  RarityBadge,
  SectionLabel,
} from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  fonts,
  radius,
  RARITY_META,
  motion,
  RARITY_ORDER,
  space,
  type as typeScale,
} from '@/constants/theme';
import { DRINKS_BY_ID } from '@/data';
import { fetchPostsByAuthor, fetchProfiles, toProfile } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { DrinkCategory, Post, Rarity, UserProfile } from '@/types';
import { confirmDestructive } from '@/utils/alerts';

/* ------------------------------------------------------------------ */
/* Derivations                                                         */
/* ------------------------------------------------------------------ */

/**
 * Stats for a peer, derived from their PUBLIC POSTS only.
 *
 * A peer's real collection lives on their device and never reaches the
 * server, so this is the honest substitute: the category and rarity spread
 * of the pours they've actually shared. `counted` skips posts whose drink
 * isn't in this build, so the bars sum to the drinks we can classify.
 */
function derivePostStats(posts: Post[]) {
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, beer: 0, wine: 0, spirit: 0 };
  const byRarity: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };

  let counted = 0;
  for (const post of posts) {
    const drink = DRINKS_BY_ID[post.drinkId];
    if (!drink) continue;
    counted += 1;
    byCategory[drink.category] += 1;
    byRarity[drink.rarity] += 1;
  }

  return { counted, byCategory, byRarity };
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/**
 * One person's posts, held locally.
 *
 * Not in the social store: that store owns the feed, and a profile is a
 * different slice of the same table that shouldn't evict it.
 */
const NO_POSTS: Post[] = [];

function usePostsByAuthor(
  authorId: string | undefined,
  myId: string | undefined,
  /** Change this to refetch without blanking what's already on screen. */
  reloadKey = '',
): Post[] {
  // Tagged with whose posts these are, so switching author reads as empty
  // without a synchronous reset that would cascade renders.
  const who = `${authorId ?? ''}|${myId ?? ''}`;
  const [loaded, setLoaded] = useState<{ who: string; posts: Post[] } | null>(null);

  useEffect(() => {
    if (!authorId || !myId) return;
    let alive = true;
    fetchPostsByAuthor(authorId, myId)
      .then((rows) => {
        if (alive) setLoaded({ who, posts: rows });
      })
      .catch(() => {
        // The grid stays empty rather than taking the screen down with it.
        if (alive) setLoaded({ who, posts: NO_POSTS });
      });
    return () => {
      alive = false;
    };
  }, [authorId, myId, who, reloadKey]);

  return loaded?.who === who ? loaded.posts : NO_POSTS;
}

function Identity({
  profile,
  trailing,
}: {
  profile: UserProfile;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.identity}>
      <Avatar name={profile.displayName} accent={profile.accent} size={84} ring />
      <View style={styles.identityText}>
        <Text style={styles.identityName} numberOfLines={1}>
          {profile.displayName}
        </Text>
        <Text style={styles.identityHandle} numberOfLines={1}>
          @{profile.username}
        </Text>
        {profile.bio ? <Text style={styles.identityBio}>{profile.bio}</Text> : null}
        {trailing}
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** One of your logged pours, as a square grid tile. */
function PostTile({
  post,
  size,
  onPress,
}: {
  post: Post;
  size: number;
  onPress: (drinkId: string) => void;
}) {
  const photoUrl = useSignedPhoto(post.photoPath);
  const drink = DRINKS_BY_ID[post.drinkId];
  if (!drink) return null;

  return (
    <PressableScale
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, logged ${timeAgo(post.createdAt)} ago`}
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: CATEGORY_META[drink.category].wash },
      ]}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.tileImage}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <DrinkArt drink={drink} size={size * 0.6} flat />
      )}
    </PressableScale>
  );
}

function FollowRow({
  person,
  following,
  onToggle,
}: {
  person: UserProfile;
  following: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.followRow}>
      <Avatar name={person.displayName} accent={person.accent} size={44} />
      <View style={styles.followText}>
        <Text style={styles.followName} numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text style={styles.followHandle} numberOfLines={1}>
          @{person.username}
        </Text>
      </View>
      <Button
        label={following ? 'Following' : 'Follow'}
        variant={following ? 'secondary' : 'primary'}
        icon={following ? 'check' : undefined}
        onPress={() => {
          onToggle();
          haptic.select();
        }}
        accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${person.displayName}`}
        style={styles.followButton}
      />
    </View>
  );
}

/**
 * Top-level screen navigation. Your profile uses all three; a peer's uses
 * only 'posts' and 'stats' — you can't manage someone else's follows.
 */
// 'stats' is peer-only now — your own stats moved to the Stats tab.
type Segment = 'posts' | 'stats' | 'friends';

interface SegmentItem {
  key: Segment;
  icon: IconName;
  label: string;
  /** Spoken by the tab; whose profile this is changes the wording. */
  a11yLabel: string;
  /** Only icons with a solid variant should fill when active. */
  fillActive?: boolean;
}

/** The screen's tab strip. Same pill visual whether it holds two items or three. */
/**
 * Segmented control with a thumb that SLIDES between options.
 *
 * The white pill used to be a background swapped onto whichever segment was
 * active — two things blinking rather than one thing moving. A travelling
 * thumb is what makes a segmented control feel like a physical switch, and it
 * matches the tab pill in the Hornofino app so both houses move alike.
 *
 * No press-scale here on purpose: the segments are wide, and the thumb
 * arriving is already the feedback. Scaling them too would be noise.
 */
function SegmentBar({
  items,
  value,
  onChange,
  style,
}: {
  items: SegmentItem[];
  value: Segment;
  onChange: (key: Segment) => void;
  style?: ViewStyle;
}) {
  const reduced = useReducedMotion();
  const [barW, setBarW] = React.useState(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));

  const PAD = space.xs;
  const GAP = space.xs;
  const segW = barW > 0 ? (barW - PAD * 2 - GAP * (items.length - 1)) / items.length : 0;

  const x = useDerivedValue(() => {
    const target = index * (segW + GAP);
    return reduced ? withTiming(target, { duration: motion.fast }) : withSpring(target, motion.spring);
  });
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[styles.segments, style]}
      onLayout={(e) => setBarW(Math.round(e.nativeEvent.layout.width))}>
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.segmentThumb, { width: segW, left: PAD }, thumbStyle]}
        />
      ) : null}
      {items.map((item) => {
        const active = value === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              onChange(item.key);
              haptic.select();
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.a11yLabel}
            style={styles.segment}>
            <Icon
              name={item.icon}
              size={17}
              color={active ? colors.wine : colors.textFaint}
              filled={active && !!item.fillActive}
            />
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Your profile                                                        */
/* ------------------------------------------------------------------ */

const OWN_SEGMENTS: SegmentItem[] = [
  { key: 'posts', icon: 'grid', label: 'Posts', a11yLabel: 'Your posts', fillActive: true },
  { key: 'friends', icon: 'users', label: 'Accounts', a11yLabel: 'Accounts' },
];

function OwnProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);
  const profileLoading = useAuth((s) => s.profileLoading);
  const profileError = useAuth((s) => s.profileError);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const signOut = useAuth((s) => s.signOut);
  const deleteAccount = useAuth((s) => s.deleteAccount);

  const unlocks = useCollection((s) => s.unlocks);
  const resetAll = useCollection((s) => s.resetAll);

  const people = useSocial((s) => s.people);
  const following = useSocial((s) => s.following);
  const loadingPeople = useSocial((s) => s.loadingPeople);
  const loadPeople = useSocial((s) => s.loadPeople);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const resetSocial = useSocial((s) => s.reset);

  const [segment, setSegment] = useState<Segment>('posts');

  /*
   * The feed is the app's live view of the posts table — logging a drink
   * pushes one into it. This grid is fetched separately, so treat a change
   * in feed size as the signal that it has fallen a post behind.
   */
  const feedSize = useSocial((s) => s.feed.length);
  const myPosts = usePostsByAuthor(myId, myId, String(feedSize));

  // The accounts list is a second query; don't pay for it until it's asked for.
  useEffect(() => {
    if (segment === 'friends' && myId) void loadPeople(myId);
  }, [segment, myId, loadPeople]);

  const { unlockedCount } = useMemo(() => deriveStats(unlocks), [unlocks]);

  const me = profile ? toProfile(profile) : null;
  const tile = (width - space.xl * 2 - space.xs * 2) / 3;

  const openDrink = useCallback(
    (id: string) => router.push({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  const openDex = useCallback(() => router.push('/dex'), [router]);

  const confirmReset = useCallback(() => {
    // Only the local collection: posts already shared stay on the server.
    confirmDestructive(
      'Reset collection?',
      'This relocks every entry and deletes the photos saved on this device.',
      'Reset',
      resetAll,
    );
  }, [resetAll]);

  const handleSignOut = useCallback(() => {
    void signOut().finally(resetSocial);
  }, [resetSocial, signOut]);

  /*
   * Deleting the account is the one action here that reaches the server and
   * cannot be undone, so the copy enumerates what goes rather than saying
   * "this cannot be undone" and leaving the user to guess the blast radius.
   *
   * Local state is cleared only on success. Clearing first would strand
   * someone whose delete failed with an emptied device and a live account.
   */
  const confirmDeleteAccount = useCallback(() => {
    confirmDestructive(
      'Delete your account?',
      'This permanently deletes your profile, every post and photo you have shared, and who you follow. It cannot be undone, and your username becomes available to someone else.',
      'Delete account',
      () => {
        void deleteAccount().then((ok) => {
          if (ok) {
            resetSocial();
            resetAll();
          }
        });
      },
    );
  }, [deleteAccount, resetAll, resetSocial]);

  /*
   * Everything destructive now lives behind one control instead of sitting in
   * the footer where a scroll could reach them. Ordered least to most severe,
   * so the tap that ends your account is never the one nearest your thumb.
   *
   * Account deletion stays reachable in two taps — Apple requires it to be
   * findable in-app, and a buried one is its own rejection.
   */
  const openSettings = useCallback(() => {
    haptic.tap();
    if (Platform.OS === 'web') {
      confirmReset();
      return;
    }
    Alert.alert('Settings', undefined, [
      { text: 'Reset collection', style: 'destructive', onPress: confirmReset },
      { text: 'Sign out', style: 'destructive', onPress: handleSignOut },
      { text: 'Delete account', style: 'destructive', onPress: confirmDeleteAccount },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [confirmDeleteAccount, confirmReset, handleSignOut]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <PressableScale
          onPress={openSettings}
          noHaptic
          hitSlop={space.md}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={styles.settingsButton}>
          <Icon name="settings" size={20} color={colors.textMuted} />
        </PressableScale>
      </View>

      {/*
        * A signed-in user with no profile row used to render nothing at all,
        * which looked exactly like a screen that had failed to load. Each of
        * the three states now says which one it is.
        */}
      {me ? (
        <Identity profile={me} />
      ) : profileLoading ? (
        <View style={styles.identityFallback}>
          <ActivityIndicator color={colors.wine} />
        </View>
      ) : (
        <View style={styles.identityFallback}>
          <Text style={styles.mutedLine}>
            {profileError ?? 'Your profile card could not be loaded.'}
          </Text>
          <PressableScale
            onPress={() => {
              haptic.tap();
              void refreshProfile();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading your profile"
            style={styles.identityRetry}>
            <Text style={styles.identityRetryLabel}>Retry</Text>
          </PressableScale>
        </View>
      )}

      <View style={styles.statRow}>
        <Stat value={unlockedCount} label="Entries" />
        <Stat value={myPosts.length} label="Posts" />
        <Stat value={following.length} label="Following" />
      </View>

      {/* ---- Segments ---- */}
      <SegmentBar items={OWN_SEGMENTS} value={segment} onChange={setSegment} />

      {segment === 'posts' &&
        (myPosts.length > 0 ? (
          <View style={styles.grid}>
            {myPosts.map((post) => (
              <PostTile key={post.id} post={post} size={tile} onPress={openDrink} />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="camera"
            title="No posts yet"
            body="Every entry you log in the Dex becomes a post here."
            action={{ label: 'Open the Dex', onPress: openDex }}
          />
        ))}

      {segment === 'friends' && (
        <>
          {/* Invite, username search, and contact matching. */}
          <FindFriends />

          {/* Browse everyone else on Sipply. */}
          <SectionLabel style={styles.sectionLabel}>Everyone on Sipply</SectionLabel>
          {loadingPeople && people.length === 0 ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.wine} />
            </View>
          ) : people.length > 0 ? (
            <Card style={styles.blockTight}>
              {people.map((p) => (
                <FollowRow
                  key={p.id}
                  person={p}
                  following={following.includes(p.id)}
                  onToggle={() => {
                    if (myId) void toggleFollow(myId, p.id);
                  }}
                />
              ))}
            </Card>
          ) : (
            <Text style={styles.mutedLine}>
              You’re early — invite a friend above and they’ll show up here.
            </Text>
          )}
        </>
      )}

      {/* Footer actions moved into the settings menu in the top bar. */}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Someone else's profile                                              */
/* ------------------------------------------------------------------ */

// No 'friends' tab: you can only manage your own follows, not a peer's.
const PEER_SEGMENTS: SegmentItem[] = [
  { key: 'posts', icon: 'grid', label: 'Posts', a11yLabel: 'Their posts', fillActive: true },
  { key: 'stats', icon: 'trophy', label: 'Stats', a11yLabel: 'Their stats', fillActive: true },
];

function PeerProfile({ id, onBack }: { id: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const myId = useAuth((s) => s.session?.user.id);
  const cached = useSocial((s) => s.profiles[id]);
  const following = useSocial((s) => s.following.includes(id));
  const toggleFollow = useSocial((s) => s.toggleFollow);

  const [segment, setSegment] = useState<Segment>('posts');
  const posts = usePostsByAuthor(id, myId);

  // Their real collection never leaves their device, so break down public posts.
  const { counted, byCategory, byRarity } = useMemo(() => derivePostStats(posts), [posts]);

  /*
   * The lookup is normally already warm — you get here from the feed or the
   * accounts list. A cold deep link into this route is the exception, so
   * fetch the one row rather than show a nameless card.
   */
  const [fetched, setFetched] = useState<UserProfile | null>(null);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetchProfiles([id])
      .then((map) => {
        if (alive) setFetched(map[id] ?? null);
      })
      .catch(() => {
        if (alive) setFetched(null);
      });
    return () => {
      alive = false;
    };
  }, [cached, id]);

  const person = cached ?? fetched;

  const openDrink = useCallback(
    (drinkId: string) => router.push({ pathname: '/drink/[id]', params: { id: drinkId } }),
    [router],
  );

  if (!person) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          icon="users"
          title="Profile unavailable"
          body="This account could not be loaded."
          action={{ label: 'Back', onPress: onBack }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.peerContent,
        {
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.peerHeader}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to your profile"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.peerIdentity}>
        <Identity
          profile={person}
          trailing={
            <Button
              label={following ? 'Following' : 'Follow'}
              variant={following ? 'secondary' : 'primary'}
              icon={following ? 'check' : undefined}
              onPress={() => {
                if (myId) void toggleFollow(myId, id);
                haptic.select();
              }}
              accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${person.displayName}`}
              style={styles.peerFollowButton}
            />
          }
        />
      </View>

      <View style={styles.peerBody}>
        <SegmentBar
          items={PEER_SEGMENTS}
          value={segment}
          onChange={setSegment}
          style={styles.peerSegmentBar}
        />
      </View>

      {segment === 'posts' ? (
        posts.length > 0 ? (
          posts.map((post) => (
            <PostCard key={post.id} post={post} author={person} onOpenDrink={openDrink} />
          ))
        ) : (
          <EmptyState
            icon="grid"
            title="No posts"
            body={`${person.displayName} hasn't shared an entry yet.`}
          />
        )
      ) : posts.length > 0 ? (
        <View style={styles.peerBody}>
          {/* ---- Shared ---- */}
          <SectionLabel style={styles.sectionLabel}>Shared</SectionLabel>
          <Card style={styles.block}>
            <Text style={styles.rank}>
              {posts.length} {posts.length === 1 ? 'pour' : 'pours'} shared
            </Text>
            {/* Honest framing: this is their public feed, not their real Dex. */}
            <Text style={styles.peerNote}>{"Based on what they've shared"}</Text>

            <Divider style={styles.blockDivider} />

            {CATEGORY_ORDER.map((category) => {
              const meta = CATEGORY_META[category];
              const count = byCategory[category];
              return (
                <View
                  key={category}
                  style={styles.categoryRow}
                  accessibilityLabel={`${meta.plural}: ${count} shared`}>
                  <View style={styles.categoryHead}>
                    <View style={[styles.categoryDot, { backgroundColor: meta.color }]} />
                    <Text style={styles.categoryName}>{meta.plural}</Text>
                    <Text style={styles.categoryCount}>{count}</Text>
                  </View>
                  {/* Bars read as share-of-pours, so the max is their post total. */}
                  <ProgressBar value={count} max={counted} color={meta.color} height={5} />
                </View>
              );
            })}
          </Card>

          {/* ---- Rarity ---- */}
          <SectionLabel style={styles.sectionLabel}>Rarity</SectionLabel>
          <Card style={styles.blockTight}>
            {RARITY_ORDER.map((rarity) => (
              <View
                key={rarity}
                style={styles.rarityRow}
                accessibilityLabel={`${RARITY_META[rarity].label}: ${byRarity[rarity]} shared`}>
                <RarityBadge rarity={rarity} />
                <Text style={styles.rarityCount}>{byRarity[rarity]}</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : (
        <EmptyState
          icon="trophy"
          title="No stats yet"
          body={`${person.displayName} hasn't shared an entry yet.`}
        />
      )}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function ProfileScreen() {
  const { user } = useLocalSearchParams<{ user?: string }>();
  const navigation = useNavigation<{ setParams: (params: { user?: string }) => void }>();
  const myId = useAuth((s) => s.session?.user.id);

  const clearPeer = useCallback(() => navigation.setParams({ user: undefined }), [navigation]);

  /*
   * The feed opens a peer by pushing this tab with a `user` param. A tab press
   * merges params rather than clearing them, so dropping it on blur is what
   * keeps the Profile tab landing on your own card next time.
   */
  useFocusEffect(useCallback(() => clearPeer, [clearPeer]));

  const peerId = user && user !== myId ? user : null;

  return (
    <AuthGate>
      {peerId ? <PeerProfile id={peerId} onBack={clearPeer} /> : <OwnProfile />}
    </AuthGate>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: 'center' },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  peerContent: { paddingBottom: space.xxxl },
  pressed: { opacity: 0.72 },
  loading: { paddingVertical: space.xxxl, alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: space.sm,
  },
  settingsButton: {
    padding: space.xs,
  },
  identityFallback: {
    paddingVertical: space.xl,
    alignItems: 'center',
    gap: space.md,
  },
  identityRetry: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.wineSoft,
    backgroundColor: colors.wineWash,
  },
  identityRetryLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
  },
  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
  mutedLine: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 19,
    color: colors.textFaint,
    paddingHorizontal: space.xs,
  },
  block: { padding: space.lg },
  blockTight: { paddingHorizontal: space.lg, paddingVertical: space.xs },

  /* Identity */
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  identityText: { flex: 1, gap: 2 },
  identityName: {
    fontFamily: fonts.display,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
  },
  identityHandle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textFaint,
  },
  identityBio: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },

  /* Stats */
  statRow: {
    flexDirection: 'row',
    marginTop: space.xl,
    paddingVertical: space.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.title.fontSize,
    color: colors.text,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 0.4,
    color: colors.textFaint,
  },

  /* Collection */
  rank: {
    fontFamily: fonts.display,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.wine,
  },
  rankCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  rankCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.headline.fontSize,
    color: colors.text,
  },
  rankTotal: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  rankPct: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  blockDivider: { marginVertical: space.lg },
  categoryRow: { marginBottom: space.md },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  categoryCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textMuted,
  },

  /* Rarity */
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rarityCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  /* Milestones */
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  milestoneMark: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  milestoneNameDim: { fontFamily: fonts.body, color: colors.textFaint },
  milestonePct: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textFaint,
  },

  /* Rarest entry */
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorderLit,
  },
  prizeThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeImage: { width: '100%', height: '100%' },
  prizeBody: { flex: 1, gap: space.sm },
  prizeNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  prizeName: {
    flex: 1,
    fontFamily: fonts.displayBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  prizeDex: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textFaint,
  },

  /* Segments */
  segments: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xxl,
    padding: space.xs,
    backgroundColor: colors.bgSunk,
    borderRadius: radius.pill,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
  },
  // El pulgar es una capa propia para poder deslizarlo; el segmento activo ya
  // no lleva fondo.
  segmentThumb: {
    position: 'absolute',
    top: space.xs,
    bottom: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  segmentLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.textFaint,
  },
  segmentLabelActive: { color: colors.wine },

  /* Posts grid */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.lg,
  },
  tile: {
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImage: { width: '100%', height: '100%' },

  /* Accounts */
  followRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  followText: { flex: 1, gap: 1 },
  followName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize + 1,
    color: colors.text,
  },
  followHandle: {
    fontFamily: fonts.body,
    fontSize: typeScale.micro.fontSize,
    color: colors.textFaint,
  },
  followButton: { paddingHorizontal: space.lg },

  /* Peer */
  peerHeader: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.md,
  },
  peerIdentity: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  peerFollowButton: { marginTop: space.md, alignSelf: 'flex-start' },
  // Peer posts are full-bleed cards; the strip and stats need the page gutter.
  peerBody: { paddingHorizontal: space.xl },
  // Identity already leaves space below it, so trim the strip's own top margin.
  peerSegmentBar: { marginTop: space.sm },
  peerNote: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },

  /* Footer */
  footer: { marginTop: space.xxl, alignItems: 'center', gap: space.md },
  signOutButton: { minWidth: 180 },
  deleteAccountButton: {
    marginTop: space.xl,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  deleteAccountLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: typeScale.caption.letterSpacing,
    color: colors.danger,
    textDecorationLine: 'underline',
  },
  resetButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize + 1,
    color: colors.danger,
  },
});
