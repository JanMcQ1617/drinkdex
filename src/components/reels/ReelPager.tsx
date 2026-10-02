import { setVideoCacheSizeAsync } from 'expo-video';
import { useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type RefreshControlProps,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';

import { ReelCell } from '@/components/reels/ReelCell';
import { useAppActive } from '@/components/reels/ReelVideo';
import { colors } from '@/constants/theme';
import type { Reel } from '@/lib/reels';
import type { UserProfile } from '@/types';

/*
 * expo-video's disk cache for the reels, sized once per session before the
 * first player exists: the setting persists, and it may only be changed
 * while no player is alive, so a refusal (the review screen's player, say)
 * is ignored. Every pager waits for this one answer before mounting a
 * player, which costs a single native round trip on the first open.
 */
const VIDEO_CACHE_BYTES = 256 * 1024 * 1024;
let videoCacheSized = false;
let videoCacheSizing: Promise<void> | null = null;

function sizeVideoCache(): Promise<void> {
  videoCacheSizing ??= setVideoCacheSizeAsync(VIDEO_CACHE_BYTES)
    .catch(() => {})
    .then(() => {
      videoCacheSized = true;
    });
  return videoCacheSizing;
}

/** A page counts as the one on screen once this much of it shows. */
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/** Another page is asked for when the one on screen is this close to the end. */
const NEAR_END = 3;

/*
 * The page after the last reel (the end of the feed, a retry, a spinner),
 * as one more item of the list rather than a ListFooterComponent. A footer
 * is invisible to viewability: with it on screen no item is viewable, the
 * last reel stayed the page "on screen", and it went on playing, sound and
 * all, under "You're all caught up". As an item it becomes the active
 * page like any other, so every reel above it rests. The id cannot meet a
 * reel's, which is a uuid.
 */
const END_PAGE = { id: 'end-page' } as const;
type PagerItem = Reel | typeof END_PAGE;
const isEndPage = (item: PagerItem): item is typeof END_PAGE => item === END_PAGE;

export type ReelPagerHandle = {
  /**
   * The tab's re-tap: back to the first reel, or, already there, `onTopAgain`
   * (the feed refreshes). Named for useScrollToTop, which calls it.
   */
  scrollToTop: () => void;
};

export type ReelPagerProps = {
  reels: Reel[];
  authors: Record<string, UserProfile>;
  initialIndex?: number;
  /** Space kept clear at the foot of every page (tab bar, home indicator). */
  bottomInset: number;
  /** Fired when the page on screen is within three of the end. */
  onNearEnd?: () => void;
  onRemoved?: (reelId: string) => void;
  onAuthorBlocked?: (authorId: string) => void;
  /** The page on screen changed; `reels.length` when it is the footer's page. */
  onActiveChange?: (index: number) => void;
  /** The tab was tapped again while the first reel was already on screen. */
  onTopAgain?: () => void;
  /** One more full page after the last reel: the end, a retry, or a spinner. */
  footer?: React.ReactElement | null;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  ref?: React.Ref<ReelPagerHandle>;
};

/**
 * Reels, one to a screen, paged vertically. The Reels tab and the author
 * pager (/reel/[id]) both draw this.
 *
 * PLAYERS ONLY NEAR THE PAGE ON SCREEN. A cell mounts its player when it
 * is the page on screen or right beside it, and unmounts it otherwise: at
 * most three AVPlayers, the next one already buffered when you swipe, and
 * none at all while the screen is out of focus (another tab, a pushed
 * profile), which is also what stops a hidden reel from playing sound.
 * Posters stay painted throughout, so a page is never blank on arrival.
 *
 * Windowing keeps the mounted cells to a handful. There is deliberately
 * no removeClippedSubviews: on iOS Fabric it can leave a list blank
 * (specs/06, rule 5).
 *
 * Renders nothing until it has measured itself: every page is exactly its
 * own height, which is what paging snaps to.
 */
export function ReelPager({
  reels,
  authors,
  initialIndex = 0,
  bottomInset,
  onNearEnd,
  onRemoved,
  onAuthorBlocked,
  onActiveChange,
  onTopAgain,
  footer,
  refreshControl,
  ref,
}: ReelPagerProps) {
  const [pageH, setPageH] = useState(0);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [cacheReady, setCacheReady] = useState(videoCacheSized);
  const listRef = useRef<FlatList<PagerItem>>(null);
  const focused = useIsFocused();
  const appActive = useAppActive();

  // The footer is a page of its own (END_PAGE), one past the last reel.
  const items: PagerItem[] = footer ? [...reels, END_PAGE] : reels;
  // A delete or a report can shorten the list under the page on screen.
  const active = Math.min(activeIndex, Math.max(0, items.length - 1));

  /*
   * Your own new reel arriving at the top (posted from the recorder while
   * this list sat further down) brings the list back up to it, so posting
   * lands on what you posted rather than on whichever reel slid into the
   * place you left. Only a first reel that is yours AND newer than the one
   * it displaced: a block or a delete that leaves an older reel of yours
   * first moves nothing.
   */
  const first = reels[0];
  const lastFirst = useRef(first);
  useEffect(() => {
    const before = lastFirst.current;
    lastFirst.current = first;
    if (!first?.mine || first.id === before?.id) return;
    if (before && !(Date.parse(first.createdAt) > Date.parse(before.createdAt))) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [first]);

  useEffect(() => {
    if (cacheReady) return;
    let alive = true;
    void sizeVideoCache().then(() => {
      if (alive) setCacheReady(true);
    });
    return () => {
      alive = false;
    };
  }, [cacheReady]);

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (reels.length > 0 && active >= reels.length - NEAR_END) onNearEnd?.();
  }, [active, reels.length, onNearEnd]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        if (active > 0) listRef.current?.scrollToOffset({ offset: 0, animated: true });
        else onTopAgain?.();
      },
    }),
    [active, onTopAgain],
  );

  // Stable for the list's lifetime: FlatList keeps the first one it is given.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<PagerItem>[] }) => {
    const shown = viewableItems.find((v) => v.isViewable && v.index != null);
    if (shown?.index != null) setActiveIndex(shown.index);
  }, []);

  // Reels only: VoiceOver's swipes go from reel to reel, never onto the end page.
  const step = (delta: 1 | -1) => {
    const to = Math.min(active, reels.length) + delta;
    if (to < 0 || to >= reels.length) return;
    listRef.current?.scrollToIndex({ index: to, animated: true });
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setPageH((prev) => (prev === h ? prev : h));
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<PagerItem>) =>
    isEndPage(item) ? (
      <View style={{ height: pageH }}>{footer}</View>
    ) : (
      <ReelCell
        reel={item}
        author={authors[item.authorId]}
        height={pageH}
        bottomInset={bottomInset}
        current={focused && index === active}
        appActive={appActive}
        loadVideo={focused && cacheReady && Math.abs(index - active) <= 1}
        index={index}
        count={reels.length}
        onStep={step}
        onRemoved={onRemoved}
        onAuthorBlocked={onAuthorBlocked}
      />
    );

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {pageH > 0 ? (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          extraData={{ active, focused, appActive, cacheReady, authors, bottomInset, pageH, footer }}
          pagingEnabled
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          getItemLayout={(_, i) => ({ length: pageH, offset: pageH * i, index: i })}
          initialScrollIndex={reels.length > 0 ? Math.min(initialIndex, reels.length - 1) : undefined}
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          refreshControl={refreshControl}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.reelGround },
});
