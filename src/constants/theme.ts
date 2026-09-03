import type { TextStyle } from 'react-native';

import type { Drink, DrinkCategory, Rarity } from '@/types';

/* ==================================================================== */
/* Palette — "Sipply"                                                   */
/*                                                                      */
/* Adopted 2026-08-25 from the Sipply brand handoff. It replaces         */
/* "Porcelain Speakeasy" (white page + wine + verdigris patina + gold).  */
/* The handoff ships eight values and names each one's job:              */
/*                                                                      */
/*   WINE     #5B0F1A — primary brand, buttons, active states           */
/*   MERLOT   #7E2330 — gradients, secondary accents                    */
/*   BONE     #E9E5DF — light ground, and text ON wine                  */
/*   TAUPE    #CBBBA5 — borders, muted accents, letterspaced labels     */
/*   ESPRESSO #2B2322 — dark ground, primary text                       */
/*   OFF-WHITE#FFFDF9 — the app screen background                       */
/*   HAIRLINE #EFE9E0 — dividers                                        */
/*   MUTED    #9A8F85 — secondary text                                  */
/*                                                                      */
/* WHAT CHANGED IN THE APP, AND WHY                                     */
/*                                                                      */
/* 1. Green is gone. The old ONE PATINA RULE reserved a single verdigris */
/*    for everything affirmative (collected / saved / success /          */
/*    uncommon). Sipply has no green, and its own answer is that the     */
/*    active state IS the brand: the handoff's "Saved to My Drinks"      */
/*    button is wine. So affirmative = wine, and `patina*` is gone       */
/*    rather than renamed — a token named after verdigris pointing at    */
/*    oxblood is the kind of trap this repo keeps removing.              */
/*                                                                      */
/* 2. Gold became GILT. Legendary still needs a metal that nothing else  */
/*    may use, but #C9A227 was mixed for a cool white page and glares    */
/*    on off-white. Gilt is the same idea re-cut warm for this ground.   */
/*                                                                      */
/* 3. Two inks, not one. The handoff sets 12–13px secondary text in      */
/*    MUTED #9A8F85, which is 3.11:1 on off-white — fine for WCAG large  */
/*    text, short of the 4.5:1 this app has always held itself to for    */
/*    body copy. Rather than lower the bar or abandon the colour, the    */
/*    warm gray is split in two: `textFaint` IS #9A8F85 and keeps the    */
/*    3:1 large/secondary job it already had here, and `textMuted` is    */
/*    the same hue walked down to 6.03:1 for anything body-sized.        */
/*                                                                      */
/* Every pair below is verified by scripts/check-contrast.mjs —          */
/* ≥4.5:1 for body, ≥3:1 for large text and UI glyphs.                   */
/* ==================================================================== */

