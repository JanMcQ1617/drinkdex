import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* ==================================================================== */
/* The onboarding's geometry                                            */
/*                                                                      */
/* Imprint's frame, measured and kept (specs/v4-onboarding/spec.md 2,   */
/* study/study.md 1 and 2), in points on the 440 x 956 reference. The    */
/* y figures there count the 62pt status bar; here they are measured     */
/* from the top safe-area inset, so a phone with a shorter bar keeps the */
/* same distances under it. The foot is measured from the bottom inset   */
/* the same way (34 on the reference).                                   */
/*                                                                      */
/* Deliberate departure from v4's single 24pt gutter (spec 2, agreed     */
/* with Jan): content sits on 40pt margins, Imprint's; the footer key,    */
/* the welcome keys, the provider rows, the centre-stage bubble and the   */
/* feedback card keep 24.                                               */
/* ==================================================================== */

/** Content margin: options, bubbles B and C, the results, the Dex grid. */
export const MARGIN = 40;
/** The footer key, the welcome keys, the ways in, bubble A, the feedback card. */
export const EDGE = 24;

/* ---- The top bar (spec 2) ---------------------------------------- */

/** The bar's row: 44 tall, centred 20 under the status bar (y 82). */
export const BAR_H = 44;
export const BAR_CENTRE = 20;
/** The chevron's 24pt glyph starts at x 20; its 44pt box is centred on it. */
export const CHEVRON_X = 20;
export const GLYPH = 24;
/** The progress rule: x 69 to 356 at 440, 4pt tall, a 1pt corner. */
export const PROGRESS_LEFT = 69;
export const PROGRESS_RIGHT = 84;
export const PROGRESS_H = 4;
export const PROGRESS_RADIUS = 1;
/** Skip: right edge at x 416, a 60 x 44 target. */
export const SKIP_W = 60;

/* ---- The body ---------------------------------------------------- */

/** Where a step's own content begins, under the inset: the bar row's foot (y 104). */
export const BODY_TOP = BAR_CENTRE + BAR_H / 2;
/** The seal's and the bubble's top under that (y 118). */
export const BODY_PAD = 14;

/** The seal in its three places (study 1): A centre stage, B narration, C question. And the reveal's. */
export const SEAL = { A: 200, B: 40, C: 32, pour: 96 } as const;
/** Mode A's two 1pt rings round the 200pt seal. */
export const RING_INNER = 228;
export const RING_OUTER = 260;
/** Mode A: the ring box's top under BODY_TOP (y 226), and the bubble 3 under its foot (y 489). */
export const STAGE_PAD = 122;
export const STAGE_TO_BUBBLE = 3;

/** Mode C: the bubble starts 10 right of the 32pt seal (x 82). */
export const BUBBLE_C_GAP = 10;
/** Mode B: the bubble 12 under the 40pt seal (y 170). */
export const BUBBLE_B_GAP = 12;
/** Mode A's tail: 20 x 9 at the bubble's top centre, pointing at the seal. */
export const TAIL_W = 20;
export const TAIL_H = 9;
/** Insets: C 19 / 21, B 18 / 24, A 15 / 24. */
export const BUBBLE_PAD = {
  C: { v: 19, h: 21 },
  B: { v: 18, h: 24 },
  A: { v: 15, h: 24 },
} as const;
/** The sub line under a prompt. */
export const SUB_GAP = 8;

/* ---- Options (spec 2) -------------------------------------------- */

/** First option under the bubble (24 to 30 measured; y 240 under a two-line prompt). */
export const OPTIONS_GAP = 28;
/** A list row (360 x 64), a flavour key (174 x 64); a 76pt pitch. */
export const ROW_H = 64;
export const GAP = 12;
/** A bar tile: 174 x 56 on a 68pt pitch. */
export const BAR_TILE_H = 56;
/** The checkbox: 22pt, 18 in from a row's edge (16 in a tile), its label 14 after it. */
export const BOX = 22;
export const BOX_INSET = 18;
export const BOX_INSET_TILE = 16;
export const BOX_TO_LABEL = 14;
/** The two grids go to one column at the two largest accessibility sizes (AX4 2.76, AX5 3.12). */
export const ONE_COLUMN_SCALE = 2.7;

