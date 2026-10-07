import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { Button, Card, Chip, SearchField } from '@/components/ui';
import { colors, layout, space, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  type BarResult,
  browseIngredients,
  CATEGORY_ORDER,
  gainOf,
  INGREDIENTS,
  INGREDIENTS_BY_ID,
  type Ingredient,
  type IngredientCategory,
  matchBar,
  reachOf,
  searchIngredients,
} from '@/lib/bar';
import { confirmDestructive } from '@/utils/alerts';

import { BottleRow, ShelfToggle } from './controls';

/* ==================================================================== */
/* Add a bottle                                                         */
/*                                                                      */
/* The search glyph's sheet, for everything that is not standing on a   */
/* shelf: the app's search field, the shelf's category chips, "Worth    */
/* adding" ranked by what each thing would pour with the shelf you      */
/* have (full-slot gains, so Rye says +5, not +0), what is on your      */
/* shelf with its check, and the rest to browse. It replaces the wall   */
/* of about 160 chips.                                                  */
/*                                                                      */
/* A React Native page-sheet Modal, so UIKit presents and dismisses it  */
/* (no Reanimated, nothing on the frame loop). Its own grain: a native  */
/* sheet is drawn above the React root. A live footer says what the     */
/* shelf pours now and what the last tap changed, as Tonight's picker   */
/* did, and VoiceOver hears the same sentence (the screen announces it). */
/* ==================================================================== */

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

type Filter = 'all' | IngredientCategory;

const WORTH_PAGE = 6;
const BROWSE_PAGE = 20;

/** What the last tap in the sheet did, for the footer. */
export interface SheetChange {
  label: string;
  on: boolean;
  /** Drinks it lit (on) or lost (off). */
  count: number;
}

export function AddBottleSheet({
  visible,
  owned,
  result,
  onToggle,
  onClear,
  onClose,
  onShowMe,
}: {
  visible: boolean;
  owned: Record<string, true>;
  result: BarResult;
  /** Puts it on or takes it off, and says what changed. */
  onToggle: (id: string) => SheetChange;
  onClear: () => void;
  onClose: () => void;
  /** Closes the sheet on the counter. */
  onShowMe: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* Mounted while the Modal renders, so each opening starts from a clear search. */}
      <SheetBody owned={owned} result={result} onToggle={onToggle} onClear={onClear} onClose={onClose} onShowMe={onShowMe} />
    </Modal>
  );
}

/**
 * Everything not on the shelf that would pour something new, most first.
 *
 * Full-slot gains credit every member of a family slot, so "Gin" would
 * arrive with four echoes (London dry, Navy strength...) each claiming
 * the same drinks. An id is left out when every drink it pours is already
 * claimed by one listed above it AND no recipe names it often on its own
 * (uses under 3). Rye and Bourbon stay (each is named by dozens of
 * recipes, and each really does pour those drinks); the echoes go.
 */
function worthAdding(
  result: BarResult,
  owned: Record<string, true>,
  inFilter: (i: Ingredient) => boolean,
): Ingredient[] {
  const ranked = [...result.gains.keys()]
    .map((id) => INGREDIENTS_BY_ID[id])
    .filter((i): i is Ingredient => !!i && !owned[i.id] && inFilter(i))
    .sort(
      (a, b) =>
        gainOf(result, b.id) - gainOf(result, a.id) ||
        b.uses - a.uses ||
        reachOf(b.id) - reachOf(a.id) ||
        a.label.localeCompare(b.label),
    );
  const listed: Set<string>[] = [];
  const out: Ingredient[] = [];
  for (const i of ranked) {
    const drinks = (result.gains.get(i.id) ?? []).map((m) => m.drink.id);
    const echo = i.uses < 3 && listed.some((set) => drinks.every((d) => set.has(d)));
    if (echo) continue;
    listed.push(new Set(drinks));
    out.push(i);
  }
  return out;
}

/*
 * THE LISTS HOLD STILL while the sheet is open. Ranked live, a row you
 * tapped Add on left "Worth adding" for "On your shelf" at once, and every
 * row under it slid up a place, so a second tap landed on a different
 * bottle and the first could not be undone where it was made. Their order
 * is taken when the sheet opens (and when a chip or Clear changes what is
 * listed); a tap flips that row's toggle in place, and its numbers stay
 * live. Anything put on from a search joins the end of "On your shelf".
 */
interface Held {
  worth: string[];
  shelf: string[];
  browse: string[];
}

function inFilterOf(filter: Filter): (i: Ingredient) => boolean {
  return (i) => filter === 'all' || i.category === filter;
}

