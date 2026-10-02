import * as Crypto from 'expo-crypto';

import { DRINKS, getDrink } from '@/data';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import type {
  CompositionComponent,
  CustomDrink,
  CustomDrinkFields,
  Drink,
  DrinkCategory,
  RecipeIngredient,
} from '@/types';

/* ==================================================================== */
/* Drinks people add themselves: the rules                               */
/*                                                                      */
/* When a search finds nothing, the person can add the drink. It goes   */
/* into their own Dex at once (store/customDrinks), and it is sent to   */
/* Sipply as a suggestion (lib/submissions, table drink_submissions,    */
/* migration 018) which reaches Jan in a monthly email already in the   */
/* scripts/cocktaildata and scripts/spiritdata entry shape.             */
/*                                                                      */
/* Everything here is pure: ids, names, the pick-lists, the form's      */
/* normalisation and validation, and the adapter that lets the shared   */
/* drink panels draw a custom entry. The limits are the migration's     */
/* column checks, so anything the form accepts the table accepts; keep  */
/* the two in step.                                                     */
/* ==================================================================== */

/* -------------------------------------------------------------------- */
/* Ids                                                                  */
/* -------------------------------------------------------------------- */

/*
 * A custom id is 'u_<uuid>'. '_' is outside the catalogue's id alphabet
 * (every id in drinks.json matches ^[a-z0-9-]+$, and scripts/lib/dex-merge
 * refuses any that does not), so the two kinds can never collide, and
 * getDrink() stays catalogue-only: everything that counts through it —
 * the Dex progress, Stats, ranks, celebrations, the feed — is honest about
 * custom drinks without being edited.
 *
 * The uuid is made on the phone and doubles as the drink_submissions
 * primary key, so retrying a send whose answer was lost writes the same
 * row instead of a second one.
 */
export const CUSTOM_PREFIX = 'u_';

export const isCustomId = (id: string | null | undefined): id is string =>
  typeof id === 'string' && id.startsWith(CUSTOM_PREFIX);

export const customIdFor = (uuid: string) => `${CUSTOM_PREFIX}${uuid}`;

export const submissionIdOf = (customId: string) => customId.slice(CUSTOM_PREFIX.length);

/**
 * A fresh custom id. The form takes one before saving when there is a
 * photo, so the photo's file can be named after the drink it belongs to
 * (store/customDrinks' add accepts it).
 */
export const newCustomId = () => customIdFor(Crypto.randomUUID());

/* -------------------------------------------------------------------- */
/* Limits                                                               */
/* -------------------------------------------------------------------- */

/**
 * The column checks of drink_submissions (migration 018), for the form's
 * maxLength props and for validateCustom. A form that let through more
 * than the table takes would save a drink that can never be sent.
 */
export const LIMITS = {
  nameMin: 2,
  nameMax: 60,
  styleMin: 2,
  styleMax: 40,
  descriptionMin: 20,
  descriptionMax: 280,
  ingredientsMin: 2,
  ingredientsMax: 12,
  ingredientItem: 80,
  ingredientAmount: 40,
  stepsMax: 8,
  step: 200,
  glassware: 40,
  garnish: 60,
  abvMin: 0.5,
  abvMax: 96,
  base: 120,
  distillation: 120,
  aging: 120,
  serveHow: 280,
  pairingsMax: 3,
  pairing: 40,
  process: 280,
  origin: 80,
  tastingNotesMax: 5,
  tastingNote: 30,
  funFact: 280,
  noteForTeam: 500,
} as const;

/* -------------------------------------------------------------------- */
/* Names                                                                */
/* -------------------------------------------------------------------- */

/*
 * Letters with no NFD decomposition, spelled out. The same table as
 * scripts/lib/dex-merge.mjs's fold, plus the dotless i the Dex search
 * handles, so the form refuses exactly the names the merge scripts would.
 */
const TRANSLIT: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
  œ: 'oe',
  ı: 'i',
};

