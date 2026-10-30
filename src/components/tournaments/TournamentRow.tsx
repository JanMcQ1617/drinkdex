import { useState } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { BottomSheet } from '@/components/Sheet';
import { Button } from '@/components/ui';
import { colors, layout, radius, space, tabular, textRole } from '@/constants/theme';
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
/* COPY RULES (App Review 1.4.3). A tournament is a shared log, and its */
/* unit is the entry: "5 entries", "most entries", "first to 10         */
/* entries". Never "drinks" as a score, "try", "more drinks", rounds,   */
/* shots, volume, streaks or speed, and never a count of anything but   */
/* entries. No meter or progress bar toward the daily cap or a goal:    */
/* the standings are the only figures.                                  */
/*                                                                      */
/* LESS TEXT (v4.11, specs/v4.11/tournaments.md; Jan, 30 Oct 2026:      */
/* "almost no text explaining in the tournament section, less words     */
/* more visuals"). What a screen said in sentences it now shows: a      */
/* glyph and a figure in a facts line (the dates as "30 Oct – 5 Nov",   */
/* the people, the goal), a day as a calendar page (DayTile). The words */
/* did not go: every row, line and tile still SAYS its sentence to      */
/* VoiceOver, so the spoken app is the app it was. Still no meter and   */
/* no bar: a bar of the time left is a countdown, which the cards' own  */
/* rule (TournamentCard) keeps out, and a bar toward a goal or the cap  */
/* is the quota the rule above keeps out.                               */
/*                                                                      */
/* THE RULES SHRINK TO ONE LINE, NEVER OFF THE SCREEN. The sentence     */
/* every tournament screen carried (App Review 1.4.3 and 5.3) is now    */
/* "No prizes · Apple is not a sponsor · Drink responsibly" and the "i" */
/* key beside it, which opens the sentence itself, word for word, in a  */
/* short sheet (TournamentRules). Both are in the scroll body of every  */
/* tournament screen, as the sentence was, and specs/v4.11/             */
/* tournaments.test.mjs fails a screen that drops them.                 */
/* ==================================================================== */

/* -------------------------------------------------------------------- */
/* Words                                                                */
/* -------------------------------------------------------------------- */

/**
 * "1 entry", "5 entries": every tournament figure (the standings, the
 * winner, a goal). Named for what the server counts, the different drinks
 * a member posted while it ran, which is unchanged; only the word shown
 * is the catalogue's.
 */
