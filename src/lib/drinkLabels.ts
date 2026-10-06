import { resolveShape, type GlassShape } from '@/components/artwork/glasses';
import type { Drink } from '@/types';

/* ==================================================================== */
/* How a drink's facts are said on screen                               */
/*                                                                      */
/* The catalogue stores its facts the way the data scripts wrote them:  */
/* styles in Title Case ("Spirit-Forward"), serving temperatures as     */
/* phrases ("60-65°F, cellar temp"), amounts with their metric and a    */
/* note run together ("1.5 oz / 45 ml, to top"). The v3 screens set     */
/* each fact on its own (the drink page's label band, the spec card,    */
/* the nameplate's meta line), so the text is shaped here, once, and    */
/* every screen says a fact the same way. Pure: no React, no stores.    */
/*                                                                      */
/* Custom drinks pass through too (lib/customDrinks toDrink), so every  */
/* function copes with blanks: an empty field comes back as '' (or null */
/* where the signature says so) and the caller leaves that part out.    */
/*                                                                      */
/* Month and weekday names are written out rather than asked of Intl:   */
/* React Native ships without full ICU on Android, where the locale     */
/* calls quietly fall back (the same reason as formatCount).            */
/* ==================================================================== */

/** One column of the drink page's label band: the value, and the small word under it. */
export type LabelFact = { value: string; caption: string };

/** First character up, the rest as written. */
function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

const tidy = (s: string | undefined | null) => (s ?? '').trim().replace(/\s+/g, ' ');

/* -------------------------------------------------------------------- */
/* Style                                                                */
/* -------------------------------------------------------------------- */

/*
 * Words that stay capitalised after the first. The first six are the
 * spec's set. The catalogue never reaches this (its proper words lead:
 * "American Whiskey", "Scotch"); styles people type for their own drinks
 * do ("Blended Scotch", "Aged Jamaican Rum").
 */
const PROPER = new Set([
  'American',
  'Irish',
  'Scotch',
  'Japanese',
  'Mexican',
  'Caribbean',
  'Canadian',
  'Cuban',
  'English',
  'French',
  'German',
  'Italian',
  'Dutch',
  'Spanish',
  'Peruvian',
  'Brazilian',
  'Chinese',
  'Korean',
  'Tennessee',
  'Kentucky',
  'London',
  'Jamaican',
  'Welsh',
]);

/*
 * Only a Capitalised word ("Forward") is Title Case to undo. An acronym
 * ("VSOP") or a name with an inner capital ("DeKuyper") is kept, because
 * lowering just its first letter would print "vSOP".
 */
function lowerTitleWord(word: string): string {
  if (PROPER.has(word)) return word;
  const first = word[0]!;
  const rest = word.slice(1);
  const capitalised = first !== first.toLowerCase() && rest === rest.toLowerCase();
  return capitalised ? first.toLowerCase() + rest : word;
}

/**
 * "Spirit-Forward" → "Spirit-forward", "Modern Classic" → "Modern classic",
 * "American Whiskey" → "American whiskey", "Creamy & Dessert" → "Creamy & dessert".
 *
 * Sentence case: the first letter is capitalised (a typed "smoky mezcal"
 * becomes "Smoky mezcal"), and every later word, split on spaces and
 * hyphens, loses its Title Case capital unless it is in PROPER.
 */
export function styleLabel(subcategory: string): string {
  const s = tidy(subcategory);
  if (!s) return '';
  let first = true;
  return s
    .split(/([ -])/)
    .map((part) => {
      if (part === '' || part === ' ' || part === '-') return part;
      if (first) {
        first = false;
        return capitalise(part);
      }
      return lowerTitleWord(part);
    })
    .join('');
}

/**
 * The eyebrow phrase on the drink page: "Spirit-forward cocktail" for a
 * cocktail, the style alone for a spirit ("American whiskey", "Vermouth"),
 * since "American whiskey spirit" says the category twice. A drink with no
 * style (a custom one left blank) gets its category word.
 */
export function stylePhrase(drink: Pick<Drink, 'category' | 'subcategory'>): string {
  const style = styleLabel(drink.subcategory);
  if (drink.category === 'cocktail') return style ? `${style} cocktail` : 'Cocktail';
  return style || 'Spirit';
}

/* -------------------------------------------------------------------- */
/* Glass                                                                */
/* -------------------------------------------------------------------- */

/*
 * The 21 drawn shapes' names, so the label band reads "Coupe", not the
 * catalogue's 298 spellings of it. Both wine shapes are a "Wine glass".
 * The four that are not glasses are captioned 'vessel'.
 */
