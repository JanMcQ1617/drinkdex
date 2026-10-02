import { supabase } from '@/lib/supabase';

/* ==================================================================== */
/* Reporting and blocking                                               */
/*                                                                      */
/* The hiding itself is NOT done here. Blocked content is filtered by    */
/* RLS (migration 006), so it disappears from every query at once and    */
/* cannot be requested back by a client that chooses not to filter.      */
/* This module only records the block and lets the UI reflect it.        */
/* ==================================================================== */

/** The reasons the reports table will accept — see report_reason_known. */
export const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or scam' },
  { key: 'harassment', label: 'Harassment or hate' },
  { key: 'nudity', label: 'Nudity or sexual content' },
  { key: 'violence', label: 'Violence' },
  { key: 'underage', label: 'Underage drinking' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

/**
 * Blocks someone. Idempotent — blocking twice is not an error, because the
 * UI can race and a thrown error there would read as "block failed".
 *
 * `ignoreDuplicates` is what makes that true. Without it supabase-js sends
 * ON CONFLICT DO UPDATE, and on the conflict path Postgres checks the
 * existing row against the table's UPDATE policies — blocks has none
 * (migration 006 grants select, insert and delete only), so a second block
 * failed with a row-level-security error while the first one stood. DO
 * NOTHING needs only the insert policy. The AFTER INSERT trigger does not
 * fire for the skipped row, which is right: the follows went the first time.
 *
 * A database trigger drops the follow edges in both directions; that is
 * deliberately not done here, so it still happens if a block is ever
 * created from anywhere else.
 */
export async function blockUser(myId: string, targetId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .upsert(
      { blocker_id: myId, blocked_id: targetId },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function unblockUser(myId: string, targetId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', myId)
    .eq('blocked_id', targetId);
  if (error) throw error;
}

/** Ids you have blocked. Only your own blocks are readable. */
export async function fetchBlocked(myId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', myId);
  if (error) throw error;
  return (data ?? []).map((r) => r.blocked_id);
}

/*
 * A second report of the same post, reel or person by the same reporter is
 * success, not failure. Migration 012 allows one report per reporter per
 * post and per person, and 019 per reel (a unique index each), so a repeat
 * fails with 23505 — which means it is already on file, so the user is
 * thanked the same as the first time. "Could not report" would tell them
 * otherwise.
 */
const isDuplicate = (error: { code?: string }) => error.code === '23505';

export async function reportPost(
  myId: string,
  postId: string,
  reason: ReportReason,
  note?: string,
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: myId, reported_post_id: postId, reason, note: note ?? null });
  if (error && !isDuplicate(error)) throw error;
}

export async function reportUser(
  myId: string,
  userId: string,
  reason: ReportReason,
  note?: string,
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: myId, reported_user_id: userId, reason, note: note ?? null });
  if (error && !isDuplicate(error)) throw error;
}

/**
 * Reports a reel. Besides filing it, a report hides the reel from the
 * reporter at once and for good: the reels read policy leaves out every
 * reel the caller has reported (migration 019), so it is gone from the
 * feed and from profiles on the next query, and after a relaunch. The
 * caller drops it from what is already on screen.
 */
export async function reportReel(
  myId: string,
  reelId: string,
  reason: ReportReason,
  note?: string,
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: myId, reported_reel_id: reelId, reason, note: note ?? null });
  if (error && !isDuplicate(error)) throw error;
}

/* ==================================================================== */
/* Objectionable content                                                */
/*                                                                      */
/* App Store guideline 1.2 requires a way to filter objectionable        */
/* material from user-generated content. The server is the enforcement   */
/* point — a trigger rejects captions, bios, names and usernames that     */
/* match its word list and raises 'objectionable_content' — so a client   */
/* that skips this check still cannot publish. The client check exists    */
/* only to say so before the round trip, next to the field.               */
/* ==================================================================== */

/** What every surface says when the filter refuses a piece of text. */
export const OBJECTIONABLE_MESSAGE =
  'That includes language Sipply does not allow. Edit it and try again.';

/** True when a Supabase error is the server's content filter refusing a write. */
export function isObjectionableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { message, details, hint } = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [message, details, hint].some(
    (v) => typeof v === 'string' && v.includes('objectionable_content'),
  );
}

