import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { PostCard } from '@/components/PostCard';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  haptic,
  PressableScale,
  ProgressBar,
  RarityBadge,
  SectionLabel,
  SegmentedControl,
  type SegmentItem,
} from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  fonts,
  RARITY_META,
  RARITY_ORDER,
  space,
  type as typeScale,
} from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { blockUser, REPORT_REASONS, reportUser, type ReportReason } from '@/lib/moderation';
import { fetchPostCount, fetchPostsByAuthor, fetchProfiles } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { DrinkCategory, Post, Rarity, UserProfile } from '@/types';

/* ==================================================================== */
/* Someone else's profile                                               */
/*                                                                      */
/* Rendered by its own root-stack route, app/user/[id].tsx, rather than  */
/* as a mode of the Profile tab. As a mode it borrowed the tab's place:  */
/* the tab bar lit Profile while you were looking at someone else, Back  */
/* had to be rebuilt by hand from the tab's history, and there was no    */
/* swipe back at all. Pushed over the tabs, it gets the native back      */
/* gesture, the tab bar leaves while it shows, and Back is simply back.  */
/*                                                                      */
/* The pieces your own profile draws the same way (the posts hook and    */
/* the identity block) live here too and are exported to it.            */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* Shared with your own profile                                        */
/* ------------------------------------------------------------------ */

const NO_POSTS: Post[] = [];

/*
 * The most posts one profile list holds: fetchPostsByAuthor's limit
 * (FEED_SIZE in lib/social, which does not export it). Past this the list
 * is the latest page, not everything, and both profiles say so under it.
 */
