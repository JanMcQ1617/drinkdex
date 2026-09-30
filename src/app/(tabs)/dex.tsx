import { useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DexCard } from '@/components/DexCard';
import { GlassSurface } from '@/components/glass';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import {
  Divider,
  EmptyState,
  haptic,
  PressableScale,
  ProgressBar,
  SearchField,
} from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  fonts,
  motion,
  radius,
  space,
  type as typeScale,
  tabular,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, DRINKS, formatCount, TOTAL } from '@/data';
import { matchOwned } from '@/lib/bar';
import { useBar } from '@/store/bar';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory } from '@/types';

/* ------------------------------------------------------------------ */
/* Grid geometry                                                       */
/* ------------------------------------------------------------------ */

/*
 * Two columns, not three.
 *
 * Three fit more entries per screen and made every one of them a thumbnail
 * — at a third of the width minus gutters the photograph is too small to
 * tell a coupe from a martini glass, which is the one thing the grid has
 * to do. Two gives the card enough width for the drink to be legible and
 * for the name to sit on one line in most cases.
 */
const COLUMNS = 2;
const GRID_PAD = space.lg;
const GRID_GAP = space.sm;

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

type CategoryFilter = DrinkCategory | 'all';
type StatusFilter = 'all' | 'unlocked' | 'locked';

