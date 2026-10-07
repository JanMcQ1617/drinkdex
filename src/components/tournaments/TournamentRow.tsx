import { Pressable, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button } from '@/components/ui';
import { colors, layout, space, stroke, tabular, textRole } from '@/constants/theme';
import { TOURNAMENT_LIMITS, type TournamentError } from '@/lib/tournaments';
import type { TournamentSummary } from '@/types';

/* ==================================================================== */
/* Tournaments: one row of the list, and the words every tournament     */
/* screen shares (spec v3.1 §11.3)                                      */
/*                                                                      */
/* The copy lives beside the row because the row is the one component   */
/* all three screens draw from: the dates, the rules line and the error  */
/* sentences are said one way on the list, the host sheet and a         */
/* tournament's page.                                                   */
/*                                                                      */
/* COPY RULES (App Review 1.4.3). Always "different drinks", "try",     */
/* "new to you". Never "more drinks", rounds, shots, volume, streaks or  */
/* speed, and never a count of anything but different drinks. No meter  */
/* or progress bar toward the daily cap or a goal: the standings are the */
/* only figures.                                                        */
/* ==================================================================== */

/* -------------------------------------------------------------------- */
/* Words                                                                */
/* -------------------------------------------------------------------- */

/** "1 different drink", "5 different drinks". */
export function differentDrinks(k: number): string {
  return `${k} different ${k === 1 ? 'drink' : 'drinks'}`;
}

