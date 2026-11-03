import { DRINKS, formatCount } from '@/data';
import { grapeNamesOf, winesByName } from '@/data/wineAtlas';
import { atlasLinkFor } from '@/data/wineAtlasLinks';
import {
  FLAVOUR_ORDER,
  FLAVOUR_WORDS,
  hasFlavour,
  hasSpirit,
  KIND_WORDS,
  SPIRIT_ORDER,
  SPIRIT_WORDS,
  STATUS_WORDS,
  type ChipFilter,
} from '@/lib/dexOrder';
import { styleLabel } from '@/lib/drinkLabels';
import type { Flavour, Spirit, TasteAnswers } from '@/store/taste';
import type { Drink } from '@/types';

import {
  aToZ,
  chipIsOn,
  createFacets,
  facetsOn,
  FACET_ORDER,
  figureOf,
  labelOf,
  NO_FACETS,
  offerOrder,
  type FacetChip,
  type FacetContext,
  type FacetCounts,
  type FacetKey,
  type FacetModel,
  type FacetSource,
  type Strength,
} from './dexFacets';

/* ==================================================================== */
/* The Dex's filters, and the note Dex progress leaves for them         */
/*                                                                      */
/* v4.14 (specs/v4.14/filters.md). Jan: "optimize it so people can      */
/* choose better and facilitate their choosing process". v4.2's four    */
/* groups become ten facets, worked in components/dex/dexFacets from    */
/* the catalogue itself, and offered the way people decide: what kind   */
/* of drink, what it tastes like, how strong, then the details (spirit, */
/* style, grape, where it is from), then what is already in your Dex.   */
/* OR inside a facet, AND across them. Flavour and Spirit are           */
/* tasteTags.json's chips exactly (lib/dexOrder), so "Sour and citrusy" */
/* still means one thing everywhere in the app.                         */
/*                                                                      */
/* The filter is still one object, lib/dexOrder's ChipFilter with the   */
/* new facets beside it, so the Dex, its sheet, its two chip rows and   */
/* this note all speak one shape. Everything a facet holds is worked in */
/* dexFacets, bound here to the Dex's drinks once, on first use.        */
/*                                                                      */
/* WHY A NOTE AND NOT A ROUTE PARAM. Dex progress's "See your 38" opens */
/* the Dex filtered to Logged. The Dex is a tab page in a pager, and a  */
/* param put on it by a push would stay on the page after the filter    */
/* was cleared, and come back on the next visit. A one-shot note, taken */
/* once when the Dex next has focus, cannot.                            */
/* ==================================================================== */

export interface DexFilter extends ChipFilter {
  /** Light, Medium, Strong: by ABV (dexFacets' strengthOf). */
  strength: readonly Strength[];
  /** I can make it: the cocktails My Bar makes. Ignored while My Bar is off or empty. */
  make: boolean;
  /** A style of the type that is on: "cocktail:Sour", "spirit:Scotch", "wine:red". */
  styles: readonly string[];
  /** Wines: atlas grape names. */
  grapes: readonly string[];
  countries: readonly string[];
  /** Wines: "Piedmont|Italy". */
  regions: readonly string[];
}

export const NO_DEX_FILTER: DexFilter = { ...NO_FACETS, flavours: [], spirits: [], kind: 'all', status: 'all' };

export type DexChip = FacetChip;
export type DexCounts = FacetCounts;
export type DexContext = FacetContext;

/* ------------------------------------------------------------------ */
/* The words                                                           */
/* ------------------------------------------------------------------ */

/** Each facet's head in the sheet, and the plural a See all page searches. */
export const FACET_WORDS: Readonly<Record<FacetKey, { label: string; noun: string }>> = {
  kind: { label: 'Type', noun: 'types' },
  flavour: { label: 'Flavour', noun: 'flavours' },
  strength: { label: 'Strength', noun: 'strengths' },
  make: { label: 'Your bar', noun: 'drinks' },
  spirit: { label: 'Spirit', noun: 'spirits' },
  style: { label: 'Style', noun: 'styles' },
  grape: { label: 'Grape', noun: 'grapes' },
  country: { label: 'Country', noun: 'countries' },
  region: { label: 'Region', noun: 'regions' },
  status: { label: 'In your Dex', noun: 'drinks' },
};

/*
 * Strength in plain words (App Review 1.4.3): what is in the glass, so
 * someone can find the lighter thing as easily as the stronger. The note
 * under the head and each chip's spoken label say where the lines are.
 */
