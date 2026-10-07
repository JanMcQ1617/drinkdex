import { StyleSheet, type TextStyle } from 'react-native';

import type { Drink, DrinkCategory } from '@/types';

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
/*   OFF-WHITE#FFFDF9 — the app screen background (see 3. below)        */
/*   HAIRLINE #EFE9E0 — dividers                                        */
/*   MUTED    #9A8F85 — secondary text (see 2. and 3. below)            */
/*                                                                      */
/* WHAT CHANGED IN THE APP, AND WHY                                     */
/*                                                                      */
/* 1. Green is gone. The old ONE PATINA RULE reserved a single verdigris */
/*    for everything affirmative (collected / saved / success). Sipply   */
/*    has no green, and its own answer is that the active state IS the   */
/*    brand: the handoff's "Saved to My Drinks" button is wine. So       */
/*    affirmative = wine, and `patina*` is gone rather than renamed — a  */
/*    token named after verdigris pointing at oxblood is the kind of     */
/*    trap this repo keeps removing.                                     */
/*                                                                      */
/* 2. Two inks, not one. The handoff sets 12–13px secondary text in      */
/*    MUTED #9A8F85, well short of the 4.5:1 this app has always held    */
/*    itself to for body copy. Rather than lower the bar or abandon the  */
/*    colour, the warm gray is split in two: `textMuted` is the same hue */
/*    walked down to 5.50:1 on the page for anything body-sized, and     */
/*    `textFaint` keeps the 3:1 job — large type and glyphs, never small */
/*    text.                                                              */
/*                                                                      */
/* 3. The page went cream, and MUTED had to follow. The mockup rebuild   */
/*    moved the page from OFF-WHITE to cream #F7F2EA (see Surfaces), and */
/*    #9A8F85 on cream is 2.84:1 — under even the 3:1 its job needs, and */
/*    2.52:1 in a sunk well. So `textFaint` is no longer the handoff's   */
/*    hex: it is the same hue walked to #8A7F74, which clears 3:1 on     */
/*    every ground it lands on — 3.51 page, 3.12 sunk well, 3.91 white — */
/*    and still sits a visible step above textMuted. OFF-WHITE survives  */
/*    as reelInk (type on the dark reels ground) and the emboss          */
/*    highlight.                                                         */
/*                                                                      */
/* scripts/check-contrast.mjs reads this file directly — there is no     */
/* hand-kept copy of the palette to drift — and fails on any pair under  */
/* 4.5:1 for body text or under 3:1 for large text and UI glyphs. A      */
/* mirror that still held OFF-WHITE is how the 2.84:1 above passed as    */
/* 3.11.                                                                 */
/*                                                                      */
/* v3 GROUNDS (specs/v3-cabinet.md, section 2). Sipply is a collector's  */
/* cabinet made of two materials, and every screen root stands on one of */
/* five grounds (check-design rule 10). PAPER (`bg`) is what you read    */
/* and write on: the feed, the Dex's front, profiles, sheets, settings.  */
/* MAT (`mat`) is bone card stock, the face of a drink you have caught:  */
/* a mounted Dex card, a thumbnail mount, the spec card.                 */
/* LINING (`lining`, the same value as wineDeep, named for its job) is   */
/* the inside of the cabinet, grained like baize: Home's head band and   */
/* its stories, the Dex tray, the sign-in backdrop. CELLAR               */
/* (`liningDeep`) is a recess pressed into the lining and the ground a   */
/* lit photograph settles into: empty slots, the drink page, the Latest  */
/* catch panel, and the edge colour of every tungsten-lit photo. The     */
/* REEL GROUND stays for video. Media is not a ground: anything drawn    */
/* over a photograph uses `onMedia`, below. You read on paper, you       */
/* collect in the lining, a lit drink sits in the cellar.               */
/* ==================================================================== */