export const colors = {
  /*
   * Surfaces. The page is warm cream and cards are WHITE — the card is
   * separated from the page by tint first, and only then by hairline and
   * shadow.
   *
   * This inverts what was here before, where bg, surface and card were all
   * the same #FFFDF9 and a card existed only as a shadow. That reads as
   * linen-on-linen: correct for a floating tab bar over a page, and wrong
   * for a screen that is mostly cards, because nothing has an edge until
   * it casts one. The mockup's whole structure is white panels on cream,
   * so the tint has to do the work and the shadow becomes the accent
   * rather than the entire signal.
   *
   * Cream stays warm rather than gray: it sits beside wine and gilt on
   * every screen, and a neutral page turns both of those cold.
   */
  bg: '#F7F2EA',
  bgSunk: '#E9E5DF',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#E9E5DF',
  cardBorder: '#EFE9E0',
  /** the "lit" border — legendary/selected only, so it stays metal */
  cardBorderLit: '#B08A3E',
  borderStrong: '#CBBBA5',

  /* Ink — espresso, never neutral gray */
  text: '#2B2322',
  /** Body-sized secondary. The handoff's #9A8F85 walked to 6.03:1. */
  textMuted: '#6A6058',
  /** The handoff's MUTED, unchanged. Large/secondary only — 3.11:1. */
  textFaint: '#9A8F85',
  textOnWine: '#E9E5DF',
  textOnEspresso: '#E9E5DF',
  textOnGilt: '#2B2322',

  /* Wine — the brand's structural colour, and every affirmative state */
  wine: '#5B0F1A',
  wineDeep: '#3E0A12',
  /** MERLOT. Gradients and secondary accents. */
  merlot: '#7E2330',
  /** Derived: a merlot tint for strokes and edges. Never type. */
  wineSoft: '#A85A63',
  wineWash: '#F5E7E7',

  /*
   * Taupe. Borders, muted accents, and the letterspaced sub-labels the
   * brand sheet sets under every wordmark. 1.85:1 on off-white, so it is
   * DECORATIVE on light grounds and type only on wine (7.32:1) or
   * espresso (8.19:1). `taupeInk` is the readable cut for light grounds.
   */
  taupe: '#CBBBA5',
  taupeInk: '#736247',
  taupeWash: '#F2ECE1',

  /*
   * Gilt — LEGENDARY ONLY, inherited from the old gold rule.
   *   gilt      DECORATIVE. Card edges, rules, the legendary shimmer.
   *             Must never be the sole carrier of meaning.
   *   giltGlyph Icons and strokes that convey meaning. 3.5:1 on off-white.
   *   giltInk   Text. 5.9:1 on off-white.
   */
  gilt: '#B08A3E',
  giltGlyph: '#A8823A',
  giltInk: '#7D5F1C',
  giltDim: '#8E6F2C',
  giltWash: '#F6EEDC',
  amber: '#D9A25C',

  /* Semantic — success is wine (see 1. in the header) */
  danger: '#A83224',
  dangerWash: '#F8E6E2',
  success: '#5B0F1A',
  successWash: '#F5E7E7',

  /* Scrims — the handoff's own value for the detail back button */
  overlay: 'rgba(43, 35, 34, 0.52)',
  scrim: 'rgba(43, 35, 34, 0.45)',

  /* Locked-artwork blackout */
  lockInk: '#2B2322',
  lockInkSoft: '#4A3B38',

  /*
   * The empty slot — a collected entry's absence.
   *
   * The Dex grid is a display case, so an uncollected entry is a RECESS,
   * not a paler card. On the old white page these were a cool gray; here
   * they are bone walked one and two steps darker, so a collected card in
   * page off-white lifts out of a linen tray. Deliberately not
   * espresso-dark: with 460 entries and a handful collected, a wall of
   * near-black would swamp the light identity.
   */
  slot: '#E3DDD3',
  slotDeep: '#D8D1C5',
  slotBorder: '#CBBBA5',

  /* Emboss — the hairline pair that fakes a stamped plate. */
  embossLight: 'rgba(255, 253, 249, 0.72)',
  embossShadow: 'rgba(43, 35, 34, 0.14)',
} as const;

/* ==================================================================== */
/* Typography — Sipply identity                                         */
/* Playfair Display (display) / Inter (everything else)                  */
/*                                                                      */
/* The handoff names exactly two families and three Inter weights, so    */
/* the third family is gone: Space Mono no longer sets the dex numbers.  */
/* They are now Inter Medium tracked out and uppercased — the handoff's  */
/* own "letterspaced label" style, which is what a catalogue number      */
/* wanted to be all along. The `tabular` style carries the numeric        */
/* the mono was really there for.                                       */
/*                                                                      */
/* Both families are LATIN-ONLY SUBSETS, self-hosted from assets/fonts/. */
/* See assets/fonts/README.md before changing them, and do not reach for */
/* @expo-google-fonts.                                                   */
/* ==================================================================== */

export const fonts = {
  display: 'PlayfairDisplayLatin_600SemiBold',
  displayBold: 'PlayfairDisplayLatin_700Bold',
  displayBlack: 'PlayfairDisplayLatin_700Bold',
  body: 'InterLatin_400Regular',
  bodyMedium: 'InterLatin_500Medium',
  bodySemiBold: 'InterLatin_600SemiBold',
  bodyBold: 'InterLatin_600SemiBold',
  /** Letterspaced sub-labels, and the dex numbers. */
  label: 'InterLatin_500Medium',
  /** Figures. Inter, with the `tabular` style for column alignment. */
  numeral: 'InterLatin_500Medium',
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

/**
 * The brand's letterspaced label, at the two tracking values the sheet
 * uses: 0.3em for UI sub-labels, 0.5em for the tagline lockup. RN takes
 * letterSpacing in points, so these are pre-multiplied — keep them in
 * step with `fontSize` if you change one.
 *
 * Always uppercase, always `fonts.label`, taupe on dark grounds and
 * `taupeInk` on light ones.
 */
export const label = {
  ui: { fontSize: 11, lineHeight: 14, letterSpacing: 3.3 },
  tagline: { fontSize: 12, lineHeight: 16, letterSpacing: 6 },
} as const;

/**
 * Figures that must line up in a column — stats, dex numbers, counts.
 *
 * Inter's tabular set is what replaced Space Mono here: the mono was only
 * ever in the app to stop digits from shifting width, and a `fontVariant`
 * does that without a third family.
 */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

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

/**
 * Radii are the handoff's, verbatim: grid thumbs 10, cards and feed
 * photos 16, brand panels 24, the floating tab bar 32, buttons a pill at
 * 26 on a 52pt height.
 */
export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 24,
  tab: 32,
  pill: 999,
} as const;

