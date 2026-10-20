// v2 centrelines for the "Marker tag" Sipply, as hand-placed cubic Beziers.
// Upright design space, y down: baseline 200, x-height top 100, ascender
// ~28, descender ~262. A forward shear K is applied to centrelines only.
const P = require(__dirname + '/pen.js');
const K = 0.2;                       // ~11 deg forward slant
const NIB = { ratio: 0.8, ang: -0.62 }; // slightly flat nib, ~35 deg (thick on the down-left diagonal)
const shear = (x0 = 0, y0 = 0) => ([x, y]) => [x + x0 + (200 - y) * K, y + y0];

// --- the s (shared by icon and wordmark) -----------------------------------
// pen lands just outside the top-right (paint pools there), sweeps left over
// a compact top, down the spine, round the bowl, and flicks off to a point.
const S_D = 'M 82 106 C 76 97, 54 93, 36 97 C 17 101, 10 119, 24 132 C 38 145, 66 152, 67 175 C 68 197, 48 206, 28 204 C 14 203, 2 197, -10 187';
// the pen-down pools: ~14% fatter at the landing, settling within ~10 units
const sStroke = (w, x0 = 0, y0 = 0, pool = 0.14) => ({ d: S_D, w, tin: 0, tout: 52, toutW: 0.06, press: 0.1, x0, y0,
  widths: (u, L, wv) => wv * (1 + pool * Math.exp(-u / 9)) });
const S_LAND = [82, 106];

// --- a paint drip ----------------------------------------------------------
// leaves the stroke full width (the closing pass fillets that join tangent),
// necks to ~62% of the stroke, then swells evenly into a teardrop tip.
function dripSamples(x, top, len, W, neck = 0.62, bead = 0.8, ex = 1.8) {
  const out = []; const n = Math.max(2, Math.round(len / 0.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = t * len;
    let f;
    if (t < 0.22) { const k = t / 0.22; f = 0.95 + (neck - 0.95) * (1 - Math.pow(1 - k, 2)); }
    else { const k = (t - 0.22) / 0.78; f = neck + (bead - neck) * Math.pow(k, ex); }
    out.push([x, top + u, (W * f) / 2]);
  }
  return out;
}

// --- wordmark --------------------------------------------------------------
// each letter sits a hair up or down; a hand never holds a baseline
const BOUNCE = { s: 0, i: -3, p1: 2, p2: -2, l: 1, y: -1 };
function p(x, tick) {
  return [
    // stem: (p2 only) a short entry tick up into the top, cusp, then down
    // to the descender with a long, even taper
    tick
      ? { d: `M ${x - 14} 124 C ${x - 9} 114, ${x - 4} 106, ${x} 100 M ${x} 100 C ${x - 1} 150, ${x - 2} 215, ${x - 3} 262`, tin: 14, tinW: 0.55, tout: 64, toutW: 0.42 }
      : { d: `M ${x} 100 C ${x - 1} 150, ${x - 2} 215, ${x - 3} 262`, tin: 0, tout: 64, toutW: 0.42 },
    // bowl: out of the stem, over, round, and back to finish inside the stem
    { d: `M ${x + 1} 132 C ${x + 7} 110, ${x + 20} 99, ${x + 31} 99 C ${x + 43} 99, ${x + 48} 114, ${x + 46} 136 C ${x + 44} 166, ${x + 30} 198, ${x + 14} 200 C ${x + 8} 200, ${x + 5} 196, ${x + 3} 189`, tin: 0, tout: 0 },
  ];
}
const X_P2 = 234, X_L = 18; // p2 stem, and how far l + y sit right of the v2a layout
function wordStrokes(W) {
  const L = [];
  const add = (key, arr) => arr.forEach(s => L.push({ w: W, press: 0.1, ...s, y0: BOUNCE[key] }));
  const sx = (d, dx) => d.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (m, x, y) => `${+x + dx} ${y}`);
  add('s', [{ ...sStroke(W), x0: -12 }]);
  // i: short entry, stem, exit rising straight into p1's stem (cusp)
  add('i', [{ d: 'M 96 126 C 99 117, 102 109, 105 100 M 105 100 C 103 135, 99 168, 101 184 C 102 196, 110 202, 120 198 C 134 192, 144 150, 152 100', tin: 12, tinW: 0.55, tout: 0 }]);
  add('p1', p(152, false));
  add('p2', p(X_P2, false)); // a clean pen-down at the top; it abuts p1's bowl
  // l: the pen lifts after p2 and flicks in from the baseline: an open loop,
  // stem, exit into y
  add('l', [{ d: sx('M 274 196 C 286 188, 298 170, 306 148 C 313 124, 320 100, 323 70 C 325 46, 320 29, 309 28 C 297 27, 289 40, 288 64 C 287 96, 287 140, 288 172 C 289 194, 299 203, 313 200 C 325 197, 333 184, 338 168', X_L), tin: 22, tinW: 0.4, tout: 0 }]);
  // y: entry, u-shape, cusp, descender, swash back left under the l
  add('y', [{ d: sx('M 338 168 C 341 150, 343 124, 345 100 M 345 100 C 343 140, 341 176, 349 192 C 356 204, 373 203, 382 190 C 391 176, 395 140, 398 100 M 398 100 C 396 160, 395 214, 387 236 C 379 256, 357 266, 331 266 C 311 266, 293 262, 275 255', X_L), tin: 0, tout: 64, toutW: 0.06 }]);
  return L;
}
function wordmark(W = 21, { drip = true } = {}) {
  const polys = [];
  for (const s of wordStrokes(W)) polys.push(...P.stampHulls(P.samples(s, shear(s.x0 || 0, s.y0 || 0)), NIB.ratio, NIB.ang));
  // i dot: a dab, slightly oval along the nib
  const [dx, dy] = shear(0, BOUNCE.i)([110, 66]);
  polys.push(P.nib(dx, dy, W * 0.6, NIB.ratio + 0.08, NIB.ang, 72));
  let out = P.union(polys);
  if (drip) {
    // one drip off the swash where it is still full width; filleted in
    const [qx, qy] = shear(0, BOUNCE.y)([350 + X_L, 265]);
    out = P.union(out.concat(P.stampHulls(dripSamples(qx, qy, 32, W * 0.62, 0.72, 0.98, 2.6))));
    out = P.localFillet(out, W * 0.7, [P.nib(qx, qy + W * 0.6, W * 0.85, 1, 0, 64)]);
  }
  return P.refine(out, W * 0.1, W * 0.06);
}

