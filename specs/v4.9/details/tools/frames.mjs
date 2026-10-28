/* ==================================================================== */
/* v4.9 frames: the editorial and photo-frame marks                     */
/*                                                                      */
/* Port target: src/components/details/framePath.ts (spec A.2).         */
/*                                                                      */
/* Two tiers, one page:                                                 */
/*   PEN (colors.accent, the hand)  doubleRule, cropCorners, cornerL,   */
/*                                  cornerRule (cropTick and dripRule:  */
/*                                  rejected)                           */
/*   PRESS (a grey, the printer)    leader, perforation, ticket         */
/* Pen marks are filled pen outlines (stroke()); press marks are plain  */
/* printed geometry (dots, dashes, a die-cut silhouette), M/L/Z, never  */
/* a strokeWidth. Everything deterministic, cached, and one path a mark */
/* (shapeOne), except cropTick, the rejected evidence.                  */
/* ==================================================================== */

import { PEN, cached, clamp, dot, line, penRule, plateDrip, quarter, shapeOf, shapeOne, stroke } from './pen.mjs';

/* ------------------------------------------------------------------ */
/* Pen                                                                */
/* ------------------------------------------------------------------ */

/**
 * The double rule: two pen rules 3.2pt apart, centreline to centreline,
 * the lower one 1.5% shorter and a stroke of its own (its own seed), so
 * the pair reads as ruled twice by hand, never as one thick line. Nominal
 * box `length` x 10; the upper centreline at 3.4 (PenRule's), the lower
 * at 6.6.
 */
export const DOUBLE = { gap: 3.2, height: 10, shorter: 0.985 };
export function doubleRule(length, seed = 0) {
  const L = quarter(length);
  return cached(`dbl|${L}|${seed}`, () => {
    const a = penRule(L, seed).polys;
    const b = penRule(quarter(L * DOUBLE.shorter), seed + 3).polys.map((p) => p.map(([x, y]) => [x, y + DOUBLE.gap]));
    return shapeOne([...a, ...b]);
  });
}

/**
 * Crop corners around a print w x h (pt): four L marks, each two arms of
 * `arm` pt drawn as ONE pen stroke bent at the corner, set `gap` pt
 * outside the print on both axes, so ink never touches the picture.
 * The frame is the print's own: (0, 0) is its top-left corner. Each L
 * starts at its long end and lifts at the other, alternating, as a hand
 * goes round a page. `which` picks corners. After judging (28 Oct) an
 * empty state's print takes the ANTI-DIAGONAL PAIR, 'tr bl', as the feed's
 * posts do: four brackets round a photo are a camera's viewfinder, which
 * beside "Post a drink" reads as "take a photo".
 *
 * BOLDER (28 Oct, the lead's pass on Jan's "still feels too empty"): the
 * arms are 15pt, not 11 (at 10 and 11 the pair read as two slivers, not
 * as a frame), and the pen presses harder through them, 0.45 -> 1.45 ->
 * 0.45, the arrow's weight, so a corner reads as a confident mark of the
 * logo's pen and not as a hairline tick. The gap stays 6.
 */
export const CROP = { arm: 15, gap: 6, land: 0.45, peak: 1.45 };
export function cropCorners(w, h, arm = CROP.arm, gap = CROP.gap, which = 'tr bl') {
  return cached(`crop|${w}|${h}|${arm}|${gap}|${which}`, () => {
    const g = gap;
    const pressL = (t) => CROP.land + (CROP.peak - CROP.land) * Math.sin(Math.PI * clamp(t * 1.04, 0, 1)) ** 0.5;
    const L = (a, corner, b) => {
      // A soft corner: two points 0.9pt either side of it.
      const ca = [corner[0] + (a[0] - corner[0]) * (0.9 / arm), corner[1] + (a[1] - corner[1]) * (0.9 / arm)];
      const cb = [corner[0] + (b[0] - corner[0]) * (0.9 / arm), corner[1] + (b[1] - corner[1]) * (0.9 / arm)];
      return polyStroke([a, ca, cb, b], pressL);
    };
    const tl = [-g, -g];
    const tr = [w + g, -g];
    const br = [w + g, h + g];
    const bl = [-g, h + g];
    const all = {
      tl: () => L([tl[0], tl[1] + arm], tl, [tl[0] + arm, tl[1]]),
      tr: () => L([tr[0] - arm, tr[1]], tr, [tr[0], tr[1] + arm]),
      br: () => L([br[0], br[1] - arm], br, [br[0] - arm, br[1]]),
      bl: () => L([bl[0] + arm, bl[1]], bl, [bl[0], bl[1] - arm]),
    };
    return shapeOne(which.split(/[\s,]+/).filter(Boolean).map((k) => all[k]()));
  });
}

