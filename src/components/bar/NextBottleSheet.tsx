import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet } from '@/components/Sheet';
import { Button } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { type BarResult, INGREDIENTS_BY_ID, inSentence, nextBottles } from '@/lib/bar';
import { textWidth } from '@/lib/textFit';

import { likeLine } from './model';

/* ==================================================================== */
/* Next bottle                                                          */
/*                                                                      */
/* The next line's words open this (shelves spec 5.7): the ten bottles  */
/* that would pour the most, in the canonical order (src/lib/bar.ts,    */
/* nextBottles), each with what its Add really pours. It is the one     */
/* ranked list in My Bar, so it FREEZES: the order is taken once, when  */
/* the sheet opens, and held until it closes. An Add turns its own key  */
/* to "Added" where it stands, and a second tap takes the bottle back   */
/* out; the other rows keep their places while their counts update.     */
/* ==================================================================== */

/** Rows the sheet holds. */
const TOP = 10;
/** The key's width at the default text size (shelves spec 5.7: 100 x 36). */
const KEY_WIDTH = 100;
/** A small key's sides (14 each, its 1pt edge inside), the check (16) and its gap (8): what "✓ Added" holds besides its word. */
const ADDED_CHROME = 2 * 14 + 2 + 16 + 8;

/**
 * Add and Added share ONE width, worked out for the wider of the two at
 * the reader's text size, so the key never changes size under the finger
 * (a minimum alone let "✓ Added" grow past 100, and the row's words with
 * it). textWidth errs long, so the word always fits.
 */
function keyWidth(fontScale: number): number {
  return Math.max(KEY_WIDTH, Math.ceil(ADDED_CHROME + textWidth('Added', 'text', textRole.buttonSm.fontSize! * fontScale)));
}

export function NextBottleSheet({
  visible,
  result,
  owned,
  skip,
  onToggle,
  onClose,
}: {
  visible: boolean;
  result: BarResult;
  owned: Record<string, true>;
  /** Bottles taken out on this visit: their struck tiles hold the way back. */
  skip: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Next bottle">
      <Rows result={result} owned={owned} skip={skip} onToggle={onToggle} />
    </BottomSheet>
  );
}

/** Mounted with each opening (the Modal drops its children once it has gone), so each opening takes the order afresh. */
function Rows({
  result,
  owned,
  skip,
  onToggle,
}: {
  result: BarResult;
  owned: Record<string, true>;
  skip: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const width = keyWidth(fontScale);
  const [order] = useState(() =>
    nextBottles(result, skip)
      .slice(0, TOP)
      .map((n) => n.ingredient.id),
  );
  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {order.map((id) => {
        const i = INGREDIENTS_BY_ID[id];
        if (!i) return null;
        const on = !!owned[id];
        const line = on ? 'In your bar' : likeLine(result.gains.get(id) ?? []);
        return (
          <View key={id} style={styles.row}>
            <View style={styles.words}>
              <Text style={[textRole.bodyMedium, styles.ink]}>{i.label}</Text>
              <Text style={[textRole.small, styles.muted]}>{line}</Text>
            </View>
            <Button
              label={on ? 'Added' : 'Add'}
              icon={on ? 'check' : undefined}
              variant={on ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => onToggle(id)}
              accessibilityLabel={on ? `${i.label}, in your bar` : `Add ${inSentence(i)}`}
              accessibilityHint={on ? 'Takes it back out of your bar' : line}
              accessibilityState={{ selected: on }}
              style={{ width }}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -layout.gutter, flexGrow: 0 },
  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  words: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
});
