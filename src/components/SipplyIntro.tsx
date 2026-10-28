import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Mark, markBox } from '@/components/brand/Mark';
import { SPLASH_MARK } from '@/components/brand/paths';
import { Wordmark, WORDMARK_ASPECT } from '@/components/brand/Wordmark';
import { colors } from '@/constants/theme';

/**
 * Launch intro, drawn: the Reduce Motion door.
 *
 * VideoIntro plays the film on every cold start and mounts this instead
 * when Reduce Motion is on: a video has one timeline and cannot soften
 * itself, and launching straight into the app with no transition is its
 * own jolt. So this is the path that matters for the people who asked for
 * less motion, and everything in it is a plain fade. Nothing scales,
 * travels or turns: the film's moves (the s turning from its 9 degrees
 * back to the wordmark's angle, the wordmark drawing on and shrinking into
 * Home's bar) are exactly what the setting asks to leave out.
 *
 * Three beats on white, the v4.5 logo (specs/v4.5-logo/scribble):
 *
 *   MARK   frame one is the launch screen to the point: the tagged s in
 *          Campari on the page, at the splash's size and centre (brand/
 *          paths SPLASH_MARK, which build-icons writes from app.json and
 *          the splash raster's own placement), so when the native splash
 *          lifts there is nothing to see change.
 *   NAME   the s dissolves and the wordmark dissolves in where it stood,
 *          as wide as the splash's 220pt canvas. One after the other,
 *          overlapping by a beat: the tilted s and the wordmark are never
 *          shown together at full strength (never one lockup, notes.md).
 *   PAGE   the whole intro dissolves and the app is what was underneath.
 *          Both are white, so the only change is the logo going.
 *
 * It replaces the v3 pour (ink circles flooding the screen, the serif
 * letters popping on an overshoot, a breathing drift), which had become
 * the one place Reduce Motion still got scale and bounce.
 *
 * Four rules this file learned the hard way and keeps:
 *  1. ONE shared value, set ONCE. Everything derives from a single master
 *     clock in milliseconds. Two `.set()` calls on one value in one tick
 *     cancel the first outright, which is how the old timeline lost frames.
 *  2. Never trust the animation callback alone to dismiss the overlay — if
 *     the app is backgrounded mid-intro the frames stall and the callback
 *     never fires. The plain timer is the guarantee.
 *  3. Reduce Motion is the case, not an afterthought: fades only, on time.
 *  4. The clock opts OUT of Reanimated's own reduced-motion handling
 *     (`ReduceMotion.Never`). The clock is the timeline, not a motion, and
 *     each style that reads it is already a fade. Left on the System
 *     default, Reanimated jumps a timing straight to its end when the
 *     setting is on — the clock read its total on frame one, the callback
 *     fired, and the intro vanished before it was ever drawn: exactly the
 *     jolt this path exists to prevent.
 */

/* ---- Timeline, in milliseconds ---------------------------------------- */
const T = {
  /** The s holds as the splash left it, then dissolves. */
  markOut: [500, 850],
  /** The wordmark dissolves in, starting as the s is two-thirds gone. */
  wordIn: [750, 1150],
  /** The intro dissolves off the app. */
  pageIn: [2150, 2550],
} as const;

const TOTAL = 2550;
const FAILSAFE = 3000;

/** The wordmark is as wide as the splash canvas the s was drawn in. */
const WORD_H = SPLASH_MARK.width / WORDMARK_ASPECT;
/** The s at the launch screen's size: its larger side, the splash raster's share of a 220pt canvas. */
const MARK_SIZE = SPLASH_MARK.width * SPLASH_MARK.fill;
/** How far the splash raster sets the s's optical centre above the screen's middle. */
const MARK_LIFT = SPLASH_MARK.width * SPLASH_MARK.lift;

/* ---- Worklet easing -------------------------------------------------- */
function clamp01(x: number) {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Progress of [from, to] at time t, eased in and out (sine), clamped to the segment. */
function fade(t: number, [from, to]: readonly [number, number]) {
  'worklet';
  const x = clamp01((t - from) / (to - from));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

export function SipplyIntro({ onDone }: { onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
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
      withTiming(
        TOTAL,
        // Rule 4: the timeline runs whatever the setting says.
        { duration: TOTAL, easing: Easing.linear, reduceMotion: ReduceMotion.Never },
        (ok) => {
          if (ok) runOnJS(finish)();
        },
      ),
    );
    const failsafe = setTimeout(finish, FAILSAFE);
    return () => clearTimeout(failsafe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = useCallback(() => {
    rootO.set(
      // A dissolve is what Reduce Motion asks for, so it is not snapped away.
      withTiming(0, { duration: 220, reduceMotion: ReduceMotion.Never }, (ok) => {
        if (ok) runOnJS(finish)();
      }),
    );
    setTimeout(finish, 360);
  }, [finish, rootO]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootO.value * (1 - fade(clock.value, T.pageIn)) }));
  const markStyle = useAnimatedStyle(() => ({ opacity: 1 - fade(clock.value, T.markOut) }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: fade(clock.value, T.wordIn) }));

  if (gone) return null;

  const box = markBox(MARK_SIZE);

  /*
   * accessibilityViewIsModal: VoiceOver otherwise walks straight past the
   * intro into the Stack underneath it — a sighted user sees one screen
   * and a VoiceOver user hears another. Marked modal, the only things it
   * can reach are the wordmark and the skip button. It works because this
   * view is a native sibling of the Stack (RootLayout renders it straight
   * into its fragment, through VideoIntro), which is what the flag scopes.
   */
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      pointerEvents="box-none"
      accessibilityViewIsModal>
      {/* White from the first frame, as the splash is, so the bar's dark glyphs are right throughout. */}
      <StatusBar style="dark" />

      {/* ---- The launch screen's s, where the splash drew it ---- */}
      <Animated.View
        pointerEvents="none"
        style={[styles.mark, { left: W / 2 - box / 2, top: H / 2 - MARK_LIFT - box / 2 }, markStyle]}>
        <Mark size={MARK_SIZE} />
      </Animated.View>

      {/* ---- The wordmark ---- */}
      <Animated.View pointerEvents="none" style={[styles.word, wordStyle]}>
        <Wordmark height={WORD_H} header />
      </Animated.View>

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
  /* The page: the splash's ground (app.json backgroundColor) and the app's. */
  root: { backgroundColor: colors.bg },
  mark: { position: 'absolute' },
  word: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});

export default SipplyIntro;
