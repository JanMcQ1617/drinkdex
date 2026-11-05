import type { DrinkCategory } from '@/types';

/* ==================================================================== */
/* The Dex's facets: what each drink holds, and the faceted counts      */
/* (v4.14, specs/v4.14/filters.md)                                      */
/*                                                                      */
/* Pure: no React, no stores, nothing imported at run time. The         */
/* catalogue comes in as an argument (components/dex/dexFilter binds    */
/* it to the Dex's drinks, data/tasteTags.json's chips through          */
/* lib/dexOrder, and the wine atlas's grapes), so                       */
/* specs/v4.14/filters.test.mjs runs this file as it is, on the real    */
/* catalogue, against a count done the slow way.                        */
/*                                                                      */
/* TEN FACETS. Type, Flavour, Strength, I can make it, Spirit, Style,   */
/* Grape, Country, Region and In your Dex. OR inside one, AND across    */
/* them, as v4.2's four were (Flavour and Spirit are still              */
/* tasteTags.json's bits, so "Sour and citrusy" holds what it held).    */
/* Type and In your Dex are one or none; the rest take any number.      */
/*                                                                      */
/* ONE RECORD PER DRINK, WORKED ONCE. Each catalogue drink becomes a    */
/* handful of small integers (its type, two bit masks, a strength band, */
/* a style, its grapes, countries and region, each an index into its    */
/* facet's option table), so a filter or a count never parses an ABV    */
/* or splits an origin again. Built on first use, about 4,700 drinks.   */
/*                                                                      */
/* ONE PASS PER COUNT. An option's figure is what the grid would hold   */
/* with that option as its facet's only choice and every other facet as */
/* it is: "how many would I see". Each drink is tested once against     */
/* each facet that is on; one that passes them all counts towards every */
/* option it holds, one that fails exactly one counts towards that      */
/* facet's options alone, and one that fails two counts nowhere. No     */
/* option is ever counted by a pass of its own, so 465 grapes cost what */
/* seven flavours did.                                                  */
/*                                                                      */
/* TYPE COMES FIRST, AND TAKES WHAT DOES NOT FIT WITH IT. Style, Grape  */
/* and Region belong to one type (a cocktail's Sour, a wine's grape),   */
/* and Flavour and Spirit say nothing about a wine (it holds no taste   */
/* chip, v4.14 wine-restore). Choosing a type drops the choices it      */
/* leaves no drink for (withKind), and each Type figure is counted that */
/* way, so Wines reads 2,344 while Sour and citrusy is on, and a tap on */
/* it shows 2,344, never "No drinks match".                             */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* The shape                                                           */
/* ------------------------------------------------------------------ */

export type FacetKey =
  | 'kind'
  | 'flavour'
  | 'strength'
  | 'make'
  | 'spirit'
  | 'style'
  | 'grape'
  | 'country'
  | 'region'
  | 'status';

/** Every facet, in the sheet's order (by use: what people reach for first, first). */
export const FACET_ORDER: readonly FacetKey[] = [
  'kind',
  'flavour',
  'strength',
  'make',
  'spirit',
  'style',
  'grape',
  'country',
  'region',
  'status',
];

export type Strength = 'light' | 'medium' | 'strong';
export const STRENGTH_ORDER: readonly Strength[] = ['light', 'medium', 'strong'];

/** `unlocked` is Logged and `locked` Not yet (lib/dexOrder's StatusFilter). */
export type Logged = 'unlocked' | 'locked';
const LOGGED_ORDER: readonly Logged[] = ['unlocked', 'locked'];

const KINDS: readonly DrinkCategory[] = ['cocktail', 'spirit', 'wine'];
const KIND_INDEX: Readonly<Record<DrinkCategory, number>> = { cocktail: 0, spirit: 1, wine: 2 };

/**
 * What the Dex is filtered by. components/dex/dexFilter's DexFilter is
 * this with lib/dexOrder's own key types on Flavour and Spirit. Arrays
 * hold option keys in their option table's order (toggle keeps them so),
 * so two people with the same choices have the same filter.
 */
export interface FacetFilter {
  kind: DrinkCategory | 'all';
  flavours: readonly string[];
  spirits: readonly string[];
  strength: readonly Strength[];
  /** Only what My Bar makes. Read only while the screen passes a bar (FacetContext.canMake). */
  make: boolean;
  /** Option keys: "cocktail:Sour", "spirit:Scotch", "wine:red". */
  styles: readonly string[];
  /** Atlas grape names. Wines only. */
  grapes: readonly string[];
  countries: readonly string[];
  /** "Piedmont|Italy". Wines only. */
  regions: readonly string[];
  status: 'all' | Logged;
}

export const NO_FACETS: FacetFilter = {
  kind: 'all',
  flavours: [],
  spirits: [],
  strength: [],
  make: false,
  styles: [],
  grapes: [],
  countries: [],
  regions: [],
  status: 'all',
};

