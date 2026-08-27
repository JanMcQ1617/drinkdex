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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'scripts', 'winedata');

/* Letters that do not decompose under NFD, for accent folding. */
const FOLD_EXTRA = { '\u0111': 'd', '\u00f0': 'd', '\u00f8': 'o', '\u0142': 'l',
  '\u00e6': 'ae', '\u0153': 'oe', '\u00df': 'ss', '\u00fe': 'th', '\u0131': 'i' };

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
/**
 * The grape text exactly as the source writes it, kept beside each wine.
 *
 * The atlas itself stores canonical grape indices — Listán Blanco resolves
 * to Palomino — which is right for the grape list and wrong for a list
 * organised by place: a Canary label says Listán Blanco. The by-country and
 * A-Z lists print this raw text; only grape-varieties.md canonicalises.
 */
const rawGrapes = new WeakMap();

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
  const rec = { n: wine, c: countryIndex.get(country), r: region, t: tier, s: style, g: gi };
  rawGrapes.set(rec, grapes.split(';').map((x) => x.trim()).filter(Boolean).join(', '));
  return rec;
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

/* ------------------------------------------------------------------ */
/* Human-readable lists                                                */
/*                                                                     */
/* Emitted by THIS script on purpose. They were once generated by a    */
/* separate pipeline and silently went stale: the atlas grew           */
/* 1,558 -> 2,315 in the app while the lists sat unchanged for a day,  */
/* because nothing tied them together. Now the only way to regenerate  */
/* the atlas is to regenerate the lists with it.                       */
/* ------------------------------------------------------------------ */

const DOCS = join(ROOT, 'docs', 'wine');
mkdirSync(DOCS, { recursive: true });

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvRow = (cells) => cells.map((c) => csvCell(String(c))).join(',');
/* RFC 4180 line ending; Excel mis-parses accented UTF-8 rows without it. */
const csvJoin = (rows) => '\ufeff' + rows.join('\r\n') + '\r\n';

/* --- by country --- */
{
  const byCountry = new Map();
  for (const w of wines) {
    const c = countryNames[w.c];
    if (!byCountry.has(c)) byCountry.set(c, new Map());
    const regions = byCountry.get(c);
    if (!regions.has(w.r)) regions.set(w.r, []);
    regions.get(w.r).push(w);
  }
  const lines = [
    '# Wines of the World, by Country',
    '',
    `**${wines.length.toLocaleString('en-US')} named wines · ${countryNames.length} countries**`,
    '',
    'The unit is the *named wine*: an appellation, a protected denomination (AOC, DOCG, DO, AVA, GI, WO, PDO...), or a classic style with a name of its own. Individual producer labels are not enumerable — there are millions.',
    '',
    '---',
    '',
  ];
  for (const [country, regions] of byCountry) {
    let n = 0;
    for (const list of regions.values()) n += list.length;
    lines.push(`## ${country}`, '', `*${notes.get(country) ?? ''}*`, '', `**${plural(n, 'wine', 'wines')}**`, '');
    for (const [region, list] of regions) {
      lines.push(`### ${region}`, '');
      for (const w of list) {
        const g = rawGrapes.get(w) ?? '';
        lines.push(`- **${w.n}** — ${w.t} · ${w.s}${g ? ` · ${g}` : ''}`);
      }
      lines.push('');
    }
    lines.push('---', '');
  }
  writeFileSync(join(DOCS, 'wines-by-country.md'), lines.join('\n'));

  const csv = [csvRow(['Country', 'Region', 'Wine', 'Classification', 'Style', 'Grapes'])];
  for (const w of wines) {
    csv.push(csvRow([countryNames[w.c], w.r, w.n, w.t, w.s, (rawGrapes.get(w) ?? '').replace(/, /g, '; ')]));
  }
  writeFileSync(join(DOCS, 'wines-by-country.csv'), csvJoin(csv));
}

