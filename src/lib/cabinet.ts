import { getDrink } from '@/data';
import type { Drink, Post, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Collection selectors                                                 */
/*                                                                      */
/* What the Dex and Home show about a collection, worked out from       */
/* data the phone already holds: the local unlocks (store/collection)   */
/* and posts already fetched (store/social, a profile's own posts). No  */
/* new query, and nothing invented: every drink returned is a real      */
/* catalogue entry (getDrink), paired with the record or post it came   */
/* from, so a screen never shows a catch or a pour that did not happen. */
/*                                                                      */
/* Pure, so the screens can call these in render; each is a single pass */
/* (or a sort) over at most a few thousand entries.                     */
/* ==================================================================== */

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Milliseconds for an ISO date; an unreadable one sorts last rather than throwing the order off. */
function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Newest first, and a stable 0 for two unreadable dates (-Infinity minus -Infinity is NaN). */
function newestFirst(a: number, b: number): number {
  return a === b ? 0 : b > a ? 1 : -1;
}

/**
 * The drink most recently brought into the collection, with its record,
 * for the Dex's Latest catch panel. A record's date is the day the drink
 * was first logged (a re-log keeps it, store/collection), so this is the
 * newest catch, not the newest pour. Null for an empty collection.
 */
export function latestCatch(
  unlocks: Record<string, UnlockRecord>,
): { drink: Drink; record: UnlockRecord } | null {
  let best: { drink: Drink; record: UnlockRecord; at: number } | null = null;
  for (const id of Object.keys(unlocks)) {
    const drink = getDrink(id);
    const record = unlocks[id];
    if (!drink || !record) continue;
    const at = timeOf(record.date);
    // Ties go to the higher Dex number, so the answer does not depend on key order.
    if (!best || at > best.at || (at === best.at && drink.dexNumber > best.drink.dexNumber)) {
      best = { drink, record, at };
    }
  }
  return best ? { drink: best.drink, record: best.record } : null;
}

/**
 * How many drinks in the collection are catalogue entries (getDrink hits):
 * the figure the Dex and a profile's Dex tab show ("38 of 2,089"). An
 * unlock of a drink you added yourself, or of an id the catalogue has
 * since retired, is not one, so this can be less than the record count.
 */
export function catalogueCount(unlocks: Record<string, UnlockRecord>): number {
  let n = 0;
  for (const id of Object.keys(unlocks)) {
    if (getDrink(id)) n += 1;
  }
  return n;
}

/**
 * Drinks other people in the feed have posted that are not in your Dex,
 * newest first, each drink once, with the newest post of it: Home's "Not
 * in your Dex yet" module. Your own posts never count (by `mine` or by
 * author id), nor does a drink already collected, a custom or retired id,
 * or anything in `skip` (the drinks an earlier module already showed).
 * `limit` defaults to 6.
 */
export function notInDexYet(
  feed: readonly Post[],
  myId: string,
  unlocks: Record<string, UnlockRecord>,
  opts?: { limit?: number; skip?: ReadonlySet<string> },
): { drink: Drink; post: Post }[] {
  const limit = opts?.limit ?? 6;
  const skip = opts?.skip;
  const byTime = feed
    .map((post) => ({ post, at: timeOf(post.createdAt) }))
    .sort((a, b) => newestFirst(a.at, b.at));
  const seen = new Set<string>();
  const picks: { drink: Drink; post: Post }[] = [];
  for (const { post } of byTime) {
    if (picks.length >= limit) break;
    if (post.mine || post.authorId === myId) continue;
    if (seen.has(post.drinkId)) continue;
    seen.add(post.drinkId);
    if (skip?.has(post.drinkId) || hasOwn(unlocks, post.drinkId)) continue;
    const drink = getDrink(post.drinkId);
    if (drink) picks.push({ drink, post });
  }
  return picks;
}

