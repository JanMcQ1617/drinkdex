import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { MONTHS, WEEKDAYS } from '@/components/tournaments/TournamentRow';
import { haptic } from '@/components/ui';
import { colors, layout, radius, space, tabular, textRole } from '@/constants/theme';
import {
  canEndOn,
  canPick,
  dayOf,
  type DayRange,
  lastReachableDay,
  monthWeeks,
  pickDay,
  sameDay,
} from '@/lib/tournamentWindow';

/* ==================================================================== */
/* The host sheet's calendar (specs/v4.11/tournaments.md 1)             */
/*                                                                      */
/* Jan, 30 Oct 2026: "add a calendar … then the user can place from any */
/* start date they want to the final date". One month at a time: its    */
/* name and the two page keys, the weekday initials, and a grid of      */
/* seven columns. The first tap picks the first day and waits for the   */
/* last; the second picks the last; a tap before the first, or any tap  */
/* once both are picked, starts again from that day (lib/               */
/* tournamentWindow's pickDay). Nothing here is a date-picker module:   */
/* plain Views, so nothing native is added.                             */
/*                                                                      */
/* ONLY DAYS THE SERVER ACCEPTS ARE ENABLED. A day before today, a      */
/* start past the server's 30 days, and a last day that makes a window  */
/* shorter than a day or longer than 31 are drawn faded and say         */
/* "dimmed" to VoiceOver (canPick). The pages run from this month to    */
/* the month of the furthest day any window can reach, and no further.  */
/*                                                                      */
/* IN INK, NOT RED. The picked days are ink keys with white figures and */
/* the days between them lie on the wash, as a selected chip is ink:    */
/* the accent is the seven places theme.ts lists (check-design rule 17) */
/* and never a state, and a picked day is a state. Today is said by     */
/* weight and a 2pt bar under its figure, never by colour alone.        */
/*                                                                      */
/* SQUARED. The picked day's key is the controls' 4pt corner; the band  */
/* between is square-ended, and runs edge to edge of each cell so a     */
/* week's band is one strip, broken only where the week wraps.          */
/*                                                                      */
/* VoiceOver: the month's name is a header, each day a button that says */
/* its whole date ("Friday 30 October, today, first day") and what a    */
/* tap does ("Sets the last day"); the initials are silent.             */
/* ==================================================================== */

/** A day's cell: 44 tall (the finger's floor), a seventh of the width. */
const CELL_H = layout.hit;
/** The key inside it: the band's height too, so a picked end sits flush in its band. */
const KEY = 40;
/** Today's bar, under its figure. */
const TODAY_W = 12;
const TODAY_H = 2;
/** The figures are capped as every figure in a fixed box is (the rank columns'). */
const FIGURE_CAP = 1.3;
/** The page keys' chevron, in its 44pt box. */
const PAGE_GLYPH = 20;

const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Band = 'none' | 'full' | 'left' | 'right';