/* --- master A-Z --- */
{
  const sorted = wines.map((w, i) => i).sort((a, b) => collate(wines[a].n, wines[b].n));
  const lines = [
    '# Master List — Every Wine in the Atlas',
    '',
    `**${wines.length.toLocaleString('en-US')} named wines, A–Z, across ${countryNames.length} countries.**`,
  ];
  const csv = [csvRow(['#', 'Wine', 'Country', 'Region', 'Classification', 'Style', 'Grapes'])];
  let letter = null;
  sorted.forEach((idx, i) => {
    const w = wines[idx];
    const L = fold(w.n)[0].toUpperCase();
    if (L !== letter) { letter = L; lines.push('', `## ${letter}`, ''); }
    lines.push(`${i + 1}. **${w.n}** — ${countryNames[w.c]} · ${w.r} · ${w.t} · ${w.s}`);
    csv.push(csvRow([i + 1, w.n, countryNames[w.c], w.r, w.t, w.s, (rawGrapes.get(w) ?? '').replace(/, /g, '; ')]));
  });
  writeFileSync(join(DOCS, 'all-wines-master.md'), lines.join('\n') + '\n');
  writeFileSync(join(DOCS, 'all-wines-master.csv'), csvJoin(csv));
}

/* --- grape varieties --- */
{
  const byColor = new Map();
  for (const n of grapeNames) {
    const c = grapeMeta.get(n).color;
    byColor.set(c, (byColor.get(c) ?? 0) + 1);
  }
  const lines = [
    '# Grape Varieties',
    '',
    `**${grapeNames.length} canonical varieties** behind ${alias.size} names, across ${countryNames.length} countries.`,
    '',
    'Regional synonyms are merged: Syrah and Shiraz are one entry, as are Tempranillo, Tinta Roriz, Aragonez, Tinto Fino, Cencibel and Tinta de Toro.',
    '',
    '| Colour | Varieties |',
    '|---|---|',
    ...[...byColor.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `| ${c} | ${n} |`),
    '',
    '---',
  ];
  const csv = [csvRow(['#', 'Variety', 'Colour', 'Origin', 'Synonyms', 'Wines', 'Countries', 'Where grown', 'Note'])];
  let letter = null;
  grapeNames.forEach((name, i) => {
    const m = grapeMeta.get(name);
    const wl = grapeWines[i];
    const freq = new Map();
    for (const k of wl) {
      const c = countryNames[wines[k].c];
      freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    const where = [...freq.entries()].sort((a, b) => b[1] - a[1] || collate(a[0], b[0])).map(([c]) => c);
    const L = fold(name)[0].toUpperCase();
    if (L !== letter) { letter = L; lines.push('', `## ${letter}`, ''); }
    lines.push(`### ${name}`, '', `**${m.color}**${m.origin ? ` · origin ${m.origin}` : ''}`, '');
    if (m.synonyms.length) lines.push(`- *Also called:* ${m.synonyms.join(', ')}`);
    let l = `- *Wines in atlas:* ${wl.length}`;
    if (where.length) {
      l += ` across ${plural(where.length, 'country', 'countries')} — ${where.slice(0, 8).join(', ')}`;
      if (where.length > 8) l += ` +${where.length - 8} more`;
    }
    lines.push(l);
    if (m.note) lines.push(`- ${m.note}`);
    lines.push('');
    csv.push(csvRow([i + 1, name, m.color, m.origin, m.synonyms.join('; '), wl.length, where.length, where.join('; '), m.note]));
  });
  writeFileSync(join(DOCS, 'grape-varieties.md'), lines.join('\n'));
  writeFileSync(join(DOCS, 'grape-varieties.csv'), csvJoin(csv));
}

console.log(`docs/wine/ — 6 list files regenerated alongside the atlas`);

console.log(
  `wineAtlas.json — ${out.counts.wines} wines · ${out.counts.countries} countries · ` +
    `${out.counts.regions} regions · ${out.counts.grapes} grapes (${out.counts.grapeNames} names)`
);

/**
 * Accent-folded key, for grouping under a letter heading. Échézeaux must
 * land under E, and Đà Lạt under D — the latter needs the explicit map
 * because Đ does not decompose under NFD.
 */
function fold(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u0111\u00f0\u00f8\u0142\u00e6\u0153\u00df\u00fe\u0131]/g, (c) => FOLD_EXTRA[c]);
}

/** Accent-insensitive compare, so Échézeaux files under E. */
function collate(a, b) {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}