const GLASS_NAMES: Record<GlassShape, LabelFact> = {
  coupe: { value: 'Coupe', caption: 'glass' },
  martini: { value: 'Martini', caption: 'glass' },
  margarita: { value: 'Margarita', caption: 'glass' },
  flute: { value: 'Flute', caption: 'glass' },
  wineRed: { value: 'Wine', caption: 'glass' },
  wineWhite: { value: 'Wine', caption: 'glass' },
  port: { value: 'Port', caption: 'glass' },
  highball: { value: 'Highball', caption: 'glass' },
  rocks: { value: 'Rocks', caption: 'glass' },
  shot: { value: 'Shot', caption: 'glass' },
  pint: { value: 'Pint', caption: 'glass' },
  pilsner: { value: 'Pilsner', caption: 'glass' },
  weizen: { value: 'Weizen', caption: 'glass' },
  snifter: { value: 'Snifter', caption: 'glass' },
  glencairn: { value: 'Glencairn', caption: 'glass' },
  tulip: { value: 'Tulip', caption: 'glass' },
  hurricane: { value: 'Hurricane', caption: 'glass' },
  mug: { value: 'Mug', caption: 'vessel' },
  tiki: { value: 'Tiki mug', caption: 'vessel' },
  sake: { value: 'Sake cup', caption: 'vessel' },
  julepCup: { value: 'Julep cup', caption: 'vessel' },
};

/*
 * The glassware words each shape's name honestly stands for. resolveShape
 * must draw something, so it draws a near shape (a cordial glass as a
 * Glencairn, a punch bowl as a mug) and falls back to the category's glass
 * when it recognises nothing ("Copa glass", "Tankard", "Hollowed
 * pineapple"). A drawing can approximate; a label is a fact, and the shape
 * name would give about 380 catalogue drinks a glass their glassware never
 * names (a sherry's copita as "Rocks"), and show "Rocks glass" to anyone
 * who picks "Copa glass" for their own drink. So a shape's name is used
 * only when the glassware names that shape or a true synonym (a tumbler is
 * a rocks glass, a tall glass a highball); otherwise the label is the
 * drink's own first-named vessel. A Collins is not a highball here:
 * add-drink offers both, side by side.
 */
const NAMED_BY: Record<GlassShape, RegExp> = {
  coupe: /coupe/,
  martini: /martini|cocktail glass/,
  margarita: /margarita/,
  flute: /flute|champagne/,
  wineRed: /wine|bordeaux|burgundy/,
  wineWhite: /wine/,
  port: /\bport\b/,
  highball: /highball|zombie|\btall\b/,
  rocks: /rocks|old fashioned|tumbler|lowball/,
  shot: /shot|caballito|shooter/,
  pint: /(?:^|[^-])\bpint\b|nonic/,
  pilsner: /pilsner/,
  weizen: /weizen|weiss|hefe/,
  snifter: /snifter|brandy balloon/,
  glencairn: /glencairn/,
  tulip: /tulip/,
  hurricane: /hurricane/,
  mug: /\bmugs?\b|stein|krug/,
  tiki: /tiki/,
  sake: /sake|ochoko|guinomi/,
  julepCup: /julep/,
};

/*
 * Where the first-named vessel ends: "Copita | or rocks glass", "Small
 * glass|, chilled", "Absinthe glass | with a slotted spoon". Not at "and":
 * "Nick and Nora glass" is one glass, and "Punch bowl and cups" reads whole.
 */
const AFTER_FIRST_VESSEL = /\s+or\s+|,|\s+with\s+|\s+in\s+a\s+|\s+dropped\s+|\s+over\s+/i;

const SHAPES = Object.keys(NAMED_BY) as GlassShape[];

/*
 * How the glass is served, not which glass it is. The serve column says
 * "Chilled" already, so "Small chilled glass" is "Small glass" here. A
 * name that is nothing else ("Chilled glass", "Warmed glass") keeps it:
 * it is all the catalogue says.
 */
const SERVE_WORDS = /\b(?:pre-chilled|chilled|frozen|frosted|iced|warmed)\s+/gi;

/*
 * Glasses named without the word: captioned 'glass' (a copita is not a
 * "vessel"), and said alone in a phrase ("Copita", not "Copita glass").
 */
const SELF_NAMED_GLASS = /\b(?:copita|goblet|schooner|veladora|balón)$/i;

/**
 * The label band's glass column: { value: 'Coupe', caption: 'glass' },
 * { value: 'Julep cup', caption: 'vessel' }; for glassware no shape names,
 * the drink's own words: "Copa glass" → { value: 'Copa', caption: 'glass' },
 * "Copita or veladora" → { value: 'Copita', caption: 'glass' },
 * "Small ceramic cup" → { value: 'Small ceramic cup', caption: 'vessel' }.
 * A custom drink with no glassware → value ''.
 */
