import type { Drink, DrinkCategory, Rarity } from '@/types';

/* ==================================================================== */
/* Palette — "Porcelain Speakeasy"                                      */
/*                                                                      */
/* Three colors, each with a job:                                       */
/*   PORCELAIN #F1F0EA — the page. A cool, quiet off-white.             */
/*   WINE      #633444 — structure. Primary actions, ink, headers.      */
/*   PATINA    #1E6355 — the third color. Everything affirmative:       */
/*                       collected, saved, success, uncommon.           */
/* Gold is no longer an accent — it is demoted to LEGENDARY ONLY, so it */
/* means something when it finally shows up.                            */
/*                                                                      */
/* Changed 2026-08-13 from "Daylight Speakeasy" (cream #F7EEDF + wine + */
/* decorative gold). The cream read warm and the app read two-color;    */
/* porcelain cools the base so wine reads like a jewel, and the third   */
/* color gives the system a real third voice.                           */
/*                                                                      */
/* Changed 2026-08-16: the third color moved from sage #3E5F4C to       */
/* verdigris patina #1E6355. Sage sat at 145° with very little chroma — */
/* a muted gray-green that read as a neutral next to wine rather than   */
/* as a voice. Patina is 168° at roughly double the saturation, so it   */
/* holds its own against wine while keeping the same calm, affirmative  */
/* job. It is also the last open hue: wine/cocktail/wine-category own   */
/* the red-magenta arc, spirit owns purple, rare owns blue, gold and    */
/* beer own amber-brown.                                                */
/*                                                                      */
/* ONE PATINA RULE: patina is the only green-teal in the app. `success` */
/* and the `uncommon` rarity both point at this ramp on purpose — three */
/* separate greens (brand / success / uncommon) is indistinguishable at */
/* chip size.                                                           */
/*                                                                      */
/* Text/background pairs are verified by scripts/check-contrast.mjs —   */
/* ≥4.5:1 for body, ≥3:1 for large text and UI glyphs.                  */
/* ==================================================================== */

