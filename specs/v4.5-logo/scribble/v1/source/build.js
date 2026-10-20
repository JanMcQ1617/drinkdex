// Builds the outlined SVGs into OUT (argv[2]) and a preview page.
const fs = require('fs');
const { outline, bbox, toPath } = require(__dirname + '/pen.js');
const G = require(__dirname + '/glyphs.js');
const OUT = process.argv[2];
const RED = '#D0102C', DEEP = '#A80C23', INK = '#0A0A0A', WHITE = '#FFFFFF';

// wordmark: tight viewBox, padded by 2 units
const wm = outline(G.wordmark(), G.K);
const wb = bbox(wm); const pad = 2;
const wvb = [wb.x0 - pad, wb.y0 - pad, wb.w + 2 * pad, wb.h + 2 * pad].map(v => +v.toFixed(2));
const wd = toPath(wm);
const wsvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${wvb.join(' ')}" width="${wvb[2].toFixed(0)}" height="${wvb[3].toFixed(0)}"><title>Sipply</title><path fill="${fill}" d="${wd}"/></svg>\n`;
fs.writeFileSync(OUT + '/wordmark.svg', wsvg(RED));
fs.writeFileSync(OUT + '/wordmark-white.svg', wsvg(WHITE));
fs.writeFileSync(OUT + '/wordmark-ink.svg', wsvg(INK));

// mark: square viewBox, the s+drip optically centred
const mk = outline(G.mark(), G.K);
const mb = bbox(mk);
const side = Math.max(mb.w, mb.h) * 1.08;
// optical: the drip is light, so centre on the s body a touch above the true middle
const cx = mb.x0 + mb.w / 2, cy = mb.y0 + mb.h / 2;
const mvb = [cx - side / 2, cy - side / 2, side, side].map(v => +v.toFixed(2));
const md = toPath(mk);
const msvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mvb.join(' ')}" width="512" height="512"><title>Sipply</title><path fill="${fill}" d="${md}"/></svg>\n`;
fs.writeFileSync(OUT + '/mark.svg', msvg(RED));
fs.writeFileSync(OUT + '/mark-white.svg', msvg(WHITE));
fs.writeFileSync(OUT + '/mark-ink.svg', msvg(INK));
fs.writeFileSync(OUT + '/geom.json', JSON.stringify({ wvb, mvb, mb, wb, md, wd }));
console.log('wordmark', wvb, 'aspect', (wvb[2] / wvb[3]).toFixed(3), 'mark', mvb, 'mark bbox', mb.w.toFixed(1), mb.h.toFixed(1));

// icon: 1024 square, red ground, white s. Sized on the s body (drips are
// light and hang), body centred a touch above the middle.
const body = outline([G.mark()[0]], G.K); const bb = bbox(body);
const ICON = { body: +(process.env.BODY || 0.56), cy: 0.47 };
const sc = (1024 * ICON.body) / bb.h;
const fb = bbox(mk); const tx = 512 - (fb.x0 + fb.w / 2) * sc, ty = 1024 * ICON.cy - (bb.y0 + bb.h / 2) * sc;
const tf = ([x, y]) => [x * sc + tx, y * sc + ty];
const iconPath = toPath(mk, tf, 1);
const shadow = process.env.SHADOW ? `<path fill="${DEEP}" transform="translate(12 14)" d="${iconPath}"/>` : '';
fs.writeFileSync(OUT + '/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${RED}"/>${shadow}<path fill="${WHITE}" d="${iconPath}"/></svg>\n`);
fs.writeFileSync(OUT + '/icon-ink.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${WHITE}"/><path fill="${INK}" d="${iconPath}"/></svg>\n`);
const all = bbox(mk.map(p => p.map(tf)));
console.log('icon s body', (bb.h * sc).toFixed(0), 'px; whole mark', all.x0.toFixed(0), all.y0.toFixed(0), all.x1.toFixed(0), all.y1.toFixed(0));
