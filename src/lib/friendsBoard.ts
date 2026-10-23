import type { FriendsBoardRow } from '@/lib/database.types';
import { isMissingFunction } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { FriendStanding } from '@/types';

/* ==================================================================== */
/* The Friends board (specs/v4.7/spec.md 3, migration 025)              */
/*                                                                      */
/* The Tournaments tab's lower half: you and everyone you follow, by    */
/* how many DIFFERENT catalogue drinks each has posted. Each person's   */
/* Dex lives on their phone and never reaches the server, so the honest */
/* figure is their posts: one post is one drink (007), a re-post adds a */
/* photo to the same post, so count(distinct drink_id) is the number of */
/* different drinks they have posted, each once, ever. It is never an   */
/* amount, never per day and never resets, so there is nothing to keep  */
/* up and no streak (App Review 1.4.3). The screen calls it entries.    */
/*                                                                      */
/* No flag. Until migration 025 is applied the function is missing and  */
/* fetchFriendsBoard says so with null, which leaves the Friends half    */
/* out of the tab with no error; the next focus asks again.              */
/* ==================================================================== */

/** The most prints a row shows, and the most the server sends. */
const LATEST_MAX = 3;

/*
 * Checked, not trusted (lib/tournaments' pattern): the row type is
 * hand-typed and `latest` is jsonb, which no type describes.
 */
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toLatest(raw: unknown): FriendStanding['latest'] {
  if (!Array.isArray(raw)) return [];
  const out: FriendStanding['latest'] = [];
  for (const item of raw) {
    if (out.length >= LATEST_MAX) break;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const drinkId = str(r.drink_id);
    if (!drinkId) continue;
    out.push({ drinkId, photoPath: str(r.photo_path) });
  }
  return out;
}

/** A row without a user id or a username is dropped: there is nobody to name or open. */
function toStanding(r: FriendsBoardRow): Omit<FriendStanding, 'tied'> | null {
  const userId = str(r.user_id);
  const username = str(r.username);
  if (!userId || !username) return null;
  const entries = Math.max(0, Math.floor(num(r.entries) ?? 0));
  const place = num(r.place);
  return {
    userId,
    username,
    displayName: str(r.display_name) || username,
    accent: str(r.accent) ?? '',
    avatarPath: str(r.avatar_path),
    entries,
    // No place at nought, whatever the server sent: at 0 a place is only the alphabet's.
    place: entries > 0 && place !== null && place > 0 ? place : null,
    latest: toLatest(r.latest),
  };
}

/**
 * Marks each row whose place another row shares (1, 2, 3, 3, 5: both 3s
 * are tied). Computed here rather than sent, since it is a fact about the
 * rows the caller can see, which is what the spoken label describes.
 */
function withTies(rows: Omit<FriendStanding, 'tied'>[]): FriendStanding[] {
  const seen = new Map<number, number>();
  for (const r of rows) if (r.place !== null) seen.set(r.place, (seen.get(r.place) ?? 0) + 1);
  return rows.map((r) => ({ ...r, tied: r.place !== null && (seen.get(r.place) ?? 0) > 1 }));
}

/**
 * You and the people you follow, most entries first, then username (the
 * server's order, kept). Null when migration 025 is missing (no
 * friends_board function). Throws on any other failure, so the store can
 * keep what it had.
 */
export async function fetchFriendsBoard(): Promise<FriendStanding[] | null> {
  const { data, error } = await supabase.rpc('friends_board');
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  const rows = (Array.isArray(data) ? data : [])
    .map(toStanding)
    .filter((r): r is Omit<FriendStanding, 'tied'> => r !== null);
  return withTies(rows);
}
