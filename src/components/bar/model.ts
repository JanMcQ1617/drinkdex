import { drinkPhoto } from '@/data/drinkPhotos';
import {
  type BarResult,
  basicsResult,
  type BestBottle,
  bestBottle,
  browseIngredients,
  gainOf,
  INGREDIENTS_BY_ID,
  type Ingredient,
  type IngredientCategory,
  matchOwned,
  reachOf,
} from '@/lib/bar';
import type { Drink } from '@/types';

/* ==================================================================== */
/* What My Bar shows, worked out from your bar                          */
/*                                                                      */
/* Pure functions of what you own and its match result, kept out of the */
/* screen so the order rules sit in one place.                          */
/* ==================================================================== */

/** One row of One ingredient away: a drink, and the one thing it was short of when the rows were taken. */
export interface AwayEntry {
  drink: Drink;
  /** The missing slot's canonical id (Match.missing[0]): the bottle the row's Add puts in your bar. */
  need: string;
}

/** The best single bottle (graft 7) as the card shows it: the bottle, and the drinks it opens, named ones first. */
export interface BestPick {
  id: string;
  drinks: readonly Drink[];
}

/**
 * The order the screen holds still while you tick. Taken when another
 * tab takes the front (and when the bar first loads from disk, and after
 * Clear), never on a tick: a row you tick stays where it stood.
 */
export interface Snapshot {
  /**
   * Which taking this is. The picker takes its own order again when it
   * changes; a row's Add, which only freezes One ingredient away, keeps
   * it, so adding from there never reshuffles the checklist above.
   */
  taken: number;
  /**
   * One ingredient away is held (its rows and its best bottle). False
   * while it is still live: taken on an empty bar (or one with nothing
   * one away), it follows the checklist's ticks until the first Add down
   * there freezes it.
   */
  frozen: boolean;
  /** One ingredient away's rows, in order, as they were when frozen. */
  away: AwayEntry[];
  /** The best single bottle when frozen; it keeps its words after its own Add. */
  best: BestPick | null;
}

let taken = 0;

/**
 * The drinks a best bottle opens: the ones that name it first (dry
 * vermouth's Martini before a family slot's), then the house order.
 */
function bestDrinks(best: BestBottle, inDex: (d: Drink) => boolean): Drink[] {
  const named = new Set(best.matches.filter((m) => m.missing[0] === best.ingredient.id).map((m) => m.drink.id));
  const ranked = rankDrinks(
    best.matches.map((m) => m.drink),
    inDex,
  );
  return [...ranked.filter((d) => named.has(d.id)), ...ranked.filter((d) => !named.has(d.id))];
}

/**
 * One ingredient away worked out from a result: every nearly drink as a
 * row, and the best single bottle.
 *
 * Rows go new to your Dex first, then the photographed (the classics,
 * and a real ghost photo in the thumb), as the strip ranks them; then,
 * WHY, by how many recipes name the bottle it needs, so a drink short of
 * a common bottle comes before one short of "Fermented millet", which is
 * no use to most bars; then the Dex's own order.
 */
export function awayOf(result: BarResult, inDex: (d: Drink) => boolean): Pick<Snapshot, 'away' | 'best'> {
  const uses = (id: string) => INGREDIENTS_BY_ID[id]?.uses ?? 0;
  const away = result.nearly
    .map((m) => ({ drink: m.drink, need: m.missing[0]! }))
    .sort(
      (a, b) =>
        Number(inDex(a.drink)) - Number(inDex(b.drink)) ||
        Number(!drinkPhoto(a.drink.id)) - Number(!drinkPhoto(b.drink.id)) ||
        uses(b.need) - uses(a.need) ||
        a.drink.dexNumber - b.drink.dexNumber,
    );
  const best = bestBottle(result);
  return { away, best: best ? { id: best.ingredient.id, drinks: bestDrinks(best, inDex) } : null };
}

/**
 * `inDex` orders One ingredient away (new to your Dex first); pass one
 * that says false until the Dex has loaded, so a snapshot taken at launch
 * is the one the screen keeps.
 */
export function takeSnapshot(owned: Record<string, true>, inDex: (d: Drink) => boolean): Snapshot {
  taken += 1;
  const ids = Object.keys(owned).filter((id) => INGREDIENTS_BY_ID[id]);
  if (!ids.length) return { taken, frozen: false, away: [], best: null };
  const away = awayOf(matchOwned(owned), inDex);
  // Nothing one away yet: stay live, so what the next ticks bring shows at once (there is nothing to hold still).
  return { taken, frozen: away.away.length > 0, ...away };
}

