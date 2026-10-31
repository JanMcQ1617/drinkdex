/* ==================================================================== */
/* Tournament join codes: the pure half (v4.12, specs/v4.12/join-codes.md) */
/*                                                                      */
/* Jan, 30 Oct 2026: "create the tournament and give me a code for      */
/* other people to join instead of having to invite my friends before   */
/* creating the tournament." Migration 028 gives every tournament a     */
/* code when it is made; the host shares it, anyone with it joins from  */
/* the Tournaments tab's Join with code.                                */
/*                                                                      */
/* THIS FILE IMPORTS NOTHING, on purpose: specs/v4.12/join-codes.test   */
/* runs it as it is, beside the migration, so the alphabet, what a typed */
/* or pasted code becomes, how the server's answers are read and what   */
/* the screens do while 028 is missing are checked without a device.    */
/* The calls themselves are lib/tournaments'.                            */
/*                                                                      */
/* THE ALPHABET is 028's, character for character: the figures 2 to 9  */
/* and the letters without I, L and O. Nothing on the screen can be     */
/* read as something else (0 and O, 1, I and L), so nobody reading one  */
/* out has to spell it twice. Six of the 31: 887 million codes.          */
/*                                                                      */
/* CASE AND SPACING NEVER MATTER. What is typed is upper-cased and      */
/* anything outside the 31 dropped, so "abc 234" is ABC234, as the      */
/* server's own tournament_code_norm reads it. A paste of the whole     */
/* share message, or of its link, gives the code it carries.            */
/* ==================================================================== */

/** 028's 31, in its order (private.new_tournament_code's `abc`). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

/** The first path segment of a join link, drinkdex://join/<code>. app/+native-intent keys on it. */
export const JOIN_PATH = 'join';

const WHOLE = /^[2-9A-HJKMNP-Z]{6}$/;
const OUTSIDE = /[^2-9A-HJKMNP-Z]/g;

/** A whole code, as stored: six of the 31, upper case. */
export function isJoinCode(s: string): boolean {
  return WHOLE.test(s);
}

/**
 * What the six boxes hold after a keystroke or a paste. `raw` is the
 * field's new text, `prev` what it held before.
 *
 * A paste that carries a code (the share message's "code ABC234", or its
 * link's join/ABC234) gives that code, whatever else came with it. A
 * paste into boxes that were already filled replaces them, rather than
 * being cut off behind them. Anything else is upper-cased, everything
 * outside the 31 dropped, and the first six kept: a typed O, 0, 1, I or L
 * simply does not land, which says it is not one of the characters.
 */
export function typedCode(raw: string, prev = ''): string {
  const up = raw.toUpperCase();
  const carried = /JOIN\/([0-9A-Z]{6})(?![0-9A-Z])/.exec(up) ?? /\bCODE\W{0,3}([0-9A-Z]{6})(?![0-9A-Z])/.exec(up);
  if (carried && isJoinCode(carried[1]!)) return carried[1]!;
  if (prev && raw.length > prev.length + 1 && raw.startsWith(prev)) {
    const pasted = typedCode(raw.slice(prev.length));
    if (pasted.length === CODE_LENGTH) return pasted;
  }
  return up.replace(OUTSIDE, '').slice(0, CODE_LENGTH);
}

/**
 * The code in a join link's second segment, or null when there is none.
 * Never throws: app/+native-intent calls it inside the router's linking
 * setup, where an exception takes the app down.
 */
export function codeFromLink(segment: string): string | null {
  let s = segment;
  try {
    s = decodeURIComponent(segment);
  } catch {
    /* a stray % : read it as typed */
  }
  const code = typedCode(s);
  return isJoinCode(code) ? code : null;
}

/** "A B C 2 3 4": a code as VoiceOver should say it, one character at a time. */
export function spokenCode(code: string): string {
  return code.split('').join(' ');
}

/**
 * The text the Share key sends. Short, and honest about the link as
 * buildInviteMessage is: drinkdex:// opens anything only on a phone that
 * has the app, so the code comes first and stands on its own. "my" from
 * the host, "our" from anyone else in it.
 */
export function joinCodeMessage(p: { name: string; code: string; url: string; hosting: boolean }): string {
  return `Join ${p.hosting ? 'my' : 'our'} Sipply tournament "${p.name}": code ${p.code}\nWith the app, this link opens it: ${p.url}`;
}

/* -------------------------------------------------------------------- */
/* The server's answers                                                 */
/*                                                                      */
/* Both of 028's RPCs answer { result: <word> } rather than raising (a  */
/* raise would roll back the wrong guess it counts). Checked, not       */
/* trusted: anything unexpected is 'failed'.                            */
/* -------------------------------------------------------------------- */

/** What the Join with code screen shows before anyone joins: the invitation, not the tournament. */
export type CodePreview = {
  id: string;
  name: string;
  /** ISO */
  startsAt: string;
  /** ISO, exclusive. */
  endsAt: string;
  target: number | null;
  /** Never 'finished': a finished one answers 'finished' and no preview. */
  state: 'upcoming' | 'live';
  /** Accepted, the host included. */
  members: number;
  host: { id: string; username: string; displayName: string; accent: string; avatarPath: string | null };
};

/** What can go wrong with a code, in the screens' terms. 'unsupported' is 028 missing. */
export type CodeTrouble =
  | 'not_found'
  | 'finished'
  | 'full'
  | 'not_allowed'
  | 'limited'
  | 'unsupported'
  | 'offline'
  | 'failed';

