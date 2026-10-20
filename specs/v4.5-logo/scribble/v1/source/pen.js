// Round-nib paint-pen engine. A stroke is a centreline (runs of key points,
// joined by centripetal Catmull-Rom; a new run = a cusp), stroked with a
// round nib whose width follows taper + pressure, then outlined: every pair
// of consecutive nib stamps becomes their convex hull and Clipper unions
// them all into clean filled outlines (no strokes left in the SVG).
const ClipperLib = require(__dirname + '/node_modules/clipper-lib');
const SCALE = 1000;

function cr(p0, p1, p2, p3, n) {
  // centripetal Catmull-Rom segment p1->p2
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6, 0.5);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = t1 + (t2 - t1) * (i / n);
    const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
    const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
    const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
    out.push(L(B1, B2, t1, t2));
  }
  return out;
}
function runToPolyline(pts) {
  if (pts.length === 2) {
    const out = []; const n = 24;
    for (let i = 0; i < n; i++) out.push([pts[0][0] + (pts[1][0] - pts[0][0]) * i / n, pts[0][1] + (pts[1][1] - pts[0][1]) * i / n]);
    out.push(pts[1]); return out;
  }
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
  let out = [];
  for (let i = 1; i < P.length - 2; i++) out = out.concat(cr(P[i - 1], P[i], P[i + 1], P[i + 2], 24));
  out.push(pts[pts.length - 1]);
  return out;
}
function resample(poly, step) {
  const out = [poly[0]]; let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]; const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let pos = step - carry;
    while (pos <= seg) { const t = pos / seg; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); pos += step; }
    carry = seg - (pos - step);
  }
  const last = poly[poly.length - 1]; const pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.2) out.push(last);
  return out;
}
const smooth = (t) => t * t * (3 - 2 * t);

// s: {runs, w, tin, tout, tinW, toutW, press, widths?:fn(u,len)}
function strokeSamples(s, shear) {
  const k = shear || 0;
  const sk = (p) => [p[0] + (200 - p[1]) * k, p[1]];
  // each run: spline, resample, then a light moving-average (ends pinned)
  // to iron out the knots a hand-placed point list always leaves
  const sm = s.smooth == null ? 7 : s.smooth;
  let pts = [];
  s.runs.forEach((run, i) => {
    let r = resample(runToPolyline(run.map(sk)), 0.8);
    for (let pass = 0; pass < 3 && sm; pass++) {
      r = r.map((p, j) => {
        const h = Math.min(sm, j, r.length - 1 - j); if (!h) return p;
        let x = 0, y = 0; for (let q = j - h; q <= j + h; q++) { x += r[q][0]; y += r[q][1]; }
        return [x / (2 * h + 1), y / (2 * h + 1)];
      });
    }
    pts = pts.concat(i ? r.slice(1) : r);
  });
  pts = resample(pts, 0.8);
  const n = pts.length; const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[n - 1];
  // pressure from direction (down = heavier), smoothed over a window
  const dirW = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
    const dy = b[1] - a[1], len = Math.hypot(b[0] - a[0], dy) || 1;
    return dy / len;
  });
  const win = 14; const pr = dirW.map((_, i) => {
    let sum = 0, c = 0; for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) { sum += dirW[j]; c++; } return sum / c;
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = cum[i];
    let w = s.w * (1 + (s.press == null ? 0.1 : s.press) * pr[i]);
    if (s.tin) w *= (s.tinW ?? 0.55) + (1 - (s.tinW ?? 0.55)) * smooth(Math.min(1, u / s.tin));
    if (s.tout) w *= (s.toutW ?? 0.45) + (1 - (s.toutW ?? 0.45)) * smooth(Math.min(1, (L - u) / s.tout));
    if (s.widths) w = s.widths(u, L, w);
    out.push([pts[i][0], pts[i][1], w / 2]);
  }
  return out;
}
function circle(cx, cy, r, n = 48) {
  const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out;
}
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
const toC = (poly) => poly.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));

// shapes: array of {stroke} or {circle:[cx,cy,r]} or {poly:[[x,y]...]}
function outline(shapes, shear) {
  const c = new ClipperLib.Clipper();
  const add = (poly) => c.AddPath(toC(poly), ClipperLib.PolyType.ptSubject, true);
  for (const sh of shapes) {
    if (sh.circle) { add(circle(...sh.circle, 96)); continue; }
    if (sh.poly) { add(sh.poly); continue; }
    const S = strokeSamples(sh, sh.noShear ? 0 : shear);
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      add(hull(circle(a[0], a[1], a[2], 40).concat(circle(b[0], b[1], b[2], 40))));
    }
    if (S.length === 1) add(circle(S[0][0], S[0][1], S[0][2], 64));
  }
  const sol = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const clean = ClipperLib.Clipper.CleanPolygons(sol, 0.02 * SCALE);
  return clean.filter(p => p.length > 2).map(p => p.map(q => [q.X / SCALE, q.Y / SCALE]));
}
function bbox(polys) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function toPath(polys, tf = (p) => p, dp = 2) {
  const f = (v) => +v.toFixed(dp);
  return polys.map(p => 'M' + p.map(q => { const [x, y] = tf(q); return f(x) + ' ' + f(y); }).join('L') + 'Z').join('');
}
module.exports = { outline, bbox, toPath, strokeSamples };
