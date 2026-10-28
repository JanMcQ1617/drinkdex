/* ==================================================================== */
/* The pen at hairline weight: the geometry of every detail mark        */
/*                                                                      */
/* v4.6 (Jan, 23 Oct 2026; specs/v4.6-details/spec.md). The logo is the */
/* paint pen at full weight, so every detail is the same pen drawn at a */
/* whisper: "Pen marks at Ledger's spots". Five shapes, one hand:       */
/*                                                                      */
/*   penRule    a horizontal rule: Home's stories head, a Dex section   */
/*              head, the 24pt rule that closes each feed post          */
/*   penVRule   the same rule standing up: the drink page's margin and  */
/*              column rules, Profile's margin rule                     */
/*   penSwash   the low arc under a tab root's title, the y's tail      */
/*   plateDrip  the one drip, off the caught Nº plate (run and bead)    */
/*                                                                      */
/* DRAWN, NOT STROKED. Each mark is a FILLED outline built round a      */
/* centreline, its width swelling where the pen lands and thinning as   */
/* it lifts, with round ends. A uniform strokeWidth line reads as UI,   */
/* not as a hand; the swell is what makes it the logo's pen. No width   */
/* is ever under FLOOR (0.4pt): at 2x a 0.25pt tail is half a device    */
/* pixel and smears to pink, which is the accent's one failure mode.    */
/*                                                                      */
/* The numbers are the Pen system's (details/pen/rules.md and the       */
/* penPath() in details/pen/mock/index.html, the version the judges     */
/* scored), with one generalisation: Pen only ever drew a 392pt rule,   */
/* and Ledger's placements also need a 24pt one and vertical ones of    */
/* any length. So the waver keeps Pen's WAVELENGTH (1.3 swells over     */
/* 392pt) rather than its count, and the waver and the lift's flick are */
/* scaled down under FULL (160pt), so a short rule is a tapered dash,   */
/* not a squiggle. At 392pt the output is Pen's mock path, point for    */
/* point, with seed 0.                                                  */
/*                                                                      */
/* POLYGONS ONLY. Pen's mock closed its ends with SVG arcs and drew the */
/* bead with curves; here every end and the bead are flattened to       */
/* points (a 0.2pt cap's arc is six straight edges at any scale a phone */
/* has), so the path data is M, L and Z alone. That keeps one renderer  */
/* honest off the device: scripts/render-details.mjs fills the same     */
/* polygons on a supersampled grid, as build-icons does the logo.       */
/*                                                                      */
/* ONE SOURCE. The app (details/PenMarks.tsx) and the proof script both */
/* import this file. It imports nothing and uses only TypeScript that   */
/* strips to plain JavaScript (no enums, no namespaces, no parameter    */
/* properties), so node runs it as it is. Keep it that way: a mirror in */
/* the script would drift from what ships.                              */
/*                                                                      */
/* THE HAND'S TOOLKIT (v4.9, specs/v4.9/details/spec.md A.2). The pen's */
/* own helpers (stroke, cap, press, catmull, toD, shapeOf, cached, and  */
/* the small sums) are exported as they were, so the v4.9 generators    */
/* (doodlePath, framePath) draw with the identical hand rather than a   */
/* copy of it, and it gains the few they share: place (a baked turn and */
/* move), line (a stroke through hand-placed points), loop, dot, and    */
/* shapeOne, which draws a mark of many strokes as ONE path, so a mark  */
/* is one native view on Fabric. None of it changes a v4.6 mark:        */
/* penRule(392, 0) is still Pen's mock.                                 */
/*                                                                      */
/* DETERMINISTIC. Same arguments, same path, on every device and every  */
/* render: no randomness, no clock. A `seed` turns the waver's phase by */
/* the golden angle, so two placements are not the same stamp, and the  */
/* results are cached by their arguments, so a mark in a list cell (the */
/* feed's closing rule) costs a Map lookup per render, never a rebuild. */
/* ==================================================================== */

export type Pt = [number, number];

/** A mark, ready for an <Svg>. Coordinates are points, in the mark's own frame (see each generator). */
export interface PenShape {
  /** One SVG path per piece, M/L/Z only. Fill each with nonzero, as its own <Path>. */
  d: string[];
  /** The same pieces as polygons, for the off-device renderer. */
  polys: Pt[][];
  /**
   * The ink's box, grown to whole points with half a point spare, in the
   * mark's own frame: the <Svg>'s viewBox, and where the Svg sits against
   * the mark's nominal box (its left and top). Whole points so the Svg's
   * frame never rounds to a different size than its viewBox.
   */
  box: { x: number; y: number; w: number; h: number };
}

