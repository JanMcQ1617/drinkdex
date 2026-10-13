import { DRINKS } from '@/data';
import rawIndex from '@/data/barIndex.json';
import classicsFile from '@/data/classics.json';
import { photoFor } from '@/data/drinkPhotos';
import {
  createRecommender,
  FLAVOURS,
  PICKS,
  SPIRITS,
  STYLES as CORE_STYLES,
  W,
  W_CLASSIC,
  type RecIngredient,
  type RecRecipe,
} from '@/lib/recommendCore';
import { computeDexFronts, frontsKey } from '@/lib/dexOrder';
import { FIRST_TASTE_IDS } from '@/lib/tastes';
import { MY_BAR_ENABLED } from '@/lib/myBar';
import { useBar } from '@/store/bar';
import { useCollection } from '@/store/collection';
import { provideDexFronts, useTaste, type StyleOf, type TasteAnswers } from '@/store/taste';
import type { UnlockRecord } from '@/types';

/* ==================================================================== */
/* Drink picks, on the phone                                            */
/*                                                                      */
/* lib/recommendCore (the port of the reference recommender, spec §5;   */
/* specs/v4.2/tools/recommend.mjs since v4.2's fruity and sour cap)     */
/* bound to the app's own data: the catalogue in Dex order (@/data, the */
/* reference's pool order), the bar index's ingredients and recipes,    */
/* the drinks photoFor() has a print for, and lib/tastes' curated ids   */
/* (the "well known" signal and the tie-break). No network, no server,  */
/* no model: one run walks the 2,089 drinks in a few milliseconds, and  */
/* the same answers give the same picks on every phone.                 */
/*                                                                      */
/* The classics weight comes from data/classics.json, which             */
/* scripts/check-recommend.mjs --write works out from the catalogue     */
/* (the app never reads the field it is made from; check-design rule    */
/* 14). That script also proves this core gives the reference's answers */
/* to the bit, on runs A to D and a 2,000-case sweep.                   */
/*                                                                      */
/* THE TWO BAR COUNTS (v4.1 §2.2). The picks' "you can make it" is the  */
/* reference's exact-id missingCount, here. The bar step's card counts  */
/* with lib/bar's matchBar, so it agrees with what My Bar then says.    */
/* The two agree on every example run (check-recommend prints them):    */
/*   run A's bar: 17 and 17; its pre-ticked rows alone: 13 and 13;      */
/*   the pre-ticked rows of B, C and D: 3, 8 and 5, both ways.          */
/*                                                                      */
/* THE DEX'S FRONTS (v4.2 §2.2) are this recommender too: each For-you  */
/* section opens on recommend(answers, 12) inside the section. This     */
/* module hands store/taste the worker at its foot (provideDexFronts),  */
/* because the store cannot import this module: this one imports it.    */
/* ==================================================================== */

export type { Flavour, Goal, HeardFrom, HomeAnswer, OnboardingStep, Spirit, StyleOf, TasteAnswers } from '@/store/taste';
export type { RecAnswers, RecDrink, Scored } from '@/lib/recommendCore';

export interface Pick {
  id: string; name: string; dexNumber: number; category: 'cocktail' | 'spirit'; subcategory: string;
  abv: string | undefined; photo: boolean; makeNow: boolean; why: string; score: number;
}
export interface BarRow { id: string; label: string; ticked: boolean }

export { FLAVOURS, PICKS, SPIRITS, W, W_CLASSIC };
// keys: bourbon rye scotch irish japanese · white aged agricole spiced · blanco reposado anejo mezcal
export const STYLES: Record<StyleOf, Record<string, { label: string; ids: string[] }>> = CORE_STYLES;

const index = rawIndex as unknown as { ingredients: RecIngredient[]; recipes: RecRecipe[] };

/** The classics weight per drink id; an id not listed is 0. Null prototype: any string is safe to look up. */
const CLASSICS: Record<string, number> = Object.create(null);
for (const [weight, ids] of Object.entries((classicsFile as { classic: Record<string, string[]> }).classic)) {
  for (const id of ids) CLASSICS[id] = Number(weight);
}

const PHOTO_IDS: ReadonlySet<string> = new Set(DRINKS.filter((d) => photoFor(d.id) !== undefined).map((d) => d.id));

const core = createRecommender({
  drinks: DRINKS,
  ingredients: index.ingredients,
  recipes: index.recipes,
  photoIds: PHOTO_IDS,
  knownIds: FIRST_TASTE_IDS,
  classics: CLASSICS,
});

