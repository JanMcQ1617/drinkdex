import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/Sheet';
import { Button } from '@/components/ui';
import { colors, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { type Ingredient, inSentence, type MakeSection, SHELF_LABEL } from '@/lib/bar';

import { MakeSheet } from './MakeSheet';
import { familyNote } from './model';

/* ==================================================================== */
/* A bottle on your shelf                                               */
/*                                                                      */
/* Tap a tile (shelves spec 5.4, v4-changes 6.3): its name and shelf,   */
/* how much of what you can make it is in, "Show its drinks", and one   */
/* way to take it out. Removal is two taps on purpose: a tile is the    */
/* biggest target on the screen, and a scroll that ends on one must     */
/* never take a bottle out.                                             */
/*                                                                      */
/* "Show its drinks" opens the Make list narrowed to this bottle ON TOP */
/* of this sheet, the way iOS stacks sheets: swiping it away comes back */
/* here, where Remove is. UIKit cannot present a sheet from a screen    */
/* whose last sheet is still leaving, so stacking is also what lets it  */
/* open at all.                                                         */
/* ==================================================================== */

/** What the sheet shows, taken when it opens (the numbers hold while it is up). */
export interface IngredientInfo {
  ingredient: Ingredient;
  /** How many of the drinks you can make use it. */
  used: number;
  /** How many you can make in all. */
  total: number;
  /** The Make list narrowed to it. */
  sections: readonly MakeSection[];
}

export function IngredientSheet({
  info,
  onClose,
  onRemove,
  onOpenDrink,
}: {
  info: IngredientInfo | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  /** A drink tapped in "Show its drinks", once that list has gone. */
  onOpenDrink: (drinkId: string) => void;
}) {
  // The last bottle shown, so the sheet keeps its words while it fades out.
  const [shown, setShown] = useState<IngredientInfo | null>(info);
  if (info && info !== shown) setShown(info);
  const [drinksOpen, setDrinksOpen] = useState(false);
  if (!info && drinksOpen) setDrinksOpen(false);

  if (!shown) return null;
  const { ingredient: i, used, total, sections } = shown;
  const note = familyNote(i);
  const usage =
    used > 0
      ? `In ${formatCount(used)} of the ${formatCount(total)} you can make`
      : total > 0
        ? `None of the ${formatCount(total)} you can make use it yet.`
        : 'Nothing to make with it yet.';

  return (
    <BottomSheet visible={info !== null} onClose={onClose}>
      <View accessible accessibilityRole="header" accessibilityLabel={`${i.label}, ${SHELF_LABEL[i.shelf]}`}>
        <Text style={[textRole.bodyStrong, styles.ink]}>{i.label}</Text>
        <Text style={[textRole.small, styles.muted]}>{SHELF_LABEL[i.shelf]}</Text>
      </View>
      <Text style={[textRole.body, styles.ink, styles.usage]}>{usage}</Text>
      {used > 0 ? (
        <Button
          label="Show its drinks"
          variant="text"
          onPress={() => setDrinksOpen(true)}
          accessibilityHint={`Lists the drinks you can make with ${inSentence(i)}`}
          style={styles.show}
        />
      ) : null}
      {note ? <Text style={[textRole.small, styles.muted, styles.note]}>{note}</Text> : null}
      <Button
        label="Remove from my bar"
        variant="secondary"
        block
        onPress={() => onRemove(i.id)}
        accessibilityHint="Its tile stays, struck, until you leave My Bar, and a tap on it puts it back"
        style={styles.remove}
      />
      <MakeSheet
        visible={drinksOpen}
        title={`You can make ${formatCount(used)} with ${inSentence(i)}`}
        sections={sections}
        onClose={() => setDrinksOpen(false)}
        onOpen={onOpenDrink}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  usage: { marginTop: space.xl },
  // The text key's own 12pt side padding, taken back so the word sits on the gutter.
  show: { alignSelf: 'flex-start', marginLeft: -space.md },
  note: { marginTop: space.sm },
  remove: { marginTop: space.xl },
});
