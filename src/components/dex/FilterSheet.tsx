import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/Sheet';
import { Button, Chip } from '@/components/ui';
import { colors, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  chipOn,
  chipWord,
  filterIsOn,
  FLAVOUR_ORDER,
  NO_FILTER,
  SPIRIT_ORDER,
  toggleChip,
  type Chip as ChipKey,
  type ChipFilter,
  type FacetCounts,
} from '@/lib/dexOrder';

/* ==================================================================== */
/* The Dex's filter sheet (v4.2 §1.4, frame `filter`)                   */
/*                                                                      */
/* Behind the sliders key in the field. Four groups in the first run's  */
/* own words, so "Sour and citrusy" means one thing everywhere in the   */
/* app: Flavour (seven, Fruity among them), Spirit (seven), Kind, and   */
/* In your Dex. OR inside a group, AND across groups. A chip applies at */
/* once, so the grid behind the scrim has already changed; the ink key  */
/* at the foot ("Show 525 drinks") only closes. It is drawn disabled as */
/* "No drinks match" at 0, never hidden, so the sheet keeps its shape.  */
/*                                                                      */
/* Kind and In your Dex have no "All": neither on is every drink, and a */
/* second tap on the one that is on turns it off (lib/dexOrder's        */
/* toggleChip). Two "All" chips one row apart read as a mistake.        */
/*                                                                      */
/* FACETED COUNTS. A chip's figure is what the grid would hold with     */
/* that chip as its group's only choice and the other groups as they    */
/* are (lib/dexOrder's facetCounts, bit tests over data/tasteTags.json, */
/* worked by the Dex while the sheet is open, over what a search typed  */
/* behind it finds), so each chip answers "how many would I see".       */
/* Worked from the data, never typed.                                   */
/*                                                                      */
/* Large text: the groups scroll inside the sheet and the foot key      */
/* stays. VoiceOver: each group is a list headed by its label; a chip   */
/* is a button with `selected`, "Fruity, 235 drinks".                   */
/* ==================================================================== */

interface Group {
  label: string;
  chips: readonly ChipKey[];
}

/** The four groups, in sheet order (spec §1.1). */
const GROUPS: readonly Group[] = [
  { label: 'Flavour', chips: FLAVOUR_ORDER.map((key): ChipKey => ({ group: 'flavour', key })) },
  { label: 'Spirit', chips: SPIRIT_ORDER.map((key): ChipKey => ({ group: 'spirit', key })) },
  {
    label: 'Kind',
    chips: [
      { group: 'kind', key: 'cocktail' },
      { group: 'kind', key: 'spirit' },
    ],
  },
  {
    label: 'In your Dex',
    chips: [
      { group: 'status', key: 'unlocked' },
      { group: 'status', key: 'locked' },
    ],
  },
];

/** A chip's faceted figure. */
function countOf(counts: FacetCounts, c: ChipKey): number {
  switch (c.group) {
    case 'flavour':
      return counts.flavours[c.key];
    case 'spirit':
      return counts.spirits[c.key];
    case 'kind':
      return counts.kind[c.key];
    case 'status':
      return counts.status[c.key];
  }
}

const keyOf = (c: ChipKey) => `${c.group}:${c.key}`;

export function FilterSheet({
  visible,
  onClose,
  filter,
  counts,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  filter: ChipFilter;
  /** The faceted counts for `filter`; null only while the sheet is shut. */
  counts: FacetCounts | null;
  onChange: (f: ChipFilter) => void;
}) {
  const on = filterIsOn(filter);
  const total = counts?.total ?? 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/*
        The title's row: "Filter", and Clear while anything is on. The row
        keeps its height either way, so the chips do not move when the
        last one is turned off under the finger.
      */}
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
          Filter
        </Text>
        {on ? (
          <Pressable
            onPress={() => onChange(NO_FILTER)}
            hitSlop={{ top: 10, bottom: 10, left: space.sm, right: space.sm }}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[textRole.bodyMedium, styles.ink, styles.underline]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.groups}
        showsVerticalScrollIndicator={false}
        // A status-bar tap scrolls the Dex home, not this sheet.
        scrollsToTop={false}
        bounces={false}>
        {GROUPS.map((g) => (
          <View key={g.label} accessibilityRole="list" style={styles.group}>
            <Text accessibilityRole="header" style={[textRole.groupTitle, styles.muted]}>
              {g.label}
            </Text>
            <View style={styles.chips}>
              {g.chips.map((c) => {
                const n = counts ? countOf(counts, c) : null;
                const word = chipWord(c);
                return (
                  <Chip
                    key={keyOf(c)}
                    label={word}
                    count={n ?? undefined}
                    selected={chipOn(filter, c)}
                    accessibilityLabel={n === null ? word : `${word}, ${formatCount(n)} ${n === 1 ? 'drink' : 'drinks'}`}
                    onPress={() => onChange(toggleChip(filter, c))}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.foot}>
        <Button
          label={total > 0 ? `Show ${formatCount(total)} ${total === 1 ? 'drink' : 'drinks'}` : 'No drinks match'}
          onPress={onClose}
          disabled={total === 0}
          block
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.5 },
  underline: { textDecorationLine: 'underline', textDecorationColor: colors.text },

  /* The title and Clear on one row, 44 tall whether or not Clear is drawn. */
  titleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
  },
  title: { flexShrink: 1 },

  /* The groups scroll inside the sheet at large text sizes; the foot key stays. */
  scroll: { flexGrow: 0, flexShrink: 1 },
  groups: { paddingBottom: space.xs },
  /* 24 between groups, the label 8 over its chips. */
  group: { marginTop: space.xl, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  foot: { marginTop: space.xl },
});
