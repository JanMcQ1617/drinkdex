import { StyleSheet, type TextStyle } from 'react-native';

import type { DrinkCategory } from '@/types';

/* ==================================================================== */
/* Palette — v4 "Daylight"                                              */
/*                                                                      */
/* Adopted 9 Oct 2026 (specs/v4-changes.md, from                        */
/* specs/v4-mockups/white/spec.md section 1). Jan: "remake the whole    */
/* colorscheme of the app to black and white … make everything look     */
/* sleek". Black ink on gallery white, and the drink photographs are    */
/* the colour in the app, with one accent beside them (v4.4, below).    */
/*                                                                      */
/* WHY NEUTRAL GREYS ONLY. Every value below is R = G = B, apart from   */
/* the accent family (Campari: accent, accentPressed, onAccent),        */
/* third-party quotations (Facebook, Google, the sign-in rows) and the  */
/* intro film's sampled paper. check-contrast asserts it, so any other  */
/* hue that sneaks into the palette fails the build. Wine, merlot,      */
/* bone, cream, brass, walnut, label stock, taupe, the lining and the   */
/* story pink all retired with v4 (they were v3 and v3.3 Brass).        */
/*                                                                      */
/* WHY THE OLD NAMES. A token keeps its name where its job is the same  */
/* (`bg` is still every screen's ground, `text` still the ink), so most */
/* screens recoloured without an edit. The role each name plays:        */
/*                                                                      */
/*   page       bg, surface    #FFFFFF   grounds, sheets, bars          */
/*   wash       bgSunk         #F5F5F5   fields, tiles, the wash key    */
/*   press      press          #EBEBEB   a held white control           */
/*   line       line           #E3E3E3   1pt rules under a bar          */
/*   hair       hair           #D6D6D6   row separators                 */
/*   rule       rule           #C4C4C4   sheet grabber, ruler baseline  */
/*   control    lineControl    #8A8A8A   control edges, resting glyphs  */
/*   muted      textMuted      #5C5C5C   quiet text                     */
/*   ink        text, lineInk  #0A0A0A   text, keys, active glyphs      */
/*   accent     accent         #D0102C   the six places (v4.4, below),  */
/*                                       and the v4.6 detail tier       */
/*                                                                      */
/* Daylight is light only (app.json keeps userInterfaceStyle light).    */
/* The roles are named so a dark twin is a second map of the same keys. */
/*                                                                      */
/* scripts/check-contrast.mjs reads this file directly: every pair it   */
/* asserts is measured against the values below, never a copy.          */
/* ==================================================================== */

