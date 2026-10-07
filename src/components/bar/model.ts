import { shelfOf, type ShelfKey, SHELF_ORDER } from '@/data/barShelf';
import { drinkPhoto } from '@/data/drinkPhotos';
import { type BarResult, BASICS, basicsResult, INGREDIENTS_BY_ID, matchOwned } from '@/lib/bar';
import type { Drink } from '@/types';

import type { ShortGroup } from './Counter';
import { sortForShelves } from './layout';

/* ==================================================================== */
/* What My Bar shows, worked out from the shelf                         */
/*                                                                      */
/* Pure functions of the shelf and its match result, kept out of the    */
/* screen so the order rules sit in one place.                          */
/* ==================================================================== */

/**
 * The order the screen holds still while you tap. Taken when the tab
 * loses focus (and when the shelf first loads from disk), never on a tap:
 * a bottle you take off stays where it stood.
 */
export interface Snapshot {
  mode: 'empty' | 'stocked';
  /** Each shelf's bays, left to right (the suggestion last). */
  order: Record<ShelfKey, string[]>;
  /** The unlit next buy at each shelf's end. */
  suggestion: Record<ShelfKey, string | null>;
  /** One thing short, in rank order; empty while it is still live. */
  groups: string[];
  /** What each group poured when the order was taken, for a row that is Added since. */
  pours: Record<string, readonly Drink[]>;
}

const NO_SUGGESTION: Record<ShelfKey, string | null> = { spirits: null, middle: null, rail: null };

/** One thing short's order and what each group pours, from a result. */
export function groupsOf(result: BarResult): Pick<Snapshot, 'groups' | 'pours'> {
  const groups = result.nextBest.map((n) => n.ingredient.id);
  const pours: Record<string, readonly Drink[]> = {};
  for (const id of groups) pours[id] = (result.gains.get(id) ?? []).map((m) => m.drink);
  return { groups, pours };
}

export function takeSnapshot(owned: Record<string, true>): Snapshot {
  const ids = Object.keys(owned).filter((id) => INGREDIENTS_BY_ID[id]);
  if (!ids.length) {
    return { mode: 'empty', order: sortForShelves(BASICS), suggestion: NO_SUGGESTION, groups: [], pours: {} };
  }
  const result = matchOwned(owned);
  const suggestion: Record<ShelfKey, string | null> = { ...NO_SUGGESTION };
  // The top next buy that belongs on each shelf: canonical, so a family is one bottle.
  for (const { ingredient } of result.nextBest) {
    const shelf = shelfOf(ingredient);
    if (!suggestion[shelf]) suggestion[shelf] = ingredient.id;
  }
  const order = sortForShelves(ids);
  for (const s of SHELF_ORDER) {
    const tail = suggestion[s];
    if (tail) order[s].push(tail);
  }
  return { mode: 'stocked', order, suggestion, ...groupsOf(result) };
}

/**
 * The snapshot's bays plus anything put on the shelf since (from the
 * sheet or a row), each at its shelf's end in the order it was added.
 */
export function withExtras(snap: Snapshot, owned: Record<string, true>): Record<ShelfKey, string[]> {
  const order: Record<ShelfKey, string[]> = {
    spirits: [...snap.order.spirits],
    middle: [...snap.order.middle],
    rail: [...snap.order.rail],
  };
  const seen = new Set(SHELF_ORDER.flatMap((s) => snap.order[s]));
  for (const id of Object.keys(owned)) {
    const i = INGREDIENTS_BY_ID[id];
    if (i && !seen.has(id)) order[shelfOf(i)].push(id);
  }
  return order;
}

/** The basics' payoff on an empty shelf: three classics they pour, lit. */
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
 * The strip under "Pour tonight": what the last change lit, then the rest
 * new to your Dex first, the photographed before the drawn (the strip is
 * the counter's showcase; "See all" has everything A to Z), at most
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

/**
 * One thing short's groups as shown: the snapshot's order (or the live
 * one, before any row has been used), each with what it would pour, or,
 * once it is on the shelf, what it lit.
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
   * then the family-slot drinks it also pours, and last the ones a row
   * above already showed. The count stays the full gain, what Add pours.
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