/**
 * A name reduced to the letters and digits that identify it: accents,
 * case, spaces and punctuation gone. "Bee's Knees", "bees knees" and
 * "BEES-KNEES" are one name.
 *
 * The same key the server keeps as drink_submissions.name_key (lower,
 * unaccent, strip everything outside a-z0-9) and the merge scripts compare
 * with, so "already in the Dex", "you already added it" and the one-per-
 * name index all agree on what the same name is.
 */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[æøłđðþßœı]/g, (c) => TRANSLIT[c] ?? c)
    .replace(/[^a-z0-9]/g, '');
}

/** Every catalogue drink by folded name. The merge scripts keep these unique. */
export const CATALOGUE_NAME_KEYS: ReadonlyMap<string, Drink> = (() => {
  const keys = new Map<string, Drink>();
  for (const d of DRINKS) {
    const k = foldName(d.name);
    if (k && !keys.has(k)) keys.set(k, d);
  }
  return keys;
})();

/** The catalogue drink with this name, if there is one: the form refuses to add a second copy of it. */
export function catalogueTwin(name: string): Drink | undefined {
  const k = foldName(name);
  return k ? CATALOGUE_NAME_KEYS.get(k) : undefined;
}

/** The person's own custom drink with this name, other than `exceptId`. */
export function ownTwin(
  name: string,
  drinks: Readonly<Record<string, CustomDrink>>,
  exceptId?: string | null,
): CustomDrink | undefined {
  const k = foldName(name);
  if (!k) return undefined;
  for (const c of Object.values(drinks)) {
    if (c.id !== exceptId && foldName(c.name) === k) return c;
  }
  return undefined;
}

/**
 * The form's Name, prefilled from a search. Title-cased only when the
 * query has no capital in it: someone who typed "mango chili marg" wants
 * "Mango Chili Marg", and someone who typed "LBV Port" meant the capitals.
 */
export function nameFromQuery(q: string): string {
  const s = Array.from(q.trim().replace(/\s+/g, ' ')).slice(0, LIMITS.nameMax).join('').trim();
  if (s !== s.toLowerCase()) return s;
  return s
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * A query short enough for a button label: cut to 21 characters plus an
 * ellipsis when it is longer than 22 ("Add “mango chili margar…”").
 */
export function shortQuery(q: string): string {
  const chars = Array.from(q.trim());
  return chars.length > 22 ? `${chars.slice(0, 21).join('')}…` : chars.join('');
}

/* -------------------------------------------------------------------- */
/* Pick-lists                                                           */
/* -------------------------------------------------------------------- */

/** Catalogue frequency order (measured: shaken 340, built 266, stirred 160, …). */
export const METHODS = [
  'shaken',
  'built',
  'stirred',
  'blended',
  'boiled',
  'infused',
  'layered',
  'muddled',
  'swizzled',
  'rolled',
  'thrown',
] as const;

export const GLASSWARE = {
  cocktail: [
    'Coupe glass',
    'Rocks glass',
    'Highball glass',
    'Collins glass',
    'Martini glass',
    'Shot glass',
    'Wine glass',
    'Champagne flute',
    'Hurricane glass',
    'Tiki mug',
    'Copper mug',
    'Mug',
    'Julep tin',
    'Punch bowl',
  ],
  spirit: [
    'Rocks glass',
    'Glencairn glass',
    'Snifter',
    'Tulip glass',
    'Copa glass',
    'Shot glass',
    'Highball glass',
    'Cordial glass',
    'Coupe',
    'Veladora',
  ],
} as const satisfies Record<DrinkCategory, readonly string[]>;

/** Label shown → value stored. Values are verbatim catalogue strings, so the export needs no mapping. */
export const SERVE_TEMPS = [
  { label: 'Room temp', value: 'room temp' },
  { label: 'Room temp or one big cube', value: 'room temp or one large cube' },
  { label: 'Cellar temp', value: '60-65°F, cellar temp' },
  { label: 'Well chilled', value: '38-45°F, well chilled' },
  { label: 'Over ice', value: 'cold, over ice' },
  { label: 'From the freezer', value: 'freezer cold' },
] as const;

/** Most frequent first; ties alphabetical, so the order is the same on every launch. */
function byFrequency(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}

const stylesCache = new Map<DrinkCategory, string[]>();

/**
 * The style chips: the catalogue's own subcategories for the category
 * (19 cocktail, 28 spirit today), most used first. Read from DRINKS at
 * first use rather than written out, so they track the catalogue.
 */
export function subcategoriesFor(category: DrinkCategory): string[] {
  const hit = stylesCache.get(category);
  if (hit) return hit;
  const counts = new Map<string, number>();
  for (const d of DRINKS) {
    if (d.category === category) counts.set(d.subcategory, (counts.get(d.subcategory) ?? 0) + 1);
  }
  const styles = byFrequency(counts);
  stylesCache.set(category, styles);
  return styles;
}

const notesCache = new Map<string, string[]>();

/**
 * The 8 tasting notes catalogue drinks of this category and style use
 * most. A style the catalogue does not have (a new one, or none picked
 * yet) gets the category's 8 instead, so the suggestions are never empty.
 */
export function suggestedNotes(category: DrinkCategory, subcategory: string): string[] {
  const key = `${category}\n${subcategory}`;
  const hit = notesCache.get(key);
  if (hit) return hit;
  const tally = (match: (d: Drink) => boolean) => {
    const counts = new Map<string, number>();
    for (const d of DRINKS) {
      if (!match(d)) continue;
      for (const n of d.tastingNotes) {
        const note = n.trim().toLowerCase();
        if (note) counts.set(note, (counts.get(note) ?? 0) + 1);
      }
    }
    return byFrequency(counts).slice(0, 8);
  };
  let notes = tally((d) => d.category === category && d.subcategory === subcategory);
  if (notes.length === 0) notes = tally((d) => d.category === category);
  notesCache.set(key, notes);
  return notes;
}

/* -------------------------------------------------------------------- */
/* Formatting                                                           */
/* -------------------------------------------------------------------- */

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

/**
 * "40%" or "40–46%" (en dash, as the catalogue writes ranges); '' when
 * unknown. The same text the migration's abv_text writes into the export.
 */
export function formatAbv(lo: number | null, hi: number | null): string {
  if (lo == null) return '';
  if (hi == null || hi === lo) return `${oneDecimal(lo)}%`;
  return `${oneDecimal(lo)}–${oneDecimal(hi)}%`;
}

/**
 * An ABV as typed: null when blank, NaN when it is not a number, otherwise
 * rounded to one decimal. A comma is a decimal point (half the world types
 * 40,5) and a trailing % is forgiven.
 */
export function parseAbv(s: string): number | null {
  const t = s.trim().replace(',', '.').replace(/\s*%$/, '');
  if (!t) return null;
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 10) / 10;
}