export const {
  abvOf,
  baseSpirit,
  spiritHits,
  flavourHit,
  missingCount,
  makeableCount,
  score,
  familyKey,
  shareKey,
  whyLine,
} = core;

/*
 * recommend() is remembered for its last answers, exclusions and count, by
 * identity: the results step and a re-render with the same answers get the
 * same array back, not a second walk of the catalogue.
 */
let lastPicks: {
  answers: TasteAnswers & { exclude?: readonly string[] };
  exclude: readonly string[] | undefined;
  n: number;
  picks: Pick[];
} | null = null;

/** The picks for these answers, best six by default (spec §5.3, §5.4). */
export function recommend(answers: TasteAnswers & { exclude?: readonly string[] }, n: number = PICKS): Pick[] {
  if (lastPicks && lastPicks.answers === answers && lastPicks.exclude === answers.exclude && lastPicks.n === n) {
    return lastPicks.picks;
  }
  const picks = core.recommend(answers, n);
  lastPicks = { answers, exclude: answers.exclude, n, picks };
  return picks;
}

/** The pour step's collage: photographed ids, best first, topped up from the curated classics. */
export function collage(answers: TasteAnswers, n?: number): string[] {
  return core.collage(answers, n);
}

/** The flavour step's card: drinks in the Dex that match the answers so far. */
export function matchingCount(answers: TasteAnswers): number {
  return core.matchingCount(answers);
}

/** The bar step's eight tiles, the spirits and basics ticked (spec §5.5). */
export function barRows(answers: TasteAnswers): BarRow[] {
  return core.barRows(answers);
}

/*
 * The picks after onboarding, kept current: worked out again only when
 * the answers, My Bar or the Dex change (by identity, as lib/bar's
 * matchOwned is), never per render.
 */
let lastForYou: {
  answers: TasteAnswers;
  owned: Record<string, true>;
  unlocks: Record<string, UnlockRecord>;
  picks: Pick[];
} | null = null;

function forYou(
  answers: TasteAnswers,
  owned: Record<string, true>,
  unlocks: Record<string, UnlockRecord>,
): Pick[] {
  if (lastForYou && lastForYou.answers === answers && lastForYou.owned === owned && lastForYou.unlocks === unlocks) {
    return lastForYou.picks;
  }
  const picks = core.recommend({ ...answers, bar: Object.keys(owned), exclude: Object.keys(unlocks) });
  lastForYou = { answers, owned, unlocks, picks };
  return picks;
}

/**
 * recommend() with exclude = the Dex's unlock ids, memoised. The bar is
 * My Bar's bottles: the bar step wrote answers.bar into My Bar, and a
 * bottle added or taken out since changes what "you can make it" says
 * (spec §5.7). A drink caught since drops out of the picks.
 */
const NO_BAR: Record<string, true> = {};

export function useRecommendations(): Pick[] {
  const answers = useTaste((s) => s.answers);
  const owned = useBar((s) => s.owned);
  const unlocks = useCollection((s) => s.unlocks);
  // With My Bar hidden there is no bar to make anything from, so no pick
  // says "You can make it" (lib/myBar.ts).
  return forYou(answers, MY_BAR_ENABLED ? owned : NO_BAR, unlocks);
}

/* ==================================================================== */
/* The Dex's fronts, worked by this recommender (v4.2 §2.2)             */
/* ==================================================================== */

/*
 * What the fronts read that tasteTags' stamp cannot see: which drinks
 * have a photograph (the openers are photographed) and lib/tastes'
 * curated ids, in order (the well-known signal and its tie-break).
 * classics.json needs nothing here: it is worked from drinks.json, which
 * the stamp hashes. FNV-1a over both lists, worked once: a build that
 * adds photographs works every phone's fronts out again, and two phones
 * on one build agree.
 */
const DATA_STAMP = (() => {
  const text = `${[...PHOTO_IDS].sort().join(',')}|${FIRST_TASTE_IDS.join(',')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
})();

/*
 * core.recommend, not this module's remembered recommend(): the fronts'
 * six calls would otherwise push the results step's picks out of it.
 */
provideDexFronts({
  key: (answers) => frontsKey(answers, DATA_STAMP),
  compute: (answers) => computeDexFronts(answers, core.recommend, frontsKey(answers, DATA_STAMP)),
});
