/* ==================================================================== */
/* Where the type sits in its line box, for the vertical rules          */
/*                                                                      */
/* The margin and column rules run from the first line's CAP HEIGHT to  */
/* the last line's BASELINE (Ledger v2, after craft's note: a rule that */
/* starts above the caps or runs past the descenders reads as a box     */
/* edge, not a ruled page). Those two heights are worked out here from  */
/* the role's size and line height and the font's own ratios, never     */
/* measured at runtime and never hand-placed per screen, so the rules   */
/* follow Dynamic Type for free.                                        */
/*                                                                      */
/* The ratios are the fonts' (Inter's hhea ascent and descent and its   */
/* cap height over 2048 units; Playfair 700's from its own tables, the  */
/* values the Ledger mock placed its rules with). iOS centres the       */
/* glyphs' ascent-plus-descent in a taller line box, which is what the  */
/* formula assumes. If a device ever shows the rule off the caps, the   */
/* correction belongs here, in one place, never in a screen's offsets.  */
/* ==================================================================== */

export type LineFace = 'inter' | 'playfair';

export const FACE_METRICS: Record<LineFace, { ascent: number; descent: number; cap: number }> = {
  inter: { ascent: 0.969, descent: 0.242, cap: 0.7275 },
  playfair: { ascent: 1.082, descent: 0.251, cap: 0.708 },
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
