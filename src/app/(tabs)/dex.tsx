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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomDrinkTile } from '@/components/CustomDrinkTile';
import { DexCard, dexCardHeight, EmptyArt } from '@/components/DexCard';
import { takeDexFilter } from '@/components/dex/dexFilter';
import { FilterSheet } from '@/components/dex/FilterSheet';
import {
  COLUMNS,
  dexGrid,
  drinksOf,
  fold,
  rowFor,
  searchHits,
  spotOf,
  type GridRow,
  type RailSpot,
} from '@/components/dex/dexRows';
import { ForYouRail } from '@/components/dex/ForYouRail';
import { OrderSheet } from '@/components/dex/OrderSheet';
import { QuickChips } from '@/components/dex/QuickChips';
import { SectionHead } from '@/components/dex/SectionHead';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { NumberRail } from '@/components/NumberRail';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { formatPlateNumber } from '@/components/plate';
import { ScreenTopBar, TopBarCount, useScrolledPast } from '@/components/ScreenTopBar';
import { useHideOnScroll, useTabScroll } from '@/components/ScrollChrome';
import { announce, Button, EmptyState, haptic, SearchField } from '@/components/ui';
import { CATEGORY_META, colors, layout, space, textRole } from '@/constants/theme';
import { DRINKS, formatCount, getDrink, TOTAL } from '@/data';
import { catalogueTwin, ownTwin, shortQuery } from '@/lib/customDrinks';
import {
  chipsOn,
  chipWord,
  facetCounts,
  filterIsOn,
  forYou,
  matcher,
  NO_FILTER,
  numberMap,
  quickChips,
  sectionKeys,
  seeAll,
  type ChipFilter,
  type ForYouSection,
  type IsCaught,
} from '@/lib/dexOrder';
import { isDexNumberPrefix, parseDexNumber } from '@/lib/drinkSearch';
import { useCollection } from '@/store/collection';
import { useCustomDrinks } from '@/store/customDrinks';
import { dexOrderFor, useDexPrefs, type DexOrderChoice } from '@/store/dexPrefs';
import { useTaste } from '@/store/taste';
import type { CustomDrink, Drink, DrinkCategory, UnlockRecord } from '@/types';

/* ==================================================================== */
/* The Dex                                                              */
/*                                                                      */
/* v4, less stuff (layout spec 5.2; specs/v4-changes.md section 4).     */
/* Jan: "I want less stuff. it looks really clumped up". At rest the    */
/* screen is the bar, the header and the drinks:                        */
/*                                                                      */
/*   THE BAR     "Dex", and "38 / 2,089" on its baseline, which opens   */
/*               Dex progress (/stats): the ruler, the rank, the latest */
/*               catch and "See your 38" live there now.                */
/*   THE HEADER  "Search a name or number", with the sliders glyph at   */
/*               its end opening the filter sheet; under it the order   */
/*               key and the quick chips (v4.2 §1.5, §2.3).             */
/*   THE GRID    two to a row: a big square print and its Playfair      */
/*               name, nothing else. Caught is the colour print with    */
/*               the name in ink; not yet, the grey proof of the same   */
/*               frame with the name muted. No plates, shelves or tags. */
/*                                                                      */
/* v4.2 (specs/v4.2/spec.md §1 to §3). Jan: "If he picks out fruity     */
/* drinks or sour drinks, then put them in an order where those drinks  */
/* come first". With answers that name a flavour or a spirit, the Dex   */
/* opens FOR YOU: one section per answer, in the person's order, each   */
/* headed by the recommender's best 12 (store/taste's dexFronts, worked */
/* when the answers change, never here), then Everything else by        */
/* number. The order key switches to BY NUMBER, today's Dex exactly. A  */
/* search or any filter makes the grid flat, in the order the key       */
/* says. Without answers there is no For you: By number, no key, and    */
/* one quiet line that opens the taste questions.                       */
/*                                                                      */
/* "When the user scrolls up, the search tab appears, and the filters   */
/* as well": the header rides over the list, not in it. Scrolling down  */
/* slides it under the bar 1:1 with the finger; the first upward        */
/* movement brings it back. A native-driven diffClamp graph             */
/* (ScrollChrome's useHideOnScroll, as Home's bar), never Reanimated,   */
/* so the Release stall of specs/06 cannot freeze it half way; pinned   */
/* shown while the field has focus, a sheet is open or VoiceOver runs,  */
/* held where it is while a finger is on the rail.                      */
/*                                                                      */
/* A number typed into the field jumps the grid there and outlines the  */
/* tile for a moment, in any order; the Nº rail jumps by number (and,   */
/* For you, by section) as you drag, and shows only while the grid      */
/* moves.                                                               */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* Grid geometry                                                       */
/* ------------------------------------------------------------------ */

