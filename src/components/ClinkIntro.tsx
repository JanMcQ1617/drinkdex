import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { colors, fonts } from '@/constants/theme';

/**
 * Launch intro — two glasses meet, and the clink opens the app.
 *
 * Timeline (~2.9s, tap anywhere to skip):
 *   0.00s  wine-black field, warm glow blooms
 *   0.20s  glasses swing in on springs and settle
 *   0.90s  THE CLINK — flash, two rings, a gold spark, haptic
 *   1.15s  wordmark springs up
 *   1.50s  tagline · 1.85s entry chip
 *   2.30s  a porcelain disc opens from the clink point and floods the screen
 *   2.82s  overlay unmounts. The disc is already the app's background colour,
 *          so there is no cut — the app is simply what was underneath.
 *
 * Two rules this file learned the hard way:
 *  1. Each shared value gets exactly ONE `.set()` per effect run. Two `.set()`
 *     calls on the same value in the same tick cancel the first outright, so
 *     multi-step motion is expressed with `withSequence`.
 *  2. Never trust the animation callback alone to dismiss the overlay — if the
 *     app is backgrounded mid-intro the frames stall and the callback never
 *     fires. The plain timer is the guarantee.
 */

const PORCELAIN = colors.bg;
const WINE_BLACK = colors.wineDeep;

const ENTRANCE = Easing.bezier(0.2, 0.9, 0.25, 1);
const POP = Easing.bezier(0.2, 1.2, 0.3, 1);
/** heavy enough that the glasses read as leaded crystal, not paper */
const GLASS_SPRING = { damping: 16, stiffness: 150, mass: 1.1 };
const WORD_SPRING = { damping: 18, stiffness: 190, mass: 0.9 };

const GLASS_PATH =
  'M14 16 H86 M14 16 C14 50 30 64 50 64 C70 64 86 50 86 16 M50 64 V112 M28 124 C28 117 38 113 50 113 C62 113 72 117 72 124';
const SPARK_PATH = 'M26 2 L30.5 21.5 L50 26 L30.5 30.5 L26 50 L21.5 30.5 L2 26 L21.5 21.5 Z';