export const colors = {
  /*
   * Surfaces. The page is warm cream and cards are WHITE, and every card
   * also draws a 1pt `line` edge: white on cream is 1.11:1, so the tint
   * alone is never the separator. Cards on paper cast no shadow (see Card
   * in components/ui.tsx); the few things that do are listed at
   * `elevation`.
   *
   * This inverts what was here before, where bg, surface and card were all
   * the same #FFFDF9 and a card existed only as a shadow. That reads as
   * linen-on-linen: correct for a floating tab bar over a page, and wrong
   * for a screen that is mostly cards, because nothing has an edge until
   * it casts one. The mockup's whole structure is white panels on cream,
   * so the tint does the work and shadows are kept for what genuinely
   * floats.
   *
   * Cream stays warm rather than gray: it sits beside wine on every
   * screen, and a neutral page turns it cold.
   */
  bg: '#F7F2EA',
  bgSunk: '#E9E5DF',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#E9E5DF',
  borderStrong: '#CBBBA5',

  /*
   * v2 EDGES. The old cardBorder hairline (#EFE9E0) measured 1.08:1 on the
   * page and 1.21:1 on white, which is invisible, so it is gone and these
   * three draw every edge.
   */
  /** 1pt edges: cards, list groups, chips, tags, search, the tab bar, rules
   *  under bars; hairline row separators. Decorative: 1.54:1 white, 1.38:1 page. */
  line: '#D9CFC1',
  /** 1pt edge of inputs, selects, checkboxes; outline buttons where a spec
   *  asks for a control edge. Same value as textFaint, separate intent.
   *  Non-text UI (WCAG 1.4.11): 3.91:1 on white, 3.51:1 on the page. */
  lineControl: '#8A7F74',
  /** Secondary-button outline, focus ring, active TabStrip underline. */
  lineInk: '#2B2322',

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
   * hold 3:1 on the cream page (see 3. in the header): 3.51:1 on the page,
   * 3.12:1 in a sunk well, 3.91:1 on white. Not on `slot` (the tonal
   * button's pressed fill), where it drops to 2.90:1, and never on lining:
   * that ground has its own inks (onLining*).
   */
  textFaint: '#8A7F74',
  textOnWine: '#E9E5DF',
  textOnEspresso: '#E9E5DF',

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

  /** A warm amber with no reader today. */
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
   * Bone walked a step darker than bgSunk. Until v3 this was the Dex's
   * light recess; the recess is now `liningDeep` pressed into the lining
   * (see v3 below). It stays as a fill: the pressed state of the tonal
   * Button (components/ui.tsx).
   */
  slot: '#E3DDD3',
  /** @deprecated v2's light recess floor. Unused once the v3 DexCard lands; deleted in stage 3. */
  slotDeep: '#D8D1C5',
  /** @deprecated v2's light recess edge. Unused once the v3 DexCard lands; deleted in stage 3. */
  slotBorder: '#CBBBA5',

  /* Emboss — the hairline pair that fakes a stamped plate. */
  embossLight: 'rgba(255, 253, 249, 0.72)',
  embossShadow: 'rgba(43, 35, 34, 0.14)',

  /*
   * Reels. The dark surface for video: a moving picture needs a black-ish
   * ground, and a cream frame around one reads as a web embed. Warm, not
   * neutral, so it still belongs beside wine. They are for the Reels tab,
   * the recorder, the reel viewer and the tab bar, and the scrim tokens
   * serve every photograph, through `onMedia`.
   */
  reelGround: '#0E0B0B',
  /** Text and glyphs on reelGround and over video. 19.3:1 on the ground. */
  reelInk: '#FFFDF9',
  /** Secondary text on the SOLID ground only (13.1:1) — never over video. */
  reelInkMuted: '#D8D2CB',
  /** The shutter core and the recording dot. 4.4:1 on reelGround. */
  record: '#D8402F',
  /** Control chips over video/camera: fill and 1pt border. */
  reelControlFill: 'rgba(14, 11, 11, 0.55)',
  reelControlBorder: 'rgba(255, 253, 249, 0.28)',
  /**
   * Bottom scrim stops under captions; top scrim uses reelScrimMid → clear.
   * reelScrim is also the fill of every marker over a photograph (gallery
   * count, stack, duration), with reelInk on it: ≈10:1 even over a white
   * frame, where the paper `scrim` with bone type failed 4.5:1.
   */
  reelScrim: 'rgba(14, 11, 11, 0.78)',
  reelScrimMid: 'rgba(14, 11, 11, 0.62)',
  reelScrimClear: 'rgba(14, 11, 11, 0)',
  /** Progress tracks over video. */
  reelTrack: 'rgba(255, 253, 249, 0.24)',
  /** textShadowColor for every word over video. */
  reelTextShadow: 'rgba(14, 11, 11, 0.6)',
  /** The tab bar's fill while Reels is focused. Espresso; 1.28:1 above reelGround, so its edge does the separating. */
  reelBar: '#2B2322',
  /** Resting tab icon + label on reelBar: 5.86:1 (7.47:1 on reelGround). Clearly dimmer than reelInk, which marks the active tab. */
  reelInkDim: '#A99E94',

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
   * Google's four mark colours, for the G on Continue with Google and
   * nothing else. A quotation, like Facebook's blue above: the mark is
   * drawn as Google publishes it because the button stands for a Google
   * account. No text sits on them, so check-contrast has no pair.
   */
  googleBlue: '#4285F4',
  googleGreen: '#34A853',
  googleYellow: '#FBBC05',
  googleRed: '#EA4335',

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

  /*
   * v3 Cabinet: the materials (see "v3 grounds" in the header). Ratios are
   * WCAG 2.x, measured in specs/v3-cabinet.md section 4 and asserted by
   * check-contrast; "worst grain" is the brightest tile pixel over the
   * ground at grain.lining.
   */
  /** Bone card stock: a collected drink's face, a thumbnail mount, the spec card. */
  mat: '#FBF8F2',
  /** The cabinet interior. The same value as wineDeep, named for its job. */
  lining: '#3E0A12',
  /** The cellar: a recess in the lining, the drink page's ground, and the colour every lit photo settles to at its edges. */
  liningDeep: '#2F070D',

  /* Ink on lining and cellar. Wine is 1.22:1 on lining: never type or a button there. */
  /** Titles and body on lining. 13.32:1 (11.31 worst grain); 14.47:1 in the cellar. */
  onLining: '#E9E5DF',
  /** Secondary text on lining, body-safe. 6.79:1 (5.77 worst grain). */
  onLiningMuted: '#B8A09B',
  /** Glyphs and >= 18pt only (3:1): the lock, a chevron. Never small text. 4.93:1, 4.19 worst grain. */
  onLiningFaint: '#A7837F',
  /** "Remove from collection" on the cellar ground. 8.34:1 there. */
  dangerOnLining: '#EE9A8F',

  /* Vector faces: the lit back-bar window of a drink with no photograph. Carry no text. */
  /** Centre of a cocktail's lit window (= merlot). */
  faceCocktail: '#7E2330',
  /** Centre of a spirit's lit window. */
  faceSpirit: '#5A463F',
  /** Highlight end of the ghost bake. Read by scripts/build-drink-photos.mjs, so keep it a plain hex. */
  ghostHi: '#9C7F7A',

  /* Edges and fills on lining. Translucent, so check-contrast composites them over the ground. */
  /** Decorative rules on lining: panel edges, the label band, shelf progress tracks. */
  liningLine: 'rgba(233, 229, 223, 0.16)',
  /** The 1pt lip where a lining band meets paper below it. */
  liningLip: 'rgba(233, 229, 223, 0.14)',
  /** An outline button's edge on lining: 3.27:1 composited (WCAG 1.4.11). */
  liningControl: 'rgba(233, 229, 223, 0.42)',
  /** An outline button on lining, held. */
  liningPressed: 'rgba(233, 229, 223, 0.08)',
  /** The tab bar's log action: its 1pt bone edge on the espresso bar, 3.02:1 composited (WCAG 1.4.11). */
  logActionEdge: 'rgba(233, 229, 223, 0.38)',
  /** A mount's 1pt edge where it sits in the lining. */
  matEdge: 'rgba(14, 11, 11, 0.35)',
  /** The hairline inside a mount's window. */
  windowEdge: 'rgba(43, 35, 34, 0.16)',
  /** An empty slot's 1pt edge, the same on every slot. */
  slotEdge: 'rgba(233, 229, 223, 0.10)',
  /** The hairline inside an empty slot's window. */
  slotWindowEdge: 'rgba(233, 229, 223, 0.07)',
  /** A number plate's edge on lining or in a slot. */
  plateEdgeLining: 'rgba(233, 229, 223, 0.24)',
  /** A loose print's edge (a friend's pour shown in the lining). */
  printEdge: 'rgba(233, 229, 223, 0.22)',
  /** The shelf ledge between Dex rows. */
  ledge: 'rgba(14, 11, 11, 0.30)',
  /** Top stop of the 12pt shade under a lining band; clear at the bottom. */
  shade: 'rgba(14, 11, 11, 0.22)',
  /** The bar counter across the foot of a vector window. */
  counterBand: 'rgba(14, 11, 11, 0.22)',
  /** The 1pt highlight along the top of that counter. */
  counterLine: 'rgba(255, 253, 249, 0.14)',
  /** Locked vector glass, upper edge. 2.14:1 over the cellar (design floor 2.0). */
  debossLight: 'rgba(233, 229, 223, 0.28)',
  /** Locked vector glass, lower edge. */
  debossShadow: 'rgba(0, 0, 0, 0.55)',
  /** Foot of the nameplate scrim: 13.43:1 for onMedia.ink even over a white frame. */
  scrimDeep: 'rgba(14, 11, 11, 0.86)',

  /* ---- v3.1 (specs/v3.1-changes.md section 2.1) ---- */
  /**
   * An unseen story's 2.5pt ring on lining: lit wine, because wine itself
   * is 1.22:1 there. 4.37:1 on lining, 3.71:1 on the worst grain pixel
   * (a UI cue, 3:1).
   */
  storyRing: '#BC6B75',
  /** A seen story's 1pt ring. Decorative: the unseen ring's colour AND weight carry the state. */
  storyRingSeen: 'rgba(233, 229, 223, 0.30)',
  /**
   * Home's floating bar over the feed: the lining at the top of the bar ...
   * onLining here is 11.53:1 even over a white photo.
   */
  homeBarTop: 'rgba(62, 10, 18, 0.94)',
  /** ... and at its foot. onLining here is 5.60:1 even over a white photo, 5.91:1 over paper. */
  homeBarFoot: 'rgba(62, 10, 18, 0.72)',
} as const;

/**
 * Everything drawn over a photograph or a video, and nothing else.
 * check-contrast composites each text colour over the worst case, a blown-out
 * white frame under the scrim stop it sits on, and fails if any token outside
 * this object is ever added to it (specs/v3-cabinet.md section 4.4).
 * components/media.tsx may reference no `colors.` key at all, only these
 * (check-design rule 11).
 *
 * Over a photo, text only ever sits on scrim alpha >= 0.62 (`scrimMid`), and
 * the only ink is `ink`. The lining inks fail there (onLining is 4.41:1 over
 * 0.62-over-white, the rest far lower), which is why a tinted word never
 * sits over a photo.
 */
export const onMedia = {
  /** All text over media. 5.45:1 on scrimMid over white, 13.43:1 on scrimDeep. */
  ink: colors.reelInk,
  /** textShadowColor for that text. */
  shadow: colors.reelTextShadow,
  scrimClear: colors.reelScrimClear,
  /** 0.62: the shallowest stop text may sit on. */
  scrimMid: colors.reelScrimMid,
  /** 0.86. */
  scrimDeep: colors.scrimDeep,
  /** 0.78: plates, markers, counts. 9.98:1 for `ink` over white. */
  markerFill: colors.reelScrim,
  markerEdge: colors.reelControlBorder,
  /** Solid plaques. `neutral` is DexStatusPlaque's: 9.98:1 for its ink over white. */
  plaque: {
    neutral: { fill: colors.reelScrim, edge: colors.reelControlBorder, ink: colors.reelInk },
  },
} as const;

/**
 * The 128px noise tile (assets/images/grain.png): grey 32..232, alpha 26.
 * check-contrast decodes the PNG and fails if these numbers drift from it,
 * then composites the brightest and darkest tile pixel over each ground to
 * get the worst real pixel under text (specs/v3-cabinet.md section 4).
 * components/Grain.tsx reads the opacities.
 */
export const grain = {
  tile: { min: 32, max: 232, alpha: 26 },
  /** ~3.6% effective, as before v3. */
  paper: 0.35,
  /** ~7.8% effective (alpha 20/255): reads as baize. */
  lining: 0.77,
} as const;

/* ==================================================================== */
/* Typography — Sipply identity                                         */
/* Playfair Display (display) / Inter (everything else)                  */
/*                                                                      */
/* The handoff names exactly two families and three Inter weights, so    */
/* the third family is gone: Space Mono no longer sets the dex numbers.  */
/* They are now Inter Medium, tracked out (see dexNumber) — the          */
/* handoff's own "letterspaced label" style, which is what a catalogue   */
/* number wanted to be all along. The `tabular` style carries the        */
/* numeric the mono was really there for.                               */
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
  /** The dex numbers (and, until stage 3 deletes it, the deprecated `label.tagline`). */
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
   * Tags and badges: the category tag, the tab bar label. The
   * floor of the scale — 11pt is the smallest size iOS treats as legible,
   * so nothing in the app goes below it.
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
 * Text roles. Chrome is Inter; Playfair is for the wordmark and drink
 * names, and nothing else.
 *
 * A role is a whole text style (family, size, line height) for one job, so
 * a top bar or a field label is set the same way on every screen instead
 * of being rebuilt from `fonts` and `type` at each call site, which is how
 * the app ended up with three bar-title sizes in two families. Colour is
 * left to the caller: the same role is ink on paper, onLining in the
 * cabinet and onMedia.ink over a photo.
 *
 * PLAYFAIR DISCIPLINE (v3). The display face appears only in the name
 * roles below (wordmark, wordmarkLg, drinkHero ... tileName, nameInline),
 * and check-design rule 6 fails any other role, or any file but this one
 * and the brand film, that reaches for it. Counts and figures are Inter
 * tabular (`heroFigure`, `count`), shelf and section headers are Inter
 * (`shelfTitle`, `sectionTitle`), and a sentence that names a drink is
 * Inter with only the name in `nameInline`. A drink name is drawn through
 * DrinkName (components/cabinet.tsx), which fits it to its column instead
 * of truncating it.
 *
 * Chrome sizes reuse `type` where they can; the bar titles (17, 20) are
 * iOS's, and the name roles are set per surface (specs/v3-cabinet.md
 * section 6.4 gives each one's column and Dynamic Type cap).
 */
export const textRole = {
  wordmark:     { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 34 },  // Home top bar
  barTitle:     { fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22 }, // ScreenTopBar md
  barTitleLg:   { fontFamily: fonts.bodySemiBold, fontSize: 20, lineHeight: 26 }, // ScreenTopBar lg, Reels header
  emptyTitle:   { fontFamily: fonts.bodySemiBold, fontSize: 22, lineHeight: 28 }, // EmptyState, primers
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 },
  groupTitle:   { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
  rowTitle:     { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  rowSubtitle:  { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  button:       { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 20 },
  buttonSm:     { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 18 },
  fieldLabel:   { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  fieldValue:   { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  helper:       { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },

  /* ---- Playfair: the wordmark and drink names ONLY (check-design rule 6) ---- */
  wordmarkLg:   { fontFamily: fonts.displayBold, fontSize: 44, lineHeight: 50 },  // sign-in backdrop, password reset
  drinkHero:    { fontFamily: fonts.displayBold, fontSize: 52, lineHeight: 56, letterSpacing: -0.3 }, // drink page
  nameplate:    { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 40 },  // over a feed photo
  nameLg:       { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 34 },  // pours viewer, collect moment
  shelfName:    { fontFamily: fonts.display, fontSize: 26, lineHeight: 30 },      // Latest catch
  rowName:      { fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },      // Log, My Bar, Add a drink rows
  cardName:     { fontFamily: fonts.displayBold, fontSize: 17, lineHeight: 21 },  // a collected Dex card
  printName:    { fontFamily: fonts.display, fontSize: 16, lineHeight: 20 },      // "Not in your Dex yet" prints
  miniName:     { fontFamily: fonts.display, fontSize: 14, lineHeight: 18 },      // Added by you, Stats
  tileName:     { fontFamily: fonts.display, fontSize: 13, lineHeight: 17 },      // Today's pours
  nameInline:   { fontFamily: fonts.display },                                     // a name inside an Inter sentence

  /* ---- Inter ---- */
  heroFigure:   { fontFamily: fonts.bodySemiBold, fontSize: 36, lineHeight: 40, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  shelfTitle:   { fontFamily: fonts.bodySemiBold, fontSize: 20, lineHeight: 26 },  // "Fizz", "Not in your Dex yet"
  count:        { fontFamily: fonts.bodySemiBold, fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums'] },
  username:     { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  prose:        { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  labelValue:   { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },  // drink page label band
  labelCaption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  specAmount:   { fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'] },
  tastes:       { fontFamily: fonts.body, fontSize: 18, lineHeight: 26 },
  /** The drink page's Origin story band. */
  story:        { fontFamily: fonts.body, fontSize: 17, lineHeight: 26 },
  /** The Dex status tag ("In your Dex", "New"), its width sum, and the "Added by you" word. */
  statusWord:   { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

/**
 * The brand's letterspaced label. RN takes letterSpacing in points, so
 * these are pre-multiplied — keep them in step with `fontSize` if you
 * change one.
 *
 * Nothing in the app sets letterspaced words any more (beyond the hair of
 * optical tracking `type` gives its small sizes): letterspaced caps were
 * the habit that most made it look machine-designed, and check-design bans
 * uppercase and wide tracking (rule 8). The intro's tagline was the last
 * reader, and v3 sets it in sentence case without tracking.
 */
export const label = {
  /** @deprecated The intro's 0.5em tracking. v3's SipplyIntro stops reading it; deleted in stage 3. */
  tagline: { fontSize: 12, lineHeight: 16, letterSpacing: 6 }, // tracking-ok: deprecated, deleted in stage 3
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
 * Tracked at 1.5pt, the one wide tracking left in the interface (`type`'s
 * small sizes carry only a hair of optical spacing): it is a code made of
 * figures, not words, and four digits set tight read as a price or a count
 * rather than a catalogue stamp. Tabular so a column of them lines up.
 *
 * taupeInk: 5.89:1 on a white card, 5.55:1 on the mat, 5.28:1 on the page,
 * 4.80:1 or better on the category washes. Never on lining or in a slot:
 * there the number plate (components/cabinet.tsx) overrides `color` with
 * onLiningMuted, and over a photo with onMedia.ink.
 */
export const dexNumber: TextStyle = {
  fontFamily: fonts.label,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 1.5, // tracking-ok: a code of figures, not words (see above)
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
 * Stroke widths. Every edge is drawn, and drawn at one of these.
 *
 * Focus and error rings are `ring` wide but sit on an absolute overlay
 * outside the 1pt edge, so a field that takes focus never moves by a
 * pixel; a border that thickened on focus would push its own text.
 */
export const stroke = {
  /** Row separators inside list groups. */
  hair: StyleSheet.hairlineWidth,
  /** Every container and control edge, and the rule under a top bar or TabStrip. */
  edge: 1,
  /** Focus and error rings on inputs, drawn as an overlay so layout never moves. */
  ring: 2,
  /** TabStrip underline, Dex progress rule. */
  indicator: 2,
} as const;

/**
 * Layout sizes, in points. Heights are minimums (boxes grow with Dynamic
 * Type); anything under `hit` reaches 44 with hitSlop at the call site.
 */
export const layout = {
  gutter: 16,       // screen side padding everywhere (was 24 on 12 screens)
  hit: 44,          // minimum touch target; smaller visuals reach it with hitSlop
  topBar: 44,
  tabBar: 64,
  tabBarInset: 12,  // floating tab bar inset from each screen edge
  control: 48,      // Button md
  controlSm: 36,    // Button sm (hitSlop 4 top/bottom → 44)
  field: 56,        // Field / SelectField row
  fieldMultiline: 112,
  search: 44,
  chip: 32,         // hitSlop 6 top/bottom → 44
  tag: 22,
  segmented: 36,    // hitSlop 4 top/bottom → 44
  tabStrip: 44,
  row: 52,          // ListRow, one line
  rowTall: 64,      // ListRow with a subtitle or a 40pt avatar
  gridGap: 2,       // between media grid tiles
  feedPhotoAspect: 4 / 5, // a feed post's photo (was 3:4, inline in PostCard)
  dexGap: 10,       // between Dex columns
  dexLedge: 16,     // between Dex rows (the shelf ledge)
  pinnedBar: 74,    // the drink page's pinned action bar, above the home indicator (a minimum: it grows)
  /**
   * Home's stories (v3.1): the ring box, the unseen and seen strokes, the
   * gap to the photo disc, the label column, the + badge and its ring.
   * The disc is ring - 2 x (ringWidth + gap): 57.
   */
  story: { ring: 68, ringWidth: 2.5, ringWidthSeen: 1, gap: 3, label: 76, badge: 22, badgeRing: 2 },
  /** Home's floating bar: the fade under the bar, and under the status strip. */
  homeBarTail: 24,
  homeStripTail: 16,
} as const;

/**
 * v2 radius scale. Role-named, so a call site says what it is.
 *   none     full-bleed media, grid tiles, docked bars, progress bars, rules
 *   badge    things ≤ 24pt: tags and badges, markers on media (gallery count,
 *            duration), checkboxes, thumbnails ≤ 48pt
 *   control  28–56pt interactive things: buttons, inputs, search, chips,
 *            segmented control, notices, media icon buttons, Dex cards
 *   card     panels: Card, list groups, sheets' top corners, dialogs, the
 *            tab bar, inset photos
 *   round    ONLY avatars (with their rings and badges), Home's story
 *            circles (ring, photo disc, + badge; v3.1), the camera
 *            shutter, dots ≤ 10pt. Lint-enforced (scripts/check-design.mjs).
 * A nested shape takes the concentric radius, outer − inset, computed at
 * the call site (the segmented thumb is `radius.control - 2`).
 *
 * Why rectangles: the handoff drew every control as a pill, and a screen
 * where every button, field, tag and the tab bar itself is a stadium is the
 * clearest sign nobody decided anything. 8pt is what native forms and
 * buttons measure.
 *
 * The old size-named keys (sm 10, md 12, lg 16, xl 24, tab 32, pill 999)
 * were deleted, never re-valued: a new value under an old name would have
 * silently restyled every site that used it, where a deleted name made
 * `tsc` list them.
 */
export const radius = {
  none: 0,
  badge: 4,
  control: 8,
  card: 12,
  round: 999,
} as const;

/**
 * Espresso-tinted shadows. These were cool green (#334B48) for the white
 * page; on a warm cream page a cool shadow reads as a smudge.
 *
 * Cards on paper still cast none: no buttons, no cards, no dialogs. Panels
 * separate from the page by a drawn edge (see Card in components/ui.tsx).
 * A shadow is for something that genuinely sits above what is under it,
 * and v3 has exactly these: the tab bar (`barDark`, and `bar` until stage
 * 3), bottom sheets (`sheet`), a mount SEATED in the lining (`seat`), an
 * empty slot PRESSED into it (`recess`), and the paper spec card lying on
 * the cellar ground (`paper`). check-design rule 12 keeps every shadow
 * prop inside this object; call sites spread a token.
 */
export const elevation = {
  /**
   * The floating tab bar's paper skin and the Dex scroll-to-top, until
   * stage 2 moves them to `barDark` and `seat`; deleted in stage 3. Tight:
   * lift, not smudge. The handoff's tab-bar shadow spread 30pt of blur
   * under a bar that already has a drawn 1pt edge, which reads as a soft
   * glow rather than an object resting above the page.
   *
   * Written as a CSS box-shadow, not the legacy shadowColor/Offset/Opacity/
   * Radius props. Those draw on the view's own layer, and a view that
   * clips its children with `overflow: 'hidden'` takes a legacy shadow
   * away with the clip on iOS. A non-empty `boxShadow` makes React Native
   * split a clipping view in two: the clip moves onto an inner container
   * and the shadow is drawn outside it, cast from an explicit rounded-rect
   * path and masked out under the view itself.
   */
  bar: { boxShadow: '0px 4px 14px rgba(43, 35, 34, 0.10)' },
  sheet: {
    shadowColor: '#2B2322',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  /** A mount seated in the lining: a contact line and a short drop. Only ever on lining. */
  seat: { boxShadow: '0px 1px 0px rgba(14, 11, 11, 0.45), 0px 8px 18px rgba(14, 11, 11, 0.34)' },
  /** An empty slot pressed into the lining: dark from above, a faint lit lower lip. */
  recess: { boxShadow: 'inset 0px 2px 10px rgba(0, 0, 0, 0.55), inset 0px -1px 0px rgba(233, 229, 223, 0.06)' },
  /** A paper card lying on the cellar ground (the drink page's spec card). */
  paper: { boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.45)' },
  /** The espresso tab bar, on every tab. */
  barDark: { boxShadow: '0px 4px 14px rgba(14, 11, 11, 0.30)' },
} as const;

/** Micro-interactions 150–300ms; springs over cubic curves. */
export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  /** Exit ~65% of enter. */
  exit: 140,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  /**
   * How a SELECTION indicator answers: the thumb of SegmentedControl and
   * the underline of TabStrip (components/), and the Dex filter rule until
   * v3's filter Chips replace it (Chips answer with a fill). Each of them
   * also shows its state without motion (a label colour, a filled glyph),
   * so a spring that stalls never hides which option is on. Tab
   * switches do not use it: they take the navigator's own short,
   * translate-only nudge ((tabs)/_layout.tsx), never a spring.
   *
   * Faster than `spring`, which stays where it is because it drives other
   * things (sheets, the media-tile press scale, the profile meter).
   * Selection is the one interaction that felt sluggish, so it gets its own
   * value rather than the whole app getting quicker.
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
   * same number: the filter rule at the top of the Dex, the TabStrip on a
   * profile and the segmented control in My Bar. A user who taps one and
   * then another must not see the same gesture answered at two speeds.
   */
  selection: { damping: 31, stiffness: 640, mass: 0.9 },
  /** Media tiles only (PressableScale): Dex cards, grid tiles, reel tiles. Controls answer with a fill. */
  pressScale: 0.97,
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
 * Drawn from the category palette and the brand's inks rather than
 * authored separately, so avatar tints always belong to the same colour
 * system.
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