export const colors = {
  /* Grounds. Two of them, page and wash; nothing else stands under a screen (check-design rule 10). */
  /** Every screen's ground, the bars, the tab bar. */
  bg: '#FFFFFF',
  /** Wells: search fields, unticked tiles, the wash key, a photo before it decodes, the no-photo face. */
  bgSunk: '#F5F5F5',
  /** A raised face (sheets, the profile's panels). The page's value in Daylight; its own key so a dark twin can lift it. */
  surface: '#FFFFFF',
  /** The pressed fill of a white or wash control. Never carries `lineControl` (2.90:1). */
  press: '#EBEBEB',

  /* Edges. Decorative unless noted: the label or the fill identifies a control, never these. */
  /** 1pt rules: under a scrolled bar, sheet heads, the tab strip's foot. 1.28:1 on page. */
  line: '#E3E3E3',
  /** Row separators at hairlineWidth, an unticked tile's edge. 1.45:1. */
  hair: '#D6D6D6',
  /** The sheet grabber, the ruler's baseline and minor ticks. 1.74:1. */
  rule: '#C4C4C4',
  /** Control edges (an empty plate, an unticked box), resting tab glyphs, the no-photo glass. UI: 3.45:1 page, 3.17:1 wash. */
  lineControl: '#8A8A8A',
  /** An outline key's edge while held, the focus ring. */
  lineInk: '#0A0A0A',

  /* Ink */
  /** All primary text, solid keys, ticked tiles, active glyphs, the active tab's line. 19.80:1 page, 18.16:1 wash. */
  text: '#0A0A0A',
  /** Secondary text: meta lines, counts beside titles, placeholders. 6.69:1 page, 6.13:1 wash. */
  textMuted: '#5C5C5C',
  /** Large type (18pt and up) and glyphs only, never small text: the control grey. 3.45:1 page. */
  textFaint: '#8A8A8A',
  /** A solid ink key while held. Carries onInk at 12.63:1. */
  inkPressed: '#333333',
  /** Text and glyphs on ink. 19.80:1. */
  onInk: '#FFFFFF',
  /** A count inside an ink key ("In your bar 12"). 7.85:1 on ink. */
  onInkMuted: '#A3A3A3',

  /*
   * The accent: Campari (v4.4, specs/v4.4-accent; white spec 1.3). Jan
   * picked it from four single hues: the red of the bitter in a Negroni,
   * bright enough to read as red on a 13pt figure and an 8pt dot, where
   * the old merlot leaned toward ink. Daylight stays black and white
   * everywhere else. The accent marks the two things the app is for,
   * posting a drink and catching one, the one dot that says something
   * new has come, and the name itself, in EXACTLY six places:
   *
   *   1  the + key in the tab bar           fill, onAccent glyph
   *   2  the post key: the drink page's     fill, onAccent label
   *      pinned key, the + window's Post,
   *      the post sheet's "Save & post"
   *   3  the caught Nº plate                fill, onAccent figures
   *   4  the caught figure, the number      text, Inter 600
   *      only: "14" in "14 / 2,089" and
   *      in "14 entries in your Dex"
   *   5  Home's Activity dot                the 8pt dot
   *   6  the logo: the wordmark (Home's     the paint, on the page
   *      bar, sign-in, the welcome, the
   *      password reset, the drawn intro)
   *      and the mark where the app draws
   *      it (the drawn intro, the
   *      onboarding guide)
   *
   * The sixth is Jan's (v4.5, 20 Oct 2026, specs/v4.5-logo): the "Marker
   * tag" logo is a red paint pen, and he asked for it in Campari, so the
   * app icon's red and the name on every screen are one red. It is drawn
   * only through brand/Wordmark and brand/Mark, red on white: white
   * script on red is Coca-Cola's ground, so the app never sets the name
   * white on an accent fill.
   *
   * THE DETAIL TIER (v4.6, Jan, 23 Oct 2026; specs/v4.6-details/
   * spec.md) is NOT a seventh place. Jan found the app "too bland" and
   * asked for "delicate details … simple yet complex", so the logo's
   * paint pen comes back at hairline weight (0.4 to 1.25pt, filled and
   * swelling, never a stroked line): a rule under Home's stories, a
   * 24pt rule closing each feed post, a rule under each Dex section
   * head, the swash under a tab root's title, the drink page's margin
   * and column rules and Profile's margin rule, and one drip off the
   * caught plate. They are ornament, not information: none adds a
   * word, a count or a state, none sits on a photo, a key, a chip, a
   * field, a story ring or the tab bar, and none turns an existing
   * state red, so they cannot blur what the six places say. Drawn only
   * by components/details/, in `accent` alone (never accentPressed),
   * and placed only from the files check-design lists (DETAIL_SITES).
   *
   * WHY ONLY THERE. A colour that turns up everywhere stops meaning
   * anything. Red never says delete or error here: destructive words stay
   * ink and underlined, there are no red badges, and every other count,
   * line and state stays ink or muted, the active tab's line included.
   * check-design (rule 17) keeps these tokens to the code that draws the
   * six and the detail tier's folder, and the raw hex to this file;
   * check-contrast fails any other
   * hue, and an accent that drifts off Campari's.
   *
   * ON INK it is a fill only: 3.58:1 against ink clears 3:1 for a key or
   * a plate, and words on ink stay onInk, never red (as text on ink it is
   * under 4.5:1, and check-contrast keeps it there). No on-ink twin.
   *
   * Not a profile's `accent`: that is the colour stored on an account,
   * drawn only as one of the four grey avatar tones (avatarTone, below),
   * and never this red.
   */
  /** The six places' fill, the caught figure as text, the logo's paint, and the detail tier's pen. 5.54:1 page, 5.08:1 wash, 4.64:1 press; 3.58:1 against ink. */
  accent: '#D0102C',
  /** The + or the post key while held. Carries onAccent at 7.66:1. */
  accentPressed: '#A80C23',
  /** The glyph, label or figures on an accent fill. 5.54:1 on accent. */
  onAccent: '#FFFFFF',

  /** The dim behind a sheet: composites to #A7A7A7 over white. Never under text that must be read. */
  scrim: 'rgba(10, 10, 10, 0.36)',
  /** A 1pt inset edge on every print, so a blown-out user photo still has an edge on white. */
  photoEdge: 'rgba(10, 10, 10, 0.07)',

  /* Avatar tones (avatarTone, below). t1 to t3 carry onInk initials, t4 carries text. */
  tone1: '#262626',
  tone2: '#3D3D3D',
  tone3: '#5C5C5C',
  tone4: '#E3E3E3',

  /*
   * Reels (flagged off; REELS_ENABLED). Video needs a dark ground, and that
   * ground is still black and white: ink, with onInk words.
   */
  reelGround: '#0A0A0A',
  /** Text and glyphs on reelGround and over video. 19.80:1. */
  reelInk: '#FFFFFF',
  /** Secondary text on the SOLID reel ground only. 7.85:1. */
  reelInkMuted: '#A3A3A3',
  /** The record core: a white dot in a white ring. */
  record: '#FFFFFF',
  reelControlFill: 'rgba(10, 10, 10, 0.55)',
  reelControlBorder: 'rgba(255, 255, 255, 0.28)',
  /** Markers and captions over video: reelInk on it is ~10:1 even over a white frame. */
  reelScrim: 'rgba(10, 10, 10, 0.78)',
  reelScrimMid: 'rgba(10, 10, 10, 0.62)',
  reelScrimClear: 'rgba(10, 10, 10, 0)',
  reelTrack: 'rgba(255, 255, 255, 0.24)',
  reelTextShadow: 'rgba(10, 10, 10, 0.6)',

  /*
   * Quotations: a company's own mark on its own sign-in row, never our
   * accent. Facebook's 2023 blue (white on it is 4.82:1), Google's four
   * mark colours, Apple's black, and Google's light-theme outline pair,
   * used on every outlined way in so the stack reads as one family.
   */
  facebook: '#0866FF',
  onFacebook: '#FFFFFF',
  googleBlue: '#4285F4',
  googleGreen: '#34A853',
  googleYellow: '#FBBC05',
  googleRed: '#EA4335',
  appleFill: '#000000',
  providerEdge: '#747775',
  providerInk: '#1F1F1F',

  /*
   * The intro film's ground: frame 0 of assets/video/intro.mp4, sampled
   * at its edges and corners (Y 235, U = V 128 in BT.709 limited range,
   * which is exact #FFFFFF; every one of its 300 frames has the same
   * ground). It sits under the video in VideoIntro, so the moment before
   * the first decoded frame, and the screen around the video where it
   * stops short, are already the film's ground. Since v4.5 ("the tag",
   * 20 Oct 2026) the film is drawn on the page's own white, so this equals
   * colors.bg; it stays its own key because it quotes the film, not the
   * page, and must follow the film if the film ever changes. Carries no
   * text. (It was #EBEBEB, the wax-seal film's grey paper.)
   */
  filmPaper: '#FFFFFF',
} as const;

