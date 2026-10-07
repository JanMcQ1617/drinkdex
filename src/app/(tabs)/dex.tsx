import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomDrinkTile } from '@/components/CustomDrinkTile';
import { DexCard, EmptyArt } from '@/components/DexCard';
import { LatestCatch } from '@/components/dex/LatestCatch';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { Button, Chip, EmptyState, haptic, ProgressBar, SearchField } from '@/components/ui';
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
import { shelfKey } from '@/lib/cabinet';
import { catalogueTwin, ownTwin, shortQuery } from '@/lib/customDrinks';
import { styleLabel } from '@/lib/drinkLabels';
import { useCollection } from '@/store/collection';
import { useCustomDrinks } from '@/store/customDrinks';
import type { CustomDrink, Drink, DrinkCategory, UnlockRecord } from '@/types';

/* ==================================================================== */
/* The Dex                                                              */
/*                                                                      */
/* A collector's cabinet (specs/v3-cabinet.md §9.7). Two materials:     */
/*                                                                      */
/*   THE FRONT   paper, the list header: the Latest catch panel with    */
/*               the collection's figure, search, the filters and the   */
/*               drinks you added. Opaque, and it scrolls away over     */
/*               the tray.                                              */
/*   THE TRAY    the lining, the screen's own ground: the catalogue on  */
/*               shelves, one per style ("Fizz", "Scotch"), each with a */
/*               sticky header, two cards to a row and a ledge between  */
/*               rows. A collected drink is a mount seated in it, one   */
/*               not yet caught a recess pressed into it.               */
/*                                                                      */
/* Shelves break the 2,089 entries into places you can tell apart while */
/* scrolling: in Dex-number order the catalogue was 150 cocktails and   */
/* then 379 spirits in a row, a wall with no landmarks.                 */
/* ==================================================================== */

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
/** The screen gutter: 16, as on every screen. */
const GRID_PAD = layout.gutter;
const GRID_GAP = layout.dexGap;
/** Shelf headers stick over the tray, so their text must not grow to cover it. */
const SHELF_CAP = 1.3;
/** Chips carry 6pt of slop above and below; the scroller makes room so it is not clipped. */
const CHIP_SLOP = 6;
/** From the front's last element to the tray. */
const FRONT_FOOT = 14;

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
/* Shelves                                                             */
/* ------------------------------------------------------------------ */

interface ShelfDef {
  key: string;
  category: DrinkCategory;
  /** The style in sentence case: "Spirit-forward", "American whiskey". */
  title: string;
  /** The whole catalogue shelf, in Dex-number order (DRINKS is sorted by it). */
  drinks: Drink[];
}

/*
 * The catalogue's shelves, built once: one per category and style (lib/
 * cabinet's shelfKey, so a style both categories use is two shelves),
 * cocktails before spirits as everywhere else, then alphabetical by the
 * style as it is shown.
 */
const SHELVES: readonly ShelfDef[] = (() => {
  const byKey = new Map<string, ShelfDef>();
  for (const drink of DRINKS) {
    const key = shelfKey(drink);
    let shelf = byKey.get(key);
    if (!shelf) {
      shelf = { key, category: drink.category, title: styleLabel(drink.subcategory), drinks: [] };
      byKey.set(key, shelf);
    }
    shelf.drinks.push(drink);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.title.localeCompare(b.title),
  );
})();

/** A shelf as the list draws it: its header's figures, and the drinks it shows, two to a row. */
interface ShelfSection {
  key: string;
  title: string;
  /** Collected and total over the WHOLE shelf, so the header holds still under search and filters. */
  collected: number;
  total: number;
  data: Drink[][];
}

