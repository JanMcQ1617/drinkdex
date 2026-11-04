#!/usr/bin/env node
/* ==================================================================== */
/* Dex titles count cocktails and spirits, v4.15 (specs/v4.15/ranks.md): */
/* a pure check, no device, no React renderer, no network               */
/*                                                                      */
/* What the change rests on, each run with the app's own code           */
/* (lib/milestones, store/celebrate and store/collection, transpiled    */
/* with the project's `typescript`, their imports pointed at the real   */
/* catalogue, a stub AsyncStorage holding a saved collection, and the   */
/* project's own zustand):                                              */
/*                                                                      */
/*   1. The scope. The ladder is the cocktails and spirits in the Dex,  */
/*      no wine; ladderCount counts those alone, and nothing else in a  */
/*      collection (a wine, a retired id, "constructor").               */
/*   2. Wine never moves a title. Against a catalogue with 5,000 more   */
/*      wine bottlings and a kind nobody has named yet, the ladder's    */
/*      total and every title are what they are now; and while the      */
/*      cocktails and spirits are the v4.13 Dex's 2,327, every title is */
/*      exactly the one build 39 showed for the same entries.           */
/*   3. The ladder's arithmetic: each rung's count (the ruler's figures */
/*      and the Next line) is the first count rankTitle gives that      */
/*      title, at the ladder's total and at every total to 10,000;      */
/*      nextRung and milestoneCrossed read as the panel and the store   */
/*      need, and a wine (no change in the count) crosses nothing.      */
/*   4. The store, hydrated from saved collections as build 40 left     */
/*      them: a title raised by wine leaving the total is held at       */
/*      launch with no card; a pour that crosses a rung still gets one, */
/*      with the ladder's count on it; a wine gets the collected card   */
/*      and never a rank; a title heard once is not heard again; and    */
/*      Keeper of the Dex takes the cocktails and spirits, no wine.     */
/*   5. Every reader of a title reads the ladder: no call in src/ ranks */
/*      against TOTAL, Dex progress hands the panel the ladder, and the */
/*      title card says "of 2,327 cocktails and spirits".               */
/*   6. The words it adds say what is counted, never a dare or a        */
/*      countdown (App Review 1.4.3).                                   */
/*                                                                      */
/*   node specs/v4.15/ranks.test.mjs                                    */
/* ==================================================================== */

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
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

/** The Dex of v4.13 (build 39), cocktails and spirits alone, and of v4.14 (build 40), wine back. */
const DEX_V413 = 2327;
const DEX_V414 = 4671;

const DRINKS = JSON.parse(read('src/data/drinks.json')).sort((a, b) => a.dexNumber - b.dexNumber);
const ladderDrinks = DRINKS.filter((d) => d.category === 'cocktail' || d.category === 'spirit');
const wineDrinks = DRINKS.filter((d) => d.category === 'wine');

/* ---- Load the app's code, its imports pointed at the data ---- */

const dir = mkdtempSync(join(tmpdir(), 'sipply-ranks-'));
// Set before store/collection is loaded: its storage is picked at module load, and without a window it is the no-op one.
globalThis.window = globalThis.window ?? {};

