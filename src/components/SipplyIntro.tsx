import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, fonts, label as labelType } from '@/constants/theme';

/**
 * Launch intro — the pour fills the screen and the wordmark rises out of it.
 *
 * A port of the Sipply brand intro (`Sipp Brand Intro.dc.html` +
 * `sipp-video.jsx`), which authors three beats over 3.2s:
 *
 *   POUR    two circles — merlot behind, wine in front — swell from ~68%
 *           down-screen until they flood the bone ground. easeInOutSine.
 *   REVEAL  the letters of "Sipply" pop in one at a time, 90ms apart,
 *           0.55 → 1 on an easeOutBack overshoot from a 50%/80% origin; a
 *           90×2 taupe rule fades in above them; the tagline rises 28pt.
 *   HOLD    the whole lockup drifts 1.0 → 1.035, breathing, and stops.
 *
 * Two departures from the source, both deliberate:
 *
 *  - The tail is compressed. The source holds to 3.2s before it ends; a
 *    launch screen that outstays 3s is felt every single time the app is
 *    opened, so the rule and tagline land by 2.4s and the hold runs to 2.9s.
 *    The beats keep their proportions and their easings.
 *  - It exits by flooding, not by cutting. The source ends on wine and the
 *    app's page is off-white, so an off-white disc opens from the centre and
 *    floods the frame — the app is simply what was underneath. Inherited
 *    from the intro this replaces, and the reason there is no visible seam.
 *
 * Three rules this file learned the hard way and keeps:
 *  1. ONE shared value, set ONCE. Everything derives from a single master
 *     clock in milliseconds. Two `.set()` calls on one value in one tick
 *     cancel the first outright, which is how the old timeline lost frames.
 *  2. Never trust the animation callback alone to dismiss the overlay — if
 *     the app is backgrounded mid-intro the frames stall and the callback
 *     never fires. The plain timer is the guarantee.
 *  3. Honour reduced motion: no pour, no pop, no drift — the lockup is
 *     simply there, and it still gets out of the way on time.
 */

/* ---- Timeline, in milliseconds ---------------------------------------- */
const T = {
  merlotIn: [150, 850],
  wineIn: [400, 1050],
  glowIn: [900, 1400],
  /** First letter starts here; each subsequent one 90ms later. */
  letterFrom: 1000,
  letterStagger: 90,
  letterDur: 600,
  taglineIn: [1600, 2300],
  ruleIn: [1750, 2350],
  driftIn: [1100, 2900],
  floodIn: [2900, 3350],
} as const;

const TOTAL = 3350;
const FAILSAFE = 3800;

const WORDMARK = 'Sipply';
const TAGLINE = 'DISCOVER · SIP · SHARE';

/* ---- Worklet easings --------------------------------------------------
 * Hand-written rather than Reanimated's `Easing.*` because every element
 * reads the same master clock: each one needs its own curve applied to its
 * own slice of that clock, which is a function call, not an animation
 * config. Same curves the source names.
 */
