import { DRINKS, getDrink } from '@/data';
import tagsFile from '@/data/tasteTags.json';
import type { RecAnswers } from '@/lib/recommendCore';
import type { DexFronts, DexFrontSection, Flavour, Spirit, TasteAnswers } from '@/store/taste';
import type { Drink, DrinkCategory } from '@/types';

/* ==================================================================== */
/* The Dex's taste chips and its For-you order                          */
/*                                                                      */
/* A port of specs/v4.2/tools/dex-order.mjs (spec §1 and §2): what a    */
/* chip holds, how chips combine, the faceted counts, the sections'     */
/* fronts and the one total order behind every For-you grid.            */
/* scripts/check-recommend.mjs transpiles this file and checks it       */
/* against that reference: the fronts, the total order and the counts.  */
/*                                                                      */
/* NOTHING IS SCORED HERE AT RUNTIME. Membership and every count are    */
/* bit tests over data/tasteTags.json, one integer per catalogue id,    */
/* which scripts/check-recommend.mjs --write works out from the scorer  */
/* (lib/recommendCore) and checks in step on every run. The one thing   */
/* that needs the recommender itself, a section's best 12, is worked    */
/* when the answers change (store/taste's dexFronts, through the worker */
/* lib/recommend provides) and read back here from the store.           */
/*                                                                      */
/* The bits, per id:                                                    */
/*   0-6    the seven flavour chips, FLAVOUR_ORDER: flavourHit >= 0.5,  */
/*          "the scorer says it at least once" (spec §1.3)              */
/*   7-13   the seven spirit chips, SPIRIT_ORDER: spiritHits = 1, the   */
/*          spirit is the base or the bottle is one (never the 0.6 "it  */
/*          is somewhere in the recipe")                                */
/*   14     a cocktail                                                  */
/*   15-21  the flavour said plainly: flavourHit = 1. A drink's section */
/*          is the key it hits hardest, ties to the earlier answer      */
/*          (§2.2), and a hit is only ever 0, 0.5 or 1, so the chip bit */
/*          and this one are the whole of it: the For-you order on the  */
/*          phone is the reference's, drink for drink.                  */
/*                                                                      */
/* DETERMINISTIC: no randomness, no clock. The same answers give the    */
/* same Dex on every phone.                                             */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* The vocabulary: the first run's own words (v4.1 §1.2, v4.2 §1.1)    */
/* ------------------------------------------------------------------ */

/** The flavour chips in sheet order, which is the first run's and tasteTags' bit order. */
export const FLAVOUR_ORDER: readonly Flavour[] = ['refreshing', 'sour', 'fruity', 'sweet', 'bitter', 'strong', 'creamy'];

/** A flavour chip's label: the first run's key, word for word (steps/copy.ts; check-recommend compares them). */
export const FLAVOUR_WORDS: Readonly<Record<Flavour, string>> = {
  refreshing: 'Refreshing',
  sour: 'Sour and citrusy',
  fruity: 'Fruity',
  sweet: 'Sweet',
  bitter: 'Bitter',
  strong: 'Strong and stirred',
  creamy: 'Creamy',
};

/** The spirit chips in sheet order, which is tasteTags' bit order. */
export const SPIRIT_ORDER: readonly Spirit[] = ['gin', 'rum', 'agave', 'whiskey', 'vodka', 'brandy', 'liqueur'];

export const SPIRIT_WORDS: Readonly<Record<Spirit, string>> = {
  gin: 'Gin',
  rum: 'Rum',
  agave: 'Tequila and mezcal',
  whiskey: 'Whiskey',
  vodka: 'Vodka',
  brandy: 'Brandy and cognac',
  liqueur: 'Liqueurs and amaro',
};

export type KindFilter = DrinkCategory | 'all';
/** `unlocked` is Caught and `locked` Not yet, as the Dex's filters have always said it. */
export type StatusFilter = 'all' | 'unlocked' | 'locked';

export const KIND_WORDS: Readonly<Record<DrinkCategory, string>> = { cocktail: 'Cocktails', spirit: 'Spirits' };
export const STATUS_WORDS: Readonly<Record<Exclude<StatusFilter, 'all'>, string>> = { unlocked: 'Caught', locked: 'Not yet' };