try {
  const dataStub = (extra) =>
    [
      `import { readFileSync } from 'node:fs';`,
      `const real = JSON.parse(readFileSync(${JSON.stringify(at('src/data/drinks.json'))}, 'utf8'));`,
      `export const DRINKS = real.concat(${extra}).sort((a, b) => a.dexNumber - b.dexNumber);`,
      `export const TOTAL = DRINKS.length;`,
      `const BY = new Map(DRINKS.map((d) => [d.id, d]));`,
      `export function getDrink(id) { return typeof id === 'string' && BY.has(id) ? BY.get(id) : undefined; }`,
      `export function formatCount(n) { return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }`,
    ].join('\n');
  /*
   * The catalogue after more wine: 5,000 wine bottlings numbered past the
   * last card, and 50 of a kind the type does not have yet, which the
   * ladder must leave off until someone puts it on.
   */
  const MORE = `Array.from({ length: 5000 }, (_, i) => ({ id: 'test-bottling-' + i, name: 'Bottling ' + i, dexNumber: 100000 + i, category: 'wine', subcategory: 'Red' }))` +
    `.concat(Array.from({ length: 50 }, (_, i) => ({ id: 'test-kind-' + i, name: 'Kind ' + i, dexNumber: 200000 + i, category: 'wineBottle' })))`;

  const STUBS = {
    data: dataStub('[]'),
    dataMore: dataStub(MORE),
    asyncStorage: [
      '/* What the phone has saved, set by each case before the store is loaded. */',
      'export default {',
      '  getItem: async (name) => (name === "drinkdex-collection" ? globalThis.__rankSaved ?? null : null),',
      '  setItem: async () => {},',
      '  removeItem: async () => {},',
      '};',
    ].join('\n'),
    pour: 'export const rebase = (u) => u;\nexport const discardPhoto = () => {};\nexport const discardAllPhotos = () => {};\n',
  };
  const ZUSTAND = import.meta.resolve('zustand');
  const ZUSTAND_MW = import.meta.resolve('zustand/middleware');
  /** Each app file, and where its run-time imports go: a stub or transpiled file here, or a URL. */
  const FILES = {
    milestones: ['src/lib/milestones.ts', { '@/data': 'data' }],
    milestonesMore: ['src/lib/milestones.ts', { '@/data': 'dataMore' }],
    celebrate: ['src/store/celebrate.ts', { zustand: ZUSTAND }],
    collection: [
      'src/store/collection.ts',
      {
        '@react-native-async-storage/async-storage': 'asyncStorage',
        zustand: ZUSTAND,
        'zustand/middleware': ZUSTAND_MW,
        '@/data': 'data',
        '@/lib/milestones': 'milestones',
        '@/lib/pour': 'pour',
        '@/store/celebrate': 'celebrate',
      },
    ],
  };
  for (const [name, code] of Object.entries(STUBS)) writeFileSync(join(dir, `${name}.mjs`), code);
  for (const [name, [rel, imports]] of Object.entries(FILES)) {
    let js = ts.transpileModule(read(rel), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: rel,
    }).outputText;
    js = js.replace(/from ['"]([^'"]+)['"]/g, (whole, spec) => {
      if (!(spec in imports)) throw new Error(`${rel} imports ${spec}, which this check does not point anywhere`);
      const to = imports[spec];
      return `from '${to.startsWith('file:') ? to : `./${to}.mjs`}'`;
    });
    if (/\brequire\(/.test(js)) throw new Error(`${rel} requires something at run time`);
    writeFileSync(join(dir, `${name}.mjs`), js);
  }

  const M = await import(pathToFileURL(join(dir, 'milestones.mjs')).href);
  const More = await import(pathToFileURL(join(dir, 'milestonesMore.mjs')).href);
  const { useCelebrate } = await import(pathToFileURL(join(dir, 'celebrate.mjs')).href);

  const RUNGS = M.rungCounts(M.LADDER_TOTAL);
  const rung = (title) => RUNGS.find((r) => r.title === title).count;

  /* ---- 1. The scope ---- */

  {
    ok(
      M.LADDER_TOTAL === ladderDrinks.length && M.LADDER_TOTAL + wineDrinks.length === DRINKS.length,
      `the ladder is the ${fmt(M.LADDER_TOTAL)} cocktails and spirits; the Dex's other ${fmt(wineDrinks.length)} are wines`,
    );
    ok(
      M.onLadder('cocktail') && M.onLadder('spirit') && !M.onLadder('wine') && !M.onLadder(undefined) && !M.onLadder('wineBottle'),
      'onLadder: cocktails and spirits; not wine, not an unknown kind, not a missing drink',
    );
    const unlocks = {};
    for (const d of ladderDrinks.slice(0, 40)) unlocks[d.id] = { drinkId: d.id };
    for (const d of wineDrinks.slice(0, 25)) unlocks[d.id] = { drinkId: d.id };
    unlocks['a-retired-id'] = { drinkId: 'a-retired-id' };
    unlocks.constructor = { drinkId: 'constructor' };
    ok(M.ladderCount(unlocks) === 40, 'ladderCount: 40 cocktails and spirits among 25 wines, a retired id and "constructor" count 40');
    ok(M.ladderCount({}) === 0, 'ladderCount: an empty collection is 0');
  }

  /* ---- 2. Wine never moves a title ---- */

  {
    ok(
      More.LADDER_TOTAL === M.LADDER_TOTAL,
      `5,000 more wine bottlings and a new kind leave the ladder at ${fmt(M.LADDER_TOTAL)}`,
    );
    let same = true;
    for (let k = 0; k <= M.LADDER_TOTAL; k++) {
      if (More.rankTitle(k, More.LADDER_TOTAL) !== M.rankTitle(k, M.LADDER_TOTAL)) same = false;
    }
    ok(same, `with them, every title from 0 to ${fmt(M.LADDER_TOTAL)} cocktails and spirits is what it is now`);
    if (M.LADDER_TOTAL === DEX_V413) {
      let asBuild39 = true;
      let lowerIn40 = 0;
      for (let k = 0; k <= DEX_V413; k++) {
        const t = M.rankTitle(k, M.LADDER_TOTAL);
        if (t !== M.rankTitle(k, DEX_V413)) asBuild39 = false;
        if (M.rankTitle(k, DEX_V414) !== t) lowerIn40++;
      }
      ok(asBuild39, `every title is the one build 39 showed for the same entries (the Dex was ${fmt(DEX_V413)}, no wine)`);
      ok(lowerIn40 > 0, `and build 40 showed a lower one at ${fmt(lowerIn40)} of those counts (233 logged: ${M.rankTitle(233, DEX_V414)}, now ${M.rankTitle(233, M.LADDER_TOTAL)})`);
    } else {
      console.log(`note: the cocktails and spirits are ${fmt(M.LADDER_TOTAL)}, no longer v4.13's ${fmt(DEX_V413)}, so the build 39 comparison is skipped`);
    }
  }

  /* ---- 3. The ladder's arithmetic ---- */

  {
    const level = (title) => M.MILESTONES.findIndex((m) => m.title === title);
    /*
     * The first count at or above the rung, one under it below. "At or
     * above": under about 40 entries two rungs can share a count, and that
     * count holds the higher one.
     */
    const holds = (total) =>
      M.rungCounts(total).every((r) => {
        const i = level(r.title);
        return level(M.rankTitle(r.count, total)) >= i && level(M.rankTitle(r.count - 1, total)) < i;
      });
    ok(
      holds(M.LADDER_TOTAL) && RUNGS.every((r) => M.rankTitle(r.count, M.LADDER_TOTAL) === r.title),
      `each rung's count is the first that holds it: ${RUNGS.map((r) => `${r.title} ${fmt(r.count)}`).join(', ')}`,
    );
    let all = true;
    for (let t = 1; t <= 10000; t++) if (!holds(t)) all = false;
    ok(all, 'and so at every total from 1 to 10,000, so a catalogue edit cannot put a figure off its rung');
    ok(RUNGS[RUNGS.length - 1].count === M.LADDER_TOTAL, 'Keeper of the Dex is every cocktail and spirit');

    const c10 = rung('Cataloguer');
    const c25 = rung('Archivist');
    ok(M.nextRung(0, M.LADDER_TOTAL) === undefined, 'nextRung: none at nought');
    ok(M.nextRung(c10 - 1, M.LADDER_TOTAL)?.title === 'Cataloguer' && M.nextRung(c10 - 1, M.LADDER_TOTAL)?.count === c10, `nextRung at ${c10 - 1}: Cataloguer, at ${fmt(c10)}`);
    ok(M.nextRung(c10, M.LADDER_TOTAL)?.title === 'Archivist' && M.nextRung(c10, M.LADDER_TOTAL)?.count === c25, `nextRung at ${c10}: Archivist, at ${fmt(c25)}`);
    ok(M.nextRung(M.LADDER_TOTAL, M.LADDER_TOTAL) === undefined, 'nextRung: none at the top');

    ok(M.milestoneCrossed(c10 - 1, c10, M.LADDER_TOTAL)?.title === 'Cataloguer', `milestoneCrossed ${c10 - 1} -> ${c10}: Cataloguer`);
    ok(M.milestoneCrossed(c10, c10 + 1, M.LADDER_TOTAL) === null, 'milestoneCrossed inside a rung: none');
    ok(M.milestoneCrossed(0, 1, M.LADDER_TOTAL) === null, 'milestoneCrossed 0 -> 1: none (the first rung is never announced)');
    ok(M.milestoneCrossed(c10 - 1, c10 - 1, M.LADDER_TOTAL) === null, 'milestoneCrossed with the count unchanged (a wine): none');
  }

  /* ---- 4. The store, from collections as build 40 saved them ---- */

  let caseNo = 0;
  /**
   * A fresh store hydrated from a saved blob: `ladder` cocktails and spirits
   * and `wine` wines, as Dex order has them, and the saved bestRung.
   */
  async function hydrate({ ladder, wine = 0, bestRung }) {
    const unlocks = {};
    for (const d of ladderDrinks.slice(0, ladder)) unlocks[d.id] = { drinkId: d.id, photoUri: null, date: '2026-10-01T12:00:00.000Z' };
    for (const d of wineDrinks.slice(0, wine)) unlocks[d.id] = { drinkId: d.id, photoUri: null, date: '2026-11-01T12:00:00.000Z' };
    const state = { unlocks, retired: {} };
    if (bestRung !== undefined) state.bestRung = bestRung;
    globalThis.__rankSaved = JSON.stringify({ state, version: 1 });
    caseNo++;
    const { useCollection } = await import(`${pathToFileURL(join(dir, 'collection.mjs')).href}?case=${caseNo}`);
    for (let i = 0; i < 200 && !useCollection.getState().hydrated; i++) await new Promise((r) => setTimeout(r, 0));
    useCelebrate.getState().clear();
    let nextLadder = ladder;
    let nextWine = wine;
    return {
      store: useCollection,
      title: () => M.rankTitle(M.ladderCount(useCollection.getState().unlocks), M.LADDER_TOTAL),
      logLadder: () => useCollection.getState().unlock(ladderDrinks[nextLadder++].id, null),
      logWine: () => useCollection.getState().unlock(wineDrinks[nextWine++].id, null),
    };
  }
  const queue = () => useCelebrate.getState().queue;
  const ranksIn = () => queue().filter((c) => c.kind === 'milestone');
  const idx = (title) => M.MILESTONES.findIndex((m) => m.title === title);

  {
    // 300 cocktails and spirits, no wine: build 40 read Note taker (300 of 4,671) and saved bestRung 0.
    const c = await hydrate({ ladder: 300, bestRung: 0 });
    ok(c.store.getState().hydrated, 'the store hydrates from a saved collection');
    const was = M.rankTitle(300, DEX_V414);
    ok(
      c.title() === 'Cataloguer' && c.store.getState().bestRung === idx('Cataloguer'),
      `300 cocktails and spirits: ${was} in build 40, Cataloguer now, held at launch (bestRung ${c.store.getState().bestRung})`,
    );
    c.logLadder();
    ok(
      queue().length === 1 && queue()[0].kind === 'collected' && ranksIn().length === 0,
      'the next pour gets the collected card and no "Cataloguer": the rise was the ladder changing, not the pour',
    );
  }

  {
    const c25 = rung('Archivist');
    const c = await hydrate({ ladder: c25 - 2, bestRung: idx('Cataloguer') });
    c.logLadder();
    ok(ranksIn().length === 0, `${fmt(c25 - 1)}: no rank`);
    c.logLadder();
    const r = ranksIn();
    ok(
      r.length === 1 && r[0].milestone.title === 'Archivist' && r[0].collected === c25 && c.store.getState().bestRung === idx('Archivist'),
      `the pour that makes ${fmt(c25)} still earns Archivist, after its collected card, and the card says ${fmt(c25)}`,
    );
    ok(queue().map((q) => q.kind).join() === 'collected,collected,milestone', 'in order: the entries, then the rank');
  }

  {
    const c10 = rung('Cataloguer');
    const c = await hydrate({ ladder: c10 - 1, wine: 40, bestRung: idx('Note taker') });
    c.logWine();
    ok(
      queue().length === 1 && queue()[0].kind === 'collected' && ranksIn().length === 0 && c.title() === 'Note taker',
      `${fmt(c10 - 1)} cocktails and spirits and 40 wines: a 41st wine gets the collected card, no rank, and the title stays Note taker`,
    );
    c.logLadder();
    const r = ranksIn();
    ok(
      r.length === 1 && r[0].milestone.title === 'Cataloguer' && r[0].collected === c10,
      `the next cocktail earns Cataloguer, and its card says ${fmt(c10)}, the ladder's count, not the Dex's ${fmt(c10 + 41)}`,
    );
  }

  {
    // A build 40 tester whose wines made Cataloguer (500 of 4,671) and who heard it then.
    const c10 = rung('Cataloguer');
    const c = await hydrate({ ladder: 100, wine: 400, bestRung: idx('Cataloguer') });
    ok(
      c.title() === 'Note taker' && c.store.getState().bestRung === idx('Cataloguer'),
      `100 cocktails and spirits and 400 wines: Note taker now, and the Cataloguer already heard in build 40 is kept`,
    );
    for (let k = 100; k < c10; k++) c.logLadder();
    ok(
      c.title() === 'Cataloguer' && ranksIn().length === 0,
      `reaching ${fmt(c10)} cocktails and spirits makes them Cataloguer again without a second card for it`,
    );
  }

  {
    // Saved before bestRung existed (build 18 and earlier): seeded from the ladder, no card.
    const c = await hydrate({ ladder: 300 });
    c.logLadder();
    ok(c.store.getState().bestRung === idx('Cataloguer') && ranksIn().length === 0, 'a collection saved before bestRung existed is seeded from the ladder and re-awarded nothing');
  }

  {
    const c = await hydrate({ ladder: M.LADDER_TOTAL - 1, bestRung: idx('Curator') });
    c.logLadder();
    const r = ranksIn();
    ok(
      r.length === 1 && r[0].milestone.title === 'Keeper of the Dex' && r[0].collected === M.LADDER_TOTAL,
      `the last cocktail or spirit earns Keeper of the Dex at ${fmt(M.LADDER_TOTAL)}, with no wine logged`,
    );
    c.logWine();
    ok(c.title() === 'Keeper of the Dex' && ranksIn().length === 1, 'a wine after it changes nothing');
  }

  {
    const c = await hydrate({ ladder: 0, wine: 30, bestRung: -1 });
    ok(c.title() === 'Not started' && c.store.getState().bestRung === -1, 'thirty wines and nothing else: no title yet (Not started), no rung held');
    c.logLadder();
    ok(c.title() === 'Note taker' && ranksIn().length === 0, 'the first cocktail makes them a Note taker, unannounced like every first rung');
  }

  /* ---- 5. Every reader of a title reads the ladder ---- */

  {
    const files = [];
    const walk = (d) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk(at('src'));
    const calls = [];
    for (const p of files) {
      const rel = relative(root, p);
      if (rel === join('src', 'lib', 'milestones.ts')) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\b(rankTitle|milestoneCrossed|rungCounts|nextRung)\(([^)]*)\)/g)) calls.push({ rel, fn: m[1], args: m[2] });
    }
    const onTotal = calls.filter((c) => /\bTOTAL\b/.test(c.args));
    ok(
      calls.length >= 4 && onTotal.length === 0,
      `no call in src/ reads a title against TOTAL (${calls.length} calls: ${[...new Set(calls.map((c) => `${c.rel.replace('src/', '')} ${c.fn}`))].join(', ')})`,
    );

    const store = read('src/store/collection.ts');
    ok(
      /rankTitle\(count, LADDER_TOTAL\)/.test(store) &&
        /rungAt\(ladderCount\(unlocks\)\)/.test(store) &&
        /const before = ladderCount\(prev\);/.test(store) &&
        /milestoneCrossed\(before, after, LADDER_TOTAL\)/.test(store) &&
        !/\bTOTAL\b(?<!LADDER_TOTAL)/.test(store.replace(/LADDER_TOTAL/g, '')),
      "store/collection seeds and crosses rungs on the ladder's count, and never reads TOTAL",
    );
    const stats = read('src/components/CollectionStats.tsx');
    ok(
      stats.includes('<DexPanel count={unlockedCount} total={TOTAL} ladder={ladder} ladderTotal={LADDER_TOTAL} />') &&
        stats.includes('if (onLadder(drink.category)) ladder += 1;'),
      'Dex progress hands the panel the Dex (its figure) and the ladder (its title, ruler and lines)',
    );
    const ruler = read('src/components/Ruler.tsx');
    ok(
      ruler.includes('const rank = rankTitle(ladder, ladderTotal);') &&
        ruler.includes('const next = nextRung(ladder, ladderTotal);') &&
        ruler.includes('<Ruler count={ladder} total={ladderTotal} mode="ladder" label={reads} />') &&
        !/export function rungCounts/.test(ruler),
      "the panel's title, Next line and ladder ruler read the ladder; rungCounts lives in lib/milestones alone",
    );
    const overlay = read('src/components/CelebrationOverlay.tsx');
    ok(
      overlay.includes('of ${formatCount(LADDER_TOTAL)} cocktails and spirits') &&
        overlay.includes('{ladderLine(current.collected)}') &&
        overlay.includes("if (c.kind === 'milestone') return `${c.milestone.title}. ${ladderLine(c.collected)}.`;"),
      'the title card and its VoiceOver line say "of 2,327 cocktails and spirits"',
    );
  }

  /* ---- 6. The words ---- */

  {
    const r10 = rung('Cataloguer');
    const words = [
      `Titles count cocktails and spirits: 38 of ${fmt(M.LADDER_TOTAL)}`,
      `Next: Cataloguer, at ${fmt(r10)}`,
      `Your Dex now holds ${fmt(r10)} of ${fmt(M.LADDER_TOTAL)} cocktails and spirits`,
    ];
    const ruler = read('src/components/Ruler.tsx');
    const overlay = read('src/components/CelebrationOverlay.tsx');
    ok(
      ruler.includes('`Titles count cocktails and spirits: ${formatCount(ladder)} of ${formatCount(ladderTotal)}`') &&
        ruler.includes('Next: <Text style={styles.strong}>{next.title}</Text>, at {formatCount(next.count)}') &&
        overlay.includes('`Your Dex now holds ${formatCount(collected)} of ${formatCount(LADDER_TOTAL)} cocktails and spirits`'),
      'the lines are the ones this check reads',
    );
    const DARE = /\b(drunk|wasted|buzz(ed)?|binge|chug|booze|another round|keep (it|them) coming|more|to go|left|away|score|points?|level up)\b/i;
    ok(words.every((w) => !DARE.test(w)), 'they say what is counted, never a dare, a score or how many more (App Review 1.4.3)');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
