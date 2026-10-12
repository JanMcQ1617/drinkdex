import React from 'react';
import { View } from 'react-native';

import { Print } from '@/components/cabinet';
import { DrinkFace } from '@/components/DexCard';
import { textWidth } from '@/lib/textFit';
import type { Drink } from '@/types';

/* ==================================================================== */
/* Drink faces on My Bar                                                */
/*                                                                      */
/* The Make list's rows carry a small colour print, never a proof: the  */
/* list is drinks you can pour, and Daylight greys a print only on the  */
/* Dex grid. DrinkFace does the per-size cache key, the early resize,   */
/* the invert guard and the no-photo face (the glass outlined on wash). */
/* ==================================================================== */

/** The Make list's print (layout 5.6: a 40pt print beside a Playfair name). */
export const MAKE_THUMB = 40;

/** A drink's 40pt colour print. Decorative: its row says the name. */
export const MakeThumb = React.memo(function MakeThumb({ drink }: { drink: Drink }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Print width={MAKE_THUMB} height={MAKE_THUMB}>
        <DrinkFace drink={drink} mode="photo" width={MAKE_THUMB} height={MAKE_THUMB} />
      </Print>
    </View>
  );
});

/**
 * How many lines a name wraps to in `measure` at `size`, greedily by word,
 * with textFit's conservative widths (it errs long, so a row reserves at
 * least what it draws). The Make list sizes every row from its longest
 * name, so getItemLayout can say where any row is without measuring.
 */
export function nameLines(name: string, size: number, measure: number): number {
  let lines = 1;
  let line = '';
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, 'playfair', size) > measure) {
      lines++;
      line = word;
    } else {
      line = next;
    }
  }
  return lines;
}
