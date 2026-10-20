// v2.1 final set: the clean icon s (no drip) and every raster/vector the app
// needs. Writes SVGs plus OUT/polys.json, which raster.py turns into PNGs.
//   node source/final.js <outdir>              the final set (variant FINAL)
//   node source/final.js <outdir> --variants   the A/B/C comparison geometry
// Needs clipper-lib@6.4.2 in source/node_modules (not committed).
const fs = require('fs');
const P = require(__dirname + '/pen.js');
const G = require(__dirname + '/glyphs.js');
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const RED = '#D0102C', INK = '#0A0A0A', WHITE = '#FFFFFF';
const W_WORD = 21; // the wordmark's stroke: the icon s uses the same weight

// Variants. fill = the s's larger bbox side as a share of the tile. 0.615 is
// the s body's size in the v2 (drip) icon; C variants take the room the drip
// no longer needs.
const VARIANTS = {
  A: { rot: 9, fill: 0.615, land: 0.5, label: 'A  tilted 9°, pool, v2 size' },
  B: { rot: 0, fill: 0.615, land: 0.5, label: 'B  upright (wordmark angle), v2 size' },
  C9: { rot: 9, fill: 0.70, land: 0.5, label: 'C  tilted 9°, scaled up' },
  C0: { rot: 0, fill: 0.70, land: 0.5, label: 'C  upright, scaled up' },
};
const FINAL = 'C9';
// optical centre: halfway between the area centroid and the bbox centre. The
// centroid alone sits the s low and left (the pooled pen-down pulls it high
// and right; the tail's taper carries almost no mass but sets the bbox), the
// bbox centre alone sits it high-left of balance. That point goes a hair
// (0.8% of the tile) above the middle. Judged on the C9 tile at 400 and 60 px.
const LIFT = +(process.env.LIFT || 0.008);
function optical(m) { const b = P.bbox(m), [gx, gy] = centroid(m); return [(gx + b.x0 + b.w / 2) / 2, (gy + b.y0 + b.h / 2) / 2]; }

function centroid(ps) {
  let A = 0, X = 0, Y = 0;
  for (const p of ps) for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; const c = x1 * y2 - x2 * y1;
    A += c; X += (x1 + x2) * c; Y += (y1 + y2) * c;
  }
  return [X / (3 * A), Y / (3 * A)];
}
// place the s: larger bbox side = size px, optical centre at (cx, cy)
function place(m, size, cx, cy) {
  const b = P.bbox(m), [gx, gy] = optical(m), sc = size / Math.max(b.w, b.h);
  const tf = ([x, y]) => [cx + (x - gx) * sc, cy + (y - gy) * sc];
  return m.map(p => p.map(tf));
}
// largest distance from (cx, cy) to any outline point, in units of the s
function reach(m, size) {
  const b = P.bbox(m), [gx, gy] = optical(m), sc = size / Math.max(b.w, b.h);
  let r = 0; for (const p of m) for (const [x, y] of p) r = Math.max(r, Math.hypot(x - gx, y - gy) * sc);
  return r;
}
const bb = (ps) => { const b = P.bbox(ps); return [b.x0, b.y0, b.x1, b.y1].map(v => +v.toFixed(1)); };

const polys = {};
if (process.argv.includes('--variants')) {
  for (const [k, v] of Object.entries(VARIANTS)) {
    const m = G.cleanMark(W_WORD, { rot: v.rot, land: v.land || 0 });
    polys[k] = { label: v.label, rot: v.rot, icon: place(m, 1024 * v.fill, 512, 512 - 1024 * LIFT) };
    console.log(k, 'icon bbox', bb(polys[k].icon).join(' '));
  }
  fs.writeFileSync(OUT + '/polys.json', JSON.stringify(polys));
  process.exit(0);
}

