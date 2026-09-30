import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
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
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon, type IconName } from '@/components/icons';
import { FollowButton } from '@/components/PeopleList';
import { PostCard, timeAgoSpoken, useSignedPhoto } from '@/components/PostCard';
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
import { getDrink, formatCount } from '@/data';
import { blockUser, REPORT_REASONS, reportUser, type ReportReason } from '@/lib/moderation';
import { fetchPostCount, fetchPostsByAuthor, fetchProfiles, toProfile } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { DrinkCategory, Post, Rarity, UserProfile } from '@/types';

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
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, spirit: 0 };
  const byRarity: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };

  let counted = 0;
  for (const post of posts) {
    const drink = getDrink(post.drinkId);
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

const NO_POSTS: Post[] = [];

/*
 * The most posts one profile list holds: fetchPostsByAuthor's limit
 * (FEED_SIZE in lib/social, which does not export it). Past this the list
 * is the latest page, not everything, and the peer's stats note says so.
 */
const POSTS_PAGE = 100;

type PostsStatus = 'loading' | 'ready' | 'error';

interface AuthorPosts {
  posts: Post[];
  /**
   * How many posts they have in all, `null` until known. The list stops at
   * one page, so past that its length is not the count; up to it, the list
   * IS everything, and its own length is the number that matches the grid
   * (the server's count also includes posts whose drink has left the Dex,
   * which the list drops).
   */
  total: number | null;
  /**
   * 'loading' until the first answer for this author arrives (and while a
   * retry after a failure is in flight), 'error' when the latest attempt
   * failed, 'ready' otherwise. A refetch over posts already on screen stays
   * 'ready': the grid is still true while the new answer is on its way.
   */
  status: PostsStatus;
  /** A fetch the user asked for (pull to refresh, Try again) is in flight. */
  reloading: boolean;
  reload: () => void;
}

/**
 * One person's posts, held locally.
 *
 * Not in the social store: that store owns the feed, and a profile is a
 * different slice of the same table that shouldn't evict it.
 *
 * It says which of three things an empty list means. A bare array used to
 * stand for "still fetching", "the fetch failed" and "they have no posts"
 * all at once, so every profile opened on "No posts yet" and a Posts count
 * of 0, and a failed request went on saying so for good.
 *
 * A failed REFETCH keeps what is already on screen. Writing an empty list
 * for the same person is how one dropped request after logging a pour used
 * to wipe a grid that was showing perfectly well.
 *
 * The count comes alongside, as a head request. The Posts figure used to be
 * the list's length, so anyone past a hundred posts read as exactly 100.
 * A failed count does not fail the posts: it keeps the last count for the
 * same person, or none, and the callers fall back to the list's length.
 */
function usePostsByAuthor(
  authorId: string | undefined,
  myId: string | undefined,
  /** Change this to refetch without blanking what's already on screen. */
  reloadKey = '',
): AuthorPosts {
  // Tagged with whose posts these are, so switching author reads as empty
  // without a synchronous reset that would cascade renders.
  const who = `${authorId ?? ''}|${myId ?? ''}`;
  const base = `${who}#${reloadKey}`;
  // Explicit reloads count up; stamping the base they were asked on keeps a
  // pull from reading as "reloading" once something else has refetched.
  const [asked, setAsked] = useState({ base: '', n: 0 });
  const request = `${base}#${asked.n}`;
  const [loaded, setLoaded] = useState<{
    who: string;
    request: string;
    posts: Post[];
    count: number | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!authorId || !myId) return;
    let alive = true;
    Promise.all([
      fetchPostsByAuthor(authorId, myId),
      fetchPostCount(authorId).catch(() => null),
    ])
      .then(([rows, count]) => {
        if (!alive) return;
        setLoaded((prev) => ({
          who,
          request,
          posts: rows,
          count: count ?? (prev?.who === who ? prev.count : null),
          failed: false,
        }));
      })
      .catch(() => {
        if (!alive) return;
        setLoaded((prev) => ({
          who,
          request,
          posts: prev?.who === who ? prev.posts : NO_POSTS,
          count: prev?.who === who ? prev.count : null,
          failed: true,
        }));
      });
    return () => {
      alive = false;
    };
  }, [authorId, myId, who, request]);

  const mine = loaded?.who === who ? loaded : null;
  const current = mine?.request === request;
  const status: PostsStatus =
    !mine || (mine.failed && !current) ? 'loading' : mine.failed ? 'error' : 'ready';
  const posts = mine?.posts ?? NO_POSTS;
  const total =
    mine?.count == null ? null : mine.count <= POSTS_PAGE ? posts.length : mine.count;

  return {
    posts,
    total,
    status,
    reloading: asked.n > 0 && asked.base === base && !current,
    reload: () => setAsked({ base, n: asked.n + 1 }),
  };
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
      <Avatar
        name={profile.displayName}
        accent={profile.accent}
        size={84}
        ring
        avatarPath={profile.avatarPath}
      />
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

