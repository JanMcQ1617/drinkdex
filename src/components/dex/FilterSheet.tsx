import React from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/Sheet';
import { Button, Chip } from '@/components/ui';
import { CATEGORY_META, CATEGORY_ORDER, space } from '@/constants/theme';
import { COUNT_BY_CATEGORY, formatCount, TOTAL } from '@/data';
import type { DrinkCategory } from '@/types';

import type { CategoryFilter, StatusFilter } from './dexFilter';

/* ==================================================================== */
/* The Dex's filter sheet                                               */
/*                                                                      */
/* What was the chip row under the Dex's search (layout spec 5.2, "the  */
/* filter icon inside the field opens a sheet with the same choices"):  */
/* All · Cocktails · Spirits, then Caught · Not yet, each counted. A    */
/* chip applies at once, so the grid behind the scrim has already       */
/* changed when the sheet goes; there is no Apply.                      */
/*                                                                      */
/* The second axis has no "All": neither on is every entry, and a       */
/* second tap on the one that is on turns it off. Two "All" chips one   */
/* row apart read as a mistake.                                         */
/*                                                                      */
/* Counts are worked from the data, never typed: the kinds from the     */
/* catalogue, Caught and Not yet within the kind chosen above them, so  */
/* each row answers "how many would I see".                             */
/* ==================================================================== */

export function FilterSheet({
  visible,
  onClose,
  category,
  status,
  caughtByCategory,
  onCategory,
  onStatus,
}: {
  visible: boolean;
  onClose: () => void;
  category: CategoryFilter;
  status: StatusFilter;
  /** Catalogue drinks in your Dex, by kind. */
  caughtByCategory: Record<DrinkCategory, number>;
  onCategory: (c: CategoryFilter) => void;
  onStatus: (s: StatusFilter) => void;
}) {
  const scopeTotal = category === 'all' ? TOTAL : COUNT_BY_CATEGORY[category];
  const scopeCaught =
    category === 'all'
      ? CATEGORY_ORDER.reduce((n, c) => n + caughtByCategory[c], 0)
      : caughtByCategory[category];
  const on = category !== 'all' || status !== 'all';
  const kind = category === 'all' ? 'drinks' : CATEGORY_META[category].plural.toLowerCase();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filter">
      <View style={styles.row}>
        <Chip
          label="All"
          count={TOTAL}
          selected={category === 'all'}
          accessibilityLabel={`All drinks, ${formatCount(TOTAL)}`}
          onPress={() => onCategory('all')}
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
              accessibilityLabel={`${meta.plural}, ${formatCount(total)}`}
              onPress={() => onCategory(key)}
            />
          );
        })}
      </View>

      <View style={[styles.row, styles.second]}>
        <Chip
          label="Caught"
          count={scopeCaught}
          selected={status === 'unlocked'}
          accessibilityLabel={`Caught, ${formatCount(scopeCaught)} ${kind} in your Dex`}
          onPress={() => onStatus(status === 'unlocked' ? 'all' : 'unlocked')}
        />
        <Chip
          label="Not yet"
          count={scopeTotal - scopeCaught}
          selected={status === 'locked'}
          accessibilityLabel={`Not yet, ${formatCount(scopeTotal - scopeCaught)} ${kind} not in your Dex`}
          onPress={() => onStatus(status === 'locked' ? 'all' : 'locked')}
        />
      </View>

      {/*
        Laid out whether or not a filter is on, so the sheet keeps its
        height when the last chip is turned off under the finger.
      */}
      <View style={styles.foot}>
        {on ? (
          <Button
            label="Clear filters"
            variant="text"
            size="sm"
            onPress={() => {
              onCategory('all');
              onStatus('all');
            }}
            style={styles.clear}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  second: { marginTop: space.lg },
  foot: { minHeight: 44, marginTop: space.md, justifyContent: 'center', alignItems: 'flex-start' },
  /* The text key's own inset, taken back so its word starts on the gutter. */
  clear: { marginLeft: -space.sm },
});
