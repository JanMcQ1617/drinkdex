import type { Href } from 'expo-router';

import type { MyTournamentRow } from '@/lib/database.types';
import { containsObjectionable, isObjectionableError } from '@/lib/moderation';
import { isMissingFunction } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type {
  Standing,
  TournamentBoard,
  TournamentRole,
  TournamentState,
  TournamentSummary,
} from '@/types';

/* ==================================================================== */
/* Tournaments (spec v3.1 §11, migration 020)                           */
/*                                                                      */
/* Friends compete to try the most DIFFERENT drinks. Each different      */
/* drink a member posts during the tournament counts once, at most three */
/* new ones a day; how much anyone drinks is never counted (App Review   */
/* 1.4.3). The server owns every rule and every figure: this file calls  */
/* its functions and maps their errors for the screens.                  */
/*                                                                      */
/* No flag. When migration 020 is missing the functions are too, and     */
/* fetchMyTournaments says so with null, which switches the feature off. */
/* ==================================================================== */

/** The server's rules, for the screens' limits and copy. The server has the last word on each. */
export const TOURNAMENT_LIMITS = {
  nameMax: 40,
  maxDays: 31,
  /** Host included, so a host can invite 49. */
  maxMembers: 50,
  targetChoices: [5, 10, 20],
  /** New drinks that count per member per day (private.tournament_daily_cap()). */
  dailyCap: 3,
} as const;

/*
 * Typed-route escapes, so a package can link to these screens before their
 * route files exist (spec v3.1 §1.2.6). Once the routes are in the tree the
 * casts are no-ops. The object form goes through unknown: until the route
 * exists TypeScript finds no Href member it overlaps with (it does for a
 * bare string), and the cast would not compile.
 */
export const tournamentsHref = () => '/tournaments' as Href;
export const tournamentHref = (id: string) =>
  ({ pathname: '/tournaments/[id]', params: { id } }) as unknown as Href;
export const newTournamentHref = () => '/tournaments/new' as Href;

/**
 * What can go wrong, in the screens' terms. The server raises the first
 * eight as P0001 messages (too_many is its too_many_tournaments, and
 * objectionable its objectionable_content); 'offline' is a request that
 * never reached it; 'failed' is everything else.
 */
export type TournamentError =
  | 'objectionable'
  | 'invalid_dates'
  | 'invalid_goal'
  | 'too_many'
  | 'no_invitees'
  | 'not_allowed'
  | 'finished'
  | 'not_found'
  | 'offline'
  | 'failed';

export type Result<T> = { ok: true; value: T } | { ok: false; reason: TournamentError };

/* -------------------------------------------------------------------- */
/* Dates                                                                */
/*                                                                      */
/* Chips, not a calendar: there is no date-picker module in the binary  */
/* and none may be added, and every chip is a valid window by           */
/* construction (a start within 30 days, a length of 1 to 31 days).     */
/* -------------------------------------------------------------------- */

export type TournamentStart = 'now' | 'tomorrow' | 'nextMonday';
export type TournamentLength = '3d' | '1w' | '2w' | '30d';

/** Days in each length chip. */
export const LENGTH_DAYS: Record<TournamentLength, number> = { '3d': 3, '1w': 7, '2w': 14, '30d': 30 };

/**
 * The longest goal a length allows: dailyCap × days, since at most three
 * new drinks count a day ("First to 10" cannot be won in 3 days). The host
 * sheet greys out goal chips above it; create_tournament refuses them with
 * invalid_goal.
 */
export function maxGoalFor(length: TournamentLength): number {
  return TOURNAMENT_LIMITS.dailyCap * LENGTH_DAYS[length];
}

/**
 * When a start chip starts, in the phone's time zone: now, tomorrow at
 * 00:00, or the next Monday at 00:00 (always ahead: on a Monday it is the
 * Monday after).
 */
export function startChoice(kind: TournamentStart, now: Date = new Date()): Date {
  if (kind === 'now') return new Date(now.getTime());
  const day = now.getDay(); // 0 Sunday … 6 Saturday
  const ahead = kind === 'tomorrow' ? 1 : (1 - day + 7) % 7 || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
}

/**
 * The (exclusive) end of a tournament that starts at `start` and runs for a
 * length chip. Calendar days in the phone's zone, so a tournament that
 * starts at midnight ends at midnight across a clock change.
 */
export function endFor(start: Date, length: TournamentLength): Date {
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + LENGTH_DAYS[length],
    start.getHours(),
    start.getMinutes(),
    start.getSeconds(),
    start.getMilliseconds(),
  );
}

