/**
 * The recommender's unit test (the app has no Jest).
 *
 * src/lib/recommendCore.ts is a line-for-line port of the reference,
 * specs/v4.2/tools/recommend.mjs (v4-onboarding spec.md §5, v4.1 §2, and
 * v4.2 §1.2's fruity with the strength cap of Decided 5). The file at
 * specs/v4-onboarding/tools/recommend.mjs is the same file, byte for byte;
 * this fails if they part. This proves the port gives the reference's
 * answers, to the bit:
 *
 *   1. It transpiles recommendCore.ts with the project's own `typescript`
 *      (ts.transpileModule, ESM out), refuses it if anything but types is
 *      imported, and loads it from a data: URL.
 *   2. It binds it to the same JSON and photo set the reference reads
 *      (drinks.json, barIndex.json, the drinkPhotos ids, lib/tastes' id
 *      list), plus the classics signal from src/data/classics.json, which
 *      it first checks is in step with the catalogue.
 *   3. Runs A to F (spec.md §5.6, v4.2 §1.2): the reference's ids, order,
 *      why lines, makeNow and scores, each run's pinned picks (RUNS says
 *      where they come from), matchingCount 574, 147, 2073, 378, 161 and
 *      239, and the reference's barRows and makeableCount.
 *   4. A 2,000-case sweep: a seeded LCG over every answer (goal fixed to
 *      null and to each value in turn, exclusions, a few pick counts),
 *      diffing the port against the reference on recommend, matchingCount,
 *      barRows, makeableCount and the collage. Every mismatch is printed.
 *
 *   5. The Dex (v4.2 §1 and §2). src/data/tasteTags.json, one integer of
 *      taste bits per catalogue id (lib/dexOrder says which), is worked out
 *      from the port and must equal the file, stamp and all. Then
 *      src/lib/dexOrder.ts, transpiled with its two data imports stubbed,
 *      against specs/v4.2/tools/dex-order.mjs: the sections' fronts, the
 *      "See all" figures, Everything else and the total order for the
 *      spec's people and a 150-case sweep, and the sheet's faceted counts
 *      under a run of filters. And the words: the first run's flavour and
 *      spirit keys (steps/copy.ts) are the chips' labels, in the same order.
 *
 * It also prints what lib/bar's matchBar (the bar step's on-screen count,
 * v4.1 §2.2) gives for the runs' bars beside the reference's makeableCount,
 * by transpiling src/lib/bar.ts with its three data imports stubbed.
 *
 * WHY classics.json. The classics weight (spec §5.3, step 5) is worked out
 * from the catalogue's tier field, which nothing under src/ may read
 * (check-design rule 14: the tier is never shown). This script is outside
 * src/, so it reads the field here and writes the weight alone, per id:
 *
 *   node scripts/check-recommend.mjs --write   # regenerate classics.json and tasteTags.json, then check
 *
 * Run after any catalogue change (drinks.json is generated), and after any
 * edit to the scorer: the check fails while either file is out of step.
 * tasteTags.json's stamp hashes drinks.json, barIndex.json and
 * lib/recommendCore.ts, so a build that changes any of them makes every
 * phone work its Dex fronts out again (store/taste's dexFronts).
 *
 * Run: node scripts/check-recommend.mjs
 * Exits 1 on any difference.
 */

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import * as refDex from '../specs/v4.2/tools/dex-order.mjs';
import * as ref from '../specs/v4.2/tools/recommend.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const at = (p) => `${ROOT}${p}`;
const read = (p) => readFileSync(at(p), 'utf8');

const failures = [];
const fail = (msg) => failures.push(msg);

/* The reference replaced v4-onboarding's: one file in two places, which must not part. */
if (read('specs/v4.2/tools/recommend.mjs') !== read('specs/v4-onboarding/tools/recommend.mjs')) {
  fail('specs/v4-onboarding/tools/recommend.mjs is not specs/v4.2/tools/recommend.mjs: copy the v4.2 one over it');
}

/* ------------------------------------------------------------------ */
/* The data, read exactly as the reference reads it                    */
/* ------------------------------------------------------------------ */

