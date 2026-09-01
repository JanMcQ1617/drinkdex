import { CATEGORY_ORDER } from '@/constants/theme';
import type { Drink, DrinkCategory, Rarity } from '@/types';

import raw from './drinks.json';

/** Full index, sorted by dex number. */
export const DRINKS: Drink[] = (raw as unknown as Drink[])
  .slice()
  .sort((a, b) => a.dexNumber - b.dexNumber);

export const TOTAL = DRINKS.length;

export const DRINKS_BY_ID: Record<string, Drink> = Object.fromEntries(
  DRINKS.map((d) => [d.id, d])
);

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

export const COUNT_BY_RARITY: Record<Rarity, number> = DRINKS.reduce(
  (acc, d) => {
    acc[d.rarity] = (acc[d.rarity] ?? 0) + 1;
    return acc;
  },
  { common: 0, uncommon: 0, rare: 0, legendary: 0 } as Record<Rarity, number>
);

/** "#042"-style dex number formatting. */
export function formatDexNumber(n: number): string {
  return `#${String(n).padStart(3, '0')}`;
}

/**
 * Grouped thousands — "7,653", not "7653".
 *
 * The index passed four figures a long time ago and the bare numerals had
 * stopped being readable at a glance: "7653 collected" is parsed, whereas
 * "7,653" is just seen. Every count the app shows is a magnitude the user
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