/*
 * A mirror of the server's filter: the same terms as the blocked_terms seed
 * in migration 011 (and schema.sql), matched the way public.is_objectionable
 * matches them. Keep the three in step.
 *
 * Mirrored exactly rather than approximated, because the two failure modes
 * are not equal. A word the server refuses and the client misses costs one
 * round trip and still ends at OBJECTIONABLE_MESSAGE, through
 * isObjectionableError. A word the client refuses and the server would
 * accept is a refusal nobody can get past, and a stricter home-made matcher
 * (more words, letter repeats, other plurals) made exactly those. Terms added
 * later from the dashboard reach the server first; the client catches up
 * when this list does.
 *
 * The list is slurs and explicit sexual terms, nothing milder. Every term was
 * checked against the Dex, because captions quote drink names: Porn Star
 * Martini, Red Headed Slut, Sex on the Beach, Slippery Nipple, Blow Job,
 * Suffering Bastard, Mount Gay and Charro Negro are why those words are not
 * here, and Kike, Coon and Dyke are left out as names people have.
 *
 * `inside` marks the terms that also match inside a glued username
 * ('jan_bar', 'thepourhouse'), which the server checks for usernames only.
 * Only terms that are never an innocent part of a longer word carry it.
 */
const BLOCKED_TERMS: readonly { term: string; inside: boolean }[] = [
  // Racial and ethnic slurs.
  { term: 'nigger', inside: true },
  { term: 'nigga', inside: true },
  { term: 'wetback', inside: true },
  { term: 'raghead', inside: true },
  { term: 'towelhead', inside: true },
  { term: 'spic', inside: false },
  { term: 'gook', inside: false },
  { term: 'beaner', inside: false },
  { term: 'sudaca', inside: false },
  // Slurs about sexuality, gender and disability.
  { term: 'faggot', inside: true },
  { term: 'maricon', inside: true },
  { term: 'maricones', inside: true },
  { term: 'fag', inside: false },
  { term: 'tranny', inside: false },
  { term: 'retard', inside: false },
  { term: 'retarded', inside: false },
  // Sexual.
  { term: 'whore', inside: true },
  { term: 'dildo', inside: true },
  { term: 'handjob', inside: true },
  { term: 'cumshot', inside: true },
  { term: 'mamabicho', inside: true },
  { term: 'cunt', inside: false },
  { term: 'twat', inside: false },
  { term: 'puta', inside: false },
  { term: 'puto', inside: false },
];

/*
 * The server's folding, character for character: lower case, then the
 * Spanish accents only (Maricón meets maricon). Nothing broader — an
 * accent the server keeps is a letter it splits words on, so folding it
 * here would match what the server lets through.
 */
const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };

/* Digit and symbol stand-ins, read as letters on the second pass: 'n1gger'. */
const STAND_INS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** The text as written, and again with the stand-ins read as letters. */
function spellings(text: string): string[] {
  const folded = text.toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACCENTS[c] ?? c);
  const swapped = folded.replace(/[013457@$]/g, (c) => STAND_INS[c] ?? c);
  return swapped === folded ? [folded] : [folded, swapped];
}

/**
 * Instant client-side check, so a surface can say so next to the field
 * before the round trip. Pass `glued` for a username, as the server does.
 *
 * A term matches as a whole word, or that word plus 's', with anything that
 * is not a-z counting as a space — so 'Scunthorpe', 'Allspice' and
 * 'computadora' pass. The server has the final word, and its refusal still
 * has to be mapped through isObjectionableError.
 */
export function containsObjectionable(text: string, options?: { glued?: boolean }): boolean {
  if (!text) return false;
  for (const s of spellings(text)) {
    const words = ` ${s.replace(/[^a-z]+/g, ' ').trim()} `;
    const run = s.replace(/[^a-z]+/g, '');
    for (const { term, inside } of BLOCKED_TERMS) {
      if (words.includes(` ${term} `) || words.includes(` ${term}s `)) return true;
      if (options?.glued && inside && run.includes(term.replace(/ /g, ''))) return true;
    }
  }
  return false;
}
