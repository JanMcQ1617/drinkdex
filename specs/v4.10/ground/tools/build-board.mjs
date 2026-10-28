/* ==================================================================== */
/* v4.10 ground: the board                                              */
/*                                                                      */
/* Writes ../board/index.html by DERIVING it from the v4.9 board        */
/* (specs/v4.9/details/board/index.html), never by forking it: the      */
/* screens, the type, the geometry and every pen mark are v4.9's own    */
/* functions and its generated marks.js, read in place. Only two things */
/* change: the ground layer (v4.9's `.paper` and the bars' `paperd`     */
/* tiling) is drawn from tools/grounds.mjs, and the assembly at the     */
/* foot of the script lays the options out instead of v4.9's wall.      */
/*                                                                      */
/* Each replacement is checked: if the v4.9 board no longer has the     */
/* line this expects, the build stops rather than drawing a board that  */
/* silently lost its ground.                                            */
/*                                                                      */
/* The same three screens as v4.9's before-and-after pairs (spec H):    */
/* Home at rest (photos, faces, the doubled stories rule, the crop      */
/* corners), Saved with nothing saved (the art-led cluster and a wide   */
/* empty page) and Activity with nothing yet (icon-led, no tab bar).    */
/*                                                                      */
/* Run (repo root):  node specs/v4.10/ground/tools/build-board.mjs      */
/* ==================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GROUNDS, TUNING, cssImage } from './grounds.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const V49 = here('../../../v4.9/details/board/index.html');
const PATHS = here('../../../../src/components/brand/paths.ts');
const OUT = here('../board/index.html');
/** From specs/v4.10/ground/board/ to v4.9's board folder: the same depth, so v4.9's ../../../../assets paths hold. */
const V49_REL = '../../../v4.9/details/board/';

/* ---- The icon's s, read from the app's own outline ------------------- */
const paths = readFileSync(PATHS, 'utf8');
const block = paths.slice(paths.indexOf('export const MARK_PATH'));
const nums = (key) => JSON.parse(new RegExp(`${key}: (\\[[^\\]]+\\])`).exec(block)[1]);
const markPath = { d: /d: '([^']+)'/.exec(block)[1], ink: nums('ink'), optical: nums('optical') };

/* ---- Each option's picture ------------------------------------------- */
const grain = `url(${V49_REL}assets/paper@2x.png)`;
const picture = (g) => ({
  id: g.id,
  letter: g.letter ?? '',
  title: g.title,
  line: g.line,
  page: g.page,
  bars: g.bars,
  css: cssImage(g.sweep || g.png ? 'sweep' : g.id, { markPath, grain, sweep: g.sweep, png: g.png }),
  /* Where the picture lies on the 440 x 956 screen: the whole of it, or (the shipped PNG) its lower 60%. */
  box: g.box ?? { top: 0, height: 956 },
  /* The shipped PNG is drawn texel for texel: Chrome's smooth CPU upscale flattens a dither (grounds.mjs). */
  pixelated: !!g.pixelated,
  /* The top fade ends at the top bar's foot: Home's bar is 44 tall (foot 106), ScreenTopBar's 52 (foot 114). */
  fade: g.id === 'topfade' ? { 106: cssImage(g.id, { barFoot: 106 }), 114: cssImage(g.id, { barFoot: 114 }) } : null,
});
const data = [...GROUNDS, ...TUNING].map(picture);

/*
 * The checks: the options that survived the first look, on the screens
 * that carry wash surfaces (the field and chips on Dex, the tickets, the
 * key and your row on Tournaments, Edit profile, Post a drink at the
 * feed's end), and one probe. The ground is fixed and the page scrolls
 * over it, so ANY wash can come to rest at the foot, where the sweep is
 * darkest: `shift` moves the Tournaments page (never its bars) 190pt
 * down, as a longer board scrolled would, so your row lies on the foot.
 */