/** The phone's IANA zone, which becomes the tournament's day for the daily cap. */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/* -------------------------------------------------------------------- */
/* Errors                                                               */
/* -------------------------------------------------------------------- */

const SERVER_REASONS: Record<string, TournamentError> = {
  not_found: 'not_found',
  not_allowed: 'not_allowed',
  finished: 'finished',
  invalid_dates: 'invalid_dates',
  invalid_goal: 'invalid_goal',
  too_many_tournaments: 'too_many',
  no_invitees: 'no_invitees',
};

/** A failed call, in the screens' terms. postgrest-js reports offline as "TypeError: Network request failed". */
function reasonOf(error: unknown): TournamentError {
  if (isObjectionableError(error)) return 'objectionable';
  const message =
    typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';
  const known = Object.prototype.hasOwnProperty.call(SERVER_REASONS, message) ? SERVER_REASONS[message] : undefined;
  if (known) return known;
  if (/network|fetch|timed? ?out/i.test(message)) return 'offline';
  return 'failed';
}

/** Runs one RPC and turns its answer into a Result. A function that is missing reads as not_found. */
async function call<T>(
  run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  read: (data: unknown) => T | null,
): Promise<Result<T>> {
  try {
    const { data, error } = await run();
    if (error) return { ok: false, reason: isMissingFunction(error) ? 'not_found' : reasonOf(error) };
    const value = read(data);
    return value === null ? { ok: false, reason: 'failed' } : { ok: true, value };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

const VOID = () => undefined as void;

/* -------------------------------------------------------------------- */
/* Shapes                                                               */
/*                                                                      */
/* Checked, not trusted: tournament_board returns jsonb, which no type   */
/* describes, and my_tournaments' rows are hand-typed.                   */
/* -------------------------------------------------------------------- */

const STATES: readonly TournamentState[] = ['upcoming', 'live', 'finished'];
const ROLES: readonly TournamentRole[] = ['host', 'invited', 'accepted', 'declined'];

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const state = (v: unknown): TournamentState | null =>
  STATES.includes(v as TournamentState) ? (v as TournamentState) : null;
const role = (v: unknown): TournamentRole | null => (ROLES.includes(v as TournamentRole) ? (v as TournamentRole) : null);

function toSummary(r: MyTournamentRow): TournamentSummary | null {
  const id = str(r.id);
  const name = str(r.name);
  const hostId = str(r.host_id);
  const startsAt = str(r.starts_at);
  const endsAt = str(r.ends_at);
  const s = state(r.state);
  const myStatus = role(r.my_status);
  if (!id || name === null || !hostId || !startsAt || !endsAt || !s || !myStatus) return null;
  return {
    id,
    name,
    hostId,
    startsAt,
    endsAt,
    target: num(r.target),
    finishedAt: str(r.finished_at),
    winnerId: str(r.winner_id),
    winnerDistinct: num(r.winner_distinct),
    state: s,
    myStatus,
    members: num(r.members) ?? 0,
    myRank: num(r.my_rank),
    myDistinct: num(r.my_distinct),
  };
}

function toStanding(raw: unknown): Standing | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.user_id);
  const rank = num(r.rank);
  if (!userId || rank === null) return null;
  return {
    userId,
    distinct: num(r.distinct) ?? 0,
    today: num(r.today) ?? 0,
    reachedAt: str(r.reached_at),
    rank,
  };
}

function toBoard(raw: unknown): TournamentBoard | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name);
  const hostId = str(r.host_id);
  const startsAt = str(r.starts_at);
  const endsAt = str(r.ends_at);
  const s = state(r.state);
  if (!id || name === null || !hostId || !startsAt || !endsAt || !s) return null;
  const standings = (Array.isArray(r.standings) ? r.standings : [])
    .map(toStanding)
    .filter((x): x is Standing => x !== null)
    .sort((a, b) => a.rank - b.rank);
  const invited = (Array.isArray(r.invited) ? r.invited : []).filter(
    (x): x is string => typeof x === 'string',
  );
  return {
    id,
    name,
    hostId,
    startsAt,
    endsAt,
    target: num(r.target),
    endedAt: str(r.ended_at),
    finishedAt: str(r.finished_at),
    winnerId: str(r.winner_id),
    winnerHidden: r.winner_hidden === true,
    state: s,
    // Only the host, an invitee or a member can read a board; anything
    // else is shown as someone no longer in it.
    myStatus: role(r.my_status) ?? 'declined',
    dailyCap: num(r.daily_cap) ?? TOURNAMENT_LIMITS.dailyCap,
    standings,
    invited,
  };
}

