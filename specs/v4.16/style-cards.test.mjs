#!/usr/bin/env node
/* ==================================================================== */
/* The six style cards, v4.16 (specs/v4.16/style-cards.md): a pure      */
/* check, no device, no React, no network                               */
/*                                                                      */
/*   1. The cards. California Red Blend, New World Rosé, New World      */
/*      Moscato, Red Blend, White Blend and Sweet Red are authored      */
/*      wine cards (scripts/winedexdata/00-classics.json), Nº 7900 to   */
/*      7905, with every field a style card carries, named like no      */
/*      other card and read as styles, not places or grapes. Moscato    */
/*      d'Asti is still Nº 2332.                                        */
/*   2. The bottles. The 57 rows v4.15 left out for want of these       */
/*      cards, by name and by card (20, 14, 13, 5, 2, 3), each a row of  */
/*      its own region's file and a card numbered after the six, each   */
/*      strength of its own inside its card's range.                    */
/*   3. Nothing moved. Every entry of build 41 (8429534, 7,885) is in   */
/*      the Dex byte for byte, every source row it was made from is in  */
/*      its file as it was, the eleven retired numbers stay unused, and */
/*      merge-wine-brands.mjs --check rebuilds every bottle from its    */
/*      row and finds drinks.json as it would write it.                 */
/*   4. The map. Each card says why it has no place in the atlas, each  */
/*      bottle is on it nowhere and carries its own grapes, and the      */
/*      atlas and every link build 41 had are as they were.             */
/*   5. The filters, run as the app runs them (dexFacets and dexFilter  */
/*      transpiled): each card's Style, Country and Region; each bottle  */
/*      in its colour, country and region and under its grapes; and not */
/*      one of build 41's entries, in any category, in or out of any    */
/*      option, against build 41's own dexFacets.                       */
/*   6. The words: nothing App Review 1.4.3 refuses (names and On the   */
/*      map lines included), the descriptions                           */
/*      and fun facts the merge writes, the pour colour (and no other    */
/*      drink's), no character the fonts have not drawn, and fit.mjs.   */
/*   7. The photo list.                                                 */
/*   8. Build 42's review notes and What to Test: within 4,000           */
/*      characters, counting the Dex as it is, the review notes build   */
/*      41's word for word but The Dex paragraph.                       */
/*                                                                      */
/*   node specs/v4.16/style-cards.test.mjs                              */
/* ==================================================================== */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(import.meta.url);
const root = join(dirname(here), '..', '..');
const at = (rel) => join(root, rel);
const read = (rel) => readFileSync(at(rel), 'utf8');
const require = createRequire(at('package.json'));
const ts = require('typescript');

