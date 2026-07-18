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
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

/**
 * Launch intro — native port of the "Clink Drinks Pokedex Intro" design.
 * Timeline (matches the source CSS to the millisecond):
 *   0.00s glow fades in · 0.35s glasses swing in · 1.15s flash + rings + spark
 *   1.20s clink nudge · 1.50s wordmark rises · 2.10s tagline · 2.50s subtitle
 *   2.90s entry chip · ~4.4s auto-dismiss. Tap anywhere to skip.
 */

const CREAM = '#F7EEDF';
const AMBER = '#FFAD5F';

const ENTRANCE = Easing.bezier(0.2, 0.9, 0.25, 1);
const POP = Easing.bezier(0.2, 1.2, 0.3, 1);

const GLASS_PATH =
  'M14 16 H86 M14 16 C14 50 30 64 50 64 C70 64 86 50 86 16 M50 64 V112 M28 124 C28 117 38 113 50 113 C62 113 72 117 72 124';
const SPARK_PATH = 'M26 2 L30.5 21.5 L50 26 L30.5 30.5 L26 50 L21.5 30.5 L2 26 L21.5 21.5 Z';

function GlassSvg({ mirrored }: { mirrored?: boolean }) {
  return (
    <Svg width={104} height={150} viewBox="0 0 100 140" fill="none">
      <Path
        d={GLASS_PATH}
        stroke={CREAM}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={mirrored ? 'M78 24 C78 44 68 54 58 57' : 'M22 24 C22 44 32 54 42 57'}
        stroke="rgba(255,173,95,0.55)"
        strokeWidth={4}
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

  // -- shared values ------------------------------------------------------
  const glowO = useSharedValue(0);
  const glowS = useSharedValue(0.6);
  const flashO = useSharedValue(0);
  const ring1 = useSharedValue(0); // progress 0..1
  const ring2 = useSharedValue(0);
  const gLx = useSharedValue(-150);
  const gLy = useSharedValue(60);
  const gLr = useSharedValue(-42);
  const gLo = useSharedValue(0);
  const gRx = useSharedValue(150);
  const gRy = useSharedValue(60);
  const gRr = useSharedValue(42);
  const gRo = useSharedValue(0);
  const sparkS = useSharedValue(0);
  const sparkR = useSharedValue(-45);
  const sparkO = useSharedValue(0);
  const wordY = useSharedValue(26);
  const wordO = useSharedValue(0);
  const tagO = useSharedValue(0);
  const tagY = useSharedValue(14);
  const subO = useSharedValue(0);
  const subY = useSharedValue(14);
  const chipO = useSharedValue(0);
  const chipY = useSharedValue(14);
  const rootO = useSharedValue(1);

  useEffect(() => {
    // glow
    glowO.set(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }));
    glowS.set(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }));
    // glasses swing in (0.35s -> 1.2s)
    const swing = { duration: 850, easing: ENTRANCE };
    gLx.set(withDelay(350, withTiming(0, swing)));
    gLy.set(withDelay(350, withTiming(0, swing)));
    gRx.set(withDelay(350, withTiming(0, swing)));
    gRy.set(withDelay(350, withTiming(0, swing)));
    gLo.set(withDelay(350, withTiming(1, { duration: 510 })));
    gRo.set(withDelay(350, withTiming(1, { duration: 510 })));
    // rotation: entrance to rest pose, then the clink nudge at 1.2s
    gLr.set(
      withDelay(
        350,
        withSequence(
          withTiming(-14, swing),
          withTiming(-9, { duration: 175, easing: Easing.out(Easing.quad) }),
          withTiming(-14, { duration: 175, easing: Easing.in(Easing.quad) })
        )
      )
    );
    gRr.set(
      withDelay(
        350,
        withSequence(
          withTiming(14, swing),
          withTiming(9, { duration: 175, easing: Easing.out(Easing.quad) }),
          withTiming(14, { duration: 175, easing: Easing.in(Easing.quad) })
        )
      )
    );
    // the clink moment (1.15s): flash, rings, spark
    flashO.set(
      withDelay(
        1150,
        withSequence(
          withTiming(0.5, { duration: 135, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 315, easing: Easing.in(Easing.quad) })
        )
      )
    );
    ring1.set(withDelay(1150, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) })));
    ring2.set(withDelay(1300, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) })));
    sparkO.set(withDelay(1150, withTiming(1, { duration: 247 })));
    sparkS.set(
      withDelay(
        1150,
        withSequence(withTiming(1.35, { duration: 247, easing: POP }), withTiming(1, { duration: 303 }))
      )
    );
    sparkR.set(
      withDelay(
        1150,
        withSequence(withTiming(10, { duration: 247, easing: POP }), withTiming(0, { duration: 303 }))
      )
    );
    // words
    const rise = { duration: 800, easing: ENTRANCE };
    wordY.set(withDelay(1500, withTiming(0, rise)));
    wordO.set(withDelay(1500, withTiming(1, rise)));
    tagY.set(withDelay(2100, withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) })));
    tagO.set(withDelay(2100, withTiming(1, { duration: 700 })));
    subY.set(withDelay(2500, withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) })));
    subO.set(withDelay(2500, withTiming(1, { duration: 700 })));
    chipY.set(withDelay(2900, withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) })));
    chipO.set(withDelay(2900, withTiming(1, { duration: 700 })));

    // haptic on the clink
    let clinkTimer: ReturnType<typeof setTimeout> | undefined;
    if (Platform.OS !== 'web') {
      clinkTimer = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }, 1150);
    }

    // auto-dismiss
    rootO.set(
      withDelay(
        4000,
        withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }, (ok) => {
          if (ok) runOnJS(finish)();
        })
      )
    );
    // Animation callbacks stop when frames stall (app backgrounded mid-intro);
    // a plain timer guarantees the overlay never traps the UI.
    const failsafe = setTimeout(finish, 4800);

    return () => {
      if (clinkTimer) clearTimeout(clinkTimer);
      clearTimeout(failsafe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = useCallback(() => {
    rootO.set(
      withTiming(0, { duration: 250 }, (ok) => {
        if (ok) runOnJS(finish)();
      })
    );
    setTimeout(finish, 400); // same failsafe as auto-dismiss
  }, [finish, rootO]);

  // -- animated styles ----------------------------------------------------
  const rootStyle = useAnimatedStyle(() => ({ opacity: rootO.value }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowO.value,
    transform: [{ scale: glowS.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashO.value }));
  const ring1Style = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - ring1.value),
    transform: [{ scale: 0.2 + 1.4 * ring1.value }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - ring2.value),
    transform: [{ scale: 0.2 + 1.4 * ring2.value }],
  }));
  const glassLStyle = useAnimatedStyle(() => ({
    opacity: gLo.value,
    transform: [
      { translateX: gLx.value },
      { translateY: gLy.value },
      { rotate: `${gLr.value}deg` },
    ],
  }));
  const glassRStyle = useAnimatedStyle(() => ({
    opacity: gRo.value,
    transform: [
      { translateX: gRx.value },
      { translateY: gRy.value },
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
  const subStyle = useAnimatedStyle(() => ({
    opacity: subO.value,
    transform: [{ translateY: subY.value }],
  }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: chipO.value,
    transform: [{ translateY: chipY.value }],
  }));

  if (gone) return null;

  const cx = W / 2;
  const glassCY = H * 0.34;
  const sparkCY = H * 0.275;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel="Skip intro">
        {/* Radial background wash */}
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="bgw" cx="50%" cy="34%" rx="60%" ry="42%">
              <Stop offset="0" stopColor="#55303E" />
              <Stop offset="0.62" stopColor="#3B2230" />
              <Stop offset="1" stopColor="#301B26" />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="34%" rx="120%" ry="90%" fill="url(#bgw)" />
        </Svg>

        {/* Warm glow behind the glasses */}
        <Animated.View
          style={[styles.center, { left: cx - 160, top: glassCY - 160, width: 320, height: 320 }, glowStyle]}
          pointerEvents="none"
        >
          <Svg width={320} height={320}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={AMBER} stopOpacity={0.3} />
                <Stop offset="0.7" stopColor={AMBER} stopOpacity={0} />
                <Stop offset="1" stopColor={AMBER} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={160} cy={160} r={160} fill="url(#glow)" />
          </Svg>
        </Animated.View>

        {/* Clink rings */}
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { left: cx - 90, top: H * 0.31 - 90, borderColor: 'rgba(255,173,95,0.8)' }, ring1Style]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { left: cx - 90, top: H * 0.31 - 90, borderWidth: 1, borderColor: 'rgba(247,238,223,0.6)' }, ring2Style]}
        />

        {/* Glasses */}
        <Animated.View
          pointerEvents="none"
          style={[styles.center, { left: cx - 104, top: glassCY - 70 }, glassLStyle]}
        >
          <GlassSvg />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.center, { left: cx, top: glassCY - 70 }, glassRStyle]}
        >
          <GlassSvg mirrored />
        </Animated.View>

        {/* Spark */}
        <Animated.View
          pointerEvents="none"
          style={[styles.center, { left: cx - 26, top: sparkCY - 26 }, sparkStyle]}
        >
          <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
            <Path d={SPARK_PATH} fill={AMBER} />
            <Circle cx={26} cy={26} r={4} fill={CREAM} />
          </Svg>
        </Animated.View>

        {/* Flash */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(247,238,223,0.9)' }, flashStyle]}
        />

        {/* Words */}
        <View pointerEvents="none" style={[styles.textBlock, { top: H * 0.54 }]}>
          <Animated.Text style={[styles.wordmark, wordStyle]}>Clink</Animated.Text>
          <Animated.Text style={[styles.tagline, tagStyle]}>Drink it. Clink it.</Animated.Text>
          <Animated.Text style={[styles.subtitle, subStyle]}>
            The field guide to everything you pour. Every drink becomes an entry.
          </Animated.Text>
        </View>

        {/* Entry chip */}
        <Animated.View pointerEvents="none" style={[styles.chipWrap, chipStyle]}>
          <View style={styles.chip}>
            <View style={styles.chipDot} />
            <Text style={styles.chipText}>ENTRY No. 001 — YOURS TO LOG</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#301B26',
    zIndex: 1000,
  },
  center: {
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
    fontFamily: 'GowunBatang_700Bold',
    fontSize: 68,
    lineHeight: 76,
    color: CREAM,
  },
  tagline: {
    fontFamily: 'HankenGrotesk_700Bold',
    fontSize: 21,
    letterSpacing: 0.4,
    color: AMBER,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk_400Regular',
    fontSize: 14.5,
    lineHeight: 21.75,
    color: 'rgba(247,238,223,0.75)',
    textAlign: 'center',
    maxWidth: 250,
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
    borderColor: 'rgba(255,173,95,0.35)',
    backgroundColor: 'rgba(255,173,95,0.08)',
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: AMBER,
  },
  chipText: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 12.5,
    letterSpacing: 1,
    color: AMBER,
  },
});
