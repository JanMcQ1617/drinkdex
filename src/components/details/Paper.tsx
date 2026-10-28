import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Image, StyleSheet, useWindowDimensions, View } from 'react-native';

/* ==================================================================== */
/* The paper: the studio sweep under the page                           */
/*                                                                      */
/* v4.10 (Jan, 28 Oct 2026; specs/v4.10/spec.md G). Build 34's paper    */
/* was a texture, and Jan said it hurt the eyes to see and asked for    */
/* the background another way, so the paper is no longer a texture.     */
/* It is the sweep: the seamless paper of the studio the drinks are     */
/* shot on, white to 40% of the window, then easing to #FBFBFB at the   */
/* foot, level 255 - 4 * smoothstep((t - 0.4) / 0.6) with t the window  */
/* y over its height. It is vertical only and anchored to the WINDOW,   */
/* never to the content, so it has no edge, no corner and no repeat for */
/* the eye to find, and nothing at the frequency of text. Neutral       */
/* (R = G = B), no token and no cream; its darkest pixel is #FBFBFB, so */
/* every text pair keeps what v4.9 accepted (spec G.6). It is part of   */
/* what makes a screen less empty, never the whole of it: "still empty" */
/* is answered by the type and the pen marks, never by a darker foot.   */
/*                                                                      */
/* ONE STRETCHED IMAGE, never resizeMode="repeat" and never a grid.     */
/* assets/details/ground.png (scripts/build-ground.mjs) is the lower    */
/* 60% of the tallest window at 1px a point, 440 x 574, 8-bit grey and  */
/* pre-dithered, so the ramp has no 8-bit step to show as a line. A     */
/* stretched image is its layer's contents, with no backing store of    */
/* its own: one decode (440 x 574, at most about 1 MB as RGBA) shared   */
/* by every instance, one quad a root, slab or pinned bar, and nothing  */
/* per frame.                                                           */
/*                                                                      */
/* SLICED BY THE WINDOW, NOT THE BOX. Each Paper cuts the same          */
/* window-sized picture at its own window y, and every Paper box is the */
/* full window's width, so the tab bar's slab and the drink pages'      */
/* pinned bar show exactly the part of the sweep behind them and meet   */
/* the page with no step, and a push or a tab swipe slides pages over a */
/* ground that is the same at every x. A box that ends in the white 40% */
/* (every top bar, Home's bar and status strip, the Dex's sliding       */
/* header) draws nothing at all. A bar does not know where it sits, so  */
/* the box asks (measureInWindow) at layout, and again whenever the     */
/* window's height changes. Pushes and tab swipes move pages sideways   */
/* only, so a measurement taken mid-transition is still right in y, and */
/* no vertically presented route hosts a Paper. Nothing draws until it  */
/* has measured: a foot one level greyer arriving a frame late cannot   */
/* be seen.                                                             */
/*                                                                      */
/* WHERE: the first child of the page grounds spec v4.9 A.5 lists (and  */
/* the bars above them, through ScreenTopBar's `paper`), never a wash   */
/* or a press surface, a photo, an ink ground, a sheet, a window,       */
/* onboarding or Settings. check-design rule 17 lets only those files   */
/* import it (DETAIL_SITES). It is static and outside every scroll      */
/* view, so the content scrolls over a fixed sheet.                     */
/*                                                                      */
/* REDUCE TRANSPARENCY, INVERT COLOURS, INCREASE CONTRAST: no paper,    */
/* and the page is plain #FFFFFF. An image may be left as it is or      */
/* inverted under Invert Colours, so the sweep would be a light band    */
/* under a dark page or a black floor; under Increase Contrast the wash */
/* surfaces get their full 1.09:1 on white back at the foot. The three  */
/* flags are read once for the app, at import, and followed by their    */
/* change events (the store below); until all three are known the paper */
/* draws nothing, so it never flashes for the readers who asked for     */
/* less. If the dither ever shows on a phone, the fallback is this      */
/* component returning null, plain white: never a darker foot, never a  */
/* texture.                                                             */
/*                                                                      */
/* React Native's Image, not expo-image: the sweep is decorative and of */
/* one fixed file, and rule 9 (expo-image decodes) follows that import. */
/* No Reanimated here (FloatingTabBar stays free of it): Home fades its */
/* paper in with its chrome, through the Rise its own files wrap it in. */
/* The press never draws here, nor the pen: this file names no accent   */
/* and imports no mark (rule 17's ACCENT_TIER_EXCEPT).                  */
/* ==================================================================== */

/** Where the sweep leaves white, as a fraction of the window's height (specs/v4.10/spec.md G.1). */
const RAMP_FROM = 0.4;
/** The sweep's lower 60%, 440 x 574 px: one file, no @2x or @3x, because it is stretched. */
const SOURCE = require('../../../assets/details/ground.png');

/** Never a VoiceOver element, never a touch target. */
const HIDDEN = {
  pointerEvents: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/* ---- The accessibility flags, read once ---------------------------- */

const flags = {
  transparency: false,
  invert: false,
  contrast: false,
  knownTransparency: false,
  knownInvert: false,
  knownContrast: false,
};
let shown = false;
const listeners = new Set<() => void>();
function publish() {
  const next =
    flags.knownTransparency &&
    flags.knownInvert &&
    flags.knownContrast &&
    !flags.transparency &&
    !flags.invert &&
    !flags.contrast;
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
/* Increase Contrast (v4.10, spec G.1): React Native names it "darker system colors". */
AccessibilityInfo.isDarkerSystemColorsEnabled().then(
  (on) => {
    flags.contrast = on;
    flags.knownContrast = true;
    publish();
  },
  () => {
    flags.knownContrast = true;
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
AccessibilityInfo.addEventListener('darkerSystemColorsChanged', (on) => {
  flags.contrast = on;
  flags.knownContrast = true;
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
 * The sweep, filling its surface: place it as the FIRST child of the
 * surface's root (or of a bar's View), so everything after it draws on
 * top. It takes no props: where it goes is the whole of its design.
 *
 * Every hook runs before the early return (the React Compiler is on, so
 * nothing here is conditional). The box measures its own place in the
 * window; the Image is the window's lower 60% offset by that place, so
 * the box shows only its own slice of the one window-anchored picture.
 */
export const Paper = React.memo(function Paper() {
  const on = useSyncExternalStore(subscribe, snapshot);
  const { height: screen } = useWindowDimensions();
  const box = useRef<View>(null);
  const [place, setPlace] = useState<{ top: number; reaches: boolean } | null>(null);
  const measure = useCallback(() => {
    box.current?.measureInWindow((_x, y, _w, h) => {
      const reaches = y + h > RAMP_FROM * screen;
      setPlace((p) => (p && p.top === y && p.reaches === reaches ? p : { top: y, reaches }));
    });
  }, [screen]);
  useEffect(measure, [measure]); // again whenever the window's height changes
  if (!on) return null;
  return (
    <View ref={box} {...HIDDEN} onLayout={measure} style={styles.ground}>
      {place?.reaches ? (
        <Image
          source={SOURCE}
          resizeMode="stretch"
          fadeDuration={0}
          style={[styles.sweep, { top: RAMP_FROM * screen - place.top, height: (1 - RAMP_FROM) * screen }]}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  /* StyleSheet.absoluteFill's box, clipped: the sweep is the window's, and the box shows only its own part of it. */
  ground: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  sweep: { position: 'absolute', left: 0, right: 0 },
});
