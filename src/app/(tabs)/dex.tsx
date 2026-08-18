import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DexCard } from '@/components/DexCard';
import { GlassSurface } from '@/components/glass';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { Divider, EmptyState, haptic, PressableScale, ProgressBar } from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  fonts,
  motion,
  radius,
  space,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, DRINKS, TOTAL } from '@/data';
import { useCollection, useIsUnlocked } from '@/store/collection';
import type { Drink, DrinkCategory } from '@/types';

/* ------------------------------------------------------------------ */
/* Grid geometry                                                       */
/* ------------------------------------------------------------------ */

const COLUMNS = 3;
const GRID_PAD = space.lg;
const GRID_GAP = space.sm;

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

type RegionFilter = DrinkCategory | 'all';
type StatusFilter = 'all' | 'unlocked' | 'locked';

const STATUS_OPTIONS: { key: StatusFilter; label: string; a11y: string }[] = [
  { key: 'all', label: 'All', a11y: 'Show every entry' },
  { key: 'unlocked', label: 'Collected', a11y: 'Show only entries you have collected' },
  { key: 'locked', label: 'Not yet', a11y: 'Show only entries you have not collected' },
];

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function FilterChip({
  label,
  detail,
  selected,
  accent,
  wash,
  dot,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  /** Text and border once selected. Defaults to wine ink. */
  accent?: string;
  /** Fill once selected. Defaults to the wine wash. */
  wash?: string;
  /** Category swatch — carries the color the old chips got from an emoji. */
  dot?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const fg = selected ? (accent ?? colors.wine) : colors.textMuted;
  const activeFg = accent ?? colors.wine;
  const reduced = useReducedMotion();

  /*
   * The selected wash grows in behind the label and the border warms toward
   * the category colour on the same spring, so the chip reads as one thing
   * changing state rather than two properties flipping at different moments.
   * Border colour needs interpolateColor — a plain style swap would snap
   * while the fill was still animating, which looks like a bug.
   */
  const p = useDerivedValue(() =>
    // motion.selection, not motion.spring: these chips and the tab pill are
    // both selection affordances on this same screen, one tap apart. On the
    // general spring they settled in ~0.40s against the pill's ~0.23s, so the
    // same gesture got two different answers depending on where you tapped.
    reduced ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, motion.selection),
  );

  const washStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.9 + 0.1 * p.value }],
  }));
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(p.value, [0, 1], [colors.cardBorder, activeFg]),
  }));

  return (
    <PressableScale
      onPress={onPress}
      // PressableScale's own tap tick would stack with the selection tick below.
      noHaptic
      hitSlop={{ top: space.xs, bottom: space.xs }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={styles.chip}>
      <Animated.View style={[styles.chipBorder, borderStyle]} pointerEvents="none" />
      <Animated.View
        pointerEvents="none"
        style={[styles.chipWash, { backgroundColor: wash ?? colors.wineWash }, washStyle]}
      />
      {dot ? <View style={[styles.chipDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.chipLabel, { color: fg }]}>{label}</Text>
      {detail ? <Text style={styles.chipDetail}>{detail}</Text> : null}
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsing masthead                                                 */
/* ------------------------------------------------------------------ */

/**
 * Scroll distance over which the compact bar takes over from the big title.
 *
 * Starts below the title's own height so the two never read as duplicated —
 * the bar only appears once "The Dex" has genuinely left the screen.
 */
const MASTHEAD_FADE_FROM = 44;
const MASTHEAD_FADE_TO = 96;

/**
 * Scroll depth at which the back-to-top button appears.
 *
 * Set past MASTHEAD_FADE_TO: until the compact bar has fully taken over, the
 * big title is still on screen and there is nothing to go back to.
 */
const SCROLL_TOP_SHOW_AT = 320;

/** Button and its container share this, so the touch target cannot drift. */
const SCROLL_TOP_SIZE = 40;

/**
 * The compact bar that replaces the scrolled-away title.
 *
 * Glass rather than a solid fill so the grid stays visible sliding under it,
 * which is what tells you the page is still moving. The progress hairline
 * along the bottom edge doubles as the bar's separator — one element doing
 * two jobs instead of a rule plus a meter.
 */
function Masthead({
  scrollY,
  collected,
  topInset,
}: {
  scrollY: SharedValue<number>;
  collected: number;
  topInset: number;
}) {
  const pct = TOTAL > 0 ? Math.min(100, (collected / TOTAL) * 100) : 0;

  /*
   * Measured height. The bar hides by sliding fully above the top edge,
   * so it has to know how tall it is; 120 is a first-frame stand-in only.
   */
  const height = useSharedValue(0);

  const barStyle = useAnimatedStyle(() => {
    const p = interpolate(
      scrollY.value,
      [MASTHEAD_FADE_FROM, MASTHEAD_FADE_TO],
      [0, 1],
      Extrapolation.CLAMP,
    );
    /*
     * Slides rather than fades, and the distinction is not cosmetic:
     * UIKit drops a UIVisualEffectView's material entirely when any
     * ancestor has alpha < 1. Animating opacity here left the bar with no
     * glass at all — bare text over the scrolling grid, only the progress
     * hairline still drawn. Translating keeps the layer fully opaque.
     */
    return { transform: [{ translateY: -(1 - p) * (height.value || 120) }] };
  });

  return (
    /*
     * No paddingTop here — the inner row owns it (see `mastheadGlass`), so the
     * glass can run up under the status bar. Setting it in both places padded
     * the inset twice, which pushed the bar a full status-bar height down the
     * screen and left it sitting on top of the grid instead of over it.
     */
    <Animated.View
      style={[styles.masthead, barStyle]}
      pointerEvents="none"
      onLayout={(e) => height.set(e.nativeEvent.layout.height)}>
      <GlassSurface cornerRadius={0} strong flat style={styles.mastheadGlass}>
        <View style={[styles.mastheadRow, { paddingTop: topInset }]}>
          <Text style={styles.mastheadTitle}>The Dex</Text>
          <Text style={styles.mastheadCount}>
            {collected}
            <Text style={styles.mastheadTotal}> / {TOTAL}</Text>
          </Text>
        </View>
        {/* Progress doubles as the bar's bottom rule. */}
        <View style={styles.mastheadTrack}>
          <View style={[styles.mastheadFill, { width: `${pct}%` }]} />
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

/**
 * Grid cell.
 *
 * A thin wrapper over `DexCard` that owns the per-card store subscription —
 * collecting one drink must not re-render the other 459. Keeping the
 * subscription here leaves DexCard a pure presentational component, so the
 * detail screen and any future surface can render the same card.
 */
const GridCell = React.memo(function GridCell({
  drink,
  artSize,
  onPress,
}: {
  drink: Drink;
  artSize: number;
  onPress: (id: string) => void;
}) {
  const unlocked = useIsUnlocked(drink.id);
  return <DexCard drink={drink} artSize={artSize} collected={unlocked} onPress={onPress} />;
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  /*
   * Membership size, not the map itself. Subscribing to `unlocks` here would
   * re-render the screen every time a photo is swapped on an entry already
   * collected; the count moves only when something is added or removed, which
   * is the only change the grid's filtering and progress care about.
   */
  const collected = useCollection((s) => Object.keys(s.unlocks).length);

  const [region, setRegion] = useState<RegionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const artSize = useMemo(() => {
    const column = (width - GRID_PAD * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
    return Math.round(column * 0.66);
  }, [width]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Read-not-subscribe: `collected` above is what invalidates this memo.
    const unlocks = useCollection.getState().unlocks;

    return DRINKS.filter((drink) => {
      if (region !== 'all' && drink.category !== region) return false;
      if (status !== 'all') {
        const has = Boolean(unlocks[drink.id]);
        if (status === 'unlocked' ? !has : has) return false;
      }
      if (
        q.length > 0 &&
        !drink.name.toLowerCase().includes(q) &&
        !drink.subcategory.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
    // `collected` looks unused — it is the invalidation key for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collected, query, region, status]);

  const listRef = useRef<FlatList<Drink>>(null);
  const reduced = useReducedMotion();

  const scrollY = useSharedValue(0);

  /*
   * The scroll-to-top button mounts on a state flag rather than on an animated
   * opacity, so a hidden button cannot swallow taps over the grid.
   *
   * Derived by reaction rather than written from the scroll handler. The
   * handler version only wrote the flag when a scroll event actually CROSSED
   * the threshold, which left every path that arrives past it without crossing
   * it — a remount at a restored offset, a preserved tab position, Fast
   * Refresh at depth — showing no button no matter how far you scrolled. It
   * also meant two sources of truth that could desync, which is exactly what
   * Fast Refresh did: it preserves shared values but resets React state.
   *
   * useAnimatedReaction runs on first evaluation too (prev is null), so the
   * flag seeds itself from wherever the list actually is. Still only writes on
   * change — writing every frame would re-render 460 cells on every pixel.
   */
  const [showScrollTop, setShowScrollTop] = useState(false);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  useAnimatedReaction(
    () => scrollY.value > SCROLL_TOP_SHOW_AT,
    (past, prev) => {
      if (past !== prev) runOnJS(setShowScrollTop)(past);
    },
  );

  const scrollToTop = useCallback(() => {
    haptic.tap();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const openDrink = useCallback(
    (id: string) => {
      router.push({ pathname: '/drink/[id]', params: { id } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Drink }) => (
      <GridCell drink={item} artSize={artSize} onPress={openDrink} />
    ),
    [artSize, openDrink],
  );

  const selectRegion = useCallback((next: RegionFilter) => {
    haptic.select();
    setRegion(next);
  }, []);

  const selectStatus = useCallback((next: StatusFilter) => {
    haptic.select();
    setStatus(next);
  }, []);

  const resetFilters = useCallback(() => {
    haptic.select();
    setRegion('all');
    setStatus('all');
    setQuery('');
  }, []);

  const filtered = region !== 'all' || status !== 'all' || query.length > 0;

  const header = (
    <View>
      <Text style={styles.title}>The Dex</Text>
      <Text style={styles.subtitle}>Every pour you have met, kept in one place.</Text>

      <View style={styles.progressBlock}>
        <View style={styles.progressRow}>
          <Text style={styles.progressCount}>
            {collected} of {TOTAL}
          </Text>
          <Text style={styles.progressLabel}>collected</Text>
        </View>
        <ProgressBar value={collected} max={TOTAL} />
      </View>

      {/* Region */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}>
        <FilterChip
          label="All"
          detail={String(TOTAL)}
          selected={region === 'all'}
          accessibilityLabel={`All regions, ${TOTAL} entries`}
          onPress={() => selectRegion('all')}
        />
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const total = COUNT_BY_CATEGORY[category];
          return (
            <FilterChip
              key={category}
              label={meta.plural}
              detail={String(total)}
              selected={region === category}
              accent={meta.color}
              wash={meta.wash}
              dot={meta.color}
              accessibilityLabel={`${meta.plural}, ${total} entries`}
              onPress={() => selectRegion(category)}
            />
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchIcon}>
          <Icon name="search" size={17} color={colors.textFaint} />
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the index"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search drinks by name or style"
        />
        {query.length > 0 ? (
          <PressableScale
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clearBtn}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        {STATUS_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            label={option.label}
            selected={status === option.key}
            accessibilityLabel={option.a11y}
            onPress={() => selectStatus(option.key)}
          />
        ))}
      </View>

      <Divider style={styles.headerRule} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <Animated.FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(drink) => drink.id}
        numColumns={COLUMNS}
        style={styles.screen}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + space.md,
            // Clears the floating tab bar — the grid's last row would
            // otherwise sit under frosted glass.
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
          },
        ]}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="Nothing on this shelf"
            body="No entry matches that combination yet. Widen the search and the board fills back in."
            action={filtered ? { label: 'Clear filters', onPress: resetFilters } : undefined}
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        /* 460 rows of SVG artwork — keep the mounted window tight. */
        initialNumToRender={18}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ref={listRef}
      />

      <Masthead scrollY={scrollY} collected={collected} topInset={insets.top} />

      {showScrollTop ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(motion.fast)}
          exiting={reduced ? undefined : FadeOut.duration(motion.exit)}
          style={[
            styles.scrollTop,
            { bottom: insets.bottom + TAB_BAR_CLEARANCE + space.md },
          ]}>
          <PressableScale
            onPress={scrollToTop}
            // 40pt is under the 44pt minimum, so the slop makes up the rest.
            hitSlop={space.sm}
            accessibilityRole="button"
            accessibilityLabel="Back to top">
            <GlassSurface cornerRadius={radius.pill} strong style={styles.scrollTopGlass}>
              {/* No chevronUp in the set — the down chevron, turned over. */}
              <View style={styles.scrollTopIcon}>
                <Icon name="chevronDown" size={18} color={colors.patina} />
              </View>
            </GlassSurface>
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingHorizontal: GRID_PAD,
    paddingBottom: space.xxxl,
    gap: GRID_GAP,
  },
  gridRow: {
    gap: GRID_GAP,
  },

  /* Collapsing masthead */
  masthead: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  /*
   * Deliberately small: an assist, not a control the grid has to work around.
   *
   * The size is declared HERE as well as on the glass. This container is
   * absolutely positioned with only `right`/`bottom`, so without explicit
   * dimensions it is content-sized — and a content-sized absolute box that is
   * also running an entering animation can hit-test as empty, which sent the
   * tap through to the card underneath and opened a drink instead of
   * scrolling. zIndex makes "above the grid" explicit rather than relying on
   * sibling paint order.
   */
  scrollTop: {
    position: 'absolute',
    right: GRID_PAD,
    width: SCROLL_TOP_SIZE,
    height: SCROLL_TOP_SIZE,
    zIndex: 2,
  },
  scrollTopGlass: {
    width: SCROLL_TOP_SIZE,
    height: SCROLL_TOP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollTopIcon: {
    transform: [{ rotate: '180deg' }],
  },
  mastheadGlass: {
    // paddingTop is applied to the inner row instead, so the glass itself
    // extends under the status bar rather than starting below it.
    paddingTop: 0,
  },
  mastheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PAD,
    paddingBottom: space.sm,
    minHeight: 44,
  },
  mastheadTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
  },
  mastheadCount: {
    fontFamily: fonts.mono,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  mastheadTotal: {
    color: colors.textFaint,
  },
  mastheadTrack: {
    height: 2,
    backgroundColor: colors.bgSunk,
  },
  mastheadFill: {
    height: 2,
    backgroundColor: colors.wine,
  },

  /* Header */
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  progressBlock: {
    marginTop: space.lg,
    gap: space.sm,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
  },
  progressCount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.patina,
    fontVariant: ['tabular-nums'],
  },
  progressLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: typeScale.caption.letterSpacing,
    color: colors.textFaint,
  },

  /* Chips */
  chipScroll: {
    // Bleeds past the list padding so the row can scroll edge to edge.
    marginHorizontal: -GRID_PAD,
    marginTop: space.lg,
  },
  chipScrollContent: {
    paddingHorizontal: GRID_PAD,
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  // Borde y relleno viven en capas propias para poder animarlos por separado.
  chipBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
  },
  chipDetail: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },

  /* Search */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  searchIcon: {
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    paddingRight: space.sm,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  clearBtn: {
    width: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  headerRule: {
    marginTop: space.xl,
    marginBottom: space.xs,
  },

  /* Grid cards live in components/DexCard.tsx. */
});
