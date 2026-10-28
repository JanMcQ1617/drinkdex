/* ==================================================================== */
/* v4.10 type: the build's check sheet (specs/v4.10/spec.md T.13)       */
/*                                                                      */
/* Draws board/A-build-checks.png from the SHIPPED files in             */
/* assets/fonts/, at the numbers theme.ts ships (its textRole, imported */
/* as the app reads it), with every offset worked out by the app's own  */
/* lineMarks and inkRoom, and the press's figures by the app's own      */
/* numeralPath from the regenerated numeralGlyphs.ts. Nothing here is   */
/* a second copy of a number.                                           */
/*                                                                      */
/* Each marker Text is drawn as iOS draws it: its line box is the       */
/* layout (a solid hairline), its ink room is padding taken back as     */
/* negative margin (a dashed hairline), and it CLIPS at that padding    */
/* box, as a paragraph view clips to its bounds. So a tail or an accent */
/* the room did not hold would show here cut, as on the phone.          */
/*                                                                      */
/*   1  the 35 names with a 0, at `name` 22/28 in the Dex's 184 column  */
/*      and at `drinkHero` 60/76 in the drink page's 392                */
/*   2  a two- and a three-line hero, wrapped grid names, and an        */
/*      accented capital under a descender                              */
/*   3  Żubrówka, Šumadijski Čaj and "Daiquiri" as a last line          */
/*   4  each tab title with its swash in the 52 row, and the Dex's      */
/*      "38 / 2,089" on the title's baseline                            */
/*   5  the poster heads with their Archivo asides on one baseline      */
/*   6  the outlined Nº 0147 and 01 at cap 48                           */
/*   7  a post header's second line on one baseline                     */
/*                                                                      */
/* A red hairline is a baseline the row shares. Chrome centres a line's */
/* glyphs in its line box from the same hhea metrics iOS does (typo and */
/* hhea are equal in all three files), so the boxes sit as on a phone.  */
/*                                                                      */
/* Run (repo root):  node specs/v4.10/type/tools/checks.mjs             */
/* ==================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SRC = here('../../../../src/');
const ASSETS = here('../../../../assets/fonts/');
const OUT = here('../board/A-build-checks.png');

/*
 * The app's modules, as node can run them: '@/…' mapped to src/, a bare
 * relative import given its ".ts", and react-native stubbed to the two
 * StyleSheet calls these modules make at import (theme.ts's create and
 * hairlineWidth, lineMarks' flatten). Nothing else of React Native runs.
 */
const RN_STUB = `data:text/javascript,${encodeURIComponent(
  'export const StyleSheet = { create: (x) => x, hairlineWidth: 0.5, flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s || {}) };',
)}`;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'react-native') return { url: RN_STUB, shortCircuit: true };
    if (spec.startsWith('@/')) return next(pathToFileURL(`${SRC}${spec.slice(2)}.ts`).href, ctx);
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
process.removeAllListeners('warning');
const { textRole, colors, layout } = await import('../../../../src/constants/theme.ts');
const { lineMarks, inkRoom } = await import('../../../../src/components/details/lineMarks.ts');
const { fitScale } = await import('../../../../src/lib/textFit.ts');
const { numeral } = await import('../../../../src/components/details/numeralPath.ts');
const { penSwash, PEN } = await import('../../../../src/components/details/penPath.ts');

