#!/usr/bin/env node
/* ==================================================================== */
/* The Dex's filters, v4.14 (specs/v4.14/filters.md): a pure check, no  */
/* device, no React, no network                                         */
/*                                                                      */
/* What the redesign rests on, each run on the real catalogue with the  */
/* app's own code (components/dex/dexFacets, dexFilter and dexRows,     */
/* lib/dexOrder, lib/drinkLabels, data/wineAtlas, transpiled with the   */
/* project's `typescript`, their imports pointed at the data files):    */
/*                                                                      */
/*   1. Every figure is what a tap would show. Each option's count is   */
/*      checked against the grid counted the slow way, one full pass    */
/*      per option, Type's switch-and-drop included, and "Show N"       */
/*      against the grid dexRows draws, with and without a search.      */
/*   2. Nothing leads to zero. A long walk of taps on what the sheet     */
/*      and its See all pages offer, never on a dimmed option, never    */
/*      leaves an empty grid, and a tap on a figure shows that figure.  */
/*   3. The four old groups count as they did: lib/dexOrder's           */
/*      facetCounts (held to the v4.2 reference by check-recommend)     */
/*      and dexFacets agree on Flavour, Spirit, Type and In your Dex,   */
/*      but for Wines while a flavour or spirit is on, which now counts */
/*      the wines a tap on it shows.                                    */
/*   4. The facets read the data right: a strength for every drink with */
/*      an ABV, a style for every wine, countries with no "and" or      */
/*      compass word and none of the regions that are not one country,  */
/*      grapes on wines alone, each region with its country.            */
/*   5. What is offered: the groups each type draws, the first few and  */
/*      See all, the quick picks in their fixed order (Light the only   */
/*      strength, I can make it only with a bar).                       */
/*   6. VoiceOver and App Review 1.4.3: each option says its figure and */
/*      the sheet's rows say selected and dimmed; the words the filters */
/*      add are neutral.                                                */
/*   7. Fast enough: the facets build in well under a frame budget's    */
/*      worth of milliseconds in Node, and a count is about one.        */
/*                                                                      */
/*   node specs/v4.14/filters.test.mjs                                  */
/* ==================================================================== */

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

/* ---- Load the app's code, its imports pointed at the data ---- */

const dir = mkdtempSync(join(tmpdir(), 'sipply-filters-'));
const jsonModule = (rel) =>
  `import { readFileSync } from 'node:fs';\nexport default JSON.parse(readFileSync(${JSON.stringify(at(rel))}, 'utf8'));\n`;
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
/** Each app file, and where its run-time imports go. Type-only imports are gone after transpiling. */
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

