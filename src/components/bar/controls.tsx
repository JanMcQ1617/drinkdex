import React from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

import { Icon } from '@/components/icons';
import { colors, layout, radius, space, tabular, textRole } from '@/constants/theme';
import { type Ingredient, isGeneric } from '@/lib/bar';

import { rowLabel } from './model';

/* ==================================================================== */
/* Controls My Bar's lists share                                        */
/*                                                                      */
/* One row for an ingredient you can add or take out, wherever it is    */
/* listed: the add field's results, a shelf's picker. A tap anywhere on */
/* the row adds or removes at once, in place: the mark fills where it   */
/* stands, "+N" goes, and no row moves (Jan's "fewest steps": no Done). */
/* ==================================================================== */

/** The picker's box (shelves spec 5.2): 24 square, 4 corners. */
const BOX = 24;
/** The add field's key: a squared +/✓ key, 44 x 36, 4pt of slop to 44 tall. */
const KEY = { width: 44, height: layout.controlSm } as const;
/** The box's resting edge: 1.5pt of the control grey, a UI mark at 3.45:1. */
const BOX_EDGE = 1.5;

/**
 * Whether it is in your bar, drawn the two ways the spec asks for:
 *
 *   box  a shelf picker (a checklist): an empty 1.5pt box, or ink with a check
 *   key  the add field (one at a time): a wash key with a +, or ink with a check
 *
 * The same size on and off, so a tap never moves what sits beside it.
 */
export function Mark({ on, kind }: { on: boolean; kind: 'box' | 'key' }) {
  if (kind === 'box') {
    return (
      <View style={[styles.box, on ? styles.boxOn : styles.boxOff]}>
        {on ? <Icon name="check" size={18} color={colors.onInk} /> : null}
      </View>
    );
  }
  return (
    <View style={[styles.key, on ? styles.keyOn : styles.keyOff]}>
      <Icon name={on ? 'check' : 'plus'} size={18} color={on ? colors.onInk : colors.text} />
    </View>
  );
}

/**
 * A figure ("+10", "−5") in a slot always as wide as `reserve` at the
 * reader's text size, shown or not. The words beside it keep one measure,
 * so a figure that comes or goes after a tap never re-wraps them (a row
 * or key that grew a line would push down what sits under the finger).
 * Wider than the reserve (a third digit), the slot grows.
 */
export function FigureSlot({
  value,
  reserve,
  style,
}: {
  value: string | null;
  reserve: string;
  style: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.slot}>
      <Text style={style}>{value ?? ''}</Text>
      <Text accessible={false} style={[style, styles.reserve]}>
        {reserve}
      </Text>
    </View>
  );
}

/**
 * An ingredient you can tick: its label (a long one wraps and the row
 * grows; rows are in a fixed order, so a taller one moves nothing that
 * was not already below it), the note that explains the hit when there
 * is one, "+N" while it is out of your bar and would pour something, and
 * the mark. `onToggle` adds or removes it; the screen's apply() ticks and
 * speaks for every way into the bar, so this row does neither.
 *
 * A tap must not change the height of any row above it. "+N" sits in a
 * reserved slot; a generic's note is the one note that changes with your
 * bar ("Any whiskey" becomes "Any whiskey · covered by your bourbon" when
 * you tick Bourbon, the row under it), so it keeps to one line and
 * VoiceOver reads the whole of it.
 */
export const IngredientRow = React.memo(function IngredientRow({
  ingredient,
  on,
  gain,
  note,
  mark,
  onToggle,
}: {
  ingredient: Ingredient;
  on: boolean;
  gain: number;
  note: string | null;
  mark: 'box' | 'key';
  onToggle: (id: string) => void;
}) {
  const plus = !on && gain > 0;
  return (
    <Pressable
      onPress={() => onToggle(ingredient.id)}
      accessibilityRole="button"
      accessibilityLabel={rowLabel(ingredient, on, gain, note)}
      accessibilityHint={on ? 'Takes it out of your bar' : 'Adds it to your bar'}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.words}>
        <Text style={[textRole.body, styles.ink]}>{ingredient.label}</Text>
        {note ? (
          <Text numberOfLines={isGeneric(ingredient.id) ? 1 : undefined} style={[textRole.small, styles.muted]}>
            {note}
          </Text>
        ) : null}
      </View>
      <FigureSlot value={plus ? `+${gain}` : null} reserve="+00" style={[textRole.body, tabular, styles.muted]} />
      <Mark on={on} kind={mark} />
    </Pressable>
  );
});

/** A quiet section head inside a list ("Gin", "Rum" in the Spirits picker): small, muted, a header. */
export function ListHead({ label }: { label: string }) {
  return (
    <Text accessibilityRole="header" style={[textRole.small, styles.muted, styles.head]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.press },
  words: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  // Sizes the slot's width and draws nothing: no height, no ink.
  slot: { alignItems: 'flex-end' },
  reserve: { height: 0, opacity: 0 },
  head: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xs },

  box: { width: BOX, height: BOX, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  boxOff: { borderWidth: BOX_EDGE, borderColor: colors.lineControl },
  boxOn: { backgroundColor: colors.text },
  key: { ...KEY, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  keyOff: { backgroundColor: colors.bgSunk },
  keyOn: { backgroundColor: colors.text },
});