/*
 * The Dex's spelling of a country, keyed by what people type. The same
 * direction as dex-merge's COUNTRY_ALIASES (minority form to the Dex's),
 * which refuses the left-hand spellings at merge time. A Map, so a typed
 * "constructor" is not a key.
 */
const ORIGIN_ALIASES = new Map<string, string>([
  ['united states', 'USA'],
  ['united states of america', 'USA'],
  ['us', 'USA'],
  ['u.s.', 'USA'],
  ['usa', 'USA'],
  ['türkiye', 'Turkey'],
  ['czech republic', 'Czechia'],
  ['antigua & barbuda', 'Antigua and Barbuda'],
  ['bosnia & herzegovina', 'Bosnia and Herzegovina'],
  ['trinidad & tobago', 'Trinidad and Tobago'],
  ['pr', 'Puerto Rico'],
]);

/**
 * "San Juan, PR" → "San Juan, Puerto Rico". Only the last comma segment
 * is the country (the Dex writes "City, Country"), so only it is mapped;
 * empty segments go.
 */
export function normaliseOrigin(s: string): string {
  const parts = s
    .split(',')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (parts.length === 0) return '';
  const last = parts.length - 1;
  parts[last] = ORIGIN_ALIASES.get(parts[last].toLowerCase()) ?? parts[last];
  return parts.join(', ');
}

/* -------------------------------------------------------------------- */
/* The form's draft                                                     */
/* -------------------------------------------------------------------- */

/**
 * What the form holds while someone types: the saved fields, except that
 * the ABV is the text as typed, because "4" on the way to "40" is not a
 * number anyone meant. fieldsFromDraft turns it into CustomDrinkFields.
 *
 * The form keeps one draft per category while the person switches between
 * Cocktail and Spirit, and saves only the active one; the other
 * category's fields are cleared on the way out (normaliseFields), as the
 * server clears them too.
 */
