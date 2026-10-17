import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button } from '@/components/ui';
import { colors, layout, radius, space, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { type Ingredient, inSentence, type NextBottle } from '@/lib/bar';

import { FigureSlot } from './controls';
import { signed } from './model';

/* ==================================================================== */
/* The payoff, and the next bottle                                      */
/*                                                                      */
/* The payoff key is the screen's one ink key (the tabs judge's graft): */
/* "You can make 31", then the last change on this visit ("+10",        */
/* "−5") before the chevron, so a tick anywhere says what it did       */
/* without a toast. It sits in the head that does not scroll, so at a  */
/* hundred bottles it is still in view.                                 */
/*                                                                      */
/* The next line names the one bottle that would pour the most and     */
/* adds it in one tap. After that tap the line HOLDS ("Dry vermouth is  */
/* in · Undo") until the next change or until you leave the tab, so    */
/* the next suggestion never slides under the finger that just added.  */
/* ==================================================================== */

/*
 * The words at their widest: a three-figure total (the index pours at most
 * 899) and the idle line. The key is sized by both, laid in one place, so
 * neither a total that gains a digit nor the first drink (the idle key
 * turning ink) can re-wrap it at a large text size and push the add field,
 * and the rows under it, down beneath the finger mid-search.
 */
const RESERVE = ['You can make 888', 'Nothing to make yet'] as const;

export function PayoffKey({
  total,
  change,
  onPress,
}: {
  total: number;
  /** This visit's last change in what you can make, or null before one. */
  change: number | null;
  onPress: () => void;
}) {
  const idle = !total;
  // Both looks keep one layout (the slot and the chevron's room too), so the key's height never depends on which shows.
  const inner = (
    <>
      <View style={styles.flex}>
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {RESERVE.map((words, k) => (
            <Text key={words} style={[textRole.bodyStrong, styles.ghost, styles.reserve, k === 0 && styles.under]}>
              {words}
            </Text>
          ))}
        </View>
        <View style={styles.layer}>
          <Text style={[textRole.bodyStrong, idle ? styles.ink : styles.onInk]}>
            {idle ? 'Nothing to make yet' : `You can make ${formatCount(total)}`}
          </Text>
        </View>
      </View>
      {/* Its slot is held from the start, so the first "+10" never re-wraps the words either. */}
      <FigureSlot value={idle ? null : signed(change)} reserve="−00" style={[textRole.body, tabular, styles.onInkMuted]} />
      <View style={idle && styles.ghost}>
        <Icon name="chevronRight" size={22} color={colors.onInk} />
      </View>
    </>
  );
  if (idle) {
    // Nothing to make: the wash key's look, and not a button (there is no list to open).
    return <View style={[styles.key, styles.keyIdle]}>{inner}</View>;
  }
  const said = change ? `, ${change > 0 ? 'up' : 'down'} ${formatCount(Math.abs(change))} since the last change` : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`You can make ${formatCount(total)}${said}`}
      accessibilityHint="Lists every drink your bar makes"
      style={({ pressed }) => [styles.key, pressed ? styles.keyHeld : styles.keyInk]}>
      {inner}
    </Pressable>
  );
}

export function NextLine({
  best,
  held,
  onOpen,
  onAdd,
  onUndo,
}: {
  /** Row 1 of Next bottle, or null when nothing is one bottle away. */
  best: NextBottle | null;
  /** The bottle this line just added, held in place with its Undo. */
  held: Ingredient | null;
  onOpen: () => void;
  onAdd: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  if (held) {
    return (
      <View style={styles.line}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${held.label} is in your bar`}
          accessibilityHint="Opens Next bottle"
          style={({ pressed }) => [styles.words, pressed && styles.pressed]}>
          <Text style={[textRole.bodyMedium, styles.ink]}>{held.label} is in</Text>
        </Pressable>
        <Button
          label="Undo"
          variant="text"
          size="sm"
          onPress={() => onUndo(held.id)}
          accessibilityLabel={`Undo, takes ${inSentence(held)} back out`}
        />
      </View>
    );
  }
  if (!best) return null;
  const { ingredient: i, matches } = best;
  const more = `${formatCount(matches.length)} more ${matches.length === 1 ? 'recipe' : 'recipes'}`;
  return (
    <View style={styles.line}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Add ${inSentence(i)}, ${more}`}
        accessibilityHint="Opens Next bottle, the ten bottles that open up the most recipes"
        style={({ pressed }) => [styles.words, styles.wrap, pressed && styles.pressed]}>
        <Text style={[textRole.bodyMedium, styles.ink, styles.shrink]}>Add {inSentence(i)}</Text>
        <Icon name="arrowRight" size={16} color={colors.textMuted} />
        <Text style={[textRole.body, styles.muted, styles.shrink]}>{more}</Text>
      </Pressable>
      <Button
        label="Add"
        variant="secondary"
        size="sm"
        onPress={() => onAdd(i.id)}
        accessibilityLabel={`Add ${inSentence(i)}`}
        accessibilityHint={`Puts it in your bar: ${more}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  key: {
    minHeight: layout.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control,
  },
  keyInk: { backgroundColor: colors.text },
  keyHeld: { backgroundColor: colors.inkPressed },
  keyIdle: { backgroundColor: colors.bgSunk },
  flex: { flex: 1 },
  // The reserve lines share one place: the first gives its width back, so the row is as tall as the taller of the two.
  stack: { flexDirection: 'row' },
  ghost: { opacity: 0 },
  reserve: { width: '100%' },
  under: { marginRight: '-100%' },
  layer: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  onInk: { color: colors.onInk },
  onInkMuted: { color: colors.onInkMuted },

  line: { minHeight: layout.hit, flexDirection: 'row', alignItems: 'center', gap: space.md },
  words: { flex: 1, minHeight: layout.hit, justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm },
  // At a large text size a long name wraps inside its own run instead of running off the line.
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.5 },
});