const CHECK_GROUNDS = ['white', 'grain', 'sweep', 'sweep251', 'sweeppng', 'window', 'topfade'];
const CHECK_SCREENS = [
  ['dex', ''],
  ['board', ''],
  ['board', '190'],
  ['profile', ''],
  ['home-end', ''],
];

/* ---- The transform ----------------------------------------------------- */
let html = readFileSync(V49, 'utf8');
function swap(find, put) {
  const at = html.indexOf(find);
  if (at < 0 || html.indexOf(find, at + 1) >= 0) {
    console.error(`build-board: the v4.9 board no longer has exactly one \`${find.slice(0, 60)}\`; read it and update this tool.`);
    process.exit(1);
  }
  html = html.slice(0, at) + put + html.slice(at + find.length);
}
function swapSpan(from, to, put) {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a);
  if (a < 0 || b < 0) {
    console.error(`build-board: cannot find the span \`${from}\` .. \`${to}\` in the v4.9 board.`);
    process.exit(1);
  }
  html = html.slice(0, a) + put + html.slice(b + to.length);
}

swap('<title>Sipply v4.9 details</title>', '<title>Sipply v4.10 ground</title>');
swap(
  '.paper{position:absolute;inset:0;background:url(assets/paper@2x.png) 0 0/128px 128px repeat;pointer-events:none}',
  '/* v4.10: the ground is set per frame by applyGrounds() below (tools/build-board.mjs). */\n.paper{position:absolute;inset:0;pointer-events:none}',
);
swap('.chrome.paperd{background:url(assets/paper@2x.png) 0 0/128px 128px repeat, var(--page)}', '.chrome.paperd{background:var(--page)}');
swap('<script src="marks.js"></script>', `<script src="${V49_REL}marks.js"></script>`);