export type CustomDraft = Omit<CustomDrinkFields, 'abvLow' | 'abvHigh'> & {
  abvLow: string;
  abvHigh: string;
};

/** A blank draft, optionally named (from a search) and in a category (the Dex's filter). */
export function emptyDraft(opts?: { name?: string; category?: DrinkCategory }): CustomDraft {
  return {
    name: opts?.name ?? '',
    category: opts?.category ?? 'cocktail',
    subcategory: '',
    subcategoryIsNew: false,
    description: '',
    abvLow: '',
    abvHigh: '',
    origin: '',
    glassware: '',
    tastingNotes: [],
    funFact: '',
    ingredients: [],
    steps: [],
    method: '',
    garnish: '',
    base: '',
    distillation: '',
    aging: '',
    serveTemp: '',
    serveHow: '',
    pairings: [],
    process: '',
    noteForTeam: '',
  };
}

/** A saved drink back as a draft, for Edit details. */
export function draftFrom(c: CustomDrinkFields): CustomDraft {
  return {
    ...c,
    abvLow: c.abvLow == null ? '' : oneDecimal(c.abvLow),
    abvHigh: c.abvHigh == null ? '' : oneDecimal(c.abvHigh),
    tastingNotes: [...c.tastingNotes],
    ingredients: c.ingredients.map((i) => ({ item: i.item, amount: i.amount })),
    steps: [...c.steps],
    pairings: [...c.pairings],
  };
}

/* -------------------------------------------------------------------- */
/* Normalisation                                                        */
/* -------------------------------------------------------------------- */

/** Trimmed, with every run of whitespace one space: for one-line fields. */
const line = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');
/** Trimmed only: multi-line fields keep the line breaks they were typed with. */
const block = (s: string | null | undefined) => (s ?? '').trim();