/* ---- The foot ---------------------------------------------------- */

/** The footer key: 392 x 51 at y 841, so 30 over the bottom inset (y 892). */
export const KEY_H = 51;
export const KEY_FOOT = 30;
/** On a phone with no home indicator the foot still stands this far off the edge. */
export const MIN_BASE = 16;
/** The 1pt rule where a list runs under the foot: 21 above the key (y 820). */
export const FOOT_RULE = 21;
/** The feedback card: 105 tall, 17 above the key (y 719 to 824). */
export const CARD_H = 105;
export const CARD_GAP = 17;
export const CARD_PRINT = 56;
export const CARD_PAD = 20;
export const CARD_TEXT_GAP = 16;

/* ---- The welcome ------------------------------------------------- */

/** Get started is the footer key, drawn 41 higher (y 800); it slides home on the way in (m2). */
export const WELCOME_SHIFT = -41;
/** "I already have an account": 52 tall, 18 under Get started (y 869). */
export const SECONDARY_H = 52;
export const WELCOME_KEY_GAP = 18;
/** The wall: 146pt prints on a 154pt pitch, four rows; 32 of air above the wordmark. */
export const WALL_PRINT = 146;
export const WALL_PITCH = 154;
export const WALL_TO_WORDMARK = 32;
/** The text block's foot sits 20 over Get started (y 780 to 800). */
export const WELCOME_TEXT_FOOT = 20;

/* ---- Narration and the picks -------------------------------------- */

/** The Dex grid (dexintro): three 112pt prints, 12 apart, 38 under the bubble, Nº 6 under each. */
export const DEX_GAP = 12;
export const DEX_TOP = 38;
export const DEX_LABEL_GAP = 6;
export const DEX_ROW_GAP = 14;

/** Result rows: a 72pt print, the name 16 after it, Save 112 x 36 at the right, rows 16 apart. */
export const RESULTS_GAP = 16;
export const RESULT_PRINT = 72;
export const RESULT_TEXT_GAP = 16;
export const RESULT_ROW_GAP = 16;
export const SAVE_W = 112;
export const SAVE_H = 36;
export const SAVE_GAP = 4;

/** The reveal's collage: its top under the inset (y 268). */
export const POUR_TOP = 206;

/* ---- Per phone ---------------------------------------------------- */

export interface Geometry {
  width: number;
  height: number;
  fontScale: number;
  /** The top safe-area inset: every y above is measured from here. */
  top: number;
  /** The bottom inset, or MIN_BASE where there is none. */
  base: number;
  /** The footer key's top (y 841). */
  keyTop: number;
  /** Width between the 40pt margins (360 at 440). */
  contentW: number;
  /** Width between the 24pt edges (392 at 440). */
  edgeW: number;
  /** The grids' one-column mode. */
  oneColumn: boolean;
}

/** The geometry for this phone and text size. */
export function useGeometry(): Geometry {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const base = Math.max(insets.bottom, MIN_BASE);
  return {
    width,
    height,
    fontScale,
    top: insets.top,
    base,
    keyTop: height - base - KEY_FOOT - KEY_H,
    contentW: width - 2 * MARGIN,
    edgeW: width - 2 * EDGE,
    oneColumn: fontScale >= ONE_COLUMN_SCALE,
  };
}

/** The height of the foot a list must clear: from the rule (y 820) down, plus a card over the key. */
export function footReserve(geo: Geometry, cardH: number | null): number {
  const keyBand = geo.height - geo.keyTop + FOOT_RULE;
  return cardH == null ? keyBand : keyBand + CARD_GAP + cardH;
}