export function differentDrinks(k: number): string {
  return `${k} ${k === 1 ? 'entry' : 'entries'}`;
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

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = [
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

/** "Mon 6 Oct": a day said short. */
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

/** "today", "tomorrow", else "Saturday 18 October": a tournament page's spoken status. */
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

/**
 * A tournament's days as figures: "30 Oct – 5 Nov", "2–8 Nov" inside one
 * month, "5 Nov" for a single day, the year after the end when it is not
 * this one. The end is its last day (ends_at is exclusive). An en dash,
 * which the Latin subset has: the arrow (U+2192) it does not.
 */
export function spanText(startsAt: string | Date, endsAt: string | Date, now: number = Date.now()): string {
  const a = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const b = lastMoment(endsAt);
  const mon = (d: Date) => MONTHS[d.getMonth()]!.slice(0, 3);
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameYear && a.getMonth() === b.getMonth()) {
    if (a.getDate() === b.getDate()) return `${b.getDate()} ${mon(b)}${yearOf(b, now)}`;
    return `${a.getDate()}–${b.getDate()} ${mon(b)}${yearOf(b, now)}`;
  }
  return `${a.getDate()} ${mon(a)}${sameYear ? '' : yearOf(a, now)} – ${b.getDate()} ${mon(b)}${yearOf(b, now)}`;
}

/** The same days, spoken: "30 October to 5 November". */
export function spokenSpan(startsAt: string | Date, endsAt: string | Date, now: number = Date.now()): string {
  const a = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const b = lastMoment(endsAt);
  if (daysAhead(b, a.getTime()) === 0) return dateLong(b, now);
  return `${dateLong(a, now)} to ${dateLong(b, now)}`;
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
 * a request that failed or never arrived. The calendar and the stepper
 * keep a host inside the server's dates and goals, so the two refusals
 * about them are now only a sheet left open past midnight.
 */
export function tournamentErrorText(reason: TournamentError, fallback: string): string {
  switch (reason) {
    case 'objectionable':
      return 'That name includes language Sipply does not allow.';
    case 'invalid_dates':
      return 'Those dates no longer work. Pick them again.';
    case 'invalid_goal':
      return 'That goal no longer fits those dates. Pick a smaller one.';
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
/* The rules                                                            */
/* -------------------------------------------------------------------- */

/**
 * The rules in full: the sentence every tournament screen showed until
 * v4.11, word for word, now in the "i" key's sheet. "Please drink
 * responsibly." is part of it on purpose (App Review 1.4.3), and so is
 * "Apple is not a sponsor" (5.3, though nothing of value is ever
 * offered). The cap is the server's (tournament_board's daily_cap).
 */
export function tournamentRulesText(cap: number = TOURNAMENT_LIMITS.dailyCap): string {
  return (
    `Each different drink you post while it runs adds one entry, up to ${cap} a day. ` +
    'Entries are counted, never amounts. No prizes, and Apple is not a sponsor. Please drink responsibly.'
  );
}

/** The rules on the screen itself: the three facts a reviewer looks for, in one line. */
export const RULES_LINE = 'No prizes · Apple is not a sponsor · Drink responsibly';

/** What the Tournaments tab's Friends half counts: its foot sentence until v4.11, now in the same sheet. */
export const FRIENDS_RULE =
  'Friends shows how many different drinks each person has posted, each counted once.';

/** The "i" key: 32 square (a chip's height), 6 of slop above and below for the finger's 44. */
const INFO_KEY = layout.chip;

/**
 * The rules, on every tournament screen, in the scroll body (never only
 * in a collapsed section): RULES_LINE, and the "i" key that opens the
 * whole sentence in a short sheet. Read-only, so the sheet has no key:
 * the scrim, the grabber and VoiceOver's escape close it (AboutSheet's
 * pattern). `friends` adds the Friends board's sentence under the rules,
 * on the Tournaments tab, where the board sits beside them.
 *
 * A row, never text inside another Text: the key is its own control, so
 * VoiceOver reaches the line and then "Tournament rules, button".
 */
export function TournamentRules({
  cap = TOURNAMENT_LIMITS.dailyCap,
  friends = false,
  style,
}: {
  cap?: number;
  friends?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.rulesRow, style]}>
      <Text style={styles.rules}>{RULES_LINE}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Tournament rules"
        accessibilityHint="Opens the full rules"
        style={({ pressed }) => [styles.infoKey, pressed && styles.infoKeyPressed]}>
        <Icon name="info" size={18} color={colors.text} />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Rules">
        <Text selectable style={styles.sheetText}>
          {tournamentRulesText(cap)}
        </Text>
        {friends ? <Text style={[styles.sheetText, styles.sheetMore]}>{FRIENDS_RULE}</Text> : null}
      </BottomSheet>
    </View>
  );
}

/* -------------------------------------------------------------------- */
/* Facts and days                                                       */
/* -------------------------------------------------------------------- */

/** One glyph and its figure or word: "[calendar] 30 Oct – 5 Nov", "[users] 5". */
export type Fact = { key: string; icon: IconName; text: string };

/**
 * A line of facts, each a 14pt glyph beside small muted text, wrapping
 * whole facts (never a fact across a line). Silent: whatever holds it
 * says the sentence the facts stand for, so a VoiceOver user hears "Ends
 * Sunday, 5 people" and never "calendar, 30 Oct".
 */
export function Facts({ items, style }: { items: readonly Fact[]; style?: StyleProp<ViewStyle> }) {
  if (items.length === 0) return null;
  return (
    <View
      style={[styles.facts, style]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {items.map((f) => (
        <View key={f.key} style={styles.fact}>
          <Icon name={f.icon} size={14} color={colors.textMuted} />
          <Text style={styles.factText} numberOfLines={1}>
            {f.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The calendar page's width; three lines of it stand 18 + 34 + 18 over 8 above and below. */
export const DAY_TILE_W = 72;

/**
 * A day as a calendar page: the weekday, the date as a big figure, the
 * month. On the wash, squared, like a ticket's fill. `day` null is a day
 * not picked yet: an en dash where the figure goes. Silent, like Facts:
 * the screen says the dates in words. The figure is capped at 1.3, as
 * every figure in a fixed box is (the rank columns' cap): the page grows
 * to fit it, and the words above and below wrap rather than clip.
 */
export function DayTile({ day, style }: { day: Date | null; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[styles.tile, style]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={styles.tileWord} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {day ? WEEKDAYS[day.getDay()]!.slice(0, 3) : ' '}
      </Text>
      <Text style={[styles.tileFigure, !day && styles.tileEmpty]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {day ? day.getDate() : '–'}
      </Text>
      <Text style={styles.tileWord} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {day ? MONTHS[day.getMonth()]!.slice(0, 3) : ' '}
      </Text>
    </View>
  );
}

/** Two pages and the arrow between them: a tournament's first and last day. */
export function DaySpan({
  first,
  last,
  style,
}: {
  first: Date;
  last: Date | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.span, style]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <DayTile day={first} />
      <Icon name="arrowRight" size={20} color={colors.textMuted} />
      <DayTile day={last} />
    </View>
  );
}

/* -------------------------------------------------------------------- */
/* The row                                                              */
/* -------------------------------------------------------------------- */

/** Which section of the list a tournament belongs in, or null when it is not shown there. */
export type RowKind = 'invite' | 'live' | 'upcoming' | 'finished';

/*
 * Above this text size an invitation's Join and Decline move under its
 * name and line. Beside them, from the accessibility sizes up, the two
 * buttons take most of the row and squeeze the name to a word a line.
 * 1.3 is just under iOS's largest standard size (xxxLarge, 1.35).
 */
const STACK_SCALE = 1.3;

export function rowKind(t: TournamentSummary): RowKind | null {
  if (t.myStatus === 'invited') return t.state === 'finished' ? null : 'invite';
  // Declined (or left): the server no longer lists these, but a stale row never shows.
  if (t.myStatus === 'declined') return null;
  return t.state;
}

/**
 * The second line as VoiceOver says it (the facts line shows it). Names
 * are usernames, without the @. The sentence it was on screen until v4.11.
 */
function spokenLine(
  t: TournamentSummary,
  kind: RowKind,
  myId: string,
  names: { host?: string; winner?: string },
): string {
  const people = peopleCount(t.members);
  if (kind === 'finished') {
    // Won by someone you are blocked with: said as the tournament's page says it, never who.
    if (t.winnerHidden) return 'The winner is hidden';
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
  const goal = t.target === null ? '' : ` · first to ${differentDrinks(t.target)}`;
  /*
   * An invitation also says who it is from: it is a stranger's name
   * otherwise, and who asked is what decides whether to join.
   */
  if (kind === 'invite' && names.host) return `Hosted by @${names.host} · ${when} · ${people}${goal}`;
  return `${when} · ${people}${goal}`;
}

/** The second line as shown: glyphs and figures. */
function factsOf(
  t: TournamentSummary,
  kind: RowKind,
  myId: string,
  names: { host?: string; winner?: string },
): Fact[] {
  if (kind === 'finished') {
    if (t.winnerHidden) return [{ key: 'won', icon: 'trophy', text: 'Hidden' }];
    if (!t.winnerId) return [{ key: 'won', icon: 'trophy', text: 'No winner' }];
    const who = t.winnerId === myId ? 'You' : names.winner ? `@${names.winner}` : null;
    if (!who) return [{ key: 'when', icon: 'calendar', text: spanText(t.startsAt, t.finishedAt ?? t.endsAt) }];
    return [{ key: 'won', icon: 'trophy', text: `${who} · ${t.winnerDistinct ?? 0}` }];
  }
  const facts: Fact[] = [];
  if (kind === 'invite' && names.host) facts.push({ key: 'host', icon: 'addPerson', text: `@${names.host}` });
  facts.push({ key: 'when', icon: 'calendar', text: spanText(t.startsAt, t.endsAt) });
  facts.push({ key: 'people', icon: 'users', text: String(t.members) });
  if (t.target !== null) facts.push({ key: 'goal', icon: 'flag', text: String(t.target) });
  return facts;
}

/**
 * One tournament in the list, min 64, on the page at the gutter (rows
 * are set apart by space, not rules): its name (Archivo, never the
 * marker: it is not a drink's name), the facts line under it (its dates,
 * the people in it and a "First to" goal; who won, once finished), and at
 * the end your place (on now), Join and Decline (an invitation), or a
 * chevron.
 *
 * A row with Join and Decline is not one button: the name and line open
 * the tournament, and each answer is its own control, so VoiceOver can
 * reach all three (a pressable row is one element to it). Every other
 * row is one button, chevron and place included.
 *
 * Your place shows only once you have an entry counted: at nought every
 * rank is the server's tie-break, and "1st" with nothing posted would be
 * a claim the standings do not make. It is the ordinal alone ("2nd");
 * VoiceOver says "you're 2nd".
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
}) {
  const { fontScale } = useWindowDimensions();
  const names = { host: hostName, winner: winnerName };
  const line = spokenLine(t, kind, myId, names);
  const place = kind === 'live' && t.myRank != null && (t.myDistinct ?? 0) > 0 ? ordinal(t.myRank) : null;
  const spoken = `${t.name}, ${line}${place ? `, you're ${place}` : ''}`;

  const text = (
    <View style={styles.text}>
      <Text style={styles.name}>{t.name}</Text>
      <Facts items={factsOf(t, kind, myId, names)} />
    </View>
  );

  if (kind === 'invite') {
    const stacked = fontScale > STACK_SCALE;
    return (
      <View style={[styles.row, stacked && styles.rowStacked]}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint="Opens the tournament"
          style={({ pressed }) => [styles.identity, stacked && styles.identityStacked, pressed && styles.pressed]}>
          {text}
        </Pressable>
        <View style={[styles.answers, stacked && styles.answersStacked]}>
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
        <Icon name="chevronRight" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* The rules: the line beside its key, the key on the line's first line. */
  rulesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  rules: { ...textRole.small, flex: 1, color: colors.textMuted, paddingTop: (INFO_KEY - 18) / 2 },
  /* A squared wash key, the secondary key's fill and press. */
  infoKey: {
    width: INFO_KEY,
    height: INFO_KEY,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
  },
  infoKeyPressed: { backgroundColor: colors.press },
  sheetText: { ...textRole.body, color: colors.text },
  sheetMore: { marginTop: space.md, marginBottom: space.sm },

  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: 2 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  factText: { ...textRole.small, ...tabular, flexShrink: 1, color: colors.textMuted },

  tile: {
    width: DAY_TILE_W,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
  },
  tileWord: { ...textRole.small, color: colors.textMuted },
  tileFigure: { ...textRole.heroFigure, color: colors.text },
  tileEmpty: { color: colors.textMuted },
  span: { flexDirection: 'row', alignItems: 'center', gap: space.sm },

  /* On the page: the gutter each side, 12pt between the parts, the press filling the row edge to edge. */
  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: layout.gutter,
    paddingRight: layout.gutter - space.sm,
  },
  rowButton: { paddingVertical: space.md, paddingRight: layout.gutter },
  identity: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: space.md },
  pressed: { backgroundColor: colors.press },
  text: { flex: 1, gap: 2 },
  name: { ...textRole.bodyStrong, color: colors.text },
  place: { ...textRole.count, color: colors.text },
  answers: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  /* Large text: a column, the answers under the name, in line with its left edge. */
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingRight: layout.gutter },
  identityStacked: { flex: 0, paddingBottom: space.sm },
  answersStacked: { flexWrap: 'wrap', paddingBottom: space.md },
});
