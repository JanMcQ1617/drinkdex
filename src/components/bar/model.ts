import { drinkPhoto } from '@/data/drinkPhotos';
import {
  type BarResult,
  basicsResult,
  browseIngredients,
  gainOf,
  INGREDIENTS_BY_ID,
  type Ingredient,
  type IngredientCategory,
  matchOwned,
  reachOf,
} from '@/lib/bar';
import type { Drink } from '@/types';

import type { ShortGroup } from './Counter';

/* ==================================================================== */
/* What My Bar shows, worked out from your bar                          */
/*                                                                      */
/* Pure functions of what you own and its match result, kept out of the */
/* screen so the order rules sit in one place.                          */
/* ==================================================================== */

/**
 * The order the screen holds still while you tick. Taken when another
 * tab takes the front (and when the bar first loads from disk, and after
 * Clear), never on a tick: a row you tick stays where it stood.
 */
export interface Snapshot {
  /**
   * Which taking this is. The picker takes its own order again when it
   * changes; a row's Add, which only fills in `groups`, keeps it, so
   * adding from One ingredient away never reshuffles the checklist above.
   */
  taken: number;
  /** One ingredient away, in rank order; empty while it is still live. */
  groups: string[];
  /** What each group made when the order was taken, for a row that is Added since. */
  pours: Record<string, readonly Drink[]>;
}

let taken = 0;

/** One ingredient away's order and what each group makes, from a result. */
export function groupsOf(result: BarResult): Pick<Snapshot, 'groups' | 'pours'> {
  const groups = result.nextBest.map((n) => n.ingredient.id);
  const pours: Record<string, readonly Drink[]> = {};
  for (const id of groups) pours[id] = (result.gains.get(id) ?? []).map((m) => m.drink);
  return { groups, pours };
}

export function takeSnapshot(owned: Record<string, true>): Snapshot {
  taken += 1;
  const ids = Object.keys(owned).filter((id) => INGREDIENTS_BY_ID[id]);
  if (!ids.length) return { taken, groups: [], pours: {} };
  return { taken, ...groupsOf(matchOwned(owned)) };
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

/**
 * One ingredient away's groups as shown: the snapshot's order (or the
 * live one, before any row has been used), each with what it would make,
 * or, once it is in your bar, what it unlocked.
 */
export function shortGroups({
  snap,
  result,
  owned,
  litBy,
  shown,
  inDex,
}: {
  snap: Snapshot;
  result: BarResult;
  owned: Record<string, true>;
  litBy: Readonly<Record<string, readonly Drink[]>>;
  shown: number;
  inDex: (d: Drink) => boolean;
}): { groups: ShortGroup[]; more: number } {
  const source = snap.groups.length ? snap : groupsOf(result);
  const can = new Set(result.makeable.map((m) => m.drink.id));
  /*
   * Each row names first the drinks that name its own thing (its canonical
   * group: the Applejack Sour before the brandy slot's Brandy Smash),
   * then the family-slot drinks it also makes, and last the ones a row
   * above already showed. The count stays the full gain, what Add unlocks.
   */
  const seen = new Set<string>();
  const groups = source.groups.slice(0, shown).flatMap((id) => {
    const ingredient = INGREDIENTS_BY_ID[id];
    if (!ingredient) return [];
    const added = !!owned[id];
    const matches = added ? null : (result.gains.get(id) ?? []);
    const drinks = matches
      ? matches.map((m) => m.drink)
      : (litBy[id] ?? (source.pours[id] ?? []).filter((d) => can.has(d.id)));
    const named = new Set(matches?.filter((m) => m.missing[0] === id).map((m) => m.drink.id));
    const ranked = rankDrinks(drinks, inDex);
    const tier = (d: Drink) => (seen.has(d.id) ? 2 : named.has(d.id) || !matches ? 0 : 1);
    const ordered = [0, 1, 2].flatMap((t) => ranked.filter((d) => tier(d) === t));
    for (const d of drinks) seen.add(d.id);
    return [{ ingredient, added, drinks: ordered }];
  });
  return { groups, more: Math.max(0, source.groups.length - shown) };
}
