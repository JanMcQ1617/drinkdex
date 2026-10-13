import { DRINKS, TOTAL } from '@/data';
import { matcher, type ChipFilter, type ForYou, type ForYouSection, type IsCaught } from '@/lib/dexOrder';
import type { Drink } from '@/types';

/* ==================================================================== */
/* The Dex's rows (v4.2 §2.2 to §2.5)                                   */
/*                                                                      */
/* What the Dex's list draws, worked from the search, the chips and the */
/* order, with nothing of React in it, so the screen stays a screen and */
/* this can be checked in Node against specs/v4.2/tools/dex-order.mjs.  */
/*                                                                      */
/*   A SEARCH OR ANY CHIP: flat, no heads. One pass over the order the  */
/*   key says, For you's total order (lib/dexOrder's `rank`: the fronts */
/*   as shown, then every other drink by its section, each by Nº) or    */
/*   the catalogue by number, so what survives is in order with no      */
/*   sort: "rum" For you shows Barbados Rum Punch, Rum Runner and Rum   */
/*   Barrel first; by number it is by Nº, as it always was.             */
/*   FOR YOU AT REST: each section's head and its front (a section      */
/*   whose front has nothing left in the catalogue is left out, stop    */
/*   and all), then Everything else's head and every other drink by Nº. */
/*   BY NUMBER AT REST: every drink by number, the v4 Dex exactly.      */
/*                                                                      */
/* A grid row is two drinks. Each row carries the spot the Nº rail's    */
/* thumb reads while that row is at the top of the grid: a section's    */
/* stop inside a For-you front, else the row's first Dex number.        */
/* ==================================================================== */

/** Two to a row (layout spec 5.2): 184pt prints at 440. */
export const COLUMNS = 2;

/** A spot on the rail: a section's stop is negative, -(index + 1); a Dex number is itself. */
export type RailSpot = number;
export const stopSpot = (index: number): RailSpot => -(index + 1);
export const stopOf = (spot: RailSpot): number => -spot - 1;

export type GridRow =
  | {
      type: 'head';
      key: string;
      label: string;
      /** The section, for "See all"; null for Everything else. */
      section: ForYouSection | null;
      /** The first head on the page: no extra air over it. */
      first: boolean;
      spot: RailSpot;
    }
  | {
      type: 'drinks';
      key: string;
      drinks: Drink[];
      /** A For-you front's stop; null reads the row's first number. */
      spot: RailSpot | null;
    };

