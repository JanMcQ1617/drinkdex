import * as Linking from 'expo-linking';
import type { Href } from 'expo-router';
import { Clipboard, Share } from 'react-native';

import type { MyTournamentRow } from '@/lib/database.types';
import { containsObjectionable, isObjectionableError } from '@/lib/moderation';
import { isMissingFunction } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import {
  type CodeJoin,
  type CodeLookup,
  isJoinCode,
  JOIN_PATH,
  joinCodeMessage,
  probeAnswer,
  readJoin,
  readLookup,
  troubleOf,
} from '@/lib/tournamentCode';
import { DAY_MS, WINDOW_RULES } from '@/lib/tournamentWindow';
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
/* A shared log of who posts the most DIFFERENT Dex entries between two */
/* dates. Each different drink a member posts during the tournament     */
/* counts once, as one entry, at most three a day; amounts are never    */
/* counted (App Review 1.4.3). The server owns every rule and every     */
/* figure: this file calls its functions and maps their errors for the  */
/* screens.                                                             */
/*                                                                      */
/* No flag. When migration 020 is missing the functions are too, and     */
/* fetchMyTournaments says so with null, which switches the feature off. */
/* ==================================================================== */

/**
 * The server's rules, for the screens' limits and copy. The server has the
 * last word on each. The window's and the goal's live in tournamentWindow
 * (pure, so its test runs them as they are); these repeat the two the
 * screens read most.
 */
