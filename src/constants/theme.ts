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
/*   OFF-WHITE#FFFDF9 — the app screen background (see 4. below)        */
/*   HAIRLINE #EFE9E0 — dividers                                        */
/*   MUTED    #9A8F85 — secondary text (see 3. and 4. below)            */
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
/*    MUTED #9A8F85, well short of the 4.5:1 this app has always held    */
/*    itself to for body copy. Rather than lower the bar or abandon the  */
/*    colour, the warm gray is split in two: `textMuted` is the same hue */
/*    walked down to 5.50:1 on the page for anything body-sized, and     */
/*    `textFaint` keeps the 3:1 job — large type and glyphs, never small */
/*    text.                                                              */
/*                                                                      */
/* 4. The page went cream, and MUTED had to follow. The mockup rebuild   */
/*    moved the page from OFF-WHITE to cream #F7F2EA (see Surfaces), and */
/*    #9A8F85 on cream is 2.84:1 — under even the 3:1 its job needs, and */
/*    2.52:1 in a sunk well. So `textFaint` is no longer the handoff's   */
/*    hex: it is the same hue walked to #8A7F74, which clears 3:1 on     */
/*    every ground it lands on — 3.51 page, 3.12 sunk well, 3.91 white — */
/*    and still sits a visible step above textMuted. OFF-WHITE survives  */
/*    as the glass fill, the sheen and the emboss highlight.             */
/*                                                                      */
/* scripts/check-contrast.mjs reads this file directly — there is no     */
/* hand-kept copy of the palette to drift — and fails on any pair under  */
/* 4.5:1 for body text or under 3:1 for large text and UI glyphs. A      */
/* mirror that still held OFF-WHITE is how the 2.84:1 above passed as    */
/* 3.11.                                                                 */
/* ==================================================================== */