export function RangeCalendar({
  range,
  now,
  onChange,
}: {
  range: DayRange;
  /** The moment the sheet measures against: when it opened. */
  now: Date;
  onChange: (next: DayRange) => void;
}) {
  const today = dayOf(now);
  const limit = lastReachableDay(now);
  const [page, setPage] = useState(() => ({ y: range.first.getFullYear(), m: range.first.getMonth() }));

  const pageIndex = page.y * 12 + page.m;
  const canPrev = pageIndex > today.getFullYear() * 12 + today.getMonth();
  const canNext = pageIndex < limit.getFullYear() * 12 + limit.getMonth();
  const turn = (by: number) => {
    const at = new Date(page.y, page.m + by, 1);
    setPage({ y: at.getFullYear(), m: at.getMonth() });
  };

  const first = range.first.getTime();
  const last = range.last?.getTime() ?? null;
  const waiting = range.last === null;

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.month} accessibilityRole="header">
          {MONTHS[page.m]} {page.y}
        </Text>
        <PageKey icon="chevronLeft" label="Previous month" disabled={!canPrev} onPress={() => turn(-1)} />
        <PageKey icon="chevronRight" label="Next month" disabled={!canNext} onPress={() => turn(1)} />
      </View>

      <View style={styles.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {INITIALS.map((letter, i) => (
          <Text key={i} style={styles.initial} maxFontSizeMultiplier={FIGURE_CAP}>
            {letter}
          </Text>
        ))}
      </View>

      {monthWeeks(page.y, page.m).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const t = day.getTime();
            const isFirst = t === first;
            const isLast = last !== null && t === last;
            const band: Band =
              last === null || last === first
                ? 'none'
                : isFirst
                  ? 'right'
                  : isLast
                    ? 'left'
                    : t > first && t < last
                      ? 'full'
                      : 'none';
            const ends = waiting && t >= first && canEndOn(range.first, day, now);
            return (
              <DayCell
                key={i}
                day={day}
                picked={isFirst || isLast}
                band={band}
                today={sameDay(day, today)}
                enabled={canPick(range, day, now)}
                part={isFirst && isLast ? 'only day' : isFirst ? 'first day' : isLast ? 'last day' : band === 'full' ? 'in the dates' : null}
                hint={ends ? 'Sets the last day' : 'Sets the first day'}
                onPress={() => {
                  haptic.select();
                  onChange(pickDay(range, day, now));
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A month key: the chevron, 44 square, dimmed at either end of the pages. */
function PageKey({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevronLeft' | 'chevronRight';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.pageKey, pressed && styles.pressedKey, disabled && styles.off]}>
      <Icon name={icon} size={PAGE_GLYPH} color={colors.text} />
    </Pressable>
  );
}

/**
 * One day: the band behind it (the days between the two picked), the
 * key (ink when it is the first or the last), the figure, and today's
 * bar. The band and the key never move a thing when they come and go:
 * the cell's box is the same in every state.
 */
function DayCell({
  day,
  picked,
  band,
  today,
  enabled,
  part,
  hint,
  onPress,
}: {
  day: Date;
  picked: boolean;
  band: Band;
  today: boolean;
  enabled: boolean;
  /** Where it sits in the dates, for VoiceOver: "first day", "in the dates". */
  part: string | null;
  hint: string;
  onPress: () => void;
}) {
  const spoken = [
    `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`,
    today ? 'today' : null,
    part,
  ]
    .filter(Boolean)
    .join(', ');
  const ink = picked ? colors.onInk : colors.text;
  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={enabled ? hint : undefined}
      accessibilityState={{ selected: picked, disabled: !enabled }}
      style={styles.cell}>
      {({ pressed }) => (
        <>
          {band !== 'none' ? (
            <View style={[styles.band, band === 'left' && styles.bandLeft, band === 'right' && styles.bandRight]} />
          ) : null}
          <View style={[styles.key, picked && styles.keyPicked, pressed && (picked ? styles.keyPickedPressed : styles.pressedKey)]}>
            <Text
              style={[today ? styles.figureToday : styles.figure, { color: ink }, !enabled && styles.off]}
              maxFontSizeMultiplier={FIGURE_CAP}>
              {day.getDate()}
            </Text>
            {today ? <View style={[styles.todayBar, { backgroundColor: ink }, !enabled && styles.off]} /> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* The month's name at the left, the two keys at the right, their glyphs' far edge on the gutter. */
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xs,
    marginRight: -(layout.hit - PAGE_GLYPH) / 2,
  },
  month: { ...textRole.bodyStrong, flex: 1, color: colors.text },
  pageKey: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  pressedKey: { backgroundColor: colors.press },
  /* A disabled day or key, as a disabled button is (ui.tsx's 0.42). */
  off: { opacity: 0.42 },

  week: { flexDirection: 'row' },
  initial: { ...textRole.small, flex: 1, textAlign: 'center', color: colors.textMuted, paddingBottom: space.xs },
  cell: { flex: 1, height: CELL_H, alignItems: 'center', justifyContent: 'center' },
  /* The wash between the two days, square-ended, the key's height; an end's half reaches its key's centre. */
  band: {
    position: 'absolute',
    top: (CELL_H - KEY) / 2,
    height: KEY,
    left: 0,
    right: 0,
    backgroundColor: colors.bgSunk,
  },
  bandLeft: { right: '50%' },
  bandRight: { left: '50%' },
  key: { width: KEY, height: KEY, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control },
  keyPicked: { backgroundColor: colors.text },
  keyPickedPressed: { backgroundColor: colors.inkPressed },
  figure: { ...textRole.body, ...tabular },
  figureToday: { ...textRole.count },
  todayBar: { position: 'absolute', bottom: 5, width: TODAY_W, height: TODAY_H },
});
