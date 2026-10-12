import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Bubble } from '../Bubble';
import { BODY_PAD, BODY_TOP, BUBBLE_B_GAP, MARGIN, SEAL, type Geometry } from '../metrics';
import { EASE_OUT, T, useSettled } from '../motion';
import { PourCollage } from '../PourCollage';

/* ==================================================================== */
/* Pouring your picks (mode B, then the seal at the centre; pour.png,   */
/* t3-burst.png; Imprint 22)                                            */
/*                                                                      */
/* No key and no Skip. The flow resolves it into the results 2.6s in    */
/* (m20), or on Continue under VoiceOver. As it resolves, its bubble's   */
/* words give way to the results' in 120ms.                             */
/* ==================================================================== */

export const POUR_PROMPT = 'Let me pour your first picks…';
const WORDS_OUT_MS = 120;

export function PourStep({
  geo,
  ids,
  leaving,
  focus,
}: {
  geo: Geometry;
  ids: readonly string[];
  leaving: ReadonlySet<string> | null;
  focus: boolean;
}) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  const going = leaving !== null;
  const gone = useSettled(going, going ? WORDS_OUT_MS + T.settle : 0);

  useEffect(() => {
    if (going && !reduce) o.set(withTiming(0, { duration: WORDS_OUT_MS, easing: EASE_OUT }));
  }, [going, reduce, o]);

  const fade = useAnimatedStyle(() => ({ opacity: o.value }));
  // Under Reduce Motion the whole layer crossfades instead (Stage), so the words stay with it.
  const words = going && !reduce ? (gone ? styles.hidden : fade) : null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <PourCollage geo={geo} ids={ids} leaving={leaving} />
      <Animated.View style={[styles.bubble, { top: geo.top + BODY_TOP + BODY_PAD + SEAL.B + BUBBLE_B_GAP }, words]}>
        <Bubble mode="B" prompt={POUR_PROMPT} focus={focus} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', left: MARGIN, right: MARGIN },
  hidden: { opacity: 0 },
});
