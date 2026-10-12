import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Image as RNImage, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, stroke } from '@/constants/theme';

import { RING_INNER, RING_OUTER, SEAL } from './metrics';
import { EASE_IO, EASE_OUT, T, useSettled } from './motion';

/* ==================================================================== */
/* The guide: Sipply's wax seal                                         */
/*                                                                      */
/* Imprint's orb, in Daylight (spec 3, study 3.5): the app icon's seal   */
/* (assets/images/icon.png) drawn at 1.56x inside a round clip, so only */
/* the wax shows. Round is allowed: it is the guide mark. Decorative,    */
/* hidden from VoiceOver; the bubble beside it speaks.                  */
/*                                                                      */
/* Three places (study 1): A centre stage at 200pt in two 1pt rings, B   */
/* narration at 40pt, C question at 32pt. It belongs to its step's      */
/* layer and rides the push (m14): no morph between modes.              */
/*                                                                      */
/* Its motion is decoration on a seal that reads without it:            */
/*   speak (m12)  650ms after the screen settles, one +8% swell back     */
/*                with a small undershoot, and a ring that ripples out   */
/*   stamp (m21)  All set: down from 1.12, with one ripple              */
/*   breathe (m13) mode A's rings, +/-3% out of phase, a second a half   */
/* None of it under Reduce Motion. The seal's scale is redrawn plain     */
/* once its gesture is over, and the ripple is unmounted by a timer.     */
/* ==================================================================== */

const SEAL_ASSET = require('../../../assets/images/icon.png');
/** The icon drawn this much larger than its clip, so only the wax shows. */
const COVER = 1.56;
/** The swell waits this long after the push (180ms) has settled the screen (m12). */
const SPEAK_AT = T.pushIn + 650;
const GESTURE_MS = 650;
/** The inner ring's offset inside the outer one's box. */
const INSET = (RING_OUTER - RING_INNER) / 2;

let sealUri: string | null | undefined;
function sealSource(decode: number) {
  if (sealUri === undefined) sealUri = RNImage.resolveAssetSource(SEAL_ASSET)?.uri ?? null;
  return sealUri ? { uri: sealUri, cacheKey: `sipply-seal#${decode}` } : SEAL_ASSET;
}

/** The seal alone, at `size`. A `collar` of page round it keeps prints off it (the reveal). */
export const Seal = React.memo(function Seal({
  size,
  collar = 0,
  style,
}: {
  size: number;
  collar?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const drawn = size * COVER;
  const decode = Math.round(drawn);
  const clip = (
    <View
      style={[
        styles.clip,
        // round-ok: the guide mark, Sipply's wax seal (check-design rule 4 allows it)
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      <Image
        source={sealSource(decode)}
        style={{ position: 'absolute', width: drawn, height: drawn, left: (size - drawn) / 2, top: (size - drawn) / 2 }}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        enforceEarlyResizing
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    </View>
  );
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        collar > 0 && {
          padding: collar,
          backgroundColor: colors.bg,
          // round-ok: the seal's page collar, a ring round the guide mark
          borderRadius: (size + 2 * collar) / 2,
        },
        style,
      ]}>
      {clip}
    </View>
  );
});

/** One 1pt rule ring that grows 1.35x from the seal and fades, mounted only while it runs. */
function Ripple({ size, box }: { size: number; box: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 600, easing: EASE_OUT }));
  }, [t]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.8 * (1 - t.value),
    transform: [{ scale: 1 + 0.35 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        // round-ok: the guide's ripple, a ring round the seal
        { width: size, height: size, borderRadius: size / 2, borderColor: colors.rule, left: (box - size) / 2, top: (box - size) / 2 },
        anim,
      ]}
    />
  );
}

/** The ripple's window: mounted from `at` for GESTURE_MS, by JS timers. */
function useRippleWindow(at: number | null): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (at === null) return;
    const start = setTimeout(() => setOn(true), at);
    const end = setTimeout(() => setOn(false), at + GESTURE_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [at]);
  return on;
}

export type GuideGesture = 'speak' | 'stamp' | 'none';

