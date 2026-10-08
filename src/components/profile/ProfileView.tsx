import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DexPlaque, rungCounts } from '@/components/brass';
import { EmptyArt } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import {
  DexShelfRow,
  DexSummary,
  sharedByDexNumber,
  sharedNumbers,
  useCollectedNumbers,
  type SharedDrink,
} from '@/components/profile/DexShelf';
import { chunk, PostGridRow } from '@/components/profile/PostGrid';
import { ProfileHeader, type ProfileActions } from '@/components/profile/ProfileHeader';
import { usePostsByAuthor } from '@/components/profile/usePostsByAuthor';
import { useProfileCounts } from '@/components/profile/useProfileCounts';
import { useProfileVideos, VideoGridRow } from '@/components/profile/VideoGrid';
import {
  RECORD_VIDEO_ROUTE,
  SHOW_PROFILE_VIDEOS,
  useVideosVersion,
  VIDEO_COPY,
  type ProfileVideo,
} from '@/components/profile/videosSource';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll, type ChromeTab } from '@/components/ScrollChrome';
import { TabStrip, type TabStripItem } from '@/components/TabStrip';
import { EmptyState, Hold, Notice } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount, TOTAL } from '@/data';
import { rankTitle } from '@/lib/milestones';
import { shareProfile } from '@/lib/profileLink';
import { fetchProfiles, isRenderablePost } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/* ==================================================================== */
/* A profile: yours, or anyone's                                        */
/*                                                                      */
/* ONE BODY FOR BOTH. Your own profile shows what other people see when  */
/* they open it, with your controls in place of theirs: Edit and Share   */
/* where they have Follow, Settings where they have the account menu.    */
/* Your private collection is not here; it is the Dex tab, one tap away  */
/* from the Dex section below. Two screens drawn two ways had drifted    */
/* into two designs (a grid on yours, full post cards on theirs).        */
/*                                                                      */
/* ONE LIST, ONE COLUMN. Posts are 3-up tiles, reels 3-up portrait       */
/* tiles, Dex cards 2-up. FlatList's numColumns cannot change on a       */
/* mounted list, so each section hands the list pre-chunked rows and the */
/* list itself never has more than one column. The header and the tab  */
/* strip are the list's header, so they scroll away with it; a sticky    */
/* strip would mean splitting the header into rows, which our post       */
/* counts do not justify.                                                */
/*                                                                      */
/* TWO MATERIALS. You read a profile on paper (the head, the grid) and   */
/* its drinks sit in the cabinet's lining: the Dex tab's rows of mounted */
/* cards, which run on lining to the end of the list.                    */
/*                                                                      */
/* Each section says what an empty list means: still loading (a Hold),  */
/* could not load (Try again), or nothing there yet. A failed refetch    */
/* over rows already shown keeps them and says so above them.           */
/*                                                                      */
/* THE DEX PLAQUE (v3.3 Brass D13). Between the buttons and the strip,  */
/* walnut with a brass gauge: this person's Dex count, never the posts  */
/* count (the mock's 64 against a Dex of 38, fix 10). Yours is your     */
/* collection; a peer's is the drinks their Dex tab shows, from the     */
/* posts already fetched, so it costs no request of its own.            */
/* ==================================================================== */

type Section = 'posts' | 'videos' | 'dex';

type Row =
  | { key: string; kind: 'posts'; posts: Post[] }
  | { key: string; kind: 'videos'; videos: ProfileVideo[] }
  | { key: string; kind: 'dexSummary' }
  | { key: string; kind: 'dex'; entries: SharedDrink[]; last: boolean }
  | { key: string; kind: 'state'; state: 'loading' | 'empty' | 'error' }
  | { key: string; kind: 'note'; text: string }
  | { key: string; kind: 'notice' };

/*
 * Reels appear only while the feature's flag is on. Off, a profile has
 * two sections and the strip draws two tabs, not a third that leads to
 * nothing.
 *
 * Words, not glyphs: three outline icons (a grid, a clapper, a glass) were
 * Instagram's strip with Sipply's names spoken under them, and "Dex" says
 * what the tab is where a glass did not.
 */
const SECTIONS: readonly TabStripItem<Section>[] = [
  { key: 'posts', label: 'Posts' },
  ...(SHOW_PROFILE_VIDEOS ? [{ key: 'videos' as const, label: VIDEO_COPY.label }] : []),
  { key: 'dex', label: 'Dex' },
];