/** The array facets and the filter field each one fills. */
type ListFacet = 'flavour' | 'spirit' | 'strength' | 'style' | 'grape' | 'country' | 'region';
const FIELD: Readonly<Record<ListFacet, keyof FacetFilter>> = {
  flavour: 'flavours',
  spirit: 'spirits',
  strength: 'strength',
  style: 'styles',
  grape: 'grapes',
  country: 'countries',
  region: 'regions',
};
const isList = (f: FacetKey): f is ListFacet => f in FIELD;

/** One option, wherever it is drawn: the sheet, a See all page, the quick row, the row of what is on. */
export interface FacetChip {
  facet: FacetKey;
  key: string;
}

/** The fields a drink's facets are read from. A catalogue Drink has them. */
export interface FacetSource {
  id: string;
  /** Read for one thing: a wine card named for a region is in that region. */
  name: string;
  category: DrinkCategory;
  subcategory: string;
  abv: string;
  origin: string;
}

export interface FacetOption {
  key: string;
  label: string;
  /** A quiet second word on a See all row: a region's country. */
  detail?: string;
  /** A style's type. */
  kind?: DrinkCategory;
  /** A fixed place in a short facet (a wine's colours run Red, White, Rosé…); without it, by how many hold it. */
  rank?: number;
  /** How many catalogue drinks hold it. */
  all: number;
  byKind: Record<DrinkCategory, number>;
}

/** The words the binding brings: lib/dexOrder's, the first run's own. */
export interface FacetWords {
  kind: Readonly<Record<DrinkCategory, string>>;
  status: Readonly<Record<Logged, string>>;
  strength: Readonly<Record<Strength, string>>;
  make: string;
}

export interface FacetCatalogue {
  drinks: readonly FacetSource[];
  /** The flavour chips in tasteTags.json's bit order, with their words. */
  flavours: readonly { key: string; label: string }[];
  spirits: readonly { key: string; label: string }[];
  /** A drink's flavour chips as a mask in that order (bit i = flavours[i]); 0 for none. */
  flavourMask: (id: string) => number;
  spiritMask: (id: string) => number;
  /** A wine's grapes by atlas name; [] for anything else. */
  grapesOf: (d: FacetSource) => readonly string[];
  /** A stored style in sentence case (lib/drinkLabels' styleLabel). */
  styleWord: (subcategory: string) => string;
  words: FacetWords;
}

/** What a count or a match reads beside the filter. */
export interface FacetContext {
  /** Logged: the Dex passes `(id) => has(unlocks, id)`. */
  caught: (id: string) => boolean;
  /** The ids My Bar makes; null while there is no bar to read (My Bar off, or empty), and `make` is then ignored. */
  canMake: ReadonlySet<string> | null;
}

export interface FacetCounts {
  /** What the grid holds: "Show 214 drinks". */
  total: number;
  /** Each option's figure, by its index in its facet's options. */
  of: Readonly<Record<FacetKey, Int32Array>>;
}

/* ------------------------------------------------------------------ */
/* Strength                                                            */
/* ------------------------------------------------------------------ */

/*
 * By ABV, from the middle of the drink's own range ("8–10%" is 9), so a
 * card's band is the one its label reads as. Under 15 is Light: nearly
 * every wine, highballs, spritzes. 15 to 30 is Medium: liqueurs,
 * fortified wines, sours, most stirred drinks. 30 and over is Strong:
 * the bottles, and the few cocktails at their strength. Neutral words
 * that say what is in the glass (App Review 1.4.3): a band to choose by,
 * never a dare. "Varies by producer" (one wine) is in no band.
 */