/**
 * What the chips hold (spec §1.3): OR inside a group, AND across groups.
 * Flavours and spirits take any number; kind and caught one or none.
 * components/dex/dexFilter's filter object is this shape.
 */
export interface ChipFilter {
  flavours: readonly Flavour[];
  spirits: readonly Spirit[];
  kind: KindFilter;
  status: StatusFilter;
}

export const NO_FILTER: ChipFilter = { flavours: [], spirits: [], kind: 'all', status: 'all' };

/** True when any chip is on: the grid goes flat (§2.4) and the sliders glyph is filled (§1.4). */
export function filterIsOn(f: ChipFilter): boolean {
  return f.flavours.length > 0 || f.spirits.length > 0 || f.kind !== 'all' || f.status !== 'all';
}

/** One chip, wherever it is drawn: the sheet, the quick row, an empty grid's line. */
export type Chip =
  | { group: 'flavour'; key: Flavour }
  | { group: 'spirit'; key: Spirit }
  | { group: 'kind'; key: DrinkCategory }
  | { group: 'status'; key: Exclude<StatusFilter, 'all'> };

/** A chip's label. */
export function chipWord(c: Chip): string {
  switch (c.group) {
    case 'flavour':
      return FLAVOUR_WORDS[c.key];
    case 'spirit':
      return SPIRIT_WORDS[c.key];
    case 'kind':
      return KIND_WORDS[c.key];
    case 'status':
      return STATUS_WORDS[c.key];
  }
}

/** Whether this chip is on in the filter. */
export function chipOn(f: ChipFilter, c: Chip): boolean {
  switch (c.group) {
    case 'flavour':
      return f.flavours.includes(c.key);
    case 'spirit':
      return f.spirits.includes(c.key);
    case 'kind':
      return f.kind === c.key;
    case 'status':
      return f.status === c.key;
  }
}

/**
 * The filter after a tap on this chip. Flavours and spirits toggle and
 * keep sheet order (so two people with the same chips on have the same
 * filter); kind and caught are one or none, so a tap on the one that is
 * on turns its group off.
 */
export function toggleChip(f: ChipFilter, c: Chip): ChipFilter {
  switch (c.group) {
    case 'flavour': {
      const on = f.flavours.includes(c.key);
      return { ...f, flavours: FLAVOUR_ORDER.filter((x) => (x === c.key ? !on : f.flavours.includes(x))) };
    }
    case 'spirit': {
      const on = f.spirits.includes(c.key);
      return { ...f, spirits: SPIRIT_ORDER.filter((x) => (x === c.key ? !on : f.spirits.includes(x))) };
    }
    case 'kind':
      return { ...f, kind: f.kind === c.key ? 'all' : c.key };
    case 'status':
      return { ...f, status: f.status === c.key ? 'all' : c.key };
  }
}

/** Every chip that is on, in sheet order: "Sour and citrusy, Fruity, Cocktails" for an empty grid (§2.4). */
export function chipsOn(f: ChipFilter): Chip[] {
  const out: Chip[] = [];
  for (const key of FLAVOUR_ORDER) if (f.flavours.includes(key)) out.push({ group: 'flavour', key });
  for (const key of SPIRIT_ORDER) if (f.spirits.includes(key)) out.push({ group: 'spirit', key });
  if (f.kind !== 'all') out.push({ group: 'kind', key: f.kind });
  if (f.status !== 'all') out.push({ group: 'status', key: f.status });
  return out;
}

const QUICK_MAX = 8;

/**
 * The quick chips under the field (spec §1.5), at most 8: every chip
 * that is on, in sheet order; then the person's own answers that are
 * off, their flavours in answer order, then their spirits; with no
 * answers, Cocktails, Spirits and Not yet, then the first two flavours.
 */
