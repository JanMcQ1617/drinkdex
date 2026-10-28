import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/constants/theme';
import type { Drink } from '@/types';

import { artFootprint, GlassOutline } from './index';

/* ==================================================================== */
/* VectorFace: the no-photo face                                        */
/*                                                                      */
/* 1,927 of the 2,089 drinks have no photograph. In Daylight their face */
/* is a wash square with the drink's own glass drawn as a control-grey  */
/* outline at 1.4pt (white spec 6.3). It replaces v3's lit back-bar     */
/* window (a merlot or espresso radial pool), which was colour, and     */
/* Daylight's only colour is a photograph you have earned.              */
/*                                                                      */
/* Caught and not yet share the face: the name beside it (the marker,   */
/* ink or muted) and, on the drink page, the plate tell them apart.     */
/* ==================================================================== */

/**
 * The `style` for a face in a frame that may grow past the `height` it was
 * given. `StyleSheet.absoluteFill` keeps its own width and height in force,
 * so a grown frame would show a band under the picture; `auto` undoes them
 * and the four edges decide.
 */
export const FACE_FILL: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 'auto',
  height: 'auto',
};

export interface VectorFaceProps {
  drink: Drink;
  /** The frame the face fills, in points. Sizes the glass. */
  width: number;
  height: number;
  /** The glass's drawn width box as a fraction of the face's height. Default 0.56. */
  artScale?: number;
  /** For a frame that may grow past `height`: pass FACE_FILL. */
  style?: StyleProp<ViewStyle>;
}

export const VectorFace = React.memo(function VectorFace({
  drink,
  width,
  height,
  artScale = 0.56,
  style,
}: VectorFaceProps) {
  const fp = artFootprint(drink);
  /*
   * The glass at the asked size, unless that would push it past the frame:
   * points per viewBox unit is size / 100, and the art box is 112 tall.
   */
  const span = Math.max(1, fp.maxX - fp.minX);
  const size = Math.max(8, Math.min(height * artScale, (height * 0.86 * 100) / 112, (width * 0.8 * 100) / span));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.face, { width, height }, style]}>
      <GlassOutline drink={drink} size={size} color={colors.lineControl} />
    </View>
  );
});

const styles = StyleSheet.create({
  face: { overflow: 'hidden', backgroundColor: colors.bgSunk, alignItems: 'center', justifyContent: 'center' },
});

export default VectorFace;
