import { getDrink } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import type { Drink, UnlockRecord } from '@/types';

/* ==================================================================== */
/* First tastes                                                         */
/*                                                                      */
/* The drinks the signed-out Home asks about ("What do you drink?"): 24 */
/* classics a new person is likely to have ordered, across rum, tequila,*/
/* vodka, gin, whiskey, aperitifs and sparkling, so nearly anyone finds */
/* three. Piña Colada and Coquito lead on purpose: Sipply launches in   */
/* Puerto Rico.                                                         */
/*                                                                      */
/* PHOTOGRAPHED ONLY. Every id here has a re-lit catalogue photograph   */
/* (data/drinkPhotos), so the grid never sets a vector face beside a    */
/* photo. FIRST_TASTES drops any id that loses its drink or its photo,  */
/* so a catalogue edit thins the grid instead of breaking it.           */
/* ==================================================================== */

const IDS = [
  'pina-colada',
  'margarita',
  'espresso-martini',
  'mojito',
  'aperol-spritz',
  'old-fashioned',
  'negroni',
  'paloma',
  'cosmopolitan',
  'whiskey-sour',
  'moscow-mule',
  'daiquiri',
  'coquito',
  'french-75',
  'mai-tai',
  'manhattan',
  'martini',
  'gin-and-tonic',
  'cuba-libre',
  'caipirinha',
  'dark-n-stormy',
  'bloody-mary',
  'mimosa',
  'pisco-sour',
] as const;

/** The picker's drinks, in order, each with a photograph. */
export const FIRST_TASTES: readonly Drink[] = IDS.map((id) => getDrink(id)).filter(
  (d): d is Drink => d !== undefined && drinkPhoto(d.id) !== undefined,
);

/** How many picks start a Dex. Three is the minimum; there is no maximum. */
export const TASTES_TO_START = 3;

/**
 * The line under a picked-from drink's name: its base and where it is
 * from, "White rum · Puerto Rico". The origin's last part is the country
 * ("San Juan, Puerto Rico"), which is what a person recognises at a glance.
 */
export function tasteMeta(drink: Drink): string {
  const base = drink.ingredients?.[0] ?? '';
  const country = drink.origin.split(',').pop()?.trim() ?? '';
  return [base, country].filter(Boolean).join(' · ');
}

/** The same line for VoiceOver: the dot is for the eye. */
export function tasteMetaSpoken(drink: Drink): string {
  return tasteMeta(drink).split(' · ').join(', ');
}

/**
 * The newest `n` entries in a Dex, newest first, catalogue drinks only:
 * what the sign-in backdrop shows a person whose Dex has already begun.
 */
export function latestDexIds(unlocks: Record<string, UnlockRecord>, n: number): string[] {
  return Object.values(unlocks)
    .filter((r) => getDrink(r.drinkId) !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, n)
    .map((r) => r.drinkId);
}
