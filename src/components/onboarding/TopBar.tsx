import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icons';
import { colors, layout, textRole } from '@/constants/theme';

import {
  BAR_CENTRE,
  BAR_H,
  CHEVRON_X,
  GLYPH,
  PROGRESS_H,
  PROGRESS_LEFT,
  PROGRESS_RADIUS,
  PROGRESS_RIGHT,
  SKIP_W,
  type Geometry,
} from './metrics';
import { LINEAR, T, useSettled } from './motion';

/* ==================================================================== */
/* The top bar                                                          */
/*                                                                      */
/* Imprint's fixed chrome, in Daylight (spec 2, study 1): the back       */
/* chevron, the progress rule and Skip in the sound key's slot (the     */
/* sound key itself is left out: no voice, less stuff). Outside the     */
/* step layers, so it stays put while the steps push; only the fill     */
/* moves (m11, 180ms, linear, starting with the push).                  */
/*                                                                      */
/* The progress is a rule, not Imprint's pill: 4pt, a 1pt corner, ink   */
/* on `line`. VoiceOver reads it as a progress bar, "Step 6 of 12".     */
/*                                                                      */
/* Hidden on the welcome and the stop (fading, as the welcome's other   */
/* pieces do in m2); every animated part is redrawn plain at its        */
/* duration + 50ms.                                                     */
/* ==================================================================== */

const SKIP_CAP = 1.3;

export function TopBar({
  geo,
  shown,
  back,
  onBack,
  progress,
  skip,
  skipHint = 'Leaves this question unanswered',
  onSkip,
}: {
  geo: Geometry;
  shown: boolean;
  /** 'close' on a retake's first step, which leaves with the old answers. */
  back: 'back' | 'close';
  onBack: () => void;
  progress: { k: number; n: number } | null;
  skip: boolean;
  /** What Skip does here: a question is left unanswered, a narration just moves on. */
  skipHint?: string;
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const track = Math.max(0, geo.width - PROGRESS_LEFT - PROGRESS_RIGHT);
  const fill = progress ? Math.min(track, (track * progress.k) / Math.max(1, progress.n)) : 0;

  const o = useSharedValue(shown ? 1 : 0);
  const w = useSharedValue(fill);
  const faded = useSettled(shown, reduce ? 0 : T.welcome + T.settle);
  const stepped = useSettled(fill, reduce ? 0 : T.progress + T.settle);

  useEffect(() => {
    if (reduce) {
      o.set(shown ? 1 : 0);
      return;
    }
    // Arriving, it starts at 0.6 as content does; leaving, it fades with the welcome's pieces.
    if (shown && o.get() < 0.6) o.set(0.6);
    o.set(withTiming(shown ? 1 : 0, { duration: T.welcome, easing: LINEAR }));
  }, [shown, reduce, o]);
  useEffect(() => {
    w.set(reduce ? fill : withTiming(fill, { duration: T.progress, easing: LINEAR }));
  }, [fill, reduce, w]);

  const fadeAnim = useAnimatedStyle(() => ({ opacity: o.value }));
  const fillAnim = useAnimatedStyle(() => ({ width: w.value }));

  return (
    <Animated.View
      pointerEvents={shown ? 'box-none' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[styles.bar, { top: geo.top + BAR_CENTRE - BAR_H / 2 }, reduce || faded ? { opacity: shown ? 1 : 0 } : fadeAnim]}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={back === 'close' ? 'Close' : 'Back'}
        accessibilityHint={back === 'close' ? 'Keeps your earlier answers' : undefined}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Icon name={back === 'close' ? 'close' : 'chevronLeft'} size={GLYPH} color={colors.text} />
      </Pressable>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Progress"
        accessibilityValue={
          progress ? { min: 0, max: progress.n, now: progress.k, text: `Step ${progress.k} of ${progress.n}` } : undefined
        }
        style={[styles.track, { width: track }]}>
        <Animated.View style={[styles.fill, reduce || stepped ? { width: fill } : fillAnim]} />
      </View>

      {skip ? (
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip"
          accessibilityHint={skipHint}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={SKIP_CAP} numberOfLines={1} style={styles.skipText}>
            Skip
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, height: BAR_H },
  back: {
    position: 'absolute',
    left: CHEVRON_X - (layout.hit - GLYPH) / 2,
    top: 0,
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: PROGRESS_LEFT,
    top: (BAR_H - PROGRESS_H) / 2,
    height: PROGRESS_H,
    borderRadius: PROGRESS_RADIUS,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: { height: PROGRESS_H, borderRadius: PROGRESS_RADIUS, backgroundColor: colors.text },
  skip: {
    position: 'absolute',
    right: layout.gutter,
    top: 0,
    minWidth: SKIP_W,
    height: layout.hit,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  skipText: { ...textRole.body, color: colors.textMuted },
  pressed: { opacity: 0.5 },
});
