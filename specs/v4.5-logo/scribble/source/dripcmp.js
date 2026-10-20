const fs = require('fs'); const P = require(__dirname + '/pen.js'); const G = require(__dirname + '/glyphs.js');
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const V = [[0.64, 0.9, 52, 2.4], [0.5, 0.92, 56, 3], [0.42, 0.88, 58, 3.2], [0.5, 1.0, 48, 3]];
let h = '';
V.forEach(([neck, bead, len, ex], i) => {
  const m = G.mark(25, { rot: 9, neck, bead, dripLen: len, ex }).all; const b = P.bbox(m); const s = Math.max(b.w, b.h) / 0.6;
  const v = [b.x0 + b.w / 2 - s / 2, b.y0 + b.h / 2 - s / 2, s, s];
  fs.writeFileSync(`${OUT}/m${i}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.join(' ')}"><rect x="${v[0]}" y="${v[1]}" width="${s}" height="${s}" fill="#D0102C"/><path fill="#fff" d="${P.toPath(m)}"/></svg>`);
  h += `<div style="text-align:center"><img src="m${i}.svg" style="width:300px;border-radius:67px"><br><img src="m${i}.svg" style="width:58px;border-radius:13px"> <img src="m${i}.svg" style="width:40px;border-radius:9px"> <img src="m${i}.svg" style="width:29px;border-radius:6.5px"><br>${neck}/${bead}/${len}</div>`;
});
fs.writeFileSync(`${OUT}/p.html`, `<html><body style="margin:0;display:flex;gap:20px;padding:10px;font:14px sans-serif">${h}</body></html>`);
