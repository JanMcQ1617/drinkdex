import React, { useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Image, type LayoutChangeEvent, StyleSheet, View } from 'react-native';

/* ==================================================================== */
/* The paper: one faint grain under the page                            */
/*                                                                      */
/* v4.9 (Jan, 28 Oct 2026; specs/v4.9/details/spec.md A.5). Of the      */
/* three directions he picked, "a faint paper grain behind everything": */
/* the ground the press prints on and the pen signs. A seamless 128pt   */
/* tile of black at a low alpha (scripts/build-paper.mjs: the page      */
/* reads #FBFBFB on average, its darkest pixel #F4F4F4), so it lies     */
/* over the page's own white, adds no colour and no token, and keeps    */
/* every text pair over 4.5:1 and every control edge over 3:1 (spec G). */
/* It is part of what makes a screen less empty, never the whole of it. */
/*                                                                      */
/* A TILE GRID, NEVER resizeMode="repeat". Fabric draws a repeating     */
/* image as a tiled resizable UIImage, which CALayer can only stretch,  */
/* so UIKit pre-renders the tiling into a backing store the size of the */
/* view: about 15 MB a full screen at 3x, per instance, with some 15    */
/* mounted. Instead this measures its box and lays ceil(w / 128) x      */
/* ceil(h / 128) plain Images of the tile (32 for a full 440 x 956      */
/* screen, 4 for a bar), each 128 x 128 and stretched to exactly its    */
/* size: one shared decode (576 KB at 3x, under React Native's 2 MB     */
/* per-image cache cap; a 256pt tile would pass it), shown as each      */
/* UIImageView's layer contents, with no backing store of its own.      */
/*                                                                      */
/* WHERE: the first child of the page grounds spec A.5 lists (and the   */
/* bars above them, through ScreenTopBar's `paper`), never a wash or a  */
/* press surface, a photo, an ink ground, a sheet, a window, onboarding */
/* or Settings. check-design rule 17 lets only those files import it    */
/* (DETAIL_SITES). It is static and outside every scroll view, so the   */
/* content scrolls over a fixed sheet at no per-frame or per-cell cost. */
/*                                                                      */
/* REDUCE TRANSPARENCY, INVERT COLOURS: no paper. An inverted grain is  */
/* white specks on black. The two flags are read once for the app, at   */
/* import, and followed by their change events (the store below); until */
/* both are known the paper draws nothing, so it never flashes for the  */
/* readers who asked for less. Nothing draws until the box is measured  */
/* either: a grain a frame late cannot be seen.                         */
/*                                                                      */
/* React Native's Image, not expo-image: the tile is decorative and of  */
/* one fixed size, and rule 9 (expo-image decodes) follows that import. */
/* No Reanimated here (FloatingTabBar stays free of it): Home fades its */
/* paper in with its chrome, through the Rise its own files wrap it in. */
/* The press never draws here, nor the pen: this file names no accent   */
/* and imports no mark (rule 17's ACCENT_TIER_EXCEPT).                  */
/* ==================================================================== */

/** The tile's side, in points: the 2x and 3x files are 256 and 384 px. */
const TILE = 128;
const SOURCE = require('../../../assets/details/paper.png');

/** Never a VoiceOver element, never a touch target. */
const HIDDEN = {
  pointerEvents: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/* ---- The accessibility flags, read once ---------------------------- */

const flags = { transparency: false, invert: false, knownTransparency: false, knownInvert: false };
let shown = false;
const listeners = new Set<() => void>();
function publish() {
  const next = flags.knownTransparency && flags.knownInvert && !flags.transparency && !flags.invert;
  if (next === shown) return;
  shown = next;
  for (const l of listeners) l();
}
/* A query that fails says nothing is on: the setting exists on iOS, where these never fail. */
AccessibilityInfo.isReduceTransparencyEnabled().then(
  (on) => {
    flags.transparency = on;
    flags.knownTransparency = true;
    publish();
  },
  () => {
    flags.knownTransparency = true;
    publish();
  },
);
AccessibilityInfo.isInvertColorsEnabled().then(
  (on) => {
    flags.invert = on;
    flags.knownInvert = true;
    publish();
  },
  () => {
    flags.knownInvert = true;
    publish();
  },
);
AccessibilityInfo.addEventListener('reduceTransparencyChanged', (on) => {
  flags.transparency = on;
  flags.knownTransparency = true;
  publish();
});
AccessibilityInfo.addEventListener('invertColorsChanged', (on) => {
  flags.invert = on;
  flags.knownInvert = true;
  publish();
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => shown;

/* ---- The paper ----------------------------------------------------- */

/**
 * The grain, filling its surface: place it as the FIRST child of the
 * surface's root (or of a bar's View), so everything after it draws on
 * top. It takes no props: where it goes is the whole of its design.
 */
export const Paper = React.memo(function Paper() {
  const on = useSyncExternalStore(subscribe, snapshot);
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  if (!on) return null;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const cols = Math.ceil(width / TILE);
    const rows = Math.ceil(height / TILE);
    if (!grid || grid.cols !== cols || grid.rows !== rows) setGrid({ cols, rows });
  };
  const tiles: React.ReactElement[] = [];
  if (grid) {
    for (let j = 0; j < grid.rows; j++) {
      for (let i = 0; i < grid.cols; i++) {
        tiles.push(
          <Image
            key={`${i}-${j}`}
            source={SOURCE}
            resizeMode="stretch"
            fadeDuration={0}
            style={[styles.tile, { left: TILE * i, top: TILE * j }]}
          />,
        );
      }
    }
  }
  return (
    <View {...HIDDEN} onLayout={onLayout} style={styles.paper}>
      {tiles}
    </View>
  );
});

const styles = StyleSheet.create({
  /* StyleSheet.absoluteFill's box, clipped: the last row and column of tiles run past the surface's edge. */
  paper: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  tile: { position: 'absolute', width: TILE, height: TILE },
});
