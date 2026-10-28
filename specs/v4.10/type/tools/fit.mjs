/* ==================================================================== */
/* v4.10 type: how the 2,089 names fit each display face                */
/*                                                                      */
/* Measures every drink name in src/data/drinks.json, shaped by Chrome  */
/* from the real files, at each direction's grid size (the Dex's 184    */
/* column) and hero size (the drink page's 392 measure). A is read from */
/* the SHIPPED subset (assets/fonts/SedgwickAveLatin_400Regular.ttf,    */
/* the unslashed zero included), B and C from the exploration's files.  */
/* "One line" is what DrinkName draws without its own shrink-to-fit;    */
/* the worst factor is how far it would have to shrink the longest      */
/* name. Build 34's Playfair row is gone with its files; the README's   */
/* table keeps its figures.                                             */
/*                                                                      */
/* THE ACCEPTANCE (specs/v4.10/spec.md T.9). For every name at 22 in    */
/* 184 and 60 in 392, textFit's own estimate of the name's widest       */
/* unbreakable run (widestRun, 'display', imported from the app) must   */
/* be at least Chrome's shaped width of that run, kerning and ligatures */
/* on, as iOS sets it. It prints the least margin and exits 1 if any    */
/* name is under. Writes the probe page to /tmp and reads the result    */
/* back from headless Chrome in its own profile.                        */
/*                                                                      */
/* Run (repo root):  node specs/v4.10/type/tools/fit.mjs                */
/* ==================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SRC = here('../../../../src/');
// The app imports '@/lib/…' without an extension; map it as the bundler does.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('@/')) return next(pathToFileURL(`${SRC}${spec.slice(2)}.ts`).href, ctx);
    return next(spec, ctx);
  },
});
process.removeAllListeners('warning');
const { widestRun } = await import('../../../../src/lib/textFit.ts');

const FONTS = here('../fonts/');
const ASSETS = here('../../../../assets/fonts/');
const names = JSON.parse(readFileSync(here('../../../../src/data/drinks.json'), 'utf8')).map((d) => d.name);
const FACES = [
  ['A Tag: Sedgwick Ave (shipped)', 'SedgwickAve', 400, 22, 60],
  ['B Menu: Kaushan Script', 'Kaushan', 400, 21, 54],
  ['C Label: Caveat 700', 'Caveat', 700, 25, 66],
];
const GRID = 184;
const HERO = 392;

/* textFit's runs(), as it splits: on whitespace, and after a hyphen not followed by a figure, or an en dash. */
function runs(text) {
  const out = [];
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    let start = 0;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const next = word[i + 1];
      const breaksAfter = ch === '–' || (ch === '-' && next !== undefined && !/[0-9]/.test(next));
      if (breaksAfter && i + 1 < word.length) {
        out.push(word.slice(start, i + 1));
        start = i + 1;
      }
    }
    out.push(word.slice(start));
  }
  return out;
}
const allRuns = [...new Set(names.flatMap(runs))];

const PAGE = '/tmp/sipply-v410-type-fit.html';
writeFileSync(
  PAGE,
  `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:SedgwickAve;src:url("file://${ASSETS}SedgwickAveLatin_400Regular.ttf")}
@font-face{font-family:Kaushan;src:url("file://${FONTS}KaushanScript-Regular.ttf")}
@font-face{font-family:Caveat;src:url("file://${FONTS}Caveat%5Bwght%5D.ttf");font-weight:400 700}
#m span{white-space:pre;font-kerning:normal;font-variant-ligatures:normal;position:absolute}
</style><body>${FACES.map(([, f, w]) => `<span style="font-family:${f};font-weight:${w}">a</span>`).join('')}<div id="m"></div><pre id="out"></pre><script>
const N = ${JSON.stringify(names)};
const R = ${JSON.stringify(allRuns)};
const F = ${JSON.stringify(FACES)};
document.fonts.ready.then(() => {
  const c = document.createElement('canvas').getContext('2d');
  let o = '';
  for (const [label, fam, w, grid, hero] of F) {
    c.font = w + ' ' + grid + 'px ' + fam;
    const ws = N.map((n) => c.measureText(n).width).sort((a, b) => a - b);
    const fit = ws.filter((x) => x <= ${GRID}).length;
    c.font = w + ' ' + hero + 'px ' + fam;
    const hfit = N.filter((n) => c.measureText(n).width <= ${HERO}).length;
    o += label + ' | grid ' + grid + ': ' + (100 * fit / N.length).toFixed(1) + '% on one line, median ' + ws[N.length >> 1].toFixed(0) + ' px, longest x' + (${GRID} / ws[ws.length - 1]).toFixed(2) + ' | hero ' + hero + ': ' + (100 * hfit / N.length).toFixed(1) + '% on one line\\n';
  }
  // Every run's shaped width in the shipped marker at 1px of size, as DOM text shapes it (kern and liga on).
  const m = document.getElementById('m');
  const shaped = {};
  for (const size of [22, 60]) {
    shaped[size] = R.map((r) => {
      const s = document.createElement('span');
      s.style.fontFamily = 'SedgwickAve';
      s.style.fontSize = size + 'px';
      s.textContent = r;
      m.appendChild(s);
      const wd = s.getBoundingClientRect().width;
      m.removeChild(s);
      return wd;
    });
  }
  document.getElementById('out').textContent = o + '@@' + JSON.stringify(shaped);
});
</script>`,
);
const PROFILE = '/tmp/sipply-v410-type-chrome';
const r = spawnSync(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--user-data-dir=${PROFILE}`, '--no-first-run', '--allow-file-access-from-files', '--virtual-time-budget=20000', '--dump-dom', `file://${PAGE}`],
  { encoding: 'utf8', maxBuffer: 256 << 20 },
);
spawnSync('pkill', ['-f', PROFILE]);
const out = /<pre id="out">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
if (!out) {
  console.log('fit: Chrome returned no result');
  process.exit(1);
}
const [table, json] = out[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').split('@@');
console.log(table.trim());

// The acceptance: textFit's widest-run estimate never under Chrome's shaped widest run.
const shaped = JSON.parse(json);
const index = new Map(allRuns.map((run, i) => [run, i]));
let worst = null;
let under = 0;
for (const [size, column] of [
  [22, GRID],
  [60, HERO],
]) {
  for (const n of names) {
    const real = Math.max(...runs(n).map((run) => shaped[size][index.get(run)]));
    const est = widestRun(n, 'display', size);
    const margin = est / real - 1;
    if (est < real) under++;
    if (!worst || margin < worst.margin) worst = { n, size, column, margin, est, real };
  }
}
console.log(
  `acceptance | widestRun('display') against Chrome's shaped widest run, ${names.length} names at 22 and 60: ` +
    `${under} under; least margin ${(100 * worst.margin).toFixed(2)}% ("${worst.n}" at ${worst.size}: ${worst.est.toFixed(1)} against ${worst.real.toFixed(1)} px)`,
);
process.exit(under ? 1 : 0);
