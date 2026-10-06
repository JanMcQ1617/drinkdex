import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/constants/theme';
import type { Drink } from '@/types';

import { artFootprint, DrinkArt } from './index';

/* ==================================================================== */
/* VectorFace                                                           */
/*                                                                      */
/* The face of a drink with no photograph: 1,927 of the 2,089. Drawn as */
/* a window onto a lit back bar rather than as a glass on a swatch, so  */
/* an unphotographed drink has the same presence as a photographed one */
/* in the same row.                                                     */
/*                                                                      */
/*   lit     a radial pool of the category's light falling off to the   */
/*           cellar, a bar counter across the foot, the glass standing  */
/*           on the counter's line with a floor shadow, the pour in its */
/*           own colour (DrinkArt face="lit")                           */
/*   deboss  the locked slot: flat cellar, the same glass blind-stamped */
/*           in the drink's own hue (DrinkArt face="deboss")            */
/*                                                                      */
/* The lit window (its field and the floor shadow) is the app's one     */
/* radial light (spec §7.5), and it only ever fills a window frame: no  */
/* text is ever set over it.                                            */
/* ==================================================================== */

/** The counter's share of the face, from the bottom edge. */
const COUNTER = 0.2;

/**
 * The lit glass's stroke reaches this far past its path (DrinkArt draws
 * the lit outline at 1.6pt, so half of it), so the glass stands ON the
 * counter's edge rather than through it. Under 48pt of art the line is
 * 1pt, and the 0.3pt it then floats does not show.
 */
const HALF_STROKE = 0.8;

/** The floor shadow's core: plain black at 0.35, falling to nothing (spec §7.5). */
const FLOOR = 'rgb(0, 0, 0)';

/**
 * The `style` for a face in a frame that may grow past the `height` it was
 * given (a Dex window in a stretched row, a panel with a min height).
 * `StyleSheet.absoluteFill` is not enough: it leaves the face's own width
 * and height in force, so a grown frame shows a band under the picture.
 * `auto` undoes them and the four edges decide.
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
  mode: 'lit' | 'deboss';
  /** The frame the face fills, in points. Sizes the glass and the counter. */
  width: number;
  height: number;
  /**
   * DrinkArt's size (the glass's drawn width box) as a fraction of the
   * face's height. Default 0.6. A caller that thinks in widths divides by
   * its own aspect: the feed's "art at 0.56 of width" on a 4:5 frame is
   * 0.56 / 1.25.
   */
  artScale?: number;
  /**
   * For a frame that may grow past `height` (a Dex window in a row that
   * stretches): pass FACE_FILL. The field stretches with the frame; the
   * counter and the glass stay anchored to its foot at the size `height`
   * gave them.
   */
  style?: StyleProp<ViewStyle>;
}

export const VectorFace = React.memo(function VectorFace({
  drink,
  mode,
  width,
  height,
  artScale = 0.6,
  style,
}: VectorFaceProps) {
  const fp = artFootprint(drink);
  const counterH = Math.round(height * COUNTER);
  const counterY = height - counterH;

  /*
   * The glass at the asked size, unless that would push its rim above the
   * frame or its widest point past the sides (a caller asking for a big
   * glass in a short, narrow frame). Points per viewBox unit is size / 100.
   */
  const span = Math.max(1, fp.maxX - fp.minX);
  const size = Math.max(
    8,
    Math.min(height * artScale, (counterY * 100) / fp.baseY, (width * 0.92 * 100) / span),
  );
  const k = size / 100;
  const artH = size * (112 / 100);
  // Bottom-anchored, so a frame stretched past `height` keeps the glass
  // on the counter: the art box hangs (112 - baseY) units below the base.
  const artBottom = counterH - (112 - fp.baseY) * k + (mode === 'lit' ? HALF_STROKE : 0);

  const hidden = {
    pointerEvents: 'none' as const,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  };

  if (mode === 'deboss') {
    return (
      <View {...hidden} style={[styles.frame, styles.cellar, { width, height }, style]}>
        <View style={[styles.art, { bottom: artBottom, height: artH }]}>
          <DrinkArt drink={drink} size={size} face="deboss" />
        </View>
      </View>
    );
  }

  /*
   * Keyed by drink, for DrinkArt's reason: on web every SVG id shares one
   * document, so a shared id let one drink's light colour another's. Two
   * sizes of the same drink sharing an id is harmless (bounding-box units,
   * same colours).
   */
  const fieldId = `vf-${drink.id}-field`;
  const floorId = `vf-${drink.id}-floor`;
  const centre = drink.category === 'spirit' ? colors.faceSpirit : colors.faceCocktail;

  // The floor shadow: as wide as most of the glass, a sliver deep.
  const rx = Math.max(6, span * k * 0.62);
  const ry = Math.max(2, height * 0.022);

  return (
    <View {...hidden} style={[styles.frame, styles.cellar, { width, height }, style]}>
      {/*
        Sized by attribute as well as by style: an <svg> with no width or
        height attribute falls back to 300x150 on web, which cut the field
        off 150pt down any frame taller than that (a feed face, a hero).
      */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={fieldId} cx="50%" cy="40%" r="75%">
            <Stop offset="0" stopColor={centre} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.liningDeep} stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fieldId})`} />
      </Svg>

      {/* The counter: a darker band across the foot, under the 1pt line the glass stands on. */}
      <View style={[styles.counter, { height: counterH }]} />

      <Svg
        width={rx * 2}
        height={ry * 2}
        style={[styles.floor, { bottom: counterH - ry * 1.3, marginLeft: -rx }]}>
        <Defs>
          <RadialGradient id={floorId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={FLOOR} stopOpacity={0.35} />
            <Stop offset="1" stopColor={FLOOR} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={rx} cy={ry} rx={rx} ry={ry} fill={`url(#${floorId})`} />
      </Svg>

      <View style={[styles.art, { bottom: artBottom, height: artH }]}>
        <DrinkArt drink={drink} size={size} face="lit" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  /* The settle colour of every lit photograph, so a face and a photo meet the same ground. */
  cellar: { backgroundColor: colors.liningDeep },
  counter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.counterBand,
    borderTopWidth: 1,
    borderTopColor: colors.counterLine,
  },
  floor: { position: 'absolute', left: '50%' },
  art: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});

export default VectorFace;
