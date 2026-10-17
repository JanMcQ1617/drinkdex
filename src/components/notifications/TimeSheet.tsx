import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { BottomSheet } from '@/components/Sheet';
import { Button, haptic } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatIdeaTime } from '@/lib/notifications';

import { HAS_WHEEL, TimeWheel } from './TimeWheel';

/* ==================================================================== */
/* Daily ideas: the time (spec §3.3, frame `time`)                      */
/*                                                                      */
/* A short sheet over Settings: Time, iOS's own wheel, one line on what */
/* the time is for, Done. Done saves and replans at once; the scrim, a  */
/* swipe or VoiceOver's escape leave the time as it was, so a wheel     */
/* turned by accident changes nothing. No route: Settings holds it, as  */
/* it holds Your tastes.                                                */
/*                                                                      */
/* Without the wheel (Android, or HAS_WHEEL off), the same sheet lists  */
/* the 48 half hours, 52pt rows, the chosen one ticked and scrolled to. */
/* ==================================================================== */

/** The fallback list's row: the house row height. */
const ROW = layout.row;
/** Rows of the fallback list in view at once, so the sheet stays short. */
const ROWS_SHOWN = 5;

export function TimeSheet({
  visible,
  hour,
  minute,
  onDone,
  onClose,
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onDone: (hour: number, minute: number) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Mounted only while up, so each opening starts from the saved time. */}
      {visible ? <TimePage hour={hour} minute={minute} onDone={onDone} /> : null}
    </BottomSheet>
  );
}

function TimePage({
  hour,
  minute,
  onDone,
}: {
  hour: number;
  minute: number;
  onDone: (hour: number, minute: number) => void;
}) {
  const [time, setTime] = useState({ hour, minute });
  return (
    <View>
      <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.title]}>
        Time
      </Text>
      {HAS_WHEEL ? (
        <TimeWheel hour={hour} minute={minute} onChange={(h, m) => setTime({ hour: h, minute: m })} />
      ) : (
        <HalfHours chosen={time} onChoose={(h, m) => setTime({ hour: h, minute: m })} />
      )}
      <Text style={styles.line}>Your idea comes once a day, at this time.</Text>
      <Button label="Done" block onPress={() => onDone(time.hour, time.minute)} />
    </View>
  );
}

/** Every half hour of the day, plus the saved time when the wheel left it between two. */
function slotsWith(chosen: { hour: number; minute: number }) {
  const slots = Array.from({ length: 48 }, (_, i) => ({ hour: Math.floor(i / 2), minute: (i % 2) * 30 }));
  if (chosen.minute % 30 !== 0) slots.push(chosen);
  return slots.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

function HalfHours({
  chosen,
  onChoose,
}: {
  chosen: { hour: number; minute: number };
  onChoose: (hour: number, minute: number) => void;
}) {
  // Worked out once, from the time it opened on: a tap must not reorder the list under the finger.
  const [slots] = useState(() => slotsWith(chosen));
  const [startAt] = useState(() =>
    Math.max(0, slots.findIndex((s) => s.hour === chosen.hour && s.minute === chosen.minute) - 2),
  );
  return (
    <ScrollView
      style={styles.list}
      contentOffset={{ x: 0, y: startAt * ROW }}
      showsVerticalScrollIndicator={false}>
      {slots.map((s) => {
        const on = s.hour === chosen.hour && s.minute === chosen.minute;
        const label = formatIdeaTime(s.hour, s.minute);
        return (
          <Pressable
            key={`${s.hour}:${s.minute}`}
            onPress={() => {
              haptic.select();
              onChoose(s.hour, s.minute);
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}>
            <Text style={[textRole.body, styles.ink]}>{label}</Text>
            {on ? <Icon name="check" size={20} color={colors.text} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, textAlign: 'center', marginBottom: space.lg },
  line: {
    ...textRole.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.lg,
    marginBottom: space.xl,
  },
  ink: { color: colors.text },
  list: { maxHeight: ROW * ROWS_SHOWN },
  slot: {
    minHeight: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: -layout.gutter,
    paddingHorizontal: layout.gutter,
  },
  slotPressed: { backgroundColor: colors.press },
});
