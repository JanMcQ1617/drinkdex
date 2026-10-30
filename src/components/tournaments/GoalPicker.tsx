import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { differentDrinks } from '@/components/tournaments/TournamentRow';
import { Chip, haptic, SegmentedControl } from '@/components/ui';
import { colors, layout, radius, space, textRole } from '@/constants/theme';
import { TOURNAMENT_LIMITS } from '@/lib/tournaments';
import { WINDOW_RULES } from '@/lib/tournamentWindow';

/* ==================================================================== */
/* The host sheet's goal (specs/v4.11/tournaments.md 2)                 */
/*                                                                      */
/* Jan, 30 Oct 2026: the goal "custom as well, most entries, certain    */
/* number, custom one". Two kinds, a segmented switch: Most entries (by */
/* the last day: the server's null target) or First to N. First to      */
/* shows N as a big figure between a minus and a plus key, which repeat */
/* while held, and the three numbers the sheet offered before (5, 10,   */
/* 20) as quick picks under it, each held to 44 wide (Chip's `figure`): */
/* a bare figure makes a chip narrower than the finger's floor.         */
/*                                                                      */
/* N RUNS FROM 2 TO WHAT THE DATES ALLOW: three entries count a day, so */
/* the most is 3 x the days picked, and never over 100, the server's    */
/* own bounds (tournaments_target, create_tournament's invalid_goal;    */
/* lib/tournamentWindow's maxGoal). The ceiling is the figure under N,  */
/* "max 21", where the chip sheet said it in a sentence. A quick pick   */
/* past it is dimmed; the plus key stops at it. The host sheet holds N  */
/* and shows it clamped, so shortening the dates lowers the figure and  */
/* lengthening them brings the number picked back.                      */
/*                                                                      */
/* To VoiceOver the stepper is one adjustable element ("Goal, first to, */
/* 10 entries"; swipe up or down), as iOS's own steppers are: the keys  */
/* inside are for the finger. Nothing here is a meter (1.4.3): N is the */
/* number a host picks, never a count of anyone's.                      */
/* ==================================================================== */

export type GoalKind = 'most' | 'first';

/** A held key repeats after this, then every REPEAT_MS. */
const HOLD_MS = 350;
const REPEAT_MS = 90;
/** The stepper's keys: the call to action's 48, squared. */
const STEP_KEY = 48;

export function GoalPicker({
  kind,
  onKind,
  value,
  max,
  onStep,
  onPick,
}: {
  kind: GoalKind;
  onKind: (next: GoalKind) => void;
  /** N as shown: already held between 2 and `max`. */
  value: number;
  /** The most the dates allow (lib/tournamentWindow's maxGoal). */
  max: number;
  /** One step from the figure shown, up or down. The caller clamps. */
  onStep: (by: 1 | -1) => void;
  /** A quick pick. */
  onPick: (n: number) => void;
}) {
  const min = WINDOW_RULES.minTarget;
  return (
    <View style={styles.goal}>
      <SegmentedControl
        items={[
          { key: 'most', label: 'Most entries', icon: 'trophy' },
          { key: 'first', label: 'First to', icon: 'flag' },
        ]}
        value={kind}
        onChange={onKind}
      />
      {kind === 'first' ? (
        <>
          <View
            style={styles.stepper}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Goal, first to"
            accessibilityValue={{ text: `${differentDrinks(value)}, up to ${max}` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment' && value < max) onStep(1);
              if (e.nativeEvent.actionName === 'decrement' && value > min) onStep(-1);
            }}>
            <StepKey icon="minus" disabled={value <= min} onStep={() => onStep(-1)} />
            <View style={styles.figureBox}>
              <Text style={styles.figure} maxFontSizeMultiplier={1.3}>
                {value}
              </Text>
              <Text style={styles.under} maxFontSizeMultiplier={1.3}>
                entries · max {max}
              </Text>
            </View>
            <StepKey icon="plus" disabled={value >= max} onStep={() => onStep(1)} />
          </View>
          <View style={styles.picks}>
            {TOURNAMENT_LIMITS.targetChoices.map((n) => (
              <Chip
                key={n}
                label={String(n)}
                selected={value === n}
                disabled={n > max}
                figure
                accessibilityLabel={`First to ${differentDrinks(n)}`}
                onPress={() => onPick(n)}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Ends a held key's repeat, if one is running. */
function stopRepeat(timer: { current: ReturnType<typeof setInterval> | null }) {
  if (timer.current) clearInterval(timer.current);
  timer.current = null;
}

/**
 * A stepper key: one step on a tap, and on a hold a step every 90ms
 * after the first 350 until the finger lifts (or the key dims at its
 * end). A timer, not an animation: nothing is drawn on a clock, so
 * check-design's rule 15 has nothing to say about it.
 */
function StepKey({ icon, disabled, onStep }: { icon: 'minus' | 'plus'; disabled: boolean; onStep: () => void }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => stopRepeat(timer);
  // A key that dims mid-hold (the end reached) or leaves stops repeating.
  useEffect(() => {
    if (disabled) stopRepeat(timer);
  }, [disabled]);
  useEffect(() => () => stopRepeat(timer), []);

  return (
    <Pressable
      onPress={
        disabled
          ? undefined
          : () => {
              haptic.select();
              onStep();
            }
      }
      onLongPress={
        disabled
          ? undefined
          : () => {
              stop();
              onStep();
              timer.current = setInterval(onStep, REPEAT_MS);
            }
      }
      delayLongPress={HOLD_MS}
      onPressOut={stop}
      disabled={disabled}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed, disabled && styles.off]}>
      <Icon name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  goal: { gap: space.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  key: {
    width: STEP_KEY,
    height: STEP_KEY,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
  },
  keyPressed: { backgroundColor: colors.press },
  off: { opacity: 0.42 },
  figureBox: { flex: 1, alignItems: 'center', minHeight: layout.hit },
  figure: { ...textRole.heroFigure, color: colors.text },
  under: { ...textRole.small, color: colors.textMuted, textAlign: 'center' },
  /* A chip's row: 8 between, 12 between wrapped rows (the host sheet's chips' rule). */
  picks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.sm, rowGap: space.md },
});
