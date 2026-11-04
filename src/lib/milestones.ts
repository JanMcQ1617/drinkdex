import { DRINKS, getDrink } from '@/data';
import type { DrinkCategory } from '@/types';

/* ==================================================================== */
/* The title ladder                                                     */
/*                                                                      */
/* Lives here rather than in CollectionStats, which is where it grew    */
/* up. It is data, and it is now read by two things that have no        */
/* business importing a component: the stats screen that displays it,   */
/* and the collection store, which has to know whether an unlock just   */
/* crossed a rung so the celebration can say so.                        */
/*                                                                      */
/* WHAT A TITLE COUNTS (v4.15, specs/v4.15/ranks.md): cocktails and     */
/* spirits, logged out of the cocktails and spirits in the Dex. Wine    */
/* never counts toward a title or against one. It came back in v4.14 as */
/* 2,344 cards, more than the other two kinds together, and as a share  */
/* of the whole Dex a title could step down a rung or two the day it    */
/* arrived (233 logged went from Cataloguer to Note taker) for nothing  */
/* the person did; more wine is on the way. So the ladder reads its own */
/* scope, and the Dex's count, its "of 4,671" and the per-kind bars on  */
/* Dex progress stay the whole Dex. Every reader of a title counts with */
/* onLadder (or ladderCount) against LADDER_TOTAL below, never TOTAL.   */
/* ==================================================================== */

export interface Milestone {
  /** Percentage of the ladder's scope (LADDER_TOTAL) at which this rung is reached. */
  pct: number;
  title: string;
}

/*
 * Ascending. Also drives the milestones list on Stats.
 *
 * Titles say "Dex", never "Index" or "Shelf". The collection is the Dex
 * everywhere else in the app, and "shelf" already means something exact on
 * My Bar — the bottles you own — so borrowing it for the collection made
 * one word name two things one tap apart.
 *
 * Titles name someone keeping a field guide, never someone drinking (App
 * Review 1.4.3): note taker up to keeper, each a reading of the share of
 * the catalogue logged. Through build 25 the rungs named a drinking career
 * instead. Only the words changed: the percentages are the same, and the
 * saved bestRung is an index, so nothing stored moves. Keep the six unique
 * and never "Not started": milestoneCrossed() below and store/collection's
 * rungAt() find a rung by its title.
 */
export const MILESTONES: Milestone[] = [
  { pct: 0, title: 'Note taker' },
  { pct: 10, title: 'Cataloguer' },
  { pct: 25, title: 'Archivist' },
  { pct: 50, title: 'Scholar' },
  { pct: 75, title: 'Curator' },
  { pct: 100, title: 'Keeper of the Dex' },
];

/*
 * The kinds on the ladder, named rather than "not wine", so a kind added
 * later (a shelf of wine bottlings, say) is off the ladder until someone
 * decides otherwise, instead of quietly moving everyone's title.
 */
const LADDER_KINDS: ReadonlySet<string> = new Set<DrinkCategory>(['cocktail', 'spirit']);

/** Whether an entry of this kind counts toward a title: cocktails and spirits. */
export function onLadder(category: DrinkCategory | undefined): boolean {
  return category !== undefined && LADDER_KINDS.has(category);
}

/** What a title is a share of: the cocktails and spirits in the Dex (2,327 when this was written). */
export const LADDER_TOTAL = DRINKS.reduce((n, d) => (onLadder(d.category) ? n + 1 : n), 0);

/**
 * How many entries in a collection count toward a title: catalogue
 * cocktails and spirits. A wine, an id the catalogue has retired and a
 * drink someone added (no Dex number) are not, so this is at most
 * catalogueCount (lib/cabinet).
 */
export function ladderCount(unlocks: Record<string, unknown>): number {
  let n = 0;
  for (const id of Object.keys(unlocks)) {
    if (onLadder(getDrink(id)?.category)) n += 1;
  }
  return n;
}

/** The title held by `unlocked` ladder entries out of `total`; callers pass ladderCount and LADDER_TOTAL. */
export function rankTitle(unlocked: number, total: number): string {
  if (unlocked === 0) return 'Not started';
  const pct = total > 0 ? (unlocked / total) * 100 : 0;
  let title = MILESTONES[0]!.title;
  for (const m of MILESTONES) {
    if (pct >= m.pct) title = m.title;
  }
  return title;
}

/**
 * The counts that reach each rung above the first: ceil(total x pct / 100),
 * the first count rankTitle gives that title. Here rather than beside the
 * ruler that draws them (components/Ruler) so the two halves of that "as
 * rankTitle requires" sit together and specs/v4.15/ranks.test.mjs can hold
 * them to it without a renderer.
 */
export function rungCounts(total: number): { pct: number; title: string; count: number }[] {
  return MILESTONES.filter((m) => m.pct > 0).map((m) => ({
    ...m,
    count: Math.ceil((total * m.pct) / 100),
  }));
}

/**
 * The rung above `unlocked`, for Dex progress's "Next: Archivist, at 582":
 * the first whose count is still ahead. None at nought (the page's own
 * key says how to start) and none at the top.
 */
export function nextRung(unlocked: number, total: number): { title: string; count: number } | undefined {
  if (unlocked <= 0) return undefined;
  return rungCounts(total).find((r) => r.count > unlocked);
}

/**
 * The rung crossed by going from `before` to `after` ladder entries, or
 * null if none was. An entry off the ladder (a wine) leaves the count
 * where it was, so it never crosses one.
 *
 * Compares titles rather than counts. The ladder is defined in percentages
 * of the 2,327 cocktails and spirits, so two adjacent counts can sit
 * either side of a rung without any integer landing exactly on it — asking
 * "did the rank change" is the only phrasing that cannot miss one. Both
 * readings use the same total, so a title that changed only because the
 * total did (wine leaving it in v4.15) is never a crossing here: that is
 * settled at launch, by store/collection's settle(), with no card.
 *
 * The first rung is never announced. Every first entry crosses it, and the
 * "Collected" card for that entry already carries the same count, so a
 * second card saying "Note taker" was two taps to get past one piece of
 * news. Stats still lists it as reached.
 */
export function milestoneCrossed(
  before: number,
  after: number,
  total: number,
): Milestone | null {
  if (after <= before) return null;
  const was = rankTitle(before, total);
  const now = rankTitle(after, total);
  if (was === now || now === MILESTONES[0]!.title) return null;
  return MILESTONES.find((m) => m.title === now) ?? null;
}