/**
 * One corner alone, in an `arm` x `arm` box whose own corner `which` is
 * the mark's corner: what PostCorners places top right of a post at
 * { top: 3, right: 8 }, and bottom left on the post page (which has no
 * closing rule), so the card's height is never needed (spec C.1). The
 * same L as cropCorners', 15pt arms since the bolder pass.
 */
export function cornerL(arm = CROP.arm, which = 'tr') {
  return cropCorners(arm, arm, arm, 0, which);
}

/**
 * The feed post's foot: the bottom-left crop corner and the 24pt closing
 * rule as ONE stroke (judging, 28 Oct: a 2pt gap between them read as a
 * render seam). It lands at the top of the corner's upright, turns the
 * softened corner and runs on along the foot as the closing rule did, to
 * the same end (x 40 in the card: the column 16 plus the rule's 24), and
 * lifts there. Nominal box `run` x `arm`: the corner at its bottom left,
 * the foot's centreline on the box's bottom edge, so PostCorners places
 * it at { left: 8, bottom: 3 } and the foot's centreline sits where the
 * closing rule's did (h - 3). Bolder pass: the upright is 15pt (the
 * corners' arm) and the pen peaks at 1.42 through the corner, the
 * corners' weight, where the 24pt rule it replaces peaked at 1.1.
 */
export const CORNER_RULE = { arm: CROP.arm, run: 32, peak: 1.42 };
export function cornerRule(arm = CORNER_RULE.arm, run = CORNER_RULE.run) {
  return cached(`crule|${arm}|${run}`, () => {
    const L = arm + run;
    const at = (d) => (d <= arm - 0.9 ? [0, d] : d >= arm + 0.9 ? [d - arm, arm] : null);
    const pts = [[0, 0], at(arm - 0.9), at(arm + 0.9), [run, arm]];
    // Lands thin on the upright, full through the corner and along the foot, lifts at the rule's end as PenRule does.
    const w = (t) => {
      const d = t * L;
      const land = Math.sin((Math.PI / 2) * Math.min(1, d / 6)) ** 0.6;
      const lift = Math.min(1, (L - d) / 9) ** 0.7;
      return 0.4 + (CORNER_RULE.peak - 0.4) * Math.min(land, lift);
    };
    return shapeOne([polyStroke(pts, w)]);
  });
}

/**
 * REJECTED (bolder pass, 28 Oct), kept as the evidence only, never
 * ported. Home's stories rule with one drip: penRule(L, seed) exactly and
 * the plate's own drip (plateDrip()) hanging from its underside at `at`
 * of its length, its run's top on the rule's local centreline. Tried as
 * the one new mark on Home at rest that is not per row (the wordmark's y
 * drips). Rendered (board/shots/rejected-stories-drip.png), the drop
 * hangs under one story of a tray that scrolls, and a mark under one
 * face reads as a pointer, "this one": a state. The stories rule is
 * doubled instead (doubleRule(408, PEN_SEED.stories), spec C.0).
 */
export const DRIP_RULE = { at: 0.7 };
export function dripRule(length, seed = 0, at = DRIP_RULE.at) {
  const L = quarter(length);
  return cached(`drule|${L}|${seed}|${at}`, () => {
    const rule = penRule(L, seed).polys;
    const x = quarter(L * at);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of rule) for (const [px, py] of p) if (Math.abs(px - x) < 0.6) (lo = Math.min(lo, py)), (hi = Math.max(hi, py));
    const y = Number.isFinite(lo) ? (lo + hi) / 2 : PEN.rule.mid;
    const drop = plateDrip().polys.map((p) => p.map(([px, py]) => [px + x, py + y]));
    return shapeOne([...rule, ...drop]);
  });
}

/**
 * REJECTED (spec C.1), kept as the evidence only, never ported.
 * A trim tick: a short pen dash `length` long, for a full-bleed photo's
 * corners (spec C.1, Home): it extends the photo's top or bottom trim
 * line in from the screen's edge. Nominal box length x 6, centreline 3.4,
 * as a rule. `dir` 1 lands at the screen edge and lifts inward (a left
 * tick); -1 is the mirror (a right tick).
 */
export function cropTick(length = 8, dir = 1) {
  return cached(`tick|${length}|${dir}`, () => {
    const L = length;
    const w = (t) => 0.4 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.5;
    const s = stroke((t) => [dir === 1 ? L * t : L * (1 - t), PEN.rule.mid + 0.18 * Math.sin(Math.PI * t)], w, 18);
    return shapeOf([s]);
  });
}

/* ------------------------------------------------------------------ */
/* Press                                                              */
/* ------------------------------------------------------------------ */

