import React, { useEffect } from 'react';
import { AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { FIRST_TASTES } from '@/lib/tastes';

import { WALL_PITCH, WALL_PRINT } from './metrics';
import { LINEAR } from './motion';
import { DrinkPrint } from './Photo';

/* ==================================================================== */
/* The welcome's wall                                                   */
/*                                                                      */
/* Imprint's drifting mosaic (study 2, screen 01) made of the one thing */
/* Sipply has in colour: the catalogue prints of FIRST_TASTES, the 24   */
/* classics a new person has likely ordered, in four rows of 146pt      */
/* prints on a 154pt pitch. Rows 1 and 3 drift right at 60pt a second,  */
/* 2 and 4 left at 50 (m3), each over a doubled row so the loop has no  */
/* seam. Paused while the app is in the background; still under Reduce  */
/* Motion. A stalled worklet leaves the wall at rest, which is the      */
/* mockup.                                                              */
/*                                                                      */
/* Decorative: hidden from VoiceOver. Memory: 24 decodes at 146pt.      */
/* ==================================================================== */

const ROWS = 4;
/** Where each row starts, so the prints never line up in columns (the mockup's offsets). */
const OFFSET = [-46, -118, -22, -96] as const;
/** Points a second; right is positive. */
const SPEED = [60, -50, 60, -50] as const;

function rowsOf(ids: readonly string[]): string[][] {
  const per = Math.max(1, Math.ceil(ids.length / ROWS));
  return Array.from({ length: ROWS }, (_, r) => ids.slice(r * per, r * per + per)).filter((row) => row.length > 0);
}

function Row({ ids, index, live }: { ids: string[]; index: number; live: boolean }) {
  const span = ids.length * WALL_PITCH;
  const speed = SPEED[index % ROWS]!;
  const off = OFFSET[index % ROWS]!;
  // Right-moving rows run from one span back to their offset; left-moving ones the other way.
  const start = speed > 0 ? off - span : off;
  const end = speed > 0 ? off : off - span;
  const full = (span / Math.abs(speed)) * 1000;
  const x = useSharedValue(start);

  useEffect(() => {
    if (!live) return;
    const loop = () =>
      withRepeat(withSequence(withTiming(start, { duration: 0 }), withTiming(end, { duration: full, easing: LINEAR })), -1);
    const run = () => {
      const left = Math.abs(end - x.get()) / Math.abs(speed);
      x.set(withSequence(withTiming(end, { duration: left * 1000, easing: LINEAR }), loop()));
    };
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
      else cancelAnimation(x);
    });
    return () => {
      sub.remove();
      cancelAnimation(x);
    };
  }, [live, start, end, full, speed, x]);

  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Animated.View style={[styles.row, { top: index * WALL_PITCH }, live ? drift : { transform: [{ translateX: start }] }]}>
      {[...ids, ...ids].map((id, i) => (
        <DrinkPrint key={`${id}-${i}`} id={id} size={WALL_PRINT} style={{ left: i * WALL_PITCH, position: 'absolute' }} />
      ))}
    </Animated.View>
  );
}

/** The wall, filling `style`'s frame (the welcome gives it what is left above the wordmark) and clipped to it. */
export function WelcomeWall({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const rows = rowsOf(FIRST_TASTES.map((d) => d.id));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wall, style]}>
      {rows.map((ids, r) => (
        <Row key={r} ids={ids} index={r} live={!reduce} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wall: { overflow: 'hidden', alignSelf: 'stretch' },
  row: { position: 'absolute', left: 0, height: WALL_PRINT, width: 1 },
});
