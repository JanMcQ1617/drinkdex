import { LIQUID } from '@/components/artwork/liquid';
import { colors } from '@/constants/theme';
import type { Cap, Glass, Ink, Pour } from '@/data/barShelf';

/* ==================================================================== */
/* Paint for the back bar                                               */
/*                                                                      */
/* Every colour here is DERIVED: a theme token or the artwork's LIQUID  */
/* pour palette, mixed or given an alpha in code. No new raw colour     */
/* enters the app (check-design rule 2), and none of these carries      */
/* text, so check-contrast has nothing to measure: the words on the     */
/* back bar sit on the lining and the mat in their audited inks.        */
/* ==================================================================== */

type RGBA = [number, number, number, number];

/** '#rrggbb', 'rgb(r, g, b)' or 'rgba(r, g, b, a)' as numbers. */
function parse(c: string): RGBA {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (hex) return [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16), parseInt(hex[3]!, 16), 1];
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] == null ? 1 : Number(fn[4])];
  return [0, 0, 0, 1];
}

const out = ([r, g, b, a]: RGBA) =>
  a >= 1
    ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
    : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;

/** `c` at opacity `a`. */
export function alpha(c: string, a: number): string {
  const [r, g, b] = parse(c);
  return out([r, g, b, a]);
}

/** `a` moved toward `b` by `t` (0..1), opaque. */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return out([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t, 1]);
}

const WHITE = colors.reelInk;
const BLACK = colors.reelGround;

/* ---- The furniture ---- */

/**
 * The back bar's own tokens. None carries text (the backlight never sits
 * under a word: it ends at the plank, and every label hangs below it).
 */
export const BAR = {
  /** The lit top face of a shelf plank (the spirit face's warm brown). */
  plankTop: colors.faceSpirit,
  /** The plank's foot of that face. */
  plankTopFoot: mix(colors.faceSpirit, colors.text, 0.4),
  /** The plank's front edge: the bar's espresso. */
  plankFace: colors.text,
  /** The strip at the back of a shelf that lights the wall up behind the bottles. */
  backlight: alpha(LIQUID.amber, 0.26),
  /** The shade a plank casts on the lining under it. */
  plankShade: colors.ledge,
  /** A tag's contact line where it clips onto the plank. */
  tagSeat: colors.matEdge,
  /** A shadow under a bottle's foot. */
  contact: BLACK,
  /** The 1pt rim light on a lit bottle's glass. */
  rim: alpha(WHITE, 0.34),
  /** The highlight down the glass and the meniscus. */
  glint: alpha(WHITE, 0.3),
  /** The darkening at a round bottle's edges. */
  edgeShade: BLACK,
} as const;

/* ---- Pours ---- */

const POUR: Record<Pour, string> = {
  clear: LIQUID.clear,
  paleStraw: LIQUID.paleStraw,
  straw: LIQUID.straw,
  gold: LIQUID.gold,
  amber: LIQUID.amber,
  copper: LIQUID.copper,
  brown: LIQUID.brown,
  darkBrown: LIQUID.darkBrown,
  coffee: LIQUID.coffee,
  redWine: LIQUID.redWine,
  deepRed: LIQUID.deepRed,
  red: LIQUID.tomato,
  rose: LIQUID.rose,
  whiteWine: LIQUID.whiteWine,
  orange: LIQUID.orange,
  pink: LIQUID.pink,
  green: LIQUID.green,
  mint: LIQUID.mint,
  blue: LIQUID.blue,
  violet: LIQUID.violet,
  cream: LIQUID.cream,
  milky: LIQUID.milky,
};

/** A pour's base colour, opaque. */
export function pourColor(p: Pour): string {
  return POUR[p];
}

/**
 * The liquid as two stops, top and foot: a little lighter where the light
 * comes through the top, darker at the foot. Pale pours (clear spirits,
 * syrup) stay mostly see-through so the bottle reads as glass.
 */
export function pourStops(p: Pour): [string, string] {
  const base = POUR[p];
  const pale = p === 'clear' || p === 'milky' || p === 'paleStraw' || p === 'whiteWine';
  if (pale) return [alpha(mix(base, WHITE, 0.45), 0.64), alpha(mix(base, colors.taupe, 0.2), 0.6)];
  return [mix(base, WHITE, 0.08), mix(base, BLACK, 0.45)];
}