/**
 * Everything drawn over a photograph or a video, and nothing else
 * (check-design rule 11: media.tsx may name no `colors.` key).
 *
 * WHY ONLY A PLATE. Daylight puts no words on a picture: a drink's name
 * hangs under its print as a wall label. What does sit on one (a gallery
 * count, the video glyph) is a solid ink plate with onInk on it, measured
 * against the plate (19.80:1) and never against the picture. Over a dark
 * photo the plate keeps a 1pt white ring, because ink on #3A3A3A is 1.74:1.
 */
export const onMedia = {
  /** Text and glyphs on a plate over a photo. */
  ink: colors.onInk,
  /** The plate itself: solid ink. */
  fill: colors.text,
  /** The plate's 1pt outer ring, where the photo under it is dark. */
  ring: colors.onInk,
  /** A print's 1pt inset edge. Decorative. */
  edge: colors.photoEdge,
} as const;

/* ==================================================================== */
/* Typography                                                           */
/* Playfair Display (drink names) / Inter (everything)                  */
/*                                                                      */
/* Both families are LATIN-ONLY SUBSETS, self-hosted from assets/fonts/. */
/* See assets/fonts/README.md before changing them.                     */
/* ==================================================================== */

export const fonts = {
  display: 'PlayfairDisplayLatin_600SemiBold',
  displayBold: 'PlayfairDisplayLatin_700Bold',
  body: 'InterLatin_400Regular',
  bodyMedium: 'InterLatin_500Medium',
  bodySemiBold: 'InterLatin_600SemiBold',
  bodyBold: 'InterLatin_600SemiBold',
  /** The Dex number. */
  label: 'InterLatin_500Medium',
  /** Figures. Inter, with the `tabular` style for column alignment. */
  numeral: 'InterLatin_500Medium',
} as const;

