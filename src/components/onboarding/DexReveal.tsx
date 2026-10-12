import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { colors, tabular, textRole } from '@/constants/theme';
import { getDrink } from '@/data';

import { DEX_GAP, DEX_LABEL_GAP, DEX_ROW_GAP } from './metrics';
import { Appear, FadeOut, T, useSettled } from './motion';
import { DrinkPrint } from './Photo';

/* ==================================================================== */
/* "Every drink you try goes in your Dex."                              */
/*                                                                      */
/* The narration's body (spec 1.2 step 3, m15; index.html#dexintro):    */
/* nine of the catalogue's grey proofs in the Dex's own three columns,  */
/* each with its number, and from +400ms the drinks the mockup shows    */
/* caught print in colour in turn, 350ms apart: the colour print is     */
/* mounted over its proof on its turn at 0.6 and fades up (300ms), and   */
/* its "Nº 0127" turns from muted to ink. Nothing starts hidden; under  */
/* Reduce Motion they are printed from the first frame.                 */
/*                                                                      */
/* VoiceOver reads the grid as one line after the bubble (spec 10).     */
/* ==================================================================== */

/** The nine, in reading order (index.html#dexintro): Nº 0127 0106 0004 0023 0128 0025 0100 0113 0112. */
const IDS = [
  'negroni',
  'margarita',
  'espresso-martini',
  'mojito',
  'old-fashioned',
  'paloma',
  'daiquiri',
  'aperol-spritz',
  'whiskey-sour',
] as const;
/** The four that print, in turn, as dexintro.png shows them caught. */
const PRINTS: readonly string[] = ['negroni', 'mojito', 'old-fashioned', 'daiquiri'];

const FIRST_AT = 400;
const EVERY = 350;
const PRINT_MS = 300;
const LABEL_MS = 350;
/** When the last print has finished: the step moves on 1.8s after this (m18). */
export const DEX_REVEAL_MS = FIRST_AT + (PRINTS.length - 1) * EVERY + PRINT_MS;
export const DEX_SPOKEN = 'Nine drinks, four printed in colour.';

const CAP = 1.3;

function plate(id: string): string {
  const n = getDrink(id)?.dexNumber ?? 0;
  return `Nº ${String(n).padStart(4, '0')}`;
}

function Cell({ id, size, printed }: { id: string; size: number; printed: boolean }) {
  const reduce = useReducedMotion();
  // The muted number's fading copy is unmounted by this clock, so the ink one is what stays.
  const inked = useSettled(printed, LABEL_MS + T.settle);
  return (
    <View style={{ width: size }}>
      <View style={{ width: size, height: size }}>
        <DrinkPrint id={id} size={size} kind="proof" />
        {printed ? (
          <Appear duration={PRINT_MS} style={StyleSheet.absoluteFill}>
            <DrinkPrint id={id} size={size} ground={false} />
          </Appear>
        ) : null}
      </View>
      <View style={styles.plateBox}>
        <Text maxFontSizeMultiplier={CAP} style={[styles.plate, { color: printed ? colors.text : colors.textMuted }]}>
          {plate(id)}
        </Text>
        {printed && !inked && !reduce ? (
          <FadeOut duration={LABEL_MS} style={styles.plateOld}>
            <Text maxFontSizeMultiplier={CAP} style={[styles.plate, { color: colors.textMuted }]}>
              {plate(id)}
            </Text>
          </FadeOut>
        ) : null}
      </View>
    </View>
  );
}

export function DexReveal({ width }: { width: number }) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const printed = reduce ? PRINTS.length : count;

  useEffect(() => {
    if (reduce) return;
    const ids = PRINTS.map((_, k) => setTimeout(() => setCount(k + 1), FIRST_AT + k * EVERY));
    return () => ids.forEach(clearTimeout);
  }, [reduce]);

  const size = Math.floor((width - 2 * DEX_GAP) / 3);
  const on = new Set(PRINTS.slice(0, printed));

  return (
    <View accessible accessibilityLabel={DEX_SPOKEN} style={[styles.grid, { width }]}>
      {IDS.map((id) => (
        <Cell key={id} id={id} size={size} printed={on.has(id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: DEX_GAP, rowGap: DEX_ROW_GAP },
  plateBox: { marginTop: DEX_LABEL_GAP, alignSelf: 'flex-start' },
  /* "Nº 0127": small, tabular, tracked 0.4 (spec 4). */
  plate: { ...textRole.small, ...tabular, letterSpacing: 0.4 },
  plateOld: { backgroundColor: colors.bg },
});