let failed = 0;
const ok = (pass, line) => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${line}`);
};
const fmt = (n) => n.toLocaleString('en-US');

const { fold } = await import(pathToFileURL(at('scripts/lib/dex-merge.mjs')).href);
const W = await import(pathToFileURL(at('scripts/lib/wine-brands.mjs')).href);

const DRINKS = JSON.parse(read('src/data/drinks.json'));
const byId = new Map(DRINKS.map((d) => [d.id, d]));
const atlas = JSON.parse(read('src/data/wineAtlas.json'));
const links = JSON.parse(read('src/data/wineAtlasLinks.json'));
const idx = W.atlasIndex(atlas);
const rows = W.loadWineBrands();

/** Build 41, and the link to the Netlify site after it: the catalogue this adds to. */
const BUILD_41 = '8429534';
const LAST_BEFORE = 7899;
const RETIRED = [4756, 5697, 5709, 5720, 6431, 6432, 6433, 6442, 6461, 6462, 6539];

/** The six, in Nº order (their order in 00-classics.json), with the options the filters put each in. */
const CARDS = [
  { id: 'new-world-moscato', name: 'New World Moscato', n: 7900, sub: 'Dessert', origin: 'New World', style: 'wine:dessert', countries: [], region: null },
  { id: 'sweet-red', name: 'Sweet Red', n: 7901, sub: 'Dessert', origin: 'Worldwide', style: 'wine:dessert', countries: [], region: null },
  { id: 'california-red-blend', name: 'California Red Blend', n: 7902, sub: 'Regional Red', origin: 'California, USA', style: 'wine:red', countries: ['USA'], region: 'California|USA' },
  { id: 'red-blend', name: 'Red Blend', n: 7903, sub: 'Regional Red', origin: 'Worldwide', style: 'wine:red', countries: [], region: null },
  { id: 'new-world-rose', name: 'New World Rosé', n: 7904, sub: 'Rosé', origin: 'New World', style: 'wine:rose', countries: [], region: null },
  { id: 'white-blend', name: 'White Blend', n: 7905, sub: 'White', origin: 'Worldwide', style: 'wine:white', countries: [], region: null },
];
const cardIds = new Set(CARDS.map((c) => c.id));
const cardNames = new Set(CARDS.map((c) => c.name));

/*
 * The 57 rows v4.15's notes count as left out "for want of a card"
 * (specs/v4.15/wine-bottles.md, What was dropped): every one re-checked
 * on its producer's page (or a retailer's, for Jacob's Creek) and filed,
 * none dropped. [yellow tail] Jammy Red Roo, one of the notes' six
 * Australian and South African red blends, is a sweet red (its producer:
 * "Sweet and vibrant"; once sold as Sweet Red Roo), so it is filed under
 * Sweet Red, and the counts are 5 and 3 where the notes say 6 and 2. A
 * name here and not in the source, or the other way, fails.
 */
const ROWS = {
  'California Red Blend': [
    'Conundrum Red', 'Robert Mondavi Private Selection Red Blend', 'Woodbridge Red Blend', 'Decoy California Red Blend', 'Meiomi Red Blend',
    'Josh Cellars Legacy Red Blend', 'Barefoot Rich Red Blend', 'Apothic Red', 'Apothic Dark', 'Apothic Inferno', 'Apothic Crush',
    'Bogle Essential Red', 'Cupcake Vineyards Red Velvet', 'Cupcake Vineyards Black Forest', 'The Prisoner Red Blend', 'Unshackled Red Blend',
    'Bread & Butter Red Blend', 'Ménage à Trois Red Blend', 'Ménage à Trois Silk Soft Red Blend', 'Orin Swift Abstract',
  ],
  'New World Rosé': [
    'Woodbridge Rosé', 'Decoy California Rosé', "Kendall-Jackson Vintner's Reserve Rosé", 'Josh Cellars Rosé', 'Barefoot Rosé', 'Apothic Rosé',
    'Bogle Rosé', 'Cupcake Vineyards Rosé', 'Sutter Home White Merlot', 'Bread & Butter Rosé', 'JUSTIN Rosé', 'DAOU Rosé', '[yellow tail] Rosé',
    'Mulderbosch Cabernet Sauvignon Rosé',
  ],
  'New World Moscato': [
    'Woodbridge Moscato', 'Barefoot Red Moscato', 'Barefoot Moscato', 'Barefoot Pink Moscato', 'Cupcake Vineyards Moscato', 'Sutter Home Moscato',
    'Sutter Home Pink Moscato', 'Sutter Home Red Moscato', '[yellow tail] Moscato', '[yellow tail] Pink Moscato', "Jacob's Creek Classic Moscato",
    "Lindeman's Bin 90 Moscato", 'Wolf Blass Yellow Label Moscato',
  ],
  'Red Blend': ['[yellow tail] Big Bold Red', '19 Crimes Red Blend', '19 Crimes The Banished Dark Red', '19 Crimes Uprising Red Blend', 'KWV Roodeberg'],
  'White Blend': ['Conundrum White', 'Apothic White'],
  'Sweet Red': ['Barefoot Sweet Red Blend', 'Sutter Home Sweet Red', '[yellow tail] Jammy Red Roo'],
};
const COUNTS = { 'California Red Blend': 20, 'New World Rosé': 14, 'New World Moscato': 13, 'Red Blend': 5, 'White Blend': 2, 'Sweet Red': 3 };
/** The colours a bottle under each card may be. */
const COLOURS = {
  'California Red Blend': ['Red'],
  'New World Rosé': ['Rosé'],
  'New World Moscato': ['Sweet White', 'Sweet Rosé', 'Sweet Red'],
  'Red Blend': ['Red'],
  'White Blend': ['White'],
  'Sweet Red': ['Sweet Red'],
};
const newRows = rows.filter((b) => cardNames.has(b.s));
const bottleOf = (b) => byId.get(W.bottlingId(b));

const git = (path) => {
  try {
    return execFileSync('git', ['-C', root, 'show', `${BUILD_41}:${path}`], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  } catch {
    return null;
  }
};

/* ---- 1. The cards ---- */

{
  const source = JSON.parse(read('scripts/winedexdata/00-classics.json'));
  const LABELS = ['Grapes', 'Region', 'Vinification', 'Aging'];
  const ABV_RANGE = /^\d+(\.\d+)?–\d+(\.\d+)?%$/;
  const full = (d) =>
    d &&
    ['description', 'abv', 'origin', 'rarity', 'glassware', 'funFact'].every((k) => typeof d[k] === 'string' && d[k].trim()) &&
    ABV_RANGE.test(d.abv) &&
    d.rarity === 'common' &&
    Array.isArray(d.tastingNotes) && d.tastingNotes.length === 4 &&
    ['temp', 'glass', 'how'].every((k) => d.serve?.[k]) && d.serve.glass === d.glassware && d.serve.pair?.length === 3 &&
    d.composition?.summary && d.composition?.process &&
    JSON.stringify(d.composition.components.map((c) => c.label)) === JSON.stringify(LABELS) &&
    d.composition.components.every((c) => c.detail);
  const missing = CARDS.filter((c) => {
    const d = byId.get(c.id);
    return !d || d.category !== 'wine' || d.name !== c.name || d.dexNumber !== c.n || d.subcategory !== c.sub || d.origin !== c.origin || !full(d);
  });
  ok(missing.length === 0, `the six cards are wines Nº 7900–7905, each with every field a style card carries: description, strength range, origin, rarity, four tasting notes, glass, fun fact, serve and a Grapes, Region, Vinification and Aging composition${missing.length ? ` (${missing.map((c) => c.name).join(', ')})` : ''}`);
  const projected = (d) => {
    const { category, dexNumber, originStory, ...rest } = d;
    return JSON.stringify(rest);
  };
  const authored = source.filter((r) => cardIds.has(r.id));
  ok(
    authored.length === 6 && authored.every((r) => JSON.stringify(r) === projected(byId.get(r.id))) &&
      JSON.stringify(authored.map((r) => r.id)) === JSON.stringify(CARDS.map((c) => c.id)),
    'each is a row of scripts/winedexdata/00-classics.json, in its family\'s alphabetical place, and drinks.json carries it word for word',
  );
  const others = DRINKS.filter((d) => !cardIds.has(d.id));
  ok(!CARDS.some((c) => others.some((d) => fold(d.name) === fold(c.name) || d.id === c.id)), 'no other card, in any category, shares a name or an id with one of them');
  ok(
    CARDS.every((c) => W.styleFacts(byId.get(c.id), idx).kind === 'style' && !idx.wine(c.name) && !idx.grape(c.name)),
    'each reads as a style made anywhere, not an atlas appellation or grape (so "Moscato", a Muscat synonym, is not a card name)',
  );
  const asti = byId.get('moscato-dasti');
  ok(asti?.name === "Moscato d'Asti" && asti.dexNumber === 2332 && asti.origin === 'Piedmont, Italy', "Moscato d'Asti is still Nº 2332, by its own name");
  const leads = CARDS.filter((c) => W.styleFacts(byId.get(c.id), idx).lead);
  ok(leads.length === 0, 'no card\'s Grapes line names one grape its words are for, so every bottle of its colour takes its words');
}

/* ---- 2. The bottles ---- */

{
  const want = Object.entries(ROWS).flatMap(([s, ns]) => ns.map((n) => `${s} | ${n}`)).sort();
  const got = newRows.map((b) => `${b.s} | ${b.n}`).sort();
  ok(
    JSON.stringify(want) === JSON.stringify(got),
    `the 57 rows are filed, each under its card: ${Object.entries(COUNTS).map(([s, n]) => `${n} ${s}`).join(', ')}` +
      (JSON.stringify(want) !== JSON.stringify(got) ? ` (missing: ${want.filter((x) => !got.includes(x)).slice(0, 3).join('; ')}; extra: ${got.filter((x) => !want.includes(x)).slice(0, 3).join('; ')})` : ''),
  );
  ok(Object.entries(COUNTS).every(([s, n]) => newRows.filter((b) => b.s === s).length === n), 'and the counts are 20, 14, 13, 5, 2 and 3 (the notes\' 6 and 2, with Jammy Red Roo a sweet red)');
  const FILES = { 'United States': '09-california.json', Australia: '12-southern-hemisphere.json', 'South Africa': '12-southern-hemisphere.json' };
  ok(newRows.every((b) => FILES[b.c] === b.file), 'a Californian row is in 09-california, an Australian or South African one in 12-southern-hemisphere');
  ok(newRows.every((b) => COLOURS[b.s].includes(b.colour)), 'each is a colour its card holds (a Moscato white, pink or red, the rest their card\'s)');
  ok(newRows.every((b) => /^https?:\/\//.test(b.src) && (b.abv == null || /^\d+(\.\d+)?%$/.test(b.abv)) && (b.grapes == null || (b.grapes.length && !b.grapes.some((g) => /blend/i.test(g))))), 'each says where it was confirmed; a strength is one figure, and a grapes list names grapes, never "Red blend"');
  /* A card's range is its bottles': a bottle with a strength of its own is inside it, so the range a bottle without one shows is not narrower than its card's bottles. */
  const range = (abv) => abv.replace('%', '').split('–').map(Number);
  const outside = newRows.filter((b) => {
    if (b.abv == null) return false;
    const [lo, hi] = range(byId.get(CARDS.find((c) => c.name === b.s).id).abv);
    const [v] = range(b.abv);
    return v < lo || v > hi;
  });
  ok(outside.length === 0, `every strength of a bottle's own is inside its card's range (Apothic Inferno's 15.9% in California Red Blend's 12–16%)${outside.length ? ` (${outside.map((b) => `${b.n} ${b.abv}`).join(', ')})` : ''}`);
  const cards = newRows.map(bottleOf);
  ok(cards.every((d) => d && d.category === 'wine'), 'each is a -wb wine card');
  const nums = cards.map((d) => d?.dexNumber);
  ok(
    nums.every((n, i) => n === 7906 + i),
    `numbered after the six, 7906 to ${7906 + newRows.length - 1}, in the order of their files and rows, as merge-wine-brands.mjs numbers`,
  );
  const prior = new Set(DRINKS.filter((d) => d.dexNumber <= LAST_BEFORE).map((d) => fold(d.name)));
  ok(!newRows.some((b) => prior.has(fold(b.n))), 'none shares a name with a bottling or card the Dex had');
}

/* ---- 3. Nothing moved ---- */

{
  const shipped = JSON.parse(git('src/data/drinks.json') ?? 'null');
  if (!shipped) console.log(`skip the catalogue against ${BUILD_41}: git could not read it`);
  else {
    const moved = shipped.filter((d) => JSON.stringify(byId.get(d.id)) !== JSON.stringify(d));
    ok(moved.length === 0, `all ${fmt(shipped.length)} entries of build 41 are as they were, number, id, name and every word${moved.length ? ` (moved: ${moved.slice(0, 3).map((d) => d.id).join(', ')})` : ''}`);
    const fresh = DRINKS.filter((d) => !shipped.some((s) => s.id === d.id));
    ok(
      fresh.length === 6 + 57 && fresh.every((d) => d.dexNumber > LAST_BEFORE && (cardIds.has(d.id) || newRows.some((b) => W.bottlingId(b) === d.id))),
      `the ${fresh.length} new entries are the six cards and the 57 bottles, all after Nº ${LAST_BEFORE}`,
    );
    const count = (ds, c) => ds.filter((d) => d.category === c).length;
    ok(count(DRINKS, 'cocktail') === count(shipped, 'cocktail') && count(DRINKS, 'spirit') === count(shipped, 'spirit'), `cocktails (${count(DRINKS, 'cocktail')}) and spirits (${fmt(count(DRINKS, 'spirit'))}) as they were`);
  }
  ok(RETIRED.every((n) => !DRINKS.some((d) => d.dexNumber === n)), `the ${RETIRED.length} retired numbers stay unused`);
  ok(DRINKS.every((d, i) => i === 0 || d.dexNumber > DRINKS[i - 1].dexNumber), 'drinks.json is in Dex order, no number shared');
  /* The sources: every row build 41 was made from is in its file as it was, in its order; only the new rows were added. */
  const changed = [];
  for (const dir of ['scripts/winedexdata', 'scripts/winebranddata']) {
    for (const f of readdirSync(at(dir)).filter((x) => x.endsWith('.json'))) {
      const then = JSON.parse(git(`${dir}/${f}`) ?? 'null');
      if (!then) { changed.push(`${f} (not in build 41)`); continue; }
      const now = JSON.parse(read(`${dir}/${f}`)).map((r) => JSON.stringify(r));
      const kept = now.filter((r) => then.some((t) => JSON.stringify(t) === r));
      const added = now.filter((r) => !kept.includes(r)).map((r) => JSON.parse(r));
      const same = JSON.stringify(kept) === JSON.stringify(then.map((t) => JSON.stringify(t)));
      const ours = added.every((r) => cardIds.has(r.id) || cardNames.has(r.s));
      if (!same || !ours) changed.push(f);
    }
  }
  ok(changed.length === 0, `every source row of build 41 is in its file unchanged and in order; the only rows added are the six cards and the 57 bottles${changed.length ? ` (${changed.join(', ')})` : ''}`);
  /* And every bottle is what its row makes: the merge, run as a check, rebuilds them all and compares (a hand edit to a bottle's strength or words fails here). */
  const merged = spawnSync('node', [at('scripts/merge-wine-brands.mjs'), '--check'], { cwd: root, encoding: 'utf8', timeout: 180000 });
  const said = `${merged.stdout ?? ''}${merged.stderr ?? ''}`.split('\n').find((l) => l.startsWith('check:')) ?? merged.stderr?.trim().split('\n')[0] ?? '';
  ok(merged.status === 0, `merge-wine-brands.mjs --check: every bottling in drinks.json is what its row makes (${said.replace(/^check: /, '')})`);
}

/* ---- 4. The map ---- */

{
  ok(
    CARDS.every((c) => {
      const l = links[c.id];
      return l && l.wines.length === 0 && l.grape === null && typeof l.absent === 'string' && /rather than (an appellation wine|the wine of one place on the map)\./.test(l.absent) && !('grapes' in l);
    }),
    'each card says why it has no place in the atlas (an absent line, as the vermouths have), and points at nothing approximate',
  );
  ok(/Kindzmarauli/.test(links['sweet-red']?.absent ?? '') && !/any red grape/.test(links['new-world-rose']?.absent ?? ''), 'Sweet Red\'s says the sweet reds of named places are on the map under their own names; New World Rosé\'s does not say "any red grape" (Decoy\'s and Barefoot\'s have a white in them)');
  const off = newRows.filter((b) => {
    const l = links[W.bottlingId(b)];
    const grapes = W.atlasGrapes(b, idx, W.styleFacts(byId.get(CARDS.find((c) => c.name === b.s).id), idx));
    return !l || l.wines.length || l.grape !== null || JSON.stringify(l.grapes ?? []) !== JSON.stringify(grapes);
  });
  ok(off.length === 0, `each bottle is on the map nowhere, as a bottle of a style made anywhere is, and carries its own atlas grapes (${newRows.filter((b) => links[W.bottlingId(b)]?.grapes).length} of them name some)${off.length ? ` (${off[0].n})` : ''}`);
  const atlas41 = git('src/data/wineAtlas.json');
  const links41 = JSON.parse(git('src/data/wineAtlasLinks.json') ?? 'null');
  if (atlas41 && links41) {
    ok(atlas41 === read('src/data/wineAtlas.json'), 'the Wine Atlas is as it was, byte for byte: no new appellation, style or grape');
    const movedLinks = Object.keys(links41).filter((id) => JSON.stringify(links41[id]) !== JSON.stringify(links[id]));
    ok(movedLinks.length === 0, `every one of build 41's ${fmt(Object.keys(links41).length)} links is as it was${movedLinks.length ? ` (${movedLinks.slice(0, 3).join(', ')})` : ''}`);
  }
}