/* Two columns (dexRows' COLUMNS, layout spec 5.2): 184pt prints at 440, 160 at 393. */
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

/*
 * The header (spec §2.6, at 440): 114 to 226 under the bar, the field
 * 8 down (y 122), the chip row 12 under it (y 178), 16 to the header's
 * foot. The first content sits 8 under that, at y 234, so at rest the
 * header never covers it. Measured, not assumed: at large text sizes
 * the field and the chips grow, and the list's padding follows.
 */
const FIELD_TOP = space.sm;
const CHIPS_TOP = space.md;
const HEADER_FOOT = space.lg;
const CONTENT_TOP = space.sm;
/** The header's height before it has measured itself: 112 at the default text size. */
const HEADER_EST = FIELD_TOP + layout.search + CHIPS_TOP + layout.chip + HEADER_FOOT;
/** A section head's line (SectionHead): 24, then 12 to its first row, and 8 more over a head after a section. */
const HEAD_LINE = 24;

/* ------------------------------------------------------------------ */
/* Search (the catalogue's own key and its fold are in dexRows)        */
/* ------------------------------------------------------------------ */

/** The search key for a drink someone added: a handful of them, folded per search. */
const customKey = (c: CustomDrink) => [c.name, c.subcategory, c.origin].map(fold).join('\n');

/** Own keys only: the stores are plain objects, and 'constructor' is not a drink. */
const has = (map: Record<string, unknown>, id: string) =>
  Object.prototype.hasOwnProperty.call(map, id);

/** Every catalogue drink by its number, for a typed number. */
const BY_NUMBER = new Map(DRINKS.map((d) => [d.dexNumber, d]));
/** The rail's foot and the end of the book: the highest number, which can differ from TOTAL if the numbering ever has a gap. */
const LAST_NUMBER = DRINKS[DRINKS.length - 1]?.dexNumber ?? TOTAL;

/**
 * A typed number waits this long for the next digit before the grid
 * jumps, so "127" is one jump and not three (to 1, 12 and 127). The
 * keyboard's return key goes at once.
 */
const NUMBER_SETTLE_MS = 450;

/** Catalogue drinks of one kind in the collection: the bar's count. */
function caughtOf(unlocks: Record<string, UnlockRecord>, category: DrinkCategory): number {
  let n = 0;
  for (const id of Object.keys(unlocks)) if (getDrink(id)?.category === category) n += 1;
  return n;
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

/**
 * A number a few components read and one writes, as a tiny store rather
 * than screen state, so a change re-renders only its readers: the spot at
 * the top of the grid (the rail's thumb, which changes every time a row
 * passes under the bar) and the tile a typed number outlined (one card,
 * not 2,089).
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

/** A head row: a For-you section's, with "See all", or Everything else's "by number". */
const HeadRow = React.memo(function HeadRow({
  label,
  section,
  first,
  onSeeAll,
}: {
  label: string;
  section: ForYouSection | null;
  first: boolean;
  onSeeAll: (section: ForYouSection) => void;
}) {
  return (
    <SectionHead
      label={label}
      all={section ? section.all : null}
      first={first}
      onSeeAll={section ? () => onSeeAll(section) : undefined}
    />
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
      accessibilityHint="Choose flavours, spirits, the kind of drink, logged or not yet"
      style={({ pressed }) => [styles.filterKey, pressed && styles.pressed]}>
      <Icon name="sliders" size={22} color={colors.text} filled={on} />
    </Pressable>
  );
}

/**
 * Over the grid while there are no answers to order it by (spec §2.1,
 * frame `notaste`): one quiet line, which opens the taste questions (the
 * same retake Settings → Your tastes runs). Once answered, the Dex is
 * For you.
 */
function TastePrompt({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: space.md, bottom: space.md }}
      accessibilityRole="link"
      accessibilityLabel="Tell us your taste"
      accessibilityHint="Opens the taste questions"
      style={({ pressed }) => [styles.taste, pressed && styles.pressed]}>
      <Text style={[textRole.small, styles.muted, styles.tasteWords]}>
        Tell us your taste, and your kind of drinks come first
      </Text>
      <Icon name="chevronRight" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * A typed number the Dex does not reach ("3000", "0"): said over the
 * grid rather than searched as a name, which would answer "No match" and
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
 * The row follows the filters, so it never shows a drink they hide (a
 * drink someone added has no taste tags, so a flavour or spirit chip
 * always hides it).
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
 * made inside Spirits does not also throw away Spirits. An empty Logged
 * says how things get logged, over the proof of a drink it could be.
 * Anything else is a filter combination with nothing in it, and resets
 * the filters; it names the chips that are on ("Sour and citrusy,
 * Fruity, Cocktails"), so it is plain which ones to loosen.
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
  chips,
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
  /** The chips that are on, in sheet order, as words: "Sour and citrusy, Fruity, Cocktails". */
  chips: string;
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
              ? `“${query}” is in the Dex, but not under ${chips}.`
              : `You added “${ownHidden}”, but it isn't under ${chips}.`
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
        title="Nothing logged yet"
        body="Open any drink and post it to add it here."
        action={{ label: 'Show every drink', onPress: onShowAll }}
      />
    );
  }
  return (
    <EmptyState
      icon="sliders"
      title="No matches"
      body={`Nothing in the Dex is under ${chips}.`}
      action={{ label: 'Clear filters', onPress: onClearFilters }}
    />
  );
}