function holdLists(result: BarResult, owned: Record<string, true>, filter: Filter): Held {
  const inFilter = inFilterOf(filter);
  return {
    worth: worthAdding(result, owned, inFilter).map((i) => i.id),
    shelf: Object.keys(owned)
      .map((id) => INGREDIENTS_BY_ID[id])
      .filter((i): i is Ingredient => !!i && inFilter(i))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((i) => i.id),
    browse: browseIngredients()
      .filter((i) => !owned[i.id] && gainOf(result, i.id) === 0 && inFilter(i))
      .map((i) => i.id),
  };
}

const byId = (ids: readonly string[]) => ids.flatMap((id) => (INGREDIENTS_BY_ID[id] ? [INGREDIENTS_BY_ID[id]] : []));

function SheetBody({
  owned,
  result,
  onToggle,
  onClear,
  onClose,
  onShowMe,
}: {
  owned: Record<string, true>;
  result: BarResult;
  onToggle: (id: string) => SheetChange;
  onClear: () => void;
  onClose: () => void;
  onShowMe: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [worthShown, setWorthShown] = useState(WORTH_PAGE);
  const [browseShown, setBrowseShown] = useState(BROWSE_PAGE);
  const [last, setLast] = useState<SheetChange | null>(null);
  const [held, setHeld] = useState<Held>(() => holdLists(result, owned, 'all'));

  const inFilter = inFilterOf(filter);
  const ownedList = Object.keys(owned)
    .map((id) => INGREDIENTS_BY_ID[id])
    .filter((i): i is Ingredient => !!i)
    .sort((a, b) => a.label.localeCompare(b.label));

  /*
   * Worth adding: anything not on the shelf that would pour something new,
   * family members included (full-slot gains), most first. Read from the
   * gains table rather than the browse list, so a rare ingredient that
   * completes three drinks still turns up. Held in place (see Held).
   */
  const worth = byId(held.worth);
  const listed = new Set([...held.worth, ...held.shelf, ...held.browse]);
  const shelf = [...byId(held.shelf), ...ownedList.filter((i) => inFilter(i) && !listed.has(i.id))];
  const browse = byId(held.browse);
  const hits = query.trim() ? searchIngredients(query) : null;

  const toggle = (id: string) => setLast(onToggle(id));
  const pick = (f: Filter) => {
    setFilter(f);
    setHeld(holdLists(result, owned, f));
    setWorthShown(WORTH_PAGE);
    setBrowseShown(BROWSE_PAGE);
  };

  const row = (i: Ingredient, first: boolean) => {
    const on = !!owned[i.id];
    const gain = gainOf(result, i.id);
    const reach = reachOf(i.id);
    const sub = on
      ? `In ${formatCount(reach)} ${reach === 1 ? 'drink' : 'drinks'}`
      : gain
        ? `Pours ${formatCount(gain)} more · in ${formatCount(reach)} ${reach === 1 ? 'drink' : 'drinks'}`
        : reach
          ? `In ${formatCount(reach)} ${reach === 1 ? 'drink' : 'drinks'}`
          : 'In no drink in the Dex yet';
    return (
      <BottleRow
        key={i.id}
        ingredient={i}
        lit={on}
        first={first}
        title={i.label}
        subtitle={sub}
        toggle={
          <ShelfToggle
            on={on}
            onLabel="On shelf"
            onPress={() => toggle(i.id)}
            accessibilityLabel={on ? `${i.label}, on your shelf, ${sub}` : `Add ${i.label}, ${sub}`}
          />
        }
      />
    );
  };

  const confirmClear = () =>
    confirmDestructive(
      'Clear your shelf?',
      `${formatCount(ownedList.length)} ${ownedList.length === 1 ? 'thing comes' : 'things come'} off the shelf. This cannot be undone.`,
      'Clear shelf',
      () => {
        setLast(null);
        onClear();
        // Nothing is on the shelf now, so nothing pours: everything goes back to browsing.
        setHeld(holdLists(matchBar(new Set()), {}, filter));
      },
    );

  const total = result.makeable.length;
  const lastLine = last
    ? last.on
      ? `${last.label} added ${formatCount(last.count)}`
      : `${last.label} off, ${formatCount(last.count)} fewer`
    : null;

  return (
    <View style={styles.screen}>
      <Grain />
      <ScreenTopBar
        title="Add a bottle"
        inset="sheet"
        right={<TopBarTextButton label="Done" onPress={onClose} />}
        showRule
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${formatCount(INGREDIENTS.length)} ingredients`}
          accessibilityLabel="Search ingredients"
          style={styles.search}
        />

        {hits ? (
          hits.length ? (
            <Card style={styles.list}>{hits.map((i, n) => row(i, n === 0))}</Card>
          ) : (
            <Text style={styles.empty}>Nothing called “{query.trim()}”.</Text>
          )
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chips}>
              <Chip label="All" selected={filter === 'all'} onPress={() => pick('all')} />
              {CATEGORY_ORDER.map((c) => (
                <Chip key={c} label={CHIP_LABEL[c]} selected={filter === c} onPress={() => pick(c)} />
              ))}
            </ScrollView>

            {worth.length ? (
              <>
                <Text style={styles.groupTitle} accessibilityRole="header">
                  Worth adding
                </Text>
                <Text style={styles.groupHelp}>With what is on your shelf now.</Text>
                <Card style={styles.list}>{worth.slice(0, worthShown).map((i, n) => row(i, n === 0))}</Card>
                {worth.length > worthShown ? (
                  <Button
                    label={`Show ${formatCount(Math.min(10, worth.length - worthShown))} more`}
                    variant="secondary"
                    block
                    onPress={() => setWorthShown((n) => n + 10)}
                    style={styles.more}
                  />
                ) : null}
              </>
            ) : null}

            {ownedList.length || shelf.length ? (
              <>
                <Text style={styles.groupTitle} accessibilityRole="header">
                  On your shelf <Text style={[styles.groupCount, tabular]}>{formatCount(ownedList.filter(inFilter).length)}</Text>
                </Text>
                {shelf.length ? (
                  <Card style={styles.list}>{shelf.map((i, n) => row(i, n === 0))}</Card>
                ) : ownedList.some(inFilter) ? null : (
                  <Text style={styles.groupHelp}>Nothing from this shelf yet.</Text>
                )}
                {/*
                  Clear takes the whole shelf, built a tap at a time, so it
                  asks first and wears danger, like every other destructive
                  action in the app.
                */}
                {ownedList.length ? (
                  <Button
                    label="Clear shelf"
                    variant="dangerText"
                    size="sm"
                    onPress={confirmClear}
                    accessibilityHint="Asks first, then takes everything off the shelf"
                    style={styles.clear}
                  />
                ) : null}
              </>
            ) : null}

            {browse.length ? (
              <>
                <Text style={styles.groupTitle} accessibilityRole="header">
                  {filter === 'all' ? 'More to add' : `More ${CHIP_LABEL[filter].toLowerCase()}`}
                </Text>
                <Text style={styles.groupHelp}>Most used first. Anything else is a search away.</Text>
                <Card style={styles.list}>{browse.slice(0, browseShown).map((i, n) => row(i, n === 0))}</Card>
                {browse.length > browseShown ? (
                  <Button
                    label={`Show ${formatCount(Math.min(BROWSE_PAGE, browse.length - browseShown))} more`}
                    variant="secondary"
                    block
                    onPress={() => setBrowseShown((n) => n + BROWSE_PAGE)}
                    style={styles.more}
                  />
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* The live tally: what the shelf pours now, and what the last tap did. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={styles.footerText} accessible accessibilityLabel={`${formatCount(total)} drinks tonight${lastLine ? `. ${lastLine}` : ''}`}>
          <Text style={styles.footerTotal}>
            <Text style={tabular}>{formatCount(total)}</Text> {total === 1 ? 'drink' : 'drinks'} tonight
          </Text>
          {lastLine ? <Text style={styles.footerLast}>{lastLine}</Text> : null}
        </View>
        <Button label="Show me" onPress={onShowMe} accessibilityHint="Closes the sheet on what you can pour" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingBottom: space.xl },
  search: { marginHorizontal: layout.gutter, marginTop: space.xs },
  chips: { gap: space.sm, paddingHorizontal: layout.gutter, paddingTop: space.md },
  empty: { ...textRole.helper, color: colors.textMuted, paddingHorizontal: layout.gutter, paddingVertical: space.lg },

  groupTitle: { ...textRole.groupTitle, color: colors.text, paddingHorizontal: layout.gutter, marginTop: 18 },
  groupCount: { fontFamily: textRole.rowTitle.fontFamily, color: colors.textMuted },
  groupHelp: { ...textRole.helper, color: colors.textMuted, paddingHorizontal: layout.gutter, marginTop: 2 },
  list: { marginHorizontal: layout.gutter, marginTop: 10, overflow: 'hidden' },
  more: { marginHorizontal: layout.gutter, marginTop: space.md },
  clear: { alignSelf: 'flex-start', marginLeft: space.sm, marginTop: space.xs },

  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  footerText: { flexGrow: 1, flexShrink: 1 },
  footerTotal: { ...textRole.shelfTitle, color: colors.text },
  footerLast: { ...textRole.helper, color: colors.textMuted },
});
