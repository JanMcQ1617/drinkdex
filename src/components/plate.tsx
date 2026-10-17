import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, stroke, textRole } from '@/constants/theme';
import { formatDexNumber } from '@/data';

/* ==================================================================== */
/* The Nº plate                                                         */
/*                                                                      */
/* The one survivor of Brass's back-bar hardware (white spec section 4, */
/* D1 and D2): "Nº 0127" in a small box. Caught is a solid plate with   */
/* white figures; not yet is an empty plate, a 1pt control edge with    */
/* muted figures. The shape carries the state, not a colour.            */
/*                                                                      */
/* CAUGHT IS THE ACCENT (v4.4, one of its five places; theme.ts). The   */
/* fill is Campari with onAccent figures (5.54:1), so the moment a      */
/* drink is yours is the one plate in the app with colour. The colour   */
/* is a second cue on top of the fill, never the only one: the empty    */
/* plate is unchanged, and the tag beside it says the state in words.   */
/* Neither plate sits on a photograph, so neither is drawn from         */
/* onMedia: the plates over a picture (a gallery count, the video       */
/* glyph) stay ink.                                                     */
/*                                                                      */
/* WHERE IT STILL APPEARS. Only where the number is the point: the      */
/* drink page and the catch. A post's ••• sheet says the number in      */
/* words ("View drink, Nº 0127"); the feed, the Dex grid and the likers */
/* sheet dropped it (layout spec section 5): the drink page holds it.   */
/*                                                                      */
/* Never its own VoiceOver element: the row or page that holds it says  */
/* "number 127".                                                        */
/* ==================================================================== */

export type PlateSize = 'sm' | 'lg';
export type PlateTone = 'caught' | 'notYet';

/** "Nº 0009": N and U+00BA, which the Inter subset has (U+2116 is not in it; check-design rule 16). */
export function formatPlateNumber(n: number): string {
  return `Nº ${formatDexNumber(n).slice(1)}`;
}

const PLATE = {
  sm: { minHeight: 20, pad: 6 },
  lg: { minHeight: 24, pad: 8 },
} as const;

/** A plate's figures grow with Dynamic Type only this far: they sit in a fixed frame. */
const PLATE_CAP = 1.3;

export const NumberPlate = React.memo(function NumberPlate({
  n,
  label,
  tone = 'caught',
  size = 'sm',
}: {
  n?: number;
  /** Text in place of the number: the Nº rail's thumb ("0127"). */
  label?: string;
  tone?: PlateTone;
  size?: PlateSize;
}) {
  const p = PLATE[size];
  const empty = tone === 'notYet';
  const text = label ?? (n != null ? formatPlateNumber(n) : '');
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.plate,
        { minHeight: p.minHeight, paddingHorizontal: p.pad },
        empty ? styles.empty : styles.caught,
      ]}>
      <Text
        accessible={false}
        maxFontSizeMultiplier={PLATE_CAP}
        style={[textRole.plate, { color: empty ? colors.textMuted : colors.onAccent }]}>
        {text}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  plate: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
  },
  caught: { backgroundColor: colors.accent, borderColor: colors.accent },
  empty: { borderColor: colors.lineControl },
});
