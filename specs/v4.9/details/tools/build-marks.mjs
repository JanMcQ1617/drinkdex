/* ==================================================================== */
/* Builds board/marks.js: every mark the board draws, as path data,     */
/* from the app's own penPath.ts (the v4.6/v4.7 marks) and this         */
/* folder's generators (the v4.9 marks). The board never draws a mark   */
/* by hand: it calls M('<spec>', x, y) and this script scans the board  */
/* for those specs and fills them in.                                   */
/*                                                                      */
/* Run: node specs/v4.9/details/tools/build-marks.mjs                   */
/*                                                                      */
/* Spec grammar (pt):                                                   */
/*   rule|L|seed  vrule|L|seed  swash|L  drip            (penPath.ts)   */
/*   dbl|L|seed  crop|w|h[|arm|gap|which]  crule  drule|L|seed          */
/*   tick|L|dir                                          (pen)          */
/*   lead|L  perf|x0|x1|y  ticket|w|h|at  num|text|cap   (press)        */
/*   lime|s|rot twist|s|rot cherry|s|rot olive|s|rot coupe|s|rot        */
/*   shaker|s|rot crown|s|rot  arrow|x0|y0|x1|y1|bend    (doodles)      */
/*   sig|name|rot   the signed end mark (doodle + swash)  (doodles)     */
/*   cl|name|art|icon  an empty state's cluster, one path (doodles)      */
/* In a spec, `_` stands for a space (num|Nº_0100|64).                  */
/* Every mark's widths are checked against FLOOR; the run fails if any  */
/* pen mark has ink thinner than 0.4pt.                                 */
/* ==================================================================== */
process.removeAllListeners('warning');
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as D from './doodles.mjs';
import * as Fr from './frames.mjs';
import { numeral } from './numerals.mjs';
import { FLOOR, penRule, penSwash, penVRule, plateDrip } from './pen.mjs';

const BOARD = fileURLToPath(new URL('../board/', import.meta.url));
const html = readFileSync(BOARD + 'index.html', 'utf8');
const specs = new Set([...html.matchAll(/\bM\(\s*'([^'<]+)'/g)].map((m) => m[1]));
// Specs built in loops (`M(\`num|${n}|30\`)`) are listed in the board's MARKS_EXTRA comment.
for (const m of html.matchAll(/MARKS_EXTRA:\s*([^\n*]+)/g)) for (const s of m[1].trim().split(/\s+/)) specs.add(s);

const n = (v) => Number(v);
function make(spec) {
  const [k, ...a] = spec.split('|');
  switch (k) {
    case 'rule': return { tier: 'pen', s: penRule(n(a[0]), n(a[1] ?? 0)) };
    case 'vrule': return { tier: 'pen', s: penVRule(n(a[0]), n(a[1] ?? 0)) };
    case 'swash': return { tier: 'pen', s: penSwash(n(a[0] ?? 56)) };
    case 'drip': return { tier: 'pen', s: plateDrip() };
    case 'dbl': return { tier: 'pen', s: Fr.doubleRule(n(a[0]), n(a[1] ?? 0)) };
    case 'crop': return { tier: 'pen', s: a.length > 2 ? Fr.cropCorners(n(a[0]), n(a[1]), n(a[2]), n(a[3]), (a[4] ?? 'tr bl').replace(/-/g, ' ')) : Fr.cropCorners(n(a[0]), n(a[1])) };
    case 'crule': return { tier: 'pen', s: Fr.cornerRule() };
    case 'drule': return { tier: 'pen', s: Fr.dripRule(n(a[0]), n(a[1] ?? 0)) };
    case 'sig': return { tier: 'pen', s: D.signature(a[0], n(a[1] ?? 0)) };
    case 'cl': return { tier: 'pen', s: D.emptyCluster(a[0], a[1]) };
    case 'tick': return { tier: 'pen', s: Fr.cropTick(n(a[0] ?? 8), n(a[1] ?? 1)) };
    case 'lead': return { tier: 'press', s: Fr.leader(n(a[0])) };
    case 'perf': return { tier: 'press', s: Fr.perforation(n(a[0]), n(a[1]), n(a[2])) };
    case 'ticket': return { tier: 'fill', s: Fr.ticket(n(a[0]), n(a[1]), n(a[2])) };
    case 'num': return { tier: 'press', s: numeral(a[0].replace(/_/g, ' '), n(a[1])) };
    case 'lime': return { tier: 'pen', s: D.limeWheel(n(a[0] ?? 1), n(a[1] ?? 0)) };
    case 'twist': return { tier: 'pen', s: D.twist(n(a[0] ?? 1), n(a[1] ?? 0)) };
    case 'cherry': return { tier: 'pen', s: D.cherry(n(a[0] ?? 1), n(a[1] ?? 0)) };
    case 'olive': return { tier: 'pen', s: D.olivePick(n(a[0] ?? 1), n(a[1] ?? 0)) };
    case 'coupe': return { tier: 'pen', s: D.coupe(n(a[0] ?? 1), n(a[1] ?? 0)) };
    case 'shaker': return { tier: 'pen', s: D.shaker(n(a[0] ?? 1), n(a[1] ?? 0)) };
    case 'crown': return { tier: 'pen', s: D.crown(n(a[0] ?? 1), n(a[1] ?? 0)) };
    case 'arrow': return { tier: 'pen', s: D.arrow([n(a[0]), n(a[1])], [n(a[2]), n(a[3])], n(a[4] ?? 10)) };
    default: throw new Error(`unknown mark spec ${spec}`);
  }
}

/** The thinnest ink across a polygon set, estimated as the least distance between the two sides of each stroke. */
function thinnest(polys) {
  let min = Infinity;
  for (const p of polys) {
    const n2 = p.length;
    if (n2 < 20) continue;
    // A stroke polygon is left side out, cap, right side back: pair point i with its mirror.
    const half = Math.floor((n2 - 10) / 2);
    for (let i = 2; i < half - 2; i += 3) {
      const a = p[i];
      const b = p[n2 - 6 - i];
      if (!a || !b) continue;
      min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
  }
  return min;
}

const out = {};
let fail = 0;
for (const spec of [...specs].sort()) {
  const { tier, s } = make(spec);
  out[spec] = { d: s.d, box: s.box, tier, w: s.width ?? s.nominal?.[0], nh: s.nominal?.[1] };
  if (tier === 'pen') {
    const t = thinnest(s.polys);
    if (t < FLOOR - 0.02 && Number.isFinite(t)) {
      console.error(`  under the floor: ${spec} ${t.toFixed(3)}pt`);
      fail++;
    }
  }
}
// The logo, exactly as brand/paths.ts holds it (the board's Home bar draws it at 42pt tall).
const paths = readFileSync(fileURLToPath(new URL('../../../../src/components/brand/paths.ts', import.meta.url)), 'utf8');
const wm = /export const WORDMARK_PATH = \{[\s\S]*?d: '([^']+)'[\s\S]*?viewBox: \[([^\]]+)\]/.exec(paths);
const [vx, vy, vw, vh] = wm[2].split(',').map(Number);
out.wordmark = { d: [wm[1]], box: { x: vx, y: vy, w: vw, h: vh }, tier: 'pen' };
writeFileSync(BOARD + 'marks.js', `/* GENERATED by tools/build-marks.mjs. Do not edit. */\nwindow.MARKS=${JSON.stringify(out)};\n`);
console.log(`marks.js: ${Object.keys(out).length} marks`);
process.exit(fail ? 1 : 0);
