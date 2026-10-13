import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import { layout, space } from '@/constants/theme';
import { chipOn, chipWord, toggleChip, type Chip as ChipKey, type ChipFilter } from '@/lib/dexOrder';
import type { DexOrderChoice } from '@/store/dexPrefs';

import { OrderKey } from './OrderSheet';

/* ==================================================================== */
/* The row under the Dex's field (v4.2 §1.5, §2.3)                      */
/*                                                                      */
/* The order key, then the quick chips: the sheet's own chips, one tap  */
/* each. Every chip that is on comes first, in sheet order, in ink;     */
/* then the person's own answers that are off (their flavours in the    */
/* order they picked them, then their spirits); with no answers,        */
/* Cocktails, Spirits and Not yet, then the first two flavours          */
/* (lib/dexOrder's quickChips, at most 8). The answers are offered,     */
/* never pre-picked (§1.6): a sour drinker still meets the Old          */
/* Fashioned.                                                           */
/*                                                                      */
/* No counts here (they are in the sheet), so the row stays quiet. It   */
/* scrolls sideways edge to edge, cut by the screen's edge as the cue,  */
/* and opts out of scrollsToTop so a status-bar tap reaches the grid.   */
/* ==================================================================== */

const keyOf = (c: ChipKey) => `${c.group}:${c.key}`;

export function QuickChips({
  chips,
  filter,
  onChange,
  order,
  onOrder,
}: {
  /** lib/dexOrder's quickChips for this filter and these answers. */
  chips: readonly ChipKey[];
  filter: ChipFilter;
  onChange: (f: ChipFilter) => void;
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
      {chips.map((c) => (
        <Chip
          key={keyOf(c)}
          label={chipWord(c)}
          selected={chipOn(filter, c)}
          onPress={() => onChange(toggleChip(filter, c))}
        />
      ))}
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
  /* Edge to edge: the row runs under the gutters, and its first key starts on x 24. */
  scroll: { marginHorizontal: -layout.gutter, marginVertical: -SLOP, flexGrow: 0 },
  row: { paddingHorizontal: layout.gutter, paddingVertical: SLOP, gap: space.sm, alignItems: 'center' },
});
