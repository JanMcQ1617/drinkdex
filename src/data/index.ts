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
