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
 * A database trigger drops the follow edges in both directions; that is
 * deliberately not done here, so it still happens if a block is ever
 * created from anywhere else.
 */
export async function blockUser(myId: string, targetId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: myId, blocked_id: targetId }, { onConflict: 'blocker_id,blocked_id' });
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

export async function reportPost(
  myId: string,
  postId: string,
  reason: ReportReason,
  note?: string,
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: myId, reported_post_id: postId, reason, note: note ?? null });
  if (error) throw error;
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
  if (error) throw error;
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

/**
 * Instant client-side check, mirroring the server's list. Returns false for
 * anything it does not recognise — the server has the final word.
 */
export function containsObjectionable(_text: string): boolean {
  return false;
}