export function quickChips(f: ChipFilter, answers: Pick<TasteAnswers, 'flavours' | 'spirits'>): Chip[] {
  const out = chipsOn(f);
  const offer: Chip[] =
    answers.flavours.length > 0 || answers.spirits.length > 0
      ? [
          ...answers.flavours.map((key): Chip => ({ group: 'flavour', key })),
          ...answers.spirits.map((key): Chip => ({ group: 'spirit', key })),
        ]
      : [
          { group: 'kind', key: 'cocktail' },
          { group: 'kind', key: 'spirit' },
          { group: 'status', key: 'locked' },
          ...FLAVOUR_ORDER.slice(0, 2).map((key): Chip => ({ group: 'flavour', key })),
        ];
  for (const c of offer) {
    if (out.length >= QUICK_MAX) break;
    if (!out.some((x) => x.group === c.group && x.key === c.key)) out.push(c);
  }
  return out.slice(0, QUICK_MAX);
}

/* ------------------------------------------------------------------ */
/* The tags                                                            */
/* ------------------------------------------------------------------ */

interface TasteTagsFile {
  stamp: string;
  flavours: string[];
  spirits: string[];
  tags: Record<string, number>;
}

const FILE = tagsFile as unknown as TasteTagsFile;

/**
 * The catalogue and scorer the tags were worked out from (a hash of
 * drinks.json, barIndex.json and lib/recommendCore). It is part of every
 * fronts key, so a build that changes either works the fronts out again
 * instead of keeping the last build's.
 */
export const TAGS_STAMP: string = FILE.stamp;

/* Null prototype, as @/data's index is: a hostile id never finds Object.prototype. */
const TAGS: Record<string, number> = Object.assign(Object.create(null) as Record<string, number>, FILE.tags);

const FLAVOUR_BIT = 0;
const SPIRIT_BIT = 7;
// Bit 14, a cocktail, is checked against the catalogue by check-recommend; the filters here
// read a drink's own category, which a drink someone added has too.
const PLAIN_BIT = 15;

const FLAVOUR_INDEX = new Map(FLAVOUR_ORDER.map((f, i) => [f, i] as const));
const SPIRIT_INDEX = new Map(SPIRIT_ORDER.map((s, i) => [s, i] as const));

/** The id's tag; 0 for an id the catalogue does not have (a drink someone added holds no taste chip). */
const tagOf = (id: string): number => TAGS[id] ?? 0;
const bit = (tag: number, n: number) => (tag & (1 << n)) !== 0;

/** A flavour chip holds this drink: the scorer says it at least once (flavourHit >= 0.5). */
export function hasFlavour(id: string, f: Flavour): boolean {
  const i = FLAVOUR_INDEX.get(f);
  return i !== undefined && bit(tagOf(id), FLAVOUR_BIT + i);
}

/** A spirit chip holds this drink: its base, or the bottle itself (spiritHits = 1). */
export function hasSpirit(id: string, s: Spirit): boolean {
  const i = SPIRIT_INDEX.get(s);
  return i !== undefined && bit(tagOf(id), SPIRIT_BIT + i);
}

/** The scorer says this flavour plainly (flavourHit = 1): its family, or two signals. */
function saysPlainly(tag: number, i: number): boolean {
  return bit(tag, PLAIN_BIT + i);
}

/** How many catalogue drinks each chip holds on its own: a section's "See all" figure. */
const FLAVOUR_ALL = new Map<Flavour, number>(FLAVOUR_ORDER.map((f) => [f, 0]));
const SPIRIT_ALL = new Map<Spirit, number>(SPIRIT_ORDER.map((s) => [s, 0]));
for (const d of DRINKS) {
  const tag = tagOf(d.id);
  FLAVOUR_ORDER.forEach((f, i) => {
    if (bit(tag, FLAVOUR_BIT + i)) FLAVOUR_ALL.set(f, FLAVOUR_ALL.get(f)! + 1);
  });
  SPIRIT_ORDER.forEach((s, i) => {
    if (bit(tag, SPIRIT_BIT + i)) SPIRIT_ALL.set(s, SPIRIT_ALL.get(s)! + 1);
  });
}

/* ------------------------------------------------------------------ */
/* Filters: OR inside a group, AND across groups                        */
/* ------------------------------------------------------------------ */

/** Whether a drink is caught: the Dex passes `(id) => has(unlocks, id)`. */
export type IsCaught = (id: string) => boolean;

/** The drink fields a filter reads. A Drink has them; so does a drink someone added. */
type Filterable = Pick<Drink, 'id' | 'category'>;