const STATUS_OPTIONS: { key: StatusFilter; label: string; a11y: string }[] = [
  { key: 'all', label: 'All', a11y: 'Show every entry' },
  { key: 'unlocked', label: 'Collected', a11y: 'Show only entries you have collected' },
  { key: 'locked', label: 'Not yet', a11y: 'Show only entries you have not collected' },
];

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/*
 * Folded for matching: accents stripped, apostrophes dropped, lowercased.
 *
 * A plain lowercase substring check missed 188 names with accents and 89
 * with apostrophes — "pina colada", "cachaca", "creme de cassis" and "bees
 * knees" all came back empty for drinks that are in the Dex, because a US
 * keyboard does not type ñ, ç or è and nobody types the apostrophe. The
 * iOS keyboard's curly ’ would not have matched the data's straight ' in
 * any case. NFD splits each accented letter into base plus mark and the
 * marks go; the explicit maps are the letters NFD does not decompose
 * (ı, ß, ø, đ), which were all that was left in the catalogue after it.
 */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .replace(/[øØ]/g, 'o')
    .replace(/[đĐ]/g, 'd')
    .replace(/['‘’`]/g, '')
    .toLowerCase();

/*
 * Name, style and origin, folded once at load rather than per keystroke.
 * Newline-joined so a query cannot match across the seam between two
 * fields. Origin is here so the Dex can be browsed by country — "peru",
 * "jalisco", "iceland" — the only way the world-spanning half of the index
 * is discoverable.
 */
const SEARCH_KEY = new Map(
  DRINKS.map((d) => [d.id, [d.name, d.subcategory, d.origin].map(fold).join('\n')]),
);

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function FilterChip({
  label,
  detail,
  selected,
  accent,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  /** Text and border once selected. Defaults to wine ink. */
  accent?: string;
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

  /* Grows from the centre so the rule reads as arriving under the word it
     belongs to rather than sliding in from one side. */
  const ruleStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scaleX: 0.4 + 0.6 * p.value }],
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
      <Text style={[styles.chipLabel, { color: fg }]}>{label}</Text>
      {detail ? <Text style={styles.chipDetail}>{detail}</Text> : null}
      {/*
        The selected state is a rule under the label, not a filled pill.
        Five bordered, washed, dotted pills in a row was the busiest element
        on the screen and the least important — it is a filter, not content.
        Vivino's equivalent (Styles / Regions / Grapes) is plain text with an
        underline, which is also what lets the row hold two axes without
        looking like ten competing buttons.
      */}
      <Animated.View
        pointerEvents="none"
        style={[styles.chipRule, { backgroundColor: activeFg }, ruleStyle]}
      />
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
     *
     * Takes touches, deliberately. It was `pointerEvents="none"`, so a tap on
     * the visible bar went straight through to whichever card sat under the
     * glass and opened a drink the user had not seen. Parked, the bar is
     * translated wholly off-screen and cannot catch anything; the cost is
     * that a drag starting on it does not scroll the grid, as with any
     * navigation bar.
     *
     * Hidden from VoiceOver. It is a visual repeat of the list header's
     * title and progress, which stay in the accessibility order; parked
     * off-screen it was still read, so every visit to the tab heard "The
     * Dex" twice and a count that was not on screen.
     */
    <Animated.View
      style={[styles.masthead, barStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => height.set(e.nativeEvent.layout.height)}>
      <GlassSurface cornerRadius={0} strong flat style={styles.mastheadGlass}>
        <View style={[styles.mastheadRow, { paddingTop: topInset }]}>
          <Text style={styles.mastheadTitle}>The Dex</Text>
          <Text style={styles.mastheadCount}>
            {formatCount(collected)}
            <Text style={styles.mastheadTotal}> / {formatCount(TOTAL)}</Text>
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
 * collecting one drink must not re-render every other mounted cell. Keeping
 * the subscription here leaves DexCard a pure presentational component, so
 * the detail screen and any future surface can render the same card.
 */
const GridCell = React.memo(function GridCell({
  drink,
  artSize,
  cardWidth,
  onPress,
}: {
  drink: Drink;
  artSize: number;
  cardWidth: number;
  onPress: (id: string) => void;
}) {
  // The whole record, not just the boolean: the card shows the user's own
  // pour photo once one exists. Still a single-entry subscription, so
  // collecting one drink does not re-render the others.
  const record = useCollection((s) => s.unlocks[drink.id]);
  return (
    <DexCard
      drink={drink}
      artSize={artSize}
      cardWidth={cardWidth}
      collected={Boolean(record)}
      userPhotoUri={record?.photoUri}
      onPress={onPress}
    />
  );
});

/**
 * The empty grid, which has three causes and gets three answers.
 *
 * It was one message for all of them — "widen the search" — so a new user
 * tapping Collected was told to widen a search they had never run, and
 * never told the actual next step. A search miss now repeats the query and
 * clears only the query, so a typo made inside Spirits does not also throw
 * away Spirits. An empty Collected says how things get collected. Anything
 * else is a filter combination with nothing in it, and resets the filters.
 */
function GridEmpty({
  query,
  nothingCollected,
  onClearSearch,
  onShowAll,
  onReset,
}: {
  query: string;
  nothingCollected: boolean;
  onClearSearch: () => void;
  onShowAll: () => void;
  onReset: () => void;
}) {
  if (query.length > 0) {
    return (
      <EmptyState
        icon="search"
        title={`No match for “${query}”`}
        body="Check the spelling, or search by style or country."
        action={{ label: 'Clear search', onPress: onClearSearch }}
      />
    );
  }
  if (nothingCollected) {
    return (
      <EmptyState
        icon="dex"
        title="Nothing collected yet"
        body="Open any entry and log a pour to add it here."
        action={{ label: 'Show every entry', onPress: onShowAll }}
      />
    );
  }
  return (
    <EmptyState
      icon="filter"
      title="No matches"
      body="Nothing in the Dex matches these filters."
      action={{ label: 'Clear filters', onPress: onReset }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  /*
   * How many drinks the shelf can currently make, for the My Bar row below.
   *
   * The selector returns the number, not the shelf, so ticking a bottle on
   * My Bar re-renders this screen only when the count actually moves — this
   * screen stays mounted under My Bar, and subscribing to `owned` itself
   * re-rendered the whole grid on every tick. The count comes from
   * matchOwned, which remembers its last answer keyed on the store's Record
   * identity: My Bar and this row ask about the same shelf on the same tap,
   * so whichever asks second reuses the first one's match instead of
   * walking every recipe again.
   */
  const barCount = useBar((s) => matchOwned(s.owned).makeable.length);

  /*
   * Membership size, not the map itself. Subscribing to `unlocks` here would
   * re-render the screen every time a photo is swapped on an entry already
   * collected; the count moves only when something is added or removed, which
   * is the only change the grid's filtering and progress care about.
   *
   * A plain key count is honest here because the store keeps `unlocks` to
   * catalogue ids only: records for drinks that left the index are moved
   * aside when the collection loads (see settle() in store/collection), so
   * this header, Stats and the celebrations all count the same entries.
   */
  const collected = useCollection((s) => Object.keys(s.unlocks).length);

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  /*
   * The card width is the exact column, unrounded: rounding it could push
   * two cards and the gap past the row by a point and a half.
   */
  const { column, artSize } = useMemo(() => {
    const column = (width - GRID_PAD * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
    return { column, artSize: Math.round(column * 0.66) };
  }, [width]);

  const rows = useMemo(() => {
    const q = fold(query.trim());
    // Read-not-subscribe: `collected` above is what invalidates this memo.
    const unlocks = useCollection.getState().unlocks;

    return DRINKS.filter((drink) => {
      if (category !== 'all' && drink.category !== category) return false;
      if (status !== 'all') {
        const has = Boolean(unlocks[drink.id]);
        if (status === 'unlocked' ? !has : has) return false;
      }
      return q.length === 0 || (SEARCH_KEY.get(drink.id) ?? '').includes(q);
    });
    // `collected` looks unused — it is the invalidation key for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collected, query, category, status]);

  const listRef = useRef<FlatList<Drink>>(null);
  /*
   * Tapping the Dex tab while already on it scrolls the grid home, the way
   * every iOS tab bar behaves. The chip scroller below opts out of
   * scrollsToTop so a status-bar tap reaches the grid, not the chips.
   */
  useScrollToTop(listRef);
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
   * change — writing every frame would re-render the screen on every pixel.
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
    // No haptic here: the PressableScale that calls this already taps.
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
      <GridCell drink={item} artSize={artSize} cardWidth={column} onPress={openDrink} />
    ),
    [artSize, column, openDrink],
  );

  const selectCategory = useCallback((next: CategoryFilter) => {
    haptic.select();
    setCategory(next);
  }, []);

  const selectStatus = useCallback((next: StatusFilter) => {
    haptic.select();
    setStatus(next);
  }, []);

  const resetFilters = useCallback(() => {
    haptic.select();
    setCategory('all');
    setStatus('all');
    setQuery('');
  }, []);

  const header = (
    <View>
      {/*
        Title and search share a row. Search was a 48pt bordered field on a
        line of its own, and the subtitle below the title — "Every pour you
        have met, kept in one place" — restated the screen's name at body
        size. Between them they cost about 90pt above the fold on a screen
        where the first drink already sat 409pt down, half the display.

        The field is SearchField (components/ui), the one search input the
        app's screens share — not a smaller sunk variant of its own, as it
        once was. At 36pt with 13pt text it was under the touch minimum,
        and its glyph and placeholder sat at 2.5:1 in the sunk well. The
        placeholder names what it searches, country included: nothing else
        on screen says the index can be browsed that way.
      */}
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          The Dex
        </Text>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Name, style or country"
          accessibilityLabel="Search drinks by name, style or country"
          style={styles.search}
        />
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressRow}>
          <Text style={styles.progressCount}>
            {formatCount(collected)} of {formatCount(TOTAL)}
          </Text>
          <Text style={styles.progressLabel}>collected</Text>
        </View>
        <ProgressBar value={collected} max={TOTAL} />
      </View>

      {/*
        My Bar. Sits above the filters rather than among them because it is a
        destination, not another way to slice this grid — and below the
        progress block because the Dex's own headline should stay the first
        thing read.

        The count is live so the row earns its place: "48 you can make right
        now" is a reason to tap, where a bare "My Bar" is furniture.
      */}
      <PressableScale
        onPress={() => {
          haptic.tap();
          router.push('/bar');
        }}
        noHaptic
        accessibilityRole="button"
        accessibilityLabel={
          barCount > 0
            ? `My Bar, ${barCount} drinks you can make right now`
            : 'My Bar, tick what you own to see what you can make'
        }
        style={styles.barLink}>
        {/*
          The bottle: what My Bar holds. This was the sparkle, which is the
          legendary mark on the cards a few rows down, and then the coupe,
          which is the Dex's own tab glyph. Each one pointed at this screen
          rather than at the one the row opens.
        */}
        <Icon name="bottle" size={18} color={colors.wine} />
        <View style={styles.barLinkText}>
          <Text style={styles.barLinkTitle}>My Bar</Text>
          <Text style={styles.barLinkBody} numberOfLines={1}>
            {barCount > 0
              ? `${barCount} ${barCount === 1 ? 'drink' : 'drinks'} you can make now`
              : 'Tick what you own, see what you can pour'}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      </PressableScale>

      {/* Category */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollsToTop={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}>
        <FilterChip
          label="All"
          detail={formatCount(TOTAL)}
          selected={category === 'all'}
          accessibilityLabel={`All drinks, ${formatCount(TOTAL)} entries`}
          onPress={() => selectCategory('all')}
        />
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          const total = COUNT_BY_CATEGORY[key];
          return (
            <FilterChip
              key={key}
              label={meta.plural}
              detail={formatCount(total)}
              selected={category === key}
              accent={meta.color}
              accessibilityLabel={`${meta.plural}, ${formatCount(total)} entries`}
              onPress={() => selectCategory(key)}
            />
          );
        })}

        {/*
          The collected/not-yet axis rides the same scroller, behind a rule.
          It was a third filter row of its own. Two axes in one row needs the
          divider to work — without it the eye reads seven peers and cannot
          tell that picking "Spirits" and picking "Not yet" are different
          questions.
        */}
        <View style={styles.axisRule} />
        {STATUS_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            label={option.label}
            selected={status === option.key}
            accessibilityLabel={option.a11y}
            onPress={() => selectStatus(option.key)}
          />
        ))}
      </ScrollView>

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
          <GridEmpty
            query={query.trim()}
            nothingCollected={status === 'unlocked' && collected === 0}
            onClearSearch={() => setQuery('')}
            onShowAll={() => selectStatus('all')}
            onReset={resetFilters}
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        /*
         * 2,089 entries, most of them vector artwork — keep the window tight.
         * With numColumns these counts are ROWS, not cards: FlatList hands
         * the virtualiser one item per row. At 18 and 12 the first commit
         * built 36 cards when four to six are on screen below the header.
         * Four rows fills the first screen on the largest phone.
         */
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ref={listRef}
      />

      <Masthead scrollY={scrollY} collected={collected} topInset={insets.top} />

      {showScrollTop ? (
        /*
         * Scales in and out rather than fading, for the masthead's reason:
         * UIKit drops a glass material while any ancestor's alpha is under
         * 1, so a fade showed a bare chevron until the glass popped in at
         * the end, and lost the glass the moment the exit began.
         */
        <Animated.View
          entering={reduced ? undefined : ZoomIn.duration(motion.fast)}
          exiting={reduced ? undefined : ZoomOut.duration(motion.exit)}
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
                <Icon name="chevronDown" size={18} color={colors.wine} />
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
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
    ...tabular,
  },
  // textMuted: 13pt text on the glass, where textFaint is 3.82:1 — a 3:1 ink under a 4.5:1 floor.
  mastheadTotal: {
    color: colors.textMuted,
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
    color: colors.wine,
    ...tabular,
  },
  progressLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: typeScale.caption.letterSpacing,
    // Small text, so textMuted — as chipDetail below, and for its reason.
    color: colors.textMuted,
  },

  /* My Bar entry point. Same surface + hairline as the other cards on this
     screen, so it reads as a place rather than a banner. */
  barLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
  },
  barLinkText: { flex: 1 },
  barLinkTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  barLinkBody: {
    fontFamily: fonts.body,
    /*
     * A step down from caption, because this line shares its row with a
     * 18pt icon, a chevron and two gaps — at caption size the empty state
     * clipped to "Tick what you own, see what you can …", losing the half
     * that says what the feature is for. Shrinking the type rather than
     * cutting the sentence keeps the promise intact.
     */
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    color: colors.textMuted,
    marginTop: 2,
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
    gap: 5,
    minHeight: 36,
    paddingHorizontal: space.xs,
    paddingBottom: 6,
  },
  chipRule: {
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
  /* Separates the two filter axes sharing the scroller. */
  axisRule: {
    width: 1,
    alignSelf: 'center',
    height: 16,
    marginHorizontal: space.sm,
    backgroundColor: colors.cardBorder,
  },
  chipLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
  },
  chipDetail: {
    fontFamily: fonts.numeral,
    /*
     * tag, the scale's 11pt floor for chips and badges — it was a 10pt
     * one-off. Still a step under the 13pt chip label, which it has to sit
     * beneath; micro at 12 would read almost level with it.
     */
    fontSize: typeScale.tag.fontSize,
    /*
     * textMuted, not textFaint. The per-category count is content — it is
     * how you learn there are 1,190 spirits — and textFaint is for large
     * type and glyphs: it renders it at 3.51:1 on this page, under the
     * 4.5:1 floor for text this size. textMuted clears at 5.50:1.
     */
    color: colors.textMuted,
    ...tabular,
  },

  /* Search */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  /* The field takes whatever the title leaves; SearchField draws the rest. */
  search: { flex: 1 },
  headerRule: {
    marginTop: space.xl,
    marginBottom: space.xs,
  },

  /* Grid cards live in components/DexCard.tsx. */
});
