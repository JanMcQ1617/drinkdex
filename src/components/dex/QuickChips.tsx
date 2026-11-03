import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Chip } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import type { DexOrderChoice } from '@/store/dexPrefs';

import {
  dexChipOn,
  dexChipWord,
  dexFigure,
  optionSays,
  toggleDex,
  tokenWord,
  type DexChip,
  type DexCounts,
  type DexFilter,
} from './dexFilter';
import { OrderKey } from './OrderSheet';

/* ==================================================================== */
/* The rows under the Dex's field (v4.14, specs/v4.14/filters.md)       */
/*                                                                      */
/* QUICK CHIPS. The order key, then the choices people make first, one  */
/* tap each (dexFilter's quickPicks): Cocktails, Spirits, Wines; the    */
/* person's flavours (or four of the seven), up to two of their         */
/* spirits; Light; I can make it while My Bar is on; Not yet. In a      */
/* fixed order, on or off, so nothing moves under a finger. A pick that */
/* would show nothing under what is on (Sour and citrusy among wines)   */
/* is dimmed and cannot be tapped, as in the sheet; the figures stay in */
/* the sheet, so the row is quiet, and VoiceOver says each one.         */
/*                                                                      */
/* WHAT IS ON. Under it while anything is, the row of what the grid is  */
/* filtered by, every facet's choices in sheet order, each a token      */
/* whose × takes it off, after one "Clear all". The sheet's choices     */
/* with no quick chip (Italy, Nebbiolo, Scotch) show here, so a         */
/* filtered grid always says why it is short.                           */
/*                                                                      */
/* Both scroll sideways edge to edge, cut by the screen's edge as the   */
/* cue, and opt out of scrollsToTop so a status-bar tap reaches the     */
/* grid.                                                                */
/* ==================================================================== */

const keyOf = (c: DexChip) => `${c.facet}:${c.key}`;

export function QuickChips({
  picks,
  filter,
  counts,
  onChange,
  order,
  onOrder,
}: {
  /** dexFilter's quickPicks for these answers. */
  picks: readonly DexChip[];
  filter: DexFilter;
  /** The live counts while anything is on or typed; null at rest, when every pick has drinks. */
  counts: DexCounts | null;
  onChange: (f: DexFilter) => void;
  /** The order the grid is in, for its key; null draws no key (no For you, §2.1). */
  order: DexOrderChoice | null;
  onOrder: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollsToTop={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}>
      {order ? <OrderKey order={order} onPress={onOrder} /> : null}
      {picks.map((c) => {
        const n = dexFigure(counts, c);
        const on = dexChipOn(filter, c);
        return (
          <Chip
            key={keyOf(c)}
            label={dexChipWord(c)}
            selected={on}
            disabled={n === 0 && !on}
            accessibilityLabel={optionSays(c, n)}
            onPress={() => onChange(toggleDex(filter, c, counts))}
          />
        );
      })}
    </ScrollView>
  );
}

export function ActiveFilters({
  chips,
  filter,
  counts,
  onChange,
  onClear,
}: {
  /** dexFilter's dexChipsOn: what is on, in sheet order. */
  chips: readonly DexChip[];
  filter: DexFilter;
  /** The live counts, so taking one choice off never empties the grid (toggleDex). */
  counts: DexCounts | null;
  onChange: (f: DexFilter) => void;
  onClear: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollsToTop={false}
      accessibilityLabel="Filters on"
      style={styles.scroll}
      contentContainerStyle={styles.row}>
      {/* First, so one tap clears however many are on, with the row scrolled anywhere. */}
      <Pressable
        onPress={onClear}
        hitSlop={{ top: SLOP, bottom: SLOP, left: space.xs, right: space.xs }}
        accessibilityRole="button"
        accessibilityLabel="Clear all filters"
        style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
        <Text style={[styles.clearLabel, styles.ink, styles.underline]}>Clear all</Text>
      </Pressable>
      {chips.map((c) => {
        const word = tokenWord(c);
        return (
          <Chip
            key={keyOf(c)}
            label={word}
            selected
            trailingIcon="close"
            accessibilityLabel={`Remove ${word}`}
            onPress={() => onChange(toggleDex(filter, c, counts))}
          />
        );
      })}
    </ScrollView>
  );
}

/*
 * A chip is 32 drawn with 6pt of slop above and below (44). A scroll view
 * clips its touches to its own box, so the box is 44 tall, taken back by
 * a negative margin: the row still lays out as 32.
 */
const SLOP = (layout.hit - layout.chip) / 2;

const styles = StyleSheet.create({
  ink: { color: colors.text },
  pressed: { opacity: 0.5 },
  underline: { textDecorationLine: 'underline', textDecorationColor: colors.text },

  /* Edge to edge: the row runs under the gutters, and its first key starts on x 24. */
  scroll: { marginHorizontal: -layout.gutter, marginVertical: -SLOP, flexGrow: 0 },
  row: { paddingHorizontal: layout.gutter, paddingVertical: SLOP, gap: space.sm, alignItems: 'center' },

  /* Clear all: a chip's height, the label in the chip's own face, underlined as the sheet's Clear. */
  clear: { minHeight: layout.chip, justifyContent: 'center', paddingRight: space.xs },
  clearLabel: {
    fontFamily: textRole.bodyMedium.fontFamily,
    fontSize: textRole.small.fontSize,
    lineHeight: textRole.small.lineHeight,
  },
});