/*
 * The three sizes (specs/v4-mockups/layout/spec.md section 2). Jan: "I
 * want less stuff". Title 28/34, body 17/24 and small 13/18, plus
 * Playfair at the title and body sizes for drink names. Weight (400, 500,
 * 600) carries emphasis instead of a fourth size.
 *
 * One exception, agreed with Jan for v4.1 (specs/v4.1-changes.md 0.3):
 * `prompt`, Inter 500 22/28, the onboarding guide's question in its
 * bubble, which is the only place it is drawn.
 */
const TITLE = { fontSize: 28, lineHeight: 34, letterSpacing: -0.4 } as const;
const BODY = { fontSize: 17, lineHeight: 24, letterSpacing: -0.2 } as const;
const SMALL = { fontSize: 13, lineHeight: 18, letterSpacing: 0 } as const;

/**
 * Text roles. A role is a whole text style for one job; colour is left to
 * the caller. Several roles share a size on purpose: the name says what the
 * text is, the size comes from the three above.
 *
 * PLAYFAIR DISCIPLINE. The display face appears only in the drink-name
 * roles (drinkHero, nameLg, name, nameSm, nameInline), and check-design
 * rule 6 fails any other route to it. A drink name is drawn through
 * DrinkName (components/cabinet.tsx), which fits it to its column
 * instead of truncating it. The wordmark left Playfair in v4.5: it is the
 * tagged logo now, outlined paths drawn by brand/Wordmark, not type.
 */
