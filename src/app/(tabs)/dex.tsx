import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Animated,
  Keyboard,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomDrinkTile } from '@/components/CustomDrinkTile';
import { DexCard, dexCardHeight, EmptyArt } from '@/components/DexCard';
import { takeDexFilter, type CategoryFilter, type StatusFilter } from '@/components/dex/dexFilter';
import { FilterSheet } from '@/components/dex/FilterSheet';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { NumberRail } from '@/components/NumberRail';
import { formatPlateNumber } from '@/components/plate';
import { ScreenTopBar, TopBarCount, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { announce, Button, EmptyState, haptic, SearchField } from '@/components/ui';
import { CATEGORY_META, colors, layout, space, textRole } from '@/constants/theme';
import { COUNT_BY_CATEGORY, DRINKS, formatCount, getDrink, TOTAL } from '@/data';
import { catalogueTwin, ownTwin, shortQuery } from '@/lib/customDrinks';
import { isDexNumberPrefix, parseDexNumber } from '@/lib/drinkSearch';
import { useCollection } from '@/store/collection';
import { useCustomDrinks } from '@/store/customDrinks';
import type { CustomDrink, Drink, DrinkCategory, UnlockRecord } from '@/types';

/* ==================================================================== */
/* The Dex                                                              */
/*                                                                      */
/* v4, less stuff (layout spec 5.2; specs/v4-changes.md section 4).     */
/* Jan: "I want less stuff. it looks really clumped up". At rest the    */
/* screen is the bar, one field and the drinks:                         */
/*                                                                      */
/*   THE BAR     "Dex", and "38 / 2,089" on its baseline, which opens   */
/*               Dex progress (/stats): the ruler, the rank, the latest */
/*               catch and "See your 38" live there now.                */
/*   THE FIELD   "Search a name or number", with the sliders glyph at   */
/*               its end opening the filter sheet (the old chip row).   */
/*   THE GRID    every drink in Dex-number order, two to a row: a big   */
/*               square print and its Playfair name, nothing else.      */
/*               Caught is the colour print with the name in ink; not   */
/*               yet, the grey proof of the same frame with the name    */
/*               muted. No plates, ranges, shelves, chips or tags.      */
/*                                                                      */
/* By number, not by shelf (v3.3): search and the filters narrow the    */
/* grid without reordering it. A number typed into the field jumps the  */
/* grid there and outlines the tile for a moment; the Nº rail jumps by  */
/* number as you drag, and shows only while the grid is moving.         */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* Grid geometry                                                       */
/* ------------------------------------------------------------------ */

/*
 * Two columns (layout spec 5.2): 184pt prints at 440, 160 at 393. A
 * third column made every drink a stamp; two make each one a picture.
 */
const COLUMNS = 2;
const GUTTER = layout.gutter;
const GAP = layout.dexGap;
/** Between rows: the mock's 24 (layout.dexLedge). */
const ROW_GAP = layout.dexLedge;
/**
 * Two lines of name reserved under every print, so a row whose names both
 * fit on one line stands as tall as one where a name wraps, and the rows
 * go down the screen at one pitch: at 393pt a third of the names wrap.
 */
const NAME_LINES = 2;
/** From the bar to the field, and from the field to the first row (layout spec 5.2: 122 and 190). */
const FIELD_TOP = space.sm;
const FIELD_FOOT = layout.group;

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
 * browsing, not ranked for picking one drink. A query that is only a
 * number is not searched at all: lib/drinkSearch's parseDexNumber reads
 * it, and the grid jumps there instead.
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
 * "jalisco", "iceland".
 */
const SEARCH_KEY = new Map(
  DRINKS.map((d) => [d.id, [d.name, d.subcategory, d.origin].map(fold).join('\n')]),
);

/** The same key for a drink someone added: a handful of them, folded per search. */
const customKey = (c: CustomDrink) => [c.name, c.subcategory, c.origin].map(fold).join('\n');

/** Own keys only: the stores are plain objects, and 'constructor' is not a drink. */
const has = (map: Record<string, unknown>, id: string) =>
  Object.prototype.hasOwnProperty.call(map, id);

/** Every catalogue drink by its number, for a typed number and the rail. */
const BY_NUMBER = new Map(DRINKS.map((d) => [d.dexNumber, d]));
/** The rail's foot and the end of the book: the highest number, which can differ from TOTAL if the numbering ever has a gap. */
const LAST_NUMBER = DRINKS[DRINKS.length - 1]?.dexNumber ?? TOTAL;

/**
 * A typed number waits this long for the next digit before the grid
 * jumps, so "127" is one jump and not three (to 1, 12 and 127). The
 * keyboard's return key goes at once.
 */
const NUMBER_SETTLE_MS = 450;

/** Catalogue drinks of one kind in the collection: the bar's count and the sheet's. */
function caughtOf(unlocks: Record<string, UnlockRecord>, category: DrinkCategory): number {
  let n = 0;
  for (const id of Object.keys(unlocks)) if (getDrink(id)?.category === category) n += 1;
  return n;
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

/** Rows of two, made before the list sees them. */
function rowsOf(list: Drink[]): Drink[][] {
  const rows: Drink[][] = [];
  for (let i = 0; i < list.length; i += COLUMNS) rows.push(list.slice(i, i + COLUMNS));
  return rows;
}

/**
 * The row holding Dex number `n`, by binary search (rows are in number
 * order). With `exact` false, the first row at or after `n` (the last row
 * when `n` is past the end): where the rail lands in a filtered grid that
 * skips `n`. -1 when there are no rows, or `exact` and no row holds it.
 */
function rowFor(rows: Drink[][], n: number, exact: boolean): number {
  let lo = 0;
  let hi = rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = rows[mid]!;
    if (row[row.length - 1]!.dexNumber >= n) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (found < 0) return exact ? -1 : rows.length - 1;
  if (exact && !rows[found]!.some((d) => d.dexNumber === n)) return -1;
  return found;
}

/**
 * A number a few components read and one writes, as a tiny store rather
 * than screen state, so a change re-renders only its readers: the number
 * at the top of the grid (the rail's thumb, which changes every time a
 * row passes under the bar) and the tile a typed number outlined (one
 * card, not 2,089).
 */
function createSignal<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
type Signal<T> = ReturnType<typeof createSignal<T>>;

/** A row counts as on screen once half of it is. */
const VIEWABILITY = { itemVisiblePercentThreshold: 50 };

/** A jump retries on the row itself once the list has drawn and measured it. */
const JUMP_RETRIES_MS = [100, 250, 500];
/**
 * How long a typed number's tile keeps its outline once the jump has
 * settled (the less-stuff judges: "outlines the tile"). Cleared by a JS
 * timer, a cut: nothing fades, so nothing can stall half drawn.
 */
const OUTLINE_MS = 1000;

/**
 * The Nº rail is scroll-only (the judges): mounted when a drag begins,
 * kept while the finger or the momentum moves the grid, and taken away
 * this long after both stop. A cut on a JS timer, never a fade.
 */
const RAIL_LINGER_MS = 1200;
/** Below this many rows (a search, a narrow filter) a flick covers the grid, and the rail would only get in the way. */
const RAIL_MIN_ROWS = 12;
/** The rail's strip at x 412–436, inside a dock that ends at the screen edge (see JumpRail). */
const RAIL_DOCK = 28;

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

/**
 * Grid cell: a thin wrapper over DexCard that owns the per-card store
 * subscriptions, so catching one drink, or outlining one, re-renders that
 * card and not every mounted cell.
 */
const GridCell = React.memo(function GridCell({
  drink,
  cardWidth,
  outline,
  onPress,
}: {
  drink: Drink;
  cardWidth: number;
  outline: Signal<number | null>;
  onPress: (id: string) => void;
}) {
  // The whole record, not just the boolean: the card shows your own pour once you have one.
  const record = useCollection((s) => (has(s.unlocks, drink.id) ? s.unlocks[drink.id] : undefined));
  const outlined = useSyncExternalStore(outline.subscribe, () => outline.get() === drink.dexNumber);
  return (
    <DexCard
      drink={drink}
      cardWidth={cardWidth}
      collected={Boolean(record)}
      userPhotoUri={record?.photoUri}
      nameLines={NAME_LINES}
      outlined={outlined}
      onPress={onPress}
    />
  );
});

/**
 * One row of the grid: two cards, stretched to the taller, so a name that
 * wraps to a third line at a large text size grows its row and leaves the
 * next row's prints level. A short last row keeps its column's width:
 * DexCard's width is explicit.
 */
const DexRow = React.memo(function DexRow({
  row,
  cardWidth,
  outline,
  onPress,
}: {
  row: Drink[];
  cardWidth: number;
  outline: Signal<number | null>;
  onPress: (id: string) => void;
}) {
  return (
    <View style={styles.row}>
      {row.map((drink) => (
        <GridCell key={drink.id} drink={drink} cardWidth={cardWidth} outline={outline} onPress={onPress} />
      ))}
    </View>
  );
});

/**
 * The field's end: the sliders glyph, which opens the filter sheet. Solid
 * while a filter is on (layout spec 5.2), and said so. A 28pt column the
 * field's full height, with 8pt of slop either side to the 44pt floor.
 * It sits in SearchField's `end` slot, after the clear ×, so the first
 * letter typed brings the × in beside it and the key never moves.
 */
const FILTER_KEY = 28;
function FilterKey({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ left: space.sm, right: space.sm }}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Filter, on' : 'Filter'}
      accessibilityHint="Choose cocktails or spirits, caught or not yet"
      style={({ pressed }) => [styles.filterKey, pressed && styles.pressed]}>
      <Icon name="sliders" size={22} color={colors.text} filled={on} />
    </Pressable>
  );
}

