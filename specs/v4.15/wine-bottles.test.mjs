#!/usr/bin/env node
/* ==================================================================== */
/* The wine bottlings, v4.15 (specs/v4.15/wine-bottles.md): a pure      */
/* check, no device, no React, no network                               */
/*                                                                      */
/*   1. Nothing moved. Every card build 40 shipped (d843d20, 4,671) is  */
/*      in the Dex byte for byte: same number, name, id and words. The  */
/*      bottlings follow its highest number (4674) in one run whose     */
/*      only gaps are the numbers retired by the fact-check (RETIRED),  */
/*      and every one is a wine with a -wb id.                          */
/*   2. The sources. Every bottling is a row of scripts/winebranddata/  */
/*      and every row a card; each row's style is a wine card, a bottle */
/*      filed under a place is from that place's country, no two rows   */
/*      fold to one name and none shares a name with another card.      */
/*   3. The map. Every bottling has an atlas link: its appellation, its */
/*      grape, or nothing for a style made anywhere; its own grapes are */
/*      atlas grapes; the atlas wines' rows still open their own cards. */
/*   4. The filters, run as the app runs them (dexFacets and dexFilter  */
/*      transpiled): every bottle has a colour, a country and, filed    */
/*      under a place, its card's Region option; a bottle naming atlas  */
/*      grapes is under each, and under its grape card's variety where  */
/*      its row names it ("Bonarda" is Bonarda Argentina in Mendoza);   */
/*      search finds it by name. And not one existing card moved in or  */
/*      out of any Style, Grape, Country or Region option.              */
/*   5. The words: no bottle says a thing App Review 1.4.3 refuses,     */
/*      none opens "A A…" or "A É…", and none names its card with the   */
/*      Dex's qualifier.                                                */
/*   6. Build 41's review notes and What to Test fit App Store Connect  */
/*      and count the Dex as build 41 shipped it (every number to 7899; */
/*      v4.16's style cards and their bottles follow it).               */
/*                                                                      */
/*   node specs/v4.15/wine-bottles.test.mjs                             */
/* ==================================================================== */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const bottles = DRINKS.filter((d) => W.isBottling(d.id));
const atlas = JSON.parse(read('src/data/wineAtlas.json'));
const links = JSON.parse(read('src/data/wineAtlasLinks.json'));
const idx = W.atlasIndex(atlas);
const rows = W.loadWineBrands();

/** Build 40's last number: the bottlings follow it. */
const LAST_BEFORE = 4674;

/*
 * The numbers the fact-check retired (v4.15's review): bottlings taken
 * out with remove-drinks.mjs --keep-numbers, never reused. A renamed
 * bottling is a new id, so it took a new number after the highest
 * (Domaine du Tariquet St-Amand Le Rosé, 7899) and left its old one here.
 */
const RETIRED = new Map([
  [4756, 'Mumm Grand Cordon'],
  [5697, 'Domaine Lafage Miraflors Rosé'],
  [5709, 'Domaine Lafage Centenaire'],
  [5720, 'Domaine du Tariquet Rosé St-Amand'],
  [6431, 'Monte Velho Red'],
  [6432, 'Monte Velho White'],
  [6433, 'Monte Velho Rosé'],
  [6442, 'Casal Garcia Tinto'],
  [6461, 'Herdade do Peso Vinha do Monte Red'],
  [6462, 'Herdade do Peso Vinha do Monte White'],
  [6539, 'EA Tinto'],
]);

/*
 * The style cards v4.16 wrote (specs/v4.16/style-cards.md), numbered
 * after the bottlings, 7900 to 7905, with the bottles filed under them
 * after those. specs/v4.16/style-cards.test.mjs checks them; here they are
 * the one kind of new card that is not a bottling.
 */
const STYLE_CARDS_V416 = new Set(['new-world-moscato', 'sweet-red', 'california-red-blend', 'red-blend', 'new-world-rose', 'white-blend']);

/* ---- 1. Nothing moved ---- */