let F, O, R, D, facetsSrc;
try {
  for (const [name, code] of Object.entries(STUBS)) writeFileSync(join(dir, `${name}.mjs`), code);
  for (const [name, [rel, imports]] of Object.entries(FILES)) {
    let js = ts.transpileModule(read(rel), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: rel,
    }).outputText;
    js = js.replace(/from ['"]([^'"]+)['"]/g, (whole, spec) => {
      if (!(spec in imports)) throw new Error(`${rel} imports ${spec}, which this check does not point anywhere`);
      return `from './${imports[spec]}.mjs'`;
    });
    if (/\brequire\(/.test(js)) throw new Error(`${rel} requires something at run time`);
    writeFileSync(join(dir, `${name}.mjs`), js);
  }
  facetsSrc = read('src/components/dex/dexFacets.ts');
  F = await import(pathToFileURL(join(dir, 'dexFilter.mjs')).href);
  O = await import(pathToFileURL(join(dir, 'dexOrder.mjs')).href);
  R = await import(pathToFileURL(join(dir, 'dexRows.mjs')).href);
  D = await import(pathToFileURL(join(dir, 'dexFacets.mjs')).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { DRINKS } = await import(`data:text/javascript,${encodeURIComponent(STUBS.data)}`);

ok(!/^\s*import\s(?!type\b)/m.test(facetsSrc), 'dexFacets imports nothing at run time');

/* ---- Fixtures ---- */

/** A small deterministic generator (check-recommend's). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

const t0 = performance.now();
const model = F.dexFacets();
const buildMs = performance.now() - t0;

const r0 = lcg(0x5eed);
const LOGGED = new Set(DRINKS.filter(() => r0() < 0.06).map((d) => d.id));
const caught = (id) => LOGGED.has(id);
/** A bar's makeable cocktails, as lib/bar would give: My Bar is off in this build, so the walk brings its own. */
const BAR = new Set(DRINKS.filter((d) => d.category === 'cocktail' && r0() < 0.2).map((d) => d.id));
const WITH_BAR = { caught, canMake: BAR };
const NO_BAR = { caught, canMake: null };

const FIELD = { flavour: 'flavours', spirit: 'spirits', strength: 'strength', style: 'styles', grape: 'grapes', country: 'countries', region: 'regions' };

/** The grid's size counted the slow way: one pass of the app's matcher. */
const slow = (f, ctx) => {
  const m = model.matcher(f, ctx);
  let n = 0;
  for (const d of DRINKS) if (m(d)) n += 1;
  return n;
};

/** What the grid would hold with this option as its facet's only choice: Type with its switch-and-drop. */
function alone(f, c) {
  if (c.facet === 'kind') return f.kind === c.key ? f : model.withKind(f, c.key);
  if (c.facet === 'status') return { ...f, status: c.key };
  if (c.facet === 'make') return { ...f, make: true };
  return { ...f, [FIELD[c.facet]]: [c.key] };
}

/** Everything the sheet offers under this filter: every group, a long one's whole See all list. */
function offered(f, counts, makeAvailable) {
  const out = [];
  for (const g of F.sheetGroups(f, counts, makeAvailable)) {
    out.push(...(g.all > 0 ? F.seeAllOptions(f, counts, g.facet) : g.options));
  }
  return out;
}

/* ---- 1. Every figure is what a tap would show ---- */

{
  const ctx = WITH_BAR;
  const filters = [
    F.NO_DEX_FILTER,
    { ...F.NO_DEX_FILTER, kind: 'wine', styles: ['wine:red'], countries: ['Italy'] },
    { ...F.NO_DEX_FILTER, kind: 'cocktail', flavours: ['sour'], strength: ['light'], make: true },
    { ...F.NO_DEX_FILTER, flavours: ['fruity', 'sweet'], status: 'locked', countries: ['USA', 'Mexico'] },
    { ...F.NO_DEX_FILTER, kind: 'spirit', spirits: ['whiskey'], styles: ['spirit:Scotch'], strength: ['strong'], status: 'unlocked' },
  ];
  let checked = 0;
  let wrong = [];
  for (const f of filters) {
    const counts = F.dexCounts(f, ctx);
    if (counts.total !== slow(f, ctx)) wrong.push(`${JSON.stringify(f)}: Show ${counts.total}, the grid ${slow(f, ctx)}`);
    for (const facet of D.FACET_ORDER) {
      model.options[facet].forEach((o, i) => {
        const c = { facet, key: o.key };
        const want = slow(alone(f, c), ctx);
        checked++;
        if (counts.of[facet][i] !== want) wrong.push(`${facet} ${o.key} under ${JSON.stringify(f)}: ${counts.of[facet][i]}, the grid ${want}`);
      });
    }
  }
  ok(wrong.length === 0, `every option's figure is the grid a tap shows, ${checked.toLocaleString('en-US')} options under ${filters.length} filters${wrong.length ? `\n       ${wrong.slice(0, 5).join('\n       ')}` : ''}`);

  // The grid dexRows draws is the sheet's "Show N", with a search typed and without.
  const sampleQ = ['rum', 'barolo', 'nebbiolo', 'italy', 'sour', 'xq'];
  let gridWrong = [];
  for (const f of filters) {
    for (const q of ['', ...sampleQ]) {
      const counts = F.dexCounts(f, ctx, q ? R.searchHits(q) : undefined);
      const grid = R.dexGrid({ query: q, filterOn: F.dexFilterOn(f, ctx.canMake), matches: F.dexMatcher(f, ctx), forYou: null });
      if (grid.matched !== counts.total) gridWrong.push(`"${q}" ${JSON.stringify(f)}: grid ${grid.matched}, Show ${counts.total}`);
    }
  }
  ok(gridWrong.length === 0, `"Show N" is the grid dexRows draws, under ${filters.length} filters and ${sampleQ.length + 1} searches${gridWrong.length ? `\n       ${gridWrong.slice(0, 3).join('\n       ')}` : ''}`);
}

/* ---- 2. Nothing leads to zero ---- */

{
  const r = lcg(0xf11e);
  let f = F.NO_DEX_FILTER;
  let taps = 0;
  let empty = [];
  let short = [];
  let sampled = 0;
  let sampleWrong = [];
  const walkMs = [];
  for (let step = 0; step < 600; step++) {
    const ctx = step % 3 === 0 ? NO_BAR : WITH_BAR;
    if (step % 9 === 0) f = F.NO_DEX_FILTER;
    const s = performance.now();
    const counts = F.dexCounts(f, ctx);
    walkMs.push(performance.now() - s);
    const choices = offered(f, counts, ctx.canMake !== null).filter((o) => !o.dim);
    if (choices.length === 0) continue;
    const o = pick(r, choices);
    const facetEmpty =
      o.chip.facet === 'kind' || o.chip.facet === 'status' || o.chip.facet === 'make' || f[FIELD[o.chip.facet]].length === 0;
    const next = F.toggleDex(f, o.chip, counts);
    const total = F.dexCounts(next, ctx).total;
    taps++;
    if (total === 0) empty.push(`${o.chip.facet} ${o.chip.key} after ${JSON.stringify(f)}`);
    if (!o.on && (facetEmpty ? total !== o.count : total < o.count)) short.push(`${o.chip.facet} ${o.chip.key} said ${o.count}, showed ${total}`);
    // Now and then, a sample of this filter's figures against the slow count.
    if (step % 25 === 0) {
      for (let k = 0; k < 12; k++) {
        const facet = pick(r, D.FACET_ORDER);
        // Without a bar there is no I can make it to offer, and no figure for it.
        if (model.options[facet].length === 0 || (facet === 'make' && !ctx.canMake)) continue;
        const i = Math.floor(r() * model.options[facet].length);
        const c = { facet, key: model.options[facet][i].key };
        sampled++;
        const want = slow(alone(f, c), ctx);
        if (counts.of[facet][i] !== want) sampleWrong.push(`${facet} ${c.key}: ${counts.of[facet][i]}, the grid ${want}`);
      }
    }
    f = next;
  }
  ok(empty.length === 0, `${taps} taps on what the sheet and its See all pages offer never leave an empty grid${empty.length ? `\n       ${empty.slice(0, 3).join('\n       ')}` : ''}`);
  ok(short.length === 0, `a tap on a figure shows that figure (or more, beside a choice already made in its group)${short.length ? `\n       ${short.slice(0, 3).join('\n       ')}` : ''}`);
  ok(sampleWrong.length === 0, `${sampled} figures sampled along the walk match the slow count${sampleWrong.length ? `\n       ${sampleWrong.slice(0, 3).join('\n       ')}` : ''}`);

  /* ---- 7. Fast enough ---- */
  const avg = walkMs.reduce((a, b) => a + b, 0) / walkMs.length;
  const worst = Math.max(...walkMs);
  ok(buildMs < 400, `the facets build in ${buildMs.toFixed(0)} ms in Node (once, on first use; under 400)`);
  ok(avg < 8, `a count takes ${avg.toFixed(2)} ms on average over the walk, ${worst.toFixed(1)} at worst (under 8 on average)`);
}

/* ---- 3. The four old groups count as they did ---- */

{
  const r = lcg(0xd0c5);
  let wrong = [];
  for (let i = 0; i < 60; i++) {
    const four = {
      flavours: O.FLAVOUR_ORDER.filter(() => r() < 0.2),
      spirits: O.SPIRIT_ORDER.filter(() => r() < 0.15),
      kind: pick(r, ['all', 'all', 'cocktail', 'spirit', 'wine']),
      status: pick(r, ['all', 'all', 'unlocked', 'locked']),
    };
    const old = O.facetCounts(four, caught);
    const now = F.dexCounts({ ...F.NO_DEX_FILTER, ...four }, NO_BAR);
    const same = (a, b, what) => {
      if (a !== b) wrong.push(`${what} under ${JSON.stringify(four)}: dexOrder ${a}, dexFacets ${b}`);
    };
    same(old.total, now.total, 'total');
    O.FLAVOUR_ORDER.forEach((k, j) => same(old.flavours[k], now.of.flavour[j], k));
    O.SPIRIT_ORDER.forEach((k, j) => same(old.spirits[k], now.of.spirit[j], k));
    same(old.status.unlocked, now.of.status[0], 'Logged');
    same(old.status.locked, now.of.status[1], 'Not yet');
    same(old.kind.cocktail, now.of.kind[0], 'Cocktails');
    same(old.kind.spirit, now.of.kind[1], 'Spirits');
    const pruned = four.kind !== 'wine' && (four.flavours.length > 0 || four.spirits.length > 0);
    same(pruned ? slow(model.withKind({ ...F.NO_DEX_FILTER, ...four }, 'wine'), NO_BAR) : old.kind.wine, now.of.kind[2], 'Wines');
  }
  ok(wrong.length === 0, `60 filters of the four v4.2 groups: dexFacets counts what lib/dexOrder counts, Wines by its switch${wrong.length ? `\n       ${wrong.slice(0, 4).join('\n       ')}` : ''}`);
}

/* ---- 4. The facets read the data right ---- */

{
  const counts = F.dexCounts(F.NO_DEX_FILTER, NO_BAR);
  const opt = (facet, key) => counts.of[facet][model.indexOf(facet, key)];
  const banded = counts.of.strength.reduce((a, b) => a + b, 0);
  const noBand = DRINKS.filter((d) => D.strengthOf(d.abv) === null);
  ok(
    banded + noBand.length === DRINKS.length && noBand.every((d) => !/\d\s*%/.test(d.abv)),
    `every drink with an ABV has a strength (${opt('strength', 'light')} light, ${opt('strength', 'medium')} medium, ${opt('strength', 'strong')} strong; none for ${noBand.map((d) => `${d.name}'s "${d.abv}"`).join(', ')})`,
  );
  ok(D.strengthOf('8–10%') === 'light' && D.strengthOf('14-16%') === 'medium' && D.strengthOf('28–32%') === 'strong' && D.strengthOf('50% (100 proof)') === 'strong', 'a range is read by its middle, either dash');

  const wineStyles = model.options.style.filter((o) => o.kind === 'wine');
  const wines = DRINKS.filter((d) => d.category === 'wine');
  ok(
    D.offerOrder(model, 'style', 'wine').map((o) => o.key).join() === 'wine:red,wine:white,wine:rose,wine:orange,wine:sparkling,wine:dessert,wine:fortified' &&
      wineStyles.reduce((a, o) => a + o.all, 0) === wines.length,
    `every wine has one of the seven styles (${D.offerOrder(model, 'style', 'wine').map((o) => `${o.label} ${o.all}`).join(', ')})`,
  );
  ok(
    model.options.style.filter((o) => o.kind !== 'wine').every((o) => o.label === o.label.trim() && !/[A-Z]/.test(o.label.slice(1).replace(/\b(American|Irish|Scotch|Japanese|Mexican|Caribbean|Canadian|Cuban|English|French|German|Italian|Dutch|Spanish|Peruvian|Brazilian|Chinese|Korean|Tennessee|Kentucky|London|Jamaican|Welsh)\b/g, ''))),
    'a cocktail or spirit style is in sentence case (styleLabel), "Spirit-forward", "American whiskey"',
  );

  const COMPASS = /^(North|South|East|West|Central|Northern|Southern|Eastern|Western|Northeast|Northwest|Southeast|Southwest)\s/;
  const NAMED = ['South Africa', 'South Korea', 'North Macedonia', 'Trinidad and Tobago', 'Bosnia and Herzegovina', 'Antigua and Barbuda'];
  const NOT_ONE = ['Caribbean', 'Worldwide', 'Balkans', 'Europe', 'Latin America', 'Scandinavia', 'Nordic countries', 'French Caribbean', 'Spanish Caribbean'];
  const odd = model.options.country.filter((o) => !NAMED.includes(o.key) && (/ and /.test(o.key) || COMPASS.test(o.key) || NOT_ONE.includes(o.key)));
  ok(odd.length === 0, `${model.options.country.length} countries, none with "and" or a compass word in it but a country's own name, none of the places that are not one country${odd.length ? `: ${odd.map((o) => o.key).join(', ')}` : ''}`);
  const placeless = DRINKS.filter((d) => D.countriesOf(D.tailOf(d.origin), new Set(model.options.country.map((o) => o.key))).length === 0);
  ok(placeless.length < DRINKS.length * 0.01, `${placeless.length} drinks are in no country (under 1%: Caribbean, Worldwide and the like)`);
  ok(
    opt('country', 'France') > 600 && opt('country', 'Italy') > 500 && model.indexOf('country', 'Korea') < 0 && model.indexOf('country', 'Northern Italy') < 0,
    `one France and one Italy (${opt('country', 'France')}, ${opt('country', 'Italy')}), "Northern Italy" and "Korea" folded in`,
  );

  const grapeHolders = DRINKS.filter((d) => model.matcher({ ...F.NO_DEX_FILTER, grapes: model.options.grape.map((o) => o.key) }, NO_BAR)(d));
  ok(grapeHolders.every((d) => d.category === 'wine') && model.options.grape.length > 400, `${model.options.grape.length} grapes, on wines alone (${grapeHolders.length} of ${wines.length})`);
  const barolo = model.matcher({ ...F.NO_DEX_FILTER, kind: 'wine', grapes: ['Nebbiolo'] }, NO_BAR);
  ok(barolo(DRINKS.find((d) => d.id === 'barolo')), 'Barolo is under Nebbiolo');
  ok(
    model.options.region.every((o) => o.detail && o.key === `${o.label}|${o.detail}`) && model.indexOf('region', 'Loire|France') >= 0 && model.indexOf('region', 'Loire Valley|France') < 0,
    `${model.options.region.length} regions, each with its country, "Loire Valley" read as the Loire`,
  );
  /*
   * Build 40's review: one place, one option. The UK's nations as the rest
   * of the catalogue writes them; a region card in its own region; the
   * atlas's names for a region an authored card writes another way; no
   * region that is its whole country.
   */
  const inRegion = (key, id) => model.matcher({ ...F.NO_DEX_FILTER, kind: 'wine', regions: [key] }, NO_BAR)(DRINKS.find((d) => d.id === id));
  const inCountry = (key, id) => model.matcher({ ...F.NO_DEX_FILTER, countries: [key] }, NO_BAR)(DRINKS.find((d) => d.id === id));
  ok(
    inCountry('England', 'english-sparkling') &&
      inCountry('England', 'kent-unitedkingdom-wn') &&
      inCountry('Wales', 'welshwine-unitedkingdom-wn') &&
      !inCountry('United Kingdom', 'kent-unitedkingdom-wn'),
    'English Sparkling Wine and Kent are both England, Welsh Wine is Wales, as the catalogue writes them',
  );
  ok(
    inRegion('Marlborough|New Zealand', 'marlborough') &&
      inRegion('Pfalz|Germany', 'pfalz') &&
      inRegion('Lower Austria|Austria', 'kremstal-austria-wn') &&
      inRegion('Rhône|France', 'cote-rotie') &&
      model.indexOf('region', 'Niederösterreich|Austria') < 0 &&
      model.indexOf('region', 'Northern Rhône|France') < 0 &&
      model.options.region.every((o) => o.label !== o.detail),
    'a region card is in its own region, Niederösterreich is Lower Austria, Côte-Rôtie is in the Rhône, and no region is its whole country',
  );
  const holds = D.FACET_ORDER.map((facet) => `${facet} ${['cocktail', 'spirit', 'wine'].map((k) => (model.applies(facet, k) ? k[0] : '-')).join('')}`);
  ok(
    !model.applies('flavour', 'wine') && !model.applies('spirit', 'wine') && model.applies('grape', 'wine') && !model.applies('grape', 'cocktail') && !model.applies('region', 'spirit') && !model.applies('make', 'spirit'),
    `what each type holds: ${holds.join(', ')}`,
  );

  // A drink someone added: a type and a Logged state, nothing else.
  const custom = { id: 'u_00000000-0000-0000-0000-000000000000', category: 'cocktail' };
  ok(
    F.dexMatcher({ ...F.NO_DEX_FILTER, kind: 'cocktail', status: 'locked' }, NO_BAR)(custom) &&
      !F.dexMatcher({ ...F.NO_DEX_FILTER, strength: ['light'] }, NO_BAR)(custom) &&
      !F.dexMatcher({ ...F.NO_DEX_FILTER, kind: 'spirit' }, NO_BAR)(custom),
    'a drink someone added passes Type and In your Dex, and any other facet hides it',
  );
}

/* ---- 5. What is offered ---- */

{
  const groups = (f, bar) => F.sheetGroups(f, null, bar).map((g) => g.facet).join(' ');
  ok(groups(F.NO_DEX_FILTER, false) === 'kind flavour strength spirit country status', `at rest: ${groups(F.NO_DEX_FILTER, false)}`);
  ok(groups(F.NO_DEX_FILTER, true) === 'kind flavour strength make spirit country status', 'with a bar, I can make it after Strength');
  const wine = { ...F.NO_DEX_FILTER, kind: 'wine' };
  ok(groups(wine, true) === 'kind strength style grape country region status', `Wines: ${groups(wine, true)}`);
  const cocktails = { ...F.NO_DEX_FILTER, kind: 'cocktail' };
  ok(groups(cocktails, true) === 'kind flavour strength make spirit style country status', `Cocktails: ${groups(cocktails, true)}`);
  ok(groups({ ...F.NO_DEX_FILTER, kind: 'spirit' }, true) === 'kind flavour strength spirit style country status', 'Spirits: no I can make it');

  const wineGroups = F.sheetGroups({ ...wine, countries: ['Hungary'] }, null, false);
  const countryGroup = wineGroups.find((g) => g.facet === 'country');
  ok(
    countryGroup.all > F.FIRST_FEW &&
      countryGroup.options.length === F.FIRST_FEW + 1 &&
      countryGroup.options[F.FIRST_FEW].chip.key === 'Hungary' &&
      wineGroups.find((g) => g.facet === 'style').all === 0,
    `a long group shows its first ${F.FIRST_FEW} (${countryGroup.options.slice(0, F.FIRST_FEW).map((o) => o.label).join(', ')}) and what is on beyond them, See all ${countryGroup.all}; a wine's seven styles all show`,
  );
  const page = F.seeAllOptions(wine, null, 'grape');
  ok(page.every((o, i) => i === 0 || page[i - 1].label.localeCompare(o.label, 'en', { sensitivity: 'base' }) <= 0), `a See all page is A to Z (${page.length} grapes)`);

  // A choice the new type holds none of stays where it can be turned off (build 40's review).
  const strongWine = F.toggleDex({ ...F.NO_DEX_FILTER, strength: ['light', 'strong'] }, { facet: 'kind', key: 'wine' }, null);
  const strongCounts = F.dexCounts(strongWine, NO_BAR);
  const strongOpt = F.sheetGroups(strongWine, strongCounts, false).find((g) => g.facet === 'strength').options.find((o) => o.chip.key === 'strong');
  const moldova = F.toggleDex({ ...F.NO_DEX_FILTER, countries: ['England', 'Moldova'] }, { facet: 'kind', key: 'cocktail' }, null);
  const moldovaCounts = F.dexCounts(moldova, NO_BAR);
  const moldovaRow = F.seeAllOptions(moldova, moldovaCounts, 'country').find((o) => o.chip.key === 'Moldova');
  const moldovaChip = F.sheetGroups(moldova, moldovaCounts, false).find((g) => g.facet === 'country').options.find((o) => o.chip.key === 'Moldova');
  ok(
    strongOpt?.on && strongOpt.count === 0 && !strongOpt.dim && moldovaRow?.on && !moldovaRow.dim && moldovaChip?.on,
    'a choice on with nothing under the new type (Strong under Wines, Moldova under Cocktails) keeps its chip and its See all row, on, to untick',
  );
  const rums = F.dexChipsOn({ ...F.NO_DEX_FILTER, kind: 'spirit', spirits: ['rum'], styles: ['spirit:Rum'] }, null).map(F.tokenWord).join(', ');
  ok(rums === 'Spirits, Rum, Rum style', `a style with a spirit's word says it is the style in the row of what is on: ${rums}`);

  const sour = F.toggleDex(F.NO_DEX_FILTER, { facet: 'flavour', key: 'sour' }, null);
  const toWine = F.toggleDex({ ...sour, strength: ['light'] }, { facet: 'kind', key: 'wine' }, null);
  const red = F.toggleDex(toWine, { facet: 'style', key: 'wine:red' }, null);
  const offAgain = F.toggleDex(red, { facet: 'kind', key: 'wine' }, null);
  ok(
    toWine.flavours.length === 0 && toWine.strength.join() === 'light' && red.styles.join() === 'wine:red' && offAgain.kind === 'all' && offAgain.styles.length === 0 && offAgain.strength.join() === 'light',
    'Wines drops Sour and citrusy and keeps Light; Wines off again takes Red with its group and keeps Light',
  );
  ok(
    JSON.stringify(F.toggleDex(F.toggleDex(F.NO_DEX_FILTER, { facet: 'country', key: 'Mexico' }, null), { facet: 'country', key: 'USA' }, null).countries) ===
      JSON.stringify(F.toggleDex(F.toggleDex(F.NO_DEX_FILTER, { facet: 'country', key: 'USA' }, null), { facet: 'country', key: 'Mexico' }, null).countries),
    'choices keep one order whatever order they were tapped in, so the same choices are the same filter',
  );

  const trio = { ...F.NO_DEX_FILTER, flavours: ['sour'], spirits: ['rum'], countries: ['Trinidad and Tobago', 'Czechia', 'Australia'] };
  const trioCounts = F.dexCounts(trio, NO_BAR);
  const taken = F.toggleDex(trio, { facet: 'country', key: 'Trinidad and Tobago' }, trioCounts);
  ok(
    trioCounts.total > 0 &&
      F.dexFigure(trioCounts, { facet: 'country', key: 'Czechia' }) === 0 &&
      taken.countries.length === 0 &&
      F.dexCounts(taken, NO_BAR).total > 0,
    `taking Trinidad and Tobago off sour rum takes Czechia and Australia (0 each) with it: ${trioCounts.total} drinks become ${F.dexCounts(taken, NO_BAR).total}, never 0`,
  );

  const said = (q) => q.map((c) => F.dexChipWord(c)).join(', ');
  const none = F.quickPicks({ flavours: [], spirits: [] }, false);
  ok(said(none) === 'Cocktails, Spirits, Wines, Sweet, Sour and citrusy, Fruity, Bitter, Light, Not yet', `the quick chips with no answers: ${said(none)}`);
  const persona = F.quickPicks({ flavours: ['sour', 'fruity'], spirits: ['rum', 'agave', 'gin'] }, true);
  ok(
    said(persona) === 'Cocktails, Spirits, Wines, Sour and citrusy, Fruity, Rum, Tequila and mezcal, Light, I can make it, Not yet',
    `with answers and a bar: ${said(persona)}`,
  );
  ok([...none, ...persona].every((c) => c.facet !== 'strength' || c.key === 'light'), 'Light is the one strength the quick row offers');

  const on = F.dexChipsOn({ ...F.NO_DEX_FILTER, kind: 'wine', styles: ['wine:red'], grapes: ['Nebbiolo'], countries: ['Italy'], status: 'locked', make: true }, null);
  ok(said(on) === 'Wines, Red, Nebbiolo, Italy, Not yet', `what is on, in sheet order, I can make it left out without a bar: ${said(on)}`);
  ok(F.dexChipsOn(F.NO_DEX_FILTER, BAR).length === 0 && !F.dexFilterOn({ ...F.NO_DEX_FILTER, make: true }, null), 'nothing on at rest; I can make it is not on without a bar');

  F.requestDexFilter({ status: 'unlocked' });
  const note = F.takeDexFilter();
  ok(
    note?.status === 'unlocked' && note.kind === 'all' && note.grapes.length === 0 && note.strength.length === 0 && F.takeDexFilter() === null,
    "Dex progress's note opens the Dex on Logged and nothing else, once",
  );
}

/* ---- 6. VoiceOver and App Review 1.4.3 ---- */

{
  ok(F.optionSays({ facet: 'strength', key: 'light' }, 2603) === 'Light, under 15% alcohol, 2,603 drinks', `a strength says its band: "${F.optionSays({ facet: 'strength', key: 'light' }, 2603)}"`);
  ok(F.optionSays({ facet: 'flavour', key: 'fruity' }, 1) === 'Fruity, 1 drink', 'one drink is "1 drink"');
  ok(F.optionSays({ facet: 'region', key: 'Piedmont|Italy' }, 64) === 'Piedmont, Italy, 64 drinks', 'a region says its country');
  const sheet = read('src/components/dex/FilterSheet.tsx');
  const quick = read('src/components/dex/QuickChips.tsx');
  ok(
    sheet.includes('accessibilityLabel={optionSays(o.chip, o.count)}') &&
      sheet.includes('accessibilityState={{ selected: option.on, disabled: option.dim }}') &&
      sheet.includes('accessibilityLabel={optionSays(option.chip, option.count)}') &&
      /label=\{total > 0 \? `Show \$\{formatCount\(total\)\}/.test(sheet),
    "the sheet's chips and rows say their figures, the rows selected and dimmed (a Chip says both itself), the foot key the count",
  );
  ok(
    quick.includes('accessibilityLabel={optionSays(c, n)}') &&
      quick.includes('const word = tokenWord(c);') &&
      quick.includes('accessibilityLabel={`Remove ${word}`}') &&
      quick.includes('accessibilityLabel="Clear all filters"'),
    'the quick chips say their figures; a token says Remove and its own words; Clear all says what it clears',
  );

  const words = [
    ...Object.values(F.FACET_WORDS).flatMap((w) => [w.label, w.noun]),
    ...Object.values(F.STRENGTH_WORDS),
    F.STRENGTH_NOTE,
    F.MAKE_WORD,
    'Show 214 drinks',
    'No drinks match',
    'Clear all',
  ];
  const DARE = /\b(drunk|wasted|buzz(ed)?|hammered|tipsy|lit|binge|chug|booze|smash(ed)?|knock (it|them) back|down it|another round|keep (it|them) coming|more drinks?)\b/i;
  ok(words.every((w) => !DARE.test(w)), 'the words the filters add say what is in the glass, never a dare (App Review 1.4.3)');
  ok(Object.values(F.STRENGTH_WORDS).join() === 'Light,Medium,Strong', 'Strength is Light, Medium, Strong');
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