/** No width under this, anywhere, in points. */
export const FLOOR = 0.4;

/**
 * Every number the marks are drawn from, in points. The weights are the
 * pen's PRESSURE: where it lands, its peak, where it lifts.
 */
export const PEN = {
  /**
   * A horizontal rule in a nominal box `length` x 6, its centreline 3.4
   * down (Pen's mock). 0.4 -> 1.1 -> 0.4. The waver is 1pt peak to peak
   * at full length, one swell every WAVELENGTH, and the pen lifts with a
   * 2pt flick up over the last 5% (at most 20pt, at least 3).
   */
  rule: {
    height: 6,
    mid: 3.4,
    land: FLOOR,
    peak: 1.1,
    lift: FLOOR,
    waver: 0.5,
    wavelength: 392 / 1.3,
    flick: 2,
    /** At and over this length the waver and the flick are at full size; under it they shrink with the length. */
    full: 160,
  },
  /** The rule standing up: a nominal box 6 x `length`, the centreline 3 in, the lift's flick to the right. */
  vrule: { width: 6, mid: 3 },
  /**
   * Under a tab root's title: 56 x 6 at text scale 1, its length (never
   * its weight) times min(fontScale, 1.3). 0.45 -> 1.25 -> 0.4. Its
   * frame's origin sits 1pt right of the title's left edge and 2pt above
   * the title's line box foot.
   */
  swash: { length: 56, height: 6, land: 0.45, peak: 1.25, lift: FLOOR },
  /**
   * Off the caught plate's bottom edge, 6pt in from its right corner
   * (`inset`), where paint gathers. The run starts 1.5pt inside the plate
   * (`overlap`) so its 3.4pt meniscus merges into the fill, necks to
   * 0.8, and ends in a 2.8pt teardrop bead 8.5pt from where it started.
   */
  drip: { inset: 6, overlap: 1.5, run: 8.5, root: 3.4, neck: 0.8, bead: 1.4 },
} as const;

/**
 * Seeds, one per placement, so each reads as its own stroke. 0 is Pen's
 * mock exactly, kept for the one rule Jan saw drawn on (Home's stories).
 * v4.7 (specs/v4.7/spec.md 6.1) adds two: `board`, the rule between the
 * Tournaments tab's tournaments and its Friends, and `activityEnd`, the
 * short rule closing Activity's list. Only the waver's phase turns with
 * a seed, never the weight, so the new two need no geometry of their own.
 *
 * v4.9 (specs/v4.9/details/spec.md A.2) adds two more for the double
 * rules (framePath's doubleRule): `spec`, ruling the drink page's spec
 * card, and `restHead`, the Dex's "Everything else" head. A double rule
 * draws its lower stroke with `seed + 3`, so 8, 14 and 15 are RESERVED,
 * the lower strokes of `board`, `spec` and `restHead`: never give a
 * placement one of them. Home's doubled stories rule (doubleRule(L,
 * PEN_SEED.stories), spec C.1) draws its lower stroke with 3, `margin`'s
 * number; that is a different generator (penRule, where the margin is
 * penVRule) on a different screen, so nothing ever shows the two strokes
 * together, and its upper stroke stays seed 0, Pen's mock. `activityEnd`
 * retired with Activity's closing rule (v4.9 C.10): its key stays, so
 * its number is never reused.
 */
export const PEN_SEED = {
  stories: 0,
  entry: 1,
  sectionHead: 2,
  margin: 3,
  column: 4,
  board: 5,
  activityEnd: 6,
  spec: 11,
  restHead: 12,
} as const;

/* ------------------------------------------------------------------ */
/* The pen                                                            */
/* ------------------------------------------------------------------ */

/** Points per round end: a half circle as six edges. */
const CAP_STEPS = 6;
const GOLDEN = 2.39996;

export const r2 = (v: number) => Math.round(v * 100) / 100;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Smoothstep from a to b. */
export const smooth = (a: number, b: number, t: number) => {
  const u = clamp01((t - a) / (b - a));
  return u * u * (3 - 2 * u);
};
/** Lengths are drawn to the quarter point, which also bounds the cache. */
export const quarter = (v: number) => Math.round(v * 4) / 4;

