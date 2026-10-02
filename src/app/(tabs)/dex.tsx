import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomDrinkTile } from '@/components/CustomDrinkTile';
import { DexCard } from '@/components/DexCard';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import {
  Button,
  Divider,
  EmptyState,
  haptic,
  ListGroup,
  ListRow,
  PressableScale,
  SearchField,
} from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  elevation,
  fonts,
  layout,
  motion,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, DRINKS, formatCount, TOTAL } from '@/data';
import { matchOwned } from '@/lib/bar';
import { catalogueTwin, ownTwin, shortQuery } from '@/lib/customDrinks';
import { useBar } from '@/store/bar';
import { useCollection } from '@/store/collection';
import { useCustomDrinks } from '@/store/customDrinks';
import type { CustomDrink, Drink, DrinkCategory, UnlockRecord } from '@/types';

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
/** The screen gutter: 16, as on every screen in v2. */
const GRID_PAD = layout.gutter;
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
 *
 * This is the Dex's own search, broader than the log sheet's
 * (lib/drinkSearch): a substring over name, style and origin, for
 * browsing, not ranked for picking one drink.
 */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

/** The same key for a drink someone added: a handful of them, folded per search. */
const customKey = (c: CustomDrink) => [c.name, c.subcategory, c.origin].map(fold).join('\n');

/** Own keys only: the stores are plain objects, and 'constructor' is not a drink. */
const has = (map: Record<string, unknown>, id: string) =>
  Object.prototype.hasOwnProperty.call(map, id);

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
   * The rule under the label grows in on a spring, the selection indicator
   * every selectable thing in the app answers with. It is not what says
   * which chip is on: the label's colour does that the moment it is
   * tapped, so a rule that stalls (Reanimated can, after a cold start)
   * never hides the selection.
   */
  const p = useDerivedValue(() =>
    // motion.selection, not motion.spring: these chips and the segmented
    // and tab indicators elsewhere are all selection affordances, and the
    // same gesture must get the same answer wherever it is made.
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
        looking like ten competing buttons. These are tabs, so they stay
        tabs; the toggles elsewhere in the app are Chips.
      */}
      <Animated.View
        pointerEvents="none"
        style={[styles.chipRule, { backgroundColor: activeFg }, ruleStyle]}
      />
    </PressableScale>
  );
}

/**
 * Scroll depth at which the back-to-top button appears: about one screen
 * of cards below the header, where getting back up starts to take more
 * than a flick.
 */
const SCROLL_TOP_SHOW_AT = 320;

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
 * "Added by you": the drinks this person added themselves, above the
 * catalogue's filters.
 *
 * A shelf of its own and never cards in the grid. The grid, its chips
 * ("All 2,089") and the progress line all mean "the catalogue"; a custom
 * card among them would make every count on this screen wrong, and its
 * absence of a number and a rarity would look like a broken card. The
 * shelf follows the same filters (category, collected, the search) so it
 * never shows a drink the filters above it say is not there.
 *
 * Newest first: the one just added is the one being looked for.
 */