export const LIGHT_BELOW = 15;
export const STRONG_FROM = 30;
const ABV = /(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*%/;

export function strengthOf(abv: string): Strength | null {
  const m = ABV.exec(abv);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  const mid = (lo + hi) / 2;
  return mid < LIGHT_BELOW ? 'light' : mid < STRONG_FROM ? 'medium' : 'strong';
}

/* ------------------------------------------------------------------ */
/* Country and region, from the card's own origin                      */
/* ------------------------------------------------------------------ */

/*
 * A card's origin ends in its country ("New York City, USA", "Piedmont,
 * Italy", "Scotland"), and 233 of the 241 endings the catalogue writes
 * are one. The rest are read here, so a country is one option however
 * the data spelled it. Two rules, then two short lists:
 *
 *  - "X and Y" is both, when each is a country the catalogue names on
 *    its own ("Switzerland and France"); a part that is not ("the
 *    western Balkans", "Central Europe") is dropped.
 *  - "Northern Italy", "Southwest France" are the country after the
 *    compass word, when that is one.
 *  - NAMED: the countries whose own names those rules would break.
 *  - PLACE_OF: a region or old name written where the country goes, and
 *    the endings that are more than one country in a way the rules
 *    cannot read ("Tahiti and California"). [] is "no one country"
 *    (Caribbean, Worldwide, Scandinavia): those cards are in no Country
 *    option, rather than in a made-up one.
 *
 * The card's own origin, never the atlas: a grape card (Chardonnay) is
 * grown in twenty countries, but the card is from where it says.
 * specs/v4.14/filters.test.mjs fails when a new ending reads as a
 * country with "and" or a compass word in it, so a merge that adds one
 * gets a line here.
 */
const COMPASS = /^(?:North|South|East|West|Central|Northern|Southern|Eastern|Western|Northeast|Northwest|Southeast|Southwest)\s+(.+)$/;

const NAMED: ReadonlySet<string> = new Set([
  'South Africa',
  'South Korea',
  'North Macedonia',
  'Trinidad and Tobago',
  'Bosnia and Herzegovina',
  'Antigua and Barbuda',
]);

const PLACE_OF: Readonly<Record<string, readonly string[]>> = {
  Korea: ['South Korea'],
  Trinidad: ['Trinidad and Tobago'],
  Bosnia: ['Bosnia and Herzegovina'],
  'British India': ['India'],
  'Scottish Islands': ['Scotland'],
  Catalonia: ['Spain'],
  Normandy: ['France'],
  Roussillon: ['France'],
  Lombardy: ['Italy'],
  Marche: ['Italy'],
  Piedmont: ['Italy'],
  Sicily: ['Italy'],
  Veneto: ['Italy'],
  Alsace: ['France'],
  Bavaria: ['Germany'],
  Zambia: ['Zambia'],
  'eastern France': ['France'],
  'southern Germany': ['Germany'],
  'French and Italian Alps': ['France', 'Italy'],
  'Tahiti and California': ['French Polynesia', 'USA'],
  Balkans: [],
  Caribbean: [],
  Europe: [],
  'French Caribbean': [],
  'Indian Ocean islands': [],
  'Latin America': [],
  'Nordic countries': [],
  Scandinavia: [],
  'Spanish Caribbean': [],
  Worldwide: [],
  // v4.16: New World Rosé and New World Moscato, styles made in many countries.
  'New World': [],
  'West Africa': [],
  'Southern Africa': [],
  'Nordic and Baltic Europe': [],
  'Baltic states and Nordic Europe': [],
  'Alps and central Europe': [],
};

/** The last comma part of an origin: where its country is written. */
export function tailOf(origin: string): string {
  const parts = origin.split(',');
  return (parts[parts.length - 1] ?? '').trim();
}

/** The endings that are a country as written: no "and", no compass word, not on PLACE_OF. */
function plainCountries(tails: Iterable<string>): Set<string> {
  const out = new Set<string>(NAMED);
  for (const t of tails) {
    if (!t || t in PLACE_OF || / and /.test(t) || COMPASS.test(t)) continue;
    out.add(t);
  }
  return out;
}

/** One part of an ending: a country, or nothing. */
function placeOf(part: string, plain: ReadonlySet<string>): readonly string[] {
  if (part in PLACE_OF) return PLACE_OF[part]!;
  if (plain.has(part)) return [part];
  const m = COMPASS.exec(part);
  if (m && plain.has(m[1]!)) return [m[1]!];
  return [];
}

/** The countries an ending names, in the order it names them. */
export function countriesOf(tail: string, plain: ReadonlySet<string>): string[] {
  if (!tail) return [];
  const whole = placeOf(tail, plain);
  if (whole.length > 0 || tail in PLACE_OF || !/ and /.test(tail)) return [...whole];
  const out: string[] = [];
  for (const part of tail.split(' and ')) for (const c of placeOf(part.trim(), plain)) if (!out.includes(c)) out.push(c);
  return out;
}

/*
 * The United Kingdom, written after the nation it is in. The atlas's
 * English and Welsh wines are "Southeast England, United Kingdom" and
 * "Wales, United Kingdom", where every other card writes the nation as
 * its country ("London, England", "Sussex and Kent, England"), so England
 * was one option for English Sparkling Wine and another for Kent and
 * Sussex (build 40's review). A nation the catalogue names as a country
 * on its own, written just before "United Kingdom" (after a compass word
 * or not), is the country. English Bacchus, "National, United Kingdom",
 * names no nation and stays United Kingdom.
 */
const NATIONS_OF: Readonly<Record<string, readonly string[]>> = {
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
};

/** The countries a whole origin names: its ending's (countriesOf), or the nation written before a union's name. */
export function countriesOfOrigin(origin: string, plain: ReadonlySet<string>): string[] {
  const parts = origin.split(',').map((p) => p.trim());
  const tail = parts[parts.length - 1] ?? '';
  const nations = NATIONS_OF[tail];
  if (nations && parts.length > 1) {
    const before = parts[parts.length - 2]!;
    const nation = COMPASS.exec(before)?.[1] ?? before;
    if (nations.includes(nation) && plain.has(nation)) return [nation];
  }
  return countriesOf(tail, plain);
}

/*
 * A wine's region: the part just before its country, its brackets
 * dropped ("Burgundy (Côte de Nuits), France" is Burgundy, "Sauternes,
 * Bordeaux, France" Bordeaux), and "Loire Valley" read as the Loire
 * when the catalogue also names the Loire. 467 written regions become
 * about 300, the long tail behind See all. One-part origins have none,
 * and "National" (Germany's nationwide names) is not a place.
 */
const NOT_A_REGION: ReadonlySet<string> = new Set(['National']);

/*
 * One region written two ways, read as one (build 40's review): an
 * authored card's English or part name where the atlas writes the
 * region it files that wine under. Kamptal's "Lower Austria" is the
 * atlas's Niederösterreich, Gewürztraminer's "Alto Adige" half of its
 * Trentino-Alto Adige, Côte-Rôtie's "Northern Rhône" and
 * Châteauneuf-du-Pape's "Southern Rhône" its Rhône.
 */
const REGION_ALIAS: Readonly<Record<string, string>> = {
  Niederösterreich: 'Lower Austria',
  'Alto Adige': 'Trentino-Alto Adige',
  'Northern Rhône': 'Rhône',
  'Southern Rhône': 'Rhône',
};

function writtenRegion(origin: string): string | null {
  const parts = origin.split(',').map((p) => p.trim());
  if (parts.length < 2) return null;
  const r = parts[parts.length - 2]!.replace(/\s*\([^)]*\)/g, '').trim();
  return r && !NOT_A_REGION.has(r) && !/ and /.test(r) ? (REGION_ALIAS[r] ?? r) : null;
}