/* ---- Glass, labels, caps ---- */

export const GLASS: Record<Glass, string> = {
  clear: alpha(colors.onLining, 0.2),
  frost: alpha(mix(LIQUID.clear, LIQUID.blue, 0.25), 0.24),
  green: alpha(mix(LIQUID.green, colors.faceSpirit, 0.55), 0.52),
  dark: alpha(mix(LIQUID.darkBrown, BLACK, 0.4), 0.92),
  amber: alpha(LIQUID.copper, 0.6),
  blue: alpha(LIQUID.blue, 0.45),
};

export const INK: Record<Ink, string> = {
  wine: colors.wine,
  merlot: colors.merlot,
  espresso: colors.text,
  green: mix(LIQUID.green, colors.text, 0.55),
  blue: mix(LIQUID.blue, colors.text, 0.5),
  taupe: colors.taupe,
  copper: mix(LIQUID.copper, colors.text, 0.3),
};

/** Label paper: bone card stock, or the dark label of a rye or a cognac. */
export const LABEL_PAPER = { light: colors.mat, dark: mix(colors.text, BLACK, 0.4) } as const;
/** The printed rule inside a label, and the device on it. */
export const LABEL_LINE = { light: alpha(colors.text, 0.38), dark: alpha(colors.onLining, 0.55) } as const;

export const CAP: Record<Cap, string> = {
  espresso: mix(colors.text, BLACK, 0.3),
  wine: colors.wine,
  metal: colors.textFaint,
  cork: colors.taupeInk,
  gold: mix(LIQUID.gold, colors.taupeInk, 0.45),
  red: mix(LIQUID.tomato, colors.wine, 0.4),
  green: mix(LIQUID.green, colors.text, 0.4),
};

/* ---- Fresh things ---- */

/** Top and foot of a fruit's skin, and its own highlight. */
export const FRUIT = {
  lemon: [mix(LIQUID.straw, WHITE, 0.1), mix(LIQUID.gold, BLACK, 0.35)],
  lime: [mix(LIQUID.green, WHITE, 0.05), mix(LIQUID.green, BLACK, 0.45)],
  limeFlesh: [mix(LIQUID.green, WHITE, 0.62), mix(LIQUID.green, WHITE, 0.25)],
  orange: [mix(LIQUID.orange, WHITE, 0.08), mix(LIQUID.orange, BLACK, 0.38)],
  grapefruit: [mix(LIQUID.orange, LIQUID.pink, 0.4), mix(LIQUID.tomato, BLACK, 0.3)],
  leaf: mix(LIQUID.green, colors.text, 0.35),
  leafVein: alpha(mix(LIQUID.green, WHITE, 0.6), 0.55),
  stem: mix(LIQUID.green, colors.text, 0.5),
  highlight: alpha(WHITE, 0.32),
  outline: alpha(BLACK, 0.35),
} as const;

/** A fruit's skin from its colour: lit at the top, settling darker at the foot. */
export function skinOf(tint: string): [string, string] {
  return [mix(tint, WHITE, 0.08), mix(tint, BLACK, 0.38)];
}

/** The soda siphon's metal head and its blue glass. */
export const SIPHON = {
  metal: [mix(colors.textFaint, BLACK, 0.2), mix(colors.bgSunk, colors.textFaint, 0.25), mix(colors.textFaint, BLACK, 0.3)],
  glass: alpha(mix(LIQUID.blue, colors.textFaint, 0.5), 0.5),
  collar: mix(colors.text, colors.textFaint, 0.35),
  rings: alpha(BLACK, 0.22),
} as const;

/** An egg's shell, a jug's glaze and a carton's paper. */
export const PAPER_GOODS = {
  shell: [colors.mat, mix(colors.bgSunk, colors.taupe, 0.4)],
  carton: colors.mat,
  cartonFold: mix(colors.bgSunk, colors.taupe, 0.35),
  jug: alpha(colors.onLining, 0.24),
  jarLid: mix(colors.text, colors.textFaint, 0.25),
} as const;
