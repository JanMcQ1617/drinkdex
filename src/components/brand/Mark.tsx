import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

import { MARK_PATH } from './paths';

/* ==================================================================== */
/* The mark: the wordmark's s on its own                                */
/*                                                                      */
/* The app icon's letter (v4.5 "Marker tag, cleaner icon", Jan, 20 Oct  */
/* 2026): the wordmark's own s, no drip, turned 9 degrees further       */
/* forward so it reads as a tag thrown on rather than a set italic. The */
/* drip lives in the wordmark and the film only; beside a lone s it     */
/* read as "S!" at home-screen size. brand/paths.ts holds the outline,  */
/* generated from scripts/icon/mark.svg with every icon raster.         */
/*                                                                      */
/* Where the app draws it: the drawn intro's first frame, where it is   */
/* the launch screen's s to the point, and the onboarding guide. In     */
/* Campari on the page (the accent's sixth place, the logo; check-      */
/* design rule 17 keeps the token here and in brand/Wordmark.tsx).      */
/*                                                                      */
/* Never beside the wordmark as one lockup: the two s's sit at          */
/* different angles on purpose, and side by side that reads as a        */
/* mistake (notes.md, Risks).                                           */
/*                                                                      */
/* Always decorative: wherever it is drawn, something next to it says   */
/* the name or the step, so VoiceOver skips it.                         */
/* ==================================================================== */

const [, , VIEW_SIDE] = MARK_PATH.viewBox;
const VIEWBOX = MARK_PATH.viewBox.join(' ');
const [INK_X0, INK_Y0, INK_X1, INK_Y1] = MARK_PATH.ink;
/** The s's larger side over its square box's side (the box keeps 4% air round the optical centre). */
const INK_SHARE = Math.max(INK_X1 - INK_X0, INK_Y1 - INK_Y0) / VIEW_SIDE;

/**
 * The side of the square box that draws the s `size` points across, as
 * the rasters measure it (its larger bbox side). The box is centred on
 * the s's optical centre, so centring the box centres the letter.
 */
export function markBox(size: number): number {
  return size / INK_SHARE;
}

export function Mark({
  size,
  color = colors.accent,
  style,
}: {
  /** The s's larger bbox side, in points: what build-icons calls the mark's size. */
  size: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const box = markBox(size);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityIgnoresInvertColors
      style={[{ width: box, height: box }, style]}>
      <Svg width={box} height={box} viewBox={VIEWBOX}>
        <Path d={MARK_PATH.d} fill={color} />
      </Svg>
    </View>
  );
}
