// Relative import, not the '@/' alias, so this module can be compiled and
// audited standalone by scripts/check-artwork.mjs.
import type { Drink, DrinkCategory } from '../../types';

/* ==================================================================== */
/* Glassware shape library                                              */
/*                                                                      */
/* 20 hand-drawn vessels on a 100×112 grid, centered on x=50. Every one  */
/* of the 460 drinks resolves to one of these via `resolveShape`, which  */
/* pattern-matches the dataset's 101 free-text glassware strings         */
/* (inconsistently cased: "rocks glass" and "Rocks glass" both occur).   */
/*                                                                      */
/* Each shape carries its own liquid path rather than deriving one, so   */
/* the fill follows the true interior curve of the vessel.               */
/* ==================================================================== */

export type GlassShape =
  | 'coupe'
  | 'martini'
  | 'margarita'
  | 'flute'
  | 'wineRed'
  | 'wineWhite'
  | 'port'
  | 'highball'
  | 'rocks'
  | 'shot'
  | 'pint'
  | 'pilsner'
  | 'weizen'
  | 'snifter'
  | 'glencairn'
  | 'tulip'
  | 'mug'
  | 'tiki'
  | 'hurricane'
  | 'sake'
  | 'julepCup';

export interface ShapeDef {
  /** Vessel outline — stroked, never filled. */
  vessel: string;
  /** Liquid body, drawn beneath the vessel stroke. */
  liquid: string;
  /** Stems, feet, handles, banding — stroked. */
  parts?: string[];
  /** Foam cap. Present only on vessels that are poured a head. */
  foam?: string;
  /** Where a garnish should sit, if the drink has one. */
  garnishAt?: { x: number; y: number };
}