function AddedByYou({
  drinks,
  pours,
  onOpen,
  onAdd,
}: {
  drinks: CustomDrink[];
  pours: Record<string, UnlockRecord>;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHead}>
        {/*
          One heading with its count, read together ("Added by you 3"). The
          count sits on the title's baseline, a step down and muted, as the
          filter chips print theirs.
        */}
        <Text style={styles.shelfTitle} accessibilityRole="header">
          Added by you<Text style={styles.shelfCount}>{`  ${formatCount(drinks.length)}`}</Text>
        </Text>
        <Button
          label="Add a drink"
          variant="text"
          size="sm"
          icon="plus"
          onPress={onAdd}
          accessibilityHint="Opens a form to add a drink that is not in the Dex"
          style={styles.shelfAdd}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // A status-bar tap scrolls the grid home, not this row.
        scrollsToTop={false}
        style={styles.shelfScroll}
        contentContainerStyle={styles.shelfScrollContent}>
        {drinks.map((c) => (
          <CustomDrinkTile
            key={c.id}
            drink={c}
            pourPhotoUri={has(pours, c.id) ? (pours[c.id].photoUri ?? null) : null}
            collected={has(pours, c.id)}
            onPress={onOpen}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Under a search that found things, none of them with the name typed:
 * "margarita" always matches something, so an empty grid alone would hide
 * the way to add a drink the Dex does not have.
 */
function NotTheOne({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <View style={styles.notTheOne}>
      <Text style={styles.notTheOneText}>Not the one you meant?</Text>
      <Button
        label={`Add “${shortQuery(query)}”`}
        variant="secondary"
        size="sm"
        icon="plus"
        onPress={onAdd}
        accessibilityLabel={`Add ${query} to your Dex`}
      />
    </View>
  );
}

/**
 * The empty grid, which has several causes and gets an answer for each.
 *
 * It was one message for all of them — "widen the search" — so a new user
 * tapping Collected was told to widen a search they had never run, and
 * never told the actual next step. A search miss now repeats the query and
 * clears only the query, so a typo made inside Spirits does not also throw
 * away Spirits. An empty Collected says how things get collected. Anything
 * else is a filter combination with nothing in it, and resets the filters.
 *
 * A search that finds nothing in the whole catalogue may be a drink the
 * Dex does not have yet, so it offers to add it: it goes into this
 * person's Dex at once and to Sipply as a suggestion. One they already
 * added is on the shelf above, and the message points there instead. A
 * search that the catalogue does answer, but only under other filters,
 * says so and clears the filters, not the words; so does a name they
 * added themselves that the filters keep off the shelf, rather than
 * offering to add it a second time.
 */
function GridEmpty({
  query,
  matchesCatalogue,
  onShelf,
  ownHidden,
  nothingCollected,
  onClearSearch,
  onAdd,
  onClearFilters,
  onShowAll,
  onReset,
}: {
  query: string;
  /** The query finds something in the catalogue under any filter. */
  matchesCatalogue: boolean;
  /** One of the drinks on the shelf above has exactly this name. */
  onShelf: boolean;
  /** A drink they added has exactly this name, and the filters keep it off the shelf. */
  ownHidden: string | null;
  nothingCollected: boolean;
  onClearSearch: () => void;
  onAdd: () => void;
  onClearFilters: () => void;
  onShowAll: () => void;
  onReset: () => void;
}) {
  if (query.length > 0) {
    if (onShelf) {
      return (
        <EmptyState
          icon="search"
          title="Not in the Dex yet"
          body="It's in the drinks you added, above."
          action={{ label: 'Clear search', onPress: onClearSearch }}
        />
      );
    }
    if (matchesCatalogue) {
      return (
        <EmptyState
          icon="filter"
          title="Not under these filters"
          body={`“${query}” is in the Dex, but the filters hide it.`}
          action={{ label: 'Clear filters', onPress: onClearFilters }}
        />
      );
    }
    if (ownHidden) {
      return (
        <EmptyState
          icon="filter"
          title="Not under these filters"
          body={`You added “${ownHidden}”, but the filters hide it.`}
          action={{ label: 'Clear filters', onPress: onClearFilters }}
        />
      );
    }
    if (query.length >= 2) {
      return (
        <EmptyState
          icon="search"
          title={`No match for “${query}”`}
          body="It may not be in the Dex yet. Add it and it's in your Dex straight away. We'll look at adding it for everyone."
          action={{ label: `Add “${shortQuery(query)}”`, onPress: onAdd }}
          secondaryAction={{ label: 'Clear search', onPress: onClearSearch }}
        />
      );
    }
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
   * aside when the collection loads (see settle() in store/collection), and
   * drinks people add themselves live in a store of their own
   * (store/customDrinks), so this progress, Stats and the celebrations all
   * count the same entries.
   */
  const collected = useCollection((s) => Object.keys(s.unlocks).length);

  /*
   * The drinks this person added, and their pours. The stable records, not
   * a list made in the selector: zustand v5 throws on a selector that
   * returns a new array each call. The shelf is derived below.
   *
   * The splash does not wait for this store, so for a moment after launch
   * the shelf may not be drawn; it appears once the store has loaded.
   * Holding the splash for it would be one more way to show a blank screen.
   */
  const customDrinks = useCustomDrinks((s) => s.drinks);
  const customPours = useCustomDrinks((s) => s.pours);
  const customReady = useCustomDrinks((s) => s.hydrated);

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  /*
   * The card width is the exact column, unrounded: rounding it could push
   * two cards and the gap past the row by a point and a half.
   */
  const { column, artSize } = useMemo(() => {
    const column = (width - GRID_PAD * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
    return { column, artSize: Math.round(column * 0.66) };
  }, [width]);

  /*
   * The grid, and whether the search finds anything in the catalogue at
   * all, under any filter: that is what tells "the filters hide it" apart
   * from "the Dex does not have it" when the grid comes back empty. One
   * pass over the index for both. A plain loop rather than a filter
   * callback, so the "found anywhere" flag is a local of this function and
   * not a variable a callback reassigns.
   */
  const { rows, matchesCatalogue } = useMemo(() => {
    const q = fold(query.trim());
    // Read-not-subscribe: `collected` above is what invalidates this memo.
    const unlocks = useCollection.getState().unlocks;
    const rows: Drink[] = [];
    let anywhere = false;

    for (const drink of DRINKS) {
      const hit = q.length === 0 || (SEARCH_KEY.get(drink.id) ?? '').includes(q);
      if (!hit) continue;
      anywhere = true;
      if (category !== 'all' && drink.category !== category) continue;
      if (status !== 'all') {
        const owned = Boolean(unlocks[drink.id]);
        if (status === 'unlocked' ? !owned : owned) continue;
      }
      rows.push(drink);
    }
    return { rows, matchesCatalogue: anywhere };
    // `collected` looks unused — it is the invalidation key for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collected, query, category, status]);

  /* The shelf: the same three filters, newest first. */
  const shelf = useMemo(() => {
    if (!customReady) return [];
    const q = fold(query.trim());
    return Object.values(customDrinks)
      .filter((c) => {
        if (category !== 'all' && c.category !== category) return false;
        if (status !== 'all') {
          const poured = has(customPours, c.id);
          if (status === 'unlocked' ? !poured : poured) return false;
        }
        return q.length === 0 || customKey(c).includes(q);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [customReady, customDrinks, customPours, query, category, status]);

  /*
   * Whether the search is a name the Dex or this person already has,
   * folded the way the form and the server compare names. Two characters
   * at least: one letter is not a name anybody means.
   */
  const named = trimmed.length >= 2;
  const catalogueHasName = named && catalogueTwin(trimmed) !== undefined;
  const ownNamed = named && customReady ? ownTwin(trimmed, customDrinks) : undefined;

  const listRef = useRef<FlatList<Drink>>(null);
  /*
   * Tapping the Dex tab while already on it scrolls the grid home, the way
   * every iOS tab bar behaves. The chip and shelf scrollers opt out of
   * scrollsToTop so a status-bar tap reaches the grid, not them.
   */
  useScrollToTop(listRef);

  /*
   * The back-to-top button mounts on a state flag rather than on an animated
   * opacity, so a hidden button cannot swallow taps over the grid.
   *
   * useScrolledPast compares each scroll event with where the list last
   * was on either side of the line, not with the event before it, so a
   * list that arrives past the line without crossing it (a restored
   * offset, a preserved tab position) shows the button at its first scroll
   * event. It writes state only when the side changes; a write per frame
   * would re-render the screen on every pixel.
   */
  const [showScrollTop, onScroll] = useScrolledPast(SCROLL_TOP_SHOW_AT);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const openDrink = useCallback(
    (id: string) => {
      router.push({ pathname: '/drink/[id]', params: { id } });
    },
    [router],
  );

  const openCustom = useCallback(
    (id: string) => {
      router.push({ pathname: '/custom/[id]', params: { id } });
    },
    [router],
  );

  /*
   * The add-a-drink form, named after the search when it came from one
   * (`from=dex`) and blank from the shelf's own link (`from=shelf`). A
   * filtered Dex passes its category, so someone browsing Spirits starts
   * on a spirit.
   */
  const openAdd = useCallback(
    (from: 'dex' | 'shelf', name?: string) => {
      router.push({
        pathname: '/add-drink',
        params: {
          from,
          ...(name ? { name } : null),
          ...(category !== 'all' ? { category } : null),
        },
      });
    },
    [category, router],
  );

  /*
   * Back from the form. It leaves a note in the custom-drinks store saying
   * where to go next: the entry just added, or the catalogue drink a
   * "Already in the Dex?" row pointed at. Taken on focus, so it is read
   * once, by this screen, after the form has gone.
   */
  useFocusEffect(
    useCallback(() => {
      const h = useCustomDrinks.getState().takeHandoff('dex');
      if (!h) return;
      if (h.kind === 'custom') router.push({ pathname: '/custom/[id]', params: { id: h.id } });
      else router.push({ pathname: '/drink/[id]', params: { id: h.id } });
    }, [router]),
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

  const clearFilters = useCallback(() => {
    haptic.select();
    setCategory('all');
    setStatus('all');
  }, []);

  const resetFilters = useCallback(() => {
    haptic.select();
    setCategory('all');
    setStatus('all');
    setQuery('');
  }, []);

  const pct = TOTAL > 0 ? Math.min(100, (collected / TOTAL) * 100) : 0;

  const header = (
    <View>
      {/*
        The app's one search field (components/ui), full width now that the
        title lives in the bar above. The placeholder names what it
        searches, country included: nothing else on screen says the index
        can be browsed that way.
      */}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Name, style or country"
        accessibilityLabel="Search drinks by name, style or country"
      />

      {/*
        The count, as one plain line. The rule under the bar draws the same
        figure; this says it in words, and is what VoiceOver reads.
      */}
      <Text style={styles.progressLine}>
        {formatCount(collected)} of {formatCount(TOTAL)} collected
      </Text>

      {/*
        My Bar. Sits above the filters rather than among them because it is a
        destination, not another way to slice this grid. A one-row list
        group, the app's one way of drawing "a place you go from here", with
        a chevron for the push.

        The bottle: what My Bar holds. This was the sparkle, which is the
        legendary mark on the cards a few rows down, and then the coupe,
        which is the Dex's own tab glyph. Each one pointed at this screen
        rather than at the one the row opens.

        The count is live so the row earns its place: "48 you can make right
        now" is a reason to tap, where a bare "My Bar" is furniture.
      */}
      <ListGroup style={styles.barGroup}>
        <ListRow
          leading={{ icon: 'bottle' }}
          title="My Bar"
          subtitle={
            barCount > 0
              ? `${barCount} ${barCount === 1 ? 'drink' : 'drinks'} you can make now`
              : 'Tick what you own, see what you can pour'
          }
          trailing="chevron"
          onPress={() => router.push('/bar')}
          accessibilityLabel={
            barCount > 0
              ? `My Bar, ${barCount} drinks you can make right now`
              : 'My Bar, tick what you own to see what you can make'
          }
        />
      </ListGroup>

      {shelf.length > 0 ? (
        <AddedByYou
          drinks={shelf}
          pours={customPours}
          onOpen={openCustom}
          onAdd={() => openAdd('shelf')}
        />
      ) : null}

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
      {/*
        A fixed bar, the app's one top bar: the screen's name and the way to
        Stats, which left the tab bar to become a report on this collection.
        It replaces a glass masthead that slid down over the grid once the
        big title scrolled away — a second, frosted copy of the title that
        only appeared halfway down the page.
      */}
      <ScreenTopBar
        size="lg"
        title="Dex"
        showRule={false}
        right={
          <TopBarButton
            icon="stats"
            label="Collection stats"
            onPress={() => router.push('/stats')}
          />
        }
      />
      {/*
        The bar's rule IS the progress: 2pt, sunk track, wine to the share
        collected. One line doing two jobs, under a bar that never moves.
        Hidden from VoiceOver; the line in the list header says the figure.
      */}
      <View
        style={styles.progressTrack}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(drink) => drink.id}
        numColumns={COLUMNS}
        style={styles.screen}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[
          styles.listContent,
          {
            // Clears the floating tab bar — the grid's last row would
            // otherwise sit under it.
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
          },
        ]}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <GridEmpty
            query={trimmed}
            matchesCatalogue={matchesCatalogue}
            onShelf={ownNamed !== undefined && shelf.includes(ownNamed)}
            ownHidden={ownNamed !== undefined && !shelf.includes(ownNamed) ? ownNamed.name : null}
            nothingCollected={status === 'unlocked' && collected === 0}
            onClearSearch={() => setQuery('')}
            onAdd={() => openAdd('dex', trimmed)}
            onClearFilters={clearFilters}
            onShowAll={() => selectStatus('all')}
            onReset={resetFilters}
          />
        }
        ListFooterComponent={
          rows.length > 0 && named && !catalogueHasName && !ownNamed ? (
            <NotTheOne query={trimmed} onAdd={() => openAdd('dex', trimmed)} />
          ) : null
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        /*
         * 2,089 entries, most of them vector artwork — keep the window tight.
         * With numColumns these counts are ROWS, not cards: FlatList hands
         * the virtualiser one item per row. At 18 and 12 the first commit
         * built 36 cards when four to six are on screen below the header.
         * Four rows fills the first screen on the largest phone.
         *
         * No removeClippedSubviews: on iOS Fabric it puts the header and
         * cells on screen only during the scroll view's own remount pass,
         * and a missed pass blanked the whole tab (specs/06, cause 4). The
         * window below already caps what is mounted.
         */
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ref={listRef}
      />

      {showScrollTop ? (
        /*
         * Appears and disappears without a layout animation: an exit that
         * never finishes leaves a ghost button over the grid (specs/06,
         * 3.8). A floating control, so it is the one thing on this screen
         * besides the tab bar that casts the bar's tight shadow; white on a
         * drawn edge, pressed to the sunk fill, as every control answers.
         *
         * A sized, absolutely placed box with an explicit zIndex, so it
         * hit-tests above the grid rather than letting a tap through to the
         * card underneath.
         */
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Back to top"
          style={({ pressed }) => [
            styles.scrollTop,
            { bottom: insets.bottom + TAB_BAR_CLEARANCE + space.md },
            pressed && styles.scrollTopPressed,
          ]}>
          {/* No chevronUp in the set — the down chevron, turned over. */}
          <View style={styles.scrollTopIcon}>
            <Icon name="chevronDown" size={18} color={colors.text} />
          </View>
        </Pressable>
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
    paddingTop: space.md,
    gap: GRID_GAP,
  },
  gridRow: {
    gap: GRID_GAP,
  },

  /* The progress rule under the bar. Square ends: a measurement. */
  progressTrack: {
    height: stroke.indicator,
    backgroundColor: colors.bgSunk,
  },
  progressFill: {
    height: stroke.indicator,
    backgroundColor: colors.wine,
  },

  /* Back to top */
  scrollTop: {
    position: 'absolute',
    right: GRID_PAD,
    width: layout.hit,
    height: layout.hit,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    ...elevation.bar,
  },
  scrollTopPressed: { backgroundColor: colors.bgSunk },
  scrollTopIcon: {
    transform: [{ rotate: '180deg' }],
  },

  /* Header */
  progressLine: {
    marginTop: space.md,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    // Small text, so textMuted — as chipDetail below, and for its reason.
    color: colors.textMuted,
    ...tabular,
  },
  barGroup: { marginTop: space.lg },

  /* Added by you */
  shelf: { marginTop: space.lg },
  shelfHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  shelfTitle: {
    ...textRole.sectionTitle,
    flexShrink: 1,
    color: colors.text,
  },
  shelfCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    ...tabular,
  },
  /* The text button's own inset, taken back so its words end on the gutter. */
  shelfAdd: { marginRight: -space.sm },
  shelfScroll: {
    // Bleeds past the list padding so the row can scroll edge to edge.
    marginHorizontal: -GRID_PAD,
    marginTop: space.sm,
  },
  shelfScrollContent: {
    paddingHorizontal: GRID_PAD,
    gap: space.sm,
  },

  /* "Not the one you meant?" under a search */
  notTheOne: {
    paddingTop: space.xl,
    paddingBottom: space.md,
    alignItems: 'center',
    gap: space.sm,
  },
  notTheOneText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
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
  /* A square-ended rule, like the progress rule under the bar. */
  chipRule: {
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    bottom: 0,
    height: stroke.indicator,
    borderRadius: radius.none,
  },
  /* Separates the two filter axes sharing the scroller. */
  axisRule: {
    width: stroke.edge,
    alignSelf: 'center',
    height: 16,
    marginHorizontal: space.sm,
    backgroundColor: colors.line,
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

  headerRule: {
    marginTop: space.xl,
    marginBottom: space.xs,
  },

  /* Grid cards live in components/DexCard.tsx. */
});