/** Rows of two, made before the list sees them (as Profile's grid does). */
function pairs(list: Drink[]): Drink[][] {
  const rows: Drink[][] = [];
  for (let i = 0; i < list.length; i += COLUMNS) rows.push(list.slice(i, i + COLUMNS));
  return rows;
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

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
 * One row of the tray: two cards, stretched to the taller, so a name that
 * wraps to two lines beside one that does not still ends both windows on
 * one line (DexCard's window takes the slack). An odd last card keeps its
 * column's width: DexCard's width is explicit.
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
 * A shelf's sticky header: "Fizz" on the left, "2 of 14 collected" on the
 * right (under it, when the two do not fit one line), and the shelf's
 * share as a 2pt bone rule. Inter, not Playfair: a shelf is a heading,
 * not a drink's name.
 *
 * Opaque lining with its own grain, since it sticks over the cards. Its
 * height comes from its text (a minimum of 52pt), capped at 1.3 so a
 * stuck header cannot grow to cover the tray.
 *
 * One VoiceOver heading, "Fizz, 2 of 14 collected", so the Headings rotor
 * walks the shelves.
 */
const ShelfHeader = React.memo(function ShelfHeader({
  title,
  collected,
  total,
}: {
  title: string;
  collected: number;
  total: number;
}) {
  const figure = `${formatCount(collected)} of ${formatCount(total)} collected`;
  return (
    <View style={styles.shelfHeader} accessible accessibilityRole="header" accessibilityLabel={`${title}, ${figure}`}>
      <Grain tone="lining" />
      <View style={styles.shelfHeaderRow}>
        <Text maxFontSizeMultiplier={SHELF_CAP} style={[textRole.shelfTitle, styles.shelfHeaderTitle]}>
          {title}
        </Text>
        <Text maxFontSizeMultiplier={SHELF_CAP} style={[textRole.helper, styles.shelfHeaderCount]}>
          {figure}
        </Text>
      </View>
      <View style={styles.shelfHeaderBar}>
        <ProgressBar value={collected} max={total} height={stroke.indicator} tone="lining" />
      </View>
    </View>
  );
});

/**
 * The shelf ledge between two rows: a 5pt strip of shadow with a 1pt lit
 * lip along its top, so a row reads as standing on a shelf rather than
 * floating in the lining. Decorative.
 */
function Ledge() {
  return (
    <View style={styles.ledge}>
      <View style={styles.ledgeStrip} />
    </View>
  );
}

function SectionGap() {
  return <View style={styles.sectionGap} />;
}

/**
 * "Added by you": the drinks this person added themselves, on the cabinet
 * front above the tray.
 *
 * A shelf of its own and never cards in the tray. The tray, its chips
 * ("All 2,089") and every shelf count mean "the catalogue"; a custom card
 * among them would make every count on this screen wrong, and its absence
 * of a number would look like a broken card. The shelf follows the same
 * filters (category, collected, the search) so it never shows a drink the
 * filters above it say is not there.
 *
 * Newest first: the one just added is the one being looked for. Tiles
 * align to the top, so one long name grows its own tile, not the row.
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
          variant="text"
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
        // A status-bar tap scrolls the tray home, not this row.
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
 * "margarita" always matches something, so a full tray alone would hide
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
 * The empty tray, which has several causes and gets an answer for each.
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
 * Every answer is drawn on the lining, the tray it stands in for.
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
   * is the only change the tray's filtering and shelf counts care about.
   * (The Latest catch panel subscribes to the map itself: the photo swap
   * there is the point.)
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
   * The card width is the exact column, unrounded: rounding it could push
   * two cards and the gap past the row by a point and a half.
   */
  const column = (width - GRID_PAD * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

  /*
   * The tray, and whether the search finds anything in the catalogue at
   * all, under any filter: that is what tells "the filters hide it" apart
   * from "the Dex does not have it" when the tray comes back empty. One
   * pass over the shelves for the sections, each shelf's whole-shelf count
   * and the "found anywhere" flag. A plain loop rather than filter
   * callbacks, so the flags are locals of this function and not variables
   * a callback reassigns.
   */
  const { sections, matched, matchesCatalogue } = useMemo(() => {
    const q = fold(query.trim());
    // Read-not-subscribe: `collected` above is what invalidates this memo.
    const unlocks = useCollection.getState().unlocks;
    const out: ShelfSection[] = [];
    let shown = 0;
    let anywhere = false;

    for (const shelf of SHELVES) {
      const picked: Drink[] = [];
      let have = 0;
      for (const drink of shelf.drinks) {
        const owned = has(unlocks, drink.id);
        if (owned) have += 1;
        const hit = q.length === 0 || (SEARCH_KEY.get(drink.id) ?? '').includes(q);
        if (!hit) continue;
        anywhere = true;
        if (category !== 'all' && drink.category !== category) continue;
        if (status !== 'all' && (status === 'unlocked' ? !owned : owned)) continue;
        picked.push(drink);
      }
      if (picked.length === 0) continue;
      shown += picked.length;
      out.push({
        key: shelf.key,
        title: shelf.title,
        collected: have,
        total: shelf.drinks.length,
        data: pairs(picked),
      });
    }
    return { sections: out, matched: shown, matchesCatalogue: anywhere };
    // `collected` looks unused — it is the invalidation key for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collected, query, category, status]);

  /* The drinks you added: the same three filters, newest first. */
  const added = useMemo(() => {
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

  const listRef = useRef<Animated.SectionList<Drink[], ShelfSection>>(null);
  /*
   * Tapping the Dex tab while already on it scrolls the tray home, the way
   * every iOS tab bar behaves (react-navigation reaches the SectionList's
   * scroll view through getScrollResponder; the Animated wrapper forwards
   * its ref to the list). The chip and shelf scrollers opt out of
   * scrollsToTop so a status-bar tap reaches the tray, not them.
   */
  useScrollToTop(listRef);

  /*
   * The bar's rule, once the front has moved under it; and the back-to-top
   * button, which mounts on a state flag rather than on an animated
   * opacity, so a hidden button cannot swallow taps over the tray.
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
  const onScrolledPast = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScrollRule(e);
    onScrollTop(e);
  };
  /*
   * The tray is the Dex tab's scroll source for the tab bar's compaction
   * (ScrollChrome): a native-driven event, with the two signals above
   * riding along as its JS listener.
   */
  const { onScroll } = useTabScroll('dex', onScrolledPast);

  const scrollToTop = useCallback(() => {
    listRef.current?.getScrollResponder()?.scrollTo({ x: 0, y: 0, animated: true });
  }, []);

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

  const renderSectionHeader = useCallback(
    ({ section }: { section: ShelfSection }) => (
      <ShelfHeader title={section.title} collected={section.collected} total={section.total} />
    ),
    [],
  );

  /* The empty tray's buttons are plain Buttons, so they tick here; the chips tick themselves. */
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
   * The cabinet front: paper over the lining, opaque, with its own grain
   * (the screen's grain under it is the lining's). A paper view above it
   * keeps a pull past the top paper, not wine.
   */
  const front = (
    <View style={[styles.front, added.length === 0 && styles.frontEndsOnChips]}>
      <Grain />
      <View pointerEvents="none" style={styles.overscroll}>
        <Grain />
      </View>

      <LatestCatch width={width} onOpen={openDrink} onPost={openPost} />

      {/*
        The app's one search field (components/ui). The placeholder names
        what it searches, country included: nothing else on screen says
        the index can be browsed that way.
      */}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Name, style or country"
        accessibilityLabel="Search drinks by name, style or country"
        style={styles.search}
      />

      {/*
        Two filter axes in one scroller, as the app's Chips: the category
        (with its count), a rule, then collected or not. One selection per
        axis. The rule is what tells the eye that "Spirits" and "Not yet"
        are different questions rather than seven peers.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollsToTop={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}>
        <Chip
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
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* The tray's lining, under everything: the list is transparent. */}
      <Grain tone="lining" />

      {/*
        A fixed bar: the screen's name, and Stats on the right, which left
        the tab bar to become a report on this collection. My Bar, which
        had the left, is a tab of its own since v3.1. Paper, like the front
        it sits on; its rule appears once the front has moved under it.
      */}
      <ScreenTopBar
        size="lg"
        title="Dex"
        showRule={scrolled}
        right={
          <TopBarButton icon="stats" label="Collection stats" onPress={() => router.push('/stats')} />
        }
      />

      <Animated.SectionList
        ref={listRef}
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(row) => row[0]!.id}
        stickySectionHeadersEnabled
        ItemSeparatorComponent={Ledge}
        SectionSeparatorComponent={SectionGap}
        style={styles.list}
        contentContainerStyle={{
          // Clears the floating tab bar: the last row would otherwise sit under it.
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        }}
        ListHeaderComponent={front}
        ListEmptyComponent={
          <GridEmpty
            query={trimmed}
            matchesCatalogue={matchesCatalogue}
            onShelf={ownNamed !== undefined && added.includes(ownNamed)}
            ownHidden={ownNamed !== undefined && !added.includes(ownNamed) ? ownNamed.name : null}
            nothingCollected={status === 'unlocked' && collected === 0}
            onClearSearch={() => setQuery('')}
            onAdd={() => openAdd('dex', trimmed)}
            onClearFilters={clearFilters}
            onShowAll={showAll}
            onReset={resetFilters}
          />
        }
        ListFooterComponent={
          matched > 0 && named && !catalogueHasName && !ownNamed ? (
            <NotTheOne query={trimmed} onAdd={() => openAdd('dex', trimmed)} />
          ) : null
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        /*
         * 2,089 entries on 47 shelves — keep the window tight. These counts
         * are list ITEMS: a shelf header or a row of two cards each. Four
         * fills the first screen under the front on the largest phone.
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
      />

      {showScrollTop ? (
        /*
         * Appears and disappears without a layout animation: an exit that
         * never finishes leaves a ghost button over the tray (specs/06,
         * 3.8). Card stock seated in the lining like a mount, so it casts
         * the seat's shadow; pressed to the sunk fill, as every control
         * answers.
         *
         * A sized, absolutely placed box with an explicit zIndex, so it
         * hit-tests above the tray rather than letting a tap through to the
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
  /* The lining is the screen's ground; the front and the bar are paper on it. */
  screen: {
    flex: 1,
    backgroundColor: colors.lining,
  },
  list: { flex: 1 },

  /* The cabinet front */
  front: {
    backgroundColor: colors.bg,
    paddingHorizontal: GRID_PAD,
    paddingTop: space.md,
    paddingBottom: FRONT_FOOT,
  },
  /* Without the shelf the chip scroller ends the front, and its slop padding is already 6 of the 14. */
  frontEndsOnChips: { paddingBottom: FRONT_FOOT - CHIP_SLOP },
  overscroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -1000,
    height: 1000,
    backgroundColor: colors.bg,
  },
  search: { marginTop: space.md },

  /* Chips. The scroller bleeds past the gutter so the row scrolls edge to edge. */
  chipScroll: {
    marginHorizontal: -GRID_PAD,
    marginTop: 10 - CHIP_SLOP,
  },
  chipScrollContent: {
    paddingHorizontal: GRID_PAD,
    paddingVertical: CHIP_SLOP,
    alignItems: 'center',
    gap: space.sm,
  },
  /* Separates the two filter axes sharing the scroller. */
  axisRule: {
    width: stroke.edge,
    height: 16,
    marginHorizontal: space.xs,
    backgroundColor: colors.line,
  },

  /* Added by you */
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
    color: colors.text,
  },
  addedCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
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

  /* The tray */
  shelfHeader: {
    minHeight: 52,
    paddingTop: 14,
    paddingBottom: space.xs,
    paddingHorizontal: GRID_PAD,
    backgroundColor: colors.lining,
  },
  shelfHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.md,
  },
  shelfHeaderTitle: { flexShrink: 1, color: colors.onLining },
  shelfHeaderCount: { color: colors.onLiningMuted, ...tabular },
  shelfHeaderBar: { marginTop: 9 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: GRID_GAP,
    paddingHorizontal: GRID_PAD,
  },
  ledge: { height: layout.dexLedge },
  ledgeStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 5,
    height: 5,
    backgroundColor: colors.ledge,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.liningLip,
  },
  sectionGap: { height: space.sm },

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
