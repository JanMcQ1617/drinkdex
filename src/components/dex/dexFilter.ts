import type { DrinkCategory } from '@/types';

/* ==================================================================== */
/* The Dex's filters, and the note Dex progress leaves for them         */
/*                                                                      */
/* Two axes (layout spec 5.2): what kind of drink, and whether it is in */
/* your Dex. They live behind the field's sliders glyph now, in the     */
/* filter sheet (FilterSheet), and nowhere on the page.                 */
/*                                                                      */
/* WHY A NOTE AND NOT A ROUTE PARAM. Dex progress's "See your 38" opens */
/* the Dex filtered to Caught. The Dex is a tab page in a pager, and a  */
/* param put on it by a push would stay on the page after the filter   */
/* was cleared, and come back on the next visit. A one-shot note, taken */
/* once when the Dex next has focus, cannot.                            */
/* ==================================================================== */

export type CategoryFilter = DrinkCategory | 'all';
/** `unlocked` is Caught and `locked` Not yet; the axis has no "All" of its own (FilterSheet says why). */
export type StatusFilter = 'all' | 'unlocked' | 'locked';

export interface DexFilter {
  category: CategoryFilter;
  status: StatusFilter;
}

let pending: DexFilter | null = null;

/** Left by a screen that opens the Dex filtered (Dex progress's "See your 38"). */
export function requestDexFilter(filter: DexFilter): void {
  pending = filter;
}

/** Read once, by the Dex on focus; null when nothing asked. */
export function takeDexFilter(): DexFilter | null {
  const f = pending;
  pending = null;
  return f;
}
