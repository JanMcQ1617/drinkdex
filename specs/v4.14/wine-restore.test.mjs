#!/usr/bin/env node
/* ==================================================================== */
/* Wine back in the Dex, v4.14 (specs/v4.14/wine-restore.md): a pure    */
/* check, no device, no React, no network                               */
/*                                                                      */
/* What the restore rests on, each read out of the tree:                */
/*                                                                      */
/*   1. The numbers. Every card the Dex had before wine came back keeps */
/*      its number, and the wines follow the highest of them in one     */
/*      run (Nº 2331 on), so no number is shared and none moved.        */
/*   2. The ids. Each wine is the card a phone logged before 20 Sep     */
/*      2026, by the same id, read from that commit's catalogue         */
/*      (2a75eec^): the same words, a new number, and the four names    */
/*      that lost a qualifier only beer had made necessary. The ones    */
/*      left out are exactly the five sakes and the eight atlas wines   */
/*      that are a spirit-shelf card, which stays a spirit.             */
/*   3. The sources. Every wine is a row in scripts/winedexdata/ or an  */
/*      atlas card (-wn), so a re-merge brings it back; every atlas     */
/*      wine has a card; every wine card and every port, sherry and     */
/*      vermouth on the spirit shelf has an atlas link that resolves.   */
/*   4. The app's pure halves, transpiled and run: the recommender      */
/*      scores no wine and hears no flavour in one; the pour colour     */
/*      maps every wine style the Dex holds and keeps the spirit-shelf  */
/*      rules (Ruby Port deep red, Fino pale); the glass falls back to  */
/*      a wine glass.                                                   */
/*   5. Malibu: Nº 1488, filed as Flavored Rum, its name and number as  */
/*      they were.                                                      */
/*   6. The words: the welcome and the invite say wine.                 */
/*                                                                      */
/*   node specs/v4.14/wine-restore.test.mjs                             */
/* ==================================================================== */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(import.meta.url);
const root = join(dirname(here), '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

let failed = 0;
const ok = (pass, line) => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${line}`);
};

const DRINKS = JSON.parse(read('src/data/drinks.json'));
const byId = new Map(DRINKS.map((d) => [d.id, d]));
const wines = DRINKS.filter((d) => d.category === 'wine');
const others = DRINKS.filter((d) => d.category !== 'wine');
/*
 * The wines that came back. The bottlings (-wb, v4.15) are new wine cards
 * numbered after these, in the same run, and so are the six style cards
 * v4.16 wrote (California Red Blend, New World Rosé…); they are not a
 * restore, so the ids and the sources below are checked without them, and
 * specs/v4.15/wine-bottles.test.mjs and specs/v4.16/style-cards.test.mjs
 * check them on their own terms.
 */
const STYLE_CARDS_V416 = new Set(['new-world-moscato', 'sweet-red', 'california-red-blend', 'red-blend', 'new-world-rose', 'white-blend']);
const restored = wines.filter((d) => !d.id.endsWith('-wb') && !STYLE_CARDS_V416.has(d.id));

/** The Dex's highest number before wine came back (v4.13's last card). */
const LAST_BEFORE_WINE = 2330;
const SAKES = ['daiginjo', 'ginjo', 'honjozo', 'junmai', 'nigori'];
const TWINS = {
  'portoruby-portugal-wn': 'ruby-port',
  'portotawny-portugal-wn': 'tawny-port',
  'portovintage-portugal-wn': 'vintage-port',
  'fino-spain-wn': 'fino-sherry',
  'manzanilladesanlucar-spain-wn': 'manzanilla-sherry',
  'amontillado-spain-wn': 'amontillado-sherry',
  'oloroso-spain-wn': 'oloroso-sherry',
  'palocortado-spain-wn': 'palo-cortado-sherry',
};
const SPIRIT_SHELF = new Set(['Sherry', 'Port', 'Vermouth']);

/* ---- 1. The numbers ---- */

{
  const nums = DRINKS.map((d) => d.dexNumber);
  ok(new Set(nums).size === nums.length, `no two cards share a number (${DRINKS.length.toLocaleString('en-US')} cards)`);
  ok(nums.every((n, i) => i === 0 || n > nums[i - 1]), 'drinks.json is in Dex order');
  /* The restore's own run; the bottlings after it keep their numbers through retirements (specs/v4.15/wine-bottles.test.mjs). */
  const r = restored.map((d) => d.dexNumber).sort((a, b) => a - b);
  const run = r.every((n, i) => n === LAST_BEFORE_WINE + 1 + i);
  ok(run, `the ${restored.length.toLocaleString('en-US')} restored wines run Nº ${r[0]} to ${r[r.length - 1]} with no gap`);
  const w = wines.map((d) => d.dexNumber).sort((a, b) => a - b);
  // A card added later numbers after the last wine; none may sit inside the run.
  const inRun = others.filter((d) => d.dexNumber > LAST_BEFORE_WINE && d.dexNumber <= w[w.length - 1]);
  ok(inRun.length === 0, `no cocktail or spirit is numbered inside the wines' run`);
}