/* -------------------------------------------------------------------- */
/* Reads                                                                */
/* -------------------------------------------------------------------- */

/**
 * Every tournament you host or are invited to or in, newest start first.
 * Null when migration 020 is missing (no my_tournaments function): the
 * feature is off, and the trophy and screens hide. Throws on any other
 * failure, so the store can keep what it had.
 */
export async function fetchMyTournaments(): Promise<TournamentSummary[] | null> {
  const { data, error } = await supabase.rpc('my_tournaments');
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  return (data ?? []).map(toSummary).filter((t): t is TournamentSummary => t !== null);
}

/** One tournament with its live (or frozen) standings. not_found once it is deleted, or you left it. */
export function fetchBoard(id: string): Promise<Result<TournamentBoard>> {
  return call(() => supabase.rpc('tournament_board', { t: id }), toBoard);
}

/* -------------------------------------------------------------------- */
/* Writes                                                               */
/* -------------------------------------------------------------------- */

/** One line, single spaces, no ends: the shape the server's name check wants. */
export function cleanTournamentName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hosts a tournament and invites people you follow. Resolves to its id.
 *
 * The name goes through the content filter here first (the server has the
 * last word), and the dates and goal are checked against the same rules as
 * create_tournament, so a refusal the phone can see costs no round trip.
 * An empty or over-long name is 'failed': the host sheet never sends one.
 * The phone's time zone becomes the tournament's day for the daily cap.
 */
export async function createTournament(input: {
  name: string;
  startsAt: Date;
  endsAt: Date;
  target: number | null;
  invitees: string[];
}): Promise<Result<string>> {
  const name = cleanTournamentName(input.name);
  if (name.length === 0 || name.length > TOURNAMENT_LIMITS.nameMax) return { ok: false, reason: 'failed' };
  if (containsObjectionable(name)) return { ok: false, reason: 'objectionable' };

  /*
   * A "Now" start is computed when the chip is picked; a host who then
   * spends more than five minutes on the name and the invitations would be
   * refused as invalid_dates. A start already in the past means "now", so
   * both ends move up together and the length stays what was chosen.
   */
  const late = Date.now() - input.startsAt.getTime();
  const startsAt = late > 0 ? new Date(input.startsAt.getTime() + late) : input.startsAt;
  const endsAt = late > 0 ? new Date(input.endsAt.getTime() + late) : input.endsAt;

  const span = endsAt.getTime() - startsAt.getTime();
  if (!(span >= DAY_MS && span <= TOURNAMENT_LIMITS.maxDays * DAY_MS)) return { ok: false, reason: 'invalid_dates' };
  if (
    input.target !== null &&
    (input.target < 2 || input.target > 100 || input.target > TOURNAMENT_LIMITS.dailyCap * Math.ceil(span / DAY_MS))
  ) {
    return { ok: false, reason: 'invalid_goal' };
  }

  const invitees = [...new Set(input.invitees)].slice(0, TOURNAMENT_LIMITS.maxMembers - 1);
  if (invitees.length === 0) return { ok: false, reason: 'no_invitees' };

  return call(
    () =>
      supabase.rpc('create_tournament', {
        p_name: name,
        p_starts_at: startsAt.toISOString(),
        p_ends_at: endsAt.toISOString(),
        p_target: input.target,
        p_tz: deviceTimeZone(),
        p_invitees: invitees,
      }),
    str,
  );
}

/** Host only, before it finishes. Resolves to how many were invited (0 when none of them could be). */
export function invite(id: string, people: string[]): Promise<Result<number>> {
  return call(() => supabase.rpc('invite_to_tournament', { t: id, people: [...new Set(people)] }), num);
}

/** Join or decline an invitation. Declining is final for that tournament. */
export function respond(id: string, accept: boolean): Promise<Result<void>> {
  return call(() => supabase.rpc('respond_to_tournament', { t: id, accept }), VOID);
}

/** A member who is not the host leaves: their drinks stop counting and they cannot rejoin. */
export function leave(id: string): Promise<Result<void>> {
  return call(() => supabase.rpc('leave_tournament', { t: id }), VOID);
}

/** Host only, while it is on: standings freeze now and whoever is ahead wins. */
export function endTournament(id: string): Promise<Result<void>> {
  return call(() => supabase.rpc('end_tournament', { t: id }), VOID);
}

/** Host only: it disappears for everyone in it. */
export function deleteTournament(id: string): Promise<Result<void>> {
  return call(() => supabase.rpc('delete_tournament', { t: id }), VOID);
}
