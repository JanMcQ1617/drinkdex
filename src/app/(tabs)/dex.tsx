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
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatPlateNumber, formatRange, NumberRail, SHELF_HEIGHT, WalnutShelf } from '@/components/brass';
import { CustomDrinkTile } from '@/components/CustomDrinkTile';
import { DexCard, dexCardHeight, EmptyArt } from '@/components/DexCard';
import { DexHead } from '@/components/dex/LatestCatch';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { announce, Button, Chip, EmptyState, haptic, SearchField } from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  elevation,
  fonts,
  layout,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, DRINKS, formatCount, TOTAL } from '@/data';
import { catalogueTwin, ownTwin, shortQuery } from '@/lib/customDrinks';
import { isDexNumberPrefix, parseDexNumber } from '@/lib/drinkSearch';
import { useCollection } from '@/store/collection';
import { useCustomDrinks } from '@/store/customDrinks';
import type { CustomDrink, Drink, DrinkCategory, UnlockRecord } from '@/types';

/* ==================================================================== */
/* The Dex                                                              */
/*                                                                      */
/* A collector's cabinet (specs/v3-cabinet.md §9.7), fitted out as a    */
/* back bar (v3.3 Brass, specs/v3-3-mockups/brass, screen 2). The whole */
/* screen stands on the lining:                                         */
/*                                                                      */
/*   THE HEAD   the figure ("38 in your Dex, of 2,089 · 1.8%"), the     */
/*              latest catch, the brass gauge with a mark for every     */
/*              caught drink at its number, the search well, the        */
/*              filter chips with their counts, the drinks you added.   */
/*              It scrolls away with the list.                          */
/*   THE GRID   the whole catalogue in Dex-number order, Nº 0001 to     */
/*              Nº 2089, three to a row, every row standing on a walnut */
/*              shelf whose brass holder names its numbers              */
/*              ("0001 – 0003"). A collected drink is a mount seated in */
/*              the lining, one not yet caught a recess pressed into    */
/*              it.                                                     */
/*                                                                      */
/* By number, not by shelf. v3 cut the grid into 47 style shelves with  */
/* sticky headers ("Fizz", "Scotch"), and Jan, using build 17, asked    */
/* for the drinks by number instead (specs/v3.3-changes.md section 5):  */
/* a Dex is read in its own order. Search and the filters narrow the    */
/* grid without reordering it; a number typed into the search jumps to  */
/* it, and the brass rail down the right edge jumps by number as you    */
/* drag (grafts 9 and 2), because 697 rows is a long way to flick.      */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* Grid geometry                                                       */
/* ------------------------------------------------------------------ */

/*
 * Three columns, as the Brass mock sets the grid. Two made every card a
 * fair photograph, but 2,089 entries at two to a row was 1,045 rows and a
 * screen held five drinks. With the mat cut to 8pt (DexCard) and a square
 * window, a third of the width still frames a glass well enough to tell
 * a coupe from a flute.
 */
const COLUMNS = 3;
/** The screen gutter: 16, as on every screen. The number rail lives in the right one. */
const GRID_PAD = layout.gutter;
const GRID_GAP = layout.dexGap;
/** Chips carry 6pt of slop above and below; the scroller makes room so it is not clipped. */
const CHIP_SLOP = 6;
/** From the head's last element to the first row: the mock's 16. */
const FRONT_FOOT = 16;
/** From the top bar to the head's figure: the mock's 8. */
const FRONT_TOP = 8;
/**
 * A row stands on its shelf: 2pt of lining between the cards' feet and
 * the shelf's top face, and 6pt under the shelf before the next row's
 * tops, where the shelf's shade falls (the mock's pitch: 196 + 2 + 24 + 6).
 */
const SHELF_ABOVE = 2;
const SHELF_BELOW = 6;

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

type CategoryFilter = DrinkCategory | 'all';
type StatusFilter = 'all' | 'unlocked' | 'locked';

/*
 * The second axis has no "All" of its own: neither chip on is every entry,
 * and a second tap on the one that is on turns it off again. The first
 * axis's "All" already says "everything" once; two "All" chips in one row
 * read as a mistake.
 */
