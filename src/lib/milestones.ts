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

/** Ascending. Also drives the milestones list on Stats. */
export const MILESTONES: Milestone[] = [
  { pct: 0, title: 'First Sips' },
  { pct: 10, title: 'Barfly in Training' },
  { pct: 25, title: 'The Regular' },
  { pct: 50, title: 'Connoisseur' },
  { pct: 75, title: 'Master of the Index' },
  { pct: 100, title: 'Living Legend' },
];

export function rankTitle(unlocked: number, total: number): string {
  if (unlocked === 0) return 'Empty Shelf';
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
 * of a 7,653-entry index, so two adjacent counts can sit either side of a
 * rung without any integer landing exactly on it — asking "did the rank
 * change" is the only phrasing that cannot miss one.
 */
export function milestoneCrossed(
  before: number,
  after: number,
  total: number,
): Milestone | null {
  if (after <= before) return null;
  const was = rankTitle(before, total);
  const now = rankTitle(after, total);
  if (was === now) return null;
  return MILESTONES.find((m) => m.title === now) ?? null;
}
