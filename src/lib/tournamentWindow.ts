/* ==================================================================== */
/* A tournament's window and goal: the server's rules, as the host      */
/* sheet's calendar and stepper apply them (specs/v4.11/tournaments.md) */
/*                                                                      */
/* Jan, 30 Oct 2026, of the host sheet: "for the starts part I want you */
/* to add a calendar instead of that … then the user can place from any */
/* start date they want to the final date", and a goal that is "custom  */
/* as well". The chips this replaces (Now, Tomorrow, Next Monday; 3     */
/* days to 30) were valid windows by construction. A calendar is not,   */
/* so this file is what makes every day it lets you tap a window that   */
/* create_tournament (migration 020) accepts, and every goal the        */
/* stepper reaches one it accepts too. No server change: the calendar   */
/* lives inside the rules the server already has.                       */
/*                                                                      */
/* THE SERVER'S RULES (020, create_tournament and the table's checks),  */
/* exactly:                                                             */
/*                                                                      */
/*   starts_at  no earlier than now() - 5 minutes, no later than now()  */
/*              + 30 days                                               */
/*   length     ends_at - starts_at from 1 day to 31 days, inclusive    */
/*              (the tournaments_window check says the same)            */
/*   goal       null (most entries by the end), or 2 to 100 and no more */
/*              than the daily cap (3) x ceil(length in days): a goal   */
/*              the cap makes unreachable is refused (invalid_goal)     */
/*   tz         the host's IANA zone, whose calendar day the cap counts */
/*                                                                      */
/* WHAT A DAY MEANS. The host taps whole days on this phone, in its     */
/* zone, which also becomes the tournament's zone (the cap's day). The  */
/* first day starts at 00:00, or NOW when it is today (a start in the   */
/* past would be refused); the last day counts to its end, so ends_at   */
/* is 00:00 the day after it (ends_at is exclusive). Today to today + 6 */
/* is a week of days, the old "Now, 1 week" default.                    */
/*                                                                      */
/* WHY MILLISECONDS, NOT DAY COUNTS. The server measures an interval    */
/* of real time, and a calendar day is 23 or 25 hours across a clock    */
/* change. So a range that runs 31 days through the November change is  */
/* 31 days and an hour, which the server refuses, and a single day on   */
/* the March change is 23 hours, which it refuses too. Every check here */
/* builds the two instants the phone would send and measures them, so   */
/* the calendar greys out exactly the days the server would refuse.     */
/* specs/v4.11/tournaments.test.mjs runs it against a model of the      */
/* server's checks in zones with and without clock changes.             */
/*                                                                      */
/* Pure: no React, no network, no imports, so the test can run it as it */
/* is.                                                                  */
/* ==================================================================== */

export const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** The server's numbers (migration 020). Each has the last word there; these keep the phone inside them. */
export const WINDOW_RULES = {
  /** A start no later than now + 30 days (create_tournament). */
  startAheadDays: 30,
  /** ends_at - starts_at, at least (create_tournament, tournaments_window). */
  minDays: 1,
  /** ends_at - starts_at, at most. */
  maxDays: 31,
  /** Entries that count per member per day (private.tournament_daily_cap()). */
  dailyCap: 3,
  /** The smallest "First to" goal (tournaments_target). */
  minTarget: 2,
  /** The largest. */
  maxTarget: 100,
} as const;

/*
 * Slack, on the side where the server could see a different "now" than
 * this phone. A future start is a fixed instant, so the latest one keeps
 * an hour clear of now + 30 days (a phone clock running fast, a sheet
 * left open). A start of "now" moves on while the sheet is open, which
 * shortens the window, and so does a start at 00:00 that midnight
 * overtakes before Create is pressed (it is sent as "now" then): any
 * window starting within ten minutes keeps ten minutes over a day.
 */
const START_AHEAD_SLACK_MS = 60 * MINUTE_MS;
const NOW_START_SLACK_MS = 10 * MINUTE_MS;

