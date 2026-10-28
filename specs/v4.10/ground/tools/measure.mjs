/* ==================================================================== */
/* v4.10 ground: the contrast audit                                     */
/*                                                                      */
/* Every option's darkest ground (its `under` in grounds.mjs: the       */
/* darkest level any text, glyph or control edge can land on, because   */
/* the ground is fixed and the page scrolls over it) against the pairs  */
/* scripts/check-contrast.mjs holds on the page, read from theme.ts as  */
/* that audit reads it: this file holds no copy of the palette. Then    */
/* the surfaces that are told apart from the page by their fill alone   */
/* (the wash, the press, the 1pt line), printed for the record: no      */
/* threshold applies, but a wash at 1.01:1 has stopped being a surface. */
/*                                                                      */
/* An option that fails a pair is reported, and that is one reason it  */
/* is not the pick. Exits 1 only if the pick (PICK) fails a pair, or    */
/* leaves the wash under WASH_MIN on its foot, so the recommendation    */
/* cannot drift past what was judged.                                   */
/*                                                                      */
/* Run (repo root):  node specs/v4.10/ground/tools/measure.mjs          */
/* ==================================================================== */
import { readFileSync } from 'node:fs';
import { GROUNDS, PICK, TUNING, hex } from './grounds.mjs';

const THEME = readFileSync(new URL('../../../../src/constants/theme.ts', import.meta.url), 'utf8');
const from = THEME.indexOf('export const colors = {');
const block = THEME.slice(from, THEME.indexOf('} as const;', from))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');
const C = {};
for (const [, k, v] of block.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) C[k] = v.toUpperCase();
for (const k of ['text', 'textMuted', 'textFaint', 'accent', 'lineControl', 'lineInk', 'bgSunk', 'press', 'line', 'bg']) {
  if (!C[k]) {
    console.error(`measure: colors.${k} is not in theme.ts`);
    process.exit(2);
  }
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS = [
  ['text', 4.5, 'ink'],
  ['textMuted', 4.5, 'muted'],
  ['accent', 4.5, 'accent text'],
  ['textFaint', 3.0, 'faint, 18pt+'],
  ['lineControl', 3.0, 'control edge'],
];
const SURFACES = [
  ['bgSunk', 'wash'],
  ['press', 'press'],
  ['line', 'line'],
];

/*
 * The wash on the pick's foot. v4.9 A.5 accepted 1.05:1 on the paper's
 * mean (#FBFBFB, 1.054) with its darkest pixels at 1.01; a ramp has no
 * mean to hide behind, its foot is a whole band, so the foot itself is
 * held to the paper's mean.
 */
const WASH_MIN = 1.05;

let failed = 0;
const failedBy = new Map();
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n  v4.10 ground: each option's darkest ground against the page pairs (theme.ts: bg ${C.bg}, wash ${C.bgSunk})\n`);
console.log(
  `  ${pad('option', 30)}${pad('darkest', 9)}` +
    PAIRS.map(([, min, l]) => pad(`${l} ${min}`, 17)).join('') +
    SURFACES.map(([, l]) => pad(l, 8)).join(''),
);
for (const g of [...GROUNDS, ...TUNING]) {
  const dark = hex(g.under[0]);
  const cells = PAIRS.map(([k, min]) => {
    const r = ratio(C[k], dark);
    if (r < min) failedBy.set(g.id, (failedBy.get(g.id) || 0) + 1);
    return pad(`${r < min ? 'FAIL' : 'pass'} ${r.toFixed(2)}`, 17);
  });
  const surf = SURFACES.map(([k]) => pad(ratio(C[k], dark).toFixed(3), 8));
  console.log(`  ${pad(g.title.replace(/^[A-F0·] · /, ''), 30)}${pad(dark, 9)}${cells.join('')}${surf.join('')}`);
}

const pickWash = ratio(C.bgSunk, hex(PICK.foot));
const pickOk = pickWash >= WASH_MIN;
failed = PAIRS.filter(([k, min]) => ratio(C[k], hex(PICK.foot)) < min).length;
for (const [id, n] of failedBy) console.log(`  ${id}: ${n} pair(s) fail on its darkest ground, so it cannot be the pick as drawn.`);
console.log(
  `\n  The pick, foot ${hex(PICK.foot)}: wash against it ${pickWash.toFixed(3)}:1 ` +
    `(${pickOk ? 'at or over' : 'UNDER'} ${WASH_MIN}:1, v4.9's on the paper's mean; ${ratio(C.bgSunk, C.bg).toFixed(3)}:1 on white).`,
);
console.log(
  failed === 0 && pickOk
    ? '  The pick keeps every page pair, and the wash where v4.9 left it.\n'
    : `  The pick: ${failed} pair(s) fail${pickOk ? '' : '; its foot darkens past the wash v4.9 accepted'}.\n`,
);
process.exit(failed === 0 && pickOk ? 0 : 1);