/* ---- 5. The filters, as the app runs them ---- */

const dir = mkdtempSync(join(tmpdir(), 'sipply-style-cards-'));
const jsonModule = (rel) => `import { readFileSync } from 'node:fs';\nexport default JSON.parse(readFileSync(${JSON.stringify(at(rel))}, 'utf8'));\n`;
const STUBS = {
  data: [
    `import { readFileSync } from 'node:fs';`,
    `export const DRINKS = JSON.parse(readFileSync(${JSON.stringify(at('src/data/drinks.json'))}, 'utf8')).sort((a, b) => a.dexNumber - b.dexNumber);`,
    `export const TOTAL = DRINKS.length;`,
    `const BY = new Map(DRINKS.map((d) => [d.id, d]));`,
    `export function getDrink(id) { return typeof id === 'string' ? BY.get(id) : undefined; }`,
    `export function formatCount(n) { return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }`,
  ].join('\n'),
  tasteTagsJson: jsonModule('src/data/tasteTags.json'),
  wineAtlasJson: jsonModule('src/data/wineAtlas.json'),
  wineAtlasLinksJson: jsonModule('src/data/wineAtlasLinks.json'),
};
const FILES = {
  dexFacets: ['src/components/dex/dexFacets.ts', {}],
  liquid: ['src/components/artwork/liquid.ts', {}],
  glasses: ['src/components/artwork/glasses.ts', {}],
  drinkLabels: ['src/lib/drinkLabels.ts', { '@/components/artwork/glasses': 'glasses' }],
  wineAtlas: ['src/data/wineAtlas.ts', { './wineAtlas.json': 'wineAtlasJson' }],
  wineAtlasLinks: ['src/data/wineAtlasLinks.ts', { './wineAtlasLinks.json': 'wineAtlasLinksJson' }],
  dexOrder: ['src/lib/dexOrder.ts', { '@/data': 'data', '@/data/tasteTags.json': 'tasteTagsJson' }],
  dexRows: ['src/components/dex/dexRows.ts', { '@/data': 'data' }],
  dexFilter: [
    'src/components/dex/dexFilter.ts',
    {
      '@/data': 'data',
      '@/data/wineAtlas': 'wineAtlas',
      '@/data/wineAtlasLinks': 'wineAtlasLinks',
      '@/lib/dexOrder': 'dexOrder',
      '@/lib/drinkLabels': 'drinkLabels',
      './dexFacets': 'dexFacets',
    },
  ],
};
/** Build 41's own dexFacets and pour colours, to hold the filters and the glass to what they were. */
const THEN = { dexFacets41: 'src/components/dex/dexFacets.ts', liquid41: 'src/components/artwork/liquid.ts' };
const transpile = (code, rel) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: rel }).outputText;
let F, R, D, A, LQ, D41, LQ41;
try {
  for (const [name, code] of Object.entries(STUBS)) writeFileSync(join(dir, `${name}.mjs`), code);
  for (const [name, [rel, imports]] of Object.entries(FILES)) {
    const js = transpile(read(rel), rel).replace(/from ['"]([^'"]+)['"]/g, (whole, spec) => {
      if (!(spec in imports)) throw new Error(`${rel} imports ${spec}, which this check does not point anywhere`);
      return `from './${imports[spec]}.mjs'`;
    });
    writeFileSync(join(dir, `${name}.mjs`), js);
  }
  for (const [name, rel] of Object.entries(THEN)) {
    const code = git(rel);
    if (code) writeFileSync(join(dir, `${name}.mjs`), transpile(code, rel));
  }
  F = await import(pathToFileURL(join(dir, 'dexFilter.mjs')).href);
  R = await import(pathToFileURL(join(dir, 'dexRows.mjs')).href);
  D = await import(pathToFileURL(join(dir, 'dexFacets.mjs')).href);
  A = await import(pathToFileURL(join(dir, 'wineAtlas.mjs')).href);
  LQ = await import(pathToFileURL(join(dir, 'liquid.mjs')).href);
  if (existsSync(join(dir, 'dexFacets41.mjs'))) D41 = await import(pathToFileURL(join(dir, 'dexFacets41.mjs')).href);
  if (existsSync(join(dir, 'liquid41.mjs'))) LQ41 = await import(pathToFileURL(join(dir, 'liquid41.mjs')).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const ctx = { caught: () => false, canMake: null };
const LISTS = { style: 'styles', grape: 'grapes', country: 'countries', region: 'regions' };
const WORDS = { kind: { cocktail: 'Cocktails', spirit: 'Spirits', wine: 'Wines' }, status: { all: 'All', unlocked: 'Logged', locked: 'Not yet' }, strength: { light: 'Light', medium: 'Medium', strong: 'Strong' }, make: 'I can make it' };

/** The ids under each Style, Grape, Country and Region option, for these wines, in this model. */
function membership(model, Dmod, wines) {
  const out = new Map();
  for (const [facet, field] of Object.entries(LISTS)) {
    for (const o of model.options[facet]) {
      if (facet === 'style' && o.kind !== 'wine') continue;
      const m = model.matcher({ ...Dmod.NO_FACETS, kind: 'wine', [field]: [o.key] }, ctx);
      out.set(`${facet}:${o.key}`, wines.filter(m).map((d) => d.id).join(' '));
    }
  }
  return out;
}

/**
 * The same over every category: the ids of each kind under each Strength,
 * Style, Grape, Country and Region option. A place a wine brings ("New
 * World", read as no country) could move a cocktail or a spirit as well.
 */
function membershipAll(model, Dmod, drinks) {
  const out = new Map();
  const kinds = ['cocktail', 'spirit', 'wine'];
  for (const [facet, field] of Object.entries({ strength: 'strength', ...LISTS })) {
    for (const o of model.options[facet]) {
      for (const kind of facet === 'style' ? [o.kind] : kinds) {
        const m = model.matcher({ ...Dmod.NO_FACETS, kind, [field]: [o.key] }, ctx);
        out.set(`${kind}:${facet}:${o.key}`, drinks.filter((d) => d.category === kind && m(d)).map((d) => d.id).join(' '));
      }
    }
  }
  return out;
}

{
  const model = F.dexFacets();
  const optionsOf = (facet, d) =>
    model.options[facet].filter((o) => (facet !== 'style' || o.kind === 'wine') && model.matcher({ ...D.NO_FACETS, kind: 'wine', [LISTS[facet]]: [o.key] }, ctx)(d)).map((o) => o.key);
  const wrongCards = CARDS.filter((c) => {
    const d = byId.get(c.id);
    return (
      JSON.stringify(optionsOf('style', d)) !== JSON.stringify([c.style]) ||
      JSON.stringify(optionsOf('country', d)) !== JSON.stringify(c.countries) ||
      JSON.stringify(optionsOf('region', d)) !== JSON.stringify(c.region ? [c.region] : []) ||
      optionsOf('grape', d).length
    );
  });
  ok(
    wrongCards.length === 0,
    'the cards\' options: California Red Blend and Red Blend are Red, New World Rosé Rosé, White Blend White, New World Moscato and Sweet Red Dessert; California Red Blend is in Country USA and Region California, the five made in many countries in no Country or Region (as Contemporary Gin, "Worldwide", is in none); none is in a Grape option' +
      (wrongCards.length ? ` (${wrongCards.map((c) => `${c.name}: ${['style', 'country', 'region', 'grape'].map((f) => optionsOf(f, byId.get(c.id)).join('+') || '-').join(' / ')}`).join('; ')})` : ''),
  );
  ok(model.indexOf('country', 'New World') < 0 && model.indexOf('country', 'Worldwide') < 0, '"New World" and "Worldwide" are not Country options');
  /* A bottle's own region's option; none for a bottle whose producer names no region (Wolf Blass's "Multi Region"). */
  const REGION = (b) => {
    if (!b.region) return [];
    const r = b.region.replace(/\s*\(.*\)$/, '');
    const c = b.c === 'United States' ? 'USA' : b.c;
    return [`${r}|${c}`];
  };
  const misplaced = newRows.filter((b) => {
    const d = bottleOf(b);
    const c = b.c === 'United States' ? 'USA' : b.c;
    const colour = { Red: 'wine:red', White: 'wine:white', Rosé: 'wine:rose', 'Sweet White': 'wine:dessert', 'Sweet Rosé': 'wine:dessert', 'Sweet Red': 'wine:dessert' }[b.colour];
    return (
      JSON.stringify(optionsOf('style', d)) !== JSON.stringify([colour]) ||
      JSON.stringify(optionsOf('country', d)) !== JSON.stringify([c]) ||
      JSON.stringify(optionsOf('region', d)) !== JSON.stringify(REGION(b))
    );
  });
  ok(
    misplaced.length === 0,
    `every bottle is in its colour's Style option, its country and its own region's option: California, South Eastern Australia, Coastal Region, Western Cape, and Wolf Blass's Moscato, which names no region, in none` +
      (misplaced.length ? ` (${misplaced.slice(0, 3).map((b) => `${b.n}: ${['style', 'country', 'region'].map((f) => optionsOf(f, bottleOf(b)).join('+') || '-').join(' / ')}`).join('; ')})` : ''),
  );
  const grapeMiss = newRows.filter((b) => (links[W.bottlingId(b)].grapes ?? []).some((g) => !optionsOf('grape', bottleOf(b)).includes(g)));
  ok(grapeMiss.length === 0, `a bottle naming its grapes is under each in the Grape filter (The Prisoner under Zinfandel, Petite Sirah…)${grapeMiss.length ? ` (${grapeMiss[0].n})` : ''}`);
  const prisoner = byId.get('theprisonerredblend-wb');
  ok(prisoner && optionsOf('grape', prisoner).includes('Zinfandel') && optionsOf('grape', prisoner).includes('Petite Sirah'), 'The Prisoner Red Blend is under Grape: Zinfandel and Petite Sirah');
  const unfound = [...CARDS.map((c) => byId.get(c.id)), ...newRows.map(bottleOf)].filter((d) => !R.searchHits(d.name).some((h) => h.id === d.id));
  ok(unfound.length === 0, `search finds each card and bottle by its name${unfound.length ? ` (${unfound[0].name})` : ''}`);
  const moscato = R.searchHits('moscato').map((d) => d.id);
  ok(moscato.includes('new-world-moscato') && moscato.includes('moscato-dasti') && moscato.includes('barefootmoscato-wb'), 'a search for "moscato" finds New World Moscato beside Moscato d\'Asti and the bottles');

  /* Not one of build 41's wines moved, against build 41's own dexFacets, catalogue and links. */
  const shipped = JSON.parse(git('src/data/drinks.json') ?? 'null');
  const links41 = JSON.parse(git('src/data/wineAtlasLinks.json') ?? 'null');
  if (D41 && shipped && links41) {
    const grapesOf41 = (d) => {
      const l = links41[d.id];
      if (!l) return [];
      if (l.grapes?.length) return l.grapes;
      const out = new Set();
      for (const w of A.winesByName(l.wines)) for (const g of A.grapeNamesOf(w)) out.add(g);
      if (l.grape) out.add(l.grape);
      return [...out];
    };
    const before = D41.createFacets({ drinks: shipped, flavours: [], spirits: [], flavourMask: () => 0, spiritMask: () => 0, grapesOf: grapesOf41, styleWord: (s) => s, words: WORDS });
    const wines41 = shipped.filter((d) => d.category === 'wine');
    const was = membership(before, D41, wines41);
    const now = membership(model, D, wines41.map((d) => byId.get(d.id)));
    const changed = [...was].filter(([k, v]) => now.get(k) !== v).map(([k]) => k);
    const fresh = [...now.keys()].filter((k) => !was.has(k));
    ok(
      changed.length === 0 && fresh.every((k) => now.get(k) === ''),
      `not one of build 41's ${fmt(wines41.length)} wines moved in or out of any of its ${fmt(was.size)} Style, Grape, Country and Region options, against build 41's own dexFacets and links${changed.length ? ` (${changed.slice(0, 4).join(', ')})` : ''}`,
    );
    ok(fresh.length === 0, `and the six cards and their bottles open no option build 41 did not have${fresh.length ? ` (${fresh.slice(0, 4).join(', ')})` : ''}`);
    const wasAll = membershipAll(before, D41, shipped);
    const nowAll = membershipAll(model, D, shipped.map((d) => byId.get(d.id)));
    const movedAll = [...wasAll].filter(([k, v]) => (nowAll.get(k) ?? '') !== v).map(([k]) => k);
    const newAll = [...nowAll].filter(([k, v]) => !wasAll.has(k) && v !== '').map(([k]) => k);
    ok(
      movedAll.length === 0 && newAll.length === 0,
      `and over every category: not one of build 41's ${fmt(shipped.length)} cocktails, spirits and wines in or out of any of its ${fmt(new Set([...wasAll.keys()].map((k) => k.replace(/^[a-z]+:/, ''))).size)} Strength, Style, Grape, Country and Region options${movedAll.length || newAll.length ? ` (${[...movedAll, ...newAll].slice(0, 4).join(', ')})` : ''}`,
    );
  } else console.log(`skip the filters against ${BUILD_41}: git could not read it`);
}

/* ---- 6. The words ---- */

{
  const added = [...CARDS.map((c) => byId.get(c.id)), ...newRows.map(bottleOf)];
  /* Every word a reader meets: the names, the cards' and bottles' words, and the cards' On the map lines. */
  const words = added
    .map((d) => [d.name, d.description, d.funFact, d.serve.how, d.serve.temp, ...d.serve.pair, ...d.tastingNotes, d.composition.summary, d.composition.process, ...d.composition.components.map((c) => c.detail), links[d.id]?.absent ?? ''].join(' '))
    .join('\n');
  const REFUSED =
    /\b(drink(s|ing)?|drank|sip(s|ping)?|quaff|crushable|gulp|easy[- ]drinking|easy to drink|part(y|ies)|celebrat\w*|brunch|picnic|pool(side)?|patio|porch|summer|weekend|tonight|happy hour|buzz|tipsy|drunk|hangover|refreshment|chug|guzzl\w*|bottomless|another glass|second (glass|bottle)|pour (freely|generously)|full glasses|keep it coming|guilt-free)\b/i;
  const hit = words.match(REFUSED);
  ok(!hit, `no card or bottle says a thing App Review 1.4.3 refuses, in its name, its words or its On the map line: nothing to drink more, no time or occasion, nothing easy to drink${hit ? ` ("${hit[0]}")` : ''}`);
  const descOff = newRows.filter((b) => {
    const d = bottleOf(b);
    const from = b.region ? `${b.region}, ${b.c === 'United States' ? 'USA' : b.c}` : b.c;
    return !d.description.startsWith(`A ${b.s} from ${from}.`) || d.funFact !== `One of ${COUNTS[b.s]} ${b.s} bottlings catalogued here.` || d.subcategory !== byId.get(CARDS.find((c) => c.name === b.s).id).subcategory;
  });
  ok(descOff.length === 0, `each bottle reads "A California Red Blend from California, USA." and "One of 20 California Red Blend bottlings catalogued here.", in its card's family${descOff.length ? ` (${bottleOf(descOff[0]).description})` : ''}`);
  const pinkRed = newRows.filter((b) => b.s === 'New World Moscato' && b.colour !== 'Sweet White').map(bottleOf);
  const sweetRed = newRows.filter((b) => b.s === 'Sweet Red').map(bottleOf);
  const BERRIES = ['muscat grape', 'strawberry', 'raspberry', 'cherry'];
  const whites = newRows.filter((b) => b.s === 'New World Moscato' && b.colour === 'Sweet White').map(bottleOf);
  ok(
    pinkRed.length === 5 && pinkRed.every((d) => JSON.stringify(d.serve) === JSON.stringify(byId.get('new-world-moscato').serve)) &&
      sweetRed.length === 3 && sweetRed.every((d) => JSON.stringify(d.tastingNotes) === JSON.stringify(byId.get('sweet-red').tastingNotes)),
    'the pink and red Moscatos take the Moscato card\'s serve, and the sweet reds the Sweet Red card\'s words (not STYLE\'s dessert-wine fig and cocoa)',
  );
  ok(
    pinkRed.every((d) => JSON.stringify(d.tastingNotes) === JSON.stringify(BERRIES)) &&
      whites.length === 8 && whites.every((d) => JSON.stringify(d.tastingNotes) === JSON.stringify(byId.get('new-world-moscato').tastingNotes)),
    `the pink and red Moscatos taste of red berries (${BERRIES.join(', ')}), as their producers write; the white ones of the card's ${byId.get('new-world-moscato').tastingNotes.join(', ')}`,
  );
  ok(
    W.styleFacts(byId.get('sweet-red'), idx).colours.size === 1 &&
      !W.cardDescribes({ n: 'X', s: 'Sweet Red', c: 'United States', colour: 'Sweet White' }, W.styleFacts(byId.get('sweet-red'), idx), idx),
    'Sweet Red\'s words are a sweet red\'s alone: a sweet white filed under it would not take them',
  );
  /* The pour colour: the new ones as they are, every other drink as build 41 poured it. */
  const COLOUR = (d) => LQ.liquidColor(d);
  const want = {
    'california-red-blend': 'redWine', 'red-blend': 'redWine', 'sweet-red': 'redWine', 'new-world-rose': 'rose', 'white-blend': 'whiteWine', 'new-world-moscato': 'amber',
  };
  const name = (c) => Object.entries(LQ.LIQUID).find(([, v]) => v === c)?.[0];
  const pourOff = Object.entries(want).filter(([id, c]) => name(COLOUR(byId.get(id))) !== c);
  const bottlePour = (b) => {
    if (b.s === 'New World Moscato') return { 'Sweet White': 'amber', 'Sweet Rosé': 'rose', 'Sweet Red': 'redWine' }[b.colour];
    return want[CARDS.find((c) => c.name === b.s).id];
  };
  const bottlesOff = newRows.filter((b) => name(COLOUR(bottleOf(b))) !== bottlePour(b));
  ok(
    pourOff.length === 0 && bottlesOff.length === 0,
    'the pour colour: the blends and the sweet reds red, the rosés and pink Moscatos pink, White Blend white, the Moscatos amber as Moscato d\'Asti is' +
      (pourOff.length || bottlesOff.length ? ` (${[...pourOff.map(([id]) => id), ...bottlesOff.map((b) => b.n)].slice(0, 3).join(', ')})` : ''),
  );
  const shipped = JSON.parse(git('src/data/drinks.json') ?? 'null');
  if (LQ41 && shipped) {
    const repainted = shipped.filter((d) => LQ.liquidColor(d) !== LQ41.liquidColor(d));
    ok(repainted.length === 0, `and every one of build 41's ${fmt(shipped.length)} drinks pours what it poured${repainted.length ? ` (${repainted.slice(0, 3).map((d) => d.name).join(', ')})` : ''}`);
    const drawn = new Set(shipped.flatMap((d) => [...d.name]));
    const fresh = [...new Set(added.flatMap((d) => [...d.name]))].filter((c) => !drawn.has(c));
    ok(fresh.length === 0, `no new name brings a character build 41's names did not have, so the fonts and faceAdvances.ts already draw them${fresh.length ? ` (${fresh.join('')})` : ''}`);
  }
  /* fit.mjs measures every name in Chrome; where there is no Chrome, say so rather than pass. */
  if (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')) {
    const fit = spawnSync('node', [at('specs/v4.10/type/tools/fit.mjs')], { cwd: root, encoding: 'utf8', timeout: 180000 });
    const line = (fit.stdout ?? '').split('\n').find((l) => l.startsWith('acceptance')) ?? '';
    ok(fit.status === 0 && / 0 under;/.test(line) && line.includes(`${DRINKS.length} names`), `fit.mjs: all ${fmt(DRINKS.length)} names at 22 and 60, none under: ${line.replace(/^[^:]*: /, '')}`);
  } else console.log('skip fit.mjs: no Chrome here');
}

/* ---- 7. The photo list ---- */

{
  const lines = read('specs/v4.16/new-wines-photo-list.csv').trim().split('\n');
  const head = lines[0];
  const body = lines.slice(1).map((l) => l.split(','));
  const nums = body.map((r) => Number(r[0]));
  const fresh = DRINKS.filter((d) => d.dexNumber > LAST_BEFORE);
  const byNumber = new Map(DRINKS.map((d) => [d.dexNumber, d]));
  ok(
    head === 'number,name,producer,style,colour,country,region' && body.length === fresh.length &&
      new Set(nums).size === nums.length && fresh.every((d) => nums.includes(d.dexNumber)) && body.every((r) => byNumber.get(Number(r[0]))?.name === r[1]),
    `specs/v4.16/new-wines-photo-list.csv: the ${fresh.length} new entries, each by its number and name`,
  );
  ok(body.slice(0, 6).every((r) => CARDS.some((c) => c.n === Number(r[0]))) && body.slice(6).every((r) => r[2] && cardNames.has(r[3])), 'the six cards first, then the bottles, each with its producer and card');
}

/* ---- 8. Build 42's notes ---- */

{
  const wines = DRINKS.filter((d) => d.category === 'wine');
  const bottles = wines.filter((d) => W.isBottling(d.id));
  for (const rel of ['specs/v4.16/review-notes-42.txt', 'specs/v4.16/wtt-42.txt']) {
    const n = [...read(rel)].length;
    ok(n <= 4000, `${rel}: ${fmt(n)} characters, App Store Connect's 4,000 at most`);
  }
  const was = read('specs/v4.15/review-notes-41.txt').split('\n');
  const now = read('specs/v4.16/review-notes-42.txt').split('\n');
  ok(was.length === now.length && was.every((l, i) => l === now[i] || l.startsWith('The Dex.')), "only The Dex paragraph differs from build 41's review notes");
  const dex = now.find((l) => l.startsWith('The Dex.')) ?? '';
  ok(
    dex.includes(`${fmt(DRINKS.length)} entries`) && dex.includes(`${fmt(wines.length)} wines`) && dex.includes(`${fmt(wines.length - bottles.length)} regions, styles and grapes`) &&
      dex.includes(`${fmt(bottles.length)} bottles`) && dex.includes(`(${DRINKS.length - 7885} entries new in this build)`),
    `the review notes count the Dex as it is: ${fmt(DRINKS.length)} entries, ${fmt(wines.length)} wines, ${fmt(bottles.length)} of them bottles, ${DRINKS.length - 7885} new`,
  );
  const wtt = read('specs/v4.16/wtt-42.txt');
  const news = (wtt.split('New in this build:')[1]?.split('From the last build')[0] ?? '').split('\n').filter((l) => l.startsWith('- '));
  ok(
    /^- Six wine styles: /.test(news[0] ?? '') && CARDS.every((c) => news[0].includes(c.name)) && news[0].includes(`${newRows.length} bottles`) &&
      news[0].includes(`${fmt(DRINKS.length)} entries`) && news[0].includes(`${fmt(wines.length)} wines, ${fmt(bottles.length)} of them bottles`) &&
      /sipply\.netlify\.app/.test(news[1] ?? ''),
    'What to Test leads with the six styles and their bottles, counting the Dex as it is, then the links to sipply.netlify.app',
  );
  const named = (news[0].match(/among them (.*?)\. /)?.[1] ?? '').split(/, | and /);
  ok(named.length >= 5 && named.every((n) => newRows.some((b) => b.n === n)), `the bottles it names are among the 57 (${named.join('; ')})`);
  ok(/From the last build: real wine bottles/.test(wtt) && /titles count cocktails and spirits only/.test(wtt), 'and keeps build 41\'s bottles and titles as From the last build');
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
