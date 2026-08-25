/**
 * Builds src/data/wineAtlas.json from the pipe-delimited sources in
 * scripts/winedata/.
 *
 * The atlas is a REFERENCE layer, not part of the collectible Dex. Dex cards
 * are hand-authored and numbered 1-460; nothing here adds to that set or
 * touches a dexNumber. What it does is give the 90 wine cards something to
 * point at: every named wine on earth that carries an appellation, and the
 * grape varieties behind them, merged across synonyms.
 *
 * Run: node scripts/build-wine-atlas.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'scripts', 'winedata');

const rows = (file) =>
  readFileSync(join(DATA, file), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));

/* ---------------------------------------------------------------- */
/* Sources                                                           */
/* ---------------------------------------------------------------- */

const wineRows = rows('wines.psv').slice(1); // country|region|wine|tier|style|grapes
const notes = new Map(rows('notes.psv').map((r) => [r[0], r.slice(1).join('|')]));
const grapeRows = rows('grapes-meta.psv').slice(1); // canonical|color|origin|synonyms|note

/** Atlas values that are not grape varieties and must not enter the grape list. */
const NON_VARIETY = new Set(['Various', 'Field blend', 'Aromatized blend']);

/* ---------------------------------------------------------------- */
/* Grapes — one entry per variety, every regional synonym folded in  */
/* ---------------------------------------------------------------- */

const alias = new Map(); // any name -> canonical
const grapeMeta = new Map(); // canonical -> record

for (const [canonical, color, origin, synonyms = '', note = ''] of grapeRows) {
  const syns = synonyms
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  grapeMeta.set(canonical, { name: canonical, color, origin, synonyms: syns, note });
  for (const name of [canonical, ...syns]) alias.set(name, canonical);
}

const grapeNames = [...grapeMeta.keys()].sort((a, b) => collate(a, b));
const grapeIndex = new Map(grapeNames.map((n, i) => [n, i]));

/* ---------------------------------------------------------------- */
/* Countries                                                         */
/* ---------------------------------------------------------------- */

const countryNames = [...new Set(wineRows.map((r) => r[0]))].sort((a, b) => collate(a, b));
const countryIndex = new Map(countryNames.map((n, i) => [n, i]));

/* ---------------------------------------------------------------- */
/* Wines                                                             */
/* ---------------------------------------------------------------- */

const unmapped = new Set();
const wines = wineRows.map(([country, region, wine, tier, style, grapes]) => {
  const gi = [];
  for (const raw of grapes.split(';')) {
    const g = raw.trim();
    if (!g || NON_VARIETY.has(g)) continue;
    const canonical = alias.get(g);
    if (canonical === undefined) {
      unmapped.add(g);
      continue;
    }
    const idx = grapeIndex.get(canonical);
    if (!gi.includes(idx)) gi.push(idx);
  }
  return { n: wine, c: countryIndex.get(country), r: region, t: tier, s: style, g: gi };
});

if (unmapped.size) {
  console.error('Unmapped grape names — add them to grapes-meta.psv:');
  for (const g of unmapped) console.error('  ' + g);
  process.exit(1);
}

/* Sort: country, then region, then wine — the order the atlas screen reads in. */
wines.sort(
  (a, b) =>
    a.c - b.c || collate(a.r, b.r) || collate(a.n, b.n)
);

/* Back-reference each grape to the wines that cite it. */
const grapeWines = grapeNames.map(() => []);
wines.forEach((w, i) => {
  for (const g of w.g) grapeWines[g].push(i);
});

const out = {
  version: 1,
  generated: 'node scripts/build-wine-atlas.mjs',
  note:
    'Reference layer. A "wine" here is a named wine — an appellation, a protected ' +
    'denomination (AOC, DOCG, DO, AVA, GI, WO, PDO) or a classic style. Individual ' +
    'producer labels are not enumerable.',
  counts: {
    wines: wines.length,
    countries: countryNames.length,
    regions: new Set(wines.map((w) => w.c + '|' + w.r)).size,
    grapes: grapeNames.length,
    grapeNames: alias.size,
  },
  countries: countryNames.map((name) => ({
    name,
    note: notes.get(name) ?? '',
    wines: wines.filter((w) => countryNames[w.c] === name).length,
  })),
  grapes: grapeNames.map((name, i) => {
    const m = grapeMeta.get(name);
    return {
      name,
      color: m.color,
      origin: m.origin,
      synonyms: m.synonyms,
      note: m.note,
      wines: grapeWines[i],
      countries: [...new Set(grapeWines[i].map((w) => wines[w].c))].sort((a, b) => a - b),
    };
  }),
  wines,
};

writeFileSync(join(ROOT, 'src', 'data', 'wineAtlas.json'), JSON.stringify(out) + '\n');
console.log(
  `wineAtlas.json — ${out.counts.wines} wines · ${out.counts.countries} countries · ` +
    `${out.counts.regions} regions · ${out.counts.grapes} grapes (${out.counts.grapeNames} names)`
);

/** Accent-insensitive compare, so Échézeaux files under E. */
function collate(a, b) {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}