function GlassSvg({ mirrored }: { mirrored?: boolean }) {
  return (
    <Svg width={104} height={150} viewBox="0 0 100 140" fill="none">
      <Path
        d={GLASS_PATH}
        stroke={PORCELAIN}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the liquid's inner light, in the brand's third colour */}
      <Path
        d={mirrored ? 'M78 24 C78 44 68 54 58 57' : 'M22 24 C22 44 32 54 42 57'}
        stroke={colors.sageLit}
        strokeWidth={4}
        strokeOpacity={0.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ClinkIntro({ onDone }: { onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const [gone, setGone] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setGone(true);
    onDone();
  }, [onDone]);

  const glowO = useSharedValue(0);
  const glowS = useSharedValue(0.6);
  const flashO = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const gLx = useSharedValue(-150);
  const gLr = useSharedValue(-42);
  const gLo = useSharedValue(0);
  const gRx = useSharedValue(150);
  const gRr = useSharedValue(42);
  const gRo = useSharedValue(0);
  const glassY = useSharedValue(60);
  const sparkS = useSharedValue(0);
  const sparkR = useSharedValue(-45);
  const sparkO = useSharedValue(0);
  const wordY = useSharedValue(26);
  const wordO = useSharedValue(0);
  const tagO = useSharedValue(0);
  const tagY = useSharedValue(14);
  const chipO = useSharedValue(0);
  const chipY = useSharedValue(14);
  /** 0 → 1 drives the porcelain disc that opens the app */
  const reveal = useSharedValue(0);
  /** only the skip path touches this */
  const rootO = useSharedValue(1);

  useEffect(() => {
    glowO.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    glowS.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));

    // glasses swing in and settle on springs
    gLx.set(withDelay(200, withSpring(0, GLASS_SPRING)));
    gRx.set(withDelay(200, withSpring(0, GLASS_SPRING)));
    glassY.set(withDelay(200, withSpring(0, GLASS_SPRING)));
    gLo.set(withDelay(200, withTiming(1, { duration: 420 })));
    gRo.set(withDelay(200, withTiming(1, { duration: 420 })));

    // Rotation carries the entrance AND the clink nudge, so it is one sequence
    // on one value rather than two competing sets.
    gLr.set(
      withDelay(
        200,
        withSequence(
          withTiming(-14, { duration: 700, easing: ENTRANCE }),
          withTiming(-8, { duration: 150, easing: Easing.out(Easing.quad) }),
          withTiming(-14, { duration: 190, easing: Easing.in(Easing.quad) }),
        ),
      ),
    );
    gRr.set(
      withDelay(
        200,
        withSequence(
          withTiming(14, { duration: 700, easing: ENTRANCE }),
          withTiming(8, { duration: 150, easing: Easing.out(Easing.quad) }),
          withTiming(14, { duration: 190, easing: Easing.in(Easing.quad) }),
        ),
      ),
    );

    // the clink
    flashO.set(
      withDelay(
        900,
        withSequence(
          withTiming(0.45, { duration: 110, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 290, easing: Easing.in(Easing.quad) }),
        ),
      ),
    );
    ring1.set(withDelay(900, withTiming(1, { duration: 820, easing: Easing.out(Easing.quad) })));
    ring2.set(withDelay(1030, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) })));
    sparkO.set(
      withDelay(
        900,
        withSequence(
          withTiming(1, { duration: 200 }),
          withDelay(700, withTiming(0, { duration: 300 })),
        ),
      ),
    );
    sparkS.set(
      withDelay(
        900,
        withSequence(
          withTiming(1.35, { duration: 200, easing: POP }),
          withTiming(1, { duration: 260 }),
        ),
      ),
    );
    sparkR.set(
      withDelay(
        900,
        withSequence(
          withTiming(10, { duration: 200, easing: POP }),
          withTiming(0, { duration: 260 }),
        ),
      ),
    );

    // words
    wordY.set(withDelay(1150, withSpring(0, WORD_SPRING)));
    wordO.set(withDelay(1150, withTiming(1, { duration: 520, easing: ENTRANCE })));
    tagY.set(withDelay(1500, withTiming(0, { duration: 520, easing: ENTRANCE })));
    tagO.set(withDelay(1500, withTiming(1, { duration: 520 })));
    chipY.set(withDelay(1850, withTiming(0, { duration: 500, easing: ENTRANCE })));
    chipO.set(withDelay(1850, withTiming(1, { duration: 500 })));

    // the disc opens the app
    reveal.set(
      withDelay(
        2300,
        withTiming(1, { duration: 520, easing: Easing.in(Easing.cubic) }, (ok) => {
          if (ok) runOnJS(finish)();
        }),
      ),
    );

    let clinkTimer: ReturnType<typeof setTimeout> | undefined;
    if (Platform.OS !== 'web') {
      clinkTimer = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }, 900);
    }

    const failsafe = setTimeout(finish, 3200);
    return () => {
      if (clinkTimer) clearTimeout(clinkTimer);
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

  const cx = W / 2;
  const glassCY = H * 0.34;
  const clinkCY = H * 0.31;
  const sparkCY = H * 0.275;

  // the disc has to reach the furthest corner from the clink point
  const DISC = 120;
  const far = Math.hypot(Math.max(cx, W - cx), Math.max(clinkCY, H - clinkCY));
  const discMax = ((far * 2) / DISC) * 1.08;

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootO.value }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowO.value,
    transform: [{ scale: glowS.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashO.value }));
  const ring1Style = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - ring1.value),
    transform: [{ scale: 0.2 + 1.4 * ring1.value }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - ring2.value),
    transform: [{ scale: 0.2 + 1.4 * ring2.value }],
  }));
  const glassLStyle = useAnimatedStyle(() => ({
    opacity: gLo.value,
    transform: [
      { translateX: gLx.value },
      { translateY: glassY.value },
      { rotate: `${gLr.value}deg` },
    ],
  }));
  const glassRStyle = useAnimatedStyle(() => ({
    opacity: gRo.value,
    transform: [
      { translateX: gRx.value },
      { translateY: glassY.value },
      { rotate: `${gRr.value}deg` },
    ],
  }));
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: sparkO.value,
    transform: [{ scale: sparkS.value }, { rotate: `${sparkR.value}deg` }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordO.value,
    transform: [{ translateY: wordY.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagO.value,
    transform: [{ translateY: tagY.value }],
  }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: chipO.value,
    transform: [{ translateY: chipY.value }],
  }));
  const discStyle = useAnimatedStyle(() => ({
    opacity: reveal.value > 0 ? 1 : 0,
    transform: [{ scale: Math.max(0.0001, reveal.value * discMax) }],
  }));

  if (gone) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel="Skip intro">
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="bgw" cx="50%" cy="34%" rx="60%" ry="42%">
              <Stop offset="0" stopColor="#55303E" />
              <Stop offset="0.62" stopColor="#3B2230" />
              <Stop offset="1" stopColor={WINE_BLACK} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="34%" rx="120%" ry="90%" fill="url(#bgw)" />
        </Svg>

        {/* warm glow behind the glasses */}
        <Animated.View
          style={[
            styles.abs,
            { left: cx - 160, top: glassCY - 160, width: 320, height: 320 },
            glowStyle,
          ]}
          pointerEvents="none"
        >
          <Svg width={320} height={320}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={colors.amber} stopOpacity={0.26} />
                <Stop offset="0.7" stopColor={colors.amber} stopOpacity={0} />
                <Stop offset="1" stopColor={colors.amber} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={160} cy={160} r={160} fill="url(#glow)" />
          </Svg>
        </Animated.View>

        {/* clink rings */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { left: cx - 90, top: clinkCY - 90, borderColor: colors.sageLit },
            ring1Style,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              left: cx - 90,
              top: clinkCY - 90,
              borderWidth: 1,
              borderColor: 'rgba(241,240,234,0.6)',
            },
            ring2Style,
          ]}
        />

        {/* glasses */}
        <Animated.View
          pointerEvents="none"
          style={[styles.abs, { left: cx - 104, top: glassCY - 70 }, glassLStyle]}
        >
          <GlassSvg />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.abs, { left: cx, top: glassCY - 70 }, glassRStyle]}
        >
          <GlassSvg mirrored />
        </Animated.View>

        {/* spark — the one place gold appears outside legendary */}
        <Animated.View
          pointerEvents="none"
          style={[styles.abs, { left: cx - 26, top: sparkCY - 26 }, sparkStyle]}
        >
          <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
            <Path d={SPARK_PATH} fill={colors.gold} />
            <Circle cx={26} cy={26} r={4} fill={PORCELAIN} />
          </Svg>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(241,240,234,0.9)' }, flashStyle]}
        />

        <View pointerEvents="none" style={[styles.textBlock, { top: H * 0.54 }]}>
          <Animated.Text style={[styles.wordmark, wordStyle]}>Clink</Animated.Text>
          <Animated.Text style={[styles.tagline, tagStyle]}>Drink it. Clink it.</Animated.Text>
        </View>

        <Animated.View pointerEvents="none" style={[styles.chipWrap, chipStyle]}>
          <View style={styles.chip}>
            <View style={styles.chipDot} />
            <Text style={styles.chipText}>ENTRY No. 001 — YOURS TO LOG</Text>
          </View>
        </Animated.View>

        {/* The porcelain disc is already the app's background colour, so when
            it fills the screen the handoff has no seam. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.disc,
            {
              left: cx - DISC / 2,
              top: clinkCY - DISC / 2,
              width: DISC,
              height: DISC,
              borderRadius: DISC / 2,
            },
            discStyle,
          ]}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: WINE_BLACK,
    zIndex: 1000,
  },
  abs: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
  },
  textBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 36,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 68,
    lineHeight: 76,
    color: PORCELAIN,
  },
  tagline: {
    fontFamily: fonts.bodyBold,
    fontSize: 21,
    letterSpacing: 0.4,
    color: colors.sageLit,
  },
  chipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(143,179,155,0.35)',
    backgroundColor: 'rgba(143,179,155,0.10)',
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.sageLit,
  },
  chipText: {
    fontFamily: fonts.mono,
    fontSize: 12.5,
    letterSpacing: 1,
    color: colors.sageLit,
  },
  disc: {
    position: 'absolute',
    backgroundColor: PORCELAIN,
  },
});