const flavourPass = (f: ChipFilter, d: Filterable) => f.flavours.length === 0 || f.flavours.some((x) => hasFlavour(d.id, x));
const spiritPass = (f: ChipFilter, d: Filterable) => f.spirits.length === 0 || f.spirits.some((x) => hasSpirit(d.id, x));
const kindPass = (f: ChipFilter, d: Filterable) => f.kind === 'all' || d.category === f.kind;
const statusPass = (f: ChipFilter, d: Filterable, caught: IsCaught) =>
  f.status === 'all' || (f.status === 'unlocked' ? caught(d.id) : !caught(d.id));

/** The grid's test for one drink under these chips. */
export function matcher(f: ChipFilter, caught: IsCaught): (d: Filterable) => boolean {
  return (d) => flavourPass(f, d) && spiritPass(f, d) && kindPass(f, d) && statusPass(f, d, caught);
}

export interface FacetCounts {
  flavours: Record<Flavour, number>;
  spirits: Record<Spirit, number>;
  kind: Record<DrinkCategory, number>;
  /**
   * Caught and Not yet with the other groups as they are. Their sum is
   * the bar's "total" and `unlocked` its "caught" (§2.4: the bar's count
   * ignores Caught / Not yet).
   */
  status: Record<Exclude<StatusFilter, 'all'>, number>;
  /** What the grid holds now: "Show 525 drinks". */
  total: number;
}

/**
 * The sheet's counts (spec §1.3): a chip's figure is what the grid would
 * hold with that chip as its group's only choice and the other groups as
 * they are, so it answers "how many would I see". One pass over the
 * catalogue: each drink is tested once per group, and when it passes
 * every OTHER group it counts towards each of this group's chips that
 * holds it (its own group's choice is the chip being counted). The
 * reference counts with one pass per chip; the figures are the same
 * (check-recommend compares them).
 */