export function glassLabel(drink: Pick<Drink, 'category' | 'glassware' | 'subcategory'>): LabelFact {
  const glassware = tidy(drink.glassware);
  if (!glassware) return { value: '', caption: 'glass' };
  const shape = resolveShape(drink);
  const first = glassware.split(AFTER_FIRST_VESSEL)[0]!.trim();
  if (NAMED_BY[shape].test(glassware.toLowerCase()) || !first) return GLASS_NAMES[shape];
  // resolveShape drew a later-named glass ("Highball or cordial glass" as a
  // Glencairn); the label names the first, by its shape's name when it has one.
  const firstShape = SHAPES.find((s) => NAMED_BY[s].test(first.toLowerCase()));
  if (firstShape) return GLASS_NAMES[firstShape];
  const stripped = first.replace(SERVE_WORDS, '').trim();
  const own = /^glass(?:es)?$/i.test(stripped) || !stripped ? first : stripped;
  const glass = /^(.*\S)\s+glass(?:es)?$/i.exec(own);
  if (glass) return { value: capitalise(glass[1]!), caption: 'glass' };
  if (SELF_NAMED_GLASS.test(own) || /^pony$/i.test(own)) return { value: capitalise(own), caption: 'glass' };
  return { value: capitalise(own), caption: 'vessel' };
}

/**
 * For meta lines: "Highball glass", "Copa glass"; a vessel or a glass that
 * names itself is said alone ("Julep cup", "Tiki mug", "Copita"), never
 * "Julep cup vessel". '' with no glassware.
 */
export function glassPhrase(drink: Pick<Drink, 'category' | 'glassware' | 'subcategory'>): string {
  const g = glassLabel(drink);
  if (!g.value) return '';
  return g.caption === 'glass' && !SELF_NAMED_GLASS.test(g.value) ? `${g.value} glass` : g.value;
}

/* -------------------------------------------------------------------- */
/* Origin, strength, method                                             */
/* -------------------------------------------------------------------- */

/**
 * "London, England" → { value: 'London', caption: 'England' };
 * "Dallas, Texas, USA" → { value: 'Dallas', caption: 'Texas, USA' };
 * "USA" → { value: 'USA', caption: 'origin' }.
 *
 * The place leads and everything after its first comma is the caption,
 * so nothing is dropped. A region list ("Burgundy, Champagne and Alsace,
 * France") is one value, split at its last comma instead: splitting it at
 * the first would caption Burgundy with "Champagne and Alsace, France".
 * Empty (a custom drink left blank) → value ''.
 */
export function originLabel(origin: string): LabelFact {
  const parts = tidy(origin)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { value: '', caption: 'origin' };
  if (parts.length === 1) return { value: parts[0]!, caption: 'origin' };
  const cut = parts.length >= 3 && parts[parts.length - 2]!.includes(' and ') ? parts.length - 1 : 1;
  return { value: parts.slice(0, cut).join(', '), caption: parts.slice(cut).join(', ') };
}

/*
 * A number range set with an en dash. 1,601 catalogue ABVs (and formatAbv)
 * write "40–46%", 219 write "14-16%"; side by side on one screen the two
 * read as two conventions. "2-inch piece" is not a range and is left alone.
 */
const enDashRanges = (s: string) => s.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');

/** { value: '28%', caption: 'abv' }; '' for an unknown custom ABV. */
export function abvLabel(drink: Pick<Drink, 'abv'>): LabelFact {
  return { value: enDashRanges(tidy(drink.abv)), caption: 'abv' };
}

/*
 * A spirit's serve, from its free-text temperature (100 phrasings in the
 * catalogue). Read in order:
 *  - negations go first, so "room temp, never chilled" is not Chilled, and
 *    "ice cold" is cold, not on ice;
 *  - only the first of "A or B" counts: it is the house serve, the rest are
 *    allowances ("room temp or one large cube" is Neat);
 *  - within that, the earliest bucket named wins, except that ice beats
 *    chilled ("cold, over ice", the custom form's "Over ice", is On ice).
 * 'Cool' (cellar and cool serves, 190 entries) is a fifth bucket beside
 * the spec's four, so the band does not drop to three columns for one
 * spirit in six. Nothing matched ("n/a — used in dashes", 4) → null.
 */
