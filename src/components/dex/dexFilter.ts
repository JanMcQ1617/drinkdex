import { NO_FILTER, type ChipFilter } from '@/lib/dexOrder';

/* ==================================================================== */
/* The Dex's filters, and the note Dex progress leaves for them         */
/*                                                                      */
/* v4.2 §1: four groups, in the first run's own words. Flavour (seven,  */
/* Fruity among them) and spirit (seven) take any number; kind          */
/* (Cocktails or Spirits) and In your Dex (Caught or Not yet) one or    */
/* none. OR inside a group, AND across groups. The filter is one object */
/* (lib/dexOrder's ChipFilter), so the Dex, its sheet, its quick chips  */
/* and this note all speak the same shape, and what a chip holds is     */
/* worked in one place (lib/dexOrder, from data/tasteTags.json).        */
/*                                                                      */
/* WHY A NOTE AND NOT A ROUTE PARAM. Dex progress's "See your 38" opens */
/* the Dex filtered to Caught. The Dex is a tab page in a pager, and a  */
/* param put on it by a push would stay on the page after the filter    */
/* was cleared, and come back on the next visit. A one-shot note, taken */
/* once when the Dex next has focus, cannot.                            */
/* ==================================================================== */

export type DexFilter = ChipFilter;

let pending: DexFilter | null = null;

/**
 * Left by a screen that opens the Dex filtered (Dex progress's "See your
 * 38" leaves `{ status: 'unlocked' }`). The groups it does not name are
 * off: the note says exactly what the Dex should show.
 */
export function requestDexFilter(filter: Partial<DexFilter>): void {
  pending = { ...NO_FILTER, ...filter };
}

/** Read once, by the Dex on focus; null when nothing asked. */
export function takeDexFilter(): DexFilter | null {
  const f = pending;
  pending = null;
  return f;
}