/**
 * A typed number the Dex does not reach ("3000", "0"): said under the
 * field rather than searched as a name, which would answer "No match" and
 * offer to add a drink called 3000. Spoken once the typing settles
 * (goToNumber), so it is not read on every digit.
 */
function NumberMiss({ n }: { n: number }) {
  return (
    <Text
      style={[textRole.small, styles.muted, styles.miss]}
      // In words, as the announcement says it: "Nº 3000" is the plate's spelling, for the eye.
      accessibilityLabel={`There is no number ${n}. The Dex runs from 1 to ${formatCount(LAST_NUMBER)}.`}>
      {`There is no ${formatPlateNumber(n)}. The Dex runs from ${formatPlateNumber(1)} to ${formatPlateNumber(LAST_NUMBER)}.`}
    </Text>
  );
}

/**
 * "Added by you", over the grid while a search finds drinks this person
 * added themselves. Never cards in the grid: the grid and its counts mean
 * "the catalogue", and a card with no number would break its order. At
 * rest the row is not drawn (less stuff); Dex progress lists them all.
 * The row follows the filters, so it never shows a drink they hide.
 */
function AddedByYou({
  drinks,
  pours,
  onOpen,
}: {
  drinks: CustomDrink[];
  pours: Record<string, UnlockRecord>;
  onOpen: (id: string) => void;
}) {
  return (
    <View style={styles.added}>
      <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink]}>
        Added by you
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // A status-bar tap scrolls the grid home, not this row.
        scrollsToTop={false}
        style={styles.addedScroll}
        contentContainerStyle={styles.addedRow}>
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
 * "margarita" always matches something, so a full grid alone would hide
 * the way to add a drink the Dex does not have.
 */