/* ------------------------------------------------------------------ */
/* Style                                                               */
/* ------------------------------------------------------------------ */

/*
 * A wine's style is its colour or its way of being made, from its
 * stored style: the 1,231 atlas reds' "Regional Red" and the varietal
 * cards' "Red Varietal" are one Red, and "Skin-Contact" is Orange, the
 * word the wine list uses. In this order, the way a list is read, not by
 * size. A cocktail's and a spirit's style is its stored style, in
 * sentence case.
 */
const WINE_STYLE: Readonly<Record<string, { key: string; label: string }>> = {
  'Regional Red': { key: 'red', label: 'Red' },
  'Red Varietal': { key: 'red', label: 'Red' },
  White: { key: 'white', label: 'White' },
  'Rosé': { key: 'rose', label: 'Rosé' },
  'Skin-Contact': { key: 'orange', label: 'Orange' },
  Sparkling: { key: 'sparkling', label: 'Sparkling' },
  Dessert: { key: 'dessert', label: 'Dessert' },
  'Fortified Wine': { key: 'fortified', label: 'Fortified' },
};
const WINE_STYLE_RANK = ['red', 'white', 'rose', 'orange', 'sparkling', 'dessert', 'fortified'];

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

interface Facets {
  kind: number;
  flavours: number;
  spirits: number;
  /** STRENGTH_ORDER index; -1 for none. */
  strength: number;
  style: number;
  grapes: readonly number[];
  countries: readonly number[];
  region: number;
}

const NONE: readonly number[] = [];
/** What a drink someone added holds: a type and a Logged state, nothing the catalogue indexes. */
const BLANK: Facets = { kind: -1, flavours: 0, spirits: 0, strength: -1, style: -1, grapes: NONE, countries: NONE, region: -1 };

/** An option table: key to index, and the options in the order they were met. */
class Table {
  readonly options: FacetOption[] = [];
  private readonly at = new Map<string, number>();

  add(key: string, label: string, extra?: Partial<FacetOption>): number {
    let i = this.at.get(key);
    if (i === undefined) {
      i = this.options.length;
      this.at.set(key, i);
      this.options.push({ key, label, all: 0, byKind: { cocktail: 0, spirit: 0, wine: 0 }, ...extra });
    }
    return i;
  }

  index(key: string): number {
    return this.at.get(key) ?? -1;
  }
}

/** A facet that is on, compiled: its test, and whether it belongs to one type. */
interface Test {
  facet: FacetKey;
  /** Style, Grape, Region: one type's own, gone when the type changes. */
  scoped: boolean;
  pass: (r: Facets, id: string) => boolean;
}