export const POSTS_PAGE = 100;

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
export function usePostsByAuthor(
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

/**
 * The picture, name, handle and bio at the top of a profile. `trailing` is
 * the profile's one action: Edit profile on yours, Follow on theirs, in the
 * same slot so the two screens read as one design.
 */
export function ProfileIdentity({
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
        <Text style={styles.identityName} numberOfLines={1} accessibilityRole="header">
          {profile.displayName}
        </Text>
        <Text style={styles.identityHandle} numberOfLines={1}>
          @{profile.username}
        </Text>
        {profile.bio ? <Text style={styles.identityBio}>{profile.bio}</Text> : null}
        {trailing ? <View style={styles.identityAction}>{trailing}</View> : null}
      </View>
    </View>
  );
}

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
/* The profile                                                         */
/* ------------------------------------------------------------------ */

type PeerSegment = 'posts' | 'stats';

// No Accounts section: you can only manage your own follows, not a peer's.
const PEER_SEGMENTS: SegmentItem<PeerSegment>[] = [
  { key: 'posts', icon: 'grid', label: 'Posts', a11yLabel: 'Their posts', fillActive: true },
  { key: 'stats', icon: 'trophy', label: 'Stats', a11yLabel: 'Their stats', fillActive: true },
];

/*
 * The id arrives from a link as readily as from a tap, so it is checked
 * before it is used. A plain lookup object answers "constructor" or
 * "__proto__" with something that is not a profile, and an id that is not
 * shaped like an account id cannot be one: asking the server about it only
 * failed, which read as a connection problem with a Try again that could
 * never work. Both now read as the account not being there.
 */
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownEntry<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** The air between two of their posts: the feed's gap. */
function PostGap() {
  return <View style={styles.postGap} />;
}

export function PeerProfile({ id, onBack }: { id: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const wellFormed = ACCOUNT_ID.test(id);
  const myId = useAuth((s) => s.session?.user.id);
  const cached = useSocial((s) => ownEntry(s.profiles, id));
  const following = useSocial((s) => s.following.includes(id));
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const dropAuthor = useSocial((s) => s.dropAuthor);

  const [segment, setSegment] = useState<PeerSegment>('posts');
  const { posts, total, status, reloading, reload } = usePostsByAuthor(
    wellFormed ? id : undefined,
    myId,
  );
  // More posts than the one page the list holds: the list and stats cover that page.
  const pageOnly = total !== null && total > posts.length;
  const shared = total ?? posts.length;

  // Their real collection never leaves their device, so break down public posts.
  const { counted, byCategory, byRarity } = useMemo(() => derivePostStats(posts), [posts]);

  /*
   * The lookup is normally already warm — you get here from the feed or a
   * list of people, which put the row in the store. A cold deep link, or a
   * match from Find friends (those rows are not merged into the store), is
   * the exception, so fetch the one row rather than show a nameless card.
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
    <View style={styles.topBar}>
      {/*
        "Back", not "Back to your profile": this is a pushed screen, and it
        returns to wherever you opened it from. The slop reaches past the
        44pt box because the button sits hard against the screen edge.
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

      <View style={styles.identityBlock}>
        <ProfileIdentity
          profile={person}
          trailing={
            /*
             * The full-size Button, not the list rows' FollowButton: here it
             * is the screen's main action rather than one of fifty. Its haptic
             * is the same one, though: Button's own press tick, and nothing
             * added on top, so following feels alike wherever it happens.
             */
            <Button
              label={following ? 'Following' : 'Follow'}
              variant={following ? 'secondary' : 'primary'}
              icon={following ? 'check' : undefined}
              onPress={() => {
                if (myId) void toggleFollow(myId, id);
              }}
              accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${person.displayName}`}
            />
          }
        />
      </View>

      <View style={styles.body}>
        <SegmentedControl
          items={PEER_SEGMENTS}
          value={segment}
          onChange={setSegment}
          style={styles.segments}
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

  /*
   * Nothing shared yet. The next step is the Follow already in the header,
   * so the line points at it rather than repeating it as a second button:
   * one control for one decision.
   */
  const notYet = following
    ? `${person.displayName} hasn't shared a pour yet. Their first one will show up in your feed.`
    : `${person.displayName} hasn't shared a pour yet. Follow them and their first one will show up in your feed.`;

  const postsEmpty =
    status === 'loading' ? (
      loadingBlock
    ) : status === 'error' ? (
      failedBlock
    ) : (
      <EmptyState icon="grid" title="No posts yet" body={notYet} />
    );

  /*
   * Under the last post when the list is one page of more: without it the
   * list simply stopped, and read as everything they had shared.
   */
  const postsFooter = pageOnly ? (
    <Text style={styles.pageNote}>
      Showing their latest {POSTS_PAGE} of {formatCount(shared)} posts.
    </Text>
  ) : null;

  const stats =
    posts.length > 0 ? (
      <View style={styles.body}>
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
          <Text style={styles.statsNote}>
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
      <EmptyState icon="trophy" title="No stats yet" body={notYet} />
    );

  /*
   * A list, not a ScrollView: a busy profile is up to a hundred full post
   * cards, each with a photo to sign and download, and a ScrollView mounted
   * all of them before the first scroll. Windowed tightly because a card is
   * most of a screen tall.
   *
   * The bottom inset is the home indicator's and no more. This screen is
   * pushed over the tabs, so the floating tab bar is not there to clear.
   */
  return (
    <FlatList
      data={segment === 'posts' ? posts : NO_POSTS}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => (
        <PostCard post={item} author={person} onOpenDrink={openDrink} onBlocked={afterBlock} />
      )}
      ItemSeparatorComponent={PostGap}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={
        segment === 'posts' && posts.length > 0 ? styles.postsTop : undefined
      }
      ListEmptyComponent={segment === 'posts' ? postsEmpty : null}
      ListFooterComponent={segment === 'stats' ? stats : postsFooter}
      refreshing={reloading}
      onRefresh={reload}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingBottom: insets.bottom + space.xl,
      }}
      showsVerticalScrollIndicator={false}
    />
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: 'center' },
  loading: { paddingVertical: space.xxxl, alignItems: 'center' },
  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
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

  /* Top bar */
  topBar: {
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

  identityBlock: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  // Their posts are full-bleed cards; the strip and the stats need the page gutter.
  body: { paddingHorizontal: space.xl },
  // The identity block already leaves space below it; this only settles the strip.
  segments: { marginTop: space.sm },
  /*
   * The space between two of their posts, and between the strip and the
   * first: the feed's gap. PostCard has no fill of its own any more, so
   * this air is the only thing that tells one post from the next.
   */
  postGap: { height: space.lg },
  postsTop: { marginBottom: space.lg },
  // In the post text's own gutter, so it reads as the end of the list.
  pageNote: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
  },

  /* Stats */
  rank: {
    fontFamily: fonts.display,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.wine,
  },
  statsNote: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
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
});
