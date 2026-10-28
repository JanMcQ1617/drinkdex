import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useRef, useState, type ReactElement } from 'react';
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

import { EmptyArt } from '@/components/DexCard';
import { EndMark } from '@/components/details/DoodleMarks';
import { Paper } from '@/components/details/Paper';
import { chunk, PostGridRow } from '@/components/profile/PostGrid';
import { ProfileHeader, type ProfileActions } from '@/components/profile/ProfileHeader';
import { AboutSheet } from '@/components/profile/AboutSheet';
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
import { ActionSheet, type SheetAction } from '@/components/Sheet';
import { TabStrip, type TabStripItem } from '@/components/TabStrip';
import { EmptyState, Hold, Notice } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { catalogueCount } from '@/lib/cabinet';
import { fetchProfiles, isRenderablePost } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/* ==================================================================== */
/* A profile: yours, or anyone's                                        */
/*                                                                      */
/* v4, less stuff (layout spec 5.5; 50 elements down to 31 at rest).    */
/* Yours: the handle as the tab root's title with one ••• beside it,    */
/* the face, name and one line of bio, the counts on one line, ONE key  */
/* (Edit profile), "38 entries in your Dex ›", then your posts as a     */
/* grid of plain square prints (the Tournaments line went to its own    */
/* tab in v4.7). Theirs (pushed): back in the bar, the same body with   */
/* Follow in the key's slot and their ••• beside it.                    */
/*                                                                      */
/* What went, and where (nothing is lost, it just isn't on screen):     */
/*   the gear               ••• › Settings                              */
/*   Share profile          ••• › Share profile                         */
/*   the Dex panel, ruler,  "38 entries in your Dex ›" opens Dex        */
/*   rank and ladder        progress (/stats), the Dex tab's count's    */
/*                          page, with the same figure                  */
/*   Posts | Dex strip      the grid is the posts; your caught drinks   */
/*                          are on Dex progress › See your 38           */
/*   plates on the grid     the post, and the drink page                */
/*   the bio's 2nd line     ••• › About, and Edit profile               */
/*                                                                      */
/* A peer's Dex line is not drawn. Their collection lives on their      */
/* phone and never reaches the server, so the only honest figure is    */
/* the drinks they have posted, one post per drink (migration 007):     */
/* the posts count, already on screen (layout principle 7).             */
/*                                                                      */
/* ONE LIST, ONE COLUMN. Posts are 3-up rows handed to a one-column     */
/* FlatList, with the header as its header, so everything scrolls as    */
/* one. While Reels are flagged on, a Posts | Reels strip sits under    */
/* the header (FlatList's numColumns cannot change on a mounted list,   */
/* so each section hands the list pre-chunked rows).                    */
/*                                                                      */
/* Each section says what an empty list means: still loading (a Hold),  */
/* could not load (Try again), or nothing there yet. A failed refetch   */
/* over rows already shown keeps them and says so above them.           */
/*                                                                      */
/* THE PAPER, AND THE PEN'S SIGNATURE (v4.9, specs/v4.9/details/spec.md */
/* A.5 and C.8). Yours is a tab root, a page ground: the paper (the     */
/* sweep since v4.10, white to 40% of the window, then easing to        */
/* #FBFBFB at the foot; specs/v4.10/spec.md G) is the root's first      */
/* child, and the bar's through ScreenTopBar's `paper`, so the two meet */
/* as one sheet. Theirs is pushed and stays the plain white. Your bar's */
/* title is your handle, typed by you, so it is set in Archivo, not the */
/* marker (`userTitle`, specs/v4.10/spec.md T.6): a handle must be read */
/* exactly. Your grid is signed where it stops: the twist and the swash */
/* under it (details/DoodleMarks' EndMark), right-aligned on the gutter */
/* 18 under the last prints, then "Showing the latest N of M" when the  */
/* grid is one page of more. Both are the list's footer, one static     */
/* node and never a cell. No posts yet: yours opts in to the twist's    */
/* composition round the Negroni print, staying at the top (the header  */
/* already fills it), and with no arrow, because its key posts a drink  */
/* and no mark ever points at one (App Store 1.4.3); theirs, the twist  */
/* and a coupe over the camera. The grid's prints get no corners: they  */
/* are keys.                                                            */
/* ==================================================================== */

type Section = 'posts' | 'videos';

type Row =
  | { key: string; kind: 'posts'; posts: Post[] }
  | { key: string; kind: 'videos'; videos: ProfileVideo[] }
  | { key: string; kind: 'state'; state: 'loading' | 'empty' | 'error' }
  | { key: string; kind: 'notice' };

/* Only while Reels are on; off, there is one section and no strip at all. */
const SECTIONS: readonly TabStripItem<Section>[] = [
  { key: 'posts', label: 'Posts' },
  { key: 'videos', label: VIDEO_COPY.label },
];

