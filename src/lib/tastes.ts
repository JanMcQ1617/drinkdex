import { getDrink } from '@/data';
import { photoFor } from '@/data/drinkPhotos';
import type { Drink, UnlockRecord } from '@/types';

/* ==================================================================== */
/* First tastes                                                         */
/*                                                                      */
/* 24 classics a new person is likely to have ordered, across rum,      */
/* tequila, vodka, gin, whiskey, aperitifs and sparkling. Piña Colada   */
/* and Coquito lead on purpose: Sipply launches in Puerto Rico.         */
/*                                                                      */
/* Since v4.1 they are the onboarding's welcome wall (FIRST_TASTES),    */
/* and the recommender's "well known" signal and tie-break, in this     */
/* order (FIRST_TASTE_IDS, read by lib/recommend). The reference        */
/* recommender (specs/v4-onboarding/tools/recommend.mjs) reads the id   */
/* list below straight out of this file by a regular expression, so     */
/* keep it one literal list of quoted ids, as it is.                    */
/*                                                                      */
/* PHOTOGRAPHED ONLY. Every id here has a re-lit catalogue photograph   */
/* (data/drinkPhotos), so the wall never sets a vector face beside a    */
/* photo. FIRST_TASTES drops any id that loses its drink or its photo,  */
/* so a catalogue edit thins the wall instead of breaking it.           */
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

/**
 * Every curated id, in order, unfiltered: the recommender's known list
 * (spec §5.3, K and the tie-break), exactly as the reference reads it.
 */
export const FIRST_TASTE_IDS: readonly string[] = IDS;

/** The curated drinks, in order, each with a photograph. */
export const FIRST_TASTES: readonly Drink[] = IDS.map((id) => getDrink(id)).filter(
  (d): d is Drink => d !== undefined && photoFor(d.id) !== undefined,
);

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