/*
 * The list's onScroll: the rule signal alone, or the tab's native event
 * (typed `(...args: unknown[]) => void`, which this accepts as it is).
 */
type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

/*
 * Your own profile is a tab, so its list is that tab's scroll source
 * (ScrollChrome): scrolling down compacts the tab bar, and the top bar's
 * rule signal rides along as the source's listener. Someone else's is
 * pushed on the root stack, outside the ScrollChromeProvider, and keeps
 * the rule signal alone. A component rather than a branch in ProfileView,
 * because a hook cannot be called conditionally, and useTabScroll throws
 * with no provider above it.
 */
function TabScroll({
  tab,
  listener,
  children,
}: {
  tab: ChromeTab;
  listener: ScrollHandler;
  children: (onScroll: ScrollHandler) => ReactElement;
}) {
  const { onScroll } = useTabScroll(tab, listener);
  return children(onScroll);
}

/** "1.8%", "under 0.1%" or "0%": the plaque's printed share, for its spoken label. */
function sharePhrase(count: number): string {
  if (count <= 0) return '0%';
  const p = (count / TOTAL) * 100;
  return p < 0.1 ? 'under 0.1%' : `${p.toFixed(1)}%`;
}

/*
 * The plaque as ONE VoiceOver element, said the way it reads. Its parts
 * speak "in your Dex" on their own, which is wrong on someone else's
 * profile, where the drinks are the ones they have shared; one label over
 * the whole says whose it is, and is one swipe instead of three.
 */
function plaqueLabel(count: number, isOwn: boolean, name: string): string {
  const whose = isOwn ? 'Your Dex' : `${name}'s Dex, from the drinks they have shared`;
  const next = count > 0 ? rungCounts(TOTAL).find((r) => r.count > count) : undefined;
  const ahead = next
    ? ` ${formatCount(next.count - count)} more to ${next.title}, at ${formatCount(next.count)}.`
    : '';
  return `${whose}: ${formatCount(count)} of ${formatCount(TOTAL)}, ${sharePhrase(count)}. Rank: ${rankTitle(count, TOTAL)}.${ahead}`;
}

/** What a section's rows are, from what its fetch has said so far. */
function sectionRows<T>(
  section: Section,
  status: 'loading' | 'ready' | 'error',
  items: readonly T[],
  toRows: (items: readonly T[]) => Row[],
): Row[] {
  if (items.length === 0) {
    const state = status === 'ready' ? 'empty' : status;
    return [{ key: `${section}:state`, kind: 'state', state }];
  }
  /*
   * Held rows and a failed refetch: keep the rows (they are still true as
   * far as anyone knows) and put the failure above them, because a pull
   * that stops spinning with nothing changed reads as "nothing new".
   */
  const notice: Row[] = status === 'error' ? [{ key: `${section}:notice`, kind: 'notice' }] : [];
  return [...notice, ...toRows(items)];
}