/*
 * The list's onScroll: the rule signal alone, or the tab's native event
 * (typed `(...args: unknown[]) => void`, which this accepts as it is).
 */
type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

/*
 * Your own profile is a tab, so its list is that tab's scroll source
 * (ScrollChrome), and the top bar's rule signal rides along as the
 * source's listener. Someone else's is pushed on the root stack, outside
 * the ScrollChromeProvider, and keeps the rule signal alone. A component
 * rather than a branch in ProfileView, because a hook cannot be called
 * conditionally, and useTabScroll throws with no provider above it.
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

/**
 * Every catalogue drink in your collection: the figure the Dex tab's count
 * and Dex progress show, so "38 entries in your Dex" opens a page that says
 * 38 too. catalogueCount skips an id this build no longer has.
 *
 * The count is the selector, not the map: a pour's photo or note changing
 * leaves the number as it was, so the whole profile list does not
 * re-render for it (the Dex tab subscribes the same way).
 */
function useDexCount(): number {
  return useCollection((s) => catalogueCount(s.unlocks));
}

export function ProfileView({
  person,
  isOwn,
  menu,
  menuHeader,
  onBack,
  onBlocked,
  bottomInset,
  chromeTab,
}: {
  person: UserProfile;
  isOwn: boolean;
  /**
   * The ••• sheet's rows. Handed the About row, so each caller places it:
   * yours ends with it (Share, Settings, About), theirs keeps
   * it beside Share, above Report and Block. Absent: no ••• (signed out).
   */
  menu?: (about: SheetAction) => SheetAction[];
  /** The sheet's small header line (theirs: the display name). */
  menuHeader?: string;
  /** Someone else's profile: the bar's back chevron. */
  onBack?: () => void;
  /** Someone else's profile: they were blocked from a screen pushed over this one. */
  onBlocked?: () => void;
  /** Clears the tab bar on yours, the home indicator on theirs. */
  bottomInset: number;
  /**
   * The tab this profile is the main list of (yours: 'profile'). Left off
   * for a pushed profile, which has no ScrollChromeProvider above it.
   */
  chromeTab?: ChromeTab;
}) {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const [scrolled, onScroll] = useScrolledPast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

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
  const dexCount = useDexCount();

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
      : Math.max(0, counts.followers + (iFollow === counts.followedAtCount ? 0 : iFollow ? 1 : -1));

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

  const menuActions = menu ? menu({ label: 'About', onPress: () => setAboutOpen(true) }) : null;
  const openMenu = menuActions ? () => setMenuOpen(true) : undefined;

  const actions: ProfileActions = isOwn
    ? {
        kind: 'own',
        onEdit: () => router.push('/edit-profile'),
        dexCount,
        onOpenDex: () => router.push('/stats'),
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
        onMore: openMenu,
      };

  const selectSection = (next: Section) => {
    if (next === 'videos') setVideosOpened(true);
    setSection(next);
  };

  /* ---- Rows ---- */

  // Every list of posts drops the ones the post screen would draw as nothing.
  const shown = posts.posts.filter(isRenderablePost);
  const pageOnly = posts.total !== null && posts.total > posts.posts.length;

  const rows: Row[] =
    section === 'videos'
      ? sectionRows('videos', videos.status, videos.videos, (items) =>
          chunk(items, 3).map((r): Row => ({ key: `videos:${r[0]!.id}`, kind: 'videos', videos: r })),
        )
      : sectionRows('posts', posts.status, shown, (items) =>
          chunk(items, 3).map((r): Row => ({ key: `posts:${r[0]!.id}`, kind: 'posts', posts: r })),
        );

  /*
   * Under the grid of posts, the list's footer: on yours, its end signed
   * (the twist, v4.9 C.10), then the note that the grid is one page of
   * more, when it is. Never under the reels, the hold, a failure or an
   * empty state.
   */
  const gridShown = section === 'posts' && shown.length > 0;
  const footer = gridShown ? (
    <>
      {isOwn ? <EndMark name="twist" style={styles.end} /> : null}
      {pageOnly && posts.total !== null ? (
        <Text style={styles.note}>
          {`Showing the latest ${formatCount(posts.posts.length)} of ${formatCount(posts.total)} posts.`}
        </Text>
      ) : null}
    </>
  ) : null;

  const reloadSection = section === 'videos' ? videos.reload : posts.reload;

  const renderState = (state: 'loading' | 'empty' | 'error') => {
    if (state === 'loading') {
      return (
        <Hold
          fill={false}
          slowMessage={section === 'videos' ? VIDEO_COPY.loadingSlow : 'Still loading posts.'}
        />
      );
    }
    if (state === 'error') {
      return (
        <EmptyState
          icon="alert"
          title={section === 'videos' ? VIDEO_COPY.profileErrorTitle : 'Could not load posts'}
          body="Check your connection and try again."
          action={{ label: 'Try again', onPress: reloadSection }}
          actionVariant="secondary"
        />
      );
    }
    /*
     * Empty. On someone else's profile there is no action: the next step
     * is the Follow already in the header, so a second key would be a
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
    /*
     * "Drinks you share", not "every drink you add": Save to Dex collects
     * without posting, so that promise would be false for anyone who has
     * used it. A real drink's print where a first post will go: the
     * screen that should sell the habit showed a bare camera glyph.
     */
    return isOwn ? (
      <EmptyState
        art={<EmptyArt drinkId="negroni" />}
        title="Post your first drink"
        body="Drinks you share show up here."
        action={{ label: 'Post a drink', onPress: () => router.navigate('/log') }}
        // The twist's composition, top-placed, and never an arrow: this key posts a drink (v4.9 C.8).
        doodle="twist"
      />
    ) : (
      <EmptyState icon="camera" title="No posts yet" body={`${u} hasn't posted a drink yet.`} doodle="twist" />
    );
  };

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'posts':
        return <PostGridRow posts={item.posts} />;
      case 'videos':
        return <VideoGridRow videos={item.videos} />;
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
   * A pull reloads everything the screen shows: the posts, the counts, and
   * the reels once they have been opened. The posts are the spinner; the
   * others show their own states.
   */
  const onRefresh = () => {
    posts.reload();
    counts.reload();
    if (videosOpened) videos.reload();
  };

  /*
   * Under the header: 12 from the Dex line's 44pt row to the first row of
   * prints on yours, 24 from the key on theirs, where the key is the header's
   * last thing.
   */
  const header = (
    <View style={isOwn ? styles.headOwn : styles.headPeer}>
      <ProfileHeader
        person={person}
        posts={postsCount}
        followers={followers}
        following={following}
        onOpenList={openList}
        actions={actions}
      />
      {SHOW_PROFILE_VIDEOS ? (
        <TabStrip items={SECTIONS} value={section} onChange={selectSection} style={styles.tabs} />
      ) : null}
    </View>
  );

  const list = (scrollHandler: ScrollHandler) => (
    <Animated.FlatList
      ref={listRef}
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      refreshing={posts.reloading || (section === 'videos' && videos.reloading)}
      onRefresh={onRefresh}
      /*
       * A row of tiles is about a third of a screen's width tall, so six
       * rows cover the first screen. Five screens mounted: each row of
       * tiles holds decoded photos, and the screens dropped are the
       * memory saved (specs/v3-cabinet.md section 11). No
       * removeClippedSubviews, which can blank a whole list on iOS
       * (specs/06).
       */
      initialNumToRender={6}
      windowSize={5}
      style={styles.list}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
    />
  );

  return (
    <View style={styles.screen}>
      {/* Yours alone: a tab root's page ground (the header note). */}
      {isOwn ? <Paper /> : null}
      {/*
        The bare username: no @, no lock and no chevron, because there is
        no account switcher for a chevron to promise. Yours is a tab root,
        the title set left with the ••• at the far gutter; theirs is
        pushed, back and a centred title, its ••• in the body.
      */}
      {isOwn ? (
        <ScreenTopBar
          size="lg"
          title={person.username}
          userTitle
          right={
            openMenu ? <TopBarButton icon="more" label="Profile options" onPress={openMenu} /> : undefined
          }
          showRule={scrolled}
          paper
        />
      ) : (
        <ScreenTopBar
          title={person.username}
          left={onBack ? <TopBarButton icon="chevronLeft" label="Back" onPress={onBack} /> : undefined}
          showRule={scrolled}
        />
      )}
      {chromeTab ? (
        <TabScroll tab={chromeTab} listener={onScroll}>
          {list}
        </TabScroll>
      ) : (
        list(onScroll)
      )}
      {menuActions ? (
        <ActionSheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          header={menuHeader}
          actions={menuActions}
        />
      ) : null}
      <AboutSheet person={person} visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  // With PostGridRow's own 8 above each row: 12 on yours, 24 on theirs.
  headOwn: { paddingBottom: space.xs },
  headPeer: { paddingBottom: space.lg },
  // Full width, outside the gutters: the strip's rule runs edge to edge.
  tabs: { marginTop: space.md },
  note: {
    ...textRole.small,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },
  /* The signed end: 18 under the last prints, its box's right edge on the gutter, 9 over the note (v4.9 C.10). */
  end: { marginTop: 18, marginRight: layout.gutter, marginBottom: 9 },
  notice: { marginHorizontal: layout.gutter, marginTop: space.md, marginBottom: space.sm },
});
