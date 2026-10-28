/* ==================================================================== */
/* v4.9 details: the pen's shared toolkit for the new generators        */
/*                                                                      */
/* The existing marks come straight from the app's own geometry         */
/* (src/components/details/penPath.ts, imported, never mirrored), the   */
/* way scripts/render-details.mjs does it. The new generators need the  */
/* pen's private helpers (stroke, cap, press, catmull, shapeOf, cached),*/
/* which penPath.ts does not export today. They are copied here         */
/* VERBATIM from penPath.ts so the new marks are drawn by the identical */
/* hand.                                                                */
/*                                                                      */
/* PORT (foundation package, spec F): penPath.ts EXPORTS these helpers  */
/* (no change to their code), this file's copies are deleted, and       */
/* doodles.mjs / frames.mjs / numerals.mjs become                       */
/* src/components/details/doodlePath.ts and framePath.ts, importing     */
/* them from './penPath'. Plain JS here, erasable TS there: the code    */
/* ports 1:1 by adding types.                                           */
/* ==================================================================== */

export {
  PEN,
  PEN_SEED,
  FLOOR,
  penRule,
  penVRule,
  penSwash,
  plateDrip,
} from '../../../../src/components/details/penPath.ts';
import { FLOOR } from '../../../../src/components/details/penPath.ts';

export const CAP_STEPS = 6;
export const GOLDEN = 2.39996;

export const r2 = (v) => Math.round(v * 100) / 100;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smooth = (a, b, t) => {
  const u = clamp01((t - a) / (b - a));
  return u * u * (3 - 2 * u);
};
export const quarter = (v) => Math.round(v * 4) / 4;

/** penPath.ts stroke(), verbatim. */
export function stroke(sample, width, n) {
  const P = [];
  for (let i = 0; i < n; i++) P.push(sample(i / (n - 1)));
  const left = [];
  const right = [];
  const tan = [];
  const half = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    const w = Math.max(FLOOR, width(i / (n - 1))) / 2;
    const p = P[i];
    tan.push([dx, dy]);
    half.push(w);
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  const out = [...left];
  out.push(...cap(P[n - 1], tan[n - 1], half[n - 1], 1));
  for (let i = n - 1; i >= 0; i--) out.push(right[i]);
  out.push(...cap(P[0], tan[0], half[0], -1));
  return out;
}

/** penPath.ts cap(), verbatim. */
export function cap(p, t, w, dir) {
  const nx = -t[1];
  const ny = t[0];
  const pts = [];
  for (let k = 1; k < CAP_STEPS; k++) {
    const th = (Math.PI * k) / CAP_STEPS;
    const c = Math.cos(th) * dir;
    const s = Math.sin(th) * dir;
    pts.push([p[0] + w * (nx * c + t[0] * s), p[1] + w * (ny * c + t[1] * s)]);
  }
  return pts;
}

/** penPath.ts press(), verbatim. */
export const press = (land, peak, lift, at = 0.14) => (t) =>
  t < at
    ? land + (peak - land) * Math.sin(((t / at) * Math.PI) / 2)
    : lift + (peak - lift) * Math.pow(1 - (t - at) / (1 - at), 0.85);

/** penPath.ts catmull(), verbatim. */
export const catmull = (pts) => (t) => {
  const n = pts.length - 1;
  const u = Math.min(t * n, n - 1e-6);
  const i = Math.floor(u);
  const f = u - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const c = (k) =>
    0.5 *
    (2 * p1[k] +
      (-p0[k] + p2[k]) * f +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f);
  return [c(0), c(1)];
};

/** penPath.ts toD(), verbatim. */
export function toD(poly) {
  let d = '';
  poly.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`;
  });
  return `${d}Z`;
}

/** penPath.ts shapeOf(), verbatim. */
export function shapeOf(polys) {
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

const cache = new Map();
/** penPath.ts cached(), verbatim. */
export function cached(key, make) {
  let s = cache.get(key);
  if (!s) {
    s = make();
    cache.set(key, s);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* New, shared by the v4.9 generators (they go into penPath.ts too)    */
/* ------------------------------------------------------------------ */

/** Rotate and place a list of polygons: degrees about (cx, cy), then translate by (dx, dy). */
export function place(polys, { rot = 0, cx = 0, cy = 0, dx = 0, dy = 0, s = 1 } = {}) {
  const a = (rot * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return polys.map((poly) =>
    poly.map(([x, y]) => {
      const u = (x - cx) * s;
      const v = (y - cy) * s;
      return [cx + u * c - v * sn + dx, cy + u * sn + v * c + dy];
    }),
  );
}

/** Samples for a stroke of a given drawn length: one every ~0.6pt, 16 to 220. */
export const samplesAlong = (len) => clamp(Math.round(len / 0.6), 16, 220);

/** The drawn length of a sampled centreline. */
export function lengthOf(sample, n = 64) {
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
export function line(pts, w) {
  const s = catmull(pts);
  return stroke(s, w, samplesAlong(lengthOf(s)));
}

/**
 * A hand-drawn loop: an ellipse at (cx, cy) with radii rx, ry, started at
 * `from` degrees and swept `sweep` degrees (over 360 closes past its start,
 * as a pen does), the radius easing by `spiral` (0.95 ends 5% inside) and a
 * slow `wobble` (fraction of the radius, two lobes, phase `seed`).
 */
export function loop({ cx, cy, rx, ry = rx, from = -100, sweep = 372, spiral = 0.96, wobble = 0.02, seed = 0, tilt = 0 }, w) {
  const a0 = (from * Math.PI) / 180;
  const sw = (sweep * Math.PI) / 180;
  const ta = (tilt * Math.PI) / 180;
  const ph = seed * GOLDEN;
  const sample = (t) => {
    const a = a0 + sw * t;
    const k = (1 + (spiral - 1) * t) * (1 + wobble * Math.sin(2 * a + ph));
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    return [cx + x * Math.cos(ta) - y * Math.sin(ta), cy + x * Math.sin(ta) + y * Math.cos(ta)];
  };
  return stroke(sample, w, samplesAlong(lengthOf(sample)));
}

/** A filled dot (a pen's touch), flattened to `steps` edges. */
export function dot(cx, cy, r, steps = 10) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Twice the signed area of a polygon (y down: positive is clockwise on screen). */
export function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
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
export function oneD(polys) {
  return polys.map((p) => toD(signedArea(p) < 0 ? [...p].reverse() : p)).join('');
}

/** shapeOf(), with the polygons drawn as one path (oneD). */
export function shapeOne(polys) {
  const s = shapeOf(polys);
  return { ...s, d: [oneD(polys)] };
}