export const STRENGTH_WORDS: Readonly<Record<Strength, string>> = { light: 'Light', medium: 'Medium', strong: 'Strong' };
const STRENGTH_SAYS: Readonly<Record<Strength, string>> = {
  light: 'under 15% alcohol',
  medium: '15 to 30% alcohol',
  strong: '30% alcohol and over',
};
export const STRENGTH_NOTE = 'Light is under 15% ABV, strong 30% and over.';

export const MAKE_WORD = 'I can make it';

/* ------------------------------------------------------------------ */
/* The catalogue, bound once                                           */
/* ------------------------------------------------------------------ */

/*
 * A wine's grapes, from the atlas: its link's appellations and their
 * grapes, and the variety a grape card is. The atlas has merged the
 * synonyms (Shiraz is Syrah), so a grape is one option however a card
 * names it. Ten atlas cards record no grape, and are in no Grape option.
 */
function grapesOf(d: FacetSource): readonly string[] {
  const link = atlasLinkFor(d.id);
  if (!link) return [];
  const out = new Set<string>();
  for (const w of winesByName(link.wines)) for (const g of grapeNamesOf(w)) out.add(g);
  if (link.grape) out.add(link.grape);
  return [...out];
}

function maskOf<K extends string>(order: readonly K[], holds: (id: string, k: K) => boolean, id: string): number {
  let m = 0;
  order.forEach((k, i) => {
    if (holds(id, k)) m |= 1 << i;
  });
  return m;
}

let model: FacetModel | null = null;

/**
 * The Dex's facets over the catalogue, worked on first use (about 20 ms
 * in Node, a few times that on a phone) and kept: the Dex asks for it
 * when a filter, a search or the sheet first needs a count, and warms it
 * once the tab has drawn, so the first tap does not pay for it.
 */
export function dexFacets(): FacetModel {
  if (!model) {
    model = createFacets({
      drinks: DRINKS,
      flavours: FLAVOUR_ORDER.map((key) => ({ key, label: FLAVOUR_WORDS[key] })),
      spirits: SPIRIT_ORDER.map((key) => ({ key, label: SPIRIT_WORDS[key] })),
      flavourMask: (id) => maskOf(FLAVOUR_ORDER, hasFlavour, id),
      spiritMask: (id) => maskOf(SPIRIT_ORDER, hasSpirit, id),
      grapesOf,
      styleWord: styleLabel,
      words: { kind: KIND_WORDS, status: STATUS_WORDS, strength: STRENGTH_WORDS, make: MAKE_WORD },
    });
  }
  return model;
}

/* ------------------------------------------------------------------ */
/* Filtering and counting                                              */
/* ------------------------------------------------------------------ */

/** True when any facet is on: the grid goes flat (v4.2 §2.4) and the sliders glyph is filled. */
export function dexFilterOn(f: DexFilter, canMake: ReadonlySet<string> | null): boolean {
  return facetsOn(f, canMake);
}

/*
 * The filter after a tap on this option. Turning one on can never empty
 * the grid: it is offered only with a figure, and the grid then holds at
 * least that. Turning one off can, in a facet with other choices on: Sour
 * and Trinidad and Tobago, with Czechia and Australia beside it that hold
 * no sour drink. So when every other choice left in that facet has a 0
 * in `counts` (this filter's own, over what the search finds), they go
 * with it, and the facet is off: the grid widens instead of emptying.
 * Type turned off, In your Dex and I can make it only ever widen.
 */
export function toggleDex(f: DexFilter, c: DexChip, counts: DexCounts | null): DexFilter {
  const next = dexFacets().toggle(f, c) as DexFilter;
  if (!counts || !chipIsOn(f, c)) return next;
  const left = dexChipsOn(next, null).filter((x) => x.facet === c.facet);
  return left.length > 0 && left.every((x) => dexFigure(counts, x) === 0) ? clearFacet(next, c.facet) : next;
}

/** Whether this option is on. */
export function dexChipOn(f: DexFilter, c: DexChip): boolean {
  return chipIsOn(f, c);
}

/** The filter with one facet emptied: a See all page's Clear. */
export function clearFacet(f: DexFilter, facet: FacetKey): DexFilter {
  switch (facet) {
    case 'kind':
      return dexFacets().withKind(f, 'all') as DexFilter;
    case 'status':
      return { ...f, status: 'all' };
    case 'make':
      return { ...f, make: false };
    case 'flavour':
      return { ...f, flavours: [] };
    case 'spirit':
      return { ...f, spirits: [] };
    case 'strength':
      return { ...f, strength: [] };
    case 'style':
      return { ...f, styles: [] };
    case 'grape':
      return { ...f, grapes: [] };
    case 'country':
      return { ...f, countries: [] };
    case 'region':
      return { ...f, regions: [] };
  }
}

