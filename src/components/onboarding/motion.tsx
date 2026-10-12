import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/* ==================================================================== */
/* The onboarding's motion rules (specs/v4.1-changes.md 1.7)            */
/*                                                                      */
/* Imprint's timings, measured (v4-onboarding spec 7.1), under four      */
/* rules that keep a Release build's Reanimated stall from costing more */
/* than a moment of the old look:                                       */
/*                                                                      */
/*   NEVER INVISIBLE. Incoming content starts at opacity 0.6 and 8pt     */
/*   off its rest, so a worklet that never runs still leaves it read.   */
/*   JS CLOCKS. Staggers, auto-advances, a layer's removal and the       */
/*   reveal's phases are setTimeouts, never animation callbacks.        */
/*   JS END STATES. Whatever animates is redrawn with plain styles at    */
/*   its duration + 50ms (SETTLE). A state change (a pick, Continue      */
/*   enabling) draws its END look at once in plain styles, and lays the */
/*   look it is leaving over it as a fading copy that a JS timer then    */
/*   unmounts: a stalled fade costs 350ms of the old colour, never a     */
/*   wrong state.                                                       */
/*   REDUCE MOTION. Every duration 0, no swell, drift, breathing or pop. */
/*                                                                      */
/* Shared values only (check-design rule 15), and no entering, exiting  */
/* or layout animations (rule 3).                                       */
/* ==================================================================== */

export const EASE_OUT = Easing.out(Easing.cubic);
export const EASE_IO = Easing.inOut(Easing.cubic);
export const LINEAR = Easing.linear;

/** Milliseconds, by the spec's m numbers. */
export const T = {
  /** m1: the incoming layer, from +8pt at 0.6. */
  pushIn: 180,
  /** m1: the outgoing layer, to -10pt and 0, and the JS timer that removes it. */
  pushOut: 140,
  pushGone: 160,
  /** m2: the welcome leaves (the key's slide, the wall's fade). */
  welcome: 190,
  /** m4, m9: a pick's fill. */
  pick: 300,
  /** m5, m6: Continue enabling, and disabling on the push. */
  enable: 330,
  disable: 350,
  /** m8: single choice moves on this long after the tap. */
  autoAdvance: 180,
  /** m10: the feedback card arrives; its text crossfades. */
  card: 300,
  cardText: 200,
  /** m11: the progress rule steps. */
  progress: 180,
  /** m22: a key relabels. */
  relabel: 200,
  /** m20: the overlay of flying prints is removed this long after the reveal starts. */
  revealGone: 420,
  /** The reveal under Reduce Motion: a crossfade. */
  revealFade: 300,
  /** Every JS end state lands this long after its animation should have. */
  settle: 50,
} as const;

/** True once `ms` have passed since `key` last changed. A JS clock: it settles whatever Reanimated did. */
export function useSettled(key: string | number | boolean, ms: number): boolean {
  const [done, setDone] = useState<string | number | boolean | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setDone(key), ms);
    return () => clearTimeout(id);
  }, [key, ms]);
  return done === key;
}

/**
 * The value this one replaced, for `ms` after it changed, then undefined.
 * What a fading copy of the old look is drawn from (see FadeOut). A second
 * change inside the window keeps the first old value: a small jump on a
 * double tap, never a wrong end state.
 */
export function useFadingPrevious<V extends string | number | boolean | null>(value: V, ms: number): V | undefined {
  const [settled, setSettled] = useState<V>(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return Object.is(settled, value) ? undefined : settled;
}

/**
 * VoiceOver is on (AccessibilityInfo.isScreenReaderEnabled, the call the
 * spec names). React Native has no Switch Control query on iOS, so a
 * Switch Control user keeps the 180ms auto-advance, which moves on from a
 * pick they chose; nothing auto-advances without one, except a narration.
 */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then(
      (v) => {
        if (live) setOn(v);
      },
      () => {},
    );
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

const PLAIN: ViewStyle = { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] };

/**
 * Content mounted on its turn: from `from` opacity (0.6, never less) and
 * `dx` / `dy` points off its rest, to rest over `duration`, then plain.
 */
export function Appear({
  children,
  duration = T.card,
  from = 0.6,
  dx = 0,
  dy = 0,
  style,
  pointerEvents,
}: {
  children: React.ReactNode;
  duration?: number;
  from?: number;
  dx?: number;
  dy?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'box-none' | 'none' | 'auto';
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 1 : 0);
  const settled = useSettled('appear', reduce ? 0 : duration + T.settle);
  const start = Math.max(0.6, from);

  useEffect(() => {
    if (!reduce) t.set(withTiming(1, { duration, easing: EASE_IO }));
  }, [reduce, t, duration]);

  const anim = useAnimatedStyle(() => ({
    opacity: start + (1 - start) * t.value,
    transform: [{ translateX: dx * (1 - t.value) }, { translateY: dy * (1 - t.value) }],
  }));

  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, reduce || settled ? PLAIN : anim]}>
      {children}
    </Animated.View>
  );
}

/**
 * The look a control is leaving, laid over its new one and faded out.
 * Its owner unmounts it on a JS timer (useFadingPrevious), so a fade that
 * never runs leaves the old look up for the window, then the right one.
 */
export function FadeOut({
  children,
  duration,
  style,
}: {
  children: React.ReactNode;
  duration: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useSharedValue(1);
  useEffect(() => {
    t.set(withTiming(0, { duration, easing: EASE_IO }));
  }, [t, duration]);
  const anim = useAnimatedStyle(() => ({ opacity: t.value }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, style, anim]}>
      {children}
    </Animated.View>
  );
}
