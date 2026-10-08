import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, textRole } from '@/constants/theme';
import { formatCount } from '@/data';

/* ==================================================================== */
/* Home's dateline (graft 6)                                            */
/*                                                                      */
/* One line under the wordmark, as a newspaper sets its date under its  */
/* masthead: "Tuesday, 7 October · 6 friends posted today". It says the */
/* feed is today's, and how much of today is in it, before a single    */
/* post is read.                                                        */
/*                                                                      */
/* COMPUTED, NEVER INVENTED. The date is the phone's. The count is the  */
/* caller's (Home's: the people you follow with a post today); when it  */
/* is not known yet (loading, signed out, an error) or is zero, the     */
/* line is the date alone, so it never states a number nobody counted   */
/* and never opens the day with "0 friends".                            */
/*                                                                      */
/* Names written out by hand rather than toLocaleDateString(): React    */
/* Native ships without full ICU on Android, where the locale version   */
/* silently falls back (data/index.ts formatCount says the same).       */
/* British order ("7 October"), as the rest of the app writes dates.    */
/* ==================================================================== */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Tuesday, 7 October", in the phone's own time zone. */
export function formatDateline(date: Date): string {
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The whole line: the date, then the count when one is known and above zero. */
export function datelineText(date: Date, friendsPosted?: number | null): string {
  const day = formatDateline(date);
  if (friendsPosted == null || friendsPosted <= 0) return day;
  const who = friendsPosted === 1 ? '1 friend' : `${formatCount(friendsPosted)} friends`;
  return `${day} · ${who} posted today`;
}

/** Wraps at large text rather than truncating; capped at 1.3 like the wordmark's row. */
export function Dateline({
  date,
  friendsPosted,
  tone = 'lining',
}: {
  /** Defaults to now. Pass one to keep a re-render from crossing midnight mid-frame. */
  date?: Date;
  /** People you follow who posted today; undefined or null while unknown. */
  friendsPosted?: number | null;
  tone?: 'lining' | 'paper';
}) {
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      style={[textRole.dateline, styles.line, { color: tone === 'lining' ? colors.onLiningMuted : colors.textMuted }]}>
      {datelineText(date ?? new Date(), friendsPosted)}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { textAlign: 'center' },
});
