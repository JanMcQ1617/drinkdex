/* Builds index.html from template.html: Home at 390 x 844 (the v4.4 mock's
 * campari Home, re-laid for a 390pt phone, with the v4.5 wordmark), the
 * wordmark's outline, and the motion model (state.cjs) inlined.
 *   node tools/gen.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');
const S = require('./state.cjs');
const PRE = 0.4, POST = 0.5;
const DUR = +(PRE + S.END / 1000 + POST).toFixed(3);
const WMD = fs.readFileSync(path.join(R, 'assets/wordmark.d'), 'utf8').trim();

/* ---------- glyphs: src/components/icons.tsx paths (as the v4.4 mock has them) ---------- */
const OUT = {
  home: '<path d="M3.2 10.4 12 3.4l8.8 7"/><path d="M5.4 9.3V19.4a1.6 1.6 0 0 0 1.6 1.6h10a1.6 1.6 0 0 0 1.6-1.6V9.3"/><path d="M9.6 21V14.9h4.8V21"/>',
  dex: '<path d="M3.9 5.4h16.2l-8.1 8.3z"/><path d="M12 13.7v5.5"/><path d="M8.3 19.6h7.4"/>',
  plus: '<path d="M12 5.2v13.6"/><path d="M5.2 12h13.6"/>',
  heart: '<path d="M12 20.3 4.9 13.4a4.3 4.3 0 0 1 0-6.2 4.5 4.5 0 0 1 6.3 0l.8.8.8-.8a4.5 4.5 0 0 1 6.3 0 4.3 4.3 0 0 1 0 6.2z"/>',
  send: '<path d="M2.9 10.9 21.1 4.9 9.1 13.1z"/><path d="M9.1 13.1 21.1 4.9 12.6 19.1z"/>',
  bookmark: '<path d="M6.4 4.6h11.2v15.8L12 16.3l-5.6 4.1z"/>',
  create: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4"/><path d="M12 8v8"/><path d="M8 12h8"/>',
};
const SOLID = {
  home: '<path fill-rule="evenodd" d="M12 2.7a1.4 1.4 0 0 1 .9.3l8.3 6.6a1.4 1.4 0 0 1 .5 1.1v8.7a2.2 2.2 0 0 1-2.2 2.2h-4.6v-5.7a1 1 0 0 0-1-1h-3.8a1 1 0 0 0-1 1v5.7H4.5a2.2 2.2 0 0 1-2.2-2.2v-8.7a1.4 1.4 0 0 1 .5-1.1l8.3-6.6a1.4 1.4 0 0 1 .9-.3z"/>',
  heart: '<path d="M12 20.9a1 1 0 0 1-.68-.27l-6.9-6.7a5.1 5.1 0 0 1 0-7.4 5.4 5.4 0 0 1 7.58 0 5.4 5.4 0 0 1 7.58 0 5.1 5.1 0 0 1 0 7.4l-6.9 6.7a1 1 0 0 1-.68.27z"/>',
};
const ic = (name, size = 24, color = 'var(--ink)', sw = 1.6, solid = false) => {
  if (name === 'more') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><circle cx="5.4" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.6" cy="12" r="1.7"/></svg>`;
  if (solid && SOLID[name]) return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">${SOLID[name]}</svg>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${OUT[name]}</svg>`;
};
const at = (x, y, inner, st = '') => `<div class="a" style="left:${x}px;top:${y}px;${st}">${inner}</div>`;
const PERSON = '<circle cx="12" cy="9" r="4"/><path d="M4 21c1.2-4 4.4-6 8-6s6.8 2 8 6z"/>';
const av = (x, y, d, tone) => `<div class="a circle" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;background:var(--${tone});display:flex;align-items:flex-end;justify-content:center;overflow:hidden"><svg width="${Math.round(d * .86)}" height="${Math.round(d * .86)}" viewBox="0 0 24 24" fill="#FFFFFF">${PERSON}</svg></div>`;
const IMG = id => `assets/${id}.webp`;