/**
 * The outline of a pen stroke: `sample(t)` is the centreline for t in
 * 0..1 and `width(t)` the pen's width there (floored). Left side out,
 * round end, right side back, round start: one closed polygon.
 */
export function stroke(sample: (t: number) => Pt, width: (t: number) => number, n: number): Pt[] {
  const P: Pt[] = [];
  for (let i = 0; i < n; i++) P.push(sample(i / (n - 1)));
  const left: Pt[] = [];
  const right: Pt[] = [];
  const tan: Pt[] = [];
  const half: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)]!;
    const b = P[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    const w = Math.max(FLOOR, width(i / (n - 1))) / 2;
    const p = P[i]!;
    tan.push([dx, dy]);
    half.push(w);
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  const out: Pt[] = [...left];
  // The end: from the left side round the tip to the right side.
  out.push(...cap(P[n - 1]!, tan[n - 1]!, half[n - 1]!, 1));
  for (let i = n - 1; i >= 0; i--) out.push(right[i]!);
  // The start: from the right side round the back to the left side.
  out.push(...cap(P[0]!, tan[0]!, half[0]!, -1));
  return out;
}

/** A round end's inner points: forward (dir 1) from left to right, or back (dir -1) from right to left. */
export function cap(p: Pt, t: Pt, w: number, dir: 1 | -1): Pt[] {
  const nx = -t[1];
  const ny = t[0];
  const pts: Pt[] = [];
  for (let k = 1; k < CAP_STEPS; k++) {
    const th = (Math.PI * k) / CAP_STEPS;
    const c = Math.cos(th) * dir;
    const s = Math.sin(th) * dir;
    pts.push([p[0] + w * (nx * c + t[0] * s), p[1] + w * (ny * c + t[1] * s)]);
  }
  return pts;
}

/** Pen's pressure for the swash: lands at `land`, swells to `peak` by t = at, lifts to `lift`. */
export const press = (land: number, peak: number, lift: number, at = 0.14) => (t: number) =>
  t < at
    ? land + (peak - land) * Math.sin(((t / at) * Math.PI) / 2)
    : lift + (peak - lift) * Math.pow(1 - (t - at) / (1 - at), 0.85);

/** Catmull-Rom through `pts`, for t in 0..1. */
export const catmull = (pts: Pt[]) => (t: number): Pt => {
  const n = pts.length - 1;
  const u = Math.min(t * n, n - 1e-6);
  const i = Math.floor(u);
  const f = u - i;
  const p0 = pts[Math.max(0, i - 1)]!;
  const p1 = pts[i]!;
  const p2 = pts[i + 1]!;
  const p3 = pts[Math.min(n, i + 2)]!;
  const c = (k: 0 | 1) =>
    0.5 *
    (2 * p1[k] +
      (-p0[k] + p2[k]) * f +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f);
  return [c(0), c(1)];
};