export const colors = {
  /*
   * Surfaces. The page is warm cream and cards are WHITE — the card is
   * separated from the page by tint first, and then by a hairline. Cards
   * cast no shadow (see Card in components/ui.tsx).
   *
   * This inverts what was here before, where bg, surface and card were all
   * the same #FFFDF9 and a card existed only as a shadow. That reads as
   * linen-on-linen: correct for a floating tab bar over a page, and wrong
   * for a screen that is mostly cards, because nothing has an edge until
   * it casts one. The mockup's whole structure is white panels on cream,
   * so the tint does the work and shadows are kept for what genuinely
   * floats.
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
  /**
   * Body-sized secondary: the handoff's MUTED hue walked down. 5.50:1 on
   * the page, 4.88:1 in a sunk well, 6.13:1 on white.
   */
  textMuted: '#6A6058',
  /**
   * Large type (≥18pt, or ≥14pt bold) and non-text glyphs ONLY — never
   * small text, never a placeholder. The handoff's MUTED #9A8F85 walked to
   * hold 3:1 on the cream page (see 4. in the header): 3.51:1 on the page,
   * 3.12:1 in a sunk well, 3.82:1 on glass, 3.91:1 on white. Not on the
   * Dex slot recess, where it drops to 2.90:1.
   */
  textFaint: '#8A7F74',
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
   * brand sheet sets under every wordmark. 1.68:1 on the page, so it is
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
   *   giltGlyph Icons and strokes that convey meaning. 3.18:1 on the page.
   *   giltInk   Text. 5.34:1 on the page.
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
   * they are bone walked one and two steps darker, so a collected card
   * lifts out of a linen tray. Deliberately not espresso-dark: with 460
   * entries and a handful collected, a wall of near-black would swamp the
   * light identity.
   */
  slot: '#E3DDD3',
  slotDeep: '#D8D1C5',
  slotBorder: '#CBBBA5',

  /* Emboss — the hairline pair that fakes a stamped plate. */
  embossLight: 'rgba(255, 253, 249, 0.72)',
  embossShadow: 'rgba(43, 35, 34, 0.14)',

  /*
   * Facebook's blue and the white it carries: the "Continue with Facebook"
   * button and the Facebook mark, and nothing else. A third party's colour
   * in this palette is a quotation. It appears where the control stands
   * for that company's account, and never as an accent of ours.
   *
   * #0866FF is the blue of Facebook's 2023 identity (Meta's brand
   * resources), not the #1877F2 of the 2019 mark that SDK samples still
   * carry. The difference is not only currency: white on #1877F2 is
   * 4.23:1, under the 4.5:1 a 16pt semibold button label needs, and white
   * on #0866FF is 4.82:1. The current brand is also the one that passes,
   * so neither the brand nor the contrast rule had to bend.
   */
  facebook: '#0866FF',
  onFacebook: '#FFFFFF',

  /*
   * The intro film's paper: frame 0 of assets/video/intro.mp4, sampled
   * across the top edge in BT.709. The paper darkens a step toward the
   * foot of the frame, so this is its lightest honest value, not an
   * average. It is for VideoIntro's ground (its styles.fill), so the
   * moment before the first decoded frame is already the film's paper
   * rather than a flash of cream page between the splash and the film.
   *
   * Carries no text: the status bar is hidden and the skip control is
   * invisible while the film plays, so check-contrast has no pair for it.
   * Re-sample it whenever the clip changes.
   */
  filmPaper: '#D6C4B1',
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

/**
 * Type scale. Body is 16 so iOS never auto-zooms inputs.
 *
 * `tag` and `bodySm` were added because the app kept reaching for them
 * without a name: 11pt with a hair of tracking on every badge and chip,
 * written out by hand across the app, and 14pt prose spelled
 * `caption.fontSize + 1` on the feed and the profile. A size used that
 * often is part of the scale whether or not it is written down here, and
 * one that is not written down drifts — the chips had already split into
 * 9, 10 and 11.
 */
export const type = {
  /**
   * Badges, chips and pills: the rarity and category badges, the tab bar
   * label. The floor of the scale — 11pt is the smallest size iOS treats
   * as legible, so nothing in the app goes below it.
   */
  tag: { fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },
  micro: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  caption: { fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
  /**
   * Prose that sits under something louder and is still read as prose, not
   * glanced at as a label: a post's caption, a name in a post header, a
   * bio. Caption is for labels and metadata, and at 13pt a paragraph of
   * it reads as fine print.
   */
  bodySm: { fontSize: 14, lineHeight: 20 },
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

/**
 * A catalogue number — "#0042" — wherever a drink is shown by name.
 *
 * One style, because the number is how the Dex is indexed and it should
 * look like the same stamp on the feed, the drink page, the celebration
 * and the stats. It had become five: two families, three sizes and three
 * inks for the same four digits.
 *
 * The brand's letterspaced label, tracked less than `label.ui` because it
 * is figures rather than words, which read as a code at half the tracking.
 * Tabular so a column of them lines up.
 *
 * taupeInk: 5.89:1 on a white card, 5.28:1 on the page, 4.80:1 or better
 * on the category washes. NOT on the empty-slot recess, where it is
 * 4.36:1 — a number on an uncollected Dex card overrides `color` with
 * textMuted, as the entry name there does.
 */
export const dexNumber: TextStyle = {
  fontFamily: fonts.label,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 1.5,
  color: colors.taupeInk,
  ...tabular,
};

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
 * page; on a warm cream page a cool shadow reads as a smudge. `raisedBox`
 * and `brand` are the two shadows the handoff specifies outright — the tab
 * bar's `0 12px 30px rgba(43,35,34,.14)` and the app icon's
 * `0 18px 40px rgba(91,15,26,.3)`.
 *
 * There is no card shadow. Panels and buttons separate from the page by
 * tint and hairline (see Card in components/ui.tsx); a shadow is for
 * something that genuinely floats over the page.
 */
export const elevation = {
  /**
   * The tab bar's lift, and that of every glass pane not marked `flat`
   * (GlassSurface applies it).
   *
   * Written as a CSS box-shadow, not the legacy shadowColor/Offset/Opacity/
   * Radius props it used to be as `raised`. Those draw on the view's own
   * layer, and a glass pane clips its children with `overflow: 'hidden'`,
   * so on iOS the clip took the shadow with it and the handoff's lift never
   * rendered. The legacy form had no other caller, so it is gone rather
   * than left as a second spelling that fails silently on a clipping view.
   *
   * A non-empty `boxShadow` makes React Native split a clipping view in
   * two: the clip moves onto an inner container and the shadow is drawn
   * outside it. The shadow is cast from an explicit rounded-rect path
   * rather than traced from the view's pixels, and masked out under the
   * view itself, so it does not darken translucent glass from behind.
   */
  raisedBox: { boxShadow: '0px 12px 30px rgba(43, 35, 34, 0.14)' },
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
  /** Body fill of a frosted surface on the cream page. */
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
   * How a SELECTION answers — the tab page transition and the filter chips,
   * and the thumb of SegmentedControl (components/ui.tsx). The tab scene
   * shift in (tabs)/_layout.tsx runs it with overshootClamping, so a page
   * arrives at this speed without swinging past its edge.
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
   * A token and not a local const because unrelated components need the
   * same number: the tab bar at the bottom of the Dex and the filter chips at
   * the top of it, and the segmented controls on the profile and in My Bar.
   * They are one tap apart, and a user who taps a filter and then a tab must
   * not see the same gesture answered at two speeds.
   */
  selection: { damping: 31, stiffness: 640, mass: 0.9 },
  pressScale: 0.965,
} as const;

/* ==================================================================== */
/* Categories                                                           */
/*                                                                      */
/* Read as the MATERIALS of the bar rather than as arbitrary tints:      */
/* merlot for what is mixed, espresso for what is distilled. At chip     */
/* size that is red against near-black, which survives both a 5pt dot    */
/* and the ~8% of men with a colour vision deficiency — and every chip   */
/* carries its label anyway, so the dot is reinforcement, never the     */
/* message. Plum (pressed) and brass (brewed) left with the wine and     */
/* beer categories; they survive only as signup accents (see below).     */
/* ==================================================================== */

export const CATEGORY_ORDER: DrinkCategory[] = ['cocktail', 'spirit'];

export const CATEGORY_META: Record<
  DrinkCategory,
  {
    label: string;
    plural: string;
    /** Text/stroke-safe on the page. */
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
 * legible in peripheral vision while scrolling the Dex grid, at
 * thumbnail size, and without relying on colour alone.
 *
 * `color` stays the text/badge value and remains contrast-audited; `edge`
 * is decorative and is NEVER the sole carrier of meaning. The badge says
 * the tier in words, and the collected card's corner mark says it in
 * shape: a hollow ring for common, a filled taupeInk dot for uncommon, a
 * filled wine dot for rare, and the giltGlyph sparkle for legendary
 * (DexCard).
 *
 * `color` is a TEXT value, tuned for contrast against the page, and that
 * is what makes it wrong as a chart fill: common, uncommon and legendary
 * sit within 1.04:1 of each other in it (textMuted, taupeInk, giltInk), so
 * as adjacent arcs they read as one brown band. The rarity donut draws its
 * own chart colours instead (RarityDonut.tsx CHART: textMuted, taupe, wine,
 * giltGlyph), and its legend names every tier.
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
    case 'spirit':
      return '🥃';
  }
}

/*
 * The amber and the plum were CATEGORY_META.beer.color and .wine.color
 * until those categories were retired. They are kept rather than dropped:
 * accents are stored on the profile as hex, so removing them would not
 * have changed a single existing avatar — it would only have narrowed the
 * palette new accounts draw from, from six to four, for no reason other
 * than where the numbers used to live.
 *
 * Named once here so SIGNUP_ACCENTS and ACCENT_NAMES cannot drift apart,
 * and read by scripts/check-contrast.mjs, which audits both on the page.
 */
const ACCENT_AMBER = '#8A5F10';
const ACCENT_PLUM = '#5E2545';

/**
 * Accents assigned to new accounts at signup.
 *
 * Drawn from the category and rarity palettes rather than authored
 * separately, so avatar tints always belong to the same colour system.
 */
export const SIGNUP_ACCENTS: readonly string[] = [
  CATEGORY_META.cocktail.color,
  ACCENT_AMBER,
  ACCENT_PLUM,
  CATEGORY_META.spirit.color,
  colors.wine,
  colors.taupeInk,
];

/**
 * What VoiceOver calls each accent swatch, keyed by the stored hex.
 *
 * The edit-profile swatches used to read the hex — "Accent colour, number
 * 7 E 2 3 3 0" — and six of those cannot be told apart by ear. Lives here
 * beside SIGNUP_ACCENTS because this is the only file allowed to hold the
 * two accents that have no token of their own; a copy elsewhere had to key
 * them by their position in the list, which breaks silently on a reorder.
 * An accent missing from this map (a hex from an older build) should be
 * read as "Custom" by the caller.
 *
 * Null-prototype, like DRINKS_BY_ID: an accent is a string off a profile
 * row, and on a plain object `ACCENT_NAMES['constructor']` is a function,
 * which a `?? 'Custom'` fallback waves straight through.
 */
export const ACCENT_NAMES: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    [CATEGORY_META.cocktail.color]: 'Merlot',
    [ACCENT_AMBER]: 'Amber',
    [ACCENT_PLUM]: 'Plum',
    [CATEGORY_META.spirit.color]: 'Espresso',
    [colors.wine]: 'Wine',
    [colors.taupeInk]: 'Taupe',
  },
);
