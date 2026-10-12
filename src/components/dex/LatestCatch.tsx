import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace } from '@/components/DexCard';
import { Icon } from '@/components/icons';
import { haptic } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { catchDay } from '@/lib/drinkLabels';
import type { Drink, UnlockRecord } from '@/types';

/* ==================================================================== */
/* The latest catch                                                     */
/*                                                                      */
/* The drink most recently brought into the Dex, on Dex progress        */
/* (app/stats.tsx): its print and its name, and the day it was caught.  */
/* It used to be a kicker and a name in the Dex's head, beside the      */
/* gauge; the less-stuff layout (spec 5.2) took both off the Dex and    */
/* put them one tap away, here.                                         */
/*                                                                      */
/* Your pour when you took one, else the colour print (it is caught, so */
/* never the proof), else the no-photo face, decoded at the frame's     */
/* size by DrinkFace. The row opens the drink page.                     */
/* ==================================================================== */

/** The print beside the name: a row's square, a step up from a list thumb. */
const PRINT = 64;
const CHEVRON = 18;
const CAP = 1.3;

export function LatestCatch({
  drink,
  record,
  onOpen,
}: {
  drink: Drink;
  record: UnlockRecord;
  onOpen: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const day = catchDay(record.date);
  // The name's column: the gutters' inside, less the print, the chevron and the two gaps.
  const measure = width - 2 * layout.gutter - PRINT - CHEVRON - 2 * space.lg;

  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onOpen(drink.id);
      }}
      accessibilityRole="button"
      // The spoken number is unpadded: "#0009" is read digit by digit.
      accessibilityLabel={`Latest catch, ${drink.name}, number ${drink.dexNumber}${day ? `, ${day}` : ''}`}
      accessibilityHint="Opens the drink"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Print width={PRINT} height={PRINT}>
        <DrinkFace drink={drink} mode="photo" photoUri={record.photoUri} width={PRINT} height={PRINT} />
      </Print>
      <View style={styles.text}>
        {/* No line limit: the row grows with a long name. */}
        <DrinkName name={drink.name} role={textRole.name} measure={measure} cap={CAP} color={colors.text} />
        {day ? <Text style={[textRole.small, styles.muted]}>{`Caught ${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day}`}</Text> : null}
      </View>
      <Icon name="chevronRight" size={CHEVRON} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: layout.hit },
  // A row of text and a print dims while held, as a bar's words do: no fill behind it to draw.
  pressed: { opacity: 0.6 },
  text: { flex: 1, gap: 2 },
  muted: { color: colors.textMuted },
});