/**
 * Espresso-tinted shadows. These were cool green (#334B48) for the white
 * page; on a warm off-white a cool shadow reads as a smudge. `raised` and
 * `brand` are the two shadows the handoff specifies outright — the tab
 * bar's `0 12px 30px rgba(43,35,34,.14)` and the app icon's
 * `0 18px 40px rgba(91,15,26,.3)`.
 */
export const elevation = {
  card: {
    shadowColor: '#2B2322',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#2B2322',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 8,
  },
  sheet: {
    shadowColor: '#2B2322',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  /** Wine objects that sit above the page: the app icon, the FAB. */
  brand: {
    shadowColor: '#5B0F1A',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 14,
  },
} as const;

/* ==================================================================== */
/* Glass                                                                */
/*                                                                      */
/* iOS 26 renders these surfaces with real Liquid Glass (expo-glass-     */
/* effect). Everywhere else `components/glass.tsx` fakes it with the     */
/* values below: a translucent off-white fill, a specular sheen down the */
/* top third, and a hairline rim that is brighter on top than on the     */
/* bottom — which is what actually sells "lit from above".               */
/*                                                                      */
/* `fill` is the handoff's tab-bar material exactly: off-white at 92%    */
/* over a 10px blur.                                                     */
/*                                                                      */
/* Deliberately NOT hex: alpha is the whole point of the material.       */
/* ==================================================================== */

export const glass = {
  /** Body fill of a frosted surface on the off-white page. */
  fill: 'rgba(255, 253, 249, 0.92)',
  /** Heavier fill for surfaces that sit over photography or artwork. */
  fillStrong: 'rgba(255, 253, 249, 0.96)',
  /** Wine-tinted glass — the active/selected material. */
  fillWine: 'rgba(91, 15, 26, 0.12)',
  /** Bone-tinted glass — collection surfaces (progress, stats, collected). */
  fillBone: 'rgba(233, 229, 223, 0.86)',
  /** Top rim: the lit edge. */
  rimTop: 'rgba(255, 253, 249, 0.94)',
  /** Perimeter rim: everything that isn't the lit edge. */
  rim: 'rgba(43, 35, 34, 0.10)',
  /**
   * Contour for the NATIVE Liquid Glass branch, which draws no border of
   * its own and otherwise resolves to near-page and loses its silhouette.
   * Stronger than `rim` because it is the only edge that branch gets.
   */
  rimContour: 'rgba(43, 35, 34, 0.16)',
  /** Specular sheen stops, top → bottom of the highlight band. */
  sheenFrom: 'rgba(255, 253, 249, 0.62)',
  sheenTo: 'rgba(255, 253, 249, 0)',
  /** Tint fed to the native Liquid Glass view so it keeps our warmth. */
  nativeTint: 'rgba(255, 253, 249, 0.30)',
  /**
   * `strong` for the native branch. GlassView exposes only
   * glassEffectStyle and tintColor, so tint opacity is the only lever;
   * without this, `strong` reached nothing but the fallback and was
   * silently dropped on every iOS 26 device.
   */
  nativeTintStrong: 'rgba(255, 253, 249, 0.48)',
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
  /**
   * How a SELECTION answers — the tab pill and the filter chips.
   *
   * Faster than `spring`, which stays where it is because it drives eight
   * other things (sheets, press scale, the profile meter). Selection is the
   * one interaction that felt sluggish, so it gets its own value rather than
   * the whole app getting quicker.
   *
   * Speed, not character: natural frequency up, damping ratio held, so the
   * overshoot is identical and simply arrives sooner.
   *
   *   spring      wn = sqrt(220/0.9) = 15.6 rad/s   z = 18/(2*sqrt(198)) = 0.64
   *   selection   wn = sqrt(640/0.9) = 26.7 rad/s   z = 31/(2*sqrt(576)) = 0.65
   *
   * ~1.7x faster; settling ~0.40s -> ~0.23s. Confirmed on device.
   *
   * A token and not a local const because two unrelated components need the
   * same number: the tab bar at the bottom of the Dex and the filter chips at
   * the top of it. They are one tap apart, and a user who taps a filter and
   * then a tab must not see the same gesture answered at two speeds.
   */
  selection: { damping: 31, stiffness: 640, mass: 0.9 },
  pressScale: 0.965,
} as const;

/* ==================================================================== */
/* Categories                                                           */
/*                                                                      */
/* Four hues, and the Sipply palette supplies two. So the categories     */
/* are read as the MATERIALS of the bar rather than as arbitrary tints:  */
/* merlot for what is mixed, plum for what is pressed, brass for what is */
/* brewed, espresso for what is distilled. At chip size that is red /    */
/* purple / amber / near-black, which survives both a 5pt dot and the    */
/* ~8% of men with a colour vision deficiency — and every chip carries   */
/* its label anyway, so the dot is reinforcement, never the message.     */
/* ==================================================================== */

export const CATEGORY_ORDER: DrinkCategory[] = ['cocktail', 'beer', 'wine', 'spirit'];

export const CATEGORY_META: Record<
  DrinkCategory,
  {
    label: string;
    plural: string;
    /** Text/stroke-safe on off-white. */
    color: string;
    /** Chip and badge fill. */
    wash: string;
    /**
     * Card field, top → bottom. A collectible card needs a ground that is
     * lighter at the top than the bottom, so the artwork appears lit from
     * above rather than pasted onto a flat swatch. `fieldTo` is the
     * existing `wash`, so a card and its category chip stay related.
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
    color: '#7E2330',
    wash: '#F5E6E5',
    fieldFrom: '#FFFAF8',
    fieldTo: '#F5E6E5',
    emoji: '🍸',
    blurb: 'Mixed & stirred',
  },
  beer: {
    label: 'Beer',
    plural: 'Beers',
    color: '#8A5F10',
    wash: '#F6EDDC',
    fieldFrom: '#FFFBF2',
    fieldTo: '#F6EDDC',
    emoji: '🍺',
    blurb: 'Brewed & poured',
  },
  wine: {
    label: 'Wine',
    plural: 'Wines',
    color: '#5E2545',
    wash: '#F1E6EC',
    fieldFrom: '#FEF9FB',
    fieldTo: '#F1E6EC',
    emoji: '🍷',
    blurb: 'Pressed & aged',
  },
  spirit: {
    label: 'Spirit',
    plural: 'Spirits',
    color: '#3A2E2C',
    wash: '#ECE7E3',
    fieldFrom: '#FBF9F7',
    fieldTo: '#ECE7E3',
    emoji: '🥃',
    blurb: 'Distilled & bold',
  },
};

/* ==================================================================== */
/* Rarity                                                               */
/* ==================================================================== */

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/**
 * Rarity is the FRAME, not a hue: hairline → taupe → wine → gilt, which
 * reads as paper, then linen, then the brand, then metal. Categories own
 * the hue axis (see above); rarity owns the material axis, so a rare
 * cocktail is never asking one colour to say two things.
 *
 * `edge` and `edgeWidth` are the CARD treatment, not the badge. A
 * collected entry is framed in its tier, and the frame gets both more
 * saturated and physically thicker as the tier climbs — so rarity is
 * legible in peripheral vision while scrolling a 460-card grid, at
 * thumbnail size, and without relying on colour alone.
 *
 * `color` stays the text/badge value and remains contrast-audited; `edge`
 * is decorative and is NEVER the sole carrier of meaning — the badge
 * label and the corner dot both still say the tier in words and shape.
 */
export const RARITY_META: Record<
  Rarity,
  {
    label: string;
    color: string;
    wash: string;
    weight: number;
    /** Card frame colour. Decorative. */
    edge: string;
    /** Card frame thickness in points. Climbs with the tier. */
    edgeWidth: number;
  }
> = {
  common: {
    label: 'Common',
    color: colors.textMuted,
    wash: colors.cardBorder,
    weight: 0,
    edge: colors.cardBorder,
    edgeWidth: 1,
  },
  uncommon: {
    label: 'Uncommon',
    color: colors.taupeInk,
    wash: colors.taupeWash,
    weight: 1,
    edge: colors.taupe,
    edgeWidth: 1.5,
  },
  rare: {
    label: 'Rare',
    color: colors.wine,
    wash: colors.wineWash,
    weight: 2,
    edge: colors.wineSoft,
    edgeWidth: 2,
  },
  legendary: {
    label: 'Legendary',
    color: colors.giltInk,
    wash: colors.giltWash,
    weight: 3,
    edge: colors.gilt,
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
 * separately, so avatar tints always belong to the same colour system.
 */
export const SIGNUP_ACCENTS: readonly string[] = [
  CATEGORY_META.cocktail.color,
  CATEGORY_META.beer.color,
  CATEGORY_META.wine.color,
  CATEGORY_META.spirit.color,
  colors.wine,
  colors.taupeInk,
];
