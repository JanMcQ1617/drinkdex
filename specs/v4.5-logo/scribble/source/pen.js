// v2 paint-pen engine. Centrelines are hand-placed cubic Beziers (SVG path
// syntax, absolute M/C/L only); a new M inside a stroke is a cusp (the pen
// reverses without lifting). The nib is a slightly flat ellipse held at a
// fixed angle, so curves pick up thick/thin the way a real marker does.
// Every pair of consecutive nib stamps becomes a convex hull, Clipper unions
// them, then a closing (+r,-r) fillets concave joins tangent-smooth and an
// opening (-r,+r) rounds convex nicks. Output: filled outlines only.
const ClipperLib = require(__dirname + '/node_modules/clipper-lib');
const SCALE = 1000;

function parse(d) {
  const tok = d.match(/[MCL]|-?\d*\.?\d+(?:e-?\d+)?/g); const segs = []; let i = 0, cur = null, cmd = null; const runs = [];
  let run = null;
  while (i < tok.length) {
    if (/[MCL]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { cur = [+tok[i], +tok[i + 1]]; i += 2; run = []; runs.push({ start: cur, segs: run }); cmd = 'L'; continue; }
    if (cmd === 'L') { const p = [+tok[i], +tok[i + 1]]; i += 2; run.push(['L', cur, p]); cur = p; continue; }
    if (cmd === 'C') { const a = [+tok[i], +tok[i + 1]], b = [+tok[i + 2], +tok[i + 3]], p = [+tok[i + 4], +tok[i + 5]]; i += 6; run.push(['C', cur, a, b, p]); cur = p; continue; }
  }
  return runs;
}
function sampleSeg(s, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (s[0] === 'L') out.push([s[1][0] + (s[2][0] - s[1][0]) * t, s[1][1] + (s[2][1] - s[1][1]) * t]);
    else { const [, p0, p1, p2, p3] = s, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); }
  }
  return out;
}
function resample(poly, step) {
  const out = [poly[0]]; let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]; const seg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!seg) continue;
    let pos = step - carry;
    while (pos <= seg) { const t = pos / seg; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); pos += step; }
    carry = seg - (pos - step);
  }
  const last = poly[poly.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.25) out.push(last);
  return out;
}
const smooth = (t) => t * t * (3 - 2 * t);

// stroke: {d, w, tin, tout, tinW, toutW, press, widths?(u,L,w)}; tf maps a
// design-space point to output space (shear etc.)
function samples(s, tf) {
  let pts = [];
  for (const run of parse(s.d)) {
    let r = [];
    for (const seg of run.segs) { const p = sampleSeg(seg, 80); r = r.concat(r.length ? p.slice(1) : p); }
    r = r.map(tf);
    pts = pts.concat(pts.length ? r.slice(1) : r);
  }
  pts = resample(pts, 0.5);
  const n = pts.length, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[n - 1];
  const dir = pts.map((p, i) => { const a = pts[Math.max(0, i - 3)], b = pts[Math.min(n - 1, i + 3)]; const dy = b[1] - a[1]; return dy / (Math.hypot(b[0] - a[0], dy) || 1); });
  const win = 24; const pr = dir.map((_, i) => { let s2 = 0, c = 0; for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) { s2 += dir[j]; c++; } return s2 / c; });
  return pts.map((p, i) => {
    const u = cum[i]; let w = s.w * (1 + (s.press ?? 0.08) * pr[i]);
    if (s.tin) w *= (s.tinW ?? 0.6) + (1 - (s.tinW ?? 0.6)) * smooth(Math.min(1, u / s.tin));
    if (s.tout) w *= (s.toutW ?? 0.45) + (1 - (s.toutW ?? 0.45)) * smooth(Math.min(1, (L - u) / s.tout));
    if (s.widths) w = s.widths(u, L, w);
    return [p[0], p[1], w / 2];
  });
}
function nib(cx, cy, r, ratio, ang, n = 40) {
  const out = [], c = Math.cos(ang), s = Math.sin(ang);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = r * Math.cos(a), y = r * ratio * Math.sin(a); out.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return out;
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
const fromC = (paths) => paths.filter(p => p.length > 2).map(p => p.map(q => [q.X / SCALE, q.Y / SCALE]));

// Stamp a sample list ([x,y,r]) into hull polygons. ratio/ang: nib shape.
function stampHulls(S, ratio = 1, ang = 0, n = +(process.env.NIBN || 72)) {
  const polys = [];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1];
    polys.push(hull(nib(a[0], a[1], a[2], ratio, ang, n).concat(nib(b[0], b[1], b[2], ratio, ang, n))));
  }
  if (S.length === 1) polys.push(nib(S[0][0], S[0][1], S[0][2], ratio, ang, 72));
  return polys;
}
function union(polys) {
  const c = new ClipperLib.Clipper();
  for (const p of polys) c.AddPath(toC(p), ClipperLib.PolyType.ptSubject, true);
  const sol = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromC(sol);
}
function offset(polys, delta) {
  const co = new ClipperLib.ClipperOffset(2, 0.01 * SCALE);
  co.AddPaths(polys.map(toC), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const sol = new ClipperLib.Paths(); co.Execute(sol, delta * SCALE); return fromC(sol);
}
// closing fillets concave corners (radius rc); opening rounds convex nicks (ro)
function refine(polys, rc, ro) {
  let p = polys;
  if (rc) p = offset(offset(p, rc), -rc);
  if (ro) p = offset(offset(p, -ro), ro);
  return fromC(ClipperLib.Clipper.CleanPolygons(p.map(toC), 0.01 * SCALE));
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
function clip(a, b, type) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(a.map(toC), ClipperLib.PolyType.ptSubject, true); c.AddPaths(b.map(toC), ClipperLib.PolyType.ptClip, true);
  const sol = new ClipperLib.Paths(); c.Execute(type, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero); return fromC(sol);
}
// fillet concave corners only inside the given region (e.g. a drip junction)
function localFillet(polys, r, region) {
  const closed = offset(offset(polys, r), -r);
  return clip(polys, clip(closed, region, ClipperLib.ClipType.ctIntersection), ClipperLib.ClipType.ctUnion);
}
module.exports = { clip, localFillet, parse, samples, stampHulls, union, refine, offset, bbox, toPath, nib };
