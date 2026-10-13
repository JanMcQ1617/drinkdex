import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { formatPlateNumber } from '@/components/plate';
import { BottomSheet } from '@/components/Sheet';
import { haptic } from '@/components/ui';
import { colors, layout, radius, space, textRole } from '@/constants/theme';
import { DRINKS, formatCount, TOTAL } from '@/data';
import type { DexOrderChoice } from '@/store/dexPrefs';

/* ==================================================================== */
/* The Dex's order: its key and its sheet (v4.2 §2.3)                   */
/*                                                                      */
/* The quick row's first key says the order the grid is in, "For you ⌄" */
/* or "By number ⌄". The same 32pt, 4pt-cornered box as a chip, but     */
/* filled with the wash and never outlined, so it never reads as a      */
/* filter that is off; it opens a short sheet, Order, with the two      */
/* orders as radio rows. A tap applies and closes: the grid is redrawn  */
/* in place, at its top, with no transition (spec §5).                  */
/*                                                                      */
/* Drawn only when For you exists (answers with a flavour or a spirit,  */
/* and their fronts worked out). Without it the Dex is By number and    */
/* has nothing to choose between, so there is no key at all (§2.1).     */
/* The choice is kept per phone in store/dexPrefs, never synced.        */
/* ==================================================================== */

/** The order's name, as the key and the sheet say it. */
export const ORDER_WORDS: Readonly<Record<DexOrderChoice, string>> = {
  foryou: 'For you',
  number: 'By number',
};

/** The key's chevron: 14pt, ink (the wash under it carries muted at only 6.13:1, so the glyph is ink). */
const CHEVRON = 14;

/** The order key, first in the quick row. */
export function OrderKey({ order, onPress }: { order: DexOrderChoice; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={`Order, ${ORDER_WORDS[order]}`}
      accessibilityHint="Opens the order choice"
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
      <Text style={[styles.keyLabel, styles.ink]}>{ORDER_WORDS[order]}</Text>
      <Icon name="chevronDown" size={CHEVRON} color={colors.text} />
    </Pressable>
  );
}

const LAST = DRINKS[DRINKS.length - 1]?.dexNumber ?? TOTAL;

/* Each row's small line, and how VoiceOver says it ("Nº 0001" is the plate's spelling, for the eye). */
const ROWS: readonly { order: DexOrderChoice; line: string; spoken: string }[] = [
  {
    order: 'foryou',
    line: 'Your kinds of drinks first, then the rest by number',
    spoken: 'Your kinds of drinks first, then the rest by number',
  },
  { order: 'number', line: `${formatPlateNumber(1)} to ${formatCount(LAST)}`, spoken: `Number 1 to ${formatCount(LAST)}` },
];

export function OrderSheet({
  visible,
  onClose,
  order,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  order: DexOrderChoice;
  /** Applies the order; the sheet closes itself. */
  onChoose: (order: DexOrderChoice) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Order">
      <View accessibilityRole="radiogroup">
        {ROWS.map((r) => {
          const ticked = r.order === order;
          return (
            <Pressable
              key={r.order}
              onPress={() => {
                if (!ticked) haptic.select();
                onChoose(r.order);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: ticked }}
              accessibilityLabel={`${ORDER_WORDS[r.order]}. ${r.spoken}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <View style={styles.rowText}>
                <Text style={[textRole.body, styles.ink]}>{ORDER_WORDS[r.order]}</Text>
                <Text style={[textRole.small, styles.muted]}>{r.line}</Text>
              </View>
              {/* The tick holds its place unticked too, so the two rows' words line up. */}
              <View style={styles.tick}>{ticked ? <Icon name="check" size={22} color={colors.text} /> : null}</View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },

  /* A chip's box, the wash's fill: 32 tall, 4pt corners, 12 in at the left and 10 at the chevron. */
  key: {
    minHeight: layout.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.md,
    paddingRight: 10,
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
  },
  keyPressed: { backgroundColor: colors.press },
  keyLabel: {
    fontFamily: textRole.bodyMedium.fontFamily,
    fontSize: textRole.small.fontSize,
    lineHeight: textRole.small.lineHeight,
  },

  /* Two radio rows, 56 tall at the least, edge to edge under the press. */
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginHorizontal: -layout.gutter,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.press },
  rowText: { flex: 1 },
  tick: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
});