const ON_ICE = /\bice\b|\brocks\b|\bcubes?\b/;
const SERVE_BUCKETS: [RegExp, string][] = [
  [/\bneat\b|\broom\b/, 'Neat'],
  [/chill|cold|fridge|freez/, 'Chilled'],
  [/\bcool|\bcellar\b/, 'Cool'],
  [ON_ICE, 'On ice'],
  [/\bwarm|\bhot\b/, 'Warm'],
];

function serveBucket(temp: string): string | null {
  const t = tidy(temp)
    .toLowerCase()
    .replace(/\bice[- ]cold\b/g, 'cold')
    .replace(/\b(never|not)\s+(chilled|iced|frozen|cold)\b/g, '');
  const house = t.split(/\s+or\s+/)[0] ?? '';
  let best: string | null = null;
  let at = Infinity;
  for (const [re, label] of SERVE_BUCKETS) {
    const m = re.exec(house);
    if (m && m.index < at) {
      at = m.index;
      best = label;
    }
  }
  if (best === 'Chilled' && ON_ICE.test(house)) return 'On ice';
  return best;
}

/**
 * The label band's fourth column. Cocktails: the recipe's method
 * ("Stirred", caption 'method'). Spirits: the serve bucket ("Neat",
 * "Chilled", "Cool", "On ice", "Warm", caption 'serve'). Null when there is
 * nothing true to say, and the band shows three columns.
 */
export function methodLabel(drink: Pick<Drink, 'category' | 'recipe' | 'serve'>): LabelFact | null {
  if (drink.category === 'cocktail') {
    const method = tidy(drink.recipe?.method);
    return method ? { value: capitalise(method), caption: 'method' } : null;
  }
  const serve = serveBucket(drink.serve?.temp ?? '');
  return serve ? { value: serve, caption: 'serve' } : null;
}

/* -------------------------------------------------------------------- */
/* Amounts                                                              */
/* -------------------------------------------------------------------- */

const QTY = String.raw`\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?`;
/** A metric quantity at the start of a segment, and whatever follows it. */
const METRIC_LEAD = new RegExp(String.raw`^(~?\s*${QTY}\s*(?:ml|cl|dl|l|litres?|liters?|g|kg)\b\.?)\s*(.*)$`, 'i');
/** One measure, wholly: "~0.25 oz", "about 30 ml". */
const MEASURE = new RegExp(
  String.raw`^(?:~|about\s+|approx\.?\s+)?\s*${QTY}\s*(?:oz|ml|cl|dl|l|litres?|liters?|g|kg|tsp|tbsp|cups?|barspoons?|bar spoons?)\.?$`,
  'i',
);
const METRIC_UNIT = /\d\s*(?:ml|cl|dl|l|litres?|liters?|g|kg)\b/i;

/** "~0.25 oz / 8 ml" or "about 30 ml": an equivalent measure that names a metric quantity. */
function isMetricEquivalent(s: string): boolean {
  const segs = s.split(/\s+\/\s+/);
  return segs.every((seg) => MEASURE.test(seg.trim())) && METRIC_UNIT.test(s);
}

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/*
 * Splits on commas and " — " outside parentheses: "1 pinch (plus rim,
 * optional)" stays whole. A comma between digits is a decimal point
 * ("1,5 oz", as half the world types it), not a break.
 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const comma = c === ',' && !(isDigit(s[i - 1]) && isDigit(s[i + 1]));
      const sep = comma ? 1 : s.startsWith(' — ', i) ? 3 : 0;
      if (sep) {
        parts.push(s.slice(start, i));
        start = i + sep;
        i += sep - 1;
      }
    }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/*
 * Where a quantity ends and its circumstances begin: "1 tbsp | on a small
 * plate", "Enough cubes | to fill the glass", "5 | per orange". Never at
 * the start, so "To fill glass" and "For mixing" stay whole amounts.
 */
const PHRASE =
  /\s(?=(?:to (?:fill|top|taste|float|serve|rinse|coat|dust|garnish|grate)|on (?:a|the|top)|onto|per|for (?:the|a|garnish|rimming|chilling|mixing|shaking))\b)/i;

/**
 * An ingredient amount, apart, for the spec card's columns:
 *   "1.5 oz / 45 ml, to top"      → { amount: '1.5 oz', metric: '45 ml', note: 'to top' }
 *   "2 dashes"                    → { amount: '2 dashes' }
 *   "cubed, to fill"              → { amount: 'cubed', note: 'to fill' }
 *   "Splash (~0.25 oz / 8 ml)"    → { amount: 'Splash', metric: '~0.25 oz / 8 ml' }
 *   "0.5 oz / 15 ml (1:1)"        → { amount: '0.5 oz', metric: '15 ml', note: '1:1' }
 *   "1 oz / 30 ml per mug, optional 'mit Schuss'"
 *                                 → { amount: '1 oz', metric: '30 ml', note: "per mug, optional 'mit Schuss'" }
 *
 * The amount is the quantity a bartender reads first; the metric is its
 * equivalent (the last " / " segment when it is metric, or a trailing
 * parenthesis or comma part that is a measure naming one); the note is
 * everything else, in its original order, joined with ", ". Never drops
 * text: every word of the input is in exactly one of the three. Ranges
 * take the en dash ("2–3 dashes"), as on the ABV.
 */