/**
 * The Nº rail, pinned down the right edge between the header and the tab
 * bar while the grid moves: NumberRail by number, ForYouRail (its section
 * stops over the hairline) For you at rest. Its own subscription to the
 * top spot, so a row passing under the bar re-renders the rail and
 * nothing else.
 *
 * The dock rides the header's graph (spec §3.2, 4): `shift` is the
 * header's height less how far it has hidden, so the rail starts under
 * the header when it is shown and under the bar when it is hidden, and
 * never lies over the field. Its box is the room under a shown header,
 * so with the header hidden the rail sits higher, its foot short of the
 * tab bar by the header's height. A finger on the rail holds the header
 * (onHold), and with it the dock, so nothing moves under that finger.
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
  stops,
  onJump,
  onStop,
  onHold,
  bottom,
  shift,
}: {
  top: Signal<RailSpot>;
  /** For you at rest: the sections' names. Null by number. */
  stops: readonly string[] | null;
  onJump: (n: number) => void;
  onStop: (index: number) => void;
  onHold: (held: boolean) => void;
  bottom: number;
  /** The header's height less how far it has hidden (the dock's ride). */
  shift: Animated.AnimatedSubtraction<number>;
}) {
  const current = useSyncExternalStore(top.subscribe, top.get);
  /*
   * A rail taken away under the finger (the grid changed beneath it) sends
   * no touch end: let go for it, so the header is not held for good.
   */
  const holding = useRef(false);
  const hold = (held: boolean) => {
    holding.current = held;
    onHold(held);
  };
  useEffect(
    () => () => {
      if (holding.current) onHold(false);
    },
    [onHold],
  );
  return (
    <Animated.View
      collapsable={false}
      pointerEvents="box-none"
      onTouchStart={() => hold(true)}
      onTouchEnd={() => hold(false)}
      onTouchCancel={() => hold(false)}
      style={[styles.railDock, { bottom, transform: [{ translateY: shift }] }]}>
      {stops ? (
        <ForYouRail
          stops={stops}
          total={LAST_NUMBER}
          current={current}
          onStop={onStop}
          onJump={onJump}
          style={styles.rail}
        />
      ) : (
        <NumberRail total={LAST_NUMBER} current={Math.max(1, current)} onJump={onJump} style={styles.rail} />
      )}
    </Animated.View>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  /*
   * Counts, not the map itself. Subscribing to `unlocks` here would
   * re-render the screen every time a photo is swapped on an entry already
   * caught; these move only when a drink is caught or let go, which is the
   * only change the grid's filtering and the bar's count care about.
   * Catalogue drinks only (getDrink), so the count here, Dex progress's
   * and Profile's "38 entries in your Dex" are the same 38.
   */
  const caughtCocktails = useCollection((s) => caughtOf(s.unlocks, 'cocktail'));
  const caughtSpirits = useCollection((s) => caughtOf(s.unlocks, 'spirit'));
  const collected = caughtCocktails + caughtSpirits;

  /*
   * The drinks this person added, and their pours. The stable records, not
   * a list made in the selector: zustand v5 throws on a selector that
   * returns a new array each call.
   */
  const customDrinks = useCustomDrinks((s) => s.drinks);
  const customPours = useCustomDrinks((s) => s.pours);
  const customReady = useCustomDrinks((s) => s.hydrated);

  /*
   * The order (spec §2.1, §2.3). For you exists when the stored fronts
   * make one (lib/dexOrder's forYou, remembered by the fronts' identity,
   * so this costs nothing per render); the person's choice from the Order
   * sheet then decides, For you until they choose. The answers offer
   * themselves as quick chips, and, with no flavour and no spirit, the
   * quiet line that asks for them.
   *
   * Answers that name no flavour and no spirit make no For you even while
   * the fronts of earlier answers are still stored (store/taste clears
   * them a moment later, off the render): otherwise a retake that took
   * every flavour away would draw the old sections and the line asking
   * for a taste together, until then.
   */
  const dexFronts = useTaste((s) => s.dexFronts);
  const answers = useTaste((s) => s.answers);
  const tasteReady = useTaste((s) => s.hydrated);
  const orderChoice = useDexPrefs((s) => s.order);
  const setOrderChoice = useDexPrefs((s) => s.setOrder);
  const asksForYou = sectionKeys(answers).length > 0;
  const fy = asksForYou ? forYou(dexFronts) : null;
  const order: DexOrderChoice = dexOrderFor(orderChoice, fy !== null);
  const forYouOn = fy !== null && order === 'foryou';
  const unanswered = tasteReady && !asksForYou;

  const [filter, setFilter] = useState<ChipFilter>(NO_FILTER);
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [tastesOpen, setTastesOpen] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
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
  const filterOn = filterIsOn(filter);

  /* The exact column, unrounded: rounding could push two cards and the gap past the row. */
  const column = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  /*
   * The grid's rows (components/dex/dexRows): flat for a search or any
   * chip, in the order the key says; For you's sections, then Everything
   * else, at rest; or By number, the v4 Dex. With them, whether the
   * search finds anything in the catalogue at all, under any filter: that
   * is what tells "the filters hide it" apart from "the Dex does not have
   * it" when the grid comes back empty.
   */
  const { rows, matched, matchesCatalogue, flat, restStart, stops, stopRows } = useMemo(() => {
    // Read-not-subscribe: the two counts are what invalidate this memo.
    const unlocks = useCollection.getState().unlocks;
    return dexGrid({
      query: textQuery,
      filter,
      filterOn,
      caught: (id) => has(unlocks, id),
      forYou: forYouOn ? fy : null,
    });
    // The counts look unused: they are the invalidation keys for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtCocktails, caughtSpirits, textQuery, filter, filterOn, forYouOn, fy]);

  /* Dex number → row, in any order (spec §2.4): a typed number finds its tile wherever it is. */
  const rowOfNumber = useMemo(() => numberMap(rows, drinksOf), [rows]);

  /* The drinks you added that a search finds: the same filters, newest first. Not at rest. */
  const added = useMemo(() => {
    if (!customReady || textQuery.length === 0) return [];
    const q = fold(textQuery);
    const pass = matcher(filter, (id) => has(customPours, id));
    return Object.values(customDrinks)
      .filter((c) => pass(c) && customKey(c).includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [customReady, customDrinks, customPours, textQuery, filter]);

  /*
   * The faceted counts (spec §1.3), bit tests over the catalogue
   * (lib/dexOrder), one pass each, so a tap recounts at once. The bar's
   * while a filter is on: what the filters hold, whatever is typed. The
   * sheet's while it is open: over what the search finds, so each chip's
   * figure and the foot key's "Show 12 drinks" are the grid behind the
   * scrim (with nothing typed they are the same pass).
   */
  const barCounts = useMemo(() => {
    if (!filterOn) return null;
    const unlocks = useCollection.getState().unlocks;
    return facetCounts(filter, (id) => has(unlocks, id));
    // The counts look unused: they are the invalidation keys for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtCocktails, caughtSpirits, filter, filterOn]);
  const sheetCounts = useMemo(() => {
    if (!sheetOpen) return null;
    if (textQuery.length === 0 && barCounts) return barCounts;
    const unlocks = useCollection.getState().unlocks;
    const caught: IsCaught = (id) => has(unlocks, id);
    return facetCounts(filter, caught, searchHits(textQuery));
    // The counts look unused: they are the invalidation keys for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtCocktails, caughtSpirits, filter, sheetOpen, textQuery, barCounts]);

  /* The quick chips under the field (spec §1.5). */
  const quick = useMemo(() => quickChips(filter, answers), [filter, answers]);

  /*
   * Whether the search is a name the Dex or this person already has,
   * folded the way the form and the server compare names. Two characters
   * at least: one letter is not a name anybody means.
   */
  const named = textQuery.length >= 2;
  const catalogueHasName = named && catalogueTwin(textQuery) !== undefined;
  const ownNamed = named && customReady ? ownTwin(textQuery, customDrinks) : undefined;

  const listRef = useRef<Animated.FlatList<GridRow>>(null);
  /*
   * Tapping the Dex tab while already on it scrolls the grid home, the way
   * every iOS tab bar behaves (the Animated wrapper forwards its ref to the
   * list). The chip rows opt out of scrollsToTop so a status-bar tap
   * reaches the grid. At the top the header is always whole.
   */
  useScrollToTop(listRef);

  /* ---------------- The header, over the list ---------------- */

  /*
   * The header's height, from its own layout: the list's top padding, the
   * distance it hides over, and every jump's offset. State for render,
   * mirrored in a ref for the handlers that read it.
   */
  const [headerH, setHeaderH] = useState(HEADER_EST);
  const headerHRef = useRef(HEADER_EST);
  const onHeaderLayout = (e: LayoutChangeEvent) => {
    const h = Math.max(1, Math.round(e.nativeEvent.layout.height));
    headerHRef.current = h;
    setHeaderH((prev) => (prev === h ? prev : h));
  };

  /* The finger on the rail: a ref for the rail's own timer, state for the header's hold. */
  const railHeld = useRef(false);
  const [railTouched, setRailTouched] = useState(false);

  /*
   * 0 shown to headerH hidden (spec §3.2). Pinned shown while the field
   * has focus (the keyboard is up only then) or a sheet or the taste
   * questions are over the Dex; held where it is while a finger is on the
   * rail; still while VoiceOver runs (ScrollChrome). Rebuilt on focus, so
   * coming back to the tab always shows it.
   */
  const hide = useHideOnScroll('dex', headerH, {
    pinned: fieldFocused || sheetOpen || orderOpen || tastesOpen,
    held: railTouched,
  });
  /*
   * The slide, the fade and the rail's ride, each one node per graph. The
   * fade holds 1 until the header is 40% gone, then falls to 0 at fully
   * hidden, so a half-hidden header reads as moving, not broken. At rest
   * every one of them is the identity.
   */
  const headerY = useMemo(() => Animated.multiply(hide, -1), [hide]);
  const headerOpacity = useMemo(
    () =>
      hide.interpolate({
        inputRange: [0, 0.4 * headerH, headerH],
        outputRange: [1, 1, 0],
        extrapolate: 'clamp',
      }),
    [hide, headerH],
  );
  const railShift = useMemo(() => Animated.subtract(headerH, hide), [hide, headerH]);

  /* ---------------- Jumping to a row ---------------- */

  /*
   * The list's own head (the taste line, a number the Dex does not reach,
   * Added by you), from its layout: an estimated jump counts from its
   * foot. Read in handlers, never in render.
   */
  const listHeadH = useRef(0);
  const onListHeadLayout = (e: LayoutChangeEvent) => {
    listHeadH.current = e.nativeEvent.layout.height;
  };

  /*
   * A row's height before any is measured: the card with its two lines of
   * name, and the gap under it. With every row reserving two lines this is
   * nearly every row's height; only a three-line name at a large text size
   * differs, and the retries below correct for it. A head is its line and
   * the 12 under it, 8 more after a section.
   */
  const rowEstimate = dexCardHeight(column, fontScale, NAME_LINES) + ROW_GAP;
  const headEstimate = HEAD_LINE * Math.max(1, fontScale) + space.md;

  /*
   * Most of the 1,045 rows have never been laid out, so the list cannot
   * know exactly where row 400 is. The first scrollToIndex falls back to an
   * estimate, the window draws the rows around it, and the retries land on
   * the row itself, now measured. A new jump, or a finger on the list,
   * cancels the retries, so nothing yanks the grid back afterwards.
   *
   * Every jump lands BELOW the header (spec §3.2, 5): it is over the list
   * now, not in it, so `viewOffset` sets the row where the first row sits
   * at rest, and the outlined tile, a rail stop's section head and "See
   * all"'s first row are never drawn under a pinned header.
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
        listRef.current?.scrollToIndex({ index, animated: false, viewOffset: headerHRef.current + CONTENT_TOP });
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

  /*
   * The estimate: the list's own head and every row above this one. The
   * list's top padding already holds the header, and viewOffset takes it
   * back off, so neither appears here.
   */
  const onScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      const forRows = committedRows.current;
      let offset = listHeadH.current;
      for (let i = 0; i < info.index && i < forRows.length; i++) {
        const r = forRows[i]!;
        offset += r.type === 'head' ? headEstimate + (r.first ? 0 : space.sm) : rowEstimate;
      }
      listRef.current?.scrollToOffset({ offset, animated: false });
    },
    [headEstimate, rowEstimate],
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

  /*
   * The rail by number: the row holding `n`, or the next one a filter
   * left in. For you, only Everything else is in number order, so the
   * search starts at its first row.
   */
  const jumpByRail = useCallback(
    (n: number) => {
      const index = rowFor(rows, n, restStart);
      if (index >= 0) scrollToRow(index);
    },
    [rows, restStart, scrollToRow],
  );

  /* The rail's section stops: that section's head. */
  const jumpToStop = useCallback(
    (i: number) => {
      const index = stopRows[i];
      if (index !== undefined) scrollToRow(index);
    },
    [stopRows, scrollToRow],
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
    const index = rowOfNumber.get(n) ?? -1;
    if (index >= 0) {
      scrollToRow(index);
      flashTile(n);
      announce(`Number ${n}, ${drink.name}`);
      return;
    }
    if (!filterOn) return;
    pendingJump.current = n;
    setFilter(NO_FILTER);
  };

  /*
   * For you ⇄ By number, a filter, a search, new fronts: the grid is
   * redrawn in place at its top, with no transition (spec §5). Before the
   * pending jump below, so a number the filters hid is jumped to after
   * the grid has gone to its top, not before.
   */
  const gridKey = `${order}\n${textQuery}\n${chipsOn(filter)
    .map((c) => `${c.group}:${c.key}`)
    .join(',')}`;
  // New fronts move only a For-you grid; By number is the same book whatever the answers say.
  const shownFronts = forYouOn ? fy : null;
  const shownGrid = useRef({ key: gridKey, fronts: shownFronts });
  useEffect(() => {
    const was = shownGrid.current;
    if (was.key === gridKey && was.fronts === shownFronts) return;
    shownGrid.current = { key: gridKey, fronts: shownFronts };
    cancelJump();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [gridKey, shownFronts, cancelJump]);

  const settlePendingJump = useEffectEvent(() => {
    const n = pendingJump.current;
    if (n === null) return;
    const index = rowOfNumber.get(n) ?? -1;
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
   * The spot at the top of the grid, for the rail: a section's stop For
   * you, else the first number of the top row. A stable callback:
   * FlatList refuses an onViewableItemsChanged that changes identity.
   */
  const [topSpot] = useState(() => createSignal<RailSpot>(1));
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<GridRow>[] }) => {
      let first: ViewToken<GridRow> | undefined;
      for (const v of viewableItems) {
        if (v.isViewable && v.index != null && (first?.index == null || v.index < first.index)) first = v;
      }
      if (first?.item) topSpot.set(spotOf(first.item));
    },
    [topSpot],
  );

  /* ---------------- The rail, while the grid moves ---------------- */

  /*
   * Mounted on a drag's first frame and cut RAIL_LINGER_MS after the drag,
   * its momentum and any finger on the rail itself have all stopped. Never
   * at rest: a jump by a typed number moves the grid with no drag, so it
   * never shows the rail either.
   */
  const [railOn, setRailOn] = useState(false);
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
      setRailTouched(held);
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
   * The bar's rule, once content has moved under it or the header.
   * useScrolledPast writes state only when the side changes; a write per
   * frame would re-render the screen on every pixel. The grid is also the
   * Dex tab's scroll source for ScrollChrome: a native-driven event, with
   * the rule's signal riding along as its JS listener.
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
   * The add-a-drink form, named after the search (`from=dex`). A Dex
   * filtered to one kind passes it, so someone browsing Spirits starts on
   * a spirit.
   */
  const openAdd = useCallback(
    (name?: string) => {
      router.push({
        pathname: '/add-drink',
        params: {
          from: 'dex',
          ...(name ? { name } : null),
          ...(filter.kind !== 'all' ? { category: filter.kind } : null),
        },
      });
    },
    [filter.kind, router],
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
        setFilter(f);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      const h = useCustomDrinks.getState().takeHandoff('dex');
      if (!h) return;
      if (h.kind === 'custom') router.navigate({ pathname: '/custom/[id]', params: { id: h.id } });
      else router.navigate({ pathname: '/drink/[id]', params: { id: h.id } });
    }, [cancelJump, router]),
  );

  /* "See all 445 ›": that section's chip on alone; the grid goes flat in the For-you order (§2.4). */
  const onSeeAll = useCallback((section: ForYouSection) => {
    haptic.select();
    setFilter(seeAll(section));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: GridRow }) =>
      item.type === 'head' ? (
        <HeadRow label={item.label} section={item.section} first={item.first} onSeeAll={onSeeAll} />
      ) : (
        <DexRow row={item.drinks} cardWidth={column} outline={outline} onPress={openDrink} />
      ),
    [column, outline, openDrink, onSeeAll],
  );

  /* The empty grid's buttons are plain Buttons, so they tick here; the chips tick themselves. */
  const showAll = useCallback(() => {
    haptic.select();
    setFilter((f) => ({ ...f, status: 'all' }));
  }, []);

  const clearFilters = useCallback(() => {
    haptic.select();
    setFilter(NO_FILTER);
  }, []);

  /* The sheets are Modals: the keyboard would otherwise stay up behind their scrim. */
  const openFilter = () => {
    Keyboard.dismiss();
    setSheetOpen(true);
  };
  const openOrder = () => {
    Keyboard.dismiss();
    setOrderOpen(true);
  };
  const openTastes = () => {
    Keyboard.dismiss();
    setTastesOpen(true);
  };
  const closeTastes = useCallback(() => setTastesOpen(false), []);

  /*
   * The bar's quiet count: caught of all, or of what the filters hold
   * ("10 / 535" under Sour and citrusy, Fruity, Cocktails and Not yet;
   * "12 / 1,190" under Cocktails). Logged or Not yet narrows the tiles,
   * not the fraction: "0 / 2,051" under Not yet would read as a
   * collection lost, so the count ignores that group (lib/dexOrder's
   * facetCounts works it with the other groups only).
   */
  const scopeCaught = barCounts ? barCounts.status.unlocked : collected;
  const scopeTotal = barCounts ? barCounts.status.unlocked + barCounts.status.locked : TOTAL;
  const narrowed = filter.flavours.length > 0 || filter.spirits.length > 0;
  const scopeWords = narrowed
    ? 'filtered drinks in your Dex'
    : filter.kind !== 'all'
      ? `${CATEGORY_META[filter.kind].plural.toLowerCase()} in your Dex`
      : 'in your Dex';

  /*
   * Over the grid, inside the list: the taste line (no answers, at rest),
   * a typed number the Dex does not reach, and what a search finds among
   * the drinks you added. The header is not here; it rides over the list.
   */
  const listHead = (
    <View onLayout={onListHeadLayout} style={styles.listHead}>
      {unanswered && !flat ? <TastePrompt onPress={openTastes} /> : null}
      {dexQuery !== null && !BY_NUMBER.has(dexQuery) ? <NumberMiss n={dexQuery} /> : null}
      {added.length > 0 ? <AddedByYou drinks={added} pours={customPours} onOpen={openCustom} /> : null}
    </View>
  );

  const footer =
    matched > 0 && named && !catalogueHasName && !ownNamed ? (
      <NotTheOne query={textQuery} onAdd={() => openAdd(textQuery)} />
    ) : null;

  /* The rail's kind: section stops For you at rest; none for a flat For-you result, which is in no number order. */
  const railStops = forYouOn && !flat ? stops : null;
  const railShows = railOn && rows.length >= RAIL_MIN_ROWS && !(forYouOn && flat);

  return (
    <View style={styles.screen}>
      {/* A fixed bar: the screen's name, and the count that opens Dex progress. The rule shows once content is under it. */}
      <ScreenTopBar
        size="lg"
        title="Dex"
        showRule={scrolled}
        right={
          <TopBarCount
            // The caught figure in the accent (v4.4), the "/ 2,089" muted as before.
            // A zero stays muted: a red 0 on a new account reads as an error, not a catch.
            figure={scopeCaught > 0 ? formatCount(scopeCaught) : undefined}
            text={scopeCaught > 0 ? ` / ${formatCount(scopeTotal)}` : `0 / ${formatCount(scopeTotal)}`}
            onPress={() => router.push('/stats')}
            accessibilityLabel={`${formatCount(scopeCaught)} of ${formatCount(scopeTotal)} ${scopeWords}`}
            accessibilityHint="Opens Dex progress"
          />
        }
      />

      <View style={styles.body}>
        {/*
          The header (spec §3): the field and the chip row, over the list
          and under the bar. The clip view is the header's own box at the
          bar's foot, so the header slides up out of it, under the bar,
          and a hidden header cannot take a tap; touches that miss the
          header fall through to the grid. First in the tree, so it is
          first for VoiceOver (where it is pinned, never hidden); drawn
          over the list by its zIndex. The page ground moves with the
          slide, the fade is on what stands on it, so nothing shows
          through a header half way.
        */}
        <View pointerEvents="box-none" style={[styles.headClip, { height: headerH }]}>
          <Animated.View onLayout={onHeaderLayout} style={[styles.header, { transform: [{ translateY: headerY }] }]}>
            <Animated.View style={{ opacity: headerOpacity }}>
              {/*
                The app's one search field. The placeholder names the two
                things it takes; style and country still match, for browsing.
              */}
              <SearchField
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={onSubmitSearch}
                onFocus={() => setFieldFocused(true)}
                onBlur={() => setFieldFocused(false)}
                placeholder="Search a name or number"
                accessibilityLabel="Search the Dex by name or number"
                end={<FilterKey on={filterOn} onPress={openFilter} />}
              />
              <View style={styles.quick}>
                <QuickChips
                  chips={quick}
                  filter={filter}
                  onChange={setFilter}
                  order={fy ? order : null}
                  onOrder={openOrder}
                />
              </View>
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.FlatList<GridRow>
          ref={listRef}
          data={rows}
          renderItem={renderItem}
          keyExtractor={(row) => row.key}
          style={styles.list}
          contentContainerStyle={{
            paddingTop: headerH + CONTENT_TOP,
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
          }}
          ListHeaderComponent={listHead}
          ListEmptyComponent={
            <GridEmpty
              query={textQuery}
              chips={chipsOn(filter).map(chipWord).join(', ')}
              matchesCatalogue={matchesCatalogue}
              onShelf={ownNamed !== undefined && added.includes(ownNamed)}
              ownHidden={ownNamed !== undefined && !added.includes(ownNamed) ? ownNamed.name : null}
              nothingCollected={filter.status === 'unlocked' && collected === 0}
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
           * 2,089 drinks in 1,045 rows of two (and For you's heads): keep
           * the window tight. Three rows fill the first screen under the
           * header on the largest phone; a batch of three rows is six
           * cards. The window is four screens.
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

        {railShows ? (
          <JumpRail
            top={topSpot}
            stops={railStops}
            onJump={jumpByRail}
            onStop={jumpToStop}
            onHold={onRailHold}
            bottom={insets.bottom + layout.tabBar + space.sm + headerH}
            shift={railShift}
          />
        ) : null}
      </View>

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filter={filter}
        counts={sheetCounts}
        onChange={setFilter}
      />

      <OrderSheet visible={orderOpen} onClose={() => setOrderOpen(false)} order={order} onChoose={setOrderChoice} />

      {/*
        The taste questions, from the line over a Dex with no answers: the
        retake Settings → Your tastes runs (v4.1 §1.3), the stored answers
        pre-selected. Its pour works the fronts out (store/taste), so the
        Dex behind it is For you when it closes. Mounted only while up.
      */}
      <Modal
        visible={tastesOpen}
        presentationStyle="fullScreen"
        animationType={reduceMotion ? 'fade' : 'slide'}
        onRequestClose={closeTastes}>
        <OnboardingFlow mode="retake" onExit={closeTastes} />
      </Modal>
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

  /*
   * The header: a clip at the bar's foot, its own height, over the list;
   * in it, the header on the page's ground, the field 8 down, the chips
   * 12 under it and 16 to its foot.
   */
  headClip: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', zIndex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    paddingHorizontal: GUTTER,
    paddingTop: FIELD_TOP,
    paddingBottom: HEADER_FOOT,
  },
  quick: { marginTop: CHIPS_TOP },
  filterKey: {
    alignSelf: 'stretch',
    width: FILTER_KEY,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Over the grid, in the list: the taste line, a missed number, Added by you. */
  listHead: { paddingHorizontal: GUTTER },
  /* The line at y 234, 16 to the grid; its 16pt chevron in muted, as the words. */
  taste: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginBottom: space.lg,
  },
  tasteWords: { flexShrink: 1 },
  miss: { marginBottom: space.lg },

  /* Added by you, while a search finds one: the row scrolls edge to edge. */
  added: { marginBottom: space.xl },
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
   * edge; 8 under the bar's foot, and as tall as the room between a shown
   * header and the tab bar (the screen gives `bottom`). JumpRail's shift
   * moves it down under the header, so with the header shown it ends just
   * above the tab bar. The rail sits 4pt in from the edge, so its strip
   * spans x 412–436.
   */
  railDock: {
    position: 'absolute',
    top: space.sm,
    right: 0,
    width: RAIL_DOCK,
    zIndex: 2,
  },
  /* The rail's own 24pt width, at the dock's left: 4pt short of the edge. */
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