function NotTheOne({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <View style={styles.notTheOne}>
      <Text style={[textRole.small, styles.muted, styles.centred]}>Not the one you meant?</Text>
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
 * A search miss repeats the query and clears only the query, so a typo
 * made inside Spirits does not also throw away Spirits. An empty Caught
 * says how things get caught, over the proof of a drink it could be.
 * Anything else is a filter combination with nothing in it, and resets
 * the filters.
 *
 * A search that finds nothing in the whole catalogue may be a drink the
 * Dex does not have yet, so it offers to add it: it goes into this
 * person's Dex at once and to Sipply as a suggestion. One they already
 * added is in the row above, and the message points there instead. A
 * search the catalogue does answer, but only under other filters, says so
 * and clears the filters, not the words.
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
}: {
  query: string;
  /** The query finds something in the catalogue under any filter. */
  matchesCatalogue: boolean;
  /** One of the drinks in the row above has exactly this name. */
  onShelf: boolean;
  /** A drink they added has exactly this name, and the filters keep it out of the row. */
  ownHidden: string | null;
  nothingCollected: boolean;
  onClearSearch: () => void;
  onAdd: () => void;
  onClearFilters: () => void;
  onShowAll: () => void;
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
    if (matchesCatalogue || ownHidden) {
      return (
        <EmptyState
          icon="sliders"
          title="Not under these filters"
          body={
            matchesCatalogue
              ? `“${query}” is in the Dex, but the filters hide it.`
              : `You added “${ownHidden}”, but the filters hide it.`
          }
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
        art={<EmptyArt drinkId="ramos-gin-fizz" mode="proof" />}
        title="Nothing caught yet"
        body="Open any drink and post it to add it here."
        action={{ label: 'Show every drink', onPress: onShowAll }}
      />
    );
  }
  return (
    <EmptyState
      icon="sliders"
      title="No matches"
      body="Nothing in the Dex matches these filters."
      action={{ label: 'Clear filters', onPress: onClearFilters }}
    />
  );
}

/**
 * The Nº rail, pinned down the right edge between the bar and the tab
 * bar while the grid moves. Its own subscription to the top number, so a
 * row passing under the bar re-renders the rail and nothing else.
 *
 * The dock runs from the rail's strip to the screen edge and is never
 * flattened away, so the rail's touch area stops at the dock: on iOS a
 * view whose children all sit inside it rejects touches outside its
 * bounds, and the rail's own slop would otherwise reach 12pt into the
 * right-hand prints, where a tap meant for a card would jump the grid.
 *
 * `onHold` says when a finger is on the rail (a touch on it is not a drag
 * of the list, so the list's scroll events cannot say it), so the rail is
 * not taken away from under a finger that is still dragging it.
 */
const JumpRail = React.memo(function JumpRail({
  top,
  onJump,
  onHold,
  bottom,
}: {
  top: Signal<number>;
  onJump: (n: number) => void;
  onHold: (held: boolean) => void;
  bottom: number;
}) {
  const current = useSyncExternalStore(top.subscribe, top.get);
  return (
    <View
      collapsable={false}
      pointerEvents="box-none"
      onTouchStart={() => onHold(true)}
      onTouchEnd={() => onHold(false)}
      onTouchCancel={() => onHold(false)}
      style={[styles.railDock, { bottom }]}>
      <NumberRail total={LAST_NUMBER} current={current} onJump={onJump} style={styles.rail} />
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();

  /*
   * Counts, not the map itself. Subscribing to `unlocks` here would
   * re-render the screen every time a photo is swapped on an entry already
   * caught; these move only when a drink is caught or let go, which is the
   * only change the grid's filtering and the bar's count care about.
   * Catalogue drinks only (getDrink), so the count here, Dex progress's
   * and Profile's "38 drinks in your Dex" are the same 38.
   */
  const caughtCocktails = useCollection((s) => caughtOf(s.unlocks, 'cocktail'));
  const caughtSpirits = useCollection((s) => caughtOf(s.unlocks, 'spirit'));
  const collected = caughtCocktails + caughtSpirits;
  const caughtByCategory = useMemo(
    () => ({ cocktail: caughtCocktails, spirit: caughtSpirits }),
    [caughtCocktails, caughtSpirits],
  );

  /*
   * The drinks this person added, and their pours. The stable records, not
   * a list made in the selector: zustand v5 throws on a selector that
   * returns a new array each call.
   */
  const customDrinks = useCustomDrinks((s) => s.drinks);
  const customPours = useCustomDrinks((s) => s.pours);
  const customReady = useCustomDrinks((s) => s.hydrated);

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const trimmed = query.trim();
  /*
   * A query that is only a number ("127", "0127", "#127", "Nº 127") is a
   * place to go, not words to match: it leaves the grid whole and jumps to
   * that row. Every test below reads `textQuery`, which is empty while a
   * number is typed, and while only its sign is ("Nº", "#"), so the grid
   * does not flash "No match" on the way to the digits.
   */
  const dexQuery = parseDexNumber(trimmed);
  const textQuery = dexQuery === null && !isDexNumberPrefix(trimmed) ? trimmed : '';
  const filterOn = category !== 'all' || status !== 'all';

  /* The exact column, unrounded: rounding could push two cards and the gap past the row. */
  const column = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  /*
   * The grid, and whether the search finds anything in the catalogue at
   * all, under any filter: that is what tells "the filters hide it" apart
   * from "the Dex does not have it" when the grid comes back empty. One
   * pass over DRINKS, which is already in Dex-number order, so what
   * survives is the grid in order, with no sort.
   */
  const { rows, matched, matchesCatalogue } = useMemo(() => {
    const q = fold(textQuery);
    // Read-not-subscribe: the two counts above are what invalidate this memo.
    const unlocks = useCollection.getState().unlocks;
    const picked: Drink[] = [];
    let anywhere = false;
    for (const drink of DRINKS) {
      const hit = q.length === 0 || (SEARCH_KEY.get(drink.id) ?? '').includes(q);
      if (!hit) continue;
      anywhere = true;
      if (category !== 'all' && drink.category !== category) continue;
      if (status !== 'all') {
        const owned = has(unlocks, drink.id);
        if (status === 'unlocked' ? !owned : owned) continue;
      }
      picked.push(drink);
    }
    return { rows: rowsOf(picked), matched: picked.length, matchesCatalogue: anywhere };
    // The counts look unused: they are the invalidation keys for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtCocktails, caughtSpirits, textQuery, category, status]);

  /* The drinks you added that a search finds: the same filters, newest first. Not at rest. */
  const added = useMemo(() => {
    if (!customReady || textQuery.length === 0) return [];
    const q = fold(textQuery);
    return Object.values(customDrinks)
      .filter((c) => {
        if (category !== 'all' && c.category !== category) return false;
        if (status !== 'all') {
          const poured = has(customPours, c.id);
          if (status === 'unlocked' ? !poured : poured) return false;
        }
        return customKey(c).includes(q);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [customReady, customDrinks, customPours, textQuery, category, status]);

  /*
   * Whether the search is a name the Dex or this person already has,
   * folded the way the form and the server compare names. Two characters
   * at least: one letter is not a name anybody means.
   */
  const named = textQuery.length >= 2;
  const catalogueHasName = named && catalogueTwin(textQuery) !== undefined;
  const ownNamed = named && customReady ? ownTwin(textQuery, customDrinks) : undefined;

  const listRef = useRef<Animated.FlatList<Drink[]>>(null);
  /*
   * Tapping the Dex tab while already on it scrolls the grid home, the way
   * every iOS tab bar behaves (the Animated wrapper forwards its ref to the
   * list). The custom row opts out of scrollsToTop so a status-bar tap
   * reaches the grid.
   */
  useScrollToTop(listRef);

  /* ---------------- Jumping to a number ---------------- */

  /*
   * The head's height (the field and anything under it), from its own
   * layout: row 0 starts there, and an estimated jump counts from it.
   * Read in handlers, never in render.
   */
  const headH = useRef(0);
  const onHeadLayout = (e: LayoutChangeEvent) => {
    headH.current = e.nativeEvent.layout.height;
  };

  /*
   * A row's height before any is measured: the card with its two lines of
   * name, and the gap under it. With every row reserving two lines this is
   * nearly every row's height; only a three-line name at a large text size
   * differs, and the retries below correct for it.
   */
  const rowEstimate = dexCardHeight(column, fontScale, NAME_LINES) + ROW_GAP;

  /*
   * Most of the 1,045 rows have never been laid out, so the list cannot
   * know exactly where row 400 is. The first scrollToIndex falls back to an
   * estimate (the head plus the average row), the window draws the rows
   * around it, and the retries land on the row itself, now measured. A new
   * jump, or a finger on the list, cancels the retries, so nothing yanks
   * the grid back afterwards.
   */
  const jump = useRef<{ index: number; timers: ReturnType<typeof setTimeout>[] } | null>(null);
  const cancelJump = useCallback(() => {
    const j = jump.current;
    if (j) for (const t of j.timers) clearTimeout(t);
    jump.current = null;
  }, []);
  useEffect(() => cancelJump, [cancelJump]);

  /*
   * The rows the list holds now, set in the commit itself (a layout
   * effect runs before any timer can), so a retry can tell that a filter
   * or a keystroke has changed the grid under it. Its row index would then
   * mean another row, or be past the end, where scrollToIndex throws.
   */
  const committedRows = useRef(rows);
  useLayoutEffect(() => {
    committedRows.current = rows;
  }, [rows]);

  const scrollToRow = useCallback(
    (index: number) => {
      cancelJump();
      const forRows = committedRows.current;
      if (index < 0 || index >= forRows.length) return;
      const j = { index, timers: [] as ReturnType<typeof setTimeout>[] };
      const go = () => {
        if (committedRows.current !== forRows) {
          if (jump.current === j) cancelJump();
          return;
        }
        listRef.current?.scrollToIndex({ index, animated: false });
      };
      jump.current = j;
      go();
      for (const ms of JUMP_RETRIES_MS) {
        j.timers.push(
          setTimeout(() => {
            if (jump.current === j) go();
          }, ms),
        );
      }
    },
    [cancelJump],
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const row = info.averageItemLength > 0 ? info.averageItemLength : rowEstimate;
      listRef.current?.scrollToOffset({ offset: headH.current + row * info.index, animated: false });
    },
    [rowEstimate],
  );

  /*
   * The tile a typed number jumped to, outlined (DexCard `outlined`) from
   * the jump until OUTLINE_MS after its last retry, by when the grid has
   * settled on it. A signal, so only that card re-renders.
   */
  const [outline] = useState(() => createSignal<number | null>(null));
  const outlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTile = useCallback(
    (n: number) => {
      if (outlineTimer.current) clearTimeout(outlineTimer.current);
      outline.set(n);
      outlineTimer.current = setTimeout(
        () => {
          outlineTimer.current = null;
          outline.set(null);
        },
        JUMP_RETRIES_MS[JUMP_RETRIES_MS.length - 1]! + OUTLINE_MS,
      );
    },
    [outline],
  );
  useEffect(
    () => () => {
      if (outlineTimer.current) clearTimeout(outlineTimer.current);
    },
    [],
  );

  /** The rail: the row holding `n`, or the next one a filter left in. */
  const jumpByRail = useCallback(
    (n: number) => {
      const index = rowFor(rows, n, false);
      if (index >= 0) scrollToRow(index);
    },
    [rows, scrollToRow],
  );

  /*
   * A number typed into the field. In the grid: go, outline it, and say
   * where. Hidden by a filter: clear the filters (a typed number means that
   * drink, whatever the sheet says) and go once the grid holds it. Past the
   * end: say how far the Dex runs.
   */
  const pendingJump = useRef<number | null>(null);
  const goToNumber = (n: number) => {
    const drink = BY_NUMBER.get(n);
    if (!drink) {
      announce(`There is no number ${n}. The Dex runs from 1 to ${formatCount(LAST_NUMBER)}.`);
      return;
    }
    const index = rowFor(rows, n, true);
    if (index >= 0) {
      scrollToRow(index);
      flashTile(n);
      announce(`Number ${n}, ${drink.name}`);
      return;
    }
    if (!filterOn) return;
    pendingJump.current = n;
    setCategory('all');
    setStatus('all');
  };

  const settlePendingJump = useEffectEvent(() => {
    const n = pendingJump.current;
    if (n === null) return;
    const index = rowFor(rows, n, true);
    if (index < 0) return;
    pendingJump.current = null;
    scrollToRow(index);
    flashTile(n);
    announce(`Number ${n}, ${BY_NUMBER.get(n)?.name ?? ''}`);
  });
  // The filters were cleared for a typed number: jump once the grid has the rows that hold it.
  useEffect(() => {
    settlePendingJump();
  }, [rows]);

  const numberSettled = useEffectEvent((n: number) => goToNumber(n));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (dexQuery === null) return;
    const t = setTimeout(() => numberSettled(dexQuery), NUMBER_SETTLE_MS);
    searchTimer.current = t;
    return () => clearTimeout(t);
  }, [dexQuery]);

  /* The keyboard's return key: a typed number goes at once, without the settle. */
  const onSubmitSearch = () => {
    if (dexQuery === null) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    goToNumber(dexQuery);
  };

  /*
   * The number at the top of the grid, for the rail. A stable callback:
   * FlatList refuses an onViewableItemsChanged that changes identity.
   */
  const [topNumber] = useState(() => createSignal(1));
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<Drink[]>[] }) => {
      let first: ViewToken<Drink[]> | undefined;
      for (const v of viewableItems) {
        if (v.isViewable && v.index != null && (first?.index == null || v.index < first.index)) first = v;
      }
      const lead = first?.item?.[0];
      if (lead) topNumber.set(lead.dexNumber);
    },
    [topNumber],
  );

  /* ---------------- The rail, while the grid moves ---------------- */

  /*
   * Mounted on a drag's first frame and cut RAIL_LINGER_MS after the drag,
   * its momentum and any finger on the rail itself have all stopped. Never
   * at rest: a jump by a typed number moves the grid with no drag, so it
   * never shows the rail either.
   */
  const [railOn, setRailOn] = useState(false);
  const railHeld = useRef(false);
  const railTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepRail = useCallback(() => {
    if (railTimer.current) clearTimeout(railTimer.current);
    railTimer.current = null;
  }, []);
  const lingerRail = useCallback(() => {
    keepRail();
    if (railHeld.current) return;
    railTimer.current = setTimeout(() => {
      railTimer.current = null;
      setRailOn(false);
    }, RAIL_LINGER_MS);
  }, [keepRail]);
  useEffect(() => keepRail, [keepRail]);
  const onRailHold = useCallback(
    (held: boolean) => {
      railHeld.current = held;
      if (held) keepRail();
      else lingerRail();
    },
    [keepRail, lingerRail],
  );

  const onScrollBeginDrag = () => {
    cancelJump();
    keepRail();
    setRailOn(true);
  };

  /*
   * The bar's rule, once the field has moved under it. useScrolledPast
   * writes state only when the side changes; a write per frame would
   * re-render the screen on every pixel. The grid is also the Dex tab's
   * scroll source for ScrollChrome: a native-driven event, with the rule's
   * signal riding along as its JS listener.
   */
  const [scrolled, onScrollRule] = useScrolledPast();
  const { onScroll } = useTabScroll('dex', onScrollRule);

  /* ---------------- Navigation ---------------- */

  const openDrink = useCallback(
    (id: string) => {
      router.navigate({ pathname: '/drink/[id]', params: { id } });
    },
    [router],
  );

  const openCustom = useCallback(
    (id: string) => {
      router.navigate({ pathname: '/custom/[id]', params: { id } });
    },
    [router],
  );

  /*
   * The add-a-drink form, named after the search (`from=dex`). A filtered
   * Dex passes its kind, so someone browsing Spirits starts on a spirit.
   */
  const openAdd = useCallback(
    (name?: string) => {
      router.push({
        pathname: '/add-drink',
        params: {
          from: 'dex',
          ...(name ? { name } : null),
          ...(category !== 'all' ? { category } : null),
        },
      });
    },
    [category, router],
  );

  /*
   * On focus: Dex progress's "See your 38" leaves the filter it wants
   * (dexFilter), taken here once, with the grid back at its top; and the
   * add-a-drink form leaves a note saying where to go next (the entry just
   * added, or the catalogue drink an "Already in the Dex?" row pointed at).
   */
  useFocusEffect(
    useCallback(() => {
      const f = takeDexFilter();
      if (f) {
        cancelJump();
        setQuery('');
        setCategory(f.category);
        setStatus(f.status);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      const h = useCustomDrinks.getState().takeHandoff('dex');
      if (!h) return;
      if (h.kind === 'custom') router.navigate({ pathname: '/custom/[id]', params: { id: h.id } });
      else router.navigate({ pathname: '/drink/[id]', params: { id: h.id } });
    }, [cancelJump, router]),
  );

  const renderItem = useCallback(
    ({ item }: { item: Drink[] }) => (
      <DexRow row={item} cardWidth={column} outline={outline} onPress={openDrink} />
    ),
    [column, outline, openDrink],
  );

  /* The empty grid's buttons are plain Buttons, so they tick here; the sheet's chips tick themselves. */
  const showAll = useCallback(() => {
    haptic.select();
    setStatus('all');
  }, []);

  const clearFilters = useCallback(() => {
    haptic.select();
    setCategory('all');
    setStatus('all');
  }, []);

  const openFilter = () => {
    // The sheet is a Modal: the keyboard would otherwise stay up behind its scrim.
    Keyboard.dismiss();
    setSheetOpen(true);
  };

  /*
   * The bar's quiet count: caught of all, or, with a kind chosen in the
   * filter sheet, caught of that kind ("12 / 1,190"). Caught or Not yet
   * narrows the tiles, not the fraction: "0 / 2,051" under Not yet would
   * read as a collection lost.
   */
  const scopeTotal = category === 'all' ? TOTAL : COUNT_BY_CATEGORY[category];
  const scopeCaught = category === 'all' ? collected : caughtByCategory[category];
  const scopeWords = category === 'all' ? 'in your Dex' : `${CATEGORY_META[category].plural.toLowerCase()} in your Dex`;

  const head = (
    <View onLayout={onHeadLayout} style={styles.head}>
      {/*
        The app's one search field. The placeholder names the two things it
        takes; style and country still match, for browsing.
      */}
      <SearchField
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={onSubmitSearch}
        placeholder="Search a name or number"
        accessibilityLabel="Search the Dex by name or number"
        end={<FilterKey on={filterOn} onPress={openFilter} />}
      />
      {dexQuery !== null && !BY_NUMBER.has(dexQuery) ? <NumberMiss n={dexQuery} /> : null}
      {added.length > 0 ? <AddedByYou drinks={added} pours={customPours} onOpen={openCustom} /> : null}
    </View>
  );

  const footer =
    matched > 0 && named && !catalogueHasName && !ownNamed ? (
      <NotTheOne query={textQuery} onAdd={() => openAdd(textQuery)} />
    ) : null;

  return (
    <View style={styles.screen}>
      {/* A fixed bar: the screen's name, and the count that opens Dex progress. The rule shows once the field is under it. */}
      <ScreenTopBar
        size="lg"
        title="Dex"
        showRule={scrolled}
        right={
          <TopBarCount
            text={`${formatCount(scopeCaught)} / ${formatCount(scopeTotal)}`}
            onPress={() => router.push('/stats')}
            accessibilityLabel={`${formatCount(scopeCaught)} of ${formatCount(scopeTotal)} ${scopeWords}`}
            accessibilityHint="Opens Dex progress"
          />
        }
      />

      <View style={styles.body}>
        <Animated.FlatList<Drink[]>
          ref={listRef}
          data={rows}
          renderItem={renderItem}
          keyExtractor={(row) => row[0]!.id}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          ListHeaderComponent={head}
          ListEmptyComponent={
            <GridEmpty
              query={textQuery}
              matchesCatalogue={matchesCatalogue}
              onShelf={ownNamed !== undefined && added.includes(ownNamed)}
              ownHidden={ownNamed !== undefined && !added.includes(ownNamed) ? ownNamed.name : null}
              nothingCollected={status === 'unlocked' && collected === 0}
              onClearSearch={() => setQuery('')}
              onAdd={() => openAdd(textQuery)}
              onClearFilters={clearFilters}
              onShowAll={showAll}
            />
          }
          ListFooterComponent={footer}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={lingerRail}
          onMomentumScrollBegin={keepRail}
          onMomentumScrollEnd={lingerRail}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          /*
           * 2,089 drinks in 1,045 rows of two: keep the window tight. Three
           * rows fill the first screen under the field on the largest phone;
           * a batch of three rows is six cards. The window is four screens.
           *
           * No removeClippedSubviews: on iOS Fabric it puts the header and
           * cells on screen only during the scroll view's own remount pass,
           * and a missed pass blanked the whole tab (specs/06, cause 4). The
           * window below already caps what is mounted.
           */
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          updateCellsBatchingPeriod={50}
          windowSize={4}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />

        {railOn && rows.length >= RAIL_MIN_ROWS ? (
          <JumpRail
            top={topNumber}
            onJump={jumpByRail}
            onHold={onRailHold}
            bottom={insets.bottom + layout.tabBar + space.sm}
          />
        ) : null}
      </View>

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        category={category}
        status={status}
        caughtByCategory={caughtByCategory}
        onCategory={setCategory}
        onStatus={setStatus}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  list: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  centred: { textAlign: 'center' },
  pressed: { opacity: 0.6 },

  /* The head: the field, and what a search adds under it. */
  head: { paddingHorizontal: GUTTER, paddingTop: FIELD_TOP, paddingBottom: FIELD_FOOT },
  filterKey: {
    alignSelf: 'stretch',
    width: FILTER_KEY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miss: { marginTop: space.md },

  /* Added by you, while a search finds one: the row scrolls edge to edge. */
  added: { marginTop: space.xl },
  addedScroll: { marginHorizontal: -GUTTER, marginTop: space.md },
  addedRow: { paddingHorizontal: GUTTER, gap: space.lg, alignItems: 'flex-start' },

  /* The grid: the row's gap is its own foot, so a row's height is the list's pitch. */
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: GAP,
    paddingHorizontal: GUTTER,
    paddingBottom: ROW_GAP,
  },

  /*
   * The rail's dock: from the rail's strip (x 412 at 440) to the screen
   * edge, under the bar to just above the tab bar. The rail sits 4pt in
   * from the edge, so its strip spans x 412–436.
   */
  railDock: {
    position: 'absolute',
    top: space.sm,
    right: 0,
    width: RAIL_DOCK,
  },
  /* NumberRail's own 24pt width, at the dock's left: 4pt short of the edge. */
  rail: { flex: 1 },

  /* "Not the one you meant?" under a search */
  notTheOne: {
    paddingTop: space.sm,
    paddingBottom: space.md,
    paddingHorizontal: GUTTER,
    alignItems: 'center',
    gap: space.sm,
  },
});