const RAW = JSON.parse(read('src/data/drinks.json'));
// @/data sorts by Dex number; the file is already in that order, and the reference reads it as it is.
const DRINKS = RAW.slice().sort((a, b) => a.dexNumber - b.dexNumber);
if (DRINKS.some((d, i) => d !== RAW[i])) fail('drinks.json is not in Dex order: the app and the reference would pool differently');
const BAR = JSON.parse(read('src/data/barIndex.json'));
const PHOTO_SRC = read('src/data/drinkPhotos.ts');
const PHOTOS = new Set([...PHOTO_SRC.matchAll(/'([a-z0-9-]+)': require/g)].map((m) => m[1]));
const KNOWN_ORDER = [
  ...(read('src/lib/tastes.ts').match(/const IDS = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g),
].map((m) => m[1]);
if (PHOTOS.size === 0) fail('read 0 photo ids out of drinkPhotos.ts: the require format changed');
if (KNOWN_ORDER.length === 0) fail('read 0 ids out of lib/tastes: the IDS literal changed shape');

/*
 * lib/recommend's photo set is the catalogue ids photoFor() resolves, read
 * from the PHOTOS map alone; the reference's regex reads the PROOFS map as
 * well. They must name the same catalogue drinks.
 */
{
  const start = PHOTO_SRC.indexOf('const PHOTOS');
  const end = PHOTO_SRC.indexOf('};', start);
  const photoFor = new Set([...PHOTO_SRC.slice(start, end).matchAll(/'([a-z0-9-]+)': require/g)].map((m) => m[1]));
  const inCatalogue = (set) => [...set].filter((id) => DRINKS.some((d) => d.id === id)).sort().join(',');
  if (start < 0 || inCatalogue(photoFor) !== inCatalogue(PHOTOS)) {
    fail("photoFor()'s ids and the reference's photo set differ on the catalogue");
  }
}

/* ------------------------------------------------------------------ */
/* The classics signal, kept beside the catalogue                      */
/* ------------------------------------------------------------------ */

/** The reference's CLASSIC table: the catalogue tier, as the weight C. */
const TIER_WEIGHT = { common: 1, uncommon: 0.6, rare: 0.25, legendary: 0 };
const CLASSICS_PATH = 'src/data/classics.json';

function classicsFromCatalogue() {
  const groups = {};
  for (const d of DRINKS) {
    const w = TIER_WEIGHT[d.rarity] ?? 0;
    if (w === 0) continue;
    (groups[String(w)] ??= []).push(d.id);
  }
  return {
    about:
      'GENERATED by node scripts/check-recommend.mjs --write. The onboarding recommender\'s classics weight (specs/v4-onboarding/spec.md 5.3, step 5) per catalogue id, in Dex order; an id not listed weighs 0. A hidden ranking weight: never shown.',
    classic: Object.fromEntries(Object.entries(groups).sort((a, b) => Number(b[0]) - Number(a[0]))),
  };
}

if (process.argv.includes('--write')) {
  writeFileSync(at(CLASSICS_PATH), `${JSON.stringify(classicsFromCatalogue(), null, 1)}\n`);
  console.log(`  wrote ${CLASSICS_PATH}`);
}

let CLASSICS_FILE;
try {
  CLASSICS_FILE = JSON.parse(read(CLASSICS_PATH));
} catch {
  fail(`${CLASSICS_PATH} is missing or unreadable: run node scripts/check-recommend.mjs --write`);
  CLASSICS_FILE = { classic: {} };
}
if (JSON.stringify(CLASSICS_FILE) !== JSON.stringify(classicsFromCatalogue())) {
  fail(`${CLASSICS_PATH} is out of step with drinks.json: run node scripts/check-recommend.mjs --write`);
}
/** The weights as lib/recommend builds them from the file. */
const CLASSICS = Object.create(null);
for (const [w, ids] of Object.entries(CLASSICS_FILE.classic ?? {})) for (const id of ids) CLASSICS[id] = Number(w);

/* ------------------------------------------------------------------ */
/* The port, transpiled and loaded                                     */
/* ------------------------------------------------------------------ */

const toEsm = (source, fileName) =>
  ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  }).outputText;

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const coreJs = toEsm(read('src/lib/recommendCore.ts'), 'recommendCore.ts');
if (/^\s*import\s/m.test(coreJs) || /\brequire\(/.test(coreJs)) {
  console.error('  FAIL  src/lib/recommendCore.ts imports something at runtime: type imports only');
  process.exit(1);
}
const core = await import(dataUrl(coreJs));

const port = core.createRecommender({
  drinks: DRINKS,
  ingredients: BAR.ingredients,
  recipes: BAR.recipes,
  photoIds: PHOTOS,
  knownIds: KNOWN_ORDER,
  classics: CLASSICS,
});

for (const [name, mine, theirs] of [
  ['SPIRITS', core.SPIRITS, ref.SPIRITS],
  ['FLAVOURS', core.FLAVOURS, ref.FLAVOURS],
]) {
  if (JSON.stringify(mine) !== JSON.stringify(theirs)) fail(`${name} differs from the reference's`);
}
{
  const shape = (S) =>
    JSON.stringify(Object.fromEntries(Object.entries(S).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([s, x]) => [s, [x.label, x.ids, String(x.spirit)]]))])));
  if (shape(core.STYLES) !== shape(ref.STYLES)) fail('STYLES differs from the reference\'s (labels, ids or a spirit test)');
}
if (core.PICKS !== ref.PICKS) fail(`PICKS is ${core.PICKS}, the reference's ${ref.PICKS}`);