export interface FacetModel {
  /** Each facet's options. Indices are the counts' indices. */
  options: Readonly<Record<FacetKey, readonly FacetOption[]>>;
  /** An option's index in its facet; -1 for a key the catalogue does not have. */
  indexOf: (facet: FacetKey, key: string) => number;
  /** Whether a type has anything in this facet (Grape has nothing for a cocktail). 'all': any type. */
  applies: (facet: FacetKey, kind: DrinkCategory | 'all') => boolean;
  /** The filter with this type chosen, and every choice it leaves no drink for dropped. */
  withKind: (f: FacetFilter, kind: DrinkCategory | 'all') => FacetFilter;
  /** The filter after a tap on this option. */
  toggle: (f: FacetFilter, c: FacetChip) => FacetFilter;
  /** Whether this option is on. */
  isOn: (f: FacetFilter, c: FacetChip) => boolean;
  /** Every option that is on, in facet order, then option order. Keys the catalogue does not have are left out. */
  chipsOn: (f: FacetFilter, ctx: Pick<FacetContext, 'canMake'>) => FacetChip[];
  /** The grid's test for one drink. A drink someone added has only a type and a Logged state. */
  matcher: (f: FacetFilter, ctx: FacetContext) => (d: { id: string; category: DrinkCategory }) => boolean;
  /** The faceted counts, over `drinks` (the catalogue, or what a search finds in it). */
  count: (f: FacetFilter, ctx: FacetContext, drinks?: readonly { id: string }[]) => FacetCounts;
}

/** Whether this option is on. Needs no index, so the quick row at rest builds none. */
export function chipIsOn(f: FacetFilter, c: FacetChip): boolean {
  if (c.facet === 'kind') return f.kind === c.key;
  if (c.facet === 'status') return f.status === c.key;
  if (c.facet === 'make') return f.make;
  return isList(c.facet) && (f[FIELD[c.facet]] as readonly string[]).includes(c.key);
}

/**
 * Whether any facet is on: the grid goes flat (v4.2 §2.4) and the sliders
 * glyph is filled. I can make it counts only while there is a bar to read,
 * as it filters only then.
 */
export function facetsOn(f: FacetFilter, canMake: ReadonlySet<string> | null): boolean {
  return (
    f.kind !== 'all' ||
    f.status !== 'all' ||
    (f.make && canMake !== null) ||
    f.flavours.length > 0 ||
    f.spirits.length > 0 ||
    f.strength.length > 0 ||
    f.styles.length > 0 ||
    f.grapes.length > 0 ||
    f.countries.length > 0 ||
    f.regions.length > 0
  );
}

