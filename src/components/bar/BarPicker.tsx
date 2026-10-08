import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, Chip, SearchField } from '@/components/ui';
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
import { confirmDestructive } from '@/utils/alerts';

import { ROW_LEFT, rowStyles } from './controls';
import { SectionHead, sectionStyles } from './Counter';
import { appendAToZ, type PickerFilter, pickerOrder, pickerRows } from './model';

/* ==================================================================== */
/* What's in your bar?                                                  */
/*                                                                      */
/* The top of My Bar since v3.3 (Jan: "just let them choose what they   */
/* have"): a checklist of ingredients you tick, most useful first, with */
/* the app's search field and the category chips over it. It replaces   */
/* both the bottle shelf and the "Add a bottle" sheet behind the search */
/* glyph, so everything you can tick is on the page. Focusing the       */
/* search lifts the field to just under the top bar (onSearchFocus), so */
/* typing leaves the results between the field and the keyboard.        */
/*                                                                      */
/* STILLNESS. The rows' order is held (see `held`): taken when the      */
/* screen takes its snapshot (first load, another tab taking the front, */
/* Clear) and on a chip change, never on a tick. A ticked row flips its */
/* box where it stands; its numbers, and every other row's, stay live.  */
/* Nothing above the rows changes height on a tick either: the empty    */
/* bar's line and its basics button hold until the next snapshot, so   */
/* the first tick on a new bar does not lift every row under the        */
/* finger. No layout animation runs (v3.3 section 0): the rows a tick   */
/* changes change in the same commit.                                   */
/* ==================================================================== */

const INTRO = 'Tick what you have. The ones that unlock the most drinks come first.';

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

/** Rows at rest: a screen and a bit on a phone, so "You can make" is one scroll away. */
const FIRST_PAGE = 12;
/** Then this many a tap. Each row is cheap (no picture), but a hundred and fifty in one commit is not. */
const MORE_PAGE = 20;
/** The tick box: 24pt, its corner the control radius capped so a box this small stays square, not a lozenge. */
const BOX = 24;
const BOX_RADIUS = Math.min(radius.control, 6);

function drinks(n: number) {
  return n === 1 ? 'drink' : 'drinks';
}

/** What the screen says aloud for a line drawn with a middle dot. */
const spoken = (s: string) => s.split(' · ').join(', ');

/** The order as taken: which snapshot it was for, its rows, and whether the bar was empty then. */
interface Held {
  taken: number;
  ids: string[];
  /**
   * The bar was empty at the screen's snapshot. Holds the empty bar's line
   * and basics button until the next one (a chip change keeps it), so a
   * first tick moves nothing.
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
 * What a row says under its name: what a tick would unlock, or that it is
 * yours, and how far it goes at all ("in 168 drinks", reachOf, family
 * slots included, so Armagnac is not "in 0").
 */
function subtitleOf(i: Ingredient, on: boolean, result: BarResult): string {
  const reach = reachOf(i.id);
  const into = reach ? `in ${formatCount(reach)} ${drinks(reach)}` : 'in no drink in the Dex yet';
  if (on) return `In your bar · ${into}`;
  const gain = gainOf(result, i.id);
  if (gain) return `Unlocks ${formatCount(gain)} more · ${into}`;
  return reach ? `In ${formatCount(reach)} ${drinks(reach)}` : 'In no drink in the Dex yet';
}

/**
 * One ingredient, ticked or not. The whole row is the control (a
 * checkbox to VoiceOver, its label the row's two lines), so a tick lands
 * anywhere across the screen. The box is shape AND fill: an empty square
 * on its edge, or wine with a check, so the state never rests on colour.
 */
const CheckRow = React.memo(function CheckRow({
  ingredient,
  checked,
  subtitle,
  first,
  onToggle,
}: {
  ingredient: Ingredient;
  checked: boolean;
  subtitle: string;
  /** The first row of its card draws no rule above it. */
  first: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onToggle(ingredient.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${ingredient.label}, ${spoken(subtitle)}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {first ? null : <View style={[rowStyles.rule, styles.rowRule]} />}
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Icon name="check" size={16} color={colors.textOnWine} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.label}>{ingredient.label}</Text>
        <Text style={rowStyles.subtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
});

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
  /** The screen's snapshot serial (Snapshot.taken): a new one takes the rows' order again. */
  taken: number;
  /** Ticks it or unticks it; the screen says what that changed. */
  onToggle: (id: string) => void;
  onAddBasics: () => void;
  /** Already confirmed: empties the bar. */
  onClear: () => void;
  /** The search field took focus; `y` is its top inside the picker, which starts the page. */
  onSearchFocus?: (y: number) => void;
}) {
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
    // A new list, but the same visit: `empty` holds, so the chips under the line do not jump.
    setHeld({ ...hold(taken, result, owned, f), empty: held.empty });
    setShown(FIRST_PAGE);
  };

