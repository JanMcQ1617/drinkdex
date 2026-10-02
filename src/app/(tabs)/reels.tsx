import { setStatusBarStyle } from 'expo-status-bar';
import { Redirect, useFocusEffect, useIsFocused, useRouter, useScrollToTop } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Scrim, TOP_SCRIM } from '@/components/reels/ReelCell';
import { ReelPager, type ReelPagerHandle } from '@/components/reels/ReelPager';
import { EmptyState, Hold, MediaIconButton } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { COPY, REEL_STALE_MS, REELS_ENABLED } from '@/lib/reels';
import { useAuth } from '@/store/auth';
import { useReels } from '@/store/reels';

/* ==================================================================== */
/* The Reels tab                                                        */
/*                                                                      */
/* Everyone's reels, newest first, one to a screen. Signed out it is the */
/* sign-in screen, on paper, like Home and Profile; signed in it is the  */
/* app's one dark surface, and the tab bar goes dark with it            */
/* (FloatingTabBar).                                                    */
/*                                                                      */
/* While EXPO_PUBLIC_REELS is off the tab is not in the bar, and this    */
/* route sends anyone who reaches it some other way (a stale link, the  */
/* typed path) back to Home. The flag is off until Jan turns it on.      */
/* ==================================================================== */

export default function ReelsTab() {
  if (!REELS_ENABLED) return <Redirect href="/" />;
  return (
    <AuthGate>
      <ReelsFeed />
    </AuthGate>
  );
}

/** The header's height over the page: the title row and its margin, under the status bar. */
const HEADER_ROW = layout.hit;

function ReelsFeed() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const myId = useAuth((s) => s.session?.user.id);

  const feed = useReels((s) => s.feed);
  const authors = useReels((s) => s.authors);
  const status = useReels((s) => s.status);
  const next = useReels((s) => s.next);
  const refreshing = useReels((s) => s.refreshing);
  const moreError = useReels((s) => s.moreError);
  const loadedAt = useReels((s) => s.loadedAt);
  const load = useReels((s) => s.load);
  const loadMore = useReels((s) => s.loadMore);

  const pagerRef = useRef<ReelPagerHandle>(null);
  // Which reel is on screen, for the stale reload below. Not state: nothing draws from it.
  const activeRef = useRef(0);

  /*
   * Tapping the tab while on it goes back to the first reel; tapping it
   * again there refreshes (ReelPager's handle does both).
   */
  useScrollToTop(pagerRef);

  /*
   * Light status bar while this feed is on screen. In the gated feed, not
   * the route, so the signed-out sign-in screen keeps dark glyphs on paper.
   * A focus effect rather than a <StatusBar> element: tab screens stay
   * mounted when you leave them, and an element would keep winning there.
   */
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  /*
   * The first page loads on the first focus. After that the feed reloads
   * on a later focus only when it is over ten minutes old and you are at
   * the first reel: anywhere further down, swapping the list would yank
   * the reel you were watching away.
   */
  useEffect(() => {
    if (!focused || !myId) return;
    if (status === 'idle') {
      void load(myId);
      return;
    }
    if (status === 'ready' && loadedAt > 0 && Date.now() - loadedAt > REEL_STALE_MS && activeRef.current === 0) {
      void load(myId);
    }
  }, [focused, myId, status, loadedAt, load]);

  const reload = () => {
    if (myId) void load(myId);
  };
  /*
   * Not after a failed page: the end page's "Try again" asks for it then,
   * so a page that keeps failing is not re-requested on every render.
   */
  const more = () => {
    if (myId && !moreError) void loadMore(myId);
  };
  const retryMore = () => {
    if (myId) void loadMore(myId);
  };
  const record = () => router.push('/record');
  const pageInsets = { paddingTop: insets.top + HEADER_ROW, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE };

  let body: ReactNode;
  if (feed.length > 0) {
    /*
     * One page after the last reel: the end of the feed, a retry when the
     * next page failed, or a spinner while it is on its way (the request
     * normally lands three reels before you get there).
     */
    const footer = moreError ? (
      <View style={[styles.page, pageInsets]}>
        <EmptyState
          tone="dark"
          icon="alert"
          title={COPY.errorTitle}
          body={COPY.errorBody}
          action={{ label: 'Try again', onPress: retryMore }}
        />
      </View>
    ) : next === null ? (
      <View style={[styles.page, pageInsets]}>
        <EmptyState
          tone="dark"
          icon="check"
          title={COPY.endTitle}
          body={COPY.endBody}
          action={{ label: COPY.record, onPress: record }}
        />
      </View>
    ) : (
      <Hold tone="dark" slowMessage={COPY.loadingSlow} />
    );

    body = (
      <ReelPager
        ref={pagerRef}
        reels={feed}
        authors={authors}
        bottomInset={insets.bottom + TAB_BAR_CLEARANCE}
        onNearEnd={more}
        onActiveChange={(i) => {
          activeRef.current = i;
        }}
        onTopAgain={reload}
        footer={footer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.reelInk} />}
      />
    );
  } else if (status === 'error') {
    body = (
      <ScrollView
        contentContainerStyle={[styles.scrollPage, pageInsets]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.reelInk} />}>
        <EmptyState
          tone="dark"
          icon="alert"
          title={COPY.errorTitle}
          body={COPY.errorBody}
          action={{ label: 'Try again', onPress: reload }}
        />
      </ScrollView>
    );
  } else if (loadedAt === 0) {
    // Never loaded for this account yet: the first page is on its way.
    body = <Hold tone="dark" slowMessage={COPY.loadingSlow} />;
  } else {
    // Loaded, and nobody has posted. A pull looks again; the spinner is the pull's own.
    body = (
      <ScrollView
        contentContainerStyle={[styles.scrollPage, pageInsets]}
        refreshControl={
          <RefreshControl refreshing={status === 'loading'} onRefresh={reload} tintColor={colors.reelInk} />
        }>
        <EmptyState
          tone="dark"
          icon="reels"
          title={COPY.emptyTitle}
          body={COPY.emptyBody}
          action={{ label: COPY.record, onPress: record }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      {body}
      {/*
        The header floats over the reels rather than pushing them down:
        a reel is the full screen. Its scrim lets the title read over a
        white frame; touches pass through everywhere but the button.
      */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Scrim id="reelsHeader" stops={TOP_SCRIM} style={[styles.topScrim, { height: insets.top + 120 }]} />
        <View style={[styles.header, { top: insets.top + space.sm }]} pointerEvents="box-none">
          {/* The title takes no touches, so a swipe that starts on it still pages. */}
          <View style={styles.titleSlot} pointerEvents="none">
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4} numberOfLines={1}>
              {COPY.label}
            </Text>
          </View>
          <MediaIconButton icon="camera" label={COPY.record} onPress={record} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.reelGround },
  page: { flex: 1, justifyContent: 'center', backgroundColor: colors.reelGround },
  scrollPage: { flexGrow: 1, justifyContent: 'center' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0 },
  header: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    minHeight: HEADER_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  titleSlot: { flexShrink: 1 },
  title: {
    ...textRole.barTitleLg,
    color: colors.reelInk,
    textShadowColor: colors.reelTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
