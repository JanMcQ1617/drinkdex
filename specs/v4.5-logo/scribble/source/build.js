// v2 build: outlined SVGs into OUT (argv[2]). Needs clipper-lib@6.4.2.
const fs = require('fs');
const P = require(__dirname + '/pen.js');
const G = require(__dirname + '/glyphs.js');
const OUT = process.argv[2];
const RED = '#D0102C', INK = '#0A0A0A', WHITE = '#FFFFFF';
const W_WORD = 21, W_MARK = 25, ROT = 9;

// wordmark (with the swash drip) and the small-size cut (no drip, < 40 px)
function writeWord(polys, name) {
  const b = P.bbox(polys), pad = 1.5;
  const vb = [b.x0 - pad, b.y0 - pad, b.w + 2 * pad, b.h + 2 * pad].map(v => +v.toFixed(2));
  const d = P.toPath(polys);
  const svg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2].toFixed(0)}" height="${vb[3].toFixed(0)}"><title>Sipply</title><path fill="${fill}" d="${d}"/></svg>\n`;
  fs.writeFileSync(`${OUT}/${name}.svg`, svg(RED));
  fs.writeFileSync(`${OUT}/${name}-white.svg`, svg(WHITE));
  fs.writeFileSync(`${OUT}/${name}-ink.svg`, svg(INK));
  console.log(name, 'vb', vb.join(' '), 'aspect', (vb[2] / vb[3]).toFixed(3), 'baseline frac', ((200 - vb[1]) / vb[3]).toFixed(3));
  return vb;
}
const wvb = writeWord(G.wordmark(W_WORD), 'wordmark');
const svb = writeWord(G.wordmark(W_WORD, { drip: false }), 'wordmark-sm');

// mark: square viewBox; the s body is centred (the drip is light and hangs)
const M = G.mark(W_MARK, { rot: ROT });
const mk = M.all, body = P.bbox(M.body), all = P.bbox(mk);
const side = Math.max(all.w, all.h) * 1.08;
const cx = all.x0 + all.w / 2, cy = body.y0 + body.h / 2;
const mvb = [cx - side / 2, cy - side / 2, side, side].map(v => +v.toFixed(2));
const md = P.toPath(mk);
const msvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mvb.join(' ')}" width="512" height="512"><title>Sipply</title><path fill="${fill}" d="${md}"/></svg>\n`;
fs.writeFileSync(OUT + '/mark.svg', msvg(RED));
fs.writeFileSync(OUT + '/mark-white.svg', msvg(WHITE));
fs.writeFileSync(OUT + '/mark-ink.svg', msvg(INK));

// icon: 1024, red ground, white mark. The whole mark spans ICON of the tile,
// centred left-right; vertically the s body sits a touch above the middle.
const ICON = +(process.env.ICON || 0.6);
const sc = (1024 * ICON) / Math.max(all.w, all.h);
const tx = 512 - cx * sc, ty = 1024 * 0.49 - cy * sc;
const tf = ([x, y]) => [x * sc + tx, y * sc + ty];
const ip = P.toPath(mk, tf, 1);
fs.writeFileSync(OUT + '/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${RED}"/><path fill="${WHITE}" d="${ip}"/></svg>\n`);
fs.writeFileSync(OUT + '/icon-ink.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${WHITE}"/><path fill="${INK}" d="${ip}"/></svg>\n`);
const ib = P.bbox(mk.map(p => p.map(tf)));
console.log('icon mark px', ib.x0.toFixed(0), ib.y0.toFixed(0), ib.x1.toFixed(0), ib.y1.toFixed(0), 'mark vb', mvb.join(' '));
fs.writeFileSync(OUT + '/geom.json', JSON.stringify({ wvb, svb, mvb, W_WORD, W_MARK, ROT, ICON }));