const STATUS_OPTIONS: { key: Exclude<StatusFilter, 'all'>; label: string; a11y: string }[] = [
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

/** Every catalogue drink by its number, for a typed number and the rail. */
const BY_NUMBER = new Map(DRINKS.map((d) => [d.dexNumber, d]));
/** The rail's foot and the end of the book: the highest number, which can differ from TOTAL if the numbering ever has a gap. */
const LAST_NUMBER = DRINKS[DRINKS.length - 1]?.dexNumber ?? TOTAL;

/**
 * A typed number waits this long for the next digit before the grid
 * jumps, so "127" is one jump and not three (to 1, 12 and 127). The
 * keyboard's Search key goes at once.
 */
const NUMBER_SETTLE_MS = 450;

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

/** Rows of three, made before the list sees them (as Profile's grid does). */
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
 * The Dex number at the top of the grid, for the rail's VoiceOver value.
 * A tiny store rather than screen state: it changes every time a row
 * passes under the bar, and as state it would re-render the whole screen
 * (head, chips, list) on each one. Only the rail subscribes.
 */
function createTopNumber() {
  let value = 1;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(n: number) {
      if (n === value) return;
      value = n;
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
type TopNumber = ReturnType<typeof createTopNumber>;

/** A row counts as on screen once half of it is. */
const VIEWABILITY = { itemVisiblePercentThreshold: 50 };

/** A jump retries on the row itself once the list has drawn and measured it. */
const JUMP_RETRIES_MS = [100, 250, 500];

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

/**
 * Scroll depth at which the back-to-top button appears: about one screen
 * of cards below the head, where getting back up starts to take more
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
  cardWidth,
  onPress,
}: {
  drink: Drink;
  cardWidth: number;
  onPress: (id: string) => void;
}) {
  // The whole record, not just the boolean: the card shows the user's own
  // pour photo once one exists. Still a single-entry subscription, so
  // collecting one drink does not re-render the others.
  const record = useCollection((s) => (has(s.unlocks, drink.id) ? s.unlocks[drink.id] : undefined));
  return (
    <DexCard
      drink={drink}
      cardWidth={cardWidth}
      collected={Boolean(record)}
      userPhotoUri={record?.photoUri}
      onLining
      onPress={onPress}
    />
  );
});

/**
 * One row of the grid: three cards, stretched to the tallest, so a name
 * that wraps to three lines beside two that do not still ends every
 * window on one line (DexCard's window takes the slack). A short last row
 * keeps its columns' widths: DexCard's width is explicit.
 */
const DexRow = React.memo(function DexRow({
  row,
  cardWidth,
  onPress,
}: {
  row: Drink[];
  cardWidth: number;
  onPress: (id: string) => void;
}) {
  return (
    <View style={styles.row}>
      {row.map((drink) => (
        <GridCell key={drink.id} drink={drink} cardWidth={cardWidth} onPress={onPress} />
      ))}
    </View>
  );
});

/**
 * The walnut shelf a row stands on (Brass D9), drawn as the list's
 * separator so its holder can name the row above from `leadingItem` with
 * no bookkeeping: "0001 – 0003", or, while a filter is on, that row's
 * first and last number ("0004 – 0011"), so a fast scroll still says
 * where in the book you are. One strip of shared walnut per row, never
 * an image per card. The seed is the row's place in the unfiltered grid,
 * so a shelf keeps its grain when a filter moves it.
 *
 * Decorative: each card says its own number.
 */
function Shelf({ leadingItem }: { leadingItem?: Drink[] }) {
  const first = leadingItem?.[0];
  const last = leadingItem?.[leadingItem.length - 1];
  if (!first || !last) return null;
  return (
    <WalnutShelf
      seed={Math.floor((first.dexNumber - 1) / COLUMNS)}
      range={formatRange(first.dexNumber, last.dexNumber)}
      style={styles.shelf}
    />
  );
}

/**
 * One line at the foot of the head while a filter or the search narrows
 * the grid: "In Dex order" on the left, "312 shown" on the right, so a
 * search or a chip is answered with a number. Unnarrowed it is not drawn:
 * the figure above already says "38 in your Dex, of 2,089", and the
 * Brass mock runs the chips straight into the grid.
 *
 * Inter helper text in the lining's muted ink, figures tabular so a count
 * changing under a keystroke does not jitter. Wrapping, so at large text
 * the count drops under the words. One VoiceOver heading.
 */
function TrayHead({ figure, afterChips }: { figure: string; afterChips: boolean }) {
  return (
    <View
      style={[styles.trayHead, afterChips && styles.trayHeadAfterChips]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`In Dex order, ${figure}`}>
      <Text style={styles.trayHeadText}>In Dex order</Text>
      <Text style={styles.trayHeadText}>{figure}</Text>
    </View>
  );
}

/**
 * A typed number the Dex does not reach ("3000", "0"): said in the head's
 * foot line rather than searched as a name, which would answer "No match"
 * and offer to add a drink called 3000. Spoken once the typing settles
 * (goToNumber), so it is not read on every digit.
 */
function NumberMiss({ n, afterChips }: { n: number; afterChips: boolean }) {
  return (
    <View
      style={[styles.trayHead, afterChips && styles.trayHeadAfterChips]}
      accessible
      // In words, as the announcement says it: "Nº 3000" is the plate's spelling, for the eye.
      accessibilityLabel={`There is no number ${n}. The Dex runs from 1 to ${formatCount(LAST_NUMBER)}.`}>
      <Text style={styles.trayHeadText}>
        {`There is no ${formatPlateNumber(n)}. The Dex runs from ${formatPlateNumber(1)} to ${formatPlateNumber(LAST_NUMBER)}.`}
      </Text>
    </View>
  );
}

/**
 * "Added by you": the drinks this person added themselves, in the head
 * above the grid.
 *
 * A shelf of its own and never cards in the grid. The grid, its chips
 * ("All 2,089") and the figure mean "the catalogue"; a custom card among
 * them would make every count on this screen wrong, and a card with no
 * number would break the grid's Dex-number order. The shelf follows the
 * same filters (category, collected, the search) so it never shows a
 * drink the filters above it say is not there.
 *
 * Newest first: the one just added is the one being looked for. Tiles
 * align to the top, so one long name grows its own tile, not the row.
 * On the lining since v3.3: bone title, muted count, the bone text link.
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
    <View style={styles.added}>
      <View style={styles.addedHead}>
        {/*
          One heading with its count, read together ("Added by you 3"). The
          count sits on the title's baseline, a step down and muted, as the
          filter chips print theirs.
        */}
        <Text style={styles.addedTitle} accessibilityRole="header">
          Added by you<Text style={styles.addedCount}>{`  ${formatCount(drinks.length)}`}</Text>
        </Text>
        <Button
          label="Add a drink"
          variant="onLiningText"
          size="sm"
          icon="plus"
          onPress={onAdd}
          accessibilityHint="Opens a form to add a drink that is not in the Dex"
          style={styles.addedAdd}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // A status-bar tap scrolls the grid home, not this row.
        scrollsToTop={false}
        style={styles.addedScroll}
        contentContainerStyle={styles.addedScrollContent}>
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
 * the way to add a drink the Dex does not have. On the lining, under the
 * last shelf.
 */
function NotTheOne({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <View style={styles.notTheOne}>
      <Text style={styles.notTheOneText}>Not the one you meant?</Text>
      <Button
        label={`Add “${shortQuery(query)}”`}
        variant="onLiningOutline"
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
 * away Spirits. An empty Collected says how things get collected, over a
 * recess of the drink it could be. Anything else is a filter combination
 * with nothing in it, and resets the filters.
 *
 * A search that finds nothing in the whole catalogue may be a drink the
 * Dex does not have yet, so it offers to add it: it goes into this
 * person's Dex at once and to Sipply as a suggestion. One they already
 * added is on the shelf above, and the message points there instead. A
 * search that the catalogue does answer, but only under other filters,
 * says so and clears the filters, not the words; so does a name they
 * added themselves that the filters keep off the shelf, rather than
 * offering to add it a second time.
 *
 * Every answer is drawn on the lining, the grid it stands in for.
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
          tone="lining"
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
          tone="lining"
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
          tone="lining"
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
          tone="lining"
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
        tone="lining"
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
        tone="lining"
        art={<EmptyArt drinkId="ramos-gin-fizz" mode="ghost" onLining />}
        title="Nothing collected yet"
        body="Open any entry and post it to add it here."
        action={{ label: 'Show every entry', onPress: onShowAll }}
      />
    );
  }
  return (
    <EmptyState
      tone="lining"
      icon="filter"
      title="No matches"
      body="Nothing in the Dex matches these filters."
      action={{ label: 'Clear filters', onPress: onReset }}
    />
  );
}

/**
 * The number rail (graft 2), pinned in the right gutter between the top
 * bar and the tab bar. Its own subscription to the top number, so a row
 * passing under the bar re-renders the rail and nothing else.
 *
 * The dock is exactly the 16pt gutter and is never flattened away, so the
 * rail's touch area stops at the gutter: on iOS a view whose children all
 * sit inside it rejects touches outside its bounds, and the rail's own
 * hitSlop would otherwise reach 12pt into the third column, where a tap
 * meant for a card would jump the grid instead.
 */
const JumpRail = React.memo(function JumpRail({
  top,
  onJump,
  bottom,
}: {
  top: TopNumber;
  onJump: (n: number) => void;
  bottom: number;
}) {
  const current = useSyncExternalStore(top.subscribe, top.get);
  return (
    <View collapsable={false} pointerEvents="box-none" style={[styles.railDock, { bottom }]}>
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
   * Membership size, not the map itself. Subscribing to `unlocks` here would
   * re-render the screen every time a photo is swapped on an entry already
   * collected; the count moves only when something is added or removed, which
   * is the only change the grid's filtering and its head's count care about.
   * (The head subscribes to the map itself: its gauge marks every number.)
   *
   * A plain key count is honest here because the store keeps `unlocks` to
   * catalogue ids only: records for drinks that left the index are moved
   * aside when the collection loads (see settle() in store/collection), and
   * drinks people add themselves live in a store of their own
   * (store/customDrinks), so this screen, Stats and the celebrations all
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
   * A query that is only a number ("127", "Nº 127") is a place to go, not
   * words to match: it leaves the grid whole and jumps to that row. Every
   * test below reads `textQuery`, which is empty while a number is typed,
   * and while only its sign is ("Nº", "#"), so the grid does not flash
   * "No match" on the way to the digits.
   */
  const dexQuery = parseDexNumber(trimmed);
  const textQuery = dexQuery === null && !isDexNumberPrefix(trimmed) ? trimmed : '';

  /*
   * The card width is the exact column, unrounded: rounding it could push
   * three cards and the gaps past the row by a point or two.
   */
  const column = (width - GRID_PAD * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

  /*
   * The grid, and whether the search finds anything in the catalogue at
   * all, under any filter: that is what tells "the filters hide it" apart
   * from "the Dex does not have it" when the grid comes back empty. One
   * pass over DRINKS, which is already in Dex-number order (data/index),
   * so what survives the search, category and status tests is the grid in
   * order, with no sort. A plain loop rather than filter callbacks, so the
   * flag is a local of this function and not a variable a callback
   * reassigns.
   */
  const { rows, matched, matchesCatalogue } = useMemo(() => {
    const q = fold(textQuery);
    // Read-not-subscribe: `collected` above is what invalidates this memo.
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
    // `collected` looks unused — it is the invalidation key for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collected, textQuery, category, status]);

  const narrowed = textQuery.length > 0 || category !== 'all' || status !== 'all';

  /* The drinks you added: the same three filters, newest first. */
  const added = useMemo(() => {
    if (!customReady) return [];
    const q = fold(textQuery);
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
   * every iOS tab bar behaves (react-navigation calls the FlatList's
   * scrollToOffset; the Animated wrapper forwards its ref to the list). The
   * chip and Added by you scrollers opt out of scrollsToTop so a
   * status-bar tap reaches the grid, not them.
   */
  useScrollToTop(listRef);

  /* ---------------- Jumping to a number ---------------- */

  /*
   * The head's height, from its own layout: row 0 starts there, and an
   * estimated jump counts from it. Read in handlers, never in render.
   */
  const headH = useRef(0);
  const onHeadLayout = (e: LayoutChangeEvent) => {
    headH.current = e.nativeEvent.layout.height;
  };

  /*
   * A row's height before any is measured: the card and the shelf under
   * it. Only a jump made before the list has laid out a row uses it; after
   * that the list's own average does.
   */
  const rowEstimate = dexCardHeight(column, fontScale) + SHELF_ABOVE + SHELF_HEIGHT + SHELF_BELOW;

  /*
   * Rows vary in height (a long name takes a third line), and most of the
   * 697 have never been laid out, so the list cannot know where row 400
   * is. The first scrollToIndex falls back to an estimate (the head plus
   * the average row), the window draws the rows around it, and the retries
   * land on the row itself, now measured. A new jump, or a finger on the
   * list, cancels the retries, so nothing yanks the grid back afterwards.
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
   * effect runs before any timer can), so a retry can tell that a chip or
   * a keystroke has changed the grid under it. Its row index would then
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

  /** The rail: the row holding `n`, or the next one a filter left in. */
  const jumpByRail = useCallback(
    (n: number) => {
      const index = rowFor(rows, n, false);
      if (index >= 0) scrollToRow(index);
    },
    [rows, scrollToRow],
  );

  /*
   * A number typed into the search. In the grid: go, and say where. Hidden
   * by a filter: clear the category and status (a typed number means that
   * drink, whatever the chips say) and go once the grid holds it. Past the
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
      announce(`Number ${n}, ${drink.name}`);
      return;
    }
    if (category === 'all' && status === 'all') return;
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

  /* The keyboard's Search key: a typed number goes at once, without the settle. */
  const onSubmitSearch = () => {
    if (dexQuery === null) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    goToNumber(dexQuery);
  };

  /*
   * The number at the top of the grid, for the rail. A stable callback:
   * FlatList refuses an onViewableItemsChanged that changes identity.
   */
  const [topNumber] = useState(createTopNumber);
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

  /* ---------------- Scroll signals ---------------- */

  /*
   * The bar's rail, once the head has moved under it; the back-to-top
   * button, which mounts on a state flag rather than on an animated
   * opacity, so a hidden button cannot swallow taps over the grid; and the
   * number rail, which appears once the grid itself has reached the bar.
   * Not before: at rest the right gutter belongs to the gauge, the search
   * well and the chip row's scroll, and a rail there would take a swipe
   * meant for the chips.
   *
   * useScrolledPast compares each scroll event with where the list last
   * was on either side of the line, not with the event before it, so a
   * list that arrives past the line without crossing it (a restored
   * offset, a preserved tab position) shows the button at its first scroll
   * event. Each writes state only when its side changes; a write per frame
   * would re-render the screen on every pixel.
   */
  const [scrolled, onScrollRule] = useScrolledPast();
  const [showScrollTop, onScrollTop] = useScrolledPast(SCROLL_TOP_SHOW_AT);
  const [railOn, setRailOn] = useState(false);
  const railOnRef = useRef(false);
  const onScrolledPast = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScrollRule(e);
    onScrollTop(e);
    // A point of slack: a jump to row 0 lands on the head's measured height, give or take rounding.
    const past = headH.current > 0 && e.nativeEvent.contentOffset.y >= headH.current - 1;
    if (past !== railOnRef.current) {
      railOnRef.current = past;
      setRailOn(past);
    }
  };
  /*
   * The grid is the Dex tab's scroll source for the tab bar's compaction
   * (ScrollChrome): a native-driven event, with the signals above riding
   * along as its JS listener.
   */
  const { onScroll } = useTabScroll('dex', onScrolledPast);

  const scrollToTop = useCallback(() => {
    cancelJump();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [cancelJump]);

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

  const openPost = useCallback(() => router.navigate('/log'), [router]);

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
      if (h.kind === 'custom') router.navigate({ pathname: '/custom/[id]', params: { id: h.id } });
      else router.navigate({ pathname: '/drink/[id]', params: { id: h.id } });
    }, [router]),
  );

  const renderItem = useCallback(
    ({ item }: { item: Drink[] }) => <DexRow row={item} cardWidth={column} onPress={openDrink} />,
    [column, openDrink],
  );

  /* The empty grid's buttons are plain Buttons, so they tick here; the chips tick themselves. */
  const showAll = useCallback(() => {
    haptic.select();
    setStatus('all');
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

  /*
   * The head's foot line: the count while anything narrows the grid, or a
   * typed number the Dex does not reach. Only over cards: an empty grid's
   * answer (GridEmpty) says what happened in words, and "0 shown" over it
   * would say it twice.
   */
  const afterChips = added.length === 0;
  const footLine =
    dexQuery !== null && !BY_NUMBER.has(dexQuery) ? (
      <NumberMiss n={dexQuery} afterChips={afterChips} />
    ) : narrowed && matched > 0 ? (
      <TrayHead figure={`${formatCount(matched)} shown`} afterChips={afterChips} />
    ) : null;

  /*
   * The head, on the lining like the rest of the screen: no paper front
   * any more, so a pull past the top shows more lining, which is right.
   */
  const front = (
    <View onLayout={onHeadLayout} style={[styles.front, afterChips && !footLine && styles.frontEndsOnChips]}>
      <DexHead width={width} onOpen={openDrink} onPost={openPost} />

      {/*
        The app's one search field (components/ui), as the cabinet's well
        (Brass D20). The placeholder names the two things it takes; style
        and country still match, for browsing.
      */}
      <SearchField
        tone="lining"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={onSubmitSearch}
        placeholder="Search by name or Nº"
        accessibilityLabel="Search drinks by name or number"
        style={styles.search}
      />

      {/*
        Two filter axes in one scroller, as the app's Chips on the lining:
        the category with its count (graft 4, counted from the data, never
        typed), a rule, then collected or not. One selection per axis. The
        rule is what tells the eye that "Spirits" and "Not yet" are
        different questions rather than five peers.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollsToTop={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}>
        <Chip
          tone="lining"
          label="All"
          count={TOTAL}
          selected={category === 'all'}
          accessibilityLabel={`All drinks, ${formatCount(TOTAL)} entries`}
          onPress={() => setCategory('all')}
        />
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          const total = COUNT_BY_CATEGORY[key];
          return (
            <Chip
              key={key}
              tone="lining"
              label={meta.plural}
              count={total}
              selected={category === key}
              accessibilityLabel={`${meta.plural}, ${formatCount(total)} entries`}
              onPress={() => setCategory(key)}
            />
          );
        })}
        <View style={styles.axisRule} />
        {STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            tone="lining"
            label={option.label}
            selected={status === option.key}
            accessibilityLabel={option.a11y}
            onPress={() => setStatus(status === option.key ? 'all' : option.key)}
          />
        ))}
      </ScrollView>

      {added.length > 0 ? (
        <AddedByYou drinks={added} pours={customPours} onOpen={openCustom} onAdd={() => openAdd('shelf')} />
      ) : null}
      {footLine}
    </View>
  );

  /* The last row stands on a shelf too; the list draws separators only between rows. */
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const footer = (
    <>
      {lastRow ? <Shelf leadingItem={lastRow} /> : null}
      {matched > 0 && named && !catalogueHasName && !ownNamed ? (
        <NotTheOne query={textQuery} onAdd={() => openAdd('dex', textQuery)} />
      ) : null}
    </>
  );

  return (
    <View style={styles.screen}>
      {/* The lining, under everything: the list is transparent. */}
      <Grain tone="lining" />

      {/*
        A fixed bar on the lining: the screen's name, and Stats on the
        right. Its brass rail (D10) appears once the head has moved under
        it, drawn by the bar itself; no fade, anywhere.
      */}
      <ScreenTopBar
        size="lg"
        tone="lining"
        title="Dex"
        showRule={scrolled}
        right={
          <TopBarButton icon="stats" label="Collection stats" onPress={() => router.push('/stats')} />
        }
      />

      <View style={styles.body}>
        <Animated.FlatList<Drink[]>
          ref={listRef}
          data={rows}
          renderItem={renderItem}
          keyExtractor={(row) => row[0]!.id}
          ItemSeparatorComponent={Shelf}
          style={styles.list}
          contentContainerStyle={{
            // Clears the floating tab bar: the last row would otherwise sit under it.
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
          }}
          ListHeaderComponent={front}
          ListEmptyComponent={
            <GridEmpty
              query={textQuery}
              matchesCatalogue={matchesCatalogue}
              onShelf={ownNamed !== undefined && added.includes(ownNamed)}
              ownHidden={ownNamed !== undefined && !added.includes(ownNamed) ? ownNamed.name : null}
              nothingCollected={status === 'unlocked' && collected === 0}
              onClearSearch={() => setQuery('')}
              onAdd={() => openAdd('dex', textQuery)}
              onClearFilters={clearFilters}
              onShowAll={showAll}
              onReset={resetFilters}
            />
          }
          ListFooterComponent={footer}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={cancelJump}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          /*
           * 2,089 entries in 697 rows of three — keep the window tight. These
           * counts are list items, a row of three cards each, so a batch of
           * three is the nine cards a batch of four two-card rows nearly was.
           * Four rows fill the first screen under the head on the largest
           * phone. The window is four screens, not five: a third more cards
           * per row, about the same number of cards mounted.
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

        {railOn && rows.length > 0 ? (
          <JumpRail top={topNumber} onJump={jumpByRail} bottom={insets.bottom + TAB_BAR_CLEARANCE} />
        ) : null}
      </View>

      {showScrollTop ? (
        /*
         * Appears and disappears without a layout animation: an exit that
         * never finishes leaves a ghost button over the grid (specs/06,
         * 3.8). Card stock seated in the lining like a mount, so it casts
         * the seat's shadow; pressed to the sunk fill, as every control
         * answers.
         *
         * A sized, absolutely placed box with an explicit zIndex, so it
         * hit-tests above the grid rather than letting a tap through to the
         * card underneath. It sits just inside the rail's gutter, clear of it.
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
  /* The lining is the screen's ground, top bar to tab bar. */
  screen: {
    flex: 1,
    backgroundColor: colors.lining,
  },
  body: { flex: 1 },
  list: { flex: 1 },

  /* The head */
  front: {
    paddingHorizontal: GRID_PAD,
    paddingTop: FRONT_TOP,
    paddingBottom: FRONT_FOOT,
  },
  /* When the chip scroller ends the head, its slop padding is already 6 of the 16. */
  frontEndsOnChips: { paddingBottom: FRONT_FOOT - CHIP_SLOP },
  /*
   * The gauge's figures sit in a box sized for the capped text size, so at
   * the default size its foot is already about 7pt of clear lining: 4 more
   * gives the mock's 10 between the figures and the well.
   */
  search: { marginTop: 4 },

  /* Chips. The scroller bleeds past the gutter so the row scrolls edge to edge. */
  chipScroll: {
    marginHorizontal: -GRID_PAD,
    marginTop: space.md - CHIP_SLOP,
  },
  chipScrollContent: {
    paddingHorizontal: GRID_PAD,
    paddingVertical: CHIP_SLOP,
    alignItems: 'center',
    gap: space.sm,
  },
  /* Separates the two filter axes sharing the scroller: the mock's 1 x 20 in the lining's own rule. */
  axisRule: {
    width: stroke.edge,
    height: 20,
    marginHorizontal: 2,
    backgroundColor: colors.liningLine,
  },

  /* Added by you, on the lining */
  added: { marginTop: space.lg - CHIP_SLOP },
  addedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  addedTitle: {
    ...textRole.sectionTitle,
    flexShrink: 1,
    color: colors.onLining,
  },
  addedCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.onLiningMuted,
    ...tabular,
  },
  /* The text button's own inset, taken back so its words end on the gutter. */
  addedAdd: { marginRight: -space.sm },
  addedScroll: {
    marginHorizontal: -GRID_PAD,
    marginTop: space.sm,
  },
  addedScrollContent: {
    paddingHorizontal: GRID_PAD,
    gap: space.sm,
    // A long name grows its own tile, not its neighbours.
    alignItems: 'flex-start',
  },

  /*
   * The head's foot line. Wrapping, so at large text the count drops under
   * the words instead of either being cut.
   */
  trayHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.md,
    marginTop: space.md,
  },
  trayHeadAfterChips: { marginTop: space.md - CHIP_SLOP },
  trayHeadText: { ...textRole.helper, color: colors.onLiningMuted, ...tabular },

  /* The grid */
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: GRID_GAP,
    paddingHorizontal: GRID_PAD,
  },
  shelf: { marginTop: SHELF_ABOVE, marginBottom: SHELF_BELOW },

  /*
   * The number rail's dock: the right gutter, from under the top bar to
   * the tab bar's clearance. The rail is cut to the gutter's width; its
   * ticks and line sit in the outer 10pt, clear of the cards.
   */
  railDock: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: GRID_PAD,
  },
  rail: { width: GRID_PAD, flex: 1 },

  /* "Not the one you meant?" under a search, on the lining */
  notTheOne: {
    paddingTop: space.xl,
    paddingBottom: space.md,
    alignItems: 'center',
    gap: space.sm,
  },
  notTheOneText: {
    ...textRole.helper,
    color: colors.onLiningMuted,
    textAlign: 'center',
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
    borderColor: colors.liningControl,
    backgroundColor: colors.mat,
    ...elevation.seat,
  },
  scrollTopPressed: { backgroundColor: colors.bgSunk },
  scrollTopIcon: {
    transform: [{ rotate: '180deg' }],
  },

  /* Cards live in components/DexCard.tsx. */
});