const W = 390, H = 844, TOP = 47, BOT = 34;
const statusBar = () => `<div class="sb"><span class="t">9:41</span><span class="r">
  <svg width="18" height="12" viewBox="0 0 18 12" fill="#0A0A0A"><rect x="0" y="8" width="3" height="4" rx=".7"/><rect x="5" y="5.5" width="3" height="6.5" rx=".7"/><rect x="10" y="3" width="3" height="9" rx=".7"/><rect x="15" y="0" width="3" height="12" rx=".7"/></svg>
  <svg width="16" height="12" viewBox="0 0 16 12" fill="#0A0A0A"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .4C5.2.4 2.7 1.5.8 3.3L2 4.6a8.5 8.5 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 4c-1.8 0-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3ZM8 9.3l1.9-1.7a2.9 2.9 0 0 0-3.8 0Z"/></svg>
  <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#0A0A0A" stroke-opacity=".35"/><rect x="2" y="2" width="20" height="9" rx="2" fill="#0A0A0A"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="#0A0A0A" fill-opacity=".4"/></svg></span></div>`;

/* Home's bar: row 47-91 (ROW 44), wordmark box 42 tall on the row's foot at x 13.69 (lead), keys' boxes 295 / 339 */
function homeTop() {
  const K = 42 / 285.52, bw = 462.97 * K;
  const glyphY = TOP + 22 - 13;
  return `<div class="a" style="left:0;top:${TOP}px;width:${W}px;height:45px;background:var(--page);z-index:28"></div>` +
    '' +
    at(304, glyphY, ic('create', 26), 'z-index:29') + at(348, glyphY, ic('heart', 26), 'z-index:29') +
    `<div class="a circle" style="left:363px;top:${glyphY - 2}px;width:12px;height:12px;background:var(--acc);border:2px solid var(--page);z-index:30"></div>`;
}
const P = { ana: 't2', leo: 't1', maya: 't1', ines: 't2', theo: 't1', sam: 't3', me: 't3' };
function tray(y0) {
  const L = [['me', null, true, 'Your story'], ['ana', 'daiquiri', false, 'ana'], ['leo', 'negroni', false, 'leo'], ['ines', 'paloma', false, 'ines.ag'], ['theo', 'paper-plane', true, 'theo_stirs'], ['sam', 'mojito', true, 'sam.ortega']];
  let h = '';
  L.forEach(([k, img, seen, u], i) => {
    const x = 12 + i * 80, y = y0 + 8;
    if (k === 'me') {
      h += av(x + 5, y + 5, 56, P.me);
      h += `<div class="a circle" style="left:${x + 41}px;top:${y + 41}px;width:22px;height:22px;background:var(--ink);box-shadow:0 0 0 3px var(--page);display:flex;align-items:center;justify-content:center">${ic('plus', 14, '#FFFFFF', 2.4)}</div>`;
    } else {
      h += `<div class="a circle" style="left:${x}px;top:${y}px;width:66px;height:66px;box-shadow:inset 0 0 0 ${seen ? '1px var(--rule)' : '2px var(--ink)'}"></div>`;
      h += `<div class="a circle" style="left:${x + 5}px;top:${y + 5}px;width:56px;height:56px;overflow:hidden;background:var(--wash)"><img src="${IMG(img)}" style="position:absolute;left:-14px;top:-12px;width:84px;height:84px;object-fit:cover"></div>`;
    }
    h += `<div class="a small ell" style="left:${x - 7}px;top:${y + 70}px;width:80px;text-align:center;color:${k === 'me' || seen ? 'var(--muted)' : 'var(--ink)'}">${u}</div>`;
  });
  return h;
}
function post(y0) {
  let h = '';
  h += `<div class="a circle" style="left:12px;top:${y0 + 6}px;width:40px;height:40px;box-shadow:inset 0 0 0 2px var(--ink)"></div>`;
  h += av(16, y0 + 10, 32, P.maya);
  h += `<div class="a small" style="left:60px;top:${y0 + 8}px;width:290px;white-space:nowrap"><b>maya.pours</b> with <b>ana</b> and <b>leo</b></div>`;
  h += at(60, y0 + 26, `<span style="font:700 13px/18px Playfair">Negroni</span>`);
  h += at(350, y0 + 14, ic('more', 24));
  h += `<div class="print" style="left:0;top:${y0 + 52}px;width:${W}px;height:${W}px;border-radius:0"><img src="${IMG('negroni')}" style="transform:scale(1.1)"></div>`;
  const ay = y0 + 52 + W;
  h += at(16, ay + 9, ic('heart', 26, 'var(--ink)', 1.6, true)) + at(60, ay + 9, ic('send', 26)) + at(348, ay + 9, ic('bookmark', 26));
  h += `<div class="a circle" style="left:16px;top:${ay + 44}px;width:22px;height:22px;background:var(--page);padding:2px">${av(2, 2, 18, P.ines)}</div>`;
  h += at(46, ay + 46, `<span class="small">Liked by <b>ines.ag</b> and <b>23 others</b></span>`);
  h += `<div class="a small" style="left:16px;top:${ay + 70}px;width:358px"><b>maya.pours</b> Leo’s recipe, in his kitchen. Equal parts, stirred long.</div>`;
  h += at(16, ay + 70 + 36 + 4, `<span class="small muted">2 hours ago</span>`);
  return h;
}
/* the tab bar: slab 761-844, row 761-810 (cy 785.5), slots 78 wide: 39 · 117 · 195 · 273 · 351 */
function tabs() {
  const cy = S.KEY.y, top = H - BOT - 49;
  let h = `<div class="a" style="left:0;top:${top}px;width:${W}px;height:${H - top}px;background:var(--page);z-index:32"></div>`;
  const g = (name, x, on) => at(x - 13, cy - 13, ic(name, 26, on ? 'var(--ink)' : 'var(--muted)', 1.6, on), 'z-index:33');
  h += g('home', 39, true) + g('dex', 117, false) + g('bookmark', 273, false);
  /* the + key: drawn below in SVG (homeMarks) */
  h += `<div class="a" style="z-index:33">${av(351 - 13, cy - 13, 26, 't3')}</div>`;
  h += `<div class="a" style="left:${39 - 9}px;top:${cy + 18.5}px;width:18px;height:2px;background:var(--acc);z-index:33"></div>`;
  return h + `<div class="homeInd"></div>`;
}
/*
 * Home's wordmark and + key, in one full-phone SVG: an HTML box snaps its
 * edges to whole CSS px before the 3x scale (13.69 -> 14, 766.5 -> 767),
 * which the app does not do (it rounds to physical pixels), so these two are
 * placed unsnapped, at exactly the points the app draws them.
 */