const names = JSON.parse(readFileSync(`${SRC}data/drinks.json`, 'utf8')).map((d) => d.name);
const zeros = names.filter((n) => n.includes('0'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FAMILY = { SedgwickAveLatin_400Regular: 'Sedgwick', AntonLatin_400Regular: 'Anton' };
const fam = (role) => FAMILY[role.fontFamily] ?? `Archivo${role.fontFamily.match(/_(\d{3})/)[1]}`;
const css = (role, size = role.fontSize, line = role.lineHeight) =>
  `font-family:${fam(role)};font-size:${size}px;line-height:${line}px;letter-spacing:${role.letterSpacing ?? 0}px;` +
  (role.textTransform ? `text-transform:${role.textTransform};` : '');

/** A marker Text as DrinkName draws it: fitted, its ink room as padding taken back as margin, clipped to the padding box. */
function markerText(text, role, measure, { fit = true, label = true } = {}) {
  const s = fit ? fitScale(text, 'display', role.fontSize, measure, 15) : 1;
  const size = role.fontSize * s;
  const line = role.lineHeight * s;
  const room = inkRoom('display', size);
  return `<div class="cell" style="width:${measure}px">
    <div class="ink" style="${css(role, size, line)};padding:${room.paddingTop}px ${room.paddingRight}px ${room.paddingBottom}px ${room.paddingLeft}px;margin:${room.marginTop}px ${room.marginRight}px ${room.marginBottom}px ${room.marginLeft}px">
      <span class="lines" style="background-size:100% ${line}px;top:${room.paddingTop}px;bottom:${room.paddingBottom}px;left:${room.paddingLeft}px;right:${room.paddingRight}px"></span>${esc(text)}
    </div>${label && s < 1 ? `<i>fit x${s.toFixed(2)}</i>` : ''}
  </div>`;
}

/** A pen or press shape as an SVG, in its own box. */
function svgShape(shape, w, h, fill, x = 0, y = 0) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:${x}px;top:${y}px;overflow:visible"><path d="${shape.d.join('')}" fill="${fill}"/></svg>`;
}

/* 4. A tab title in its 52 row, the swash and the count as ScreenTopBar places them at 1x. */
const tag = textRole.tabTitle;
const tagRoom = inkRoom('display', tag.fontSize);
const tagTop = (layout.topBar - tag.lineHeight) / 2;
const tagBase = tagTop + lineMarks('display', tag.fontSize, tag.lineHeight).baseline;
const small = textRole.small;
const countLine = lineMarks('text', small.fontSize, small.lineHeight);
const countTop = tagBase - countLine.baseline;
const swash = penSwash(PEN.swash.length);
function tabRow(title, count) {
  return `<div class="row52">
    <div class="title" style="top:${tagTop}px">
      <div class="ink" style="${css(tag)};padding:${tagRoom.paddingTop}px ${tagRoom.paddingRight}px ${tagRoom.paddingBottom}px ${tagRoom.paddingLeft}px;margin:${tagRoom.marginTop}px ${tagRoom.marginRight}px ${tagRoom.marginBottom}px ${tagRoom.marginLeft}px">${esc(title)}</div>
      ${svgShape(swash, PEN.swash.length, PEN.swash.height, colors.accent, 1, tag.lineHeight + 1 - PEN.swash.height)}
    </div>
    ${count ? `<div class="count" style="top:${countTop}px;${css(small)}"><b style="font-family:Archivo600;color:${colors.accent}">38</b> / 2,089</div>` : ''}
    <div class="base" style="top:${tagBase}px"></div>
  </div>`;
}

/* 5. A poster head and its aside on one baseline, as SectionHead and DrinkPanels drop it. */
const sub = textRole.sub;
const subLine = lineMarks('sub', sub.fontSize, sub.lineHeight);
function headRow(head, aside, chevron) {
  const drop = subLine.baseline - countLine.baseline - (chevron ? Math.max(0, (16 - small.lineHeight) / 2) : 0);
  return `<div class="head">
    <div style="${css(sub)}">${esc(head)}</div>
    <div style="${css(textRole.small)};margin-top:${drop}px;font-family:Archivo500">${esc(aside)}${chevron ? ' ›' : ''}</div>
    <div class="base" style="top:${subLine.baseline}px"></div>
  </div>`;
}

/* 7. A post header's second line: the drink at nameSm, " at " and the place in Archivo 13/18 dropped onto its baseline. */
const nameSm = textRole.nameSm;
const smLine = lineMarks('display', nameSm.fontSize, nameSm.lineHeight);
const atDrop = smLine.baseline - countLine.baseline;
const smRoom = inkRoom('display', nameSm.fontSize);
const postLine = `<div class="post">
  <div class="ink" style="${css(nameSm)};padding:${smRoom.paddingTop}px ${smRoom.paddingRight}px ${smRoom.paddingBottom}px ${smRoom.paddingLeft}px;margin:${smRoom.marginTop}px ${smRoom.marginRight}px ${smRoom.marginBottom}px ${smRoom.marginLeft}px">Piña Colada</div>
  <div style="${css(small)};margin-top:${atDrop}px;color:${colors.textMuted};white-space:pre"> at </div>
  <div style="${css(small)};margin-top:${atDrop}px;font-family:Archivo500">Dead Rabbit</div>
  <div class="base" style="top:${smLine.baseline}px"></div>
</div>`;

/* 6. The press's figures at cap 48. */
const press = ['Nº 0147', '01'].map((t) => {
  const n = numeral(t, 48);
  return `<div class="fig" style="width:${Math.ceil(n.width) + 4}px;height:${48 + 4}px">${svgShape(n, Math.ceil(n.width), 48, colors.rule, 0, 2)}</div>`;
});

const hero = textRole.drinkHero;
const grid = textRole.name;
const font = (family, file) => `@font-face{font-family:${family};src:url("file://${ASSETS}${file}.ttf")}`;
const html = `<!doctype html><meta charset="utf-8"><style>
${font('Sedgwick', 'SedgwickAveLatin_400Regular')}${font('Anton', 'AntonLatin_400Regular')}
${font('Archivo400', 'ArchivoLatin_400Regular')}${font('Archivo500', 'ArchivoLatin_500Medium')}${font('Archivo600', 'ArchivoLatin_600SemiBold')}
*{box-sizing:border-box}
body{margin:0;padding:32px 40px;background:${colors.bg};color:${colors.text};width:1400px;font-family:Archivo400;-webkit-font-smoothing:antialiased;font-kerning:normal}
h1{font:600 22px/28px Archivo600;margin:0 0 6px}
h2{font:600 13px/18px Archivo600;margin:28px 0 10px;color:${colors.textMuted}}
p.note{font:400 13px/18px Archivo400;color:${colors.textMuted};margin:0 0 8px;max-width:1100px}
.wrap{display:flex;flex-wrap:wrap;gap:18px 24px;align-items:flex-start}
.cell{position:relative}
.cell i{position:absolute;right:0;top:-14px;font:400 11px/14px Archivo400;color:${colors.textMuted};font-style:normal}
/* The ink box: the Text's bounds, where iOS clips. Dashed. */
.ink{position:relative;overflow:hidden;outline:0.5px dashed #9A9A9A;outline-offset:-0.25px;overflow-wrap:normal}
/* The line boxes: the layout, a solid hairline at every line. */
.lines{position:absolute;pointer-events:none;background-image:linear-gradient(to bottom,#5C5C5C 0.5px,transparent 0.5px);border-bottom:0.5px solid #5C5C5C}
.row52{position:relative;width:390px;height:${layout.topBar}px;outline:0.5px solid #C4C4C4;margin-bottom:10px}
.row52 .title{position:absolute;left:${layout.gutter}px;height:${tag.lineHeight}px;outline:0.5px solid #5C5C5C}
.row52 .count{position:absolute;right:${layout.gutter}px;color:${colors.textMuted};font-variant-numeric:tabular-nums}
.base{position:absolute;left:0;right:0;height:0;border-top:0.5px solid ${colors.accent};opacity:.7}
.head,.post{position:relative;display:flex;align-items:flex-start;justify-content:space-between;width:342px;margin-bottom:14px;outline:0.5px solid #E3E3E3}
.post{justify-content:flex-start}
.fig{position:relative;display:inline-block;margin-right:32px;outline:0.5px solid #E3E3E3}
</style><body>
<h1>v4.10 type: the build's checks (T.13), from the shipped fonts</h1>
<p class="note">Solid hairlines are line boxes, the layout. Dashed is a marker Text's ink room (its bounds), where iOS clips, and the type here is clipped to it. Red is a shared baseline. Every number is theme.ts's, lineMarks', inkRoom's or numeralPath's, imported.</p>

<h2>1a. The ${zeros.length} names with a 0, at name ${grid.fontSize}/${grid.lineHeight} in the Dex's 184 column</h2>
<div class="wrap">${zeros.map((n) => markerText(n, grid, 184)).join('')}</div>
<h2>1b. The same at drinkHero ${hero.fontSize}/${hero.lineHeight} in the drink page's 392</h2>
<div class="wrap">${zeros.map((n) => markerText(n, hero, 392)).join('')}</div>

<h2>2. Two- and three-line heroes, wrapped grid names, an accented capital under a descender</h2>
<div class="wrap">
${markerText('Hemingway Daiquiri', hero, 392)}${markerText('Rothman & Winter Crème de Violette', hero, 392)}
${markerText("Tommy's Margarita", grid, 140)}${markerText('Brandy Alexander', grid, 140)}${markerText("Cognac Hors d'Âge", grid, 120)}${markerText("Cognac Hors d'Âge", hero, 392)}
</div>

<h2>3. Accents over the first line, and "Daiquiri" as a last line</h2>
<div class="wrap">
${markerText('Żubrówka', grid, 184)}${markerText('Šumadijski Čaj', grid, 184)}${markerText('Strawberry Daiquiri', grid, 150)}
${markerText('Żubrówka Bison Grass', hero, 392)}${markerText('Šumadijski Čaj', hero, 392)}${markerText('Banana Daiquiri', hero, 300)}
</div>

<h2>4. The tab titles in the 52 row, with the swash, and the Dex's count on the title's baseline (at 1x, 390 wide)</h2>
${tabRow('Dex', true)}${tabRow('Saved')}${tabRow('Tournaments')}${tabRow('My Bar')}

<h2>5. The poster heads, with their Archivo asides on one baseline</h2>
${headRow('Sour and citrusy', 'See all 445', true)}${headRow('The spec', 'Shaken · 4 ingredients', false)}${headRow('Everything else', 'by number', false)}

<h2>6. The press's outlined figures at cap 48 (Anton, the Nº's sign its degree ring)</h2>
<div>${press.join('')}</div>

<h2>7. A post header's second line on one baseline</h2>
${postLine}
<pre id="h" style="display:none"></pre><script>document.fonts.ready.then(() => { document.getElementById('h').textContent = document.body.scrollHeight; });</script>
</body>`;

const PAGE = '/tmp/sipply-v410-type-checks.html';
writeFileSync(PAGE, html);
const PROFILE = '/tmp/sipply-v410-type-chrome';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = ['--headless=new', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=8000'];
const dom = spawnSync(CHROME, [...base, '--window-size=1480,2000', '--dump-dom', `file://${PAGE}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
const height = Number(/<pre id="h"[^>]*>(\d+)<\/pre>/.exec(dom.stdout || '')?.[1]);
if (!(height > 0)) {
  spawnSync('pkill', ['-f', PROFILE]);
  console.error('checks: Chrome returned no height');
  process.exit(1);
}
spawnSync(CHROME, [...base, '--force-device-scale-factor=2', `--window-size=1480,${height}`, `--screenshot=${OUT}`, `file://${PAGE}`], { encoding: 'utf8' });
spawnSync('pkill', ['-f', PROFILE]);
console.log(`checks: wrote ${OUT} (1480 x ${height} @2x)`);