/**
 * One figure and its label, read as one element.
 *
 * `null` is a number not known yet, shown as a dash rather than a confident
 * 0. `accessible` is what makes the label count: RN only speaks a View's
 * accessibilityLabel when the View is itself an accessibility element, and
 * without it VoiceOver read "3" and "Collected" as two unrelated stops.
 */
function Stat({ value, label }: { value: number | null; label: string }) {
  return (
    <View
      style={styles.stat}
      accessible
      accessibilityLabel={value === null ? `${label}, not loaded yet` : `${formatCount(value)} ${label}`}>
      <Text style={styles.statValue}>{value === null ? '–' : formatCount(value)}</Text>
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
  /*
   * The post is the retry key, so a pull to refresh (which fetches fresh
   * post objects) re-asks for a photo that failed to sign. `undefined` is
   * "still signing": the tile holds its category wash, and only a photo
   * that will not sign (`null`) falls back to the artwork. Drawing the
   * artwork while waiting flashed an illustration that the photo replaced.
   */
  const photoUrl = useSignedPhoto(post.photoPath, post);
  const drink = getDrink(post.drinkId);
  if (!drink) return null;

  return (
    <PressableScale
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      // Spoken, not the visual "3h": that reads as "3 h", and a post under a
      // minute old came out as "logged now ago".
      accessibilityLabel={`${drink.name}, logged ${timeAgoSpoken(post.createdAt)}`}
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: CATEGORY_META[drink.category].wash },
      ]}>
      {photoUrl !== null ? (
        <Image
          source={photoUrl ? { uri: photoUrl, cacheKey: post.photoPath ?? undefined } : undefined}
          /*
           * Keyed on the storage path, as PostCard's photo is: a signed URL
           * carries a fresh token each time it is minted, so keyed on the URL
           * the disk cache never hit and every visit downloaded the grid again.
           */
          cachePolicy="memory-disk"
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

/** The vertical gap between grid rows; the horizontal one is the row's own gap. */
function GridGap() {
  return <View style={styles.gridGap} />;
}

/** The air between two of a peer's posts: the feed's gap. */
function PeerPostGap() {
  return <View style={styles.peerPostGap} />;
}

/**
 * Someone in the accounts list. The name and picture open their profile, so
 * you can see who someone is before following them — and reach Report and
 * Block for an account that has never posted, which no post menu can.
 */
function FollowRow({
  person,
  following,
  onToggle,
  onOpen,
}: {
  person: UserProfile;
  following: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.followRow}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open ${person.displayName}'s profile`}
        style={styles.followIdentity}>
        <Avatar
          name={person.displayName}
          accent={person.accent}
          size={44}
          avatarPath={person.avatarPath}
        />
        <View style={styles.followText}>
          <Text style={styles.followName} numberOfLines={1}>
            {person.displayName}
          </Text>
          <Text style={styles.followHandle} numberOfLines={1}>
            @{person.username}
          </Text>
        </View>
      </PressableScale>
      {/* The row-sized toggle every list of people shares (PeopleList). */}
      <FollowButton following={following} name={person.displayName} onToggle={onToggle} />
    </View>
  );
}

/**
 * The profile's sections. Your own profile has Posts and Accounts (your
 * stats moved to the Stats tab); a peer's has Posts and Stats, because you
 * can't manage someone else's follows.
 */
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

/**
 * Segmented control with a thumb that SLIDES between options.
 *
 * The white pill used to be a background swapped onto whichever segment was
 * active — two things blinking rather than one thing moving. A travelling
 * thumb is what makes a segmented control feel like a physical switch, and it
 * matches the tab pill in the Hornofino app so both houses move alike.
 *
 * It travels on `motion.selection`, the spring every selection control in
 * the app answers with. The tab bar sits one tap below this strip, and the
 * same gesture must not settle at two speeds.
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
    return reduced
      ? withTiming(target, { duration: motion.fast })
      : withSpring(target, motion.selection);
  });
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      // 'tabbar', not 'tablist': on iOS only this role carries the TabBar
      // trait. The segments inside are buttons (see below).
      accessibilityRole="tabbar"
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
            /*
             * 'button', not 'tab'. React Native gives 'tab' no trait at all on
             * iOS, so VoiceOver read a bare "Your posts, selected" with nothing
             * to say it could be pressed. A selected button is how the tab
             * bar below and the Bar's own segments are read.
             */
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.a11yLabel}
            style={styles.segment}>
            <Icon
              name={item.icon}
              size={17}
              color={active ? colors.wine : colors.textMuted}
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