/**
 * The menu leader: round dots `size` across every `pitch` pt along a
 * baseline, for `length` pt. Frame: the nominal box is length x 4 and its
 * FOOT IS THE BASELINE (PressLeader is a childless View, whose Yoga
 * baseline is its bottom edge, aligned on the item's first baseline): the
 * dots' centres sit 1.6 above it, at y 2.4, the dots' middle on the
 * x-height's floor as a typesetter's leader does. The run is
 * right-aligned: the last dot sits `inset` before the end, so every leader
 * in a column ends on the same beat before its amount, and a part dot is
 * dropped at the start. One path (shapeOne): the dots never overlap.
 */
export const LEADER = { size: 1.1, pitch: 4, inset: 2, height: 4, rise: 1.6 };
export function leader(length, size = LEADER.size, pitch = LEADER.pitch) {
  const L = quarter(length);
  return cached(`lead|${L}|${size}|${pitch}`, () => {
    const polys = [];
    const r = size / 2;
    const y = LEADER.height - LEADER.rise;
    for (let x = L - LEADER.inset; x >= LEADER.inset; x -= pitch) polys.push(dot(x, y, r, 8));
    return shapeOne(polys.length ? polys : [dot(L / 2, y, 0.01, 3)]);
  });
}

/**
 * The perforation across a ticket: dashes `dash` long every `pitch`,
 * 0.8pt thick, between x0 and x1 at y, centred in the run. Frame: the
 * ticket's own. After judging (28 Oct) it runs NOTCH TO NOTCH: x0 is the
 * left notch's bite plus 2, x1 the right's less 2, and it is printed in
 * colors.rule (1.6:1 on the wash), not hair (1.2:1), so the tear line
 * reads. One path (shapeOne): the dashes never overlap.
 */
export const PERF = { dash: 2.4, pitch: 5, thick: 0.8 };
export function perforation(x0, x1, y, dash = PERF.dash, pitch = PERF.pitch) {
  return cached(`perf|${x0}|${x1}|${y}`, () => {
    const polys = [];
    const t = PERF.thick / 2;
    const n = Math.floor((x1 - x0 + (pitch - dash)) / pitch);
    const used = n * pitch - (pitch - dash);
    let x = x0 + (x1 - x0 - used) / 2;
    for (let i = 0; i < n; i++, x += pitch) {
      polys.push([
        [x, y - t],
        [x + dash, y - t],
        [x + dash, y + t],
        [x, y + t],
      ]);
    }
    return shapeOne(polys);
  });
}

/**
 * The ticket: a card's silhouette w x h with corner radius `r`, and two
 * half-round die-cut notches of radius `notch`, one in each side,
 * centred at `at` (pt from the top). One closed outline, clockwise,
 * M/L/Z: it is the card's FILL (wash, press when pressed), so the
 * notches show the page through the card. Arcs are flattened to one
 * point per 6 degrees.
 *
 * DIE-CUT, NOT TORN. Jan picked "a torn-ticket edge"; a zigzag or ragged
 * edge reads as craft paper, so the ticket is a cinema stub's die-cut
 * pair and the perforation it would tear along. After judging (28 Oct)
 * the notches are radius 8, not 6: at 6 they were 1.05:1 against the
 * paper and did not read.
 */
export const TICKET = { notch: 8, radius: 8 };
export function ticket(w, h, at, notch = TICKET.notch, r = TICKET.radius) {
  return cached(`ticket|${w}|${h}|${at}|${notch}|${r}`, () => {
    const pts = [];
    const arc = (cx, cy, rad, a0, a1) => {
      const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 6));
      for (let i = 0; i <= steps; i++) {
        const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
        pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
      }
    };
    arc(r, r, r, 180, 270); // top-left corner
    arc(w - r, r, r, 270, 360); // top-right corner
    arc(w, at, notch, 270, 90); // the right notch, biting in
    arc(w - r, h - r, r, 0, 90); // bottom-right corner
    arc(r, h - r, r, 90, 180); // bottom-left corner
    arc(0, at, notch, 90, -90); // the left notch, biting in
    return shapeOf([pts]);
  });
}

/** A polyline stroke through a few points (no smoothing past them): for the crop corners' bend. */
function polyStroke(pts, w) {
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(l);
    L += l;
  }
  const sample = (t) => {
    let d = t * L;
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i] || i === segs.length - 1) {
        const f = segs[i] ? Math.min(1, d / segs[i]) : 0;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
      }
      d -= segs[i];
    }
    return pts[pts.length - 1];
  };
  return stroke(sample, w, Math.max(24, Math.round(L / 0.5)));
}

export { line };