/** Lower-cased, blanks dropped, each once: tasting notes and pairings. */
function tokens(list: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const t = line(raw).toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** A style the catalogue already has, in the catalogue's own spelling. */
function knownStyle(category: DrinkCategory, style: string): string | undefined {
  const lower = style.toLowerCase();
  return subcategoriesFor(category).find((s) => s.toLowerCase() === lower);
}

/**
 * The form's answers as they are saved and sent. Idempotent, so the store
 * runs it on every add and update whatever the caller already did:
 *
 *   - every string trimmed; one-line fields have their spaces collapsed
 *   - tasting notes and pairings lower-cased, each once
 *   - the origin's country spelled the Dex's way (normaliseOrigin)
 *   - blank ingredient, step, note and pairing rows dropped (an
 *     ingredient row is blank without its item: validateCustom refuses an
 *     amount on its own, and the table needs an item in every row)
 *   - the ABV rounded to one decimal; the top of a range dropped when it
 *     equals the bottom
 *   - a "new" style that turns out to be one the catalogue has takes the
 *     catalogue's spelling and stops being new
 *   - the other category's fields cleared: the form keeps both while the
 *     person switches, and saves only the one they chose
 *   - a method outside METHODS becomes '' (Not sure)
 */
export function normaliseFields(f: CustomDrinkFields): CustomDrinkFields {
  const cocktail = f.category === 'cocktail';
  const style = line(f.subcategory);
  const known = style ? knownStyle(f.category, style) : undefined;
  const round = (n: number | null) =>
    n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10;
  const abvLow = round(f.abvLow);
  const high = round(f.abvHigh);
  const abvHigh = abvLow == null || high === abvLow ? null : high;
  const method = line(f.method).toLowerCase();

  return {
    name: line(f.name),
    category: cocktail ? 'cocktail' : 'spirit',
    subcategory: known ?? style,
    subcategoryIsNew: Boolean(style) && !known,
    description: block(f.description),
    abvLow,
    abvHigh,
    origin: normaliseOrigin(f.origin ?? ''),
    glassware: line(f.glassware),
    tastingNotes: tokens(f.tastingNotes),
    funFact: block(f.funFact),
    ingredients: cocktail
      ? (f.ingredients ?? [])
          .map((i) => ({ item: line(i.item), amount: line(i.amount) }))
          .filter((i) => i.item)
      : [],
    steps: cocktail ? (f.steps ?? []).map(block).filter(Boolean) : [],
    method: cocktail && (METHODS as readonly string[]).includes(method) ? method : '',
    garnish: cocktail ? line(f.garnish) : '',
    base: cocktail ? '' : line(f.base),
    distillation: cocktail ? '' : line(f.distillation),
    aging: cocktail ? '' : line(f.aging),
    serveTemp: cocktail ? '' : line(f.serveTemp),
    serveHow: cocktail ? '' : block(f.serveHow),
    pairings: cocktail ? [] : tokens(f.pairings),
    process: cocktail ? '' : block(f.process),
    noteForTeam: block(f.noteForTeam),
  };
}

/** The draft as saved: the ABV parsed, then normaliseFields. Call after validateCustom passes. */
export function fieldsFromDraft(d: CustomDraft): CustomDrinkFields {
  const lo = parseAbv(d.abvLow);
  const hi = parseAbv(d.abvHigh);
  return normaliseFields({
    ...d,
    abvLow: lo != null && Number.isFinite(lo) ? lo : null,
    abvHigh: hi != null && Number.isFinite(hi) ? hi : null,
  });
}

/* -------------------------------------------------------------------- */
/* Validation                                                           */
/* -------------------------------------------------------------------- */

export type FieldKey = keyof CustomDraft;
export type CustomErrors = Partial<Record<FieldKey, string>>;

/**
 * The form's fields in the order the screen shows them, for the first
 * error to scroll to. The order differs by category: a spirit's ABV is
 * part of the bottle, a cocktail's an optional detail.
 */
export function fieldOrder(category: DrinkCategory): FieldKey[] {
  const head: FieldKey[] = ['name', 'category', 'subcategory', 'description'];
  const tail: FieldKey[] = ['origin', 'tastingNotes', 'funFact', 'noteForTeam'];
  return category === 'cocktail'
    ? [...head, 'ingredients', 'method', 'steps', 'glassware', 'garnish', 'abvLow', 'abvHigh', ...tail]
    : [
        ...head,
        'abvLow',
        'abvHigh',
        'base',
        'distillation',
        'aging',
        'glassware',
        'serveTemp',
        'serveHow',
        'pairings',
        'process',
        ...tail,
      ];
}

/** The first field with an error, in screen order; undefined when there is none. */
export function firstErrorKey(errors: CustomErrors, category: DrinkCategory): FieldKey | undefined {
  return fieldOrder(category).find((k) => errors[k]);
}

const tooLong = (max: number) => `Keep it to ${max} characters.`;
const chars = (s: string) => Array.from(s).length;

/**
 * Every problem with a draft, one message per field, empty when it can be
 * saved. The save button stays enabled and this says what is missing,
 * because a dimmed button on a long form does not say which field it is
 * waiting for.
 *
 * Required: the name, the category, a style, a description of 20–280
 * characters; for a cocktail at least two ingredients, for a spirit its
 * ABV. Everything else is optional (blanks are listed for Jan in the
 * monthly email, and the merge scripts refuse to run until he fills them).
 *
 * A name the Dex already has is an error, not a warning: an exact
 * duplicate is never what Jan wants, and the existing entry is one tap
 * away in "Already in the Dex?". So is a name this person already added;
 * pass their drinks as `own`, and `editingId` so a drink is not its own
 * twin.
 *
 * Every text value also goes through the content filter, so a refusal is
 * said next to its field before the drink is saved, rather than after,
 * as a suggestion that silently never sends.
 */
export function validateCustom(
  draft: CustomDraft,
  opts?: { own?: Readonly<Record<string, CustomDrink>>; editingId?: string | null },
): CustomErrors {
  const errors: CustomErrors = {};
  const put = (key: FieldKey, message: string) => {
    if (!errors[key]) errors[key] = message;
  };
  const cocktail = draft.category === 'cocktail';
  const text = (key: FieldKey, value: string, max: number) => {
    if (chars(value.trim()) > max) put(key, tooLong(max));
    else if (containsObjectionable(value)) put(key, OBJECTIONABLE_MESSAGE);
  };

  // Name
  const name = line(draft.name);
  if (chars(name) < LIMITS.nameMin || chars(name) > LIMITS.nameMax || foldName(name).length < 2) {
    put('name', `Give it a name of ${LIMITS.nameMin} to ${LIMITS.nameMax} characters.`);
  } else if (containsObjectionable(name)) {
    put('name', OBJECTIONABLE_MESSAGE);
  } else {
    const twin = catalogueTwin(name);
    if (twin) put('name', `“${twin.name}” is already in the Dex.`);
    const mine = opts?.own ? ownTwin(name, opts.own, opts.editingId) : undefined;
    if (mine) put('name', `You already added “${mine.name}”.`);
  }

  // Style
  const style = line(draft.subcategory);
  if (!style) {
    put(
      'subcategory',
      draft.subcategoryIsNew
        ? `Give the style a name of ${LIMITS.styleMin} to ${LIMITS.styleMax} characters.`
        : 'Pick a style.',
    );
  } else if (chars(style) < LIMITS.styleMin || chars(style) > LIMITS.styleMax) {
    put('subcategory', `Give the style a name of ${LIMITS.styleMin} to ${LIMITS.styleMax} characters.`);
  } else if (containsObjectionable(style)) {
    put('subcategory', OBJECTIONABLE_MESSAGE);
  }

  // Description
  const description = block(draft.description);
  if (chars(description) < LIMITS.descriptionMin || chars(description) > LIMITS.descriptionMax) {
    put('description', `Describe it in ${LIMITS.descriptionMin} to ${LIMITS.descriptionMax} characters.`);
  } else if (containsObjectionable(description)) {
    put('description', OBJECTIONABLE_MESSAGE);
  }

  // ABV: required for a spirit (the bottle says it), optional for a cocktail.
  const lo = parseAbv(draft.abvLow);
  const hi = parseAbv(draft.abvHigh);
  const inRange = (n: number) => Number.isFinite(n) && n >= LIMITS.abvMin && n <= LIMITS.abvMax;
  const optionalAbv = 'Use a number from 0.5 to 96, or leave it blank.';
  if (lo == null) {
    if (!cocktail) put('abvLow', 'Add the ABV from the label, 0.5 to 96.');
    else if (hi != null) put('abvLow', 'Add the first number too, or leave both blank.');
  } else if (!inRange(lo)) {
    put('abvLow', cocktail ? optionalAbv : 'Add the ABV from the label, 0.5 to 96.');
  }
  if (hi != null) {
    if (!inRange(hi)) put('abvHigh', optionalAbv);
    else if (lo != null && inRange(lo) && hi < lo) {
      put('abvHigh', 'The second number has to be higher than the first.');
    }
  }

  if (cocktail) {
    const rows = (draft.ingredients ?? []).map((i) => ({ item: line(i.item), amount: line(i.amount) }));
    const filled = rows.filter((i) => i.item);
    if (rows.some((i) => i.amount && !i.item)) put('ingredients', 'Each amount needs an ingredient.');
    else if (filled.length < LIMITS.ingredientsMin) put('ingredients', 'Add at least two ingredients.');
    else if (filled.length > LIMITS.ingredientsMax) {
      put('ingredients', `That's more than ${LIMITS.ingredientsMax} ingredients.`);
    } else if (
      filled.some((i) => chars(i.item) > LIMITS.ingredientItem || chars(i.amount) > LIMITS.ingredientAmount)
    ) {
      put(
        'ingredients',
        `Keep each ingredient to ${LIMITS.ingredientItem} characters and each amount to ${LIMITS.ingredientAmount}.`,
      );
    } else if (filled.some((i) => containsObjectionable(`${i.amount} ${i.item}`))) {
      put('ingredients', OBJECTIONABLE_MESSAGE);
    }

    const steps = (draft.steps ?? []).map(block).filter(Boolean);
    if (steps.length > LIMITS.stepsMax) put('steps', `That's more than ${LIMITS.stepsMax} steps.`);
    else if (steps.some((s) => chars(s) > LIMITS.step)) put('steps', tooLong(LIMITS.step));
    else if (steps.some((s) => containsObjectionable(s))) put('steps', OBJECTIONABLE_MESSAGE);

    text('garnish', line(draft.garnish), LIMITS.garnish);
  } else {
    text('base', line(draft.base), LIMITS.base);
    text('distillation', line(draft.distillation), LIMITS.distillation);
    text('aging', line(draft.aging), LIMITS.aging);
    text('serveHow', block(draft.serveHow), LIMITS.serveHow);
    text('process', block(draft.process), LIMITS.process);

    const pairings = tokens(draft.pairings);
    if (pairings.length > LIMITS.pairingsMax) put('pairings', "That's the most it takes.");
    else if (pairings.some((p) => chars(p) > LIMITS.pairing)) put('pairings', tooLong(LIMITS.pairing));
    else if (pairings.some((p) => containsObjectionable(p))) put('pairings', OBJECTIONABLE_MESSAGE);
  }

  text('glassware', line(draft.glassware), LIMITS.glassware);
  text('origin', normaliseOrigin(draft.origin ?? ''), LIMITS.origin);
  text('funFact', block(draft.funFact), LIMITS.funFact);
  text('noteForTeam', block(draft.noteForTeam), LIMITS.noteForTeam);

  const notes = tokens(draft.tastingNotes);
  if (notes.length > LIMITS.tastingNotesMax) put('tastingNotes', "That's the most it takes.");
  else if (notes.some((n) => chars(n) > LIMITS.tastingNote)) put('tastingNotes', tooLong(LIMITS.tastingNote));
  else if (notes.some((n) => containsObjectionable(n))) put('tastingNotes', OBJECTIONABLE_MESSAGE);

  return errors;
}

/* -------------------------------------------------------------------- */
/* Drawing a custom drink with the catalogue's components               */
/* -------------------------------------------------------------------- */

/** Ice is how a drink is served, not what it is made of; the card's list leaves it out. */
const ICE = /^\s*(crushed\s+|cubed\s+)?ice\b/i;

/** The Composition card's rows, in the catalogue's order; blanks left out. */
function componentsOf(c: CustomDrinkFields): CompositionComponent[] {
  return [
    { label: 'Base', detail: c.base },
    { label: 'Distillation', detail: c.distillation },
    { label: 'Aging', detail: c.aging },
    { label: 'Strength', detail: formatAbv(c.abvLow, c.abvHigh) },
  ].filter((x) => x.detail !== '');
}

const drawn = new WeakMap<CustomDrink, Drink>();

/**
 * A custom drink as a Drink, FOR DRAWING ONLY: DrinkArt, the shared drink
 * panels, the log sheet's row. dexNumber is 0 and rarity 'common' because
 * a custom drink has neither, and recipe, serve and composition are built
 * the way the monthly export builds them, so what the person sees is what
 * Jan receives.
 *
 * Never pass the result to useCollection, useSocial or anything else that
 * writes: those are catalogue ids only, and every count in the app relies
 * on it.
 *
 * The same object comes back for the same record (the store replaces a
 * record whenever it changes), so a component can use it as a dependency.
 */
export function toDrink(c: CustomDrink): Drink {
  const hit = drawn.get(c);
  if (hit) return hit;
  const cocktail = c.category === 'cocktail';
  const d: Drink = {
    id: c.id,
    dexNumber: 0,
    name: c.name,
    category: c.category,
    subcategory: c.subcategory,
    description: c.description,
    abv: formatAbv(c.abvLow, c.abvHigh),
    origin: c.origin,
    rarity: 'common',
    tastingNotes: c.tastingNotes,
    glassware: c.glassware,
    ingredients: cocktail ? c.ingredients.map((i) => i.item).filter((i) => !ICE.test(i)) : undefined,
    funFact: c.funFact,
    recipe: cocktail
      ? {
          ingredients: c.ingredients.map(
            (i): RecipeIngredient => ({ item: i.item, amount: i.amount }),
          ),
          steps: c.steps,
          garnish: c.garnish,
          method: c.method,
        }
      : undefined,
    serve: cocktail
      ? undefined
      : { temp: c.serveTemp, glass: c.glassware, how: c.serveHow, pair: c.pairings },
    composition: cocktail
      ? undefined
      : { summary: '', components: componentsOf(c), process: c.process },
  };
  drawn.set(c, d);
  return d;
}

/* -------------------------------------------------------------------- */
/* The status line on a custom drink                                    */
/* -------------------------------------------------------------------- */

/*
 * How a refusal is kept in CustomDrink.syncDetail: the column the server
 * named (possibly none), prefixed 'invalid:' when it was the table's own
 * checks (submission_invalid, or a CHECK constraint) rather than the
 * content filter (objectionable_content). The two read differently on the
 * status line, and the prefix is the only place the difference survives;
 * refusalOf is the only reader.
 */
const INVALID = 'invalid:';

/** syncDetail for a refusal (lib/submissions writes it). */
export function refusalDetail(kind: 'wording' | 'checks', column: string | null | undefined): string {
  const col = typeof column === 'string' ? column : '';
  return kind === 'checks' ? `${INVALID}${col}` : col;
}

/** What the server refused, from syncDetail. */
export function refusalOf(c: Pick<CustomDrink, 'sync' | 'syncDetail'>): {
  kind: 'wording' | 'checks';
  column: string;
} | null {
  if (c.sync !== 'refused') return null;
  const d = c.syncDetail ?? '';
  return d.startsWith(INVALID)
    ? { kind: 'checks', column: d.slice(INVALID.length) }
    : { kind: 'wording', column: d };
}

const FIELD_LABELS = new Map<string, string>([
  ['name', 'name'],
  ['description', 'description'],
  ['ingredients', 'ingredients'],
  ['fun_fact', 'story'],
  ['note_for_team', 'note to the Sipply team'],
  ['subcategory', 'style'],
  ['abv_low', 'ABV'],
  ['abv_high', 'ABV'],
  ['glassware', 'glass'],
  ['serve_temp', 'serve'],
  ['photo_path', 'photo'],
]);

/** A drink_submissions column as the person knows it. */
export function fieldLabel(column: string): string {
  return FIELD_LABELS.get(column) ?? column.replace(/_/g, ' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The custom detail screen's line about the suggestion: where it stands
 * with Sipply, in the person's words. `danger` for a refusal, the one
 * state they have to act on. Null while the drink is about to fold into
 * the catalogue entry it became (lib/submissions adopts it).
 *
 * "Sent on" is the date of the version Sipply holds — the last edit, which
 * goes within moments when the phone is online.
 */
export function syncStatusLine(
  c: CustomDrink,
  signedIn: boolean,
): { text: string; danger: boolean } | null {
  if (c.status === 'declined') return { text: 'Kept in your Dex only.', danger: false };
  if (c.status === 'added' || c.status === 'duplicate') {
    return getDrink(c.catalogueId)
      ? null
      : { text: 'In the Dex in the next update of Sipply.', danger: false };
  }
  const refusal = refusalOf(c);
  if (refusal) {
    // No column when the server's refusal named none (a check over several
    // columns at once): the drink as a whole is what to edit.
    const label = refusal.column ? fieldLabel(refusal.column) : '';
    let text: string;
    if (refusal.kind === 'checks') {
      text = label
        ? `Not sent: ${label} didn't pass Sipply's checks. Edit it to send.`
        : "Not sent: it didn't pass Sipply's checks. Edit it to send.";
    } else {
      text = label
        ? `Not sent: the ${label} has wording Sipply doesn't allow. Edit it to send.`
        : "Not sent: it has wording Sipply doesn't allow. Edit it to send.";
    }
    return { text, danger: true };
  }
  switch (c.sync) {
    case 'quota':
      return {
        text: "Not sent yet: that's 30 suggestions in 30 days. It sends on its own once you're under.",
        danger: false,
      };
    case 'duplicate':
      return { text: 'Not sent: you already suggested a drink with this name.', danger: false };
    case 'synced': {
      const d = new Date(c.updatedAt);
      const when = Number.isNaN(d.getTime()) ? '' : ` on ${MONTHS[d.getMonth()]} ${d.getDate()}`;
      return {
        text: `Sent to Sipply${when}. We go through suggestions every month.`,
        danger: false,
      };
    }
    default:
      return signedIn
        ? { text: "Not sent to Sipply yet. It goes the next time you're online.", danger: false }
        : { text: "Saved on this phone. Sign in and it's sent to Sipply.", danger: false };
  }
}
