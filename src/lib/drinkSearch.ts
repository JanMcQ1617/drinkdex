import { DRINKS } from '@/data';
import { catalogueTwin } from '@/lib/customDrinks';
import type { CustomDrink, Drink } from '@/types';

/* ==================================================================== */
/* Drink search                                                         */
/*                                                                      */
/* Lifted out of the log sheet (src/app/log.tsx), whose search it was,  */
/* with its behaviour unchanged, because three more places search the   */
/* same catalogue the same way: the log sheet's rows for drinks people  */
/* added themselves, the add-a-drink form's "Already in the Dex?", and  */
/* the drink tag on a reel. One ranking means "vodka" finds the same    */
/* drinks in the same order wherever it is typed.                       */
/*                                                                      */
/* The Dex grid keeps its own, broader search (a substring over name,   */
/* style and origin, for browsing by country); this one is for picking  */
/* one drink, where the name has to come first.                         */
/* ==================================================================== */

/** How many matches to render. Past this, typing more is quicker than scrolling. */
export const MAX_RESULTS = 40;

/** Lower case with accents dropped, so "anejo" finds "Añejo". Same fold as the bar search. */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Letters and digits, including the folded Latin letters that have no ASCII base (ø, ß, ı). */
export const WORD_CHAR = /[a-z0-9\u00c0-\u024f]/;

/*
 * A query that is only a Dex number: "127", "#127", "Nº 127", "no 127",
 * "no. 127", "n127", "nr 127", "number 127", one to four digits. Matched
 * on the folded query, so a capital N and the iOS keyboard's degree sign
 * (the º most people can reach) both pass. The numero sign is never
 * written here (check-design rule 16 keeps it out of src); a pasted one
 * still passes, because NFKC spells it "No".
 */