function clamp01(x: number) {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Progress of [from, to] at time t, clamped to the segment. */
function seg(t: number, from: number, to: number) {
  'worklet';
  return clamp01((t - from) / (to - from));
}

function sineInOut(x: number) {
  'worklet';
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

function cubicOut(x: number) {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}

/** easeOutBack — the overshoot that gives each letter its bounce. */
function backOut(x: number) {
  'worklet';
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** One letter of the wordmark, popping on its own slice of the clock. */
function Letter({
  char,
  index,
  clock,
  reduced,
  size,
}: {
  char: string;
  index: number;
  clock: SharedValue<number>;
  reduced: boolean;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1, transform: [{ scale: 1 }] };
    const start = T.letterFrom + index * T.letterStagger;
    const p = seg(clock.value, start, start + T.letterDur);
    return {
      // Fades over the first 250ms of its own 600ms pop, as authored.
      opacity: clamp01(seg(clock.value, start, start + 250)),
      transform: [{ scale: 0.55 + backOut(p) * 0.45 }],
    };
  });

  return (
    <Animated.Text
      style={[
        styles.letter,
        { fontSize: size, lineHeight: size * 1.02 },
        style,
      ]}>
      {char}
    </Animated.Text>
  );
}

export function SipplyIntro({ onDone }: { onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [gone, setGone] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setGone(true);
    onDone();
  }, [onDone]);

  /** The one shared value. Milliseconds since the intro began. */
  const clock = useSharedValue(0);
  /** Only the skip path touches this. */
  const rootO = useSharedValue(1);

  useEffect(() => {
    clock.set(
      withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear }, (ok) => {
        if (ok) runOnJS(finish)();
      }),
    );

    /*
     * The pour landing is the one moment worth feeling — it is where the
     * wine circle finishes covering the frame.
     */
    let pourTimer: ReturnType<typeof setTimeout> | undefined;
    if (Platform.OS !== 'web' && !reduced) {
      pourTimer = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }, T.wineIn[1]);
    }

    const failsafe = setTimeout(finish, FAILSAFE);
    return () => {
      if (pourTimer) clearTimeout(pourTimer);
      clearTimeout(failsafe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = useCallback(() => {
    rootO.set(
      withTiming(0, { duration: 220 }, (ok) => {
        if (ok) runOnJS(finish)();
      }),
    );
    setTimeout(finish, 360);
  }, [finish, rootO]);

  /*
   * Circle geometry. Each circle has to reach the furthest corner from its
   * own centre, so it is sized once at full diameter and scaled 0 → 1 —
   * animating width/height would re-layout every frame.
   */
  const cx = W / 2;
  const merlotCY = H * 0.68;
  const wineCY = H * 0.7;
  const reach = (cy: number) =>
    Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 2 * 1.04;
  const merlotD = reach(merlotCY);
  const wineD = reach(wineCY);

  /** The flood disc opens from the centre of the lockup. */
  const floodD = Math.hypot(cx, H / 2) * 2 * 1.04;

  const wordSize = Math.min(Math.round(W * 0.19), 76);

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootO.value }));

  const merlotStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: reduced ? 1 : sineInOut(seg(clock.value, T.merlotIn[0], T.merlotIn[1])) },
    ],
  }));

  const wineStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : sineInOut(seg(clock.value, T.wineIn[0], T.wineIn[1])) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : sineInOut(seg(clock.value, T.glowIn[0], T.glowIn[1])),
  }));

  const lockupStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduced
          ? 1
          : interpolate(sineInOut(seg(clock.value, T.driftIn[0], T.driftIn[1])), [0, 1], [1, 1.035]),
      },
    ],
  }));

  const ruleStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : sineInOut(seg(clock.value, T.ruleIn[0], T.ruleIn[1])),
  }));

  const taglineStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1, transform: [{ translateY: 0 }] };
    const p = cubicOut(seg(clock.value, T.taglineIn[0], T.taglineIn[1]));
    return { opacity: p, transform: [{ translateY: 28 - p * 28 }] };
  });

  const floodStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: clamp01(seg(clock.value, T.floodIn[0], T.floodIn[1])) },
    ],
  }));

  if (gone) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents="box-none">
      {/* ---- The pour ---- */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.circle,
          {
            width: merlotD,
            height: merlotD,
            borderRadius: merlotD / 2,
            left: cx - merlotD / 2,
            top: merlotCY - merlotD / 2,
            backgroundColor: colors.merlot,
          },
          merlotStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.circle,
          {
            width: wineD,
            height: wineD,
            borderRadius: wineD / 2,
            left: cx - wineD / 2,
            top: wineCY - wineD / 2,
            backgroundColor: colors.wine,
          },
          wineStyle,
        ]}
      />

      {/* ---- The warm bloom the wordmark sits in ---- */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="sipplyBloom" cx="50%" cy="35%" rx="120%" ry="90%">
              <Stop offset="0" stopColor={colors.merlot} stopOpacity="0.35" />
              <Stop offset="0.6" stopColor={colors.wine} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sipplyBloom)" />
        </Svg>
      </Animated.View>

      {/* ---- The lockup ---- */}
      <Animated.View style={[styles.lockup, lockupStyle]} pointerEvents="none">
        <Animated.View style={[styles.rule, ruleStyle]} />
        <View
          style={styles.word}
          accessible
          accessibilityRole="header"
          accessibilityLabel={WORDMARK}>
          {WORDMARK.split('').map((ch, i) => (
            <Letter
              key={`${ch}-${i}`}
              char={ch}
              index={i}
              clock={clock}
              reduced={reduced}
              size={wordSize}
            />
          ))}
        </View>
        <Animated.Text style={[styles.tagline, taglineStyle]}>{TAGLINE}</Animated.Text>
      </Animated.View>

      {/* ---- Vignette ---- */}
      <View pointerEvents="none" style={styles.vignette}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="sipplyVignette" cx="50%" cy="45%" rx="120%" ry="100%">
              <Stop offset="0.62" stopColor={colors.lockInk} stopOpacity="0" />
              <Stop offset="1" stopColor={colors.lockInk} stopOpacity="0.28" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sipplyVignette)" />
        </Svg>
      </View>

      {/* ---- The page, opening ---- */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.circle,
          {
            width: floodD,
            height: floodD,
            borderRadius: floodD / 2,
            left: cx - floodD / 2,
            top: H / 2 - floodD / 2,
            backgroundColor: colors.bg,
          },
          floodStyle,
        ]}
      />

      {/* Tap anywhere to skip. */}
      <Pressable
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel="Skip intro"
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    /* Bone — the ground the pour lands on. */
    backgroundColor: colors.bgSunk,
    overflow: 'hidden',
  },
  circle: { position: 'absolute' },
  vignette: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  lockup: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  rule: {
    width: 90,
    height: 2,
    backgroundColor: colors.taupe,
  },
  word: { flexDirection: 'row', alignItems: 'baseline' },
  letter: {
    fontFamily: fonts.displayBold,
    color: colors.textOnWine,
    /* The source pops each letter from its own foot, not its centre. */
    transformOrigin: '50% 80%',
  },
  tagline: {
    fontFamily: fonts.label,
    fontSize: labelType.tagline.fontSize,
    lineHeight: labelType.tagline.lineHeight,
    letterSpacing: labelType.tagline.letterSpacing,
    color: colors.taupe,
  },
});

export default SipplyIntro;
