import { type StyleProp, StyleSheet, type TextStyle } from 'react-native';

/* ==================================================================== */
/* Where the type sits in its line box, for the vertical rules          */
/*                                                                      */
/* The margin and column rules run from the first line's CAP HEIGHT to  */
/* the last line's BASELINE (Ledger v2, after craft's note: a rule that */
/* starts above the caps or runs past the descenders reads as a box     */
/* edge, not a ruled page). Those two heights are worked out here from  */
/* the role's size and line height and the font's own ratios, never     */
/* measured at runtime and never hand-placed per screen, so the rules   */
/* follow Dynamic Type for free. Since v4.10 the same baselines line a  */
/* row's words up across faces: a section head's aside on the poster's  */
/* baseline, " at " and the place on a post's drink name, the Dex's     */
/* count on the tab title (specs/v4.10/spec.md T.4, T.6, T.7).          */
/*                                                                      */
/* The ratios are the fonts' hhea ascent and descent over their em      */
/* (scripts/build-fonts.py --check holds them to the shipped files, to  */
/* 3 decimals) and their cap heights: Archivo's and Anton's from OS/2,  */
/* Sedgwick's the drawn median of its capitals (0.81 to 0.92 em), which */
/* build-fonts also writes into its OS/2 in place of the shipped 0.95.  */
/* iOS centres the glyphs' ascent-plus-descent in a line box at least   */
/* that tall (RCTApplyBaselineOffset, RN 0.86), which is what the       */
/* formula assumes, and every textRole clears it (check-design rule 6). */
/* If a device ever shows the rule off the caps, the correction belongs */
/* here, in one place, never in a screen's offsets.                     */
/*                                                                      */
/* INK ROOM. iOS clips a Text's glyphs to the Text's own bounds (Fabric */
/* draws a paragraph into its frame), and the marker's drawn glyphs     */
/* reach past its own line metrics: its descenders (y j p g q) to 0.433 */
/* em under the baseline against a 0.312 descent, its accented capitals */
/* (Š Ż Í É Â) to 1.174 em above it against a 0.937 ascent. And the     */
/* hand leans past its advances at either end of a line: a word's A     */
/* starts 0.091 em left of its origin, a word's x ends 0.097 past its   */
/* advance (the widest over every catalogue word's first and last       */
/* letter). So the last line's tails, a first-line accent, the foot of  */
/* "Ardbeg"'s A and the tail of "Dex"'s x would be cut. inkRoom gives a */
/* marker Text padding past its line box on all four sides and takes    */
/* the same back as negative margin, so the layout (Yoga's margin box)  */
/* is still the line box, a wrap still breaks at the same width, and    */
/* the bounds now hold the ink. Archivo's accents (0.928 em) and        */
/* Anton's (Å, 1.229) fit inside their roles' half-leading, and their   */
/* letters inside their advances, so they take none. Inner lines of a   */
/* wrapped name may still touch where a descender sits over a capital,  */
/* as a tag's do; only the box clips.                                   */
/* ==================================================================== */

/** The marker (Sedgwick Ave), the poster (Anton) and the text (Archivo). */
export type LineFace = 'display' | 'text' | 'sub';

export const FACE_METRICS: Record<
  LineFace,
  { ascent: number; descent: number; cap: number; inkAbove: number; inkBelow: number; inkSide: number }
> = {
  display: { ascent: 0.937, descent: 0.312, cap: 0.85, inkAbove: 0.24, inkBelow: 0.13, inkSide: 0.1 }, // Sedgwick: hhea; cap the drawn median
  sub: { ascent: 1.176, descent: 0.329, cap: 0.859, inkAbove: 0, inkBelow: 0, inkSide: 0 }, // Anton: hhea 2409/674, cap 1760 of 2048
  text: { ascent: 0.878, descent: 0.21, cap: 0.686, inkAbove: 0, inkBelow: 0, inkSide: 0 }, // Archivo: hhea 878/210, cap 686
};

export interface LineMarks {
  /** From the line box's top to the cap height, in points. */
  capTop: number;
  /** From the line box's top to the baseline. */
  baseline: number;
  /** From the baseline to the line box's foot: what a rule ending on the last baseline stops short of the block's bottom by. */
  foot: number;
  /** The drawn line height. */
  lineHeight: number;
}

/**
 * Cap height and baseline inside one line box. `fontSize` and
 * `lineHeight` are the style's; `scale` is what the text is drawn at over
 * them, min(fontScale, the Text's maxFontSizeMultiplier) for a Text that
 * caps, fontScale for one that does not.
 */
export function lineMarks(face: LineFace, fontSize: number, lineHeight: number, scale = 1): LineMarks {
  const m = FACE_METRICS[face];
  const size = fontSize * scale;
  const lh = lineHeight * scale;
  const baseline = (lh - (m.ascent + m.descent) * size) / 2 + m.ascent * size;
  return { capTop: baseline - m.cap * size, baseline, foot: lh - baseline, lineHeight: lh };
}

/** The padding and margins that give a Text its ink room (the header note). */
export interface InkRoom {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

type Edge = 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight';
/** Where else an edge's margin can be said, most specific first, before `margin` itself. */
const ALSO: Record<Edge, (keyof TextStyle)[]> = {
  marginTop: ['marginVertical'],
  marginBottom: ['marginVertical'],
  marginLeft: ['marginStart', 'marginHorizontal'],
  marginRight: ['marginEnd', 'marginHorizontal'],
};

/** A margin as it resolves for one edge: the edge's own, then its axis's, then `margin`. Numbers only. */
function resolvedMargin(flat: TextStyle | undefined, edge: Edge): number {
  for (const v of [flat?.[edge], ...ALSO[edge].map((k) => flat?.[k]), flat?.margin]) {
    if (typeof v === 'number') return v;
  }
  return 0;
}

/**
 * The marker's ink room at `drawnSize` (the size it is drawn at, after
 * Dynamic Type and any fit): ceil(0.24 x size) of padding above,
 * ceil(0.13 x size) below and ceil(0.1 x size) each side, each with an
 * equal negative margin, so the layout does not move. `style` is the
 * caller's own, whose margins are kept: the room is taken from them,
 * never written over them. Zeros for the text and the poster, whose ink
 * sits inside their lines.
 *
 * Spread it after the caller's style, as the last word on these eight keys.
 */
export function inkRoom(face: LineFace, drawnSize: number, style?: StyleProp<TextStyle>): InkRoom {
  const m = FACE_METRICS[face];
  const flat = style ? StyleSheet.flatten(style) : undefined;
  const room = (k: number) => (k > 0 ? Math.ceil(k * drawnSize) : 0);
  const top = room(m.inkAbove);
  const bottom = room(m.inkBelow);
  const side = room(m.inkSide);
  return {
    paddingTop: top,
    paddingBottom: bottom,
    paddingLeft: side,
    paddingRight: side,
    marginTop: resolvedMargin(flat, 'marginTop') - top,
    marginBottom: resolvedMargin(flat, 'marginBottom') - bottom,
    marginLeft: resolvedMargin(flat, 'marginLeft') - side,
    marginRight: resolvedMargin(flat, 'marginRight') - side,
  };
}