const DEX_NUMBER_QUERY = /^(?:#|n(?:[º°o]|r|um(?:ber)?)?\.?)?\s*#?\s*(\d{1,4})$/;

/**
 * The Dex number a query asks for, or null when it is a name (or style,
 * or place) search. Not range-checked: "3000" is 3000, so the caller can
 * say the Dex stops short of it rather than treating it as a name.
 *
 * The Dex grid jumps to the number instead of filtering (v3.3 Brass graft
 * 9): as a substring, "12" lists every twelve-year-old Scotch and never
 * the drink numbered 12, which is the one that was meant.
 */
export function parseDexNumber(query: string): number | null {
  const m = DEX_NUMBER_QUERY.exec(fold(query.trim().normalize('NFKC')));
  return m ? Number.parseInt(m[1], 10) : null;
}

/** A number on its way in: the sign typed, the digits not yet. Never the start of a name. */
const DEX_NUMBER_PREFIX = /^(?:#|n[º°]\.?)\s*#?$/;

/**
 * True for "#", "Nº" or "N°" with no digits after it yet. The Dex reads
 * it as no query at all: searched as words, "Nº" matched nothing, and on
 * the way to typing "Nº 127" the grid flashed "No match" and offered to
 * add a drink called Nº. "no" stays a search: it is the start of names.
 */
export function isDexNumberPrefix(query: string): boolean {
  return DEX_NUMBER_PREFIX.test(fold(query.trim()));
}

/** True when `q` occurs in `s` at the start of a word, not inside one. */
export function atWordStart(s: string, q: string): boolean {
  for (let i = s.indexOf(q); i !== -1; i = s.indexOf(q, i + 1)) {
    if (i === 0 || !WORD_CHAR.test(s[i - 1])) return true;
  }
  return false;
}

/** What rank() reads: the three searchable fields, already folded. */
export type Folded = { name: string; style: string; place: string };

/** Folded once at load, not on every keystroke. */
export const SEARCH_INDEX: readonly (Folded & { drink: Drink })[] = DRINKS.map((d) => ({
  drink: d,
  name: fold(d.name),
  style: fold(d.subcategory),
  place: fold(d.origin),
}));

/*
 * How well an entry answers the query, lower is better, or -1 for not at
 * all. The name outranks the style, which outranks the place: someone
 * typing "vodka" means Vodka Soda before a vodka from somewhere, and
 * with the list capped, anything ranked low enough is never seen.
 *
 * Styles and places only match at the start of a word. A raw substring
 * test let "gin" find everything from the Virgin Islands and put a
 * Painkiller above the Gin Sour.
 *
 * `q` is already folded (fold(query.trim())).
 */
export function rank(e: Folded, q: string): number {
  if (e.name === q) return 0;
  if (e.name.startsWith(q)) return 1;
  if (atWordStart(e.name, q)) return 2;
  if (e.name.includes(q)) return 3;
  if (atWordStart(e.style, q)) return 4;
  if (atWordStart(e.place, q)) return 5;
  return -1;
}

/*
 * The catalogue's matches for a query, best first, as { rows, total }:
 * at most `max` rows, and how many matched in all (for "Showing the best
 * 40 of 312").
 *
 * Nothing is listed until something is typed. The full index in dex
 * order is not a starting point, it is a wall — and the one thing the
 * user reliably knows here is roughly what the drink was called.
 *
 * Every entry is ranked and the best `max` kept, rather than stopping at
 * the first `max` in dex order. Stopping early was cheaper, but it meant
 * "vodka" filled the list with vodkas from somewhere before reaching
 * Vodka Soda. Ranking the whole index is a few thousand string checks per
 * keystroke, which is nothing.
 *
 * Takes the query as typed; folding twice changes nothing, so a folded one
 * is fine too.
 */
export function searchCatalogue(
  query: string,
  max: number = MAX_RESULTS,
): { rows: Drink[]; total: number } {
  const q = fold(query.trim());
  if (q.length === 0) return { rows: [], total: 0 };
  const hits: { r: number; drink: Drink }[] = [];
  for (const e of SEARCH_INDEX) {
    const r = rank(e, q);
    if (r >= 0) hits.push({ r, drink: e.drink });
  }
  hits.sort((a, b) => a.r - b.r || a.drink.dexNumber - b.drink.dexNumber);
  return { rows: hits.slice(0, max).map((h) => h.drink), total: hits.length };
}

/**
 * rank() for a drink someone added, so the log sheet can list theirs among
 * the catalogue's by the same measure (the sheet puts theirs first on a
 * tie). Folded per call: there are a handful of them, not thousands.
 *
 * Takes the query as typed, like searchCatalogue.
 */
export function rankCustom(
  c: Pick<CustomDrink, 'name' | 'subcategory' | 'origin'>,
  query: string,
): number {
  const q = fold(query.trim());
  if (q.length === 0) return -1;
  return rank({ name: fold(c.name), style: fold(c.subcategory), place: fold(c.origin) }, q);
}

/**
 * Catalogue drinks whose NAME answers `name` (ranks 0 to 3, so a style or
 * a place alone does not count), best first: the add-a-drink form's
 * "Already in the Dex?", which is there to stop a second copy of a drink
 * the Dex has.
 *
 * The catalogue drink with the same name, if there is one, is always
 * first, even where this search's fold would not call it a match ("Bees
 * Knees" for Bee's Knees): the form refuses that name, and the way to the
 * drink it means has to be on screen beside the refusal.
 */
export function similarByName(name: string, max = 3): Drink[] {
  const q = fold(name.trim());
  if (q.length === 0) return [];
  const twin = catalogueTwin(name);
  const hits: { r: number; drink: Drink }[] = [];
  for (const e of SEARCH_INDEX) {
    if (e.drink === twin) continue;
    const r = rank(e, q);
    if (r >= 0 && r <= 3) hits.push({ r, drink: e.drink });
  }
  hits.sort((a, b) => a.r - b.r || a.drink.dexNumber - b.drink.dexNumber);
  const rows = hits.map((h) => h.drink);
  return (twin ? [twin, ...rows] : rows).slice(0, max);
}