/* ==================================================================== */
/* The picker's order                                                   */
/* ==================================================================== */

/** The picker's chips: everything, what you have, or one category. */
export type PickerFilter = 'all' | 'owned' | IngredientCategory;

/**
 * Named by fewer recipes than this, a family member that only repeats a
 * row above it is an echo (see pickerOrder). Rye (51) and Bourbon (33)
 * are named on their own and stay where they rank; London dry gin (1) and
 * Navy strength gin (0) go.
 */
const ECHO_USES = 3;

/**
 * The checklist's rows, most useful first: what would unlock the most
 * drinks with your bar as it is, then what recipes name most on its own,
 * then what goes into the most drinks at all, then A to Z. "In your bar"
 * is what you own, A to Z.
 *
 * WHY `uses` before `reach`. Every gin slot lists the whole family, so
 * Old Tom (reach 173), sloe gin (172), London dry (169) and Navy strength
 * (168) all reach as far as Gin (168) does. Ranked by reach alone an
 * empty bar opened on five gins in its first six rows; by `uses` it opens
 * on Lemon, Gin, Lime, Soda water, the mockup's order.
 *
 * WHY echoes sink. Full-slot gains credit every member of a family, so
 * with the basics less gin, Gin arrived with four echoes each claiming
 * the same 24 drinks. A thing is ranked as if it unlocked nothing when
 * every drink it would unlock is already claimed by one row above it AND
 * recipes rarely name it (under ECHO_USES), the add sheet's old rule. It
 * stays in the list, checkable and searchable, just not in the top rows.
 */
export function pickerOrder(result: BarResult, owned: Record<string, true>, filter: PickerFilter): string[] {
  const ownedIds = Object.keys(owned).filter((id) => INGREDIENTS_BY_ID[id]);
  if (filter === 'owned') return aToZ(ownedIds);

  const ids = new Set([...browseIngredients().map((i) => i.id), ...ownedIds, ...result.gains.keys()]);
  const listed = [...ids]
    .map((id) => INGREDIENTS_BY_ID[id])
    .filter((i): i is Ingredient => !!i && (filter === 'all' || i.category === filter));

  const rank = (gain: (i: Ingredient) => number) => (a: Ingredient, b: Ingredient) =>
    gain(b) - gain(a) ||
    b.uses - a.uses ||
    reachOf(b.id) - reachOf(a.id) ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id);

  const byGain = [...listed].sort(rank((i) => gainOf(result, i.id)));
  const claimed: Set<string>[] = [];
  const echoes = new Set<string>();
  for (const i of byGain) {
    const drinks = (result.gains.get(i.id) ?? []).map((m) => m.drink.id);
    if (!drinks.length) continue;
    if (i.uses < ECHO_USES && claimed.some((set) => drinks.every((d) => set.has(d)))) {
      echoes.add(i.id);
      continue;
    }
    claimed.push(new Set(drinks));
  }
  if (!echoes.size) return byGain.map((i) => i.id);
  return byGain.sort(rank((i) => (echoes.has(i.id) ? 0 : gainOf(result, i.id)))).map((i) => i.id);
}

function aToZ(ids: readonly string[]): string[] {
  return ids
    .map((id) => INGREDIENTS_BY_ID[id])
    .filter((i): i is Ingredient => !!i)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((i) => i.id);
}

/** The held order as shown: exactly the rows it holds, ticked or not. */
export function pickerRows(held: readonly string[]): Ingredient[] {
  return held.flatMap((id) => (INGREDIENTS_BY_ID[id] ? [INGREDIENTS_BY_ID[id]] : []));
}

/**
 * "In your bar" taken again without moving a row: what is listed stays
 * where it is (unticked ones too), and `ids` not listed yet join the end,
 * A to Z. For the moments the list may grow, a search ending or the
 * basics button above it, never an Add below it (that would push the
 * row under the finger down).
 */
export function appendAToZ(held: readonly string[], ids: readonly string[]): string[] {
  const seen = new Set(held);
  return [...held, ...aToZ(ids.filter((id) => !seen.has(id)))];
}

/* ==================================================================== */
/* You can make                                                         */
/* ==================================================================== */

/** The basics' payoff on an empty bar: three classics they make, lit. */
const EXAMPLES = ['daiquiri', 'old-fashioned', 'martini'];
let examples: Drink[] | null = null;

