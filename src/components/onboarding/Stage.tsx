import React, { useEffect } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { EASE_OUT, LINEAR, T, useSettled } from './motion';

/* ==================================================================== */
/* The stage: one step's layer                                          */
/*                                                                      */
/* Imprint's handover (study 3.1; spec 7.1 m1, 7.2): never a full-width */
/* push and never a native transition. Two layers overlap completely:   */
/* the incoming step arrives from 8pt over at opacity 0.6 (Imprint: 10  */
/* and 0) in 180ms, easing out; the outgoing one slides 10pt the other   */
/* way and fades in 140ms, steadily, and the flow removes it on a JS     */
/* timer at 160ms (LAYER_GONE). Back runs it mirrored. The top bar and   */
/* the footer key are outside both layers and stay put.                 */
/*                                                                      */
/* A layer keeps its React identity as it goes from incoming to         */
/* outgoing (the flow keys it by step), so the step it holds is the      */
/* same instance, frozen where it was: a Back mid-push reverses it from  */
/* wherever it is.                                                      */
/*                                                                      */
/*   push       every handover                                          */
/*   fade       the welcome leaving (m2): it fades in 190ms, no slide    */
/*   reveal     the pour resolving into the picks (m20): neither layer   */
/*              moves; the steps animate their own parts                */
/*   crossfade  that reveal under Reduce Motion: 300ms                   */
/*   cut        everything else under Reduce Motion                      */
/*                                                                      */
/* The incoming layer is redrawn plain at its duration + 50ms, so a      */
/* stalled worklet leaves it at 0.6 and 8pt for that long, then at rest. */
/* ==================================================================== */

export type StageHow = 'push' | 'fade' | 'reveal' | 'crossfade' | 'cut';

/** When the flow unmounts the outgoing layer. */
export const LAYER_GONE: Record<StageHow, number> = {
  push: T.pushGone,
  fade: T.welcome + 20,
  reveal: T.revealGone,
  crossfade: T.revealFade + T.settle,
  cut: 0,
};

const IN_MS: Record<StageHow, number> = { push: T.pushIn, fade: T.pushIn, reveal: 0, crossfade: T.revealFade, cut: 0 };
const OUT_MS: Record<StageHow, number> = { push: T.pushOut, fade: T.welcome, reveal: 0, crossfade: T.revealFade, cut: 0 };

const REST: ViewStyle = { opacity: 1, transform: [{ translateX: 0 }] };

export function Layer({
  role,
  dir,
  how,
  children,
}: {
  role: 'in' | 'out';
  /** 1 forward, -1 back (mirrored). */
  dir: 1 | -1;
  how: StageHow;
  children: React.ReactNode;
}) {
  const slides = how === 'push' || how === 'fade';
  const fades = how !== 'reveal' && how !== 'cut';
  const x = useSharedValue(role === 'in' && slides ? dir * 8 : 0);
  const o = useSharedValue(role === 'in' && fades ? 0.6 : 1);
  const settled = useSettled(role, role === 'in' ? IN_MS[how] + T.settle : 0);

  useEffect(() => {
    if (role === 'in') {
      const ms = IN_MS[how];
      x.set(withTiming(0, { duration: ms, easing: EASE_OUT }));
      o.set(withTiming(1, { duration: ms, easing: EASE_OUT }));
      return;
    }
    if (how === 'reveal') return;
    const ms = OUT_MS[how];
    if (how === 'push') x.set(withTiming(-dir * 10, { duration: ms, easing: LINEAR }));
    o.set(withTiming(0, { duration: ms, easing: LINEAR }));
  }, [role, how, dir, x, o]);

  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateX: x.value }] }));
  const out = role === 'out';

  return (
    <Animated.View
      pointerEvents={out ? 'none' : 'box-none'}
      accessibilityElementsHidden={out}
      importantForAccessibility={out ? 'no-hide-descendants' : 'auto'}
      style={[StyleSheet.absoluteFill, !out && (settled || IN_MS[how] === 0) ? REST : anim]}>
      {children}
    </Animated.View>
  );
}