  /*
   * "In your bar" grows only where it cannot move a row under the finger:
   * when a search ends (what you ticked in it joins the end of the list
   * as the list comes back) and from the basics button above it. Never as
   * an Add under One ingredient away lands: listing it there at once grew
   * this list and pushed the row just tapped down a place. It is listed
   * from the next snapshot.
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
  const makes = result.makeable.length;
  const q = query.trim();
  const hits = q ? searchIngredients(q) : null;
  const rows = pickerRows(held.ids);
  const visible = rows.slice(0, shown);
  const left = rows.length - visible.length;
  const basicsLeft = BASICS.filter((id) => !owned[id]).length;
  const tally = ownedCount
    ? `${formatCount(ownedCount)} in your bar · makes ${formatCount(makes)} ${drinks(makes)}`
    : 'Nothing in your bar yet.';
  /*
   * Taken on an empty bar, the line keeps the intro's height (drawn but
   * not seen, and not read) with the live tally laid over it, so the first
   * tick does not shorten it and lift every row by a line.
   */
  const ghostIntro = held.empty && ownedCount > 0;

  const row = (i: Ingredient, n: number) => {
    const on = !!owned[i.id];
    return (
      <CheckRow
        key={i.id}
        ingredient={i}
        checked={on}
        subtitle={subtitleOf(i, on, result)}
        first={n === 0}
        onToggle={onToggle}
      />
    );
  };

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
    <View style={styles.picker}>
      <SectionHead title="What’s in your bar?" />
      <View>
        <Text
          style={[sectionStyles.note, ghostIntro && styles.ghost]}
          accessibilityLabel={held.empty ? undefined : spoken(tally)}
          accessibilityElementsHidden={ghostIntro}
          importantForAccessibility={ghostIntro ? 'no-hide-descendants' : 'auto'}>
          {held.empty ? INTRO : tally}
        </Text>
        {ghostIntro ? (
          <Text style={[sectionStyles.note, styles.over]} accessibilityLabel={spoken(tally)}>
            {tally}
          </Text>
        ) : null}
      </View>

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
        // Search results are every match (up to 40), unpaged, right under the field and so above the keyboard.
        hits.length ? (
          <Card style={styles.list}>{hits.map(row)}</Card>
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
            rows. It offers what is left of the basics, and once they are
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
            <Card style={styles.list}>{visible.map(row)}</Card>
          ) : (
            <Text style={styles.empty}>
              {filter === 'owned'
                ? 'Nothing in your bar yet. Tick what you have under All, or search for it.'
                : 'Nothing here yet. The search finds everything.'}
            </Text>
          )}

          {left > 0 ? (
            <Button
              label={`Show ${formatCount(Math.min(MORE_PAGE, left))} more`}
              variant="secondary"
              block
              onPress={() => setShown((n) => n + MORE_PAGE)}
              accessibilityHint={`${formatCount(left)} not shown yet`}
              style={styles.more}
            />
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

const styles = StyleSheet.create({
  picker: { paddingTop: space.md },
  /* The intro kept for its height only (see ghostIntro); the tally lies over its first line. */
  ghost: { opacity: 0 },
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
  search: { marginHorizontal: layout.gutter, marginTop: space.md },
  chips: { gap: space.sm, paddingHorizontal: layout.gutter, paddingTop: space.md },
  basics: { marginHorizontal: layout.gutter, marginTop: space.md },
  list: { marginHorizontal: layout.gutter, marginTop: space.md, overflow: 'hidden' },
  more: { marginHorizontal: layout.gutter, marginTop: space.md },
  clear: { alignSelf: 'flex-start', marginLeft: space.sm, marginTop: space.xs },
  empty: { ...textRole.helper, color: colors.textMuted, paddingHorizontal: layout.gutter, paddingTop: space.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.row,
    paddingLeft: ROW_LEFT,
    paddingRight: space.md,
    paddingVertical: 10,
  },
  rowPressed: { backgroundColor: colors.bgSunk },
  /* The rule starts at the text, not the box, like every row with a leading mark. */
  rowRule: { left: ROW_LEFT + BOX + space.md },
  box: {
    width: BOX,
    height: BOX,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BOX_RADIUS,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
    backgroundColor: colors.surface,
  },
  boxOn: { backgroundColor: colors.wine, borderColor: colors.wine },
  rowText: { flex: 1 },
  label: { ...textRole.rowTitle, color: colors.text },
});