/** "1 person", "4 people". */
export function peopleCount(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
const DAY_MS = 86_400_000;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar days from today to `d`, in the phone's zone (rounded: a clock change makes a 23 or 25 hour day). */
function daysAhead(d: Date, now: number): number {
  return Math.round((startOfDay(d.getTime()) - startOfDay(now)) / DAY_MS);
}

/** The year, only when it is not this one. */
function yearOf(d: Date, now: number): string {
  return d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
}

/**
 * The last moment a tournament counts, for showing its end: ends_at is
 * exclusive, so a week that starts at Monday 00:00 ends at the next
 * Monday 00:00 and its last day is the Sunday.
 */
export function lastMoment(endsAt: string | Date): Date {
  const t = typeof endsAt === 'string' ? Date.parse(endsAt) : endsAt.getTime();
  return new Date(t - 60_000);
}

/** "Mon 6 Oct": the host sheet's "Runs … to …" line. */
export function shortDay(d: Date, now: number = Date.now()): string {
  return `${WEEKDAYS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]!.slice(0, 3)}${yearOf(d, now)}`;
}

/**
 * A day for a row's second line: "today", "tomorrow", the weekday within
 * the coming week, else "14 Oct". A weekday is never seven or more days
 * out, so "Monday" cannot mean the Monday after next.
 */
export function dayWord(d: Date, now: number = Date.now()): string {
  const ahead = daysAhead(d, now);
  if (ahead === 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  if (ahead > 1 && ahead < 7) return WEEKDAYS[d.getDay()]!;
  return `${d.getDate()} ${MONTHS[d.getMonth()]!.slice(0, 3)}${yearOf(d, now)}`;
}

/** "today", "tomorrow", else "Saturday 18 October": a tournament page's status line. */
export function dayLong(d: Date, now: number = Date.now()): string {
  const ahead = daysAhead(d, now);
  if (ahead === 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return `${WEEKDAYS[d.getDay()]} ${dateLong(d, now)}`;
}

/** "12 October" (with the year when it is not this one). */
export function dateLong(d: Date, now: number = Date.now()): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${yearOf(d, now)}`;
}

/* -------------------------------------------------------------------- */
/* Errors                                                               */
/* -------------------------------------------------------------------- */

/**
 * What a refused tournament call says, for every reason lib/tournaments
 * maps the server's P0001 messages to. The first five are the host
 * sheet's (§11.3); the next three come from the page's actions (an
 * invitation answered twice, a tournament deleted under you). `fallback`
 * is the screen's own "Could not … Check your connection" sentence, for
 * a request that failed or never arrived.
 */
export function tournamentErrorText(reason: TournamentError, fallback: string): string {
  switch (reason) {
    case 'objectionable':
      return 'That name includes language Sipply does not allow.';
    case 'invalid_dates':
      return 'Those dates do not work. Pick a start within 30 days.';
    case 'invalid_goal':
      return 'That goal cannot be reached in that time. Pick a longer tournament or a smaller goal.';
    case 'too_many':
      return 'You are hosting 5 tournaments already. End one to host another.';
    case 'no_invitees':
      return NO_INVITEES;
    case 'not_found':
      return 'This tournament is no longer there. The host may have deleted it.';
    case 'finished':
      return 'This tournament has finished, so it cannot be changed.';
    case 'not_allowed':
      return 'That is no longer possible in this tournament.';
    case 'offline':
    case 'failed':
      return fallback;
  }
}

/** Also what an invitation that reached nobody says (invite_to_tournament answered 0). */
export const NO_INVITEES =
  'None of those people can be invited. They may have blocked you or stopped following.';

/* -------------------------------------------------------------------- */
/* The rules line                                                       */
/* -------------------------------------------------------------------- */

/**
 * The rules, on every tournament screen, in the scroll body (never only
 * in a collapsed section). "Please drink responsibly." is part of it on
 * purpose (App Review 1.4.3), and so is "Apple is not a sponsor" (5.3,
 * though nothing of value is ever offered).
 */
export function TournamentRules({
  cap = TOURNAMENT_LIMITS.dailyCap,
  style,
}: {
  cap?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.rules, style]}>
      Each different drink you post counts once, up to {cap} new drinks a day. It is about trying
      new things, never how much: a taste counts. No prizes, and Apple is not a sponsor. Please
      drink responsibly.
    </Text>
  );
}

/* -------------------------------------------------------------------- */
/* The row                                                              */
/* -------------------------------------------------------------------- */

/** Which section of the list a tournament belongs in, or null when it is not shown there. */
export type RowKind = 'invite' | 'live' | 'upcoming' | 'finished';

export function rowKind(t: TournamentSummary): RowKind | null {
  if (t.myStatus === 'invited') return t.state === 'finished' ? null : 'invite';
  // Declined (or left): the server no longer lists these, but a stale row never shows.
  if (t.myStatus === 'declined') return null;
  return t.state;
}

/** The second line, as shown and as spoken. Names are usernames, without the @. */
function secondLine(
  t: TournamentSummary,
  kind: RowKind,
  myId: string,
  names: { host?: string; winner?: string },
): string {
  const people = peopleCount(t.members);
  if (kind === 'finished') {
    if (!t.winnerId) return 'No winner';
    const who = t.winnerId === myId ? 'you' : names.winner ? `@${names.winner}` : null;
    const k = t.winnerDistinct ?? 0;
    // Until the winner's profile is in hand, the day it finished stands in for the name.
    return who
      ? `Won by ${who} · ${differentDrinks(k)}`
      : `Finished ${dateLong(lastMoment(t.finishedAt ?? t.endsAt))}`;
  }
  const when =
    t.state === 'live'
      ? `Ends ${dayWord(lastMoment(t.endsAt))}`
      : `Starts ${dayWord(new Date(t.startsAt))}`;
  /*
   * An invitation also says who it is from: it is a stranger's name
   * otherwise, and who asked is what decides whether to join.
   */
  if (kind === 'invite' && names.host) return `Hosted by @${names.host} · ${when} · ${people}`;
  return `${when} · ${people}`;
}

/**
 * One tournament in the list, min 64: its name (Inter, never Playfair:
 * it is not a drink's name), the line under it, and at the end your
 * place (on now), Join and Decline (an invitation), or a chevron.
 *
 * A row with Join and Decline is not one button: the name and line open
 * the tournament, and each answer is its own control, so VoiceOver can
 * reach all three (a pressable row is one element to it). Every other
 * row is one button, chevron and place included.
 *
 * Your place shows only once you have a drink counted: at nought every
 * rank is the server's tie-break, and "You're 1st" with nothing posted
 * would be a claim the standings do not make.
 */
export function TournamentRow({
  tournament: t,
  kind,
  myId,
  hostName,
  winnerName,
  onOpen,
  onJoin,
  onDecline,
  answering,
  separator,
}: {
  tournament: TournamentSummary;
  kind: RowKind;
  myId: string;
  hostName?: string;
  winnerName?: string;
  onOpen: () => void;
  onJoin?: () => void;
  onDecline?: () => void;
  /** An answer to this invitation is on its way: which one. */
  answering?: 'join' | 'decline' | null;
  /** The hairline under the row; off on a group's last row. */
  separator: boolean;
}) {
  const line = secondLine(t, kind, myId, { host: hostName, winner: winnerName });
  const place =
    kind === 'live' && t.myRank != null && (t.myDistinct ?? 0) > 0 ? `You're ${ordinal(t.myRank)}` : null;
  const spoken = `${t.name}, ${line}${place ? `, you're ${ordinal(t.myRank!)}` : ''}`;

  const text = (
    <View style={styles.text}>
      <Text style={styles.name}>{t.name}</Text>
      <Text style={styles.line}>{line}</Text>
    </View>
  );

  if (kind === 'invite') {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint="Opens the tournament"
          style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
          {text}
        </Pressable>
        <View style={styles.answers}>
          <Button
            label="Join"
            size="sm"
            onPress={onJoin ?? (() => undefined)}
            loading={answering === 'join'}
            disabled={answering === 'decline'}
            accessibilityLabel={`Join ${t.name}`}
          />
          <Button
            label="Decline"
            variant="text"
            muted
            size="sm"
            onPress={onDecline ?? (() => undefined)}
            loading={answering === 'decline'}
            disabled={answering === 'join'}
            accessibilityLabel={`Decline ${t.name}`}
          />
        </View>
        {separator ? <View style={styles.separator} /> : null}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the tournament"
      style={({ pressed }) => [styles.row, styles.rowButton, pressed && styles.pressed]}>
      {text}
      {place ? (
        <Text style={styles.place}>{place}</Text>
      ) : (
        <Icon name="chevronRight" size={18} color={colors.textFaint} />
      )}
      {separator ? <View style={styles.separator} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rules: { ...textRole.helper, color: colors.textMuted },

  /* ListRow's metrics: 16pt in from the group's edge, 12pt between the parts. */
  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
  },
  rowButton: { paddingVertical: space.md, paddingRight: space.lg },
  identity: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: space.md },
  pressed: { backgroundColor: colors.bgSunk },
  text: { flex: 1, gap: 2 },
  name: { ...textRole.sectionTitle, color: colors.text },
  line: { ...textRole.helper, color: colors.textMuted },
  place: { ...textRole.labelValue, ...tabular, color: colors.text },
  answers: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  /* From the text's left edge to the row's right edge, as a ListRow's rule runs. */
  separator: {
    position: 'absolute',
    left: space.lg,
    right: 0,
    bottom: 0,
    height: stroke.hair,
    backgroundColor: colors.line,
  },
});