/*
 * Folded for matching: accents stripped, apostrophes dropped, lowercased.
 *
 * A plain lowercase substring check missed 188 names with accents and 89
 * with apostrophes — "pina colada", "cachaca", "creme de cassis" and "bees
 * knees" all came back empty for drinks that are in the Dex, because a US
 * keyboard does not type ñ, ç or è and nobody types the apostrophe. The
 * iOS keyboard's curly ’ would not have matched the data's straight ' in
 * any case. NFD splits each accented letter into base plus mark and the
 * marks go; the explicit maps are the letters NFD does not decompose
 * (ı, ß, ø, đ), which were all that was left in the catalogue after it.
 *
 * This is the Dex's own search, broader than the log sheet's
 * (lib/drinkSearch): a substring over name, style and origin, for
 * browsing, not ranked for picking one drink. A query that is only a
 * number is not searched at all: lib/drinkSearch's parseDexNumber reads
 * it, and the grid jumps there instead.
 */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .replace(/[øØ]/g, 'o')
    .replace(/[đĐ]/g, 'd')
    .replace(/['‘’`]/g, '')
    .toLowerCase();

/*
 * Name, style and origin, folded once at load rather than per keystroke.
 * Newline-joined so a query cannot match across the seam between two
 * fields. Origin is here so the Dex can be browsed by country — "peru",
 * "jalisco", "iceland".
 */
const SEARCH_KEY = new Map(
  DRINKS.map((d) => [d.id, [d.name, d.subcategory, d.origin].map(fold).join('\n')]),
);

/**
 * The catalogue drinks these words find, in Nº order; every drink for no
 * words. What the filter sheet counts over while a search is typed, so
 * its figures and "Show 12 drinks" are the grid behind it, not the whole
 * catalogue's (the bar's count stays the filters' own, §2.4).
 */
export function searchHits(query: string): readonly Drink[] {
  const q = fold(query);
  if (q.length === 0) return DRINKS;
  return DRINKS.filter((d) => (SEARCH_KEY.get(d.id) ?? '').includes(q));
}

/** Rows of two, made before the list sees them. */
function pushRows(out: GridRow[], list: readonly Drink[], spot: RailSpot | null): void {
  for (let i = 0; i < list.length; i += COLUMNS) {
    const drinks = list.slice(i, i + COLUMNS);
    out.push({ type: 'drinks', key: `row:${drinks[0]!.id}`, drinks, spot });
  }
}

function rowsOf(list: readonly Drink[]): GridRow[] {
  const out: GridRow[] = [];
  pushRows(out, list, null);
  return out;
}

/** By number at rest, the v4 Dex: the same rows for every person, made once. */
export const NUMBER_ROWS: readonly GridRow[] = rowsOf(DRINKS);

/** The drinks a row draws (the number map's reader); null for a head. */
export const drinksOf = (row: GridRow): readonly Drink[] | null => (row.type === 'drinks' ? row.drinks : null);

/** What the rail's thumb reads with this row at the top of the grid. */
export const spotOf = (row: GridRow): RailSpot =>
  row.type === 'head' ? row.spot : (row.spot ?? row.drinks[0]!.dexNumber);

export interface DexGrid {
  rows: readonly GridRow[];
  /** Catalogue drinks the grid holds. */
  matched: number;
  /** The search finds something in the catalogue under any chips: "the filters hide it", not "the Dex does not have it". */
  matchesCatalogue: boolean;
  /** A search or a chip made the grid one flat run, with no heads. */
  flat: boolean;
  /** The first row in number order to the end (Everything else's, For you; 0 by number): where the rail's numbers search. */
  restStart: number;
  /** The sections' names, one rail stop each, For you at rest; null otherwise. */
  stops: readonly string[] | null;
  /** The head row of each stop. */
  stopRows: readonly number[];
}

/**
 * The grid for this search, these chips and this order. `query` is the
 * words typed (empty for none, and for a typed number); `forYou` is the
 * For-you Dex when that is the order, else null for By number.
 */
export function dexGrid({
  query,
  filter,
  filterOn,
  caught,
  forYou,
}: {
  query: string;
  filter: ChipFilter;
  filterOn: boolean;
  caught: IsCaught;
  forYou: ForYou | null;
}): DexGrid {
  const q = fold(query);
  if (q.length > 0 || filterOn) {
    const pass = matcher(filter, caught);
    const picked: Drink[] = [];
    let anywhere = false;
    for (const drink of forYou ? forYou.rank : DRINKS) {
      if (q.length > 0 && !(SEARCH_KEY.get(drink.id) ?? '').includes(q)) continue;
      anywhere = true;
      if (pass(drink)) picked.push(drink);
    }
    return { rows: rowsOf(picked), matched: picked.length, matchesCatalogue: anywhere, flat: true, restStart: 0, stops: null, stopRows: [] };
  }
  if (forYou) {
    const rows: GridRow[] = [];
    const stops: string[] = [];
    const stopRows: number[] = [];
    for (const s of forYou.sections) {
      if (s.drinks.length === 0) continue;
      const spot = stopSpot(stops.length);
      stopRows.push(rows.length);
      rows.push({ type: 'head', key: `head:${s.kind}:${s.key}`, label: s.label, section: s, first: stops.length === 0, spot });
      stops.push(s.label);
      pushRows(rows, s.drinks, spot);
    }
    rows.push({
      type: 'head',
      key: 'head:rest',
      label: 'Everything else',
      section: null,
      first: rows.length === 0,
      spot: forYou.rest[0]?.dexNumber ?? 1,
    });
    const restStart = rows.length;
    pushRows(rows, forYou.rest, null);
    return { rows, matched: TOTAL, matchesCatalogue: true, flat: false, restStart, stops, stopRows };
  }
  return { rows: NUMBER_ROWS, matched: TOTAL, matchesCatalogue: true, flat: false, restStart: 0, stops: null, stopRows: [] };
}

/**
 * The first row at or after Dex number `n`, by binary search over rows
 * `from` to the end, which are grid rows in number order (By number's,
 * or For you's Everything else): where the rail lands in a grid that
 * skips `n`. The last row when `n` is past the end; -1 when there are no
 * rows. A typed number finds its exact row through lib/dexOrder's
 * numberMap instead, in any order.
 */
export function rowFor(rows: readonly GridRow[], n: number, from: number): number {
  let lo = from;
  let hi = rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = rows[mid]!;
    const last = row.type === 'drinks' ? row.drinks[row.drinks.length - 1]!.dexNumber : -1;
    if (last >= n) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found < 0 ? rows.length - 1 : found;
}
