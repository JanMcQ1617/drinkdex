import React, { useEffect, useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSettled } from '@/components/onboarding/motion';
import { colors, layout, motion, radius, space, textRole } from '@/constants/theme';
import type { SavedThing } from '@/store/collections';

import { ThingPrint } from './Cover';
import { pieceOf } from './SaveSheet';

/* ==================================================================== */
/* Just saved (spec §4.2; frame `savebar`)                              */
/*                                                                      */
/* A tap on any bookmark saves to All saved, as it always has; with an  */
/* account and 023 there, this bar then rises 12pt above the tab bar    */
/* (or above the home indicator on a pushed screen): 392 x 60 of ink at */
/* the gutters, the thing's 40pt print, "Saved", and its one key, Save  */
/* to collection. It is the screen's one solid object while it shows.   */
/* The host (CollectionsHost) keeps it up 4s, 10s under VoiceOver, and  */
/* a new save restarts the count; scrolling leaves it, a swipe down     */
/* dismisses it. It never shows on an unsave.                           */
/*                                                                      */
/* MOTION THAT CANNOT STRAND IT (v4.1 §7.0). It mounts already drawn,   */
/* at 0.6 and 8pt low, and Reanimated brings it to rest in 180ms; a JS  */
/* timer then redraws it in its plain end style, so a stalled worklet   */
/* costs a moment of the start, never a bar stuck half in. Its leaving  */
/* is a 140ms fade the host follows with a JS-timed unmount, so a fade  */
/* that never runs still ends with no bar. Reduce Motion: a cut.        */
/* ==================================================================== */

const BAR_H = 60;
const PRINT = 40;
/** The entrance's start: still read at a glance if nothing ever moves it. */
const FROM_OPACITY = 0.6;
const FROM_Y = 8;
const IN_MS = 180;
const SETTLE_MS = IN_MS + 50;
/** How far a downward drag goes before it dismisses. */
const SWIPE_CLOSE = 16;

const EASE_OUT = Easing.out(Easing.cubic);
const PLAIN = { opacity: 1, transform: [{ translateY: 0 }] };

export function SaveBar({
  thing,
  n,
  leaving,
  bottom,
  onOpen,
  onDismiss,
}: {
  thing: SavedThing;
  /** The save's counter: a new save is a new bar. */
  n: number;
  /** The host is taking it away: fade, and let nothing land on it. */
  leaving: boolean;
  /** Points from the screen's foot. */
  bottom: number;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 1 : 0);
  const fade = useSharedValue(1);
  const settled = useSettled(n, reduce ? 0 : SETTLE_MS);

  useEffect(() => {
    if (reduce) return;
    t.set(0);
    t.set(withTiming(1, { duration: IN_MS, easing: EASE_OUT }));
  }, [n, reduce, t]);

  useEffect(() => {
    if (leaving && !reduce) fade.set(withTiming(0, { duration: motion.exit }));
    else fade.set(1);
  }, [leaving, reduce, fade]);

  const entering = useAnimatedStyle(() => ({
    opacity: FROM_OPACITY + (1 - FROM_OPACITY) * t.value,
    transform: [{ translateY: FROM_Y * (1 - t.value) }],
  }));
  const fading = useAnimatedStyle(() => ({ opacity: fade.value }));

  // A swipe down anywhere on the bar puts it away; one that starts on the key takes the touch from it (Pressable lets a drag go), so it never also opens the sheet.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > SWIPE_CLOSE) onDismiss();
        },
      }),
    [onDismiss],
  );

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'box-none'}
      style={[styles.slot, { bottom }, reduce || settled ? PLAIN : entering]}>
      <Animated.View style={leaving ? fading : undefined}>
        <View {...pan.panHandlers} style={styles.bar}>
          <View style={styles.print}>
            <ThingPrint piece={pieceOf(thing)} size={PRINT} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={styles.saved}>
            Saved
          </Text>
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel="Save to collection"
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.keyLabel}>
              Save to collection
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: layout.gutter, right: layout.gutter },
  bar: {
    minHeight: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingLeft: 10,
    paddingRight: space.xs,
    borderRadius: radius.control,
    backgroundColor: colors.text,
  },
  print: { width: PRINT, height: PRINT },
  saved: { ...textRole.bodyMedium, color: colors.onInk, flex: 1 },
  key: { minHeight: layout.hit, justifyContent: 'center', paddingHorizontal: space.md },
  keyPressed: { opacity: 0.6 },
  keyLabel: {
    ...textRole.bodyMedium,
    color: colors.onInk,
    textDecorationLine: 'underline',
    textDecorationColor: colors.onInk,
  },
});