/** tournament_by_code: 'open' is the server's 'ok', a tournament the caller may join. */
export type CodeLookup =
  | { kind: 'open' | 'member' | 'full'; preview: CodePreview }
  | { kind: Exclude<CodeTrouble, 'full'> };

/** join_tournament_with_code. */
export type CodeJoin = { kind: 'joined' | 'member'; id: string } | { kind: CodeTrouble };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARE: readonly string[] = ['not_found', 'finished', 'not_allowed', 'limited'];

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readPreview(r: Record<string, unknown>): CodePreview | null {
  const id = str(r.id);
  const name = str(r.name);
  const startsAt = str(r.starts_at);
  const endsAt = str(r.ends_at);
  const state = r.state === 'upcoming' || r.state === 'live' ? r.state : null;
  const h = obj(r.host);
  const hostId = h ? str(h.id) : null;
  const username = h ? str(h.username) : null;
  if (!id || !UUID.test(id) || name === null || !startsAt || !endsAt || !state || !h || !hostId || !username) {
    return null;
  }
  return {
    id: id.toLowerCase(),
    name,
    startsAt,
    endsAt,
    target: num(r.target),
    state,
    members: num(r.members) ?? 1,
    host: {
      id: hostId.toLowerCase(),
      username,
      displayName: str(h.display_name) ?? username,
      accent: str(h.accent) ?? '',
      avatarPath: str(h.avatar_path),
    },
  };
}

/** tournament_by_code's answer. */
export function readLookup(data: unknown): CodeLookup {
  const r = obj(data);
  const result = r ? r.result : null;
  if (r && (result === 'ok' || result === 'member' || result === 'full')) {
    const preview = readPreview(r);
    if (!preview) return { kind: 'failed' };
    return { kind: result === 'ok' ? 'open' : result, preview };
  }
  if (typeof result === 'string' && BARE.includes(result)) {
    return { kind: result as 'not_found' | 'finished' | 'not_allowed' | 'limited' };
  }
  return { kind: 'failed' };
}

/** join_tournament_with_code's answer. */
export function readJoin(data: unknown): CodeJoin {
  const r = obj(data);
  const result = r ? r.result : null;
  if (r && (result === 'joined' || result === 'member')) {
    const id = str(r.id);
    return id && UUID.test(id) ? { kind: result, id: id.toLowerCase() } : { kind: 'failed' };
  }
  if (typeof result === 'string' && (BARE.includes(result) || result === 'full')) {
    return { kind: result as CodeTrouble };
  }
  return { kind: 'failed' };
}

/**
 * A call that did not answer: 028 missing (PostgREST's PGRST202, or
 * Postgres's 42883, as lib/social's isMissingFunction reads them), a
 * request that never arrived (postgrest-js says "Network request
 * failed"), or anything else.
 */
export function troubleOf(error: unknown): 'unsupported' | 'offline' | 'failed' {
  const e = obj(error);
  const code = e ? str(e.code) : null;
  if (code === 'PGRST202' || code === '42883') return 'unsupported';
  const message = e ? (str(e.message) ?? '') : error instanceof Error ? error.message : '';
  if (/network|fetch|timed? ?out/i.test(message)) return 'offline';
  return 'failed';
}

/* -------------------------------------------------------------------- */
/* While 028 is missing                                                 */
/* -------------------------------------------------------------------- */

/**
 * The host sheet's probe (tournament_by_code with no code, which 028
 * answers as a wrong code without counting it): true, the server has
 * codes; false, it has not (028 is missing); null, the probe did not get
 * an answer, so nothing is known yet.
 */
export function probeAnswer(error: unknown, data: unknown): boolean | null {
  if (error) return troubleOf(error) === 'unsupported' ? false : null;
  return obj(data) && typeof obj(data)!.result === 'string' ? true : null;
}

/**
 * Whether Create needs someone invited: only once the server has said it
 * has no codes, when a tournament with nobody asked would have no way in
 * and 020's create_tournament refuses it (no_invitees). Unknown is not
 * no: the sheet does not hold everyone back for a probe that has not
 * answered, and a refusal says so (createSaysNoCodes).
 */
export function inviteRequired(codes: boolean | null): boolean {
  return codes === false;
}

/**
 * A no_invitees for a tournament with nobody invited can only be a
 * server without codes (028 makes nobody invited fine): the sheet then
 * asks for someone, as it did before codes.
 */
export function createSaysNoCodes(reason: string, invited: number): boolean {
  return reason === 'no_invitees' && invited === 0;
}

/* -------------------------------------------------------------------- */
/* Words                                                                */
/* -------------------------------------------------------------------- */

/** What a code that did not work says, in few words, under the boxes. */
export function codeTroubleText(kind: CodeTrouble): string {
  switch (kind) {
    case 'not_found':
      return 'Wrong code. Check it and try again.';
    case 'finished':
      return 'That tournament has finished.';
    case 'full':
      return 'That tournament is full.';
    case 'not_allowed':
      return "You can't join that tournament.";
    case 'limited':
      // Not "in an hour": 028 counts this clock hour and the one before, so the wait runs up to two.
      return 'Too many wrong codes. Try again later.';
    case 'unsupported':
      return 'Joining with a code is not here yet.';
    case 'offline':
      return 'Could not check the code. Check your connection.';
    case 'failed':
      return 'Could not check the code. Try again.';
  }
}