export function facetCounts(f: ChipFilter, caught: IsCaught, drinks: readonly Filterable[] = DRINKS): FacetCounts {
  const out: FacetCounts = {
    flavours: Object.fromEntries(FLAVOUR_ORDER.map((x) => [x, 0])) as Record<Flavour, number>,
    spirits: Object.fromEntries(SPIRIT_ORDER.map((x) => [x, 0])) as Record<Spirit, number>,
    kind: { cocktail: 0, spirit: 0 },
    status: { unlocked: 0, locked: 0 },
    total: 0,
  };
  for (const d of drinks) {
    const fl = flavourPass(f, d);
    const sp = spiritPass(f, d);
    const kd = kindPass(f, d);
    const st = statusPass(f, d, caught);
    const tag = tagOf(d.id);
    if (sp && kd && st) {
      FLAVOUR_ORDER.forEach((x, i) => {
        if (bit(tag, FLAVOUR_BIT + i)) out.flavours[x] += 1;
      });
    }
    if (fl && kd && st) {
      SPIRIT_ORDER.forEach((x, i) => {
        if (bit(tag, SPIRIT_BIT + i)) out.spirits[x] += 1;
      });
    }
    if (fl && sp && st) out.kind[d.category] += 1;
    if (fl && sp && kd) out.status[caught(d.id) ? 'unlocked' : 'locked'] += 1;
    if (fl && sp && kd && st) out.total += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* For you: the fronts                                                  */
/* ------------------------------------------------------------------ */

/** A section key: a flavour the person picked, or (with none) a spirit. */
export type SectionKey = { kind: 'flavour'; key: Flavour } | { kind: 'spirit'; key: Spirit };

/** The section keys (§2.2, 1): the flavours in answer order; with none, the spirits; with neither, no For you. */
export function sectionKeys(answers: Pick<TasteAnswers, 'flavours' | 'spirits'>): SectionKey[] {
  if (answers.flavours.length > 0) return answers.flavours.map((key): SectionKey => ({ kind: 'flavour', key }));
  if (answers.spirits.length > 0) return answers.spirits.map((key): SectionKey => ({ kind: 'spirit', key }));
  return [];
}

/**
 * The section a drink belongs to (§2.2, 2): the key it hits hardest,
 * ties to the earlier answer; -1 below the chip line in every key. A
 * flavour hit is 0, 0.5 or 1, so the hardest is the first key said
 * plainly, else the first said at all. A spirit section's drinks all hit
 * it at 1, so it is the first spirit chip that holds the drink.
 */
function homeOf(tag: number, keys: readonly SectionKey[]): number {
  let first = -1;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    if (k.kind === 'spirit') {
      if (bit(tag, SPIRIT_BIT + SPIRIT_INDEX.get(k.key)!)) return i;
      continue;
    }
    const j = FLAVOUR_INDEX.get(k.key)!;
    if (!bit(tag, FLAVOUR_BIT + j)) continue;
    if (saysPlainly(tag, j)) return i;
    if (first < 0) first = i;
  }
  return first;
}

/** recommend() as the fronts call it: lib/recommendCore's, which lib/recommend binds to the catalogue. */
export type FrontsRecommend = (answers: RecAnswers, n: number) => readonly { id: string }[];

/** The answers the fronts read. TasteAnswers is one. */
export type FrontsAnswers = Omit<RecAnswers, 'exclude'> & Pick<TasteAnswers, 'flavours' | 'spirits'>;

/** Drinks at the head of each section (§2.2, 3): six rows of two. store/taste keeps the same figure. */
export const FRONT = 12;

/**
 * The key a set of fronts is stored under (§2.2): the answers the scorer
 * reads, in a fixed order, the tags' catalogue and scorer stamp, and
 * `dataStamp`, which lib/recommend makes from what the tags cannot see
 * (the photographed drinks, the curated classics). Goal is in it too: it
 * is always null in v4.1, but the scorer reads it.
 */
export function frontsKey(answers: FrontsAnswers, dataStamp: string): string {
  return JSON.stringify({
    goal: answers.goal ?? null,
    drinks: answers.drinks ?? null,
    spirits: answers.spirits ?? [],
    styleOf: answers.styleOf ?? null,
    styles: answers.styles ?? [],
    flavours: answers.flavours ?? [],
    home: answers.home ?? null,
    bar: answers.bar ?? [],
    stamp: TAGS_STAMP,
    data: dataStamp,
  });
}

/**
 * The sections' fronts for these answers (§2.2, 1 to 3), or null when
 * they make no For you. Each front is recommend(answers, 12) with every
 * drink outside the section excluded: the scorer's own order, its
 * variety caps, its photographed openers. When the person's own gates
 * (their spirits, cocktails or spirits only) leave fewer than 12, the
 * rest comes from the same call with the gates lifted, so a gin drinker's
 * "Fruity" still has 12. A drink is in one front at most.
 *
 * Up to six recommend() runs: worked when the answers change, through
 * store/taste's worker, never while the Dex draws.
 */
export function computeDexFronts(answers: FrontsAnswers, recommend: FrontsRecommend, forAnswers: string): DexFronts | null {
  const keys = sectionKeys(answers);
  if (keys.length === 0) return null;
  const home = DRINKS.map((d) => homeOf(tagOf(d.id), keys));
  // The gates lifted, for a front the person's own answers cannot fill.
  const open: RecAnswers = { ...answers, spirits: [], styleOf: null, styles: [], drinks: null };
  // 'both' gates nothing; only its "two of each" guarantee would put a bottle of white rum
  // among the sours, so a section asks without it.
  const asked: RecAnswers = { ...answers, drinks: answers.drinks === 'both' ? null : answers.drinks };

  const taken = new Set<string>();
  const sections = keys.map((s, i): DexFrontSection => {
    const outside = DRINKS.filter((_, j) => home[j] !== i).map((d) => d.id);
    // recommend() can return 3 for n < 3 (its photographed openers run before the count is
    // checked), hence the slices.
    let ids = recommend({ ...asked, exclude: outside }, FRONT)
      .map((p) => p.id)
      .slice(0, FRONT);
    if (ids.length < FRONT) {
      const more = recommend({ ...open, exclude: [...outside, ...ids] }, FRONT - ids.length).map((p) => p.id);
      ids = [...ids, ...more].slice(0, FRONT);
    }
    ids = ids.filter((id) => !taken.has(id));
    for (const id of ids) taken.add(id);
    return s.kind === 'flavour' ? { kind: 'flavour', key: s.key, ids } : { kind: 'spirit', key: s.key, ids };
  });
  return { forAnswers, sections };
}

/* ------------------------------------------------------------------ */
/* For you: the order, from the stored fronts                           */
/* ------------------------------------------------------------------ */

interface SectionCommon {
  /** The section head's name: the chip's label, "Sour and citrusy". */
  label: string;
  /** The front: catalogue drinks only, in the scorer's order (a drink gone from the catalogue is skipped). */
  drinks: readonly Drink[];
  /** "See all 445": every drink the chip holds on its own. */
  all: number;
}

export type ForYouSection =
  | (SectionCommon & { kind: 'flavour'; key: Flavour })
  | (SectionCommon & { kind: 'spirit'; key: Spirit });

export interface ForYou {
  /** One per answer, in answer order, each headed by its front. */
  sections: readonly ForYouSection[];
  /** "Everything else": every catalogue drink not in a front, in Nº order. */
  rest: readonly Drink[];
  /**
   * The total order (§2.4) for a search or a filter in For you: the
   * fronts as shown, then every other drink by its section (first answer
   * first, no section last), each by Nº. Every catalogue drink, once:
   * walk it instead of DRINKS and the grid that survives is in order.
   */
  rank: readonly Drink[];
}

let lastForYou: { fronts: DexFronts; out: ForYou } | null = null;

/**
 * The For-you Dex for the stored fronts, or null without them (By number
 * only, §2.1). O(n) bit tests, remembered for the last fronts by
 * identity, so a re-render, a filter or a search never works it again.
 * Membership comes from the fronts' own keys, so a front and the order
 * after it always agree, even while new answers wait for their fronts.
 */
export function forYou(fronts: DexFronts | null): ForYou | null {
  if (!fronts || fronts.sections.length === 0) return null;
  if (lastForYou && lastForYou.fronts === fronts) return lastForYou.out;

  const inFront = new Set<string>();
  const sections = fronts.sections.map((s): ForYouSection => {
    const drinks: Drink[] = [];
    for (const id of s.ids) {
      const d = getDrink(id);
      if (!d || inFront.has(id)) continue;
      inFront.add(id);
      drinks.push(d);
    }
    return s.kind === 'flavour'
      ? { kind: 'flavour', key: s.key, label: FLAVOUR_WORDS[s.key], drinks, all: FLAVOUR_ALL.get(s.key) ?? 0 }
      : { kind: 'spirit', key: s.key, label: SPIRIT_WORDS[s.key], drinks, all: SPIRIT_ALL.get(s.key) ?? 0 };
  });

  const keys = fronts.sections.map((s): SectionKey => (s.kind === 'flavour' ? { kind: 'flavour', key: s.key } : { kind: 'spirit', key: s.key }));
  const bySection: Drink[][] = keys.map(() => []);
  const unplaced: Drink[] = [];
  const rest: Drink[] = [];
  for (const d of DRINKS) {
    if (inFront.has(d.id)) continue;
    rest.push(d);
    const h = homeOf(tagOf(d.id), keys);
    (h >= 0 ? bySection[h]! : unplaced).push(d);
  }
  const rank = [...sections.flatMap((s) => s.drinks), ...bySection.flat(), ...unplaced];

  const out: ForYou = { sections, rest, rank };
  lastForYou = { fronts, out };
  return out;
}

/** "See all 445 ›" (§2.4): that section's chip on, alone; the grid goes flat in the total order. */
export function seeAll(section: SectionKey): ChipFilter {
  return section.kind === 'flavour'
    ? { ...NO_FILTER, flavours: [section.key] }
    : { ...NO_FILTER, spirits: [section.key] };
}

/**
 * The number map (§2.4): Dex number → the row that holds it, built with
 * the rows, so a typed number finds its tile in any order. `drinksOf`
 * says which drinks a row draws (null for a section head or any row
 * without tiles).
 */
export function numberMap<R>(
  rows: readonly R[],
  drinksOf: (row: R) => readonly Pick<Drink, 'dexNumber'>[] | null | undefined,
): Map<number, number> {
  const out = new Map<number, number>();
  rows.forEach((row, i) => {
    for (const d of drinksOf(row) ?? []) if (!out.has(d.dexNumber)) out.set(d.dexNumber, i);
  });
  return out;
}
