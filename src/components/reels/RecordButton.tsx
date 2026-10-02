import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, motion } from '@/constants/theme';
import { REEL_MAX_SECONDS } from '@/lib/reels';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The touch target. The recorder centres it from this. */
export const RECORD_HIT = 96;
const RING = 84;
const RING_STROKE = 4;
const RING_R = (RING - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_R;
const CORE_IDLE = 68;
const CORE_RECORDING = 30;
/** The stop square's corner. A literal on purpose: it is the shutter's own shape, not a control radius. */
const STOP_CORNER = 6;

/**
 * The shutter: a red disc in a bone ring that becomes a red stop square
 * while recording, with the ring filling clockwise from twelve o'clock over
 * the 30 seconds a reel may last.
 *
 * It only draws and reports touches. Whether a touch starts, holds or
 * stops a recording is the recorder's call (Recorder.tsx), because that
 * depends on timestamps across two presses.
 *
 * The disc is one of the few circles the design allows: a shutter is a
 * round object, not a control drawn round.
 *
 * The morph is a spring, and under Reduce Motion a swap. Either way the
 * resting shapes are set from the state, so a stalled animation can only
 * be late, never wrong for long: the timer chip and the announcements say
 * "recording" regardless.
 */
export function RecordButton({
  recording,
  elapsedMs,
  disabled,
  onPressIn,
  onPressOut,
}: {
  recording: boolean;
  /** For VoiceOver's value while recording. */
  elapsedMs: number;
  disabled?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const reduced = useReducedMotion();
  const morph = useSharedValue(recording ? 1 : 0);
  const filled = useSharedValue(0);

  useEffect(() => {
    const to = recording ? 1 : 0;
    morph.set(reduced ? to : withSpring(to, motion.spring));
    if (recording) {
      filled.set(0);
      filled.set(withTiming(1, { duration: REEL_MAX_SECONDS * 1000, easing: Easing.linear }));
    } else {
      cancelAnimation(filled);
      filled.set(0);
    }
  }, [recording, reduced, morph, filled]);

  const core = useAnimatedStyle(() => {
    const size = interpolate(morph.value, [0, 1], [CORE_IDLE, CORE_RECORDING]);
    return {
      width: size,
      height: size,
      // round-ok: shutter (a disc at rest, the stop square's corner while recording)
      borderRadius: interpolate(morph.value, [0, 1], [CORE_IDLE / 2, STOP_CORNER]),
    };
  });

  const arc = useAnimatedProps(() => ({ strokeDashoffset: RING_LENGTH * (1 - filled.value) }));

  const seconds = Math.min(REEL_MAX_SECONDS, Math.floor(elapsedMs / 1000));

  return (
    <Pressable
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Record'}
      accessibilityHint={recording ? undefined : `Records up to ${REEL_MAX_SECONDS} seconds.`}
      accessibilityValue={recording ? { text: `${seconds} of ${REEL_MAX_SECONDS} seconds` } : undefined}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.hit, disabled && styles.disabled]}>
      <Svg width={RING} height={RING} style={styles.ring}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          stroke={recording ? colors.reelTrack : colors.reelInk}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {recording ? (
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RING_R}
            stroke={colors.record}
            strokeWidth={RING_STROKE}
            strokeDasharray={`${RING_LENGTH} ${RING_LENGTH}`}
            animatedProps={arc}
            fill="none"
            // From twelve o'clock, clockwise.
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.coreSlot} pointerEvents="none">
        <Animated.View style={[styles.core, core]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: RECORD_HIT,
    height: RECORD_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.42 },
  ring: { position: 'absolute' },
  coreSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  core: { backgroundColor: colors.record },
});