/**
 * The seal in mode A, B or C, with its gesture. `from` flies it in from
 * another place (the reveal's centre, m20): an offset and a scale that
 * settle to its own slot in 240ms.
 */
export function Guide({
  mode,
  gesture = 'speak',
  from,
  style,
}: {
  mode: 'A' | 'B' | 'C';
  gesture?: GuideGesture;
  from?: { dx: number; dy: number; scale: number } | null;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const size = SEAL[mode];
  const live = !reduce;
  const scale = useSharedValue(gesture === 'stamp' && live ? 1.12 : 1);
  const fly = useSharedValue(from && live ? 0 : 1);
  const inner = useSharedValue(1);
  const outer = useSharedValue(1);

  const gestureEnd = !live || gesture === 'none' ? 0 : gesture === 'stamp' ? GESTURE_MS : SPEAK_AT + GESTURE_MS;
  const still = useSettled(`gesture-${gesture}`, gestureEnd + T.settle);
  const flown = useSettled('fly', from && live ? 240 + T.settle : 0);
  const ripple = useRippleWindow(!live || gesture === 'none' ? null : gesture === 'stamp' ? 0 : SPEAK_AT);

  useEffect(() => {
    if (!live) return;
    if (gesture === 'speak') {
      scale.set(
        withDelay(
          SPEAK_AT,
          withSequence(
            withTiming(1.08, { duration: 230, easing: EASE_OUT }),
            withSpring(1, { damping: 9, stiffness: 180, mass: 1 }),
          ),
        ),
      );
    } else if (gesture === 'stamp') {
      scale.set(withSpring(1, { damping: 14, stiffness: 260 }));
    }
    return () => cancelAnimation(scale);
  }, [live, gesture, scale]);

  // Keyed on whether it flies, not on the object, so a re-render mid-flight does not restart it.
  const flies = !!from;
  useEffect(() => {
    if (flies && live) fly.set(withTiming(1, { duration: 240, easing: EASE_OUT }));
  }, [flies, live, fly]);

  useEffect(() => {
    if (mode !== 'A' || !live) return;
    const half = { duration: 1000, easing: EASE_IO };
    inner.set(withRepeat(withSequence(withTiming(1.03, half), withTiming(0.97, half)), -1));
    outer.set(withRepeat(withSequence(withTiming(0.97, half), withTiming(1.03, half)), -1));
    return () => {
      cancelAnimation(inner);
      cancelAnimation(outer);
    };
  }, [mode, live, inner, outer]);

  const sealAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fx = from?.dx ?? 0;
  const fy = from?.dy ?? 0;
  const fs = from?.scale ?? 1;
  const flyAnim = useAnimatedStyle(() => ({
    transform: [
      { translateX: fx * (1 - fly.value) },
      { translateY: fy * (1 - fly.value) },
      { scale: fs + (1 - fs) * fly.value },
    ],
  }));
  const innerAnim = useAnimatedStyle(() => ({ transform: [{ scale: inner.value }] }));
  const outerAnim = useAnimatedStyle(() => ({ transform: [{ scale: outer.value }] }));

  const box = mode === 'A' ? RING_OUTER : size;
  const sealStyle = still || !live ? null : sealAnim;
  const flyStyle = !from || flown || !live ? null : flyAnim;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, { width: box, height: box }, style, flyStyle]}>
      {mode === 'A' ? (
        <>
          <Animated.View
            style={[
              styles.ring,
              // round-ok: the guide's outer ring
              { width: RING_OUTER, height: RING_OUTER, borderRadius: RING_OUTER / 2, borderColor: colors.line, left: 0, top: 0 },
              live ? outerAnim : null,
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              // round-ok: the guide's inner ring
              { width: RING_INNER, height: RING_INNER, borderRadius: RING_INNER / 2, borderColor: colors.rule, left: INSET, top: INSET },
              live ? innerAnim : null,
            ]}
          />
        </>
      ) : null}
      {ripple ? <Ripple size={size} box={box} /> : null}
      <Animated.View style={sealStyle}>
        <Seal size={size} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden', backgroundColor: colors.text },
  ring: { position: 'absolute', borderWidth: stroke.edge },
});
