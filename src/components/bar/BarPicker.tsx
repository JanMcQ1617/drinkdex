import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BottleLabel, BrassPlate, BrassRail, IngredientGlyph, PLATE_CAP, plateWidth } from '@/components/brass';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { Button, Chip, SearchField } from '@/components/ui';
import { colors, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  type BarResult,
  BASICS,
  basicsResult,
  CATEGORY_ORDER,
  gainOf,
  INGREDIENTS,
  INGREDIENTS_BY_ID,
  type Ingredient,
  type IngredientCategory,
  reachOf,
  searchIngredients,
} from '@/lib/bar';
import { fitScale, textWidth } from '@/lib/textFit';
import { confirmDestructive } from '@/utils/alerts';

import { appendAToZ, type PickerFilter, pickerOrder, pickerRows } from './model';

/* ==================================================================== */
/* What's in your bar?                                                  */
/*                                                                      */
/* The top of My Bar since v3.3 (Jan: "just let them choose what they   */
/* have"): a checklist of ingredients you tick, most useful first, with */
/* the app's search field and the category chips over it. Everything    */
/* you can tick is on the page. Focusing the search lifts the field to  */
/* just under the top bar (onSearchFocus), so typing leaves the results */
/* between the field and the keyboard.                                  */
/*                                                                      */
/* BRASS (specs/v3-3-mockups/brass, screen 3). The head is a band of    */
/* the lining under the lining top bar, "What's in your bar?" with the  */
/* tally engraved on a brass plate ("12 ticked"), ending in a brass     */
/* rail where it meets the paper (D10; no shade, no fade). Each         */
/* ingredient is a bottle label (D6), two to a row: ticked is label     */
/* stock with an inner brass rule, unticked plain white. On it: the     */
/* box, the name, how many drinks it goes into, its glyph (graft 3) and */
/* its rank numeral in brassInk.                                        */
/*                                                                      */
/* STILLNESS. The labels' order is held (see `held`): taken when the    */
/* screen takes its snapshot (first load, another tab taking the front, */
/* Clear) and on a chip change, never on a tick. A ticked label flips   */
/* its stock and its box where it stands, and its words do not change   */
/* (the name, "in 173 drinks"), so a tick never reflows a label or      */
/* moves one under the finger. Nothing above the labels changes height  */
/* on a tick either: the band's words are fixed and the plate's room is */
/* kept for three figures; the empty bar's basics button holds until    */
/* the next snapshot. No layout animation runs (v3.3 section 0): a tick */
/* changes what it changes in the same commit.                          */
/* ==================================================================== */

const INTRO = 'Tick what you have. The ones that pour the most come first.';

/** The chips, shorter than the section names they filter. */
const CHIP_LABEL: Record<IngredientCategory, string> = {
  spirit: 'Spirits',
  liqueur: 'Liqueurs',
  wine: 'Wine & beer',
  bitters: 'Bitters',
  citrus: 'Citrus',
  juice: 'Juices',
  syrup: 'Syrups',
  mixer: 'Mixers',
  dairy: 'Dairy & eggs',
  produce: 'Fresh',
  spice: 'Spices',
  savoury: 'Savoury',
  other: 'Everything else',
};

/**
 * Labels at rest: three rows of two, the mock's, so "You can make" and
 * the top of its counter show on the first screen of a phone.
 */
const FIRST_PAGE = 6;
/** Then this many a tap: ten rows. Each label is two small SVGs, and a hundred and seventy in one commit is a stall. */
const MORE_PAGE = 20;
/** The tick box: 20pt, the mock's, on the badge corner the scale gives checkboxes. */
const BOX = 20;
/** Between two labels, across and down (the mock's 8). */
const GRID_GAP = space.sm;
/** Inside a label: the box, the words and the glyph's column, 10pt apart (the mock's), the glyph 18pt. */
const LABEL_GAP = 10;
const GLYPH = 18;
/**
 * Past this text size a label goes full width, one to a row: two to a
 * row leave the name about 96pt, and a word like "Maraschino" at 1.3x
 * would have to shrink below what Larger Text asked for.
 */