export const colors = {
  /*
   * Surfaces — smooth white, layered light.
   *
   * Changed 2026-08-16 from porcelain (#F1F0EA). Porcelain carried a
   * yellow-green cast that read as cream on an OLED phone; the page is now a
   * near-neutral white with only a 2-point blue drop, which is enough to keep
   * it from feeling clinical without tipping warm. Cards go PURE white so they
   * still lift off the page now that the page itself is nearly white — the
   * card/page step is carried by the border and shadow, not by tint.
   */
  bg: '#F8F8F6',
  bgSunk: '#EFEEEA',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F8F8F6',
  cardBorder: '#E4E3DD',
  /** the "lit" border — legendary/selected only, so it stays gold */
  cardBorderLit: '#C4A96E',
  borderStrong: '#CFCEC6',

  /* Ink — wine-black, never neutral gray */
  text: '#2B1820',
  textMuted: '#63434D',
  textFaint: '#836169',
  textOnWine: '#F4F3EE',
  textOnPatina: '#F4F3EE',
  textOnGold: '#2B1820',

  /* Wine — the brand's structural color */
  wine: '#633444',
  wineDeep: '#2B1820',
  wineSoft: '#8E5E70',
  wineWash: '#F2E7EA',

  /*
   * Patina — the third color. Carries every affirmative state: an entry
   * you own, a drink you saved, a success toast, the uncommon tier.
   * Text-safe at 6.3:1 on porcelain, so unlike gold it needs no
   * decorative/glyph/ink split.
   */
  patina: '#1E6355',
  patinaDeep: '#123E35',
  patinaSoft: '#5E9084',
  /** patina for type on DARK fields (the intro's wine-black) — 7.9:1 there */
  patinaLit: '#7FBFAE',
  patinaWash: '#E1EDE9',

  /*
   * Gold — LEGENDARY ONLY as of 2026-08-13. Not a general accent.
   *   gold      DECORATIVE. Rings, dividers, legendary shimmer.
   *             Must never be the sole carrier of meaning.
   *   goldGlyph Icons and strokes that convey meaning. 3.2:1 on porcelain.
   *   goldInk   Text. 5.3:1 on porcelain.
   */
  gold: '#C9A227',
  goldGlyph: '#A07C1A',
  goldInk: '#7D5A15',
  goldDim: '#A88326',
  goldWash: '#F6EED6',
  amber: '#FFAD5F',

  /* Semantic — success is patina (see ONE PATINA RULE above) */
  danger: '#A83224',
  dangerWash: '#F8E6E2',
  success: '#1E6355',
  successWash: '#E1EDE9',

  /* Scrims — strong enough to isolate foreground (40–60%) */
  overlay: 'rgba(31, 17, 22, 0.52)',
  scrim: 'rgba(31, 17, 22, 0.44)',

  /* Locked-artwork blackout */
  lockInk: '#241017',
  lockInkSoft: '#3A1F28',

  /*
   * The empty slot — a collected entry's absence.
   *
   * The Dex grid is a display case, so an uncollected entry is a RECESS, not
   * a paler card. These sit a real step below the page (bg #F1F0EA) so an
   * unlocked card lifting off them reads as a lit object in a velvet tray.
   * Deliberately not lockInk-dark: with 460 entries and a handful collected,
   * a wall of black would swamp the porcelain identity. This is the deepest
   * recess that still leaves the page feeling light.
   */
  slot: '#E5E4DF',
  slotDeep: '#DBDAD4',
  slotBorder: '#CDCCC5',

  /* Emboss — the hairline pair that fakes a stamped plate. */
  embossLight: 'rgba(255, 255, 255, 0.72)',
  embossShadow: 'rgba(43, 24, 32, 0.14)',
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

/**
 * Patina-tinted shadows. These were warm brown (#5A3A28) for the cream base;
 * on porcelain a warm shadow reads as a smudge, so they cool with the page.
 */
export const elevation = {
  card: {
    shadowColor: '#334B48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#334B48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  sheet: {
    shadowColor: '#22322F',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

/* ==================================================================== */
/* Glass                                                                */
/*                                                                      */
/* iOS 26 renders these surfaces with real Liquid Glass (expo-glass-    */
/* effect). Everywhere else `components/glass.tsx` fakes it with the    */
/* values below: a translucent porcelain fill, a specular sheen down    */
/* the top third, and a hairline rim that is brighter on top than on    */
/* the bottom — which is what actually sells "lit from above".          */
/*                                                                      */
/* Deliberately NOT hex: alpha is the whole point of the material.      */
/* ==================================================================== */

export const glass = {
  /** Body fill of a frosted surface on the white page. */
  fill: 'rgba(255, 255, 255, 0.82)',
  /** Heavier fill for surfaces that sit over photography or artwork. */
  fillStrong: 'rgba(255, 255, 255, 0.93)',
  /** Wine-tinted glass — the active/selected material. */
  fillWine: 'rgba(99, 52, 68, 0.14)',
  /** Patina-tinted glass — collection surfaces (progress, stats, collected). */
  fillPatina: 'rgba(30, 99, 85, 0.13)',
  /** Top rim: the lit edge. */
  rimTop: 'rgba(255, 255, 255, 0.92)',
  /** Perimeter rim: everything that isn't the lit edge. */
  rim: 'rgba(43, 24, 32, 0.10)',
  /**
   * Contour for the NATIVE Liquid Glass branch, which draws no border of its
   * own. On the old porcelain page the material had enough tint difference to
   * find its own edge; against the white page it resolves to near-white and
   * the surface loses its silhouette entirely. Stronger than `rim` because it
   * is the only edge that branch gets.
   */
  rimContour: 'rgba(43, 24, 32, 0.16)',
  /** Specular sheen stops, top → bottom of the highlight band. */
  sheenFrom: 'rgba(255, 255, 255, 0.62)',
  sheenTo: 'rgba(255, 255, 255, 0)',
  /** Tint fed to the native Liquid Glass view so it keeps our warmth. */
  nativeTint: 'rgba(255, 255, 255, 0.30)',
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
    /**
     * Card field, top → bottom. A collectible card needs a ground that is
     * lighter at the top than the bottom, so the artwork appears lit from
     * above rather than pasted onto a flat swatch. `fieldTo` is the existing
     * `wash`, so a card and its category chip stay visibly related.
     */
    fieldFrom: string;
    fieldTo: string;
    emoji: string;
    blurb: string;
  }
> = {
  cocktail: {
    label: 'Cocktail',
    plural: 'Cocktails',
    color: '#A83A29',
    wash: '#FBE6E0',
    fieldFrom: '#FEF7F5',
    fieldTo: '#FBE6E0',
    emoji: '🍸',
    blurb: 'Mixed & stirred',
  },
  beer: {
    label: 'Beer',
    plural: 'Beers',
    color: '#8A5F10',
    wash: '#FAEFD2',
    fieldFrom: '#FEFAEF',
    fieldTo: '#FAEFD2',
    emoji: '🍺',
    blurb: 'Brewed & poured',
  },
  wine: {
    label: 'Wine',
    plural: 'Wines',
    color: '#7A3A52',
    wash: '#F6E4EA',
    fieldFrom: '#FDF6F8',
    fieldTo: '#F6E4EA',
    emoji: '🍷',
    blurb: 'Pressed & aged',
  },
  spirit: {
    label: 'Spirit',
    plural: 'Spirits',
    color: '#54438A',
    wash: '#EBE7F5',
    fieldFrom: '#F9F7FD',
    fieldTo: '#EBE7F5',
    emoji: '🥃',
    blurb: 'Distilled & bold',
  },
};

/* ==================================================================== */
/* Rarity                                                               */
/* ==================================================================== */

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/**
 * The tiers climb gray → sage → blue → gold. `uncommon` uses the brand sage
 * rather than its own green (ONE GREEN RULE, see the palette header).
 *
 * `edge` and `edgeWidth` are the CARD treatment, not the badge. A collected
 * entry is framed in its tier, and the frame gets both more saturated and
 * physically thicker as the tier climbs — so rarity is legible in peripheral
 * vision while scrolling a 460-card grid, at thumbnail size, and without
 * relying on color alone (which excludes the ~8% of men with a CVD).
 *
 * `color` stays the text/badge value and remains contrast-audited; `edge` is
 * decorative and is NEVER the sole carrier of meaning — the badge label and
 * the corner dot both still say the tier in words and shape.
 */
export const RARITY_META: Record<
  Rarity,
  {
    label: string;
    color: string;
    wash: string;
    weight: number;
    /** Card frame color. Decorative. */
    edge: string;
    /** Card frame thickness in points. Climbs with the tier. */
    edgeWidth: number;
  }
> = {
  common: {
    label: 'Common',
    color: '#67655C',
    wash: '#E9E8E1',
    weight: 0,
    edge: colors.cardBorder,
    edgeWidth: 1,
  },
  uncommon: {
    label: 'Uncommon',
    color: colors.patina,
    wash: colors.patinaWash,
    weight: 1,
    edge: colors.patinaSoft,
    edgeWidth: 1.5,
  },
  rare: {
    label: 'Rare',
    color: '#345F96',
    wash: '#E3ECF7',
    weight: 2,
    edge: '#8FAAD0',
    edgeWidth: 2,
  },
  legendary: {
    label: 'Legendary',
    color: colors.goldInk,
    wash: colors.goldWash,
    weight: 3,
    edge: colors.gold,
    edgeWidth: 2.5,
  },
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