export function splitAmount(amount: string | undefined): { amount: string; metric?: string; note?: string } {
  const text = enDashRanges(tidy(amount));
  if (!text) return { amount: '' };

  const [first = '', ...rest] = splitTopLevel(text);
  let head = first;
  let metric: string | undefined;
  const notes: string[] = [];

  // A trailing parenthesis is an equivalent measure or a note.
  const paren = /^(.*\S)\s*\(([^()]*)\)$/.exec(head);
  if (paren) {
    head = paren[1]!;
    const inner = paren[2]!.trim();
    if (inner && isMetricEquivalent(inner)) metric = inner;
    else if (inner) notes.push(inner);
  }

  // "1.5 oz / 45 ml": the last segment, when metric, is the metric line.
  const segs = head.split(/\s+\/\s+/);
  if (segs.length > 1) {
    const lead = METRIC_LEAD.exec(segs[segs.length - 1]!);
    if (lead) {
      if (metric) notes.unshift(metric);
      metric = lead[1]!.trim();
      if (lead[2]) notes.unshift(lead[2].trim());
      head = segs.slice(0, -1).join(' / ');
    }
  }

  // "1 tbsp on a small plate": the circumstances join the note, ahead of
  // anything that followed them in the original.
  const cut = head.search(PHRASE);
  if (cut > 0) {
    notes.unshift(head.slice(cut + 1).trim());
    head = head.slice(0, cut).trim();
  }

  for (const part of rest) {
    if (!metric && isMetricEquivalent(part)) metric = part;
    else notes.push(part);
  }

  if (!head && notes.length) head = notes.shift()!;
  const out: { amount: string; metric?: string; note?: string } = { amount: head };
  if (metric) out.metric = metric;
  if (notes.length) out.note = notes.join(', ');
  return out;
}

/* -------------------------------------------------------------------- */
/* Lines of prose                                                       */
/* -------------------------------------------------------------------- */

/*
 * The first year from 1500 to 2029 in the fun fact, with a decade's "s"
 * kept ("the 1970s" → "1970s"). 433 catalogue facts name one; checked
 * against every four-digit number in them, all are years.
 */
const YEAR = /\b(1[5-9]\d\d|20[0-2]\d)(s?)\b/;

/** "London, England · 1903": the origin and the first year in the fun fact; either alone if the other is missing. */
export function datelineOf(drink: Pick<Drink, 'origin' | 'funFact'>): string {
  const origin = tidy(drink.origin);
  const m = YEAR.exec(drink.funFact ?? '');
  const year = m ? `${m[1]}${m[2]}` : '';
  return [origin, year].filter(Boolean).join(' · ');
}

/**
 * "Menthol, bitter herbs, juniper, cola spice". Notes are lowercase in the
 * catalogue except proper names ("Earl Grey", "Davidson plum"), so only the
 * first letter of the line is raised and every note is otherwise as written.
 */
export function tastesOf(notes: readonly string[]): string {
  return capitalise(notes.map(tidy).filter(Boolean).join(', '));
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_MS = 86_400_000;

/** Local midnight, so "days ago" counts calendar days, not 24-hour spans. */
function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "14 September", with the year when it is not this year's. */
function dayMonth(d: Date, now: number, month: (m: number) => string): string {
  const base = `${d.getDate()} ${month(d.getMonth())}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * "In your Dex since 14 September" ("… 14 September 2025" from an earlier
 * year). An unreadable date says only "In your Dex", which is still true.
 */
export function dexSinceLabel(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'In your Dex';
  return `In your Dex since ${dayMonth(d, now, (m) => MONTHS[m]!)}`;
}

/**
 * When the latest catch was, for "Latest catch · Saturday": "Today",
 * "Yesterday", the weekday within the week, else "14 Sep" (with the year
 * from an earlier year). A weekday is never more than six days back, so
 * "Monday" cannot mean a week ago on a Monday. A date ahead of the clock
 * (the phone's time was changed) is given as a date. '' when unreadable.
 */
export function catchDay(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return WEEKDAYS[new Date(t).getDay()]!;
  return dayMonth(new Date(t), now, (m) => MONTHS[m]!.slice(0, 3));
}
