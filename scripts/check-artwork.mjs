/**
 * Artwork audit — verifies every drink resolves to a sane glass + pour.
 *
 * Compiles the two pure artwork modules standalone (they import only
 * types, so tsc can build them without React or the '@/' alias) and runs
 * all 460 drinks through them.
 *
 * Run: node scripts/check-artwork.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const out = mkdtempSync(join(tmpdir(), 'clink-art-'));

execFileSync(
  'npx',
  [
    'tsc',
    'src/components/artwork/liquid.ts',
    'src/components/artwork/glasses.ts',
    '--outDir',
    out,
    '--module',
    'es2022',
    '--target',
    'es2022',
    '--moduleResolution',
    'bundler',
    '--skipLibCheck',
    // Files are named explicitly, so tsconfig.json must be skipped.
    '--ignoreConfig',
  ],
  { cwd: ROOT, stdio: 'inherit' },
);

// tsc mirrors the source tree under outDir; rewrite to .mjs so Node treats
// the emitted files as ES modules regardless of the nearest package.json.
for (const name of ['liquid', 'glasses']) {
  const p = join(out, 'components/artwork', `${name}.js`);
  writeFileSync(
    join(out, `${name}.mjs`),
    readFileSync(p, 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'"),
  );
}

const { liquidColor, LIQUID, BEER_BY_SUBCATEGORY, WINE_BY_SUBCATEGORY } = await import(
  join(out, 'liquid.mjs')
);
const { resolveShape, takesFoam } = await import(join(out, 'glasses.mjs'));

const drinks = JSON.parse(readFileSync(join(ROOT, 'src/data/drinks.json'), 'utf8'));
const NAME_OF = Object.fromEntries(Object.entries(LIQUID).map(([k, v]) => [v, k]));

const shapeCount = {};
const colorCount = {};
const suspicious = [];

for (const d of drinks) {
  const shape = resolveShape(d);
  const color = liquidColor(d);
  const cname = NAME_OF[color] ?? color;

  shapeCount[shape] = (shapeCount[shape] ?? 0) + 1;
  colorCount[cname] = (colorCount[cname] ?? 0) + 1;

  // Combinations that would look obviously wrong on screen.
  if (d.category === 'beer' && ['redWine', 'rose', 'violet', 'blue'].includes(cname))
    suspicious.push([d.id, d.category, cname, 'beer in a wine/odd color']);
  if (d.category === 'wine' && ['nearBlack', 'coffee', 'mint', 'blue'].includes(cname))
    suspicious.push([d.id, d.category, cname, 'wine in a non-wine color']);
  // wineRed/wineWhite are legitimate for beer: Belgian ales are served in
  // chalices and goblets, which resolve to the wine shapes.
  if (
    d.category === 'beer' &&
    !['pint', 'pilsner', 'weizen', 'mug', 'tulip', 'snifter', 'rocks', 'flute', 'wineRed', 'wineWhite'].includes(shape)
  )
    suspicious.push([d.id, d.category, shape, 'beer in an unusual glass']);
  if (d.category === 'wine' && ['pint', 'pilsner', 'weizen', 'shot', 'highball'].includes(shape))
    suspicious.push([d.id, d.category, shape, 'wine in a beer/spirit glass']);
}

const pad = (o) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${String(v).padStart(4)}  ${k}`)
    .join('\n  ');

console.log(`\n  Glass shapes (${Object.keys(shapeCount).length} distinct)\n  ${pad(shapeCount)}`);
console.log(`\n  Pour colors (${Object.keys(colorCount).length} distinct)\n  ${pad(colorCount)}`);

// Foam should appear on the beers that are actually served with a head.
const foamed = drinks.filter((d) => takesFoam(resolveShape(d), d.category)).length;
console.log(`\n  Beers rendered with a foam head: ${foamed} / 100`);

// Beer and wine resolve via subcategory, so an unmapped one silently falls
// back to the category default. Catch that here rather than on screen.
const unmapped = [];
for (const d of drinks) {
  if (d.category === 'beer' && !BEER_BY_SUBCATEGORY[d.subcategory])
    unmapped.push(`beer/${d.subcategory}`);
  if (d.category === 'wine' && !WINE_BY_SUBCATEGORY[d.subcategory])
    unmapped.push(`wine/${d.subcategory}`);
}
const uniqueUnmapped = [...new Set(unmapped)];
console.log(
  uniqueUnmapped.length
    ? `\n  UNMAPPED subcategories: ${uniqueUnmapped.join(', ')}`
    : '\n  Every beer and wine subcategory is mapped.',
);

if (suspicious.length) {
  console.log(`\n  ${suspicious.length} suspicious pairing(s):`);
  for (const [id, cat, val, why] of suspicious.slice(0, 30)) {
    console.log(`    ${id.padEnd(28)} ${cat.padEnd(9)} ${String(val).padEnd(12)} ${why}`);
  }
} else {
  console.log('\n  No suspicious category/shape/color pairings.');
}
console.log('');
