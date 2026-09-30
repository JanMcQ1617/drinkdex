/* ==================================================================== */
/* The rank ladder                                                      */
/*                                                                      */
/* Lives here rather than in CollectionStats, which is where it grew    */
/* up. It is data, and it is now read by two things that have no        */
/* business importing a component: the stats screen that displays it,   */
/* and the collection store, which has to know whether an unlock just   */
/* crossed a rung so the celebration can say so.                        */
/* ==================================================================== */

export interface Milestone {
  /** Percentage of the index at which this rung is reached. */
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
 */
export const MILESTONES: Milestone[] = [
  { pct: 0, title: 'First Sips' },
  { pct: 10, title: 'Barfly in Training' },
  { pct: 25, title: 'The Regular' },
  { pct: 50, title: 'Connoisseur' },
  { pct: 75, title: 'Master of the Dex' },
  { pct: 100, title: 'Living Legend' },
];

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
 * The rung crossed by going from `before` to `after` collected entries,
 * or null if none was.
 *
 * Compares titles rather than counts. The ladder is defined in percentages
 * of a 2,089-entry index, so two adjacent counts can sit either side of a
 * rung without any integer landing exactly on it — asking "did the rank
 * change" is the only phrasing that cannot miss one.
 *
 * The first rung is never announced. Every first pour crosses it, and the
 * "Collected" card for that pour already carries the same count, so a
 * second card saying "First Sips" was two taps to get past one piece of
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