const ASSEMBLY = `/* ==================================================================== */
/* v4.10 ground: the assembly                                           */
/*                                                                      */
/* Written by specs/v4.10/ground/tools/build-board.mjs in place of the  */
/* v4.9 wall. Everything above is the v4.9 board's own code; only the   */
/* ground differs between frames. ?g=<option>&f=<screen> draws one      */
/* phone alone, for the shots.                                          */
/* ==================================================================== */
const GROUNDS = ${JSON.stringify(data)};
const TUNING_IDS = ${JSON.stringify(TUNING.map((t) => t.id))};
const SCREENS = ['home', 'saved-empty', 'activity-empty'];
const CHECK_GROUNDS = ${JSON.stringify(CHECK_GROUNDS)};
const CHECK_SCREENS = ${JSON.stringify(CHECK_SCREENS)};
const params = new URLSearchParams(location.search);
const gq = params.get('g');
const fq = params.get('f');
const sq = params.get('shift') || '';
const wall = document.getElementById('wall');
const groundOf = (id) => GROUNDS.find((g) => g.id === id);
function groundFrame(g, id, shift = '') {
  const f = FRAMES.find((x) => x[0] === id);
  NEW.on = true;
  const inner = f[2]();
  const what = shift ? \`\${f[1]}, the page \${shift}pt down: your row on the foot\` : f[1];
  return \`<div class="frame" data-g="\${g.id}" data-shift="\${shift}">\${inner}<div class="cap"><b>\${g.title}</b> · \${what}</div></div>\`;
}
/**
 * The probe: move the page's own content (every layer under the bars'
 * z-index 20) down by \`shift\`, leaving the ground, the bars, the status
 * strip and the tab bar where they are, as a scroll would.
 */
function applyShift() {
  for (const fr of document.querySelectorAll('.frame[data-shift]:not([data-shift=""])')) {
    const dy = Number(fr.dataset.shift);
    for (const el of fr.querySelector('.phone').children) {
      if (el.classList.contains('paper') || el.classList.contains('chrome') || el.classList.contains('sb')) continue;
      if (el.classList.contains('homeInd') || el.hasAttribute('data-z') || Number(el.style.zIndex) >= 20) continue;
      el.style.transform = \`translateY(\${dy}px)\`;
    }
  }
}
/**
 * Lay each frame's ground: the page layer (v4.9's .paper, the root's first
 * child) and every opaque bar. A 'slice' bar shows the same 440 x 956
 * picture cut at its own top, as a screen-anchored ground would in the app.
 */
function applyGrounds() {
  for (const fr of document.querySelectorAll('.frame[data-g]')) {
    const g = groundOf(fr.dataset.g);
    const phone = fr.querySelector('.phone');
    const paper = phone.querySelector('.paper');
    const bars = [...phone.querySelectorAll('.chrome.paperd')];
    const foot = Math.max(...bars.map((b) => parseFloat(b.style.top) + parseFloat(b.style.height)).filter((v) => v < 300));
    const img = g.fade ? g.fade[foot] : g.css;
    for (const el of [paper, ...bars]) if (el && g.pixelated) el.style.imageRendering = 'pixelated';
    if (paper) {
      paper.style.background = !g.page || !img ? 'none' : g.bars === 'tile' ? \`\${img} 0 0/128px 128px repeat\` : \`\${img} 0 \${g.box.top}px/440px \${g.box.height}px no-repeat\`;
    }
    for (const b of bars) {
      const top = parseFloat(b.style.top);
      b.style.background =
        g.bars === 'slice' && img
          ? \`\${img} 0 \${g.box.top - top}px/440px \${g.box.height}px no-repeat, var(--page)\`
          : g.bars === 'tile'
            ? \`\${img} 0 0/128px 128px repeat, var(--page)\`
            : 'var(--page)';
    }
  }
}
let out = '';
if (gq && fq) {
  document.body.classList.add('solo');
  out = \`<div class="solo">\${groundFrame(groundOf(gq), fq, sq)}</div>\`;
} else {
  out += \`<h1>Sipply v4.10 · the ground, another way</h1>
  <p class="lede">Jan, on his phone, of build 34’s paper grain: “make the background less grainy, it hurts the eyes to see, make it another way.” The grain goes. Each row is one other way to give the page something to stand on, on the same three screens as the v4.9 board’s before-and-after pairs, with v4.9’s own marks. Neutral only (R = G = B), off every wash surface, nothing that moves. Below them, the tuning of A and the checks on the screens with wash surfaces. The recommendation and its numbers are in <code>../README.md</code>; the sheets are <code>arm-length.png</code> (25%), <code>ground-100.png</code>, <code>structure.png</code> (the ground made visible) and <code>checks.png</code>.</p>\`;
  for (const g of GROUNDS.filter((x) => !TUNING_IDS.includes(x.id))) {
    out += \`<h2>\${g.title} <small>\${g.line}</small></h2><div class="row">\${SCREENS.map((s) => groundFrame(g, s)).join('')}</div>\`;
  }
  out += \`<h2>Tuning A <small>the same three screens: the foot at #FBFBFB (the pick), at #F6F6F6 (too far), and the pick drawn from the PNG the app would ship</small></h2>\`;
  for (const id of TUNING_IDS) {
    const g = groundOf(id);
    out += \`<h2>\${g.title} <small>\${g.line}</small></h2><div class="row">\${SCREENS.map((s) => groundFrame(g, s)).join('')}</div>\`;
  }
  out += \`<h2>The checks <small>the wash surfaces: Dex’s field and chips, the tickets and your row, Edit profile, Post a drink; and your row moved onto the foot</small></h2>\`;
  for (const id of CHECK_GROUNDS) {
    const g = groundOf(id);
    out += \`<h2>\${g.title}</h2><div class="row">\${CHECK_SCREENS.map(([s, sh]) => groundFrame(g, s, sh)).join('')}</div>\`;
  }
}
wall.innerHTML = out;
applyGrounds();
applyShift();`;

swapSpan('const params = new URLSearchParams(location.search);', 'wall.innerHTML = out;', ASSEMBLY);

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB, ${data.length} grounds)`);
