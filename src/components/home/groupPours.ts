import { isLater } from '@/store/seen';
import type { Pour } from '@/types';

/* ==================================================================== */
/* Today's pours, by person                                             */
/*                                                                      */
/* One pure function, shared by the row of tiles on Home and the viewer */
/* it opens, so the two can never disagree about who comes first or     */
/* which pour is new. storyMap, at the foot, reads the same groups for  */
/* the rings on Home's post headers (v4.1).                             */
/* ==================================================================== */

/** How long a pour stays in the row. */
export const POUR_WINDOW_MS = 24 * 60 * 60 * 1000;
/** At most this many people in the row. */
const MAX_GROUPS = 50;

export interface PourGroup {
  authorId: string;
  /** Oldest → newest, so the viewer plays them in the order they were poured. */
  pours: Pour[];
  newestAt: string;
  /** Something newer than the last pour you viewed from them. Always false for your own. */
  unseen: boolean;
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Groups `pours` by author: yours apart, everyone else's with unseen
 * groups first, each block newest first, at most 50.
 *
 * Pours older than 24 hours by `now` are dropped here as well as on the
 * server, so a tile expires on screen at its time without waiting for a
 * refetch. `seen` is this account's map from author to the newest pour
 * viewed; pass undefined before it has been read and every group is new.
 */
export function groupPours(
  pours: Pour[],
  myId: string,
  seen: Record<string, string> | undefined,
  now = Date.now(),
): { mine: PourGroup | null; others: PourGroup[] } {
  const floor = now - POUR_WINDOW_MS;
  const byAuthor = new Map<string, Pour[]>();
  for (const p of pours) {
    // At exactly 24 hours a pour is gone, so the expiry timer that fires
    // at that moment (TodaysPours) finds it dropped.
    if (time(p.at) <= floor) continue;
    const list = byAuthor.get(p.authorId);
    if (list) list.push(p);
    else byAuthor.set(p.authorId, [p]);
  }

  let mine: PourGroup | null = null;
  const others: PourGroup[] = [];
  for (const [authorId, list] of byAuthor) {
    const ordered = [...list].sort((a, b) => time(a.at) - time(b.at));
    const newestAt = ordered[ordered.length - 1]!.at;
    if (authorId === myId) {
      mine = { authorId, pours: ordered, newestAt, unseen: false };
      continue;
    }
    const mark = seen?.[authorId];
    others.push({ authorId, pours: ordered, newestAt, unseen: !mark || isLater(newestAt, mark) });
  }

  others.sort((a, b) => {
    if (a.unseen !== b.unseen) return a.unseen ? -1 : 1;
    return time(b.newestAt) - time(a.newestAt);
  });

  return { mine, others: others.slice(0, MAX_GROUPS) };
}

/**
 * Where to start in a group: its first pour newer than the last one you
 * viewed, oldest first, or the first pour when you have seen them all.
 */
export function firstUnseenIndex(group: PourGroup, mark: string | undefined): number {
  if (!mark) return 0;
  const i = group.pours.findIndex((p) => isLater(p.at, mark));
  return i < 0 ? 0 : i;
}

/** Whether a post's author has a story today, and whether it is new to you. */
export type StoryState = 'unseen' | 'seen';

/**
 * Who has a story in the row, keyed by author, for Home's post headers
 * (home-ig 4): 'unseen' draws the 2pt ink ring round their face, and
 * either state makes the face open their story. Read off the same groups
 * the row draws, so a header and its circle never disagree. Your own
 * story is never new to you. Pass `marksRead` false until the seen marks
 * have been read from disk, and nobody is ringed, as in the row.
 */
export function storyMap(
  groups: { mine: PourGroup | null; others: PourGroup[] },
  marksRead = true,
): Record<string, StoryState> {
  // Null-prototype: keys are author ids off the server, and a lookup must never find a builtin.
  const out = Object.create(null) as Record<string, StoryState>;
  if (groups.mine) out[groups.mine.authorId] = 'seen';
  for (const g of groups.others) out[g.authorId] = marksRead && g.unseen ? 'unseen' : 'seen';
  return out;
}