export const textRole = {
  /* ---- Inter: the three sizes ---- */
  /** Tab-root titles ("Dex", "My Bar", "nico.pours"), set left. */
  title:        { fontFamily: fonts.bodySemiBold, ...TITLE },
  /** Rows, names, field text, captions, the payoff line. */
  body:         { fontFamily: fonts.body, ...BODY },
  /** Key labels and quiet emphasis. */
  bodyMedium:   { fontFamily: fonts.bodyMedium, ...BODY },
  /** Shelf heads, "You can make 31", a person's name. */
  bodyStrong:   { fontFamily: fonts.bodySemiBold, ...BODY },
  /** Story names, the quiet count beside a title, bios, meta lines. */
  small:        { fontFamily: fonts.body, ...SMALL },

  /* ---- Inter: named jobs, on the three sizes ---- */
  barTitle:     { fontFamily: fonts.bodySemiBold, ...BODY },  // a pushed screen's centred title, sheet titles
  emptyTitle:   { fontFamily: fonts.bodySemiBold, ...BODY },  // EmptyState
  sectionTitle: { fontFamily: fonts.bodySemiBold, ...BODY },
  groupTitle:   { fontFamily: fonts.bodySemiBold, ...SMALL },
  rowTitle:     { fontFamily: fonts.body, ...BODY },
  rowSubtitle:  { fontFamily: fonts.body, ...SMALL },
  button:       { fontFamily: fonts.bodyMedium, ...BODY },
  buttonSm:     { fontFamily: fonts.bodyMedium, ...BODY },
  fieldLabel:   { fontFamily: fonts.bodyMedium, ...SMALL },
  fieldValue:   { fontFamily: fonts.body, ...BODY },
  helper:       { fontFamily: fonts.body, ...SMALL },
  heroFigure:   { fontFamily: fonts.bodySemiBold, ...TITLE, fontVariant: ['tabular-nums'] },
  count:        { fontFamily: fonts.bodySemiBold, ...BODY, fontVariant: ['tabular-nums'] },
  prose:        { fontFamily: fonts.body, ...BODY },
  specAmount:   { fontFamily: fonts.bodySemiBold, ...BODY, fontVariant: ['tabular-nums'] },
  /** The drink page's Origin story: body, with room to read a paragraph. */
  story:        { fontFamily: fonts.body, fontSize: 17, lineHeight: 26, letterSpacing: -0.2 },
  /** A tag's word ("In your Dex"). */
  statusWord:   { fontFamily: fonts.bodyMedium, ...SMALL },
  /** The Dex number, "Nº 0127": four figures, so tracked like a code. Small size. */
  plate:        { fontFamily: fonts.label, fontSize: 13, lineHeight: 18, letterSpacing: 1.0, fontVariant: ['tabular-nums'] }, // tracking-ok: a code of figures, not words
  /** The onboarding guide's question in its bubble (v4.1, the one size outside the three; see above). */
  prompt:       { fontFamily: fonts.bodyMedium, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },

  /* ---- Playfair: drink names ONLY (check-design rule 6) ---- */
  drinkHero:    { fontFamily: fonts.displayBold, fontSize: 52, lineHeight: 56, letterSpacing: -0.3 }, // drink page
  /** A drink at title size: the feed's and post's wall label, the catch moment. */
  nameLg:       { fontFamily: fonts.displayBold, ...TITLE, letterSpacing: -0.2 },
  /** A drink at body size: grids, lists, picker rows. */
  name:         { fontFamily: fonts.displayBold, ...BODY, letterSpacing: 0 },
  /** A drink at small size: the second line of a Home post's header, where Instagram puts a place (home-ig 2.4). */
  nameSm:       { fontFamily: fonts.displayBold, ...SMALL, letterSpacing: 0 },
  /** A name inside an Inter sentence ("theo_stirs's Paper Plane"), a nested Text. */
  nameInline:   { fontFamily: fonts.displayBold },
} satisfies Record<string, TextStyle>;

/** Figures that must line up in a column: stats, dex numbers, counts. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** A catalogue number in running text ("Nº 0042"): the plate role in muted ink. */
export const dexNumber: TextStyle = { ...textRole.plate, color: colors.textMuted };

/* ==================================================================== */
/* Spacing, radius, elevation, motion                                   */
/* ==================================================================== */

/** 4pt rhythm (layout spec section 3: 4 · 8 · 12 · 16 · 24 · 32 · 48). */
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
 * Stroke widths. Focus and error rings sit on an absolute overlay, so a
 * field that takes focus never moves by a pixel.
 */