/* ---- 2. The ids, against the catalogue of 2a75eec^ ---- */

{
  let pre = null;
  try {
    pre = JSON.parse(
      execFileSync('git', ['-C', root, 'show', '2a75eec^:src/data/drinks.json'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8'),
    );
  } catch {
    console.log('skip the ids against 2a75eec^: git could not read it (a shallow clone?)');
  }
  if (pre) {
    const preWines = pre.filter((d) => d.category === 'wine');
    const preById = new Map(preWines.map((d) => [d.id, d]));
    const left = preWines.filter((d) => !byId.has(d.id)).map((d) => d.id).sort();
    const expected = [...SAKES, ...Object.keys(TWINS)].sort();
    ok(JSON.stringify(left) === JSON.stringify(expected), `left out: the 5 sakes and the 8 spirit-shelf twins, nothing else (${left.length})`);
    const shelf = preWines.filter((d) => byId.get(d.id)?.category === 'spirit').map((d) => d.id);
    ok(shelf.length === 12 && shelf.every((id) => SPIRIT_SHELF.has(byId.get(id).subcategory)), 'the 12 vermouths, sherries and ports are still spirits');
    ok(restored.every((d) => preById.has(d.id)), 'every restored wine is a pre-removal id: nothing new was invented');
    /*
     * The words, field for field, but for the lines reworded for App Review
     * 1.4.3 on the way back: nine classics' nudges to pour more (Gamay's
     * "dangerously gulpable", "pour generously", "full glasses", "keep it
     * coming", "a second bottle", "pour freely", "drink it fast";
     * scripts/merge-wines.mjs lists them) and the atlas rosés' "a bottle
     * wasted". And one generated sentence: an atlas card's description
     * opened "A AOC", "A AVA" and "from National, France" (build 40's
     * review); it now takes "An" before a vowel, leaves "National" out and
     * calls Vin de France's Various wine of any colour, and nothing else in
     * it moved.
     */
    const REWORDED = new Set([
      'gamay',
      'zinfandel',
      'cabernet-sauvignon',
      'lambrusco',
      'montepulciano-dabruzzo',
      'vinho-verde',
      'gruner-veltliner',
      'txakoli',
      'cava',
    ]);
    const respoken = (s) =>
      s
        .replace(/^A (?=[aeiou])/i, 'An ')
        .replace(/ from National, /, ' from ')
        .replace(/^A VDF various wine /, 'A VDF wine of any colour ');
    const ROSE_HOW =
      'Serve it cold and young. Rosé is one of the few wines where the current vintage is almost always the right one: it fades with keeping rather than improving.';
    const renamed = [];
    const reworded = [];
    for (const d of restored) {
      const p = preById.get(d.id);
      for (const k of new Set([...Object.keys(d), ...Object.keys(p)])) {
        if (k === 'dexNumber') continue;
        if (JSON.stringify(d[k]) === JSON.stringify(p[k])) continue;
        if (k === 'name') renamed.push(`${p.name} -> ${d.name}`);
        else reworded.push({ d, p, k });
      }
    }
    const allowed = ({ d, p, k }) =>
      (REWORDED.has(d.id) && (k === 'description' || k === 'serve')) ||
      (k === 'description' && d.id.endsWith('-wn') && d.description === respoken(p.description)) ||
      (k === 'serve' &&
        d.id.endsWith('-wn') &&
        d.subcategory === 'Rosé' &&
        p.serve.how.endsWith('a bottle wasted.') &&
        d.serve.how === ROSE_HOW &&
        JSON.stringify({ ...d.serve, how: '' }) === JSON.stringify({ ...p.serve, how: '' }));
    const stray = reworded.filter((r) => !allowed(r));
    const opening = reworded.filter((r) => r.k === 'description' && r.d.id.endsWith('-wn')).length;
    ok(
      stray.length === 0,
      `every wine carries the words it had on 20 Sep, field for field, but the ${reworded.length - opening} lines reworded for 1.4.3 and ${opening} atlas descriptions' first words` +
        (stray.length ? ` (stray: ${stray.slice(0, 3).map((r) => `${r.d.id}.${r.k}`).join(', ')})` : ''),
    );
    const words = wines.map((d) => [d.description, d.funFact, d.serve?.how].join(' ')).join('\n');
    ok(
      !/gulpable|pour generously|generous (?:measure|\w+-ounce pour)|full glasses|keep it coming|bottle wasted|second bottle|arm's reach of dinner|pour freely|drink it fast|guilt-free/i.test(
        words,
      ),
      'no wine says "gulpable", "pour generously", "full glasses", "keep it coming", "a bottle wasted", "a second bottle", "pour freely", "drink it fast" or "guilt-free"',
    );
    ok(
      !wines.some((d) => /^A [AEIOU]/.test(d.description) || / from National, /.test(d.description)),
      'no wine card opens "A AOC" or "A AVA", and none is "from National"',
    );
    ok(
      renamed.length === 4 && renamed.every((r) => /^(.*) \(.*\) -> \1$/.test(r)),
      `four names lost the qualifier only beer had needed: ${renamed.join('; ')}`,
    );
  }
}

/* ---- 3. The sources and the links ---- */

{
  const dir = join(root, 'scripts', 'winedexdata');
  const authored = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const authoredIds = new Set(authored.map((r) => r.id));
  ok(authored.every((r) => byId.get(r.id)?.category === 'wine'), `every winedexdata row is a wine card (${authored.length})`);
  ok(restored.every((d) => authoredIds.has(d.id) || d.id.endsWith('-wn')), 'every restored wine card is a winedexdata row or an atlas card');
  ok(!SAKES.some((id) => authoredIds.has(id)), 'no sake in winedexdata');

  const atlas = JSON.parse(read('src/data/wineAtlas.json'));
  const atlasNames = new Set(atlas.wines.map((w) => w.n));
  const grapeNames = new Set(atlas.grapes.map((g) => g.name));
  const links = JSON.parse(read('src/data/wineAtlasLinks.json'));
  const onMap = DRINKS.filter((d) => d.category === 'wine' || (d.category === 'spirit' && SPIRIT_SHELF.has(d.subcategory)));
  ok(
    onMap.every((d) => links[d.id]) && Object.keys(links).length === onMap.length,
    `a link for every wine and spirit-shelf wine, and for nothing else (${onMap.length})`,
  );
  const dangling = Object.entries(links).filter(
    ([, l]) => l.wines.some((n) => !atlasNames.has(n)) || (l.grape !== null && !grapeNames.has(l.grape)),
  );
  ok(dangling.length === 0, 'every linked wine and grape is in the atlas');
  const unlinkedAtlas = atlas.wines.filter((w) => !Object.values(links).some((l) => l.wines.includes(w.n)));
  ok(unlinkedAtlas.length === 0, `every one of the ${atlas.wines.length.toLocaleString('en-US')} atlas wines is some card's`);
}

/* ---- 4. The app's pure halves ---- */

async function load(rel, name) {
  const dir = mkdtempSync(join(tmpdir(), 'sipply-wine-'));
  try {
    const js = ts.transpileModule(read(rel), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: rel,
    }).outputText;
    if (/^\s*import\s/m.test(js)) throw new Error(`${rel} imports something at runtime`);
    const mod = join(dir, `${name}.mjs`);
    writeFileSync(mod, js);
    return await import(pathToFileURL(mod).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const core = await load('src/lib/recommendCore.ts', 'recommendCore');
  const R = core.createRecommender({
    drinks: DRINKS,
    ingredients: [],
    recipes: [],
    photoIds: new Set(),
    knownIds: [],
    classics: {},
  });
  const sample = ['barolo', 'champagne', 'ice-wine', 'provence-rose'].map((id) => byId.get(id));
  ok(sample.every(Boolean), 'the four sample wines are in the Dex');
  ok(
    sample.every((d) => core.FLAVOURS && Object.keys(core.FLAVOURS).every((f) => R.flavourHit(d, f) === 0)),
    'a wine holds no flavour chip',
  );
  ok(sample.every((d) => R.spiritHits(d).size === 0), 'a wine holds no spirit chip');
  ok(sample.every((d) => R.score(d, {}, new Set()) === null), 'a wine is never scored');
  const picks = R.recommend({ drinks: null, spirits: [], flavours: [] }, 30);
  ok(picks.length > 0 && picks.every((p) => p.category !== 'wine'), 'no wine among 30 picks for someone who answered nothing');
}

{
  const { liquidColor, LIQUID, WINE_BY_SUBCATEGORY } = await load('src/components/artwork/liquid.ts', 'liquid');
  const subs = [...new Set(wines.map((d) => d.subcategory))];
  ok(subs.every((s) => WINE_BY_SUBCATEGORY[s]), `every wine style has a pour colour (${subs.join(', ')})`);
  const colour = (id) => liquidColor(byId.get(id));
  ok(colour('ruby-port') === LIQUID.deepRed && colour('fino-sherry') === LIQUID.paleStraw, 'the spirit shelf keeps its rules: Ruby Port deep red, Fino pale');
  ok(colour('barolo') === LIQUID.redWine && colour('chablis') === LIQUID.whiteWine, 'Barolo pours red and Chablis white');
  ok(colour('provence-rose') === LIQUID.rose, 'Provence rosé pours rosé');
  const { resolveShape } = await load('src/components/artwork/glasses.ts', 'glasses');
  ok(resolveShape({ category: 'wine', glassware: '', subcategory: 'White' }) === 'wineRed', 'a wine with no glass named falls back to a wine glass');
}

/* ---- 5. Malibu ---- */

{
  const m = byId.get('malibu-sb');
  ok(
    m?.dexNumber === 1488 && m.name === 'Malibu' && m.category === 'spirit' && m.description === 'Flavored Rum from Barbados.',
    'Malibu is Nº 1488, a Flavored Rum, its name unchanged',
  );
  ok(m?.abv === '21–35%' && m.tastingNotes.includes('tropical fruit'), 'Malibu takes Flavored Rum’s strength and notes');
  const row = JSON.parse(read('scripts/spiritbranddata/07-rum-cane.json')).find((r) => r.n === 'Malibu');
  ok(row?.s === 'Flavored Rum', 'the source row says Flavored Rum, so a re-merge keeps it');
}

/* ---- 6. The words ---- */

ok(read('src/components/onboarding/steps/Welcome.tsx').includes('A field guide to cocktails, spirits and wine.'), 'the welcome says wine');
ok(read('src/lib/invite.ts').includes('a field guide to cocktails, spirits and wine.'), 'the invite says wine');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