/* ------------------------------------------------------------------ */
/* lib/bar's matchBar, for the figures on screen                       */
/* ------------------------------------------------------------------ */

const barJs = toEsm(read('src/lib/bar.ts'), 'bar.ts')
  .replace(
    /from ['"]@\/data['"]/,
    `from '${dataUrl(
      `import { readFileSync } from 'node:fs'; const D = JSON.parse(readFileSync(${JSON.stringify(at('src/data/drinks.json'))}, 'utf8')); const BY = new Map(D.map((d) => [d.id, d])); export function getDrink(id) { return typeof id === 'string' ? BY.get(id) : undefined; }`,
    )}'`,
  )
  .replace(/from ['"]@\/data\/barIndex\.json['"]/, `from '${dataUrl(`export default ${JSON.stringify(BAR)};`)}'`)
  .replace(/from ['"]@\/data\/drinkPhotos['"]/, `from '${dataUrl('export function photoFor() { return undefined; }')}'`);
if (/from ['"]@\//.test(barJs)) fail('lib/bar.ts imports something this script does not stub');
const lib = await import(dataUrl(barJs));
const matchBarCount = (ids) => lib.matchBar(new Set(ids)).makeable.length;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The reference CLI's collage (photographed, from the scored pool, best first), topped up from the known list. */
function refCollage(answers, n) {
  const a = { ...answers, exclude: new Set(answers.exclude ?? []) };
  const ids = DRINKS.map((d) => ref.score(d, a, new Set(a.bar ?? [])))
    .filter((r) => r && r.photo)
    .sort((x, y) => y.total - x.total)
    .slice(0, n)
    .map((r) => r.d.id);
  for (const id of KNOWN_ORDER) {
    if (ids.length >= n) break;
    if (!ids.includes(id) && PHOTOS.has(id) && DRINKS.some((d) => d.id === id)) ids.push(id);
  }
  return ids;
}

function diff(label, mine, theirs) {
  if (same(mine, theirs)) return true;
  fail(`${label}\n      port:      ${JSON.stringify(mine)}\n      reference: ${JSON.stringify(theirs)}`);
  return false;
}

/* ------------------------------------------------------------------ */
/* Runs A to D (spec.md §5.6), the reference's own answers              */
/* ------------------------------------------------------------------ */

/*
 * The picks each run must give. v4.1 §2.3's, until fefbd32 (13 Oct 2026)
 * photographed 633 more cocktails: the three photographed openers and the
 * photo weight then moved A, B, D and E, the reference and the port alike.
 * They are pinned to the reference's output from then on, so a change to
 * either still shows here; a photo import that moves them needs them read
 * again from node specs/v4.2/tools/recommend.mjs.
 */
const RUNS = {
  A: {
    answers: {
      goal: 'discover', drinks: 'both', spirits: ['gin', 'whiskey'], styleOf: 'whiskey', styles: ['bourbon'],
      flavours: ['bitter', 'strong'], home: 'sometimes',
      bar: ['gin', 'bourbon', 'lime', 'lemon', 'sugar-syrup', 'soda-water', 'campari', 'sweet-vermouth'],
    },
    ids: ['boulevardier', 'left-hand', 'negroni', 'enzoni', 'bottled-in-bond-bourbon', 'contemporary-gin'],
    matching: 574,
  },
  B: {
    answers: { goal: 'friends', drinks: 'cocktails', spirits: ['rum', 'agave'], styleOf: 'rum', styles: ['white'], flavours: ['refreshing', 'sour'], home: 'never', bar: [] },
    names: ['Mojito', 'Cuba Libre', 'Daiquiri', 'Paloma', 'Margarita', 'Illegal'],
    // 149 before v4.2's Decided 5: La Bandera and Bandera, 40% shots that only say lime, left sour.
    matching: 147,
  },
  C: {
    answers: { goal: null, drinks: null, spirits: [], flavours: [], home: null, bar: [] },
    names: ['Piña Colada', 'Margarita', 'Espresso Martini', 'Mojito', 'Aperol Spritz', 'Old Fashioned'],
    why: 'A classic to start with',
    matching: 2073,
  },
  D: {
    answers: { goal: 'track', drinks: 'spirits', spirits: ['whiskey'], styleOf: 'whiskey', styles: ['scotch'], flavours: ['strong'], home: 'never', bar: [] },
    names: ['Godfather', 'Rob Roy', 'Earthquake', 'Blended Malt Scotch', 'Glenlivet Nàdurra', 'Bottled-in-Bond Bourbon'],
    matching: 378,
  },
  /*
   * v4.2 §1.2: persona E, Jan's own example ("fruity or sour"), and fruity
   * alone. With Decided 5's cap on sour, Tequila Blanco no longer says sour,
   * and Mezcal Joven takes its seat as E's sixth (her tequila share).
   */
  E: {
    answers: {
      goal: null, drinks: 'both', spirits: ['rum', 'agave'], styleOf: 'rum', styles: ['white'], flavours: ['sour', 'fruity'], home: 'sometimes',
      bar: ['white-rum', 'tequila', 'lime', 'lemon', 'sugar-syrup', 'soda-water'],
    },
    ids: ['daiquiri', 'strawberry-daiquiri', 'pina-colada', 'margarita', 'illegal', 'mezcal-joven'],
    whyOf: { 'pina-colada': 'Because you like white rum and fruity drinks' },
    extras: ['triple-sec', 'pineapple-juice'],
    matching: 161,
  },
  F: {
    answers: { drinks: 'cocktails', spirits: [], flavours: ['fruity'], home: null, bar: [] },
    names: ['Piña Colada', 'Cosmopolitan', 'Mai Tai', 'Cape Codder', 'Sangria', 'Fuzzy Navel'],
    why: 'Because you like fruity drinks',
    matching: 239,
  },
};

const figures = [];
for (const [k, run] of Object.entries(RUNS)) {
  const mine = port.recommend(run.answers);
  const theirs = ref.recommend(run.answers);
  diff(`run ${k}: recommend`, mine, theirs);
  if (run.ids && !same(mine.map((p) => p.id), run.ids)) fail(`run ${k}: picks ${mine.map((p) => p.id).join(', ')}, expected ${run.ids.join(', ')}`);
  if (run.names && !same(mine.map((p) => p.name), run.names)) fail(`run ${k}: picks ${mine.map((p) => p.name).join(', ')}, expected ${run.names.join(', ')}`);
  if (run.why && mine.some((p) => p.why !== run.why)) fail(`run ${k}: a why line is not "${run.why}"`);
  for (const [id, why] of Object.entries(run.whyOf ?? {})) {
    const p = mine.find((x) => x.id === id);
    if (p?.why !== why) fail(`run ${k}: ${id}'s why line is ${JSON.stringify(p?.why)}, expected "${why}"`);
  }
  const matching = port.matchingCount(run.answers);
  diff(`run ${k}: matchingCount`, matching, ref.matchingCount(run.answers));
  if (matching !== run.matching) fail(`run ${k}: matchingCount ${matching}, expected ${run.matching}`);
  const rows = port.barRows(run.answers);
  diff(`run ${k}: barRows`, rows, ref.barRows(run.answers));
  if (run.extras) {
    const extras = rows.filter((r) => !r.ticked).map((r) => r.id);
    if (!same(extras, run.extras)) fail(`run ${k}: barRows' extras ${extras.join(', ')}, expected ${run.extras.join(', ')}`);
  }
  const ticked = rows.filter((r) => r.ticked).map((r) => r.id);
  const bar = run.answers.bar ?? [];
  diff(`run ${k}: makeableCount(bar)`, port.makeableCount(bar), ref.makeableCount(bar));
  diff(`run ${k}: makeableCount(pre-ticked)`, port.makeableCount(ticked), ref.makeableCount(ticked));
  diff(`run ${k}: collage`, port.collage(run.answers, 18), refCollage(run.answers, 18));
  figures.push({
    run: k,
    bar: bar.length ? `${ref.makeableCount(bar)} / ${matchBarCount(bar)}` : '0 / 0 (no bar)',
    ticked: `${ref.makeableCount(ticked)} / ${matchBarCount(ticked)}`,
  });
}

/* The CLI's own collage for run A (its 18, exactly as it computes them). */
{
  const a = { ...RUNS.A.answers, exclude: new Set() };
  const cli = DRINKS.map((d) => ref.score(d, a, new Set(a.bar)))
    .filter((r) => r && r.photo)
    .sort((x, y) => y.total - x.total)
    .slice(0, 18)
    .map((r) => r.d.id);
  diff('run A: the CLI collage', port.collage(RUNS.A.answers, 18), cli);
}

/* ------------------------------------------------------------------ */
/* The sweep                                                            */
/* ------------------------------------------------------------------ */

/** Numerical Recipes' LCG: deterministic, so a failure reproduces from its case number. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const GOALS = [null, 'discover', 'track', 'home', 'friends'];
const KINDS = [null, 'cocktails', 'spirits', 'both'];
const SPIRIT_KEYS = Object.keys(ref.SPIRITS);
const FLAVOUR_KEYS = Object.keys(ref.FLAVOURS);
const HOMES = [null, 'never', 'sometimes', 'often'];
const ING_IDS = BAR.ingredients.map((i) => i.id);
const DRINK_IDS = DRINKS.map((d) => d.id);
const CASES = 2000;

const one = (r, list) => list[Math.floor(r() * list.length)];
/** Up to `max` of `list`, in a shuffled (tap) order. */
function some(r, list, max) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.floor(r() * (Math.min(max, pool.length) + 1)));
}

let diffs = 0;
const sweepStart = Date.now();
for (let i = 0; i < CASES; i++) {
  const r = lcg(0x5eed + i * 7919);
  const spirits = some(r, SPIRIT_KEYS, 5);
  const firstStyle = spirits.find((s) => s === 'whiskey' || s === 'rum' || s === 'agave') ?? null;
  // Mostly the store's rule (the first of whiskey, rum, agave); sometimes none, as a skipped follow-up leaves it.
  const styleOf = r() < 0.85 ? firstStyle : null;
  const answers = {
    goal: GOALS[i % GOALS.length],
    drinks: one(r, KINDS),
    spirits,
    styleOf,
    styles: styleOf ? some(r, Object.keys(ref.STYLES[styleOf]), 5) : [],
    flavours: some(r, FLAVOUR_KEYS, 3),
    home: one(r, HOMES),
    bar: [],
  };
  const mode = r();
  if (mode < 0.3) answers.bar = [];
  else if (mode < 0.6) answers.bar = ref.barRows(answers).filter((x) => x.ticked || r() < 0.4).map((x) => x.id);
  else answers.bar = some(r, ING_IDS, 14);
  if (r() < 0.25) answers.exclude = some(r, DRINK_IDS.slice(0, 400), 40);
  const n = r() < 0.85 ? 6 : one(r, [1, 2, 3, 4, 5, 7, 8, 10]);

  const label = `sweep case ${i} (${JSON.stringify(answers)}, n ${n})`;
  let ok = diff(`${label}: recommend`, port.recommend(answers, n), ref.recommend(answers, n));
  ok = diff(`${label}: matchingCount`, port.matchingCount(answers), ref.matchingCount(answers)) && ok;
  ok = diff(`${label}: barRows`, port.barRows(answers), ref.barRows(answers)) && ok;
  ok = diff(`${label}: makeableCount`, port.makeableCount(answers.bar), ref.makeableCount(answers.bar)) && ok;
  if (i % 4 === 0) ok = diff(`${label}: collage`, port.collage(answers, 12), refCollage(answers, 12)) && ok;
  if (!ok) diffs++;
}
const sweepMs = Date.now() - sweepStart;

/* ------------------------------------------------------------------ */
/* The Dex: tasteTags.json (v4.2 §1.3)                                 */
/* ------------------------------------------------------------------ */

const TAGS_PATH = 'src/data/tasteTags.json';
const FLAVOUR_ORDER = refDex.FLAVOUR_ORDER;
const SPIRIT_ORDER = refDex.SPIRIT_ORDER;
/* The bit layout lib/dexOrder reads (its header says why bits 15 to 21). */
const BIT = { flavour: 0, spirit: 7, cocktail: 14, plain: 15 };

/** The catalogue and the scorer, hashed: a change to either makes every phone work its fronts out again. */
const TAGS_STAMP = createHash('sha256')
  .update(read('src/data/drinks.json'))
  .update('\0')
  .update(read('src/data/barIndex.json'))
  .update('\0')
  .update(read('src/lib/recommendCore.ts'))
  .digest('hex')
  .slice(0, 12);

/** One integer per catalogue id, from a scorer's flavourHit and spiritHits. */
function tagsFrom(flavourHit, spiritHits, who) {
  const tags = {};
  for (const d of DRINKS) {
    let t = 0;
    FLAVOUR_ORDER.forEach((f, i) => {
      const h = flavourHit(d, f);
      // The plain bit says "1" and the chip bit ">= 0.5": that is all of a hit only while hits are 0, 0.5 or 1.
      if (h !== 0 && h !== 0.5 && h !== 1) fail(`${who} flavourHit(${d.id}, ${f}) is ${h}: tasteTags can only hold 0, 0.5 and 1`);
      if (h >= 0.5) t |= 1 << (BIT.flavour + i);
      if (h === 1) t |= 1 << (BIT.plain + i);
    });
    const hits = spiritHits(d);
    SPIRIT_ORDER.forEach((s, i) => {
      if ((hits.get(s) ?? 0) >= 1) t |= 1 << (BIT.spirit + i);
    });
    if (d.category === 'cocktail') t |= 1 << BIT.cocktail;
    tags[d.id] = t;
  }
  return tags;
}

const portTags = tagsFrom(port.flavourHit, port.spiritHits, 'the port');
diff('tasteTags: the port against the reference', portTags, tagsFrom(ref.flavourHit, ref.spiritHits, 'the reference'));

function tasteTagsFile() {
  return {
    about:
      'GENERATED by node scripts/check-recommend.mjs --write. The Dex\'s taste chips (specs/v4.2/spec.md 1.3) per catalogue id, in Dex order. Bits 0-6: the flavour chips, in `flavours` order (the scorer says it at least once); 7-13: the spirit chips, in `spirits` order (its base, or the bottle itself); 14: a cocktail; 15-21: the flavour said plainly (a hit of 1, which decides a drink\'s For-you section). `stamp` hashes drinks.json, barIndex.json and src/lib/recommendCore.ts. Read by src/lib/dexOrder.ts.',
    stamp: TAGS_STAMP,
    flavours: FLAVOUR_ORDER,
    spirits: SPIRIT_ORDER,
    tags: portTags,
  };
}

if (process.argv.includes('--write')) {
  writeFileSync(at(TAGS_PATH), `${JSON.stringify(tasteTagsFile(), null, 1)}\n`);
  console.log(`  wrote ${TAGS_PATH}`);
}

let TAGS_FILE;
try {
  TAGS_FILE = JSON.parse(read(TAGS_PATH));
} catch {
  fail(`${TAGS_PATH} is missing or unreadable: run node scripts/check-recommend.mjs --write`);
  TAGS_FILE = tasteTagsFile();
}
if (JSON.stringify(TAGS_FILE) !== JSON.stringify(tasteTagsFile())) {
  fail(`${TAGS_PATH} is out of step with drinks.json, barIndex.json or the scorer: run node scripts/check-recommend.mjs --write`);
}

/* ------------------------------------------------------------------ */
/* The Dex: lib/dexOrder against tools/dex-order.mjs (v4.2 §1, §2)     */
/* ------------------------------------------------------------------ */

const dexJs = toEsm(read('src/lib/dexOrder.ts'), 'dexOrder.ts')
  .replace(
    /from ['"]@\/data['"]/,
    `from '${dataUrl(
      `import { readFileSync } from 'node:fs'; export const DRINKS = JSON.parse(readFileSync(${JSON.stringify(at('src/data/drinks.json'))}, 'utf8')).sort((a, b) => a.dexNumber - b.dexNumber); const BY = new Map(DRINKS.map((d) => [d.id, d])); export function getDrink(id) { return typeof id === 'string' ? BY.get(id) : undefined; }`,
    )}'`,
  )
  .replace(/from ['"]@\/data\/tasteTags\.json['"]/, `from '${dataUrl(`export default ${JSON.stringify(TAGS_FILE)};`)}'`);
if (/from ['"]@\//.test(dexJs) || /\brequire\(/.test(dexJs)) fail('lib/dexOrder.ts imports something this script does not stub');
const dex = await import(dataUrl(dexJs));

if (!same(dex.FLAVOUR_ORDER, FLAVOUR_ORDER) || !same(dex.FLAVOUR_ORDER, Object.keys(ref.FLAVOURS))) {
  fail(`lib/dexOrder FLAVOUR_ORDER ${dex.FLAVOUR_ORDER.join(', ')} is not the reference's (${FLAVOUR_ORDER.join(', ')}) and FLAVOURS' order`);
}
if (!same(dex.SPIRIT_ORDER, SPIRIT_ORDER) || !same(dex.SPIRIT_ORDER, Object.keys(ref.SPIRITS))) fail('lib/dexOrder SPIRIT_ORDER is not the reference\'s');
diff('lib/dexOrder FLAVOUR_WORDS', dex.FLAVOUR_WORDS, refDex.FLAVOUR_WORDS);
diff('lib/dexOrder SPIRIT_WORDS', dex.SPIRIT_WORDS, refDex.SPIRIT_WORDS);
if (dex.FRONT !== refDex.FRONT) fail(`lib/dexOrder FRONT is ${dex.FRONT}, the reference's ${refDex.FRONT}`);

/* The same words everywhere: the first run's keys are the chips (v4.2 §1.1), and store/taste accepts each. */
{
  const COPY = read('src/components/onboarding/steps/copy.ts');
  const optionsOf = (name) =>
    [...(COPY.match(new RegExp(`export const ${name}\\b[^=]*= \\[([\\s\\S]*?)\\];`))?.[1] ?? '').matchAll(/\{ key: '([a-z-]+)', label: '([^']+)' \}/g)].map((m) => [m[1], m[2]]);
  diff('steps/copy.ts FLAVOUR_OPTIONS against the chips', optionsOf('FLAVOUR_OPTIONS'), FLAVOUR_ORDER.map((k) => [k, refDex.FLAVOUR_WORDS[k]]));
  diff('steps/copy.ts SPIRIT_OPTIONS against the chips', optionsOf('SPIRIT_OPTIONS'), SPIRIT_ORDER.map((k) => [k, refDex.SPIRIT_WORDS[k]]));
  const TASTE = read('src/store/taste.ts');
  const listOf = (name) => [...(TASTE.match(new RegExp(`const ${name}: readonly \\w+\\[\\] = \\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  diff('store/taste FLAVOUR_KEYS against FLAVOURS', listOf('FLAVOUR_KEYS'), Object.keys(ref.FLAVOURS));
  diff('store/taste SPIRIT_KEYS against SPIRITS', listOf('SPIRIT_KEYS'), Object.keys(ref.SPIRITS));
  const frontMax = Number(TASTE.match(/const FRONT_MAX = (\d+);/)?.[1]);
  if (frontMax !== dex.FRONT) fail(`store/taste FRONT_MAX is ${frontMax}, lib/dexOrder FRONT ${dex.FRONT}`);
}

/** One person's For-you Dex, the port's (fronts through port.recommend, then the order from them) against the reference's. */
function dexCase(label, answers) {
  const theirs = refDex.forYou(answers);
  const fronts = dex.computeDexFronts(answers, port.recommend, 'key');
  if (!theirs) {
    if (fronts !== null) fail(`${label}: the port has fronts where the reference has no For you`);
    if (dex.forYou(fronts) !== null) fail(`${label}: forYou(null) is not null`);
    return true;
  }
  let ok = diff(`${label}: the fronts`, fronts?.sections.map((s) => [s.kind, s.key, s.ids]), theirs.sections.map((s) => [s.kind, s.key, s.ids]));
  const fy = dex.forYou(fronts);
  ok = diff(`${label}: labels and See all`, fy?.sections.map((s) => [s.label, s.all, s.drinks.map((d) => d.id)]), theirs.sections.map((s) => [s.label, s.all, s.ids])) && ok;
  ok = diff(`${label}: Everything else`, fy?.rest.map((d) => d.id), theirs.rest) && ok;
  ok = diff(`${label}: the total order`, fy?.rank.map((d) => d.id), theirs.rank) && ok;
  if (new Set(fy?.rank.map((d) => d.id)).size !== DRINKS.length) fail(`${label}: the total order is not a permutation of the catalogue`);
  return ok;
}

const dexStart = Date.now();
const DEX_PEOPLE = {
  'persona E': refDex.PERSONA_E,
  'run A': RUNS.A.answers,
  'run B': RUNS.B.answers,
  'run C (no answers)': RUNS.C.answers,
  'run D': RUNS.D.answers,
  'run F': RUNS.F.answers,
  'spirits only, whiskey': { spirits: ['whiskey'], flavours: [], drinks: 'spirits' },
  'a gin drinker, fruity': { drinks: 'cocktails', spirits: ['gin'], flavours: ['fruity'], home: null, bar: [] },
};
let dexCases = 0;
for (const [who, answers] of Object.entries(DEX_PEOPLE)) {
  dexCase(who, answers);
  dexCases++;
}
const DEX_SWEEP = 150;
let dexDiffs = 0;
for (let i = 0; i < DEX_SWEEP; i++) {
  const r = lcg(0xdec5 + i * 104729);
  const spirits = some(r, SPIRIT_KEYS, 5);
  const styleOf = spirits.find((s) => s === 'whiskey' || s === 'rum' || s === 'agave') ?? null;
  const answers = {
    goal: null,
    drinks: one(r, KINDS),
    spirits,
    styleOf,
    styles: styleOf ? some(r, Object.keys(ref.STYLES[styleOf]), 2) : [],
    // Mostly flavour sections; a quarter of the people answered spirits alone, for spirit sections.
    flavours: r() < 0.25 ? [] : some(r, FLAVOUR_KEYS, 3),
    home: one(r, HOMES),
    bar: r() < 0.5 ? [] : some(r, ING_IDS, 10),
  };
  if (!dexCase(`dex sweep case ${i} (${JSON.stringify(answers)})`, answers)) dexDiffs++;
  dexCases++;
}

/* The sheet's faceted counts: the spec's two frames, then a run of filters and Dexes. */
const CAUGHT_E = new Set(refDex.CAUGHT_E.filter((id) => DRINKS.some((d) => d.id === id)));
const AT_REST = { flavours: [], spirits: [], kind: 'all', status: 'all' };
const SHEET = { flavours: ['sour', 'fruity'], spirits: [], kind: 'cocktail', status: 'locked' };
const facetCase = (label, f, caught) =>
  diff(`${label}: facetCounts`, dex.facetCounts(f, (id) => caught.has(id)), refDex.facetCounts(f, caught));
facetCase('the sheet at rest', AT_REST, CAUGHT_E);
facetCase('the sheet frame', SHEET, CAUGHT_E);
const FACETS = 40;
for (let i = 0; i < FACETS; i++) {
  const r = lcg(0xface + i * 7919);
  const f = {
    flavours: some(r, FLAVOUR_KEYS, 3),
    spirits: some(r, SPIRIT_KEYS, 3),
    kind: one(r, ['all', 'all', 'cocktail', 'spirit']),
    status: one(r, ['all', 'all', 'unlocked', 'locked']),
  };
  facetCase(`facet case ${i} (${JSON.stringify(f)})`, f, new Set(some(r, DRINK_IDS, 300)));
}
const dexMs = Date.now() - dexStart;

/* The figures v4.2's spec quotes, from the port. */
const dexFigures = (() => {
  const rest = dex.facetCounts(AT_REST, (id) => CAUGHT_E.has(id));
  const sheet = dex.facetCounts(SHEET, (id) => CAUGHT_E.has(id));
  const fy = dex.forYou(dex.computeDexFronts(refDex.PERSONA_E, port.recommend, 'key'));
  return [
    `the sheet at rest: ${FLAVOUR_ORDER.map((k) => `${k} ${rest.flavours[k]}`).join(' · ')}`,
    `the sheet frame (Sour and citrusy, Fruity, Cocktails, Not yet): Show ${sheet.total} drinks; the bar ${sheet.status.unlocked} / ${sheet.status.unlocked + sheet.status.locked}; Fruity ${sheet.flavours.fruity}`,
    ...(fy?.sections ?? []).map((s) => `persona E · ${s.label} (See all ${s.all}): ${s.drinks.map((d) => d.name).join(', ')}`),
    `persona E · Everything else: ${fy?.rest.length} by number`,
  ];
})();

/* ------------------------------------------------------------------ */
/* Report                                                               */
/* ------------------------------------------------------------------ */

console.log('\n  Sipply recommender port check\n');
console.log('  Bar figures, reference makeableCount / lib/bar matchBar (makeable):');
for (const f of figures) console.log(`    run ${f.run}: its bar ${f.bar}   the pre-ticked rows ${f.ticked}`);
console.log('\n  Dex figures (v4.2 §1 and §2), from lib/dexOrder:');
for (const line of dexFigures) console.log(`    ${line}`);
console.log('');

if (failures.length) {
  for (const f of failures.slice(0, 60)) console.log(`  FAIL  ${f}`);
  if (failures.length > 60) console.log(`  … and ${failures.length - 60} more`);
  console.log(`\n  ${failures.length} failure${failures.length === 1 ? '' : 's'}; ${diffs} of ${CASES} sweep cases differ; ${dexDiffs} of ${DEX_SWEEP} Dex sweep cases differ.\n`);
  process.exit(1);
}
console.log(`  PASS  runs A to F match the reference and their pinned picks (matching ${Object.values(RUNS).map((r) => r.matching).join(', ')})`);
console.log(`  PASS  ${CASES.toLocaleString('en-US')}-case sweep: 0 diffs (${(sweepMs / 1000).toFixed(1)} s)`);
console.log(`  PASS  ${CLASSICS_PATH} is in step with the catalogue`);
console.log(`  PASS  ${TAGS_PATH} is in step with the catalogue and the scorer (stamp ${TAGS_STAMP})`);
console.log(`  PASS  lib/dexOrder matches tools/dex-order.mjs: fronts, See all, Everything else and the total order for ${dexCases} people, faceted counts under ${FACETS + 2} filters (${(dexMs / 1000).toFixed(1)} s)\n`);