export const stroke = {
  /** Row separators. */
  hair: StyleSheet.hairlineWidth,
  /** Every edge and rule. */
  edge: 1,
  /** Focus and error rings, the unseen story ring. */
  ring: 2,
  /** The TabStrip underline, and the tab bar's line under the active tab (v4.2 decided 6). */
  indicator: 2,
} as const;

/**
 * Layout sizes, in points (layout spec section 3, at 440 x 956). Heights
 * are minimums; anything under `hit` reaches 44 with hitSlop.
 */
export const layout = {
  /** ONE side margin: every edge on every screen sits at x 24 (layout spec principle 4); Home's feed alone uses `feedGutter`. */
  gutter: 24,
  hit: 44,
  /** The top bar's row, under the status bar: 62 to 114. */
  topBar: 52,
  /** The docked tab bar's row, above the home indicator. */
  tabBar: 49,
  /** A block key ("Post", "Start with the basics"). */
  control: 52,
  /** A key inside a row (Follow, Add): hitSlop 4 → 44. */
  controlSm: 36,
  field: 56,
  fieldMultiline: 88,
  search: 44,
  chip: 32,
  tag: 22,
  segmented: 36,
  tabStrip: 44,
  row: 52,
  rowTall: 64,
  /** Between profile grid tiles. */
  gridGap: 8,
  /**
   * Home's post photo, full bleed: 1:1, as Instagram's feed (home-ig 6).
   * At 4:5 a post was 110pt taller and only one showed at rest.
   */
  feedPhotoAspect: 1,
  /**
   * Home's text column: 16 to 424 at 440 (home-ig 2), Instagram's inset.
   * Home only; every other screen keeps `gutter`.
   */
  feedGutter: 16,
  /** Between the Dex's two columns. */
  dexGap: 24,
  /** Between Dex rows. */
  dexLedge: 24,
  pinnedBar: 74,
  /** Air between groups: no rules, no cards (layout spec principle 3). */
  section: 32,
  group: 24,
  /**
   * Home's stories (home-ig 2.3): a 66pt ring box in a fixed 80pt slot, so
   * the sixth ring is cut by the screen's edge, as on Instagram. A 2pt ink
   * ring when unseen, a 1pt `rule` ring once seen, and a 3pt gap to the
   * 56pt disc (66 less the 2pt ring and the gap on each side).
   */
  story: { ring: 66, ringWidth: 2, seenWidth: 1, gap: 3, slot: 80 },
} as const;

/**
 * Radius, by role. Squared keys (Jan's house style): 4pt on keys, fields,
 * chips and tiles. Prints have square corners.
 *   none     prints and photos, grid tiles, rules
 *   badge    plates, tags, checkboxes (2)
 *   control  keys, fields, chips, the +, tiles, the toast (4)
 *   card     a panel (8)
 *   sheet    a sheet's top corners (12)
 *   round    ONLY avatars, story rings, dots ≤ 10pt (check-design rule 4)
 */
export const radius = {
  none: 0,
  badge: 2,
  control: 4,
  card: 8,
  sheet: 12,
  round: 999,
} as const;

/**
 * Shadows (check-design rule 12 keeps every one in here). Daylight has
 * exactly one, on the sheet, which never scrolls. The tab bar is an opaque
 * slab docked to the foot, and nothing in a scrolling cell casts one.
 */
export const elevation = {
  sheet: { boxShadow: '0px -8px 30px rgba(10, 10, 10, 0.12)' },
} as const;

/** Micro-interactions 150–300ms; springs over cubic curves. */
export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  exit: 140,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  /** The selection indicators (SegmentedControl's thumb, TabStrip's underline). */
  selection: { damping: 31, stiffness: 640, mass: 0.9 },
  /** Media tiles only (PressableScale). Controls answer with a fill. */
  pressScale: 0.97,
} as const;