export function basicsExamples(): Drink[] {
  if (!examples) {
    const pours = basicsResult().makeable.map((m) => m.drink);
    const named = EXAMPLES.flatMap((id) => pours.filter((d) => d.id === id));
    const photographed = pours.filter((d) => drinkPhoto(d.id) && !named.includes(d));
    examples = [...named, ...photographed].slice(0, 3);
  }
  return examples;
}

/** New to your Dex first, then the photographed, then the Dex's own order. */
export function rankDrinks(drinks: readonly Drink[], inDex: (d: Drink) => boolean): Drink[] {
  return [...drinks].sort(
    (a, b) =>
      Number(inDex(a)) - Number(inDex(b)) ||
      Number(!drinkPhoto(a.id)) - Number(!drinkPhoto(b.id)) ||
      a.dexNumber - b.dexNumber,
  );
}

/**
 * The strip under "You can make": what the last tick unlocked, then the
 * rest new to your Dex first, the photographed before the drawn (the
 * strip is the showcase; "See all" has everything A to Z), at most
 * `max`. Ranked by the Dex only once it has loaded, so the strip never
 * reshuffles at launch.
 */
export function stripOf({
  result,
  justLit,
  inDex,
  dexReady,
  max,
}: {
  result: BarResult;
  justLit: readonly Drink[];
  inDex: (d: Drink) => boolean;
  dexReady: boolean;
  max: number;
}): Drink[] {
  const makeable = result.makeable.map((m) => m.drink);
  const can = new Set(makeable.map((d) => d.id));
  const lead = rankDrinks(
    justLit.filter((d) => can.has(d.id)),
    inDex,
  );
  const leadIds = new Set(lead.map((d) => d.id));
  // Before the Dex has loaded nobody is "in" it, so the order is photographs first and holds.
  const rest = rankDrinks(
    makeable.filter((d) => !leadIds.has(d.id)),
    dexReady ? inDex : () => false,
  );
  return [...lead, ...rest].slice(0, max);
}

/* ==================================================================== */
/* One ingredient away                                                  */
/* ==================================================================== */

/** A One ingredient away row as drawn now: its frozen place, with live numbers. */
export interface AwayRow {
  drink: Drink;
  need: Ingredient;
  /** The need is in your bar now (its Add, or a tick above). */
  owned: boolean;
  /** You can make the drink now. */
  made: boolean;
  /** Still one away, and the need is what completes it (false once made, or two away since a tick above). */
  short: boolean;
  /** What adding the need pours now, this drink included (full-slot, gainOf). */
  pours: number;
}

/** The best bottle's card as drawn now. */
export interface BestCard {
  ingredient: Ingredient;
  drinks: readonly Drink[];
  /** In your bar now: the card keeps its words and its place; its stock and its toggle's mark say so. */
  owned: boolean;
}

/**
 * One ingredient away as shown: the snapshot's rows and best bottle (or
 * the live ones, before any Add down there has frozen them), each with
 * live numbers. A row that is made since stays where it stood, lit, until
 * the next snapshot; one that is new since joins on the next snapshot.
 */
export function awayRows({
  snap,
  result,
  owned,
  shown,
  inDex,
}: {
  snap: Snapshot;
  result: BarResult;
  owned: Record<string, true>;
  shown: number;
  inDex: (d: Drink) => boolean;
}): { rows: AwayRow[]; best: BestCard | null; more: number } {
  const source = snap.frozen ? snap : awayOf(result, inDex);
  const can = new Set(result.makeable.map((m) => m.drink.id));
  const rows = source.away.slice(0, shown).flatMap(({ drink, need }) => {
    const ingredient = INGREDIENTS_BY_ID[need];
    if (!ingredient) return [];
    const completes = result.gains.get(need) ?? [];
    return [
      {
        drink,
        need: ingredient,
        owned: !!owned[need],
        made: can.has(drink.id),
        short: completes.some((m) => m.drink.id === drink.id),
        pours: completes.length,
      },
    ];
  });
  const bestIngredient = source.best ? INGREDIENTS_BY_ID[source.best.id] : undefined;
  const best =
    source.best && bestIngredient
      ? { ingredient: bestIngredient, drinks: source.best.drinks, owned: !!owned[source.best.id] }
      : null;
  return { rows, best, more: Math.max(0, source.away.length - shown) };
}