export function createFacets(cat: FacetCatalogue): FacetModel {
  const tables: Record<FacetKey, Table> = {
    kind: new Table(),
    flavour: new Table(),
    strength: new Table(),
    make: new Table(),
    spirit: new Table(),
    style: new Table(),
    grape: new Table(),
    country: new Table(),
    region: new Table(),
    status: new Table(),
  };
  for (const k of KINDS) tables.kind.add(k, cat.words.kind[k]);
  for (const f of cat.flavours) tables.flavour.add(f.key, f.label);
  STRENGTH_ORDER.forEach((s, i) => tables.strength.add(s, cat.words.strength[s], { rank: i }));
  tables.make.add('make', cat.words.make);
  for (const s of cat.spirits) tables.spirit.add(s.key, s.label);
  for (const s of LOGGED_ORDER) tables.status.add(s, cat.words.status[s]);

  /*
   * The first pass: which endings are countries, and which regions are
   * written plainly, alone and with their country (for the rule under
   * the second pass's region).
   */
  const plain = plainCountries(cat.drinks.map((d) => tailOf(d.origin)));
  const written = new Set<string>();
  const writtenIn = new Set<string>();
  for (const d of cat.drinks) {
    if (d.category !== 'wine') continue;
    const r = writtenRegion(d.origin);
    if (!r) continue;
    written.add(r);
    const c = countriesOfOrigin(d.origin, plain)[0];
    if (c) writtenIn.add(`${r}|${c}`);
  }
  const regionName = (r: string) => {
    const bare = r.replace(/ Valley$/, '');
    return bare !== r && written.has(bare) ? bare : r;
  };

  /* The second: a record per drink, and every option's figures. */
  const records: Facets[] = [];
  const byId = new Map<string, number>();
  const bump = (facet: FacetKey, i: number, kind: DrinkCategory) => {
    const o = tables[facet].options[i]!;
    o.all += 1;
    o.byKind[kind] += 1;
  };
  for (const d of cat.drinks) {
    const kind = KIND_INDEX[d.category];
    const flavours = cat.flavourMask(d.id);
    const spirits = cat.spiritMask(d.id);
    const band = strengthOf(d.abv);
    const strength = band ? STRENGTH_ORDER.indexOf(band) : -1;

    let style: number;
    if (d.category === 'wine') {
      const w = WINE_STYLE[d.subcategory];
      style = w
        ? tables.style.add(`wine:${w.key}`, w.label, { kind: 'wine', rank: WINE_STYLE_RANK.indexOf(w.key) })
        : tables.style.add(`wine:${d.subcategory}`, cat.styleWord(d.subcategory), { kind: 'wine', rank: WINE_STYLE_RANK.length });
    } else {
      style = d.subcategory ? tables.style.add(`${d.category}:${d.subcategory}`, cat.styleWord(d.subcategory), { kind: d.category }) : -1;
    }

    const grapeNames: readonly string[] = d.category === 'wine' ? cat.grapesOf(d) : [];
    const grapes = grapeNames.length > 0 ? [...new Set(grapeNames)].map((g) => tables.grape.add(g, g)) : NONE;

    const named = countriesOfOrigin(d.origin, plain);
    const countries = named.length > 0 ? named.map((c) => tables.country.add(c, c)) : NONE;

    /*
     * A wine card named for a region the catalogue writes in its country
     * is in that region, whatever wider place its own origin names: the
     * Marlborough card says "South Island, New Zealand" and the Pfalz card
     * "Rhineland-Palatinate", and each was missing from its own region
     * (build 40's review). A region that is its whole country (Malta, and
     * Wales once read as one) is no narrower choice, so it is none.
     */
    const country = named[0];
    let r = d.category === 'wine' ? writtenRegion(d.origin) : null;
    if (d.category === 'wine' && country && writtenIn.has(`${d.name}|${country}`)) r = d.name;
    const place = r ? regionName(r) : null;
    const region = place && country && place !== country ? tables.region.add(`${place}|${country}`, place, { detail: country }) : -1;

    byId.set(d.id, records.length);
    records.push({ kind, flavours, spirits, strength, style, grapes, countries, region });

    bump('kind', kind, d.category);
    for (let b = 0; b < cat.flavours.length; b++) if (flavours & (1 << b)) bump('flavour', b, d.category);
    for (let b = 0; b < cat.spirits.length; b++) if (spirits & (1 << b)) bump('spirit', b, d.category);
    if (strength >= 0) bump('strength', strength, d.category);
    if (style >= 0) bump('style', style, d.category);
    for (const g of grapes) bump('grape', g, d.category);
    for (const c of countries) bump('country', c, d.category);
    if (region >= 0) bump('region', region, d.category);
  }

  const options: Record<FacetKey, readonly FacetOption[]> = {
    kind: tables.kind.options,
    flavour: tables.flavour.options,
    strength: tables.strength.options,
    make: tables.make.options,
    spirit: tables.spirit.options,
    style: tables.style.options,
    grape: tables.grape.options,
    country: tables.country.options,
    region: tables.region.options,
    status: tables.status.options,
  };
  const indexOf = (facet: FacetKey, key: string) => tables[facet].index(key);

  /*
   * Which types a facet holds anything for, from the data: Flavour and
   * Spirit hold no wine, Grape and Region nothing but wine. Type and In
   * your Dex hold every drink. I can make it is a cocktail's: My Bar's
   * recipes are the cocktails' (lib/bar), so it never holds a bottle.
   */
  const holds = (facet: FacetKey, kind: DrinkCategory): boolean => {
    if (facet === 'kind' || facet === 'status') return true;
    if (facet === 'make') return kind === 'cocktail';
    return options[facet].some((o) => o.byKind[kind] > 0);
  };
  const HOLDS = Object.fromEntries(FACET_ORDER.map((f) => [f, KINDS.map((k) => holds(f, k))])) as Record<FacetKey, boolean[]>;
  const applies = (facet: FacetKey, kind: DrinkCategory | 'all') =>
    kind === 'all' ? HOLDS[facet].some(Boolean) : HOLDS[facet][KIND_INDEX[kind]]!;

  /** The keys of a list facet, in option order, the unknown ones dropped: the canonical form. */
  const ordered = (facet: ListFacet, keys: readonly string[]) =>
    keys
      .map((k) => indexOf(facet, k))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)
      .map((i) => options[facet][i]!.key);

  const withKind = (f: FacetFilter, kind: DrinkCategory | 'all'): FacetFilter => {
    const keep = (facet: FacetKey) => kind === 'all' || HOLDS[facet][KIND_INDEX[kind]]!;
    // A scoped facet is drawn only under a type, so 'all' takes it away with its group.
    const scopedKeep = (facet: FacetKey) => kind !== 'all' && keep(facet);
    return {
      ...f,
      kind,
      flavours: keep('flavour') ? f.flavours : [],
      spirits: keep('spirit') ? f.spirits : [],
      make: keep('make') ? f.make : false,
      styles: kind === 'all' ? [] : f.styles.filter((s) => options.style[indexOf('style', s)]?.kind === kind),
      grapes: scopedKeep('grape') ? f.grapes : [],
      regions: scopedKeep('region') ? f.regions : [],
    };
  };

  const toggle = (f: FacetFilter, c: FacetChip): FacetFilter => {
    if (c.facet === 'kind') return withKind(f, f.kind === c.key ? 'all' : (c.key as DrinkCategory));
    if (c.facet === 'status') return { ...f, status: f.status === c.key ? 'all' : (c.key as Logged) };
    if (c.facet === 'make') return { ...f, make: !f.make };
    const field = FIELD[c.facet];
    const now = f[field] as readonly string[];
    const next = now.includes(c.key) ? now.filter((k) => k !== c.key) : ordered(c.facet, [...now, c.key]);
    return { ...f, [field]: next };
  };

  const chipsOn = (f: FacetFilter, ctx: Pick<FacetContext, 'canMake'>): FacetChip[] => {
    const out: FacetChip[] = [];
    for (const facet of FACET_ORDER) {
      if (facet === 'kind') {
        if (f.kind !== 'all') out.push({ facet, key: f.kind });
      } else if (facet === 'status') {
        if (f.status !== 'all') out.push({ facet, key: f.status });
      } else if (facet === 'make') {
        if (f.make && ctx.canMake) out.push({ facet, key: 'make' });
      } else {
        for (const key of ordered(facet, f[FIELD[facet]] as readonly string[])) out.push({ facet, key });
      }
    }
    return out;
  };

  /** A list facet's choices as flags over its options; null when none of them is a key the catalogue has. */
  const flags = (facet: ListFacet, keys: readonly string[]): Uint8Array | null => {
    if (keys.length === 0) return null;
    const out = new Uint8Array(options[facet].length);
    let any = false;
    for (const k of keys) {
      const i = indexOf(facet, k);
      if (i >= 0) {
        out[i] = 1;
        any = true;
      }
    }
    return any ? out : null;
  };
  const bits = (facet: 'flavour' | 'spirit' | 'strength', keys: readonly string[]): number => {
    let m = 0;
    for (const k of keys) {
      const i = indexOf(facet, k);
      if (i >= 0) m |= 1 << i;
    }
    return m;
  };
  const anyIn = (list: readonly number[], on: Uint8Array) => {
    for (const i of list) if (on[i] === 1) return true;
    return false;
  };

  /** The facets that are on, as tests; Type is read on its own (`kind`). */
  const compile = (f: FacetFilter, ctx: FacetContext): { kind: number; tests: Test[] } => {
    const tests: Test[] = [];
    const fl = bits('flavour', f.flavours);
    if (fl) tests.push({ facet: 'flavour', scoped: false, pass: (r) => (r.flavours & fl) !== 0 });
    const st = bits('strength', f.strength);
    if (st) tests.push({ facet: 'strength', scoped: false, pass: (r) => r.strength >= 0 && (st & (1 << r.strength)) !== 0 });
    const bar = f.make ? ctx.canMake : null;
    if (bar) tests.push({ facet: 'make', scoped: false, pass: (_r, id) => bar.has(id) });
    const sp = bits('spirit', f.spirits);
    if (sp) tests.push({ facet: 'spirit', scoped: false, pass: (r) => (r.spirits & sp) !== 0 });
    const sy = flags('style', f.styles);
    if (sy) tests.push({ facet: 'style', scoped: true, pass: (r) => r.style >= 0 && sy[r.style] === 1 });
    const gr = flags('grape', f.grapes);
    if (gr) tests.push({ facet: 'grape', scoped: true, pass: (r) => anyIn(r.grapes, gr) });
    const co = flags('country', f.countries);
    if (co) tests.push({ facet: 'country', scoped: false, pass: (r) => anyIn(r.countries, co) });
    const re = flags('region', f.regions);
    if (re) tests.push({ facet: 'region', scoped: true, pass: (r) => r.region >= 0 && re[r.region] === 1 });
    if (f.status !== 'all') {
      const want = f.status === 'unlocked';
      tests.push({ facet: 'status', scoped: false, pass: (_r, id) => ctx.caught(id) === want });
    }
    return { kind: f.kind === 'all' ? -1 : KIND_INDEX[f.kind], tests };
  };

  const matcher = (f: FacetFilter, ctx: FacetContext) => {
    const { kind, tests } = compile(f, ctx);
    return (d: { id: string; category: DrinkCategory }): boolean => {
      if (kind >= 0 && KIND_INDEX[d.category] !== kind) return false;
      const i = byId.get(d.id);
      if (i === undefined) return tests.every((t) => t.facet === 'status' && t.pass(BLANK, d.id));
      const r = records[i]!;
      for (const t of tests) if (!t.pass(r, d.id)) return false;
      return true;
    };
  };

  const count = (f: FacetFilter, ctx: FacetContext, drinks: readonly { id: string }[] = cat.drinks): FacetCounts => {
    const { kind, tests } = compile(f, ctx);
    const of = Object.fromEntries(FACET_ORDER.map((x) => [x, new Int32Array(options[x].length)])) as Record<FacetKey, Int32Array>;
    const all = (1 << tests.length) - 1;
    /*
     * The tests a Type figure reads, per type: for the type that is on,
     * every test; for another, only those the switch would keep (the
     * facets that type holds anything for, and nothing scoped).
     */
    const kept = KINDS.map((k, ki) => tests.reduce((m, t, ti) => (!t.scoped && HOLDS[t.facet][ki] ? m | (1 << ti) : m), 0));
    const bar = ctx.canMake;
    const add = (facet: FacetKey, r: Facets, id: string) => {
      const o = of[facet];
      switch (facet) {
        case 'flavour':
          for (let b = 0, m = r.flavours; m !== 0; b++, m >>>= 1) if (m & 1) o[b]! += 1;
          return;
        case 'spirit':
          for (let b = 0, m = r.spirits; m !== 0; b++, m >>>= 1) if (m & 1) o[b]! += 1;
          return;
        case 'strength':
          if (r.strength >= 0) o[r.strength]! += 1;
          return;
        case 'make':
          if (bar?.has(id)) o[0]! += 1;
          return;
        case 'style':
          if (r.style >= 0) o[r.style]! += 1;
          return;
        case 'grape':
          for (const g of r.grapes) o[g]! += 1;
          return;
        case 'country':
          for (const c of r.countries) o[c]! += 1;
          return;
        case 'region':
          if (r.region >= 0) o[r.region]! += 1;
          return;
        case 'status':
          o[ctx.caught(id) ? 0 : 1]! += 1;
          return;
        case 'kind':
          return;
      }
    };

    let total = 0;
    for (const d of drinks) {
      const i = byId.get(d.id);
      if (i === undefined) continue;
      const r = records[i]!;
      let fail = 0;
      for (let t = 0; t < tests.length; t++) if (!tests[t]!.pass(r, d.id)) fail |= 1 << t;
      if ((fail & (kind === r.kind ? all : kept[r.kind]!)) === 0) of.kind[r.kind]! += 1;
      if (kind >= 0 && r.kind !== kind) continue;
      if (fail === 0) {
        total += 1;
        for (const facet of FACET_ORDER) add(facet, r, d.id);
      } else if ((fail & (fail - 1)) === 0) {
        add(tests[31 - Math.clz32(fail)]!.facet, r, d.id);
      }
    }
    return { total, of };
  };

  return { options, indexOf, applies, withKind, toggle, isOn: chipIsOn, chipsOn, matcher, count };
}