const TWO_UP_MAX_SCALE = 1.3;
/** The plate keeps room for three figures ("120 ticked"), so the title beside it never rewraps on a tick. */
const PLATE_ROOM = '000 ticked';

function drinks(n: number) {
  return n === 1 ? 'drink' : 'drinks';
}

/** "in 173 drinks": how far a thing goes at all (reachOf, family slots included, so Armagnac is not "in 0"). */
function reachLine(i: Ingredient): string {
  const reach = reachOf(i.id);
  return reach ? `in ${formatCount(reach)} ${drinks(reach)}` : 'in no drink yet';
}

/** "01": a rank numeral, two figures (three past 99). */
const rankNumeral = (n: number) => String(n).padStart(2, '0');

/**
 * The label's right-hand column: the glyph's 18pt, or the rank numeral's
 * width where that is wider ("170" at Larger Text), worked out so the
 * name's column is known before the label is drawn.
 */
function sideWidth(rank: number | undefined, fontScale: number): number {
  if (rank == null) return GLYPH;
  const s = Math.min(fontScale, PLATE_CAP);
  const text = rankNumeral(rank);
  const tracking = (textRole.rank.letterSpacing ?? 0) * s * text.length;
  return Math.max(GLYPH, Math.ceil(textWidth(text, 'inter', textRole.rank.fontSize * s) + tracking));
}

/** The order as taken: which snapshot it was for, its rows, and whether the bar was empty then. */
interface Held {
  taken: number;
  ids: string[];
  /**
   * The bar was empty at the screen's snapshot. Holds the basics button
   * until the next one (a chip change keeps it), so a first tick does not
   * take it out from above the labels.
   */
  empty: boolean;
}

function hold(taken: number, result: BarResult, owned: Record<string, true>, filter: PickerFilter): Held {
  return {
    taken,
    ids: pickerOrder(result, owned, filter),
    empty: !Object.keys(owned).some((id) => INGREDIENTS_BY_ID[id]),
  };
}

/**
 * One ingredient as a bottle label, ticked or not. The whole label is
 * the control (a checkbox to VoiceOver, "Lemon, in 173 drinks"), so a
 * tick lands anywhere on it. The box is shape AND fill: an empty square
 * on its lineControl edge, or wine with a bone check, so the state never
 * rests on colour or on the label's stock alone. What a tick would
 * unlock is the hint, not a line: a line that came and went with each
 * tick would reflow the label under the finger.
 *
 * The name is Inter (an ingredient is not a drink) and wraps at words;
 * a word too wide for the label's column shrinks to fit, never below
 * 11pt, the way DrinkName fits a drink's name (fitScale).
 */