function OwnProfile({
  segment,
  onSegmentChange,
  onOpenPerson,
}: {
  /** Held by the screen, so coming back from someone's profile lands on the list you left. */
  segment: Segment;
  onSegmentChange: (segment: Segment) => void;
  onOpenPerson: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);
  const profileLoading = useAuth((s) => s.profileLoading);
  const profileError = useAuth((s) => s.profileError);
  const refreshProfile = useAuth((s) => s.refreshProfile);

  const unlocks = useCollection((s) => s.unlocks);

  const people = useSocial((s) => s.people);
  const following = useSocial((s) => s.following);
  const loadingPeople = useSocial((s) => s.loadingPeople);
  const peopleError = useSocial((s) => s.peopleError);
  const loadPeople = useSocial((s) => s.loadPeople);
  const toggleFollow = useSocial((s) => s.toggleFollow);

  /*
   * This grid is fetched separately from the feed, so it has to be told
   * when one of your posts changes. The store bumps postsVersion on every
   * write to your posts: a new pour, another photo on an existing one, a
   * removal. It used to key on the feed's LENGTH, which a second photo of
   * the same drink does not change (one post per drink), nor does a new
   * post once the feed is at its hundred-row cap, while following someone
   * changed it for no reason at all.
   */
  const postsVersion = useSocial((s) => s.postsVersion);
  const {
    posts: myPosts,
    total: postsTotal,
    status: postsStatus,
    reloading,
    reload: reloadPosts,
  } = usePostsByAuthor(myId, myId, String(postsVersion));

  // Tapping the Profile tab while already on it returns the list to the top.
  const listRef = useRef<FlatList<Post>>(null);
  useScrollToTop(listRef);

  // The accounts list is a second query; don't pay for it until it's asked for.
  useEffect(() => {
    if (segment === 'friends' && myId) void loadPeople(myId);
  }, [segment, myId, loadPeople]);

  const { unlockedCount } = useMemo(() => deriveStats(unlocks), [unlocks]);

  const me = profile ? toProfile(profile) : null;
  const tile = (width - space.xl * 2 - space.xs * 2) / 3;
  // A post whose drink is not in this build has no tile. Dropped here rather
  // than rendered as nothing, which would leave a hole in a three-column row.
  const gridPosts = myPosts.filter((post) => !!getDrink(post.drinkId));

  const openDrink = useCallback(
    (id: string) => router.push({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  /*
   * Reset, sign out and delete moved to the Settings screen, along with the
   * Instagram and contact controls.
   *
   * They were an Alert with three destructive buttons and no room to say
   * what any of them did — and the web branch that used to be here existed
   * only because a three-button Alert does not work in a browser. A screen
   * needs no such exception, and account deletion is still two taps from
   * the profile, which is what Apple asks for.
   */
  const openSettings = useCallback(() => {
    haptic.tap();
    router.push('/settings');
  }, [router]);

  /*
   * Pull to refresh. The posts are the spinner; the profile card and the
   * accounts list reload alongside and show their own states, so a failed
   * profile load can be retried by pulling as well as by its Try again.
   */
  const onRefresh = () => {
    reloadPosts();
    if (!profile) void refreshProfile();
    if (segment === 'friends' && myId) void loadPeople(myId);
  };

  const header = (
    <>
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
        *
        * Edit profile sits where a peer's Follow sits: the name, handle and
        * bio shown here are changed here, not only from inside Settings.
        */}
      {me ? (
        <Identity
          profile={me}
          trailing={
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => router.push('/edit-profile')}
              style={styles.identityAction}
            />
          }
        />
      ) : profileLoading ? (
        <View style={styles.identityFallback}>
          <ActivityIndicator color={colors.wine} />
        </View>
      ) : (
        <View style={styles.identityFallback}>
          <Text style={styles.mutedLine}>
            {profileError ?? 'Your profile could not be loaded.'}
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => void refreshProfile()}
            accessibilityHint="Loads your profile again"
          />
        </View>
      )}

      <View style={styles.statRow}>
        {/* "Collected": the word the Dex count and the celebration card use. */}
        <Stat value={unlockedCount} label="Collected" />
        {/*
          The server's count, which the grid (one page of a hundred) can fall
          short of. Without a count, the list's length once it has answered;
          before either, a dash rather than a confident 0.
        */}
        <Stat
          value={
            postsTotal ??
            (postsStatus === 'ready' || myPosts.length > 0 ? myPosts.length : null)
          }
          label="Posts"
        />
        <Stat value={following.length} label="Following" />
      </View>

      <SegmentBar items={OWN_SEGMENTS} value={segment} onChange={onSegmentChange} />
    </>
  );

  const postsEmpty =
    postsStatus === 'loading' ? (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.wine} />
      </View>
    ) : postsStatus === 'error' ? (
      <EmptyState
        icon="camera"
        title="Could not load your posts"
        body="Check your connection and try again."
        action={{ label: 'Try again', onPress: reloadPosts }}
      />
    ) : (
      /*
       * Not "every entry you log becomes a post": Save to Dex logs without
       * posting, so that promise was false for anyone who had used it.
       */
      <EmptyState
        icon="camera"
        title="No posts yet"
        body="Pours you post show up here."
        action={{ label: 'Log a pour', onPress: () => router.push('/log') }}
      />
    );

  /*
   * Invite, username search, contact matching and Instagram moved to
   * Settings — they are controls over how findable YOU are, which is a
   * different thing from browsing other people. What is left here is the
   * browsing, and each row opens that person's profile.
   *
   * The empty line used to point at an invite control "above" that had
   * moved away, and it also showed when the list failed to load, so a
   * dropped request read as "you're early". Failure and empty now say
   * different things, and both offer the next step.
   */
  const accounts = (
    <>
      <SectionLabel style={styles.sectionLabel}>Everyone on Sipply</SectionLabel>
      {loadingPeople && people.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.wine} />
        </View>
      ) : peopleError && people.length === 0 ? (
        <EmptyState
          icon="users"
          title="Could not load accounts"
          body="Check your connection and try again."
          action={{
            label: 'Try again',
            onPress: () => {
              if (myId) void loadPeople(myId);
            },
          }}
        />
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
              onOpen={() => onOpenPerson(p.id)}
            />
          ))}
        </Card>
      ) : (
        <EmptyState
          icon="users"
          title="No one else here yet"
          body="Invite a friend. When they join, you’ll follow each other."
          action={{ label: 'Invite a friend', onPress: () => router.push('/find-friends') }}
        />
      )}
    </>
  );

  /*
   * A list, not a ScrollView. Up to a hundred tiles each sign and download a
   * photo, and a ScrollView mounted every one of them on open. `numColumns`
   * stays 3 whichever segment is showing (React Native throws if it changes
   * on a mounted list), so Accounts is the footer rather than the data.
   */
  return (
    <FlatList
      ref={listRef}
      data={segment === 'posts' ? gridPosts : NO_POSTS}
      keyExtractor={(post) => post.id}
      numColumns={3}
      renderItem={({ item }) => <PostTile post={item} size={tile} onPress={openDrink} />}
      columnWrapperStyle={styles.gridRow}
      ItemSeparatorComponent={GridGap}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={
        segment === 'posts' && gridPosts.length > 0 ? styles.gridTop : undefined
      }
      ListEmptyComponent={segment === 'posts' ? postsEmpty : null}
      ListFooterComponent={segment === 'friends' ? accounts : null}
      refreshing={reloading}
      onRefresh={onRefresh}
      initialNumToRender={15}
      windowSize={5}
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        },
      ]}
      showsVerticalScrollIndicator={false}
    />
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