/** M/L/Z path data for a polygon. */
export function toD(poly: Pt[]): string {
  let d = '';
  poly.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`;
  });
  return `${d}Z`;
}

export function shapeOf(polys: Pt[][]): PenShape {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const x = Math.floor(x0 - 0.5);
  const y = Math.floor(y0 - 0.5);
  return {
    d: polys.map(toD),
    polys,
    box: { x, y, w: Math.ceil(x1 + 0.5) - x, h: Math.ceil(y1 + 0.5) - y },
  };
}

const cache = new Map<string, PenShape>();
/** One build per key, kept. Typed by what `make` returns, so a shape with extra fields (a signature's nominal box, a numeral's width) keeps them. */
export function cached<S extends PenShape>(key: string, make: () => S): S {
  let s = cache.get(key) as S | undefined;
  if (!s) {
    s = make();
    cache.set(key, s);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Shared by the v4.9 generators (doodlePath, framePath)              */
/*                                                                    */
/* Ported 1:1 from specs/v4.9/details/tools/pen.mjs, where the board  */
/* was drawn with them: placing a drawing, sampling a hand-placed     */
/* stroke, a loop, a dot, and drawing a mark of many strokes as ONE   */
/* path.                                                              */
/* ------------------------------------------------------------------ */

/** A pen's pressure along a stroke, t in 0..1, in points (floored by stroke()). */
export type Width = (t: number) => number;

/** How place() moves a drawing: `rot` degrees about (cx, cy), the centrelines scaled by `s` about the same point, then moved by (dx, dy). */
export interface Placement {
  rot?: number;
  cx?: number;
  cy?: number;
  dx?: number;
  dy?: number;
  s?: number;
}

/** Rotate and place a list of polygons: degrees about (cx, cy), then translate by (dx, dy). */
export function place(polys: Pt[][], { rot = 0, cx = 0, cy = 0, dx = 0, dy = 0, s = 1 }: Placement = {}): Pt[][] {
  const a = (rot * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return polys.map((poly) =>
    poly.map(([x, y]): Pt => {
      const u = (x - cx) * s;
      const v = (y - cy) * s;
      return [cx + u * c - v * sn + dx, cy + u * sn + v * c + dy];
    }),
  );
}

/** Samples for a stroke of a given drawn length: one every ~0.6pt, 16 to 220. */
export const samplesAlong = (len: number) => clamp(Math.round(len / 0.6), 16, 220);

/** The drawn length of a sampled centreline. */
export function lengthOf(sample: (t: number) => Pt, n = 64): number {
  let L = 0;
  let p = sample(0);
  for (let i = 1; i <= n; i++) {
    const q = sample(i / n);
    L += Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
  return L;
}

/** One pen stroke through hand-placed points (Catmull-Rom), with a pressure curve. */
export function line(pts: Pt[], w: Width): Pt[] {
  const s = catmull(pts);
  return stroke(s, w, samplesAlong(lengthOf(s)));
}

/** A hand-drawn loop's ellipse and how the pen goes round it (see loop()). */
export interface LoopSpec {
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
  from?: number;
  sweep?: number;
  spiral?: number;
  wobble?: number;
  seed?: number;
  tilt?: number;
}

/**
 * A hand-drawn loop: an ellipse at (cx, cy) with radii rx, ry, started at
 * `from` degrees and swept `sweep` degrees (over 360 closes past its start,
 * as a pen does), the radius easing by `spiral` (0.95 ends 5% inside) and a
 * slow `wobble` (fraction of the radius, two lobes, phase `seed`).
 */
export function loop(
  { cx, cy, rx, ry = rx, from = -100, sweep = 372, spiral = 0.96, wobble = 0.02, seed = 0, tilt = 0 }: LoopSpec,
  w: Width,
): Pt[] {
  const a0 = (from * Math.PI) / 180;
  const sw = (sweep * Math.PI) / 180;
  const ta = (tilt * Math.PI) / 180;
  const ph = seed * GOLDEN;
  const sample = (t: number): Pt => {
    const a = a0 + sw * t;
    const k = (1 + (spiral - 1) * t) * (1 + wobble * Math.sin(2 * a + ph));
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    return [cx + x * Math.cos(ta) - y * Math.sin(ta), cy + x * Math.sin(ta) + y * Math.cos(ta)];
  };
  return stroke(sample, w, samplesAlong(lengthOf(sample)));
}

/** A filled dot (a pen's touch), flattened to `steps` edges. */
export function dot(cx: number, cy: number, r: number, steps = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Twice the signed area of a polygon (y down: positive is clockwise on screen). */
export function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[(i + 1) % n]!;
    a += x0 * y1 - x1 * y0;
  }
  return a;
}

/**
 * ONE PATH PER MARK (build review, 28 Oct). On Fabric every react-native-svg
 * <Path> is its own native view, so a mark of seven strokes was seven views.
 * Every new mark is drawn as one `d`: each polygon is turned to the same
 * winding (by its signed area) and the subpaths are concatenated, so the
 * default nonzero fill paints exactly their union (overlaps stay filled; a
 * loop's open middle, which its own stroke winds to zero, stays open).
 */
export function oneD(polys: Pt[][]): string {
  return polys.map((p) => toD(signedArea(p) < 0 ? [...p].reverse() : p)).join('');
}

/** shapeOf(), with the polygons drawn as one path (oneD). */
export function shapeOne(polys: Pt[][]): PenShape {
  const s = shapeOf(polys);
  return { ...s, d: [oneD(polys)] };
}

/* ------------------------------------------------------------------ */
/* The marks                                                          */
/* ------------------------------------------------------------------ */

/**
 * The rule's sideways travel off its centreline at t (negative is up for
 * a horizontal rule): the long waver, and the flick as the pen lifts.
 */
function ruleDrift(L: number, seed: number) {
  const R = PEN.rule;
  const k = Math.min(1, L / R.full);
  const amp = R.waver * k;
  const cycles = L / R.wavelength;
  const phase = 0.5 + seed * GOLDEN;
  const flickLen = clamp(0.05 * L, 3, 20);
  const flickFrom = 1 - flickLen / L;
  const rise = R.flick * clamp(k, 0.25, 1);
  return (t: number) => amp * Math.sin(2 * Math.PI * cycles * t + phase) - rise * smooth(flickFrom, 1, t) ** 1.6;
}

/** The rule's pressure: lands and lifts at the floor, the peak held through the middle (Pen's curve). */
function ruleWidth(t: number): number {
  const R = PEN.rule;
  return R.lift + (R.peak - R.lift) * Math.sin(Math.PI * Math.min(1, t * 1.06)) ** 0.45;
}

/** Samples along a rule: Pen's 220 over 392pt (one every 1.78pt), never under 24. */
const samplesFor = (L: number) => clamp(Math.round((L * 220) / 392), 24, 220);

/**
 * A horizontal rule `length` long, drawn left to right. Frame: the
 * nominal box is 0..length x 0..6, the centreline at y 3.4.
 */
export function penRule(length: number, seed = 0): PenShape {
  const L = quarter(length);
  return cached(`h|${L}|${seed}`, () => {
    const drift = ruleDrift(L, seed);
    const mid = PEN.rule.mid;
    return shapeOf([stroke((t) => [L * t, mid + drift(t)], ruleWidth, samplesFor(L))]);
  });
}

/**
 * The same rule standing up, drawn top to bottom; the lift flicks right.
 * Frame: the nominal box is 0..6 x 0..length, the centreline at x 3.
 */
export function penVRule(length: number, seed = 0): PenShape {
  const L = quarter(length);
  return cached(`v|${L}|${seed}`, () => {
    const drift = ruleDrift(L, seed);
    const mid = PEN.vrule.mid;
    return shapeOf([stroke((t) => [mid - drift(t), L * t], ruleWidth, samplesFor(L))]);
  });
}

/**
 * The swash under a tab root's title, `length` long (56 x the capped
 * text scale): a low arc that flicks up at its end, the y's tail at a
 * whisper. Frame: the nominal box is 0..length x 0..6.
 */
export function penSwash(length: number = PEN.swash.length): PenShape {
  const L = quarter(length);
  return cached(`s|${L}`, () => {
    const S = PEN.swash;
    const line = catmull([
      [0, 2.2],
      [L * 0.3, 3.6],
      [L * 0.62, 3.5],
      [L * 0.88, 2.0],
      [L, 0],
    ]);
    return shapeOf([stroke(line, press(S.land, S.peak, S.lift), 72)]);
  });
}

/**
 * The drip, two pieces: the run and the bead (one polygon would cancel
 * itself where they overlap under a nonzero fill if their windings
 * met the other way; two never can). Frame: the origin is the run's top,
 * placed 6pt in from the plate's right corner and 1.5pt above its
 * bottom edge (PEN.drip.inset, .overlap).
 */
export function plateDrip(): PenShape {
  return cached('drip', () => {
    const D = PEN.drip;
    const r = D.bead;
    const cy = D.run - r * 1.08;
    const run = stroke(
      (t) => [0.12 * t, cy * t],
      (t) => D.neck + (D.root - D.neck) * Math.exp(-t * 7),
      48,
    );
    // The teardrop: two cubic shoulders from its point down to the widest, and the lower half of an ellipse.
    const bx = 0.12;
    const top = cy - 2.6 * r;
    const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number, skipFirst: boolean): Pt[] => {
      const out: Pt[] = [];
      for (let i = skipFirst ? 1 : 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        out.push([
          u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ]);
      }
      return out;
    };
    const bead: Pt[] = [
      ...bez([bx, top], [bx + 0.3 * r, cy - 1.7 * r], [bx + r, cy - 0.95 * r], [bx + r, cy], 14, false),
    ];
    for (let i = 1; i < 16; i++) {
      const th = (Math.PI * i) / 16;
      bead.push([bx + r * Math.cos(th), cy + 1.08 * r * Math.sin(th)]);
    }
    bead.push(...bez([bx - r, cy], [bx - r, cy - 0.95 * r], [bx - 0.3 * r, cy - 1.7 * r], [bx, top], 14, false));
    bead.pop(); // the point again: the Z closes it
    return shapeOf([run, bead]);
  });
}