// --- icon mark -------------------------------------------------------------
// The s is outlined in its own frame, then turned by ROT (the tag is thrown
// at an angle), while the drip is added afterwards in screen space so it
// always falls plumb: gravity doesn't rotate with the letter.
function mark(W = 25, { rot = 9, dripLen = 56, neck = 0.5, bead = 0.92, ex = 3 } = {}) {
  const tf = shear();
  const body = P.union(P.stampHulls(P.samples(sStroke(W), tf), NIB.ratio, NIB.ang));
  const bb = P.bbox(body); const cx = bb.x0 + bb.w / 2, cy = bb.y0 + bb.h / 2;
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const R = ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  const rb = body.map(p => p.map(R));
  const [lx, ly] = R(tf(S_LAND));
  const drip = P.stampHulls(dripSamples(lx + 0.5, ly + 2, dripLen, W, neck, bead, ex));
  const raw = P.union(rb.concat(drip));
  const region = [P.nib(lx, ly + W * 0.5, W * 0.76, 1, 0, 96)];
  const all = P.refine(P.localFillet(raw, W * 0.48, region), W * 0.1, W * 0.1);
  return { all, body: P.refine(rb, 0, W * 0.05) };
}
// --- clean icon s (v2.1, 20 Oct 2026) --------------------------------------
// Jan's "Marker tag, cleaner icon": the icon is the wordmark's own s with no
// drip (beside the s the drip read as "S!" / "Sl" at home-screen size). Same
// centreline, nib, pen-down pool and weight as the wordmark's s, same
// clean-up pass as the wordmark. rot turns the outlined letter about its bbox
// centre (the tag thrown on); rot 0 is the wordmark's own angle.
// land: radius (in strokes) of a local fillet where the pool settles into the
// stroke; at icon size the bare pool leaves a crease under the landing.
function cleanMark(W = 21, { rot = 0, pool = 0.14, land = 0 } = {}) {
  const tf = shear();
  const body = P.union(P.stampHulls(P.samples(sStroke(W, 0, 0, pool), tf), NIB.ratio, NIB.ang));
  const bb = P.bbox(body); const cx = bb.x0 + bb.w / 2, cy = bb.y0 + bb.h / 2;
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const R = ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  let out = body.map(p => p.map(R));
  if (land) { const [lx, ly] = R(tf(S_LAND)); out = P.localFillet(out, W * land, [P.nib(lx, ly, W * 1.1, 1, 0, 96)]); }
  return P.refine(out, W * 0.1, W * 0.06);
}
module.exports = { K, wordmark, mark, cleanMark, wordStrokes, shear, NIB };