/**
 * The grid's test for one drink. With nothing on it is "every drink",
 * and the facets are not even built. A drink someone added has only a
 * type and a Logged state: any other facet that is on hides it, as a
 * flavour chip always did.
 */
export function dexMatcher(f: DexFilter, ctx: DexContext): (d: Pick<Drink, 'id' | 'category'>) => boolean {
  if (!dexFilterOn(f, ctx.canMake)) return () => true;
  return dexFacets().matcher(f, ctx);
}

/** The faceted counts over the catalogue, or over what a search finds in it. */
export function dexCounts(f: DexFilter, ctx: DexContext, drinks?: readonly Pick<Drink, 'id'>[]): DexCounts {
  return dexFacets().count(f, ctx, drinks);
}

/** An option's figure; null without counts (the quick row at rest, which builds no index for it). */
export function dexFigure(counts: DexCounts | null, c: DexChip): number | null {
  return counts ? figureOf(dexFacets(), counts, c) : null;
}

/**
 * An option's words. The fixed facets' are lib/dexOrder's and this
 * file's, read without the index, so the quick row at rest builds none;
 * a style, grape, country or region is the index's.
 */
export function dexChipWord(c: DexChip): string {
  switch (c.facet) {
    case 'kind':
      return KIND_WORDS[c.key as keyof typeof KIND_WORDS] ?? c.key;
    case 'flavour':
      return FLAVOUR_WORDS[c.key as Flavour] ?? c.key;
    case 'spirit':
      return SPIRIT_WORDS[c.key as Spirit] ?? c.key;
    case 'strength':
      return STRENGTH_WORDS[c.key as Strength] ?? c.key;
    case 'status':
      return STATUS_WORDS[c.key as keyof typeof STATUS_WORDS] ?? c.key;
    case 'make':
      return MAKE_WORD;
    default:
      return labelOf(dexFacets(), c);
  }
}

/*
 * A token's words, in the row of what is on. Under Spirits the Spirit
 * group and the Style group both offer Rum, Gin and Vodka, and they are
 * not one choice: Spirit's Rum is any drink of rum (spiced, flavoured and
 * the liqueurs with it), Style's is the cards filed as Rum. With both on,
 * the row read "Spirits, Rum, Rum" and VoiceOver said "Remove Rum" twice
 * (build 40's review). A style whose word is a spirit's says it is the
 * style. In the sheet each already sits under its group's head.
 */
const SPIRIT_WORD_SET: ReadonlySet<string> = new Set(Object.values(SPIRIT_WORDS).map((w) => w.toLowerCase()));

export function tokenWord(c: DexChip): string {
  const word = dexChipWord(c);
  return c.facet === 'style' && SPIRIT_WORD_SET.has(word.toLowerCase()) ? `${word} style` : word;
}

/** Every option that is on, in sheet order: the row over the grid, and an empty grid's "under Sour and citrusy, Wines". */
export function dexChipsOn(f: DexFilter, canMake: ReadonlySet<string> | null): DexChip[] {
  if (!dexFilterOn(f, canMake)) return [];
  return dexFacets().chipsOn(f, { canMake });
}

/** "2,603 drinks", "1 drink": a figure the way every count in the app is said. */
const drinksWord = (n: number) => `${formatCount(n)} ${n === 1 ? 'drink' : 'drinks'}`;

/**
 * What VoiceOver says for an option, its count included, so a chip and a
 * See all row are "Fruity, 235 drinks" and "Light, under 15% alcohol,
 * 2,603 drinks"; a region says its country. Selected and dimmed are its
 * accessibilityState, said by VoiceOver itself.
 */
export function optionSays(c: DexChip, n: number | null): string {
  const detail =
    c.facet === 'strength'
      ? STRENGTH_SAYS[c.key as Strength]
      : c.facet === 'region'
        ? dexFacets().options.region[dexFacets().indexOf('region', c.key)]?.detail
        : undefined;
  return [dexChipWord(c), detail, n === null ? null : drinksWord(n)].filter(Boolean).join(', ');
}

/* ------------------------------------------------------------------ */
/* What is offered                                                     */
/* ------------------------------------------------------------------ */

/*
 * The quick chips under the field (v4.14): the choices people make first,
 * in a fixed order, so nothing moves under a finger (v4.2 put the chips
 * that were on first; the row of what is on now says that, under it).
 *
 *   Cocktails · Spirits · Wines
 *   the person's flavours, in answer order (or Sweet, Sour and citrusy,
 *     Fruity, Bitter for someone who has not said), then up to two of
 *     their spirits: offered, never pre-picked (v4.2 §1.6)
 *   Light: the one strength offered here, the lighter choice; Medium and
 *     Strong are in the sheet
 *   I can make it, while My Bar is on and has bottles
 *   Not yet
 */