/** A day, as the calendar holds it: 00:00 on this phone. */
export function dayOf(t: Date | number): Date {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The day `n` calendar days from `day` (00:00, whatever the clock change between). */
export function addDays(day: Date, n: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Calendar days from `a` to `b` (rounded: a clock change makes a 23 or 25 hour day). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((dayOf(b).getTime() - dayOf(a).getTime()) / DAY_MS);
}

/** Days in a range, both ends counted: today to today is 1. */
export function rangeDays(first: Date, last: Date): number {
  return daysBetween(first, last) + 1;
}

/**
 * The two instants a range is sent as: its first day's 00:00, or now when
 * that is today (or, on a sheet left open past midnight, earlier), and the
 * 00:00 after its last day.
 */
export function windowFor(first: Date, last: Date, now: Date = new Date()): { startsAt: Date; endsAt: Date } {
  const startsNow = dayOf(first).getTime() <= dayOf(now).getTime();
  return {
    startsAt: startsNow ? new Date(now.getTime()) : dayOf(first),
    endsAt: addDays(dayOf(last), 1),
  };
}

/** Whether a tournament may start on `day`: today, or a day whose 00:00 is within the server's 30 days. */
export function canStartOn(day: Date, now: Date = new Date()): boolean {
  const d = dayOf(day).getTime();
  const today = dayOf(now).getTime();
  if (d < today) return false;
  if (d === today) return true;
  return d <= now.getTime() + WINDOW_RULES.startAheadDays * DAY_MS - START_AHEAD_SLACK_MS;
}

/** Whether `first` to `last` is a window the server accepts, measured as the instants it would be sent as. */
export function canEndOn(first: Date, last: Date, now: Date = new Date()): boolean {
  if (!canStartOn(first, now) || dayOf(last).getTime() < dayOf(first).getTime()) return false;
  const { startsAt, endsAt } = windowFor(first, last, now);
  const span = endsAt.getTime() - startsAt.getTime();
  const startsSoon = startsAt.getTime() <= now.getTime() + NOW_START_SLACK_MS;
  return (
    span >= WINDOW_RULES.minDays * DAY_MS + (startsSoon ? NOW_START_SLACK_MS : 0) &&
    span <= WINDOW_RULES.maxDays * DAY_MS
  );
}

/** The last day a tournament can start on, from today. */
export function lastStartDay(now: Date = new Date()): Date {
  const today = dayOf(now);
  for (let n = WINDOW_RULES.startAheadDays; n > 0; n--) {
    const d = addDays(today, n);
    if (canStartOn(d, now)) return d;
  }
  return today;
}

/** The furthest day any range can reach: the latest start's longest run. The calendar pages no further. */
export function lastReachableDay(now: Date = new Date()): Date {
  return addDays(lastStartDay(now), WINDOW_RULES.maxDays - 1);
}

/**
 * The biggest "First to" goal a window allows: the daily cap times the
 * days it covers, at most 100. The days are the calendar's (three can
 * count on each, today included however little of it is left) and never
 * more than the server's own ceil(length in days), which a clock change
 * can make one fewer.
 */
export function maxGoal(first: Date, last: Date, now: Date = new Date()): number {
  const { startsAt, endsAt } = windowFor(first, last, now);
  const serverDays = Math.ceil((endsAt.getTime() - startsAt.getTime()) / DAY_MS);
  const days = Math.min(rangeDays(first, last), serverDays);
  return Math.max(0, Math.min(WINDOW_RULES.maxTarget, WINDOW_RULES.dailyCap * days));
}

/** A goal held inside what the window allows, or null when even the smallest is out of reach. */
export function clampGoal(goal: number, max: number): number | null {
  if (max < WINDOW_RULES.minTarget) return null;
  return Math.min(max, Math.max(WINDOW_RULES.minTarget, Math.round(goal)));
}

/* -------------------------------------------------------------------- */
/* Create                                                               */
/* -------------------------------------------------------------------- */

/*
 * WHAT IS SENT IS WHAT WAS SHOWN. The sheet measures its days and the
 * goal's ceiling from the moment it opened; Create measures again, at the
 * press, and mostly the two agree. They part in two ways. A sheet left
 * open past midnight with today as its first day sends its start as now,
 * a day later than the first page shows, and that day's three entries
 * leave the ceiling with it (Puerto Rico: a week opened at 23:50 holds
 * 21, pressed at 00:05 only 18). And a start of now that slides past the
 * hour a clock change takes can lose a day of the server's ceil(days)
 * without midnight (New York, 13 Mar 2027: a week from 22:50 holds 21,
 * from 23:01 only 18). Holding the goal down to fit, or sending the later
 * start, would make a tournament other than the one on screen with
 * nothing said; so Create sends nothing then, and the sheet measures
 * itself again from that moment (caughtUp) for the host to look at and
 * press again.
 */

/**
 * The two instants and the goal Create sends for `range` and the goal the
 * sheet shows (null: most entries), measured at `at`; or null when that
 * is no longer what the sheet shows: a first day midnight has overtaken,
 * or a goal over what the window now allows. The goal is sent as shown,
 * never clamped here.
 */
export function toSend(
  range: { first: Date; last: Date },
  goal: number | null,
  at: Date = new Date(),
): { startsAt: Date; endsAt: Date; target: number | null } | null {
  if (dayOf(range.first).getTime() < dayOf(at).getTime()) return null;
  if (goal !== null && clampGoal(goal, maxGoal(range.first, range.last, at)) !== goal) return null;
  return { ...windowFor(range.first, range.last, at), target: goal };
}

/**
 * The range as a sheet that has caught up with `now` shows it: a first
 * day midnight has overtaken becomes today, and a last day that no longer
 * makes a window the server accepts is let go (the calendar waits for it
 * again). A range still good comes back as it was.
 */
export function caughtUp(range: DayRange, now: Date = new Date()): DayRange {
  const today = dayOf(now);
  const first = dayOf(range.first).getTime() < today.getTime() ? today : dayOf(range.first);
  return { first, last: range.last && canEndOn(first, range.last, now) ? dayOf(range.last) : null };
}

/* -------------------------------------------------------------------- */
/* The calendar's selection                                             */
/* -------------------------------------------------------------------- */

/** The days picked: `last` is null between the first tap and the second. */
export type DayRange = { first: Date; last: Date | null };

/** Today to today + 6: a week of days, starting now (the old "Now" and "1 week"). */
export function defaultRange(now: Date = new Date()): DayRange {
  const today = dayOf(now);
  return { first: today, last: addDays(today, 6) };
}

/**
 * A tap on `day`. Waiting for the last day, a day from the first on that
 * makes a window the server accepts ends the range; anything else that
 * can start one (a day before the first, or any day once the range is
 * whole) starts again from it, waiting for its last day. A day that can
 * do neither changes nothing (the calendar draws it disabled).
 */
export function pickDay(range: DayRange, day: Date, now: Date = new Date()): DayRange {
  const d = dayOf(day);
  if (range.last === null && d.getTime() >= dayOf(range.first).getTime() && canEndOn(range.first, d, now)) {
    return { first: dayOf(range.first), last: d };
  }
  if (canStartOn(d, now)) return { first: d, last: null };
  return range;
}

/** Whether a tap on `day` does anything: what the calendar draws enabled. */
export function canPick(range: DayRange, day: Date, now: Date = new Date()): boolean {
  if (range.last === null && dayOf(day).getTime() >= dayOf(range.first).getTime() && canEndOn(range.first, day, now)) {
    return true;
  }
  return canStartOn(day, now);
}

/**
 * A month as the calendar draws it: weeks of seven, Sunday first (iOS's
 * own calendar in the US), each slot a day of that month or null.
 */
export function monthWeeks(year: number, month: number): (Date | null)[][] {
  const lead = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const slots: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (slots.length % 7 !== 0) slots.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
  return weeks;
}