export const TOURNAMENT_LIMITS = {
  nameMax: 40,
  maxDays: WINDOW_RULES.maxDays,
  /** Host included, so a host can invite 49. */
  maxMembers: 50,
  /** The goal stepper's quick picks (the host sheet's goal chips until v4.11). */
  targetChoices: [5, 10, 20],
  /** Entries that count per member per day (private.tournament_daily_cap()). */
  dailyCap: WINDOW_RULES.dailyCap,
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
/** Join with code (v4.12), with the code filled in when a link brought one. */
export const joinCodeHref = (code?: string) =>
  ({ pathname: '/tournaments/join', params: code ? { code } : {} }) as unknown as Href;
/*
 * The Tournaments TAB (v4.7, app/(tabs)/board.tsx), not the list above:
 * the tab lives at /board so it never collides with the pushed /tournaments
 * stack. Every tournamentsHref() link (Activity's invitations, a tournament
 * page's cold Back, the tab's own "All tournaments" line) still opens the
 * full list, which is where invitations are answered.
 */
export const boardHref = () => '/board' as Href;

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
/* A calendar since v4.11 (specs/v4.11/tournaments.md): the host taps a */
/* first and a last day, and lib/tournamentWindow turns them into the   */
/* two instants sent here and greys out every day that would make a     */
/* window the server refuses. No date-picker module: the calendar is    */
/* drawn in JavaScript (components/tournaments/RangeCalendar).          */
/* -------------------------------------------------------------------- */

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
  const winnerId = str(r.winner_id);
  const winnerDistinct = num(r.winner_distinct);
  /*
   * my_tournaments() nulls winner_id for a winner you are blocked with but
   * reads winner_distinct from the stored winner, so a finished row with a
   * count and no winner is a hidden winner. (No winner at all, or a winner
   * whose account is gone, leaves both null.) The count is dropped with
   * the name, as tournament_board shows neither.
   */
  const winnerHidden = s === 'finished' && winnerId === null && winnerDistinct !== null;
  return {
    id,
    name,
    hostId,
    startsAt,
    endsAt,
    target: num(r.target),
    finishedAt: str(r.finished_at),
    winnerId,
    winnerDistinct: winnerId === null ? null : winnerDistinct,
    winnerHidden,
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

/**
 * Hosts a tournament and invites the people you follow that you picked,
 * if any. Resolves to its id and its join code.
 *
 * The name goes through the content filter here first (the server has the
 * last word), and the dates and goal are checked against the same rules as
 * create_tournament, so a refusal the phone can see costs no round trip.
 * An empty or over-long name is 'failed': the host sheet never sends one.
 * The phone's time zone becomes the tournament's day for the daily cap.
 *
 * NOBODY INVITED IS FINE SINCE 028 (v4.12): the code is the way in. The
 * server makes it (the column's default) and create_tournament still
 * returns only the id, which build 37 reads, so the code is read from the
 * row straight after, as the host can. Null when that read fails or 028
 * is missing: the sheet then opens the tournament as it always did. A
 * server without 028 refuses nobody invited with no_invitees, which the
 * sheet reads as "no codes here" (lib/tournamentCode's createSaysNoCodes).
 */
export async function createTournament(input: {
  name: string;
  startsAt: Date;
  endsAt: Date;
  target: number | null;
  invitees: string[];
}): Promise<Result<{ id: string; joinCode: string | null }>> {
  const name = cleanTournamentName(input.name);
  if (name.length === 0 || name.length > TOURNAMENT_LIMITS.nameMax) return { ok: false, reason: 'failed' };
  if (containsObjectionable(name)) return { ok: false, reason: 'objectionable' };

  /*
   * A start of today is "now", worked out as Create is pressed, and a few
   * moments pass before this line: a start already in the past moves up
   * to now, so the server never reads it as one (it refuses a start more
   * than five minutes old). The end does not move with it: it is a
   * calendar day's boundary, the 00:00 after the last day the host
   * picked, and a window that this makes too short is refused below.
   */
  const startsAt = input.startsAt.getTime() < Date.now() ? new Date() : input.startsAt;
  const endsAt = input.endsAt;

  const span = endsAt.getTime() - startsAt.getTime();
  if (!(span >= DAY_MS && span <= TOURNAMENT_LIMITS.maxDays * DAY_MS)) return { ok: false, reason: 'invalid_dates' };
  if (
    input.target !== null &&
    (input.target < WINDOW_RULES.minTarget ||
      input.target > WINDOW_RULES.maxTarget ||
      input.target > WINDOW_RULES.dailyCap * Math.ceil(span / DAY_MS))
  ) {
    return { ok: false, reason: 'invalid_goal' };
  }

  const invitees = [...new Set(input.invitees)].slice(0, TOURNAMENT_LIMITS.maxMembers - 1);

  const made = await call(
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
  if (!made.ok) return made;
  return { ok: true, value: { id: made.value, joinCode: await fetchJoinCode(made.value) } };
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

/* -------------------------------------------------------------------- */
/* Join codes (v4.12, migration 028, specs/v4.12/join-codes.md)         */
/*                                                                      */
/* Every tournament has a code from the moment it is made; whoever is   */
/* in it may share it, and anyone with it joins from Join with code.    */
/* What a code is, how a typed one is read and how the answers are      */
/* checked live in lib/tournamentCode, which imports nothing so its     */
/* test can run it. These are the calls.                                */
/*                                                                      */
/* WITHOUT 028 nothing here errors: the code is null (no column), the   */
/* probe says false and the lookups 'unsupported' (no function), and    */
/* the screens leave codes out or say they are not here yet.            */
/* -------------------------------------------------------------------- */

/**
 * A tournament's code, read from its row as tournaments_read lets anyone
 * in it or asked (the host included) read it. Null when there is none to
 * show: 028 missing (42703, no such column), a tournament that finished
 * before 028, a failed read, or anything that is not a code.
 */
export async function fetchJoinCode(id: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('tournaments').select('join_code').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return typeof data.join_code === 'string' && isJoinCode(data.join_code) ? data.join_code : null;
  } catch {
    return null;
  }
}

/**
 * Whether the server has codes: tournament_by_code with no code, which
 * 028 answers as a wrong code without counting it against anyone. True,
 * false (028 missing) or null (no answer: offline, or anything else).
 */
export async function probeJoinCodes(): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.rpc('tournament_by_code', { p_code: '' });
    return probeAnswer(error, data);
  } catch {
    return null;
  }
}

/** The tournament a code opens, as Join with code shows it before anyone joins. Every wrong code counts against the hour's twenty. */
export async function lookupJoinCode(code: string): Promise<CodeLookup> {
  try {
    const { data, error } = await supabase.rpc('tournament_by_code', { p_code: code });
    if (error) return { kind: troubleOf(error) };
    return readLookup(data);
  } catch (e) {
    return { kind: troubleOf(e) };
  }
}

/** Joins by the code: the tournament's id once in, or why not. The server checks everything again. */
export async function joinWithCode(code: string): Promise<CodeJoin> {
  try {
    const { data, error } = await supabase.rpc('join_tournament_with_code', { p_code: code });
    if (error) return { kind: troubleOf(error) };
    return readJoin(data);
  } catch (e) {
    return { kind: troubleOf(e) };
  }
}

/** The link that opens Join with code with this code in it: drinkdex://join/ABC234 (app/+native-intent). */
export const joinCodeUrl = (code: string) => Linking.createURL(`${JOIN_PATH}/${code}`);

/**
 * The share sheet, with the code and its link (lib/tournamentCode's
 * joinCodeMessage). Fire and forget, as shareProfile is: a dismissed
 * sheet is not an error.
 */
export function shareJoinCode(p: { name: string; code: string; hosting: boolean }): void {
  Share.share({ message: joinCodeMessage({ ...p, url: joinCodeUrl(p.code) }) }).catch(() => {
    /* dismissed, or unsupported off-device */
  });
}

/**
 * Puts the code on the clipboard; false when it could not.
 *
 * React Native's own Clipboard, which is still in 0.86's core
 * (RCTClipboard is one of its CoreModules, so it is in the binary
 * already) and is marked for removal in a later release: no new package
 * or native module for one key. Reached only here, so the day it goes
 * this returns false and the caller falls back to the share sheet, which
 * has its own Copy. In development React Native warns once that it has
 * moved; release builds show nothing.
 */
export function copyJoinCode(code: string): boolean {
  try {
    Clipboard.setString(code);
    return true;
  } catch {
    return false;
  }
}