const QUICK_TASTES: readonly Flavour[] = ['sweet', 'sour', 'fruity', 'bitter'];
const QUICK_SPIRITS = 2;

export function quickPicks(answers: Pick<TasteAnswers, 'flavours' | 'spirits'>, makeAvailable: boolean): DexChip[] {
  const tastes: readonly Flavour[] = answers.flavours.length > 0 ? answers.flavours : QUICK_TASTES;
  return [
    { facet: 'kind', key: 'cocktail' },
    { facet: 'kind', key: 'spirit' },
    { facet: 'kind', key: 'wine' },
    ...tastes.map((key): DexChip => ({ facet: 'flavour', key })),
    ...answers.spirits.slice(0, QUICK_SPIRITS).map((key: Spirit): DexChip => ({ facet: 'spirit', key })),
    { facet: 'strength', key: 'light' },
    ...(makeAvailable ? [{ facet: 'make', key: 'make' } as DexChip] : []),
    { facet: 'status', key: 'locked' },
  ];
}

/** A long facet shows this many, then See all. */
export const FIRST_FEW = 6;
/** A facet of up to this many shows them all (seven flavours, seven spirits, a wine's seven colours). */
const SHORT = 8;

export interface SheetOption {
  chip: DexChip;
  label: string;
  count: number | null;
  on: boolean;
  /** Nothing under the other choices: drawn dimmed, its 0 shown, and it cannot be tapped (unless on, to turn it off). */
  dim: boolean;
}

export interface SheetGroup {
  facet: FacetKey;
  options: SheetOption[];
  /** How many options See all lists; 0 when every one is already shown. */
  all: number;
}

/** The facets after the hair rule: the details, once the first choices are made. */
export const INTENT_FACETS: ReadonlySet<FacetKey> = new Set(['kind', 'flavour', 'strength', 'make']);

/**
 * The sheet's groups for this filter, in facet order. A facet is drawn
 * when the type that is on holds anything in it (no Grape for cocktails,
 * no Flavour for wine); Style, Grape and Region only once a type is
 * chosen, so the first look is six short groups, not ten long ones. A
 * long facet shows its first few (dexFacets' offerOrder: the most held,
 * fixed for the type) and whatever is on beyond them, and says how many
 * See all holds.
 */
export function sheetGroups(f: DexFilter, counts: DexCounts | null, makeAvailable: boolean): SheetGroup[] {
  const m = dexFacets();
  const out: SheetGroup[] = [];
  for (const facet of FACET_ORDER) {
    if (facet === 'make' && !makeAvailable) continue;
    if ((facet === 'style' || facet === 'grape' || facet === 'region') && f.kind === 'all') continue;
    if (!m.applies(facet, f.kind)) continue;
    const offered = offerOrder(m, facet, f.kind, (o) => m.isOn(f, { facet, key: o.key }));
    if (offered.length === 0) continue;
    const long = offered.length > SHORT;
    const shown = long
      ? offered.filter((o, i) => i < FIRST_FEW || m.isOn(f, { facet, key: o.key }))
      : offered;
    out.push({
      facet,
      all: long ? offered.length : 0,
      options: shown.map((o) => sheetOption(f, counts, { facet, key: o.key }, o.label)),
    });
  }
  return out;
}

function sheetOption(f: DexFilter, counts: DexCounts | null, chip: DexChip, label: string): SheetOption {
  const count = dexFigure(counts, chip);
  const on = dexChipOn(f, chip);
  return { chip, label, count, on, dim: count === 0 && !on };
}

/** A See all page: every option of the facet under the type that is on, A to Z, with its figure. */
export function seeAllOptions(f: DexFilter, counts: DexCounts | null, facet: FacetKey): (SheetOption & { detail?: string })[] {
  const m = dexFacets();
  return aToZ(m, facet, f.kind, (o) => m.isOn(f, { facet, key: o.key })).map((o) => ({
    ...sheetOption(f, counts, { facet, key: o.key }, o.label),
    detail: o.detail,
  }));
}

/* ------------------------------------------------------------------ */
/* The note                                                            */
/* ------------------------------------------------------------------ */

let pending: DexFilter | null = null;

/**
 * Left by a screen that opens the Dex filtered (Dex progress's "See your
 * 38" leaves `{ status: 'unlocked' }`). The facets it does not name are
 * off: the note says exactly what the Dex should show.
 */
export function requestDexFilter(filter: Partial<DexFilter>): void {
  pending = { ...NO_DEX_FILTER, ...filter };
}

/** Read once, by the Dex on focus; null when nothing asked. */
export function takeDexFilter(): DexFilter | null {
  const f = pending;
  pending = null;
  return f;
}