const CheckLabel = React.memo(function CheckLabel({
  ingredient,
  checked,
  rank,
  gain,
  width,
  onToggle,
}: {
  ingredient: Ingredient;
  checked: boolean;
  /** Its place in a ranked list; none in search results or "In your bar" (A to Z). */
  rank?: number;
  /** What ticking it would unlock now (the hint). */
  gain: number;
  width: number;
  onToggle: (id: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const reach = reachLine(ingredient);
  const role = textRole.labelValue;
  const side = sideWidth(rank, fontScale);
  // The name's column: the label less BottleLabel's 12pt sides, the box, the side column and the gaps between them.
  const measure = width - 2 * space.md - BOX - side - 2 * LABEL_GAP;
  const fit = fitScale(ingredient.label, 'inter', role.fontSize * fontScale, measure);
  return (
    <Pressable
      onPress={() => onToggle(ingredient.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${ingredient.label}, ${reach}`}
      accessibilityHint={
        !checked && gain ? `Ticking it unlocks ${formatCount(gain)} more ${drinks(gain)}` : undefined
      }
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      <BottleLabel ticked={checked} style={styles.label}>
        <View style={styles.labelRow}>
          <View style={[styles.box, checked && styles.boxOn]}>
            {checked ? <Icon name="check" size={14} color={colors.textOnWine} /> : null}
          </View>
          <View style={styles.labelWords}>
            <Text style={[role, styles.labelName, { fontSize: role.fontSize * fit, lineHeight: role.lineHeight * fit }]}>
              {ingredient.label}
            </Text>
            <Text style={styles.labelReach}>{reach}</Text>
          </View>
          <View style={[styles.labelSide, { width: side }]}>
            <IngredientGlyph ingredient={ingredient} size={GLYPH} />
            {rank != null ? (
              // Capped like a plate: it sits in a narrow column beside the words.
              <Text maxFontSizeMultiplier={PLATE_CAP} style={styles.rank}>
                {rankNumeral(rank)}
              </Text>
            ) : null}
          </View>
        </View>
      </BottleLabel>
    </Pressable>
  );
});

/** "Sweet vermouth, Dry vermouth and 482 more": the next labels down, by name. */
function nextLine(next: readonly Ingredient[], left: number): string {
  const [a, b] = next;
  if (!a) return '';
  if (left === 1) return a.label;
  if (left === 2 && b) return `${a.label} and ${b.label}`;
  return b ? `${a.label}, ${b.label} and ${formatCount(left - 2)} more` : `${a.label} and ${formatCount(left - 1)} more`;
}

export function BarPicker({
  owned,
  result,
  taken,
  onToggle,
  onAddBasics,
  onClear,
  onSearchFocus,
}: {
  owned: Record<string, true>;
  result: BarResult;
  /** The screen's snapshot serial (Snapshot.taken): a new one takes the labels' order again. */
  taken: number;
  /** Ticks it or unticks it; the screen says what that changed. */
  onToggle: (id: string) => void;
  onAddBasics: () => void;
  /** Already confirmed: empties the bar. */
  onClear: () => void;
  /** The search field took focus; `y` is its top inside the picker, which starts the page. */
  onSearchFocus?: (y: number) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PickerFilter>('all');
  const [shown, setShown] = useState(FIRST_PAGE);
  const [held, setHeld] = useState(() => hold(taken, result, owned, 'all'));
  const searchY = useRef(0);
  /*
   * The screen took a new snapshot (the bar loaded from disk, another tab
   * took the front, or Clear): take the order again, for the chip that is
   * on. Adjusted during render, like the screen's own snapshot, so the new
   * order is drawn in the same commit as whatever caused it.
   */
  if (held.taken !== taken) {
    setHeld(hold(taken, result, owned, filter));
    setShown(FIRST_PAGE);
  }

  const pick = (f: PickerFilter) => {
    if (f === filter) return;
    setFilter(f);
    // A new list, but the same visit: `empty` holds, so the button above the labels does not jump.
    setHeld({ ...hold(taken, result, owned, f), empty: held.empty });
    setShown(FIRST_PAGE);
  };

  /*
   * "In your bar" grows only where it cannot move a label under the
   * finger: when a search ends (what you ticked in it joins the end of
   * the list as the list comes back) and from the basics button above it.
   * Never as an Add under One ingredient away lands: listing it there at
   * once grew this list and pushed the label just tapped down a place. It
   * is listed from the next snapshot.
   */
  const grow = (ids: readonly string[]) => {
    if (filter === 'owned') setHeld((h) => ({ ...h, ids: appendAToZ(h.ids, ids) }));
  };
  const search = (text: string) => {
    if (query.trim() && !text.trim()) grow(Object.keys(owned));
    setQuery(text);
  };
  const addBasics = () => {
    onAddBasics();
    grow(BASICS);
  };

  const ownedCount = Object.keys(owned).filter((id) => INGREDIENTS_BY_ID[id]).length;
  const q = query.trim();
  const hits = q ? searchIngredients(q) : null;
  const rows = pickerRows(held.ids);
  const visible = rows.slice(0, shown);
  const left = rows.length - visible.length;
  const basicsLeft = BASICS.filter((id) => !owned[id]).length;
  // "In your bar" is A to Z, not a ranking, so its labels carry no numeral.
  const ranked = filter !== 'owned';

  /* The labels' geometry, worked out from the window so each is laid out once. */
  const twoUp = fontScale <= TWO_UP_MAX_SCALE;
  const room = width - 2 * layout.gutter;
  const labelW = twoUp ? Math.floor((room - GRID_GAP) / 2) : room;

  const plateText = `${formatCount(ownedCount)} ticked`;
  const plateRoom = Math.max(plateWidth(PLATE_ROOM, 'lg', fontScale), plateWidth(plateText, 'lg', fontScale));

  const label = (i: Ingredient, n: number | undefined) => (
    <CheckLabel
      key={i.id}
      ingredient={i}
      checked={!!owned[i.id]}
      rank={n}
      gain={gainOf(result, i.id)}
      width={labelW}
      onToggle={onToggle}
    />
  );

  /*
   * Clear takes the whole bar, built a tick at a time, so it asks first
   * and wears danger, like every other destructive action in the app.
   */
  const confirmClear = () =>
    confirmDestructive(
      'Clear your bar?',
      `${formatCount(ownedCount)} ${ownedCount === 1 ? 'thing comes' : 'things come'} off. This cannot be undone.`,
      'Clear',
      onClear,
    );

  return (
    <View>
      {/*
        The head band: the lining carried on from the lining top bar, its
        grain, and a brass rail at its foot where it meets the paper. The
        cover above it is the same wine, so pulling the page down past its
        top shows lining, not a strip of paper, between the bar and the band.
      */}
      <View style={styles.band}>
        <View style={styles.overscroll} pointerEvents="none" />
        <Grain tone="lining" />
        <View style={styles.bandHead}>
          <Text
            style={styles.bandTitle}
            accessibilityRole="header"
            accessibilityLabel={`What’s in your bar? ${plateText}`}>
            What’s in your bar?
          </Text>
          <View style={[styles.bandPlate, { minWidth: plateRoom }]}>
            <BrassPlate label={plateText} size="lg" />
          </View>
        </View>
        <Text style={styles.bandIntro}>{INTRO}</Text>
      </View>
      <BrassRail inFlow />

      <View
        style={styles.search}
        onLayout={(e) => {
          searchY.current = e.nativeEvent.layout.y;
        }}>
        <SearchField
          value={query}
          onChangeText={search}
          onFocus={() => onSearchFocus?.(searchY.current)}
          placeholder={`Search ${formatCount(INGREDIENTS.length)} ingredients`}
          accessibilityLabel="Search ingredients"
        />
      </View>

      {hits ? (
        // Search results are every match (up to 40), unpaged and unranked, right under the field and so above the keyboard.
        hits.length ? (
          <View style={styles.grid}>{hits.map((i) => label(i, undefined))}</View>
        ) : (
          <Text style={styles.empty}>Nothing called “{q}”.</Text>
        )
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            // The page's own scroll is the one a tap on the status bar should move.
            scrollsToTop={false}
            contentContainerStyle={styles.chips}>
            <Chip label="All" selected={filter === 'all'} onPress={() => pick('all')} />
            <Chip label="In your bar" count={ownedCount} selected={filter === 'owned'} onPress={() => pick('owned')} />
            {CATEGORY_ORDER.map((c) => (
              <Chip key={c} label={CHIP_LABEL[c]} selected={filter === c} onPress={() => pick(c)} />
            ))}
          </ScrollView>

          {/*
            While the order was taken on an empty bar, and until the next
            taking: a tick must not take the button out from above the
            labels. It offers what is left of the basics, and once they are
            all in it stays, inert, saying so, so VoiceOver's focus on it
            is not dropped either.
          */}
          {held.empty ? (
            <Button
              label={
                basicsLeft === BASICS.length
                  ? `Start with the ${formatCount(BASICS.length)} basics`
                  : basicsLeft
                    ? `Add the other ${formatCount(basicsLeft)} basics`
                    : `The ${formatCount(BASICS.length)} basics are in your bar`
              }
              variant="secondary"
              block
              disabled={basicsLeft === 0}
              onPress={addBasics}
              accessibilityHint={
                basicsLeft === BASICS.length
                  ? `Ticks all ${formatCount(BASICS.length)} at once. Together they make ${formatCount(basicsResult().makeable.length)} drinks.`
                  : basicsLeft
                    ? `Ticks the ${formatCount(basicsLeft)} not ticked yet.`
                    : undefined
              }
              style={styles.basics}
            />
          ) : null}

          {visible.length ? (
            <View style={styles.grid}>{visible.map((i, n) => label(i, ranked ? n + 1 : undefined))}</View>
          ) : (
            <Text style={styles.empty}>
              {filter === 'owned'
                ? 'Nothing in your bar yet. Tick what you have under All, or search for it.'
                : 'Nothing here yet. The search finds everything.'}
            </Text>
          )}

          {left > 0 ? (
            <View style={styles.next}>
              <Text style={styles.nextLine}>{nextLine(rows.slice(shown, shown + 2), left)}</Text>
              <Button
                // "Show all" only when it is true: the rest come a page at a time (MORE_PAGE).
                label={left > MORE_PAGE ? 'Show more' : 'Show all'}
                variant="text"
                size="sm"
                onPress={() => setShown((n) => n + MORE_PAGE)}
                accessibilityLabel={`Show ${formatCount(Math.min(MORE_PAGE, left))} more ingredients`}
                accessibilityHint={`${formatCount(left)} not shown yet`}
              />
            </View>
          ) : null}

          {filter === 'owned' && ownedCount > 0 ? (
            <Button
              label="Clear your bar"
              variant="dangerText"
              size="sm"
              onPress={confirmClear}
              accessibilityHint="Asks first, then takes everything out of your bar"
              style={styles.clear}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

/** How far a rubber-band pull can drag the page down past its top; the cover is that tall. */
const OVERSCROLL = 600;

const styles = StyleSheet.create({
  band: {
    backgroundColor: colors.lining,
    paddingHorizontal: layout.gutter,
    // The mock's 8 under the bar: the band reads as the bar's own lining carried on, not a second block.
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  overscroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -OVERSCROLL,
    height: OVERSCROLL,
    backgroundColor: colors.lining,
  },
  bandHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  /* The mock's 22/28 SemiBold: the scale's emptyTitle step. */
  bandTitle: { ...textRole.emptyTitle, color: colors.onLining, flex: 1 },
  /* A row, so the plate (which sets its own alignSelf) sits flush right in the room kept for it. */
  bandPlate: { flexDirection: 'row', justifyContent: 'flex-end' },
  bandIntro: { ...textRole.helper, color: colors.onLiningMuted, marginTop: space.sm },

  search: { marginHorizontal: layout.gutter, marginTop: space.lg },
  chips: { gap: space.sm, paddingHorizontal: layout.gutter, paddingTop: space.md },
  basics: { marginHorizontal: layout.gutter, marginTop: space.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Two labels in a row stand as tall as the taller one.
    alignItems: 'stretch',
    gap: GRID_GAP,
    marginHorizontal: layout.gutter,
    marginTop: space.md,
  },
  clear: { alignSelf: 'flex-start', marginLeft: space.sm, marginTop: space.xs },
  empty: { ...textRole.helper, color: colors.textMuted, paddingHorizontal: layout.gutter, paddingTop: space.md },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: layout.gutter,
    paddingRight: space.xs,
    marginTop: space.sm,
  },
  nextLine: { ...textRole.helper, color: colors.textMuted, flex: 1 },

  pressed: { opacity: 0.7 },
  /* The label frame grows to its row's height, so the pair's frames line up. */
  label: { flexGrow: 1 },
  labelRow: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: LABEL_GAP },
  box: {
    width: BOX,
    height: BOX,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
    backgroundColor: colors.surface,
  },
  boxOn: { backgroundColor: colors.wine, borderColor: colors.wine },
  labelWords: { flex: 1 },
  labelName: { color: colors.text },
  labelReach: { ...textRole.labelCaption, color: colors.textMuted },
  /* The glyph at the top and the rank at the foot, at the label's right. */
  labelSide: { alignSelf: 'stretch', alignItems: 'flex-end', justifyContent: 'space-between' },
  rank: { ...textRole.rank, color: colors.brassInk },
});