/*
 * The peer id arrives from a link as readily as from a tap, so it is
 * checked before it is used. A plain lookup object answers "constructor" or
 * "__proto__" with something that is not a profile, and an id that is not
 * shaped like an account id cannot be one: asking the server about it only
 * failed, which read as a connection problem with a Try again that could
 * never work. Both now read as the account not being there.
 */
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownEntry<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function PeerProfile({ id, onBack }: { id: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const wellFormed = ACCOUNT_ID.test(id);
  const myId = useAuth((s) => s.session?.user.id);
  const cached = useSocial((s) => ownEntry(s.profiles, id));
  const following = useSocial((s) => s.following.includes(id));
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const dropAuthor = useSocial((s) => s.dropAuthor);

  const [segment, setSegment] = useState<Segment>('posts');
  const { posts, total, status, reloading, reload } = usePostsByAuthor(
    wellFormed ? id : undefined,
    myId,
  );
  // More posts than the one page the list holds: the stats cover that page.
  const pageOnly = total !== null && total > posts.length;
  const shared = total ?? posts.length;

  // A second press of the Profile tab scrolls their posts back to the top.
  const listRef = useRef<FlatList<Post>>(null);
  useScrollToTop(listRef);

  // Their real collection never leaves their device, so break down public posts.
  const { counted, byCategory, byRarity } = useMemo(() => derivePostStats(posts), [posts]);

  /*
   * The lookup is normally already warm — you get here from the feed or the
   * accounts list. A cold deep link into this route is the exception, so
   * fetch the one row rather than show a nameless card.
   *
   * Keyed by id and attempt like every other async state in this file, so a
   * different person never borrows the last one's answer, and the fetch in
   * flight reads as loading rather than as "unavailable". A request that
   * failed is told apart from an account that is not there (blocked or
   * deleted, which RLS makes look the same on purpose): only the failure is
   * worth a retry.
   */
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    attempt: number;
    profile: UserProfile | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (cached || !wellFormed) return;
    let alive = true;
    fetchProfiles([id])
      .then((map) => {
        if (alive) {
          setFetched({ id, attempt, profile: ownEntry(map, id) ?? null, failed: false });
        }
      })
      .catch(() => {
        if (alive) setFetched({ id, attempt, profile: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, [cached, wellFormed, id, attempt]);

  const answer = fetched?.id === id && fetched.attempt === attempt ? fetched : null;
  const person = cached ?? answer?.profile ?? null;
  const lookup: 'loading' | 'failed' | 'missing' = !wellFormed
    ? 'missing'
    : !answer
      ? 'loading'
      : answer.failed
        ? 'failed'
        : 'missing';

  const openDrink = useCallback(
    (drinkId: string) => router.push({ pathname: '/drink/[id]', params: { id: drinkId } }),
    [router],
  );

  /*
   * A block takes them out of every list the store holds at once, then
   * leaves: RLS hides them from the next query, and staying on the profile
   * of someone you just blocked reads as a block that did not work. Both
   * block paths end here: this header's menu, and the menu on any of their
   * posts (which ticks its own haptic before calling onBlocked).
   */
  const afterBlock = useCallback(() => {
    dropAuthor(id);
    onBack();
  }, [dropAuthor, id, onBack]);

  /*
   * Report and block live on the profile as well as on each post. A name,
   * a bio and a picture are content too, and an account that has never
   * posted has no post menu to reach them from.
   *
   * Built the way PostCard builds its menu, so the two read as one feature:
   * the same reasons and wording, an action sheet on iOS (a choice among
   * several is a sheet; an alert is for a yes or no), and Report not styled
   * destructive, because filing one removes nothing. Block is destructive.
   */
  const openReport = () => {
    if (!myId || !person) return;
    const file = (reason: ReportReason) => {
      void reportUser(myId, person.id, reason)
        .then(() =>
          Alert.alert(
            'Thanks',
            'This account has been reported. You can also block them from the same menu.',
          ),
        )
        .catch(() => Alert.alert('Could not report', 'Check your connection and try again.'));
    };
    const title = `Report @${person.username}`;
    const message =
      'What is wrong with this account? Reports are reviewed privately; they are not told who reported them.';

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [...REPORT_REASONS.map((r) => r.label), 'Cancel'],
          cancelButtonIndex: REPORT_REASONS.length,
        },
        (i) => {
          const reason = REPORT_REASONS[i];
          if (reason) file(reason.key);
        },
      );
      return;
    }
    Alert.alert(title, message, [
      ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => file(r.key) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmBlock = () => {
    if (!myId || !person) return;
    Alert.alert(
      `Block @${person.username}?`,
      'You will not see their posts and they will not see yours. Any follow between you is removed. You can undo this in Settings, under Blocked accounts.',
      [
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Block',
          style: 'destructive' as const,
          onPress: () => {
            void blockUser(myId, person.id)
              .then(() => {
                haptic.select();
                afterBlock();
              })
              .catch(() => Alert.alert('Could not block', 'Check your connection and try again.'));
          },
        },
      ],
    );
  };

  const openAccountMenu = () => {
    if (!person) return;
    const block = `Block @${person.username}`;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: person.displayName,
          options: ['Report account', block, 'Cancel'],
          cancelButtonIndex: 2,
          destructiveButtonIndex: 1,
        },
        (i) => {
          if (i === 0) openReport();
          else if (i === 1) confirmBlock();
        },
      );
      return;
    }
    Alert.alert(person.displayName, undefined, [
      { text: 'Report account', onPress: openReport },
      { text: block, style: 'destructive' as const, onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const topBar = (
    <View style={styles.peerHeader}>
      {/*
        "Back", not "Back to your profile": it returns wherever you came from,
        which from the feed is Home. The slop reaches past the 44pt box
        because the button sits hard against the screen edge.
      */}
      <PressableScale
        onPress={onBack}
        noHaptic
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.backButton}>
        <Icon name="chevronLeft" size={22} color={colors.text} />
      </PressableScale>
      {person && myId ? (
        <PressableScale
          onPress={openAccountMenu}
          accessibilityRole="button"
          accessibilityLabel={`Options for @${person.username}`}
          style={styles.moreButton}>
          <Icon name="more" size={22} color={colors.textMuted} />
        </PressableScale>
      ) : null}
    </View>
  );

  if (!person) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
        {topBar}
        <View style={[styles.screen, styles.centered]}>
          {lookup === 'loading' ? (
            <ActivityIndicator color={colors.wine} />
          ) : lookup === 'failed' ? (
            <EmptyState
              icon="users"
              title="Could not load this profile"
              body="Check your connection and try again."
              action={{ label: 'Try again', onPress: () => setAttempt(attempt + 1) }}
            />
          ) : (
            <EmptyState
              icon="users"
              title="Profile unavailable"
              body="This account is not available."
              action={{ label: 'Back', onPress: onBack }}
            />
          )}
        </View>
      </View>
    );
  }

  const header = (
    <>
      {topBar}

      <View style={styles.peerIdentity}>
        <Identity
          profile={person}
          trailing={
            <Button
              label={following ? 'Following' : 'Follow'}
              variant={following ? 'secondary' : 'primary'}
              icon={following ? 'check' : undefined}
              // The handler answers with a selection tick of its own.
              noHaptic
              onPress={() => {
                if (myId) void toggleFollow(myId, id);
                haptic.select();
              }}
              accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${person.displayName}`}
              style={styles.identityAction}
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
    </>
  );

  const loadingBlock = (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.wine} />
    </View>
  );

  const failedBlock = (
    <EmptyState
      icon="grid"
      title="Could not load their posts"
      body="Check your connection and try again."
      action={{ label: 'Try again', onPress: reload }}
    />
  );

  const postsEmpty =
    status === 'loading' ? (
      loadingBlock
    ) : status === 'error' ? (
      failedBlock
    ) : (
      <EmptyState
        icon="grid"
        title="No posts"
        body={`${person.displayName} hasn't shared an entry yet.`}
      />
    );

  const stats =
    posts.length > 0 ? (
      <View style={styles.peerBody}>
        {/* ---- Shared ---- */}
        <SectionLabel style={styles.sectionLabel}>Shared</SectionLabel>
        <Card style={styles.block}>
          <Text style={styles.rank}>
            {formatCount(shared)} {shared === 1 ? 'pour' : 'pours'} shared
          </Text>
          {/*
            Honest framing: this is their public feed, not their real Dex,
            and past one page only the latest hundred of it.
          */}
          <Text style={styles.peerNote}>
            {pageOnly
              ? `Based on their latest ${POSTS_PAGE} pours`
              : "Based on what they've shared"}
          </Text>

          <Divider style={styles.blockDivider} />

          {CATEGORY_ORDER.map((category) => {
            const meta = CATEGORY_META[category];
            const count = byCategory[category];
            return (
              <View
                key={category}
                style={styles.categoryRow}
                accessible
                accessibilityLabel={`${meta.plural}: ${count} shared`}>
                <View style={styles.categoryHead}>
                  <View style={[styles.categoryDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.categoryName}>{meta.plural}</Text>
                  <Text style={styles.categoryCount}>{count}</Text>
                </View>
                {/* Bars read as share-of-pours, so the max is the pours broken down here. */}
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
              accessible
              accessibilityLabel={`${RARITY_META[rarity].label}: ${byRarity[rarity]} shared`}>
              <RarityBadge rarity={rarity} />
              <Text style={styles.rarityCount}>{byRarity[rarity]}</Text>
            </View>
          ))}
        </Card>
      </View>
    ) : status === 'loading' ? (
      loadingBlock
    ) : status === 'error' ? (
      failedBlock
    ) : (
      <EmptyState
        icon="trophy"
        title="No stats yet"
        body={`${person.displayName} hasn't shared an entry yet.`}
      />
    );

  /*
   * A list, not a ScrollView: a busy profile is up to a hundred full post
   * cards, each with a photo to sign and download, and a ScrollView mounted
   * all of them before the first scroll. Windowed tightly because a card is
   * most of a screen tall.
   */
  return (
    <FlatList
      ref={listRef}
      data={segment === 'posts' ? posts : NO_POSTS}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => (
        <PostCard post={item} author={person} onOpenDrink={openDrink} onBlocked={afterBlock} />
      )}
      ItemSeparatorComponent={PeerPostGap}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={
        segment === 'posts' && posts.length > 0 ? styles.peerPostsTop : undefined
      }
      ListEmptyComponent={segment === 'posts' ? postsEmpty : null}
      ListFooterComponent={segment === 'stats' ? stats : null}
      refreshing={reloading}
      onRefresh={reload}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      style={styles.screen}
      contentContainerStyle={[
        styles.peerContent,
        {
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        },
      ]}
      showsVerticalScrollIndicator={false}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

/** The slice of the tab screen's navigation object this screen uses. */
interface ProfileNavigation {
  setParams: (params: { user?: string; from?: string }) => void;
  canGoBack: () => boolean;
  goBack: () => void;
  getParent: () => { isFocused: () => boolean } | undefined;
  addListener: (event: 'blur' | 'tabPress', callback: () => void) => () => void;
}

export default function ProfileScreen() {
  /*
   * `user` is whose profile to show. `from` is 'accounts' when it was opened
   * from your own Accounts list, so Back returns there rather than to the
   * tab you were on before Profile.
   */
  const { user, from } = useLocalSearchParams<{ user?: string; from?: string }>();
  const navigation = useNavigation<ProfileNavigation>();
  const myId = useAuth((s) => s.session?.user.id);

  // Lives here, not in OwnProfile, which unmounts while a peer is showing.
  const [ownSegment, setOwnSegment] = useState<Segment>('posts');

  const peerId = user && user !== myId ? user : null;

  const clearPeer = useCallback(
    () => navigation.setParams({ user: undefined, from: undefined }),
    [navigation],
  );

  /*
   * The feed opens a peer by pushing this tab with a `user` param, and a tab
   * press merges params rather than clearing them. So the peer is dropped
   * when you leave for ANOTHER TAB, which keeps the Profile tab landing on
   * your own card next time.
   *
   * Not on every blur. Opening a drink from their posts pushes a root-stack
   * screen over the tabs, and that blurs this tab too; clearing then meant
   * coming back from the drink to your own profile, with the person you
   * were browsing gone. The tab navigator is still focused after a tab
   * switch and is not after a push over it, which is the difference.
   *
   * Pressing the Profile tab while someone else's profile is showing
   * takes you to your own, as the highlighted tab says it should.
   */
  useEffect(() => {
    const offBlur = navigation.addListener('blur', () => {
      if (user && navigation.getParent()?.isFocused()) clearPeer();
    });
    const offTabPress = navigation.addListener('tabPress', () => {
      if (user) clearPeer();
    });
    return () => {
      offBlur();
      offTabPress();
    };
  }, [navigation, clearPeer, user]);

  /*
   * Back goes where you came from. A peer opened from the feed returns to
   * the feed: the tab navigator's back, which lands on Home, the first tab.
   * This used to drop you on your own profile instead. One opened from
   * your Accounts list returns to that list.
   */
  const leavePeer = useCallback(() => {
    if (from === 'accounts' || !navigation.canGoBack()) clearPeer();
    else navigation.goBack();
  }, [from, navigation, clearPeer]);

  const openFromAccounts = useCallback(
    (id: string) => navigation.setParams({ user: id, from: 'accounts' }),
    [navigation],
  );

  return (
    <AuthGate>
      {peerId ? (
        <PeerProfile id={peerId} onBack={leavePeer} />
      ) : (
        <OwnProfile
          segment={ownSegment}
          onSegmentChange={setOwnSegment}
          onOpenPerson={openFromAccounts}
        />
      )}
    </AuthGate>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: 'center' },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  peerContent: { paddingBottom: space.xxxl },
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
  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
  // 13pt: textMuted, which holds 4.5:1 on the page where textFaint cannot.
  mutedLine: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 19,
    color: colors.textMuted,
    paddingHorizontal: space.xs,
    textAlign: 'center',
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
    color: colors.textMuted,
  },
  identityBio: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  // Your Edit profile and a peer's Follow: the same slot, the same button.
  identityAction: { marginTop: space.md, alignSelf: 'flex-start' },

  /* Stats */
  /*
   * Three numbers with air around them, not a bordered band. The rules
   * top and bottom were doing the separating when the page and the card
   * were the same off-white; now that the page is cream they are a second
   * separator doing a job the ground already does, and they cut the header
   * into stripes.
   */
  statRow: {
    flexDirection: 'row',
    marginTop: space.xl,
    paddingVertical: space.lg,
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
    color: colors.textMuted,
  },

  /* Peer stats */
  rank: {
    fontFamily: fonts.display,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.wine,
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
  // The thumb is its own layer so it can slide; the active segment no longer
  // carries a fill of its own.
  segmentThumb: {
    position: 'absolute',
    top: space.xs,
    bottom: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  // 13pt, and the only name the inactive segment has: textMuted, not
  // textFaint. Selection still reads as wine on the white thumb.
  segmentLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  segmentLabelActive: { color: colors.wine },

  /* Posts grid */
  gridTop: { marginBottom: space.lg },
  gridRow: { gap: space.xs },
  gridGap: { height: space.xs },
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
  followIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  followText: { flex: 1, gap: 1 },
  /*
   * The same type as PeopleList's PersonRow, which draws every other list of
   * people: the name on the body size, the handle at 13pt in textMuted. The
   * two used to differ by a point or two, which read as a mistake.
   */
  followName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  followHandle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  /* Peer */
  peerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.md,
  },
  moreButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.md,
  },
  peerIdentity: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  // Peer posts are full-bleed cards; the strip and stats need the page gutter.
  peerBody: { paddingHorizontal: space.xl },
  /*
   * The space between two of their posts, and between the strip and the
   * first: the feed's gap. PostCard has no fill of its own any more, so
   * this air is the only thing that tells one post from the next.
   */
  peerPostGap: { height: space.lg },
  peerPostsTop: { marginBottom: space.lg },
  // Identity already leaves space below it, so trim the strip's own top margin.
  peerSegmentBar: { marginTop: space.sm },
  peerNote: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },
});
