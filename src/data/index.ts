import { CATEGORY_ORDER } from '@/constants/theme';
import type { Drink, DrinkCategory, Rarity } from '@/types';

import raw from './drinks.json';

/** Full index, sorted by dex number. */
export const DRINKS: Drink[] = (raw as unknown as Drink[])
  .slice()
  .sort((a, b) => a.dexNumber - b.dexNumber);

export const TOTAL = DRINKS.length;

/*
 * Built on a null prototype, and read through getDrink(), never by bare
 * index. A drink id arrives from places the app does not control — a
 * post's drink_id is free text, and drinkdex://drink/<id> is a public
 * deep link — and on an ordinary object DRINKS_BY_ID['constructor'] is the
 * Object function: truthy, so every `if (!drink)` guard waves it through,
 * and the first `drink.category` read crashes the screen. One post with
 * that id would crash the feed of everyone following its author.
 */
const BY_ID: Record<string, Drink> = Object.assign(
  Object.create(null) as Record<string, Drink>,
  Object.fromEntries(DRINKS.map((d) => [d.id, d])),
);

export const DRINKS_BY_ID: Readonly<Record<string, Drink>> = BY_ID;

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The drink with this id, or undefined — safe for any string, including hostile ones. */
export function getDrink(id: string | null | undefined): Drink | undefined {
  return typeof id === 'string' && hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

export const DRINKS_BY_CATEGORY: Record<DrinkCategory, Drink[]> = CATEGORY_ORDER.reduce(
  (acc, cat) => {
    acc[cat] = DRINKS.filter((d) => d.category === cat);
    return acc;
  },
  {} as Record<DrinkCategory, Drink[]>
);

export const COUNT_BY_CATEGORY: Record<DrinkCategory, number> = CATEGORY_ORDER.reduce(
  (acc, cat) => {
    acc[cat] = DRINKS_BY_CATEGORY[cat].length;
    return acc;
  },
  {} as Record<DrinkCategory, number>
);

/** @deprecated rarity, removed in v3.1; nothing reads it, and the close-out deletes it. */
export const COUNT_BY_RARITY: Record<Rarity, number> = DRINKS.reduce(
  (acc, d) => {
    acc[d.rarity] = (acc[d.rarity] ?? 0) + 1;
    return acc;
  },
  { common: 0, uncommon: 0, rare: 0, legendary: 0 } as Record<Rarity, number>
);

/*
 * As many digits as the highest dex number has, so every number in the
 * index is the same width. It was padded to three from the first scaffold,
 * when the index was under a thousand; past that, over half the entries
 * printed four digits beside others' three — "#042" next to "#1042" — and
 * the padding was fixing a width it no longer fixed.
 *
 * Read from the data rather than from TOTAL, because the generator can
 * leave gaps in the numbering.
 */
const DEX_DIGITS = String(DRINKS[DRINKS.length - 1]?.dexNumber ?? 0).length;

/** "#0042"-style dex number formatting. */
export function formatDexNumber(n: number): string {
  return `#${String(n).padStart(DEX_DIGITS, '0')}`;
}

/**
 * Grouped thousands — "2,089", not "2089".
 *
 * The index passed four figures a long time ago and the bare numerals had
 * stopped being readable at a glance: "2089 collected" is parsed, whereas
 * "2,089" is just seen. Every count the app shows is a magnitude the user
 * is meant to feel, so they all get separators.
 *
 * Hardcoded en-US grouping rather than toLocaleString(): React Native
 * ships without full ICU on Android unless you opt into the larger JSC
 * build, so the locale-aware version silently returns UNGROUPED digits
 * there while looking correct on iOS.
 */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
