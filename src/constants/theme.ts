import type { Drink, DrinkCategory, Rarity } from '@/types';

/* ==================================================================== */
/* Palette — "Daylight Speakeasy"                                       */
/*                                                                      */
/* Light, warm, built from the Clink brand anchors: cream #F7EEDF, wine */
/* #2B1820–#633444, gold. Cream is the page; near-white cards lift off  */
/* it. Wine is the ink, gold is the accent.                             */
/*                                                                      */
/* Text/background pairs are verified by scripts/check-contrast.mjs —   */
/* ≥4.5:1 for body, ≥3:1 for large text and UI glyphs.                  */
/* ==================================================================== */

export const colors = {
  /* Surfaces — warm, layered light */
  bg: '#F7EEDF',
  bgSunk: '#EFE3D0',
  surface: '#FFFCF6',
  card: '#FFFCF6',
  cardAlt: '#FBF4E9',
  cardBorder: '#E7D9C3',
  cardBorderLit: '#C9A972',
  borderStrong: '#D5C0A2',

  /* Ink — wine-black, never neutral gray */
  text: '#2B1820',
  textMuted: '#63434D',
  textFaint: '#836169',
  textOnWine: '#F9F1E4',
  textOnGold: '#2B1820',

  /* Wine — the brand's structural color */
  wine: '#633444',
  wineDeep: '#2B1820',
  wineSoft: '#8E5E70',
  wineWash: '#F4E6E9',

  /*
   * Gold — three values, because bright gold on cream is only 2.1:1.
   *   gold      DECORATIVE ONLY. Fills, rings, dividers, legendary shimmer.
   *             Must never be the sole carrier of meaning.
   *   goldGlyph Icons and strokes that convey meaning. 3.38:1 on cream.
   *   goldInk   Text. 5.46:1 on cream.
   */
  gold: '#C9A227',
  goldGlyph: '#A07C1A',
  goldInk: '#7D5A15',
  goldDim: '#A88326',
  goldWash: '#FAEFD2',
  amber: '#FFAD5F',

  /* Semantic */
  danger: '#A83224',
  dangerWash: '#FBE7E3',
  success: '#356B4D',
  successWash: '#E4F1E9',

  /* Scrims — strong enough to isolate foreground (40–60%) */
  overlay: 'rgba(31, 17, 22, 0.52)',
  scrim: 'rgba(31, 17, 22, 0.44)',

  /* Locked-artwork blackout */
  lockInk: '#241017',
  lockInkSoft: '#3A1F28',
} as const;

/* ==================================================================== */
/* Typography — Clink identity                                          */
/* Gowun Batang (display) / Hanken Grotesk (body) / Space Mono (numerals)*/
/* ==================================================================== */

export const fonts = {
  display: 'GowunBatang_700Bold',
  displayBold: 'GowunBatang_700Bold',
  displayBlack: 'GowunBatang_700Bold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_400Regular',
  bodySemiBold: 'HankenGrotesk_700Bold',
  bodyBold: 'HankenGrotesk_700Bold',
  mono: 'SpaceMono_400Regular',
} as const;

/** Type scale. Body is 16 so iOS never auto-zooms inputs. */
export const type = {
  micro: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  caption: { fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
  body: { fontSize: 16, lineHeight: 24 },
  bodyLg: { fontSize: 18, lineHeight: 27 },
  title: { fontSize: 22, lineHeight: 28 },
  headline: { fontSize: 28, lineHeight: 34 },
  display: { fontSize: 36, lineHeight: 42 },
} as const;

/* ==================================================================== */
/* Spacing, radius, elevation, motion                                   */
/* ==================================================================== */

/** 4pt rhythm. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Warm-tinted shadows — neutral black reads as dirt on cream. */
export const elevation = {
  card: {
    shadowColor: '#5A3A28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#5A3A28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  sheet: {
    shadowColor: '#3A2418',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

/** Micro-interactions 150–300ms; springs over cubic curves. */
export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  /** Exit ~65% of enter. */
  exit: 140,
  /** Per-item list stagger. */
  stagger: 36,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  pressScale: 0.965,
} as const;

/* ==================================================================== */
/* Categories                                                           */
/* ==================================================================== */

export const CATEGORY_ORDER: DrinkCategory[] = ['cocktail', 'beer', 'wine', 'spirit'];

export const CATEGORY_META: Record<
  DrinkCategory,
  {
    label: string;
    plural: string;
    /** Text/stroke-safe on cream. */
    color: string;
    /** Chip and badge fill. */
    wash: string;
    emoji: string;
    blurb: string;
  }
> = {
  cocktail: {
    label: 'Cocktail',
    plural: 'Cocktails',
    color: '#A83A29',
    wash: '#FBE6E0',
    emoji: '🍸',
    blurb: 'Mixed & stirred',
  },
  beer: {
    label: 'Beer',
    plural: 'Beers',
    color: '#8A5F10',
    wash: '#FAEFD2',
    emoji: '🍺',
    blurb: 'Brewed & poured',
  },
  wine: {
    label: 'Wine',
    plural: 'Wines',
    color: '#7A3A52',
    wash: '#F6E4EA',
    emoji: '🍷',
    blurb: 'Pressed & aged',
  },
  spirit: {
    label: 'Spirit',
    plural: 'Spirits',
    color: '#54438A',
    wash: '#EBE7F5',
    emoji: '🥃',
    blurb: 'Distilled & bold',
  },
};

/* ==================================================================== */
/* Rarity                                                               */
/* ==================================================================== */

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export const RARITY_META: Record<
  Rarity,
  { label: string; color: string; wash: string; weight: number }
> = {
  common: { label: 'Common', color: '#6E635C', wash: '#F0EAE1', weight: 0 },
  uncommon: { label: 'Uncommon', color: '#356B4D', wash: '#E4F1E9', weight: 1 },
  rare: { label: 'Rare', color: '#345F96', wash: '#E3ECF7', weight: 2 },
  legendary: { label: 'Legendary', color: colors.goldInk, wash: colors.goldWash, weight: 3 },
};

/* ==================================================================== */
/* Legacy helper                                                        */
/* ==================================================================== */

/**
 * Emoji glyph fallback, superseded by the vector artwork in
 * `@/components/artwork`.
 *
 * @deprecated Use `<DrinkArt drink={…} />`.
 */
export function drinkGlyph(drink: Pick<Drink, 'category' | 'glassware' | 'subcategory'>): string {
  const g = (drink.glassware ?? '').toLowerCase();
  const s = drink.subcategory.toLowerCase();
  if (g.includes('flute') || g.includes('champagne')) return '🥂';
  if (g.includes('coupe') || g.includes('martini') || g.includes('nick')) return '🍸';
  if (g.includes('tiki') || g.includes('hurricane') || s.includes('tiki')) return '🍹';
  if (g.includes('sake') || s.includes('sake')) return '🍶';
  if (g.includes('shot')) return '🥃';
  switch (drink.category) {
    case 'cocktail':
      return '🍸';
    case 'beer':
      return '🍺';
    case 'wine':
      return '🍷';
    case 'spirit':
      return '🥃';
  }
}

/**
 * Accents assigned to new accounts at signup.
 *
 * Drawn from the category and rarity palettes rather than authored
 * separately, so avatar tints always belong to the same color system.
 */
export const SIGNUP_ACCENTS: readonly string[] = [
  CATEGORY_META.cocktail.color,
  CATEGORY_META.beer.color,
  CATEGORY_META.wine.color,
  CATEGORY_META.spirit.color,
  RARITY_META.uncommon.color,
  RARITY_META.rare.color,
];