function homeMarks() {
  const K = 42 / 285.52;
  const wm = `<g id="homeWm" transform="translate(${S.TO.x} ${S.TO.y}) scale(${K}) translate(${-S.C.x} ${-S.C.y})"><path fill="#D0102C" d="${WMD}"/></g>`;
  const key = `<g id="homeKey"><rect x="${195 - 26}" y="${S.KEY.y - 19}" width="52" height="38" rx="4" fill="#D0102C"/>` +
    `<g transform="translate(${195 - 11} ${S.KEY.y - 11}) scale(${22 / 24})" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${OUT.plus}</g></g>`;
  return `<svg class="a" style="left:0;top:0;width:${W}px;height:${H}px;z-index:34" viewBox="0 0 ${W} ${H}">${wm}${key}</svg>`;
}
const HOME = tray(TOP + 45) + post(TOP + 45 + 104) + statusBar() + homeTop() + tabs() + homeMarks();

const src = fs.readFileSync(path.join(__dirname, 'state.cjs'), 'utf8');
const inline = `(function(){var module={exports:{}};${src}\nreturn module.exports;})()`;
const st0 = S.state(0);
let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
  .split('__DUR__').join(String(DUR))
  .replace('__PRE__', String(PRE)).replace('__POST__', String(POST))
  .replace('__HOME__', () => HOME)
  .replace('__WM0__', st0.wm)
  .replace('__WMD__', () => WMD)
  .replace('__STATE_SRC__', () => inline);
fs.writeFileSync(path.join(R, 'index.html'), html);
console.log('index.html', html.length, 'bytes; duration', DUR, 's; frames', Math.round(DUR * 60));
console.log('bead', S.BEAD, 'to', S.TO, 'key', S.KEY);
