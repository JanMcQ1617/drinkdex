/* Quick proof of the mark set: each mark at 1x on the page and at 2x, on a 1pt grid. Writes board/proof.html. */
process.removeAllListeners('warning');
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as D from './doodles.mjs';
import * as Fr from './frames.mjs';

const OUT = fileURLToPath(new URL('../board/proof.html', import.meta.url));
const RED = '#D0102C';
const items = [
  ['lime wheel', D.limeWheel()],
  ['twist', D.twist()],
  ['cherry', D.cherry()],
  ['olive pick', D.olivePick()],
  ['coupe', D.coupe()],
  ['shaker', D.shaker()],
  ['crown (8 deg)', D.crown(1, 8)],
  ['arrow (bolder: 8pt head)', D.arrow([0, 0], [-48, 48], -14)],
  ['crop corners 60x75 (tr bl, arms 15)', Fr.cropCorners(60, 75)],
  ['the post foot (corner rule, arm 15)', Fr.cornerRule()],
  ['double rule 160', Fr.doubleRule(160, 7)],
  ['signed end: coupe', D.signature('coupe', -4)],
  ['signed end: olive', D.signature('olive', -4)],
  ['stories rule drip (rejected)', Fr.dripRule(160, 0)],
  ['crop ticks (rejected)', Fr.cropTick(8)],
  ['ticket 220 x 120, notch 8 at 50', Fr.ticket(220, 120, 50), '#F5F5F5'],
  ['perforation, notch to notch', Fr.perforation(10, 210, 50), '#C4C4C4'],
  ['leader 120', Fr.leader(120), '#8A8A8A'],
];
const svg = (s, k, fill = RED) => {
  const { x, y, w, h } = s.box;
  return `<svg width="${w * k}" height="${h * k}" viewBox="${x} ${y} ${w} ${h}">${s.d.map((d) => `<path d="${d}" fill="${fill}"/>`).join('')}</svg>`;
};
const cells = items
  .map(
    ([name, s, f]) => `<div class="c"><div class="n">${name} · box ${s.box.w}x${s.box.h}</div><div class="r"><div class="one">${svg(s, 1, f)}</div><div class="big">${svg(s, 2, f)}</div></div></div>`,
  )
  .join('');
writeFileSync(
  OUT,
  `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font:500 12px Inter,system-ui;color:#5C5C5C}
.w{display:flex;flex-wrap:wrap;gap:20px;padding:20px;width:1160px}.c{width:340px;box-sizing:border-box}
.c{border:1px solid #eee;padding:12px}.r{display:flex;gap:24px;align-items:center;margin-top:8px}
.big{background-image:linear-gradient(#f2f2f2 1px,transparent 1px),linear-gradient(90deg,#f2f2f2 1px,transparent 1px);background-size:4px 4px}
svg{display:block;overflow:visible}</style><div class="w">${cells}</div>`,
);
console.log('wrote', OUT);