/* ==================================================================== */
/* Categories                                                           */
/*                                                                      */
/* No hue: a category is said by its label. The fields stay so the       */
/* callers that tint by category recolour to ink and wash unedited.      */
/* ==================================================================== */

export const CATEGORY_ORDER: DrinkCategory[] = ['cocktail', 'spirit'];

export const CATEGORY_META: Record<
  DrinkCategory,
  {
    label: string;
    plural: string;
    /** Text-safe ink. */
    color: string;
    /** Chip and well fill. */
    wash: string;
    fieldFrom: string;
    fieldTo: string;
    emoji: string;
    blurb: string;
  }
> = {
  cocktail: {
    label: 'Cocktail',
    plural: 'Cocktails',
    color: '#0A0A0A',
    wash: '#F5F5F5',
    fieldFrom: '#FFFFFF',
    fieldTo: '#F5F5F5',
    emoji: '🍸',
    blurb: 'Mixed & stirred',
  },
  spirit: {
    label: 'Spirit',
    plural: 'Spirits',
    color: '#0A0A0A',
    wash: '#F5F5F5',
    fieldFrom: '#FFFFFF',
    fieldTo: '#F5F5F5',
    emoji: '🥃',
    blurb: 'Distilled & bold',
  },
};

/* ==================================================================== */
/* Avatar tones                                                         */
/* ==================================================================== */

/**
 * The grey a person's initials disc takes. WHY A MAP, NOT A MIGRATION:
 * accents are stored on the profile as hex, and every old wine-era accent
 * maps to one of the four tones here, so no row needs rewriting. An
 * unknown hex is tone2.
 */
const LEGACY_ACCENT_TONE: Record<string, keyof typeof AVATAR_TONES> = {
  '#7E2330': 'tone2', // Merlot
  '#5B0F1A': 'tone2', // Wine
  '#8A5F10': 'tone3', // Amber
  '#5E2545': 'tone1', // Plum
  '#3A2E2C': 'tone1', // Espresso
  '#736247': 'tone4', // Taupe
};

const AVATAR_TONES = {
  tone1: { fill: colors.tone1, ink: colors.onInk },
  tone2: { fill: colors.tone2, ink: colors.onInk },
  tone3: { fill: colors.tone3, ink: colors.onInk },
  tone4: { fill: colors.tone4, ink: colors.text },
} as const;

const TONE_BY_HEX: Record<string, keyof typeof AVATAR_TONES> = {
  [colors.tone1]: 'tone1',
  [colors.tone2]: 'tone2',
  [colors.tone3]: 'tone3',
  [colors.tone4]: 'tone4',
  ...LEGACY_ACCENT_TONE,
};

/** The initials disc's fill and ink for a stored accent. */
export function avatarTone(accent: string | null | undefined): { fill: string; ink: string } {
  const key = accent ? TONE_BY_HEX[accent.toUpperCase()] : undefined;
  return AVATAR_TONES[key ?? 'tone2'];
}

/** The tones offered to a new account, by their stored hex. */
export const SIGNUP_ACCENTS: readonly string[] = [colors.tone1, colors.tone2, colors.tone3, colors.tone4];

/**
 * What VoiceOver calls each accent, keyed by the stored hex, the old
 * wine-era hexes included. Null-prototype: an accent is a string off a
 * profile row, and `ACCENT_NAMES['constructor']` must not be a function.
 */
export const ACCENT_NAMES: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    [colors.tone1]: 'Graphite',
    [colors.tone2]: 'Charcoal',
    [colors.tone3]: 'Slate',
    [colors.tone4]: 'Mist',
    '#7E2330': 'Charcoal',
    '#5B0F1A': 'Charcoal',
    '#8A5F10': 'Slate',
    '#5E2545': 'Graphite',
    '#3A2E2C': 'Graphite',
    '#736247': 'Mist',
  },
);
