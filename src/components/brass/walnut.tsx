import React from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { VerticalFade } from '@/components/cabinet';
import { colors, stroke, textRole } from '@/constants/theme';
import { formatDexNumber } from '@/data';

/* ==================================================================== */
/* Walnut (Brass D8, D9)                                                */
/*                                                                      */
/* The wood the drinks stand on: Home's shelf under the stories, a      */
/* shelf under every row of the Dex, My Bar's counter, the Profile      */
/* plaque. One 10 KB tile (assets/images/walnut.webp, made by           */
/* scripts/build-walnut.py), decoded once and shared by every walnut    */
/* surface in the app: 1024 x 320 x 4 = 1.3 MB, less than one photo.    */
/*                                                                      */
/* ONE IMAGE PER SURFACE, NEVER PER CELL. A Dex row's shelf is one      */
/* strip under three cards, drawn by the row (ItemSeparatorComponent),  */
/* so about five are mounted at once. Each strip shows a different      */
/* window of the same tile (`seed`), so neighbouring shelves do not     */
/* repeat their grain, without decoding anything twice.                 */
/*                                                                      */
/* Core Image, not expo-image, like Grain: a tiny bundled asset needs   */
/* no cache policy, and one tile stretched once is not resizeMode       */
/* "repeat" (which draws ONE tile on iOS; Grain tiles by hand for that  */
/* reason). The tile is drawn at the window's width x 1.3 and slid      */
/* left and up by the seed inside a clipping box, which is what         */
/* expo-image's contentPosition would do, with no per-size decode.      */
/*                                                                      */
/* The `walnut` fill under it is the tile's own colour, so the frame    */
/* before the decode is already wood. Decorative: never read aloud.     */
/* ==================================================================== */

const WALNUT_TILE = require('../../../assets/images/walnut.webp');
/** The tile's aspect (1024 x 320). */
const TILE_ASPECT = 1024 / 320;
/** How much wider than the screen the tile is drawn, so a seeded slide never shows its edge. */
const SPREAD = 1.3;

/**
 * The wood as an absolute fill of its parent (which should clip:
 * `overflow: 'hidden'`). `seed` picks the window of grain: a Dex row
 * passes its row index.
 */
export const WalnutFill = React.memo(function WalnutFill({ seed = 0 }: { seed?: number }) {
  const { width } = useWindowDimensions();
  const tileW = width * SPREAD;
  const slack = tileW - width;
  // The mock's (row x 137) % 100, as a share of the spare width; and a vertical step so rows differ in figure too.
  const left = -((((seed * 137) % 100) + 100) % 100) / 100 * slack;
  const top = -(((seed * 53) % 60) + 60) % 60;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.fill}>
      <Image
        source={WALNUT_TILE}
        resizeMode="cover"
        style={[styles.tile, { width: tileW, minHeight: tileW / TILE_ASPECT, left, top }]}
      />
    </View>
  );
});

/** "0001 – 0003": a shelf's range, en dash with spaces (in the Inter subset). One number when the row holds one. */
export function formatRange(first: number, last: number): string {
  const a = formatDexNumber(first).slice(1);
  if (first === last) return a;
  return `${a} – ${formatDexNumber(last).slice(1)}`;
}

/** D9 geometry: the shelf's faces, top to bottom. */
const SHELF = { top: 4, rail: 2, front: 17, shade: 12 } as const;
/** The front face's height with its 1pt walnutDeep foot. Exported so a list can lay rows out to it. */
export const SHELF_HEIGHT = SHELF.top + SHELF.rail + SHELF.front + stroke.edge;
/** A holder's text caps here: it sits on a fixed front face, which grows only with it. */
const HOLDER_CAP = 1.3;

/**
 * D9 · a walnut shelf with a brass front rail. Top to bottom, all Views:
 * the lit top face (walnutTop), the 2pt rail (brass with a 1pt brassLit
 * top), the 17pt front in walnut with a 1pt walnutDeep foot, then (with
 * `shade`) the 12pt `shade` fade the cabinet draws under any band.
 *
 * `range` (the Dex) puts a brass label holder on the front, 16pt from
 * the left: the row's numbers, "0001 – 0003", so a fast scroll still says
 * where you are. The front grows with the holder's text (capped 1.3).
 *
 * Decorative: the cards above it speak for themselves, and the range is
 * said by each card's own number.
 */
export const WalnutShelf = React.memo(function WalnutShelf({
  seed = 0,
  range,
  shade = true,
  style,
}: {
  seed?: number;
  range?: string;
  /** The 12pt shade under the front, hung over whatever follows. Off where the next thing is the same wood. */
  shade?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}>
      <View style={styles.topFace} />
      <View style={styles.rail} />
      <View style={styles.front}>
        <WalnutFill seed={seed} />
        {range ? (
          <View style={styles.holder}>
            <Text maxFontSizeMultiplier={HOLDER_CAP} style={[textRole.holder, styles.holderText]}>
              {range}
            </Text>
          </View>
        ) : null}
      </View>
      {shade ? <VerticalFade from={colors.shade} to={colors.shade} toOpacity={0} style={styles.shade} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: colors.walnut },
  tile: { position: 'absolute', bottom: 0 },
  topFace: { height: SHELF.top, backgroundColor: colors.walnutTop },
  rail: {
    height: SHELF.rail,
    backgroundColor: colors.brass,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.brassLit,
  },
  front: {
    minHeight: SHELF.front + stroke.edge,
    justifyContent: 'center',
    borderBottomWidth: stroke.edge,
    borderBottomColor: colors.walnutDeep,
    overflow: 'hidden',
  },
  holder: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    minHeight: 14,
    paddingHorizontal: 6,
    justifyContent: 'center',
    borderRadius: 1,
    backgroundColor: colors.brassPlate,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.brassLit,
  },
  holderText: { color: colors.text },
  // Hung under the front over whatever follows, so the shelf's own height stays SHELF_HEIGHT.
  shade: { position: 'absolute', left: 0, right: 0, top: '100%', height: SHELF.shade },
});
