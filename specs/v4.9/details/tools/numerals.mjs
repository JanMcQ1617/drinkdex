/* ==================================================================== */
/* v4.9 outlined numerals: Inter 600's figures as hairline rings        */
/*                                                                      */
/* Port target: src/components/details/numeralPath.ts, reading the      */
/* GENERATED glyph table src/components/details/numeralGlyphs.ts (the   */
/* same data as tools/glyphs.json; spec A.3).                           */
/*                                                                      */
/* PRESS, NOT PEN. A printed outline face (the way a menu or a magazine */
/* sets a big hollow figure), so its line is UNIFORM, `ring` pt, and    */
/* grey (colors.rule): it is the printer's, not the hand's. It is still */
/* drawn the pen's way, as FILLED polygons and never a strokeWidth: each */
/* contour of the glyph is offset out and in by ring/2 (mitred, the     */
/* mitre capped at 2x) and the inner offset is reversed, so a nonzero   */
/* fill paints exactly the ring. M/L/Z only; deterministic; cached.     */
/*                                                                      */
/* `d` is ONE path for the whole figure (build review, 28 Oct: a path   */
/* per ring was 7 to 11 native views for "0100"): each ring is its      */
/* outer offset plus its reversed inner one, and rings never overlap    */
/* (Inter 600's stems are 5pt and more at every cap drawn, the ring 1), */
/* so the default nonzero fill paints exactly the rings.                */
/*                                                                      */
/* DECIMATED. The font's curves are flattened finely once (1/96 em, in  */
/* glyphs.json); each contour is then simplified at the size it is      */
/* drawn (Ramer-Douglas-Peucker, 0.05pt), which is under a sixth of a   */
/* device pixel at 3x and cuts "0" from 506 points to a few dozen.      */
/*                                                                      */
/* NEVER THROWS. A character the table lacks is skipped (no ink, no     */
/* advance): the app's port must never throw during a render. The table */
/* holds 0-9, N, º and the space; render-details checks that every text */
/* the app sets is covered.                                             */
/*                                                                      */
/* Frame: the nominal box is the set's advance width x `cap` pt, its    */
/* top on the cap height and its bottom on the baseline, so a caller    */
/* aligns the figure's caps and baseline, never its ink.                */
/* ==================================================================== */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cached, shapeOf, toD } from './pen.mjs';

const G = JSON.parse(readFileSync(fileURLToPath(new URL('./glyphs.json', import.meta.url)), 'utf8'));

export const NUMERAL = {
  /** The ring's width, pt, at every size: a hairline, never scaled with the figure (1.0 after judging: 0.75 vanished). */
  ring: 1,
  /** Decimation tolerance, pt at the drawn size. */
  eps: 0.05,
  /** Display tracking, in em: big figures set a touch tight. */
  track: -0.02,
  /** The mitre's cap, as a multiple of ring/2. */
  mitre: 2,
};

/** Offset a closed polygon (y down) by d along each vertex's mitred left normal. */
function offset(poly, d) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[(i - 1 + n) % n];
    const c = poly[i];
    const q = poly[(i + 1) % n];
    let ax = c[0] - p[0];
    let ay = c[1] - p[1];
    let bx = q[0] - c[0];
    let by = q[1] - c[1];
    const la = Math.hypot(ax, ay) || 1;
    const lb = Math.hypot(bx, by) || 1;
    ax /= la;
    ay /= la;
    bx /= lb;
    by /= lb;
    // Left normals of the two edges, averaged: the mitre's direction.
    const n1 = [-ay, ax];
    const n2 = [-by, bx];
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const lm = Math.hypot(mx, my) || 1;
    mx /= lm;
    my /= lm;
    const cos = mx * n1[0] + my * n1[1];
    const k = Math.min(NUMERAL.mitre, 1 / Math.max(cos, 1e-3));
    out.push([c[0] + mx * d * k, c[1] + my * d * k]);
  }
  return out;
}

/** Drop points closer than `eps` to the previous one (flattened curves meet their line ends). */
function tidy(poly, eps = 0.05) {
  const out = [];
  for (const p of poly) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > eps) out.push(p);
  }
  const f = out[0];
  const l = out[out.length - 1];
  if (out.length > 2 && Math.hypot(f[0] - l[0], f[1] - l[1]) <= eps) out.pop();
  return out;
}

/** Ramer-Douglas-Peucker on a closed polygon: keep the points more than eps off the chord. */
function simplify(poly, eps) {
  if (poly.length < 8) return poly;
  // Split the ring at its first point and the point farthest from it, and simplify each open half.
  const far = poly.reduce((best, p, i) => {
    const d = Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]);
    return d > best.d ? { d, i } : best;
  }, { d: -1, i: 0 }).i;
  const open = (pts) => {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      const L = Math.hypot(bx - ax, by - ay) || 1e-9;
      let dmax = 0;
      let at = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
        if (d > dmax) {
          dmax = d;
          at = i;
        }
      }
      if (dmax > eps && at > 0) {
        keep[at] = 1;
        stack.push([a, at], [at, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const first = open(poly.slice(0, far + 1));
  const second = open([...poly.slice(far), poly[0]]);
  return [...first, ...second.slice(1, -1)];
}

/**
 * `text` (digits, N, º and the space) as outlined figures with cap height `cap`
 * pt. Returns a PenShape plus `width`, the set's nominal width (its
 * advances, tracked; the last glyph untracked).
 */
export function numeral(text, cap, ring = NUMERAL.ring) {
  return cached(`num|${text}|${cap}|${ring}`, () => {
    const k = cap / G.capHeight;
    const track = NUMERAL.track * G.unitsPerEm;
    const polys = [];
    const rings = [];
    let x = 0;
    [...text].forEach((ch, i) => {
      const g = G.glyphs[ch];
      if (!g) return;
      for (const contour of g.contours) {
        const poly = simplify(tidy(contour.map(([u, v]) => [(x + u) * k, (G.capHeight - v) * k])), NUMERAL.eps);
        if (poly.length < 3) continue;
        const outer = offset(poly, ring / 2);
        const inner = offset(poly, -ring / 2).reverse();
        polys.push(outer, inner);
        // ONE path per ring: the outer offset and the reversed inner one wind opposite ways, so nonzero paints the ring alone.
        rings.push(toD(outer) + toD(inner));
      }
      x += g.advance + (i < text.length - 1 ? track : 0);
    });
    const shape = shapeOf(polys.length ? polys : [[[0, 0], [0.01, 0], [0, 0.01]]]);
    return { ...shape, d: [rings.join('')], width: x * k, cap, points: polys.reduce((n, p) => n + p.length, 0) };
  });
}

/** The ratio of a glyph set's nominal width to its cap height, for layout sums without building it. */
export function numeralWidth(text, cap) {
  const k = cap / G.capHeight;
  const track = NUMERAL.track * G.unitsPerEm;
  return [...text].reduce((w, ch, i) => w + (G.glyphs[ch]?.advance ?? 0) + (i < text.length - 1 ? track : 0), 0) * k;
}