export const SHAPES: Record<GlassShape, ShapeDef> = {
  coupe: {
    vessel: 'M22 34 Q22 62 50 62 Q78 62 78 34 Z',
    liquid: 'M26 38 Q26.5 58 50 58 Q73.5 58 74 38 Z',
    parts: ['M50 62 V96', 'M33 98.5 Q50 94 67 98.5 Q50 103 33 98.5 Z'],
    garnishAt: { x: 72, y: 34 },
  },
  martini: {
    vessel: 'M20 34 L50 68 L80 34 Z',
    liquid: 'M26.5 40 L50 65 L73.5 40 Z',
    parts: ['M50 68 V96', 'M33 98.5 Q50 94 67 98.5 Q50 103 33 98.5 Z'],
    garnishAt: { x: 74, y: 34 },
  },
  margarita: {
    vessel: 'M20 32 Q20 45 38 47 L42 57 Q42 61 50 61 Q58 61 58 57 L62 47 Q80 45 80 32 Z',
    liquid: 'M25 37 Q26 42 40 44 L44 55 Q44 58 50 58 Q56 58 56 55 L60 44 Q74 42 75 37 Z',
    parts: ['M50 61 V96', 'M33 98.5 Q50 94 67 98.5 Q50 103 33 98.5 Z'],
    garnishAt: { x: 74, y: 32 },
  },
  flute: {
    vessel: 'M40 24 L43 74 Q43.5 79 50 79 Q56.5 79 57 74 L60 24 Z',
    liquid: 'M41.8 34 L43 74 Q43.5 76.5 50 76.5 Q56.5 76.5 57 74 L58.2 34 Z',
    parts: ['M50 79 V98', 'M35 100 Q50 96 65 100 Q50 104 35 100 Z'],
    garnishAt: { x: 58, y: 26 },
  },
  wineRed: {
    vessel: 'M26 32 Q24 52 38 64 Q44 69 50 69 Q56 69 62 64 Q76 52 74 32 Z',
    liquid: 'M28.6 48 Q30.5 58 39 64 Q44.5 67 50 67 Q55.5 67 61 64 Q69.5 58 71.4 48 Z',
    parts: ['M50 69 V96', 'M32 98.5 Q50 93.5 68 98.5 Q50 103.5 32 98.5 Z'],
    garnishAt: { x: 70, y: 33 },
  },
  wineWhite: {
    vessel: 'M30 30 Q29 50 40 62 Q45 67 50 67 Q55 67 60 62 Q71 50 70 30 Z',
    liquid: 'M32.2 46 Q34 56 41 62 Q45.5 65.5 50 65.5 Q54.5 65.5 59 62 Q66 56 67.8 46 Z',
    parts: ['M50 67 V96', 'M33 98.5 Q50 94 67 98.5 Q50 103 33 98.5 Z'],
    garnishAt: { x: 67, y: 31 },
  },
  port: {
    vessel: 'M35 40 Q34 54 41 63 Q45 67 50 67 Q55 67 59 63 Q66 54 65 40 Z',
    liquid: 'M36.4 51 Q38 58 42.5 63 Q46 65.8 50 65.8 Q54 65.8 57.5 63 Q62 58 63.6 51 Z',
    parts: ['M50 67 V93', 'M36 95.5 Q50 91.5 64 95.5 Q50 99.5 36 95.5 Z'],
    garnishAt: { x: 63, y: 41 },
  },
  highball: {
    vessel: 'M35 24 L36.5 95 Q36.5 98.5 40 98.5 H60 Q63.5 98.5 63.5 95 L65 24 Z',
    liquid: 'M36.3 38 L36.5 95 Q36.5 96.5 40 96.5 H60 Q63.5 96.5 63.5 95 L63.7 38 Z',
    garnishAt: { x: 63, y: 26 },
  },
  rocks: {
    vessel: 'M30 46 L31 93 Q31 96.5 34.5 96.5 H65.5 Q69 96.5 69 93 L70 46 Z',
    liquid: 'M31.4 64 L31 93 Q31 94.5 34.5 94.5 H65.5 Q69 94.5 69 93 L68.6 64 Z',
    // The heavy base a rocks glass is known for.
    parts: ['M32.4 88 H67.6'],
    garnishAt: { x: 67, y: 48 },
  },
  shot: {
    vessel: 'M38 58 L39.5 95 Q39.5 98 42.5 98 H57.5 Q60.5 98 60.5 95 L62 58 Z',
    liquid: 'M38.9 68 L39.5 95 Q39.5 96 42.5 96 H57.5 Q60.5 96 60.5 95 L61.1 68 Z',
    parts: ['M40.4 91 H59.6'],
  },
  pint: {
    vessel: 'M31 24 L36 95 Q36.2 98.5 39.5 98.5 H60.5 Q63.8 98.5 64 95 L69 24 Z',
    liquid: 'M33.1 54 L36 95 Q36.2 96.5 39.5 96.5 H60.5 Q63.8 96.5 64 95 L66.9 54 Z',
    foam: 'M32.1 40 Q36 34 42 37.5 Q46 32.5 51 36 Q57 32 62 37 Q67 35 67.9 40 L67.2 50 Q60 46 50 49 Q40 46 32.8 50 Z',
    garnishAt: { x: 68, y: 27 },
  },
  pilsner: {
    vessel: 'M36 22 L41 93 Q41.2 96.5 44 96.5 H56 Q58.8 96.5 59 93 L64 22 Z',
    liquid: 'M38.2 53 L41 93 Q41.2 94.5 44 94.5 H56 Q58.8 94.5 59 93 L61.8 53 Z',
    foam: 'M36.8 38 Q40 32.5 45 36 Q49 31.5 53 35.5 Q58 32 62 37 L63.2 38 L62.6 48 Q56 44.5 50 47.5 Q44 44.5 37.4 48 Z',
  },
  weizen: {
    vessel:
      'M34 22 Q36 38 41 52 Q45.5 66 44.5 78 Q43.5 92 47 96.5 H53 Q56.5 92 55.5 78 Q54.5 66 59 52 Q64 38 66 22 Z',
    liquid:
      'M37.4 46 Q39 49.5 41 52 Q45.5 66 44.5 78 Q43.5 92 47 94.5 H53 Q56.5 92 55.5 78 Q54.5 66 59 52 Q61 49.5 62.6 46 Z',
    foam: 'M35 30 Q38 23.5 43.5 28 Q48 22.5 52 27 Q57 23 61 28.5 L65 30 L63.6 42 Q56 37.5 50 41 Q44 37.5 36.4 42 Z',
  },
  snifter: {
    vessel: 'M38 40 Q28 46 29 60 Q31 75 50 77 Q69 75 71 60 Q72 46 62 40 Z',
    liquid: 'M30.2 62 Q32.5 73.5 50 75.4 Q67.5 73.5 69.8 62 Q60 66.5 50 66.5 Q40 66.5 30.2 62 Z',
    parts: ['M50 77 V89', 'M36 91.5 Q50 87.5 64 91.5 Q50 95.5 36 91.5 Z'],
    garnishAt: { x: 68, y: 44 },
  },
  glencairn: {
    vessel: 'M38 32 Q35.5 44 38 55 Q41.5 69 50 71 Q58.5 69 62 55 Q64.5 44 62 32 Z',
    liquid: 'M38.9 57.5 Q42 68 50 69.8 Q58 68 61.1 57.5 Q55.5 61 50 61 Q44.5 61 38.9 57.5 Z',
    parts: ['M44 71 V82', 'M56 71 V82', 'M35 85 Q50 81 65 85 Q50 89 35 85 Z'],
  },
  tulip: {
    vessel: 'M34 28 Q30 42 34 54 Q38 67 50 69 Q62 67 66 54 Q70 42 66 28 Q60 33 50 33 Q40 33 34 28 Z',
    liquid: 'M34.9 50 Q38.5 65.5 50 67.4 Q61.5 65.5 65.1 50 Q58 54 50 54 Q42 54 34.9 50 Z',
    foam: 'M33.6 38 Q37 32.5 42 36 Q46 31.5 50 35 Q55 31.5 59 36 Q63.5 33 66.4 38 L65.4 48 Q58 44 50 46.5 Q42 44 34.6 48 Z',
    parts: ['M50 69 V88', 'M36 90.5 Q50 86.5 64 90.5 Q50 94.5 36 90.5 Z'],
  },
  mug: {
    vessel: 'M30 34 L31.5 93 Q31.5 96.5 35 96.5 H61 Q64.5 96.5 64.5 93 L66 34 Z',
    liquid: 'M32.3 56 L31.5 93 Q31.5 94.5 35 94.5 H61 Q64.5 94.5 64.5 93 L63.7 56 Z',
    foam: 'M31.4 42 Q35 36.5 40 40 Q44 35.5 48 39 Q53 35.5 57 40 Q62 37 65.6 42 L64.9 52 Q57 48 48 50.5 Q39 48 32.1 52 Z',
    parts: ['M66 46 Q80 49 80 62 Q80 75 65 78'],
  },
  tiki: {
    vessel: 'M33 30 L35 93 Q35 96.5 38.5 96.5 H61.5 Q65 96.5 65 93 L67 30 Z',
    liquid: 'M34.3 52 L35 93 Q35 94.5 38.5 94.5 H61.5 Q65 94.5 65 93 L65.7 52 Z',
    // Carved-face banding — what makes a tiki mug read as a tiki mug.
    parts: ['M34.6 44 H65.4', 'M41 58 Q44 55.5 47 58', 'M53 58 Q56 55.5 59 58', 'M42 72 Q50 78 58 72'],
    garnishAt: { x: 66, y: 33 },
  },
  hurricane: {
    vessel:
      'M34 26 Q40 40 38 52 Q36 64 42 74 L44 83 Q44 87 50 87 Q56 87 56 83 L58 74 Q64 64 62 52 Q60 40 66 26 Z',
    liquid: 'M36.6 44 Q37.4 48 37 52 Q35.6 64 42 74 L44 83 Q44 85 50 85 Q56 85 56 83 L58 74 Q64.4 64 63 52 Q62.6 48 63.4 44 Z',
    parts: ['M50 87 V95', 'M35 97.5 Q50 93.5 65 97.5 Q50 101.5 35 97.5 Z'],
    garnishAt: { x: 64, y: 29 },
  },
  sake: {
    vessel: 'M37 60 Q36.5 76 50 79 Q63.5 76 63 60 Z',
    liquid: 'M37.8 66 Q39 74.5 50 77 Q61 74.5 62.2 66 Q56 69 50 69 Q44 69 37.8 66 Z',
    parts: ['M42 82 H58'],
  },
  julepCup: {
    vessel: 'M32 40 L34 91 Q34 94.5 37.5 94.5 H62.5 Q66 94.5 66 91 L68 40 Z',
    liquid: 'M33.2 58 L34 91 Q34 92.5 37.5 92.5 H62.5 Q66 92.5 66 91 L66.8 58 Z',
    // Banding reads as hammered metal rather than glass.
    parts: ['M32.6 48 H67.4', 'M34.6 84 H65.4'],
    garnishAt: { x: 66, y: 43 },
  },
};

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/** Ordered — first match wins, so specific patterns precede general ones. */
const PATTERNS: [RegExp, GlassShape][] = [
  [/glencairn/, 'glencairn'],
  [/copita|cordial/, 'glencairn'],
  [/snifter|brandy balloon/, 'snifter'],
  [/weizen|weiss|hefe|vase/, 'weizen'],
  [/pilsner|pokal|stange/, 'pilsner'],
  [/nonic|pint|becher/, 'pint'],
  [/masskrug|krug|stein|stoneware|copper mug|moscow mule/, 'mug'],
  [/tiki/, 'tiki'],
  [/hurricane/, 'hurricane'],
  [/julep|pewter/, 'julepCup'],
  [/ochoko|sake|masu|guinomi/, 'sake'],
  [/margarita/, 'margarita'],
  [/martini|nick|cocktail glass/, 'martini'],
  [/coupe/, 'coupe'],
  [/flute|champagne/, 'flute'],
  [/tulip/, 'tulip'],
  [/port |sherry|madeira|dessert wine|small wine/, 'port'],
  [/bordeaux|burgundy|red wine|large wine|goblet|chalice/, 'wineRed'],
  [/white wine|wine/, 'wineWhite'],
  [/collins|highball|zombie|tall/, 'highball'],
  [/shot|caballito|shooter/, 'shot'],
  [/rocks|old fashioned|tumbler|veladora|lowball|cantarito|double old/, 'rocks'],
  [/mug|cup|bowl/, 'mug'],
];

const CATEGORY_FALLBACK: Record<DrinkCategory, GlassShape> = {
  cocktail: 'coupe',
  beer: 'pint',
  wine: 'wineRed',
  spirit: 'rocks',
};

/**
 * Pick the vessel for a drink.
 *
 * Falls back to the category's signature glass when the glassware string
 * is missing or unrecognized, so every drink always renders something.
 */
export function resolveShape(
  drink: Pick<Drink, 'category' | 'glassware' | 'subcategory'>,
): GlassShape {
  const g = (drink.glassware ?? '').toLowerCase();
  if (g) {
    for (const [re, shape] of PATTERNS) {
      if (re.test(g)) return shape;
    }
  }
  return CATEGORY_FALLBACK[drink.category];
}

/** Vessels that get a foam head — only when actually serving beer. */
export function takesFoam(shape: GlassShape, category: DrinkCategory): boolean {
  return (
    category === 'beer' &&
    (shape === 'pint' ||
      shape === 'pilsner' ||
      shape === 'weizen' ||
      shape === 'mug' ||
      shape === 'tulip')
  );
}