/** An option's figure in a count; null without a count. */
export function figureOf(model: FacetModel, counts: FacetCounts | null, c: FacetChip): number | null {
  if (!counts) return null;
  const i = model.indexOf(c.facet, c.key);
  return i >= 0 ? (counts.of[c.facet][i] ?? 0) : 0;
}

/** An option's words; the key itself for one the catalogue does not have. */
export function labelOf(model: FacetModel, c: FacetChip): string {
  const i = model.indexOf(c.facet, c.key);
  return i >= 0 ? model.options[c.facet][i]!.label : c.key;
}

/*
 * The order a facet's options are offered in, under a type (or all of
 * them): a fixed rank where the facet has one (Light, Medium, Strong;
 * Red, White, Rosé…), else by how many drinks of that type hold it,
 * most first, ties A to Z. From the catalogue alone, never from the
 * other choices, so the first few of a long facet stay where they are
 * while the rest of the sheet changes under them.
 *
 * `on` keeps a choice that is on though the type holds none of it. A type
 * carries Strength and Country across whole (withKind), so Strong stays on
 * when Wines is tapped, and Moldova when Cocktails is; dropped from the
 * offer for having no wines or no cocktails, it had no chip to untick and
 * no row on its See all page, only a token over the grid (build 40's
 * review). Kept, it sits after the rest with its 0, on, and can be turned
 * off like any other.
 */
export function offerOrder(
  model: FacetModel,
  facet: FacetKey,
  kind: DrinkCategory | 'all',
  on: (o: FacetOption) => boolean = () => false,
): FacetOption[] {
  const size = (o: FacetOption) => (kind === 'all' ? o.all : o.byKind[kind]);
  const fixed = facet === 'kind' || facet === 'flavour' || facet === 'spirit' || facet === 'status' || facet === 'make';
  const list = model.options[facet].filter((o) => (facet === 'style' ? o.kind === kind : size(o) > 0 || fixed || on(o)));
  if (fixed) return list;
  return list.sort((a, b) => (a.rank ?? -size(a)) - (b.rank ?? -size(b)) || a.label.localeCompare(b.label));
}

/** Every option of a long facet under a type, A to Z: a See all page's list, with what is on (offerOrder's `on`). */
export function aToZ(
  model: FacetModel,
  facet: FacetKey,
  kind: DrinkCategory | 'all',
  on?: (o: FacetOption) => boolean,
): FacetOption[] {
  return offerOrder(model, facet, kind, on).sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
}