export function ProfileView({
  person,
  isOwn,
  left,
  right,
  onBack,
  onBlocked,
  bottomInset,
  chromeTab,
}: {
  person: UserProfile;
  isOwn: boolean;
  /** Your profile's left control (Post a drink). Someone else's gets Back from `onBack`. */
  left?: ReactNode;
  /** Settings on yours, the account menu on theirs. */
  right?: ReactNode;
  onBack?: () => void;
  /** Someone else's profile: they were blocked from a screen pushed over this one. */
  onBlocked?: () => void;
  /** Clears the floating tab bar on yours, the home indicator on theirs. */
  bottomInset: number;
  /**
   * The tab this profile is the main list of (yours: 'profile'), so its
   * scroll drives the tab bar. Left off for a pushed profile, which has no
   * tab bar to drive and no ScrollChromeProvider above it.
   */
  chromeTab?: ChromeTab;
}) {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const [scrolled, onScroll] = useScrolledPast();

  /*
   * Tapping the Profile tab while on it returns the list to the top. Only
   * your own profile is inside the tabs; someone else's is pushed on the
   * root stack, where this finds no tab navigator and does nothing.
   */
  const listRef = useRef<Animated.FlatList<Row>>(null);
  useScrollToTop(listRef);

  const [section, setSection] = useState<Section>('posts');
  // Reels are fetched the first time their tab opens, not on every visit.
  const [videosOpened, setVideosOpened] = useState(false);

  /*
   * Your grid is fetched separately from the feed, so it has to be told
   * when one of your posts changes. The store bumps postsVersion on every
   * write to your posts: a new post, another photo on an existing one, a
   * removal. Someone else's posts change only when you pull.
   */
  const postsVersion = useSocial((s) => s.postsVersion);
  const posts = usePostsByAuthor(person.id, myId, isOwn ? String(postsVersion) : '');
  const counts = useProfileCounts(person.id, myId);
  const videosVersion = useVideosVersion();
  const videos = useProfileVideos(
    person.id,
    myId,
    SHOW_PROFILE_VIDEOS && videosOpened,
    String(videosVersion),
  );

  const followingIds = useSocial((s) => s.following);
  const loadingFeed = useSocial((s) => s.loadingFeed);
  const feedError = useSocial((s) => s.feedError);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const iFollow = followingIds.includes(person.id);

  /*
   * Blocked from a screen pushed over this one (a post's menu, a reel's).
   * Those screens drop the person from the stores and go back, which lands
   * here, on the profile of someone just blocked, still showing their
   * grid: a block that reads as not having worked. So on every return to
   * someone else's profile, ask whether the account can still be seen.
   * RLS answers a block, either way, and a deleted account alike: no row.
   * One small request per return; a failure (offline) leaves things be.
   */
  const focusCount = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCount.current += 1;
      if (isOwn || !onBlocked || focusCount.current === 1) return;
      let alive = true;
      fetchProfiles([person.id])
        .then((found) => {
          if (alive && !Object.prototype.hasOwnProperty.call(found, person.id)) onBlocked();
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [isOwn, onBlocked, person.id]),
  );

  /* ---- Header figures ---- */

  /*
   * The server's count, which the grid (one page of a hundred) can fall
   * short of; without it, the list's length once it has answered; before
   * either, a dash rather than a confident 0.
   */
  const postsCount = posts.total ?? (posts.status === 'ready' ? posts.posts.length : null);

  /*
   * Someone else's followers move by one the moment you follow or unfollow
   * them, though the server's count only changes on the next fetch:
   * compare your follow state now with what it was when they were counted.
   */
  const followers =
    counts.followers === null || isOwn || counts.followedAtCount === null
      ? counts.followers
      : Math.max(
          0,
          counts.followers +
            (iFollow === counts.followedAtCount ? 0 : iFollow ? 1 : -1),
        );

  /*
   * Your own following is the store's list, which every follow and
   * unfollow updates at once. While the store cannot vouch for an empty
   * list (the feed is still loading, or failed), the server's count
   * stands in: a confident 0 there would be wrong for anyone who follows
   * people.
   */
  const following = isOwn
    ? followingIds.length === 0 && (loadingFeed || feedError)
      ? counts.following
      : followingIds.length
    : counts.following;

  /* ---- Actions ---- */

  const openList = (list: 'followers' | 'following') =>
    router.navigate({ pathname: '/connections/[id]', params: { id: person.id, list } });

  /*
   * Unfollowing from the profile asks first: on the screen whose main
   * control it is, an accidental unfollow is silent and costly. Rows in a
   * list of people toggle straight away; they are bulk tools.
   */
  const confirmUnfollow = () => {
    if (!myId) return;
    const title = `Unfollow @${person.username}?`;
    const unfollow = () => {
      // Only if it is still a follow: the sheet can outlive a change made elsewhere.
      if (useSocial.getState().following.includes(person.id)) void toggleFollow(myId, person.id);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: ['Unfollow', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (i) => {
          if (i === 0) unfollow();
        },
      );
      return;
    }
    Alert.alert(title, undefined, [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Unfollow', style: 'destructive' as const, onPress: unfollow },
    ]);
  };

  const actions: ProfileActions = isOwn
    ? {
        kind: 'own',
        onEdit: () => router.push('/edit-profile'),
        onShare: () => shareProfile(person),
      }
    : {
        kind: 'peer',
        following: iFollow,
        followsMe: counts.followsMe,
        onFollow: () => {
          if (myId && !useSocial.getState().following.includes(person.id)) {
            void toggleFollow(myId, person.id);
          }
        },
        onUnfollow: confirmUnfollow,
      };

  const selectSection = (next: Section) => {
    if (next === 'videos') setVideosOpened(true);
    setSection(next);
  };

  /* ---- Rows ---- */

  // Every list of posts drops the ones PostCard would draw as nothing.
  const shown = posts.posts.filter(isRenderablePost);
  const pageOnly = posts.total !== null && posts.total > posts.posts.length;
  // The Dex tab's entries, worked out once for its rows and the plaque.
  const shared = sharedByDexNumber(shown);

  /*
   * The plaque's Dex numbers. Yours are always known (the collection is
   * on this phone, read before the splash lifts). A peer's are known once
   * their posts have answered, or rows are held over a failed refetch;
   * before that there is no plaque, rather than a 0 that then jumps.
   */
  const collectedNumbers = useCollectedNumbers();
  const peerKnown = posts.status === 'ready' || shown.length > 0;
  const plaqueNumbers = isOwn ? collectedNumbers : peerKnown ? sharedNumbers(shared) : null;

  const rows: Row[] =
    section === 'posts'
      ? sectionRows('posts', posts.status, shown, (items) => [
          ...chunk(items, 3).map(
            (r): Row => ({ key: `posts:${r[0]!.id}`, kind: 'posts', posts: r }),
          ),
          ...(pageOnly && posts.total !== null
            ? [
                {
                  key: 'posts:note',
                  kind: 'note' as const,
                  text: `Showing the latest ${formatCount(posts.posts.length)} of ${formatCount(posts.total)} posts.`,
                },
              ]
            : []),
        ])
      : section === 'videos'
        ? sectionRows('videos', videos.status, videos.videos, (items) =>
            chunk(items, 3).map(
              (r): Row => ({ key: `videos:${r[0]!.id}`, kind: 'videos', videos: r }),
            ),
          )
        : sectionRows('dex', posts.status, shared, (items) => {
            const pairs = chunk(items, 2);
            return [
              { key: 'dex:summary', kind: 'dexSummary' },
              ...pairs.map(
                (r, i): Row => ({
                  key: `dex:${r[0]!.drink.id}`,
                  kind: 'dex',
                  entries: r,
                  last: i === pairs.length - 1,
                }),
              ),
            ];
          });
  // The Dex tab's rows are lining; the list's foot carries it under the tab bar.
  const liningFoot = rows.some((r) => r.kind === 'dex');

  const reloadSection = section === 'videos' ? videos.reload : posts.reload;

  const renderState = (state: 'loading' | 'empty' | 'error') => {
    if (state === 'loading') {
      return (
        <Hold
          fill={false}
          slowMessage={
            section === 'videos'
              ? VIDEO_COPY.loadingSlow
              : section === 'dex'
                ? 'Still loading this Dex.'
                : 'Still loading posts.'
          }
        />
      );
    }
    if (state === 'error') {
      return (
        <EmptyState
          icon="alert"
          title={
            section === 'videos'
              ? VIDEO_COPY.profileErrorTitle
              : section === 'dex'
                ? 'Could not load this Dex'
                : 'Could not load posts'
          }
          body="Check your connection and try again."
          action={{ label: 'Try again', onPress: reloadSection }}
          actionVariant="secondary"
        />
      );
    }
    /*
     * Empty. On someone else's profile there is no action: the next step
     * is the Follow already in the header, so a second button would be a
     * second control for one decision.
     */
    const u = `@${person.username}`;
    if (section === 'videos') {
      return isOwn ? (
        <EmptyState
          icon="reels"
          title={VIDEO_COPY.emptyTitle}
          body={VIDEO_COPY.profileEmptyOwnBody}
          action={{ label: VIDEO_COPY.record, onPress: () => router.push(RECORD_VIDEO_ROUTE) }}
        />
      ) : (
        <EmptyState icon="reels" title={VIDEO_COPY.emptyTitle} body={VIDEO_COPY.profileEmptyPeerBody} />
      );
    }
    if (section === 'dex') {
      return isOwn ? (
        <EmptyState
          icon="dex"
          title="Nothing shared yet"
          body="Drinks you share land here in Dex order."
          action={{ label: 'Post a drink', onPress: () => router.navigate('/log') }}
        />
      ) : (
        <EmptyState
          icon="dex"
          title="Nothing in their Dex yet"
          body={`Drinks ${u} shares land here in Dex order.`}
        />
      );
    }
    /*
     * "Drinks you share", not "every drink you add": Save to Dex collects
     * without posting, so that promise would be false for anyone who has
     * used it.
     */
    return isOwn ? (
      /*
       * A real drink, mounted, where a first post will go: the screen that
       * should sell the habit showed a bare camera glyph.
       */
      <EmptyState
        art={<EmptyArt drinkId="negroni" />}
        title="Post your first drink"
        body="Drinks you share show up here."
        action={{ label: 'Post a drink', onPress: () => router.navigate('/log') }}
      />
    ) : (
      <EmptyState icon="camera" title="No posts yet" body={`${u} hasn't posted a drink yet.`} />
    );
  };

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'posts':
        return <PostGridRow posts={item.posts} />;
      case 'videos':
        return <VideoGridRow videos={item.videos} />;
      case 'dexSummary':
        return <DexSummary posts={shown} isOwn={isOwn} pageOnly={pageOnly} />;
      case 'dex':
        return <DexShelfRow entries={item.entries} last={item.last} />;
      case 'note':
        return <Text style={styles.note}>{item.text}</Text>;
      case 'notice':
        return (
          <Notice tone="error" style={styles.notice}>
            Could not refresh. Pull down to try again.
          </Notice>
        );
      case 'state':
        return renderState(item.state);
    }
  };

  /*
   * A pull reloads everything the screen shows: the posts (which the Dex
   * section is drawn from), the counts, and the reels once they have been
   * opened. The posts are the spinner; the others show their own states.
   */
  const onRefresh = () => {
    posts.reload();
    counts.reload();
    if (videosOpened) videos.reload();
  };

  /*
   * The strip sits 12pt under the plaque's paper line (the mock's 10, on
   * the scale), and keeps its 16pt below the actions while a peer's Dex
   * is unknown: the line already carries air of its own, the buttons none.
   */
  const header = (
    <>
      <ProfileHeader
        person={person}
        posts={postsCount}
        followers={followers}
        following={following}
        onOpenList={openList}
        actions={actions}
      />
      {plaqueNumbers ? (
        <View
          accessible
          accessibilityLabel={plaqueLabel(plaqueNumbers.length, isOwn, person.displayName)}
          style={styles.plaque}>
          <DexPlaque caught={plaqueNumbers} total={TOTAL} />
        </View>
      ) : null}
      <TabStrip
        items={SECTIONS}
        value={section}
        onChange={selectSection}
        style={plaqueNumbers ? styles.tabsUnderPlaque : styles.tabs}
      />
    </>
  );

  const list = (scrollHandler: ScrollHandler) => (
    <Animated.FlatList
      ref={listRef}
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      ListHeaderComponent={header}
      /*
       * Under the Dex tab's rows the lining runs on to the end: past the
       * tab bar's clearance, and down to the screen's foot when a short
       * Dex leaves room, rather than stopping at the last card's ledge.
       */
      ListFooterComponent={
        liningFoot ? (
          <View style={[styles.liningFoot, { minHeight: bottomInset }]}>
            <Grain tone="lining" />
          </View>
        ) : null
      }
      ListFooterComponentStyle={liningFoot ? styles.grow : undefined}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      refreshing={posts.reloading || (section === 'videos' && videos.reloading)}
      onRefresh={onRefresh}
      /*
       * A row of tiles is a third of a screen tall, so six rows cover
       * the first screen. Five screens mounted, not seven: each row of
       * tiles holds about 2.3 MB of decoded photos, and the two screens
       * dropped are about 13 rows, 30 MB (specs/v3-cabinet.md section
       * 11). No removeClippedSubviews, which can blank a whole list on
       * iOS (specs/06).
       */
      initialNumToRender={6}
      windowSize={5}
      // Transparent, so the screen's grain shows through between tiles.
      style={styles.list}
      contentContainerStyle={liningFoot ? styles.grow : { paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
    />
  );

  return (
    <View style={styles.screen}>
      <Grain />
      {/*
        The bare username, centred: no @, no lock and no chevron, because
        there is no account switcher for a chevron to promise. The display
        name is in the header below.
      */}
      <ScreenTopBar
        size="lg"
        title={person.username}
        left={
          left ??
          (onBack ? <TopBarButton icon="chevronLeft" label="Back" onPress={onBack} /> : undefined)
        }
        right={right}
        showRule={scrolled}
      />
      {chromeTab ? (
        <TabScroll tab={chromeTab} listener={onScroll}>
          {list}
        </TabScroll>
      ) : (
        list(onScroll)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  // In the header's gutters, 12pt under the buttons (the mock's spacing).
  plaque: { marginHorizontal: layout.gutter, marginTop: space.md },
  // Full width, outside the gutters: the rule runs edge to edge under the header.
  tabs: { marginTop: space.lg },
  tabsUnderPlaque: { marginTop: space.md },
  liningFoot: { flexGrow: 1, backgroundColor: colors.lining },
  grow: { flexGrow: 1 },
  note: {
    ...textRole.helper,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },
  notice: { marginHorizontal: layout.gutter, marginTop: space.md, marginBottom: space.sm },
});
