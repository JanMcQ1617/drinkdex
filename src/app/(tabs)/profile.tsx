import { Image } from 'expo-image';
import { useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { deriveStats } from '@/components/CollectionStats';
import { DrinkArt } from '@/components/artwork';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { POSTS_PAGE, ProfileIdentity, usePostsByAuthor } from '@/components/PeerProfile';
import { FollowButton } from '@/components/PeopleList';
import { timeAgoSpoken, useSignedPhoto } from '@/components/PostCard';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  haptic,
  PressableScale,
  SectionLabel,
  SegmentedControl,
  type SegmentItem,
} from '@/components/ui';
import { CATEGORY_META, colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { toProfile } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

const NO_POSTS: Post[] = [];

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

/* ------------------------------------------------------------------ */
/* Your profile                                                        */
/* ------------------------------------------------------------------ */

/*
 * Posts and Accounts. Your stats moved to the Stats tab; someone else's
 * profile (PeerProfile) has Posts and Stats instead, because you cannot
 * manage another person's follows.
 */
type Segment = 'posts' | 'friends';

const OWN_SEGMENTS: SegmentItem<Segment>[] = [
  { key: 'posts', icon: 'grid', label: 'Posts', a11yLabel: 'Your posts', fillActive: true },
  { key: 'friends', icon: 'users', label: 'Accounts', a11yLabel: 'Accounts' },
];

function OwnProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  /*
   * Someone opened from the Accounts list is pushed over the tabs, so this
   * screen stays mounted under them and Back lands on the list you left.
   */
  const [segment, setSegment] = useState<Segment>('posts');

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

  // Their own screen, pushed over the tabs: this tab only ever shows you.
  const openPerson = useCallback(
    (id: string) => router.push({ pathname: '/user/[id]', params: { id } }),
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
        <ProfileIdentity
          profile={me}
          trailing={
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => router.push('/edit-profile')}
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

      <SegmentedControl
        items={OWN_SEGMENTS}
        value={segment}
        onChange={setSegment}
        style={styles.segments}
      />
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
              onOpen={() => openPerson(p.id)}
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
   * Under the grid when it is one page of more. The Posts figure above is
   * the server's count; without this line the grid simply stopped, a
   * hundred tiles short of it, and read as everything you had posted.
   */
  const postsFooter =
    postsTotal !== null && postsTotal > myPosts.length ? (
      <Text style={styles.pageNote}>
        Showing your latest {POSTS_PAGE} of {formatCount(postsTotal)} posts.
      </Text>
    ) : null;

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
      ListFooterComponent={segment === 'friends' ? accounts : postsFooter}
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
/* Screen                                                              */
/* ------------------------------------------------------------------ */

/*
 * Always you. Someone else's profile is its own screen, app/user/[id].tsx,
 * pushed over the tabs. It used to be a `user` param on this tab, which
 * lit Profile in the tab bar while another person was on screen and needed
 * a hand-built Back; everything that opens a person now pushes that route.
 */
export default function ProfileScreen() {
  return (
    <AuthGate>
      <OwnProfile />
    </AuthGate>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
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
  blockTight: { paddingHorizontal: space.lg, paddingVertical: space.xs },

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

  // The shared control carries no margin of its own; this is the header's air.
  segments: { marginTop: space.xxl },

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
  pageNote: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    paddingTop: space.lg,
  },

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
});