{
  let shipped = null;
  try {
    shipped = JSON.parse(execFileSync('git', ['-C', root, 'show', 'd843d20:src/data/drinks.json'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8'));
  } catch {
    console.log('skip the catalogue against d843d20: git could not read it (a shallow clone?)');
  }
  if (shipped) {
    const moved = shipped.filter((d) => JSON.stringify(byId.get(d.id)) !== JSON.stringify(d));
    ok(
      moved.length === 0,
      `all ${fmt(shipped.length)} cards of build 40 are as they were, number, name, id and every word` +
        (moved.length ? ` (moved: ${moved.slice(0, 3).map((d) => d.id).join(', ')})` : ''),
    );
    ok(Math.max(...shipped.map((d) => d.dexNumber)) === LAST_BEFORE, `build 40's highest number is ${LAST_BEFORE}`);
    const fresh = DRINKS.filter((d) => !shipped.some((s) => s.id === d.id));
    ok(
      fresh.length === bottles.length + STYLE_CARDS_V416.size && fresh.every((d) => W.isBottling(d.id) || STYLE_CARDS_V416.has(d.id)),
      `everything new is a bottling or one of v4.16's ${STYLE_CARDS_V416.size} style cards (${fmt(fresh.length)})`,
    );
  }
  const nums = bottles.map((d) => d.dexNumber).sort((a, b) => a - b);
  const last = nums[nums.length - 1];
  const styleNums = DRINKS.filter((d) => STYLE_CARDS_V416.has(d.id)).map((d) => d.dexNumber).sort((a, b) => a - b);
  const run = [...nums, ...RETIRED.keys(), ...styleNums].sort((a, b) => a - b);
  ok(
    nums[0] === LAST_BEFORE + 1 && run.every((n, i) => n === LAST_BEFORE + 1 + i),
    `the ${fmt(bottles.length)} bottlings run Nº ${nums[0]} to ${last}, the only gaps the ${RETIRED.size} retired numbers and v4.16's style cards (${styleNums[0]}–${styleNums[styleNums.length - 1]})`,
  );
  ok(
    [...RETIRED].every(([n, name]) => !DRINKS.some((d) => d.dexNumber === n || d.name === name)),
    'no retired number or name is in the Dex',
  );
  ok(bottles.every((d) => d.category === 'wine'), 'every bottling is a wine');
  ok(DRINKS.every((d, i) => i === 0 || d.dexNumber > DRINKS[i - 1].dexNumber), 'drinks.json is in Dex order, no number shared');
}

/* ---- 2. The sources ---- */

{
  const rowIds = rows.map(W.bottlingId);
  ok(new Set(rowIds).size === rows.length, `no two rows fold to one name (${fmt(rows.length)} rows)`);
  ok(rowIds.every((id) => byId.has(id)) && bottles.every((d) => rowIds.includes(d.id)), 'every row is a card, and every bottling card a row');
  const styles = W.styleCards(DRINKS);
  ok(rows.every((b) => styles.has(b.s)), `every row is filed under a wine card (${new Set(rows.map((b) => b.s)).size} of them)`);
  const abroad = rows.filter((b) => {
    const f = W.styleFacts(styles.get(b.s), idx);
    return f.kind === 'place' && idx.country(f.atlasWine) !== b.c;
  });
  ok(abroad.length === 0, `a bottle filed under a place is from its country${abroad.length ? ` (${abroad[0].n})` : ''}`);
  const others = new Set(DRINKS.filter((d) => !W.isBottling(d.id)).map((d) => fold(d.name)));
  ok(!rows.some((b) => others.has(fold(b.n))), 'no bottle shares its name with a card that is not one');
  ok(rows.every((b) => /^https?:\/\//.test(b.src)), 'every row says where it was confirmed');
  ok(bottles.every((d) => d.name === rows[rowIds.indexOf(d.id)].n), 'every card is named as its producer spells it');
}

/* ---- 3. The map ---- */

{
  const grapeNames = new Set(atlas.grapes.map((g) => g.name));
  const atlasNames = new Set(atlas.wines.map((w) => w.n));
  const styles = W.styleCards(DRINKS);
  const wrong = rows.filter((b) => {
    const l = links[W.bottlingId(b)];
    const f = W.styleFacts(styles.get(b.s), idx);
    if (!l) return true;
    if (f.kind === 'place') return l.wines.length !== 1 || l.wines[0] !== f.atlasWine.n || l.grape !== null;
    if (f.kind === 'variety') return l.wines.length !== 0 || l.grape !== f.grape;
    return l.wines.length !== 0 || l.grape !== null;
  });
  ok(wrong.length === 0, `every bottling is on the map where its card is: its appellation, its grape, or nowhere for a style${wrong.length ? ` (${wrong[0].n})` : ''}`);
  ok(
    bottles.every((d) => links[d.id].wines.every((n) => atlasNames.has(n)) && (links[d.id].grapes ?? []).every((g) => grapeNames.has(g))),
    'every appellation and grape a bottling names is in the atlas',
  );
  const withGrapes = bottles.filter((d) => links[d.id].grapes?.length).length;
  ok(withGrapes === rows.filter((b) => W.atlasGrapes(b, idx, W.styleFacts(styles.get(b.s), idx)).length).length, `${fmt(withGrapes)} bottlings carry their own grapes`);
  ok(!Object.entries(links).some(([id, l]) => !W.isBottling(id) && 'grapes' in l), 'only a bottling carries grapes of its own');
  /* The Wine Atlas: each atlas wine still opens a card that is not a bottle, first pass or second. */
  const owners = new Map();
  for (const [id, l] of Object.entries(links)) if (!W.isBottling(id) && l.wines.length === 1 && !owners.has(l.wines[0])) owners.set(l.wines[0], id);
  for (const [id, l] of Object.entries(links)) if (!W.isBottling(id)) for (const w of l.wines) if (!owners.has(w)) owners.set(w, id);
  ok(atlas.wines.every((w) => owners.has(w.n)), `all ${fmt(atlas.wines.length)} atlas wines open a card of their own, never a bottling`);
  ok(/filter\(\(id\) => !id\.endsWith\('-wb'\)\)/.test(read('src/data/wineAtlasLinks.ts')), 'cardOfAtlasWine leaves the bottlings out');
}

/* ---- 4. The filters, as the app runs them ---- */

const dir = mkdtempSync(join(tmpdir(), 'sipply-bottles-'));
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
let F, R, D, L, A;
try {
  for (const [name, code] of Object.entries(STUBS)) writeFileSync(join(dir, `${name}.mjs`), code);
  for (const [name, [rel, imports]] of Object.entries(FILES)) {
    let js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: rel }).outputText;
    js = js.replace(/from ['"]([^'"]+)['"]/g, (whole, spec) => {
      if (!(spec in imports)) throw new Error(`${rel} imports ${spec}, which this check does not point anywhere`);
      return `from './${imports[spec]}.mjs'`;
    });
    writeFileSync(join(dir, `${name}.mjs`), js);
  }
  F = await import(pathToFileURL(join(dir, 'dexFilter.mjs')).href);
  R = await import(pathToFileURL(join(dir, 'dexRows.mjs')).href);
  D = await import(pathToFileURL(join(dir, 'dexFacets.mjs')).href);
  L = await import(pathToFileURL(join(dir, 'wineAtlasLinks.mjs')).href);
  A = await import(pathToFileURL(join(dir, 'wineAtlas.mjs')).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const ctx = { caught: () => false, canMake: null };
const LISTS = { style: 'styles', grape: 'grapes', country: 'countries', region: 'regions' };

/** The ids under each Style, Grape, Country and Region option, for these wines, in this model. */
function membership(model, wines) {
  const out = new Map();
  for (const [facet, field] of Object.entries(LISTS)) {
    for (const o of model.options[facet]) {
      if (facet === 'style' && o.kind !== 'wine') continue;
      const m = model.matcher({ ...D.NO_FACETS, kind: 'wine', [field]: [o.key] }, ctx);
      out.set(`${facet}:${o.key}`, wines.filter(m).map((d) => d.id).join(' '));
    }
  }
  return out;
}

{
  const model = F.dexFacets();
  const wines = DRINKS.filter((d) => d.category === 'wine');
  const isIn = (facet, key) => model.matcher({ ...D.NO_FACETS, kind: 'wine', [LISTS[facet]]: [key] }, ctx);
  const styleOf = (d) => model.options.style.filter((o) => o.kind === 'wine' && isIn('style', o.key)(d));
  ok(bottles.every((d) => styleOf(d).length === 1), 'every bottling has one colour in the Style filter');
  const countries = model.options.country.map((o) => o.key);
  const noCountry = bottles.filter((d) => !countries.some((k) => isIn('country', k)(d)));
  ok(noCountry.length === 0, `every bottling is under a country${noCountry.length ? ` (${noCountry[0].name})` : ''}`);
  const styles = W.styleCards(DRINKS);
  const placed = rows.filter((b) => W.styleFacts(styles.get(b.s), idx).kind === 'place');
  const regions = model.options.region.map((o) => o.key);
  /*
   * A bottle filed under a place is in its card's Region option, the very
   * one: a Biondi-Santi beside the Brunello card in Montalcino, not in
   * Tuscany. A nationwide name (Vin de France, IGP Pays d'Oc, Sekt
   * Austria) is in no region, and its bottle is in one only where some
   * card is too.
   */
  const regionsOf = (d) => regions.filter((k) => isIn('region', k)(d));
  const cardsIn = new Set(wines.filter((d) => !W.isBottling(d.id)).flatMap(regionsOf));
  const offRegion = placed.filter((b) => {
    const r = regionsOf(byId.get(W.bottlingId(b)));
    const c = regionsOf(styles.get(b.s));
    return c.length ? r.join() !== c.join() : r.length > 1 || (r.length === 1 && !cardsIn.has(r[0]));
  });
  ok(
    offRegion.length === 0,
    `every bottling filed under a place is in its card's Region option (${fmt(placed.length)})` +
      (offRegion.length ? ` (${offRegion.length}: ${offRegion.slice(0, 3).map((b) => `${b.n} in ${regionsOf(byId.get(W.bottlingId(b))).join('+') || 'none'}, ${b.s} in ${regionsOf(styles.get(b.s)).join('+') || 'none'}`).join('; ')})` : ''),
  );
  const brunello = placed.filter((b) => b.s === 'Brunello di Montalcino').map((b) => byId.get(W.bottlingId(b)));
  ok(brunello.length > 0 && brunello.every((d) => isIn('region', 'Montalcino|Italy')(d)), `Region = Montalcino holds the Brunello card's ${brunello.length} bottles`);
  const grapeMiss = bottles.filter((d) => (links[d.id].grapes ?? []).some((g) => model.indexOf('grape', g) < 0 || !isIn('grape', g)(d)));
  ok(grapeMiss.length === 0, `a bottling naming its grapes is under each of them in the Grape filter${grapeMiss.length ? ` (${grapeMiss[0].name})` : ''}`);
  const krug = byId.get('krugclosdumesnil-wb');
  ok(krug && isIn('grape', 'Chardonnay')(krug) && !isIn('grape', 'Pinot Noir')(krug), 'Krug Clos du Mesnil is Chardonnay, not all Le Mesnil permits');
  /* A row's grape read against its card: under a grape card, a name that begins the card's variety is that variety. */
  const leftCard = rows.filter((b) => {
    const f = W.styleFacts(styles.get(b.s), idx);
    if (f.kind !== 'variety' || !f.grape) return false;
    const loose = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const names = (b.grapes ?? []).some((g) => idx.grape(g) === f.grape || loose(f.grape) === loose(g) || loose(f.grape).startsWith(`${loose(g)} `));
    return names && !isIn('grape', f.grape)(byId.get(W.bottlingId(b)));
  });
  ok(leftCard.length === 0, `a bottling whose row names its grape card's variety is under that variety${leftCard.length ? ` (${leftCard[0].n})` : ''}`);
  const bonarda = ['elenemigobonarda-wb', 'zuccardiemmabonarda-wb', 'zuccardiserieabonarda-wb'].map((id) => byId.get(id));
  const trebbiano = ['masciarellitrebbianodabruzzo-wb', 'valentinitrebbianodabruzzo-wb', 'emidiopepetrebbianodabruzzo-wb'].map((id) => byId.get(id));
  ok(
    bonarda.every((d) => d && isIn('grape', 'Bonarda Argentina')(d) && !isIn('grape', 'Croatina')(d)) &&
      trebbiano.every((d) => d && isIn('grape', 'Trebbiano Abruzzese')(d) && !isIn('grape', 'Trebbiano Toscano')(d)),
    "Argentina's Bonardas are Bonarda Argentina, not Croatina; Abruzzo's Trebbianos Trebbiano Abruzzese, not Toscano",
  );
  const unfound = bottles.filter((d) => !R.searchHits(d.name).some((h) => h.id === d.id));
  ok(unfound.length === 0, `search finds every bottling by its name${unfound.length ? ` (${unfound[0].name})` : ''}`);
  ok(R.searchHits('opus one').some((d) => d.id === 'opusone-wb') && R.searchHits('yellow tail').length >= 7, 'search reads producer words: "opus one", "yellow tail"');
  ok(atlas.wines.every((w) => !W.isBottling(L.cardOfAtlasWine(w.n) ?? '')), 'no atlas row opens a bottling');
  ok(A.ATLAS_COUNTS.wines === atlas.wines.length, `the Wine Atlas still lists its ${fmt(atlas.wines.length)} appellations and styles, no bottles`);

  /* Not one existing card moved in or out of an option. */
  const before = D.createFacets({
    drinks: DRINKS.filter((d) => !W.isBottling(d.id)),
    flavours: [],
    spirits: [],
    flavourMask: () => 0,
    spiritMask: () => 0,
    grapesOf: (d) => {
      const l = links[d.id];
      if (!l) return [];
      const out = new Set();
      for (const w of A.winesByName(l.wines)) for (const g of A.grapeNamesOf(w)) out.add(g);
      if (l.grape) out.add(l.grape);
      return [...out];
    },
    styleWord: (s) => s,
    words: { kind: { cocktail: 'Cocktails', spirit: 'Spirits', wine: 'Wines' }, status: { all: 'All', unlocked: 'Logged', locked: 'Not yet' }, strength: { light: 'Light', medium: 'Medium', strong: 'Strong' }, make: 'I can make it' },
  });
  const old = wines.filter((d) => !W.isBottling(d.id));
  const was = membership(before, old);
  const now = membership(model, old);
  const changed = [...was].filter(([k, v]) => now.get(k) !== v).map(([k]) => k);
  ok(changed.length === 0, `no existing wine moved in or out of any of the ${fmt(was.size)} Style, Grape, Country and Region options${changed.length ? ` (${changed.slice(0, 4).join(', ')})` : ''}`);
}

/* ---- 5. The words ---- */

{
  const words = bottles.map((d) => [d.description, d.funFact, d.serve?.how].join(' ')).join('\n');
  ok(
    !/gulpable|pour generously|generous (?:measure|\w+-ounce pour)|full glasses|keep it coming|bottle wasted|second bottle|arm's reach of dinner|pour freely|drink it fast|guilt-free/i.test(words),
    'no bottling says a thing App Review 1.4.3 refuses',
  );
  ok(
    !bottles.some((d) => /^A [AEIOU]/i.test(d.description.normalize('NFD')) || /\(/.test(d.description.split(' from ')[0])),
    'no bottling opens "A A…" or "A É…", and none names its card with a Dex qualifier ("An Icewine", not "Icewine (Ontario)")',
  );
  const qualified = bottles.filter((d) => / bottlings? catalogued here\.$/.test(d.funFact) && /\(/.test(d.funFact));
  ok(qualified.length === 0, `no fun fact names its card with a Dex qualifier ("One of 9 Icewine bottlings")${qualified.length ? ` (${qualified[0].funFact})` : ''}`);
  ok(bottles.every((d) => d.serve?.how && d.composition?.components?.length >= 3 && d.tastingNotes?.length >= 2), 'every bottling has a serve, three composition lines and tasting notes');
}

/* ---- 6. Build 41's notes: within App Store Connect's 4,000 characters, and counting what build 41's Dex held ---- */

{
  const fig = (n) => fmt(n);
  /* Build 41's Dex: every number to 7899. What came after (v4.16, 7900 on) is counted by its own build's notes. */
  const B41 = DRINKS.filter((d) => d.dexNumber <= 7899);
  const wineCount = B41.filter((d) => d.category === 'wine').length;
  const bottles41 = B41.filter((d) => W.isBottling(d.id));
  for (const rel of ['specs/v4.15/review-notes-41.txt', 'specs/v4.15/wtt-41.txt']) {
    const n = [...read(rel)].length;
    ok(n <= 4000, `${rel}: ${fmt(n)} characters, App Store Connect's 4,000 at most`);
  }
  const notes = read('specs/v4.15/review-notes-41.txt');
  const old = read('specs/v4.14/review-notes-40.txt').split('\n');
  const now = notes.split('\n');
  ok(old.length === now.length && old.every((l, i) => l === now[i] || l.startsWith('The Dex.')), "only The Dex paragraph differs from build 40's review notes");
  const dex = now.find((l) => l.startsWith('The Dex.')) ?? '';
  ok(
    dex.includes(`${fig(B41.length)} entries`) && dex.includes(`${fig(wineCount)} wines`) && dex.includes(`${fig(bottles41.length)} bottles`),
    `the review notes count the Dex as build 41 shipped it: ${fig(B41.length)} entries, ${fig(wineCount)} wines, ${fig(bottles41.length)} bottles`,
  );
  const wtt = read('specs/v4.15/wtt-41.txt');
  const news = (wtt.split('New in this build:')[1]?.split('From the last build')[0] ?? '').split('\n').filter((l) => l.startsWith('- '));
  ok(
    /^- Real wine bottles\. /.test(news[0] ?? '') && news[0].includes(`${fig(bottles41.length)} of them`) && news[0].includes(`${fig(B41.length)} entries`) && /^- Dex titles now count cocktails and spirits only/.test(news[1] ?? ''),
    'What to Test leads with the real wine bottles, then the titles counting cocktails and spirits',
  );
  ok(!/title on Dex progress can read lower/.test(wtt), "and drops build 40's known issue that a title can read lower");
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