const V = VARIANTS[FINAL];
const m = G.cleanMark(W_WORD, { rot: V.rot, land: V.land || 0 });
const icon = place(m, 1024 * V.fill, 512, 512 - 1024 * LIFT);
// splash: the s alone on a transparent 1024 canvas, optically centred. The app
// draws it 220 pt wide on #FFFFFF, so SPLASH 0.56 makes the s ~123 pt: the
// v2 splash's on-screen size (its s + drip spanned 556 px of 1024), which the
// intro film was planned around. At the tile's 0.70 it would be ~154 pt.
const SPLASH = +(process.env.SPLASH || 0.56);
const splash = place(m, 1024 * SPLASH, 512, 512 - 1024 * LIFT);
// Android adaptive: 108 dp canvas, 66 dp safe circle (radius 313 px of 1024).
// The s's farthest point sits at 296 px from the centre: inside with margin.
const SAFE_R = 1024 * (66 / 108) / 2, R_USE = SAFE_R * 0.945;
const aSize = 1024 * V.fill * (R_USE / reach(m, 1024 * V.fill));
const android = place(m, aSize, 512, 512 - 1024 * LIFT);

// vectors: square viewBox centred on the optical centre, 4% air
{
  const b = P.bbox(m), [gx, gy] = optical(m);
  const half = Math.max(gx - b.x0, b.x1 - gx, gy - b.y0, b.y1 - gy) * 1.04;
  const vb = [gx - half, gy - half, 2 * half, 2 * half].map(v => +v.toFixed(2));
  const d = P.toPath(m);
  const svg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="512" height="512"><title>Sipply</title><path fill="${fill}" d="${d}"/></svg>\n`;
  fs.writeFileSync(OUT + '/mark.svg', svg(RED));
  fs.writeFileSync(OUT + '/mark-white.svg', svg(WHITE));
  fs.writeFileSync(OUT + '/mark-ink.svg', svg(INK));
  const ip = P.toPath(icon, (p) => p, 1);
  fs.writeFileSync(OUT + '/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><title>Sipply</title><rect width="1024" height="1024" fill="${RED}"/><path fill="${WHITE}" d="${ip}"/></svg>\n`);
}
const reachPx = reach(m, aSize);
// for the intro film: how design units map onto the splash canvas, and the
// point the 9 degree turn pivots on (the upright s's bbox centre)
const spB = P.bbox(m), [ogx, ogy] = optical(m), spSc = 1024 * SPLASH / Math.max(spB.w, spB.h);
const up = P.bbox(G.cleanMark(W_WORD, { rot: 0, land: V.land || 0 }));
const toSplash = ([x, y]) => [512 + (x - ogx) * spSc, 512 - 1024 * LIFT + (y - ogy) * spSc];
const pivot = toSplash([up.x0 + up.w / 2, up.y0 + up.h / 2]).map(v => +v.toFixed(1));
const geom = {
  variant: FINAL, rot: V.rot, fill: V.fill, splash_fill: SPLASH, lift: LIFT, stroke: W_WORD,
  icon_bbox: bb(icon), splash_bbox: bb(splash), android_bbox: bb(android),
  android_reach_px: +reachPx.toFixed(1), android_safe_r_px: +SAFE_R.toFixed(1),
  optical_centre_px: [512, +(512 - 1024 * LIFT).toFixed(1)],
  splash_px_per_unit: +spSc.toFixed(4), splash_pivot_px: pivot,
  splash_design_to_px: `x' = 512 + (x - ${ogx.toFixed(3)}) * ${spSc.toFixed(4)}, y' = ${(512 - 1024 * LIFT).toFixed(2)} + (y - ${ogy.toFixed(3)}) * ${spSc.toFixed(4)} (rotated-s design units)`,
};
fs.writeFileSync(OUT + '/polys.json', JSON.stringify({ icon, splash, android }));
fs.writeFileSync(OUT + '/geom.json', JSON.stringify(geom, null, 1) + '\n');
console.log(JSON.stringify(geom));
