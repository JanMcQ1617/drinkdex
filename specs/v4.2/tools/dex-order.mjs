#!/usr/bin/env node
/*
 * The Dex's taste filters and its "For you" order (specs/v4.2/spec.md §1 and §2), over the
 * v4.2 reference recommender (./recommend.mjs: the v4-onboarding one plus `fruity`, and the
 * 30% strength cap on fruity and sour, Decided 5).
 *
 *   node specs/v4.2/tools/dex-order.mjs            # prints the counts, persona E's sections and timings
 *   node specs/v4.2/tools/dex-order.mjs --write    # also writes ../data/dex.js for the mockups
 *
 * Built ON TOP of the recommender, never inside it: membership comes from flavourHit and
 * spiritHits, the order inside a section from recommend() itself (its variety caps, its
 * photographed openers) with `exclude` narrowing the pool to the section. Nothing random,
 * no clock: the same answers give the same Dex on every phone. src/lib/dexOrder.ts ports this,
 * and scripts/check-recommend.mjs checks the port against it (fronts, total order, counts).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as R from './recommend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const DRINKS = JSON.parse(readFileSync(join(ROOT, 'src/data/drinks.json'), 'utf8'));
const PHOTOS = new Set(
  [...readFileSync(join(ROOT, 'src/data/drinkPhotos.ts'), 'utf8').matchAll(/'([a-z0-9-]+)': require/g)].map((m) => m[1]),
);
const BY_ID = new Map(DRINKS.map((d) => [d.id, d]));

/* ------------------------------------------------------------------ */
/* The vocabulary: the first run's own words (v4.1 §1.2 + fruity)       */
/* ------------------------------------------------------------------ */

export const FLAVOUR_ORDER = ['refreshing', 'sour', 'fruity', 'sweet', 'bitter', 'strong', 'creamy'];
export const FLAVOUR_WORDS = {
  refreshing: 'Refreshing', sour: 'Sour and citrusy', fruity: 'Fruity', sweet: 'Sweet',
  bitter: 'Bitter', strong: 'Strong and stirred', creamy: 'Creamy',
};
export const SPIRIT_ORDER = ['gin', 'rum', 'agave', 'whiskey', 'vodka', 'brandy', 'liqueur'];
export const SPIRIT_WORDS = {
  gin: 'Gin', rum: 'Rum', agave: 'Tequila and mezcal', whiskey: 'Whiskey', vodka: 'Vodka',
  brandy: 'Brandy and cognac', liqueur: 'Liqueurs and amaro',
};

/** A flavour chip holds a drink when the scorer says it at least once (0.5): the first run's card line. */
export const FLAVOUR_LINE = 0.5;
export const hasFlavour = (d, f) => R.flavourHit(d, f) >= FLAVOUR_LINE;
/** A spirit chip holds a drink whose base it is, or the bottle itself (spiritHits 1, never the 0.6 "in it"). */
export const hasSpirit = (d, s) => (R.spiritHits(d).get(s) ?? 0) >= 1;

/* ------------------------------------------------------------------ */
/* Filters: OR inside an axis, AND across axes                          */
/* ------------------------------------------------------------------ */

/**
 * f = { flavours: [], spirits: [], kind: 'all'|'cocktail'|'spirit', status: 'all'|'unlocked'|'locked' }
 * `caught` is a Set of caught ids. Returns a predicate.
 */
export function matcher(f, caught = new Set()) {
  return (d) => {
    if (f.flavours?.length && !f.flavours.some((x) => hasFlavour(d, x))) return false;
    if (f.spirits?.length && !f.spirits.some((x) => hasSpirit(d, x))) return false;
    if (f.kind && f.kind !== 'all' && d.category !== f.kind) return false;
    if (f.status === 'unlocked' && !caught.has(d.id)) return false;
    if (f.status === 'locked' && caught.has(d.id)) return false;
    return true;
  };
}

/**
 * Faceted counts for the sheet: each chip's count is what the grid would hold with that chip
 * on, with the other axes as they are, and its own axis as only it (so a chip never counts
 * itself out). One pass per chip, 18 chips: about 38,000 cheap tests, worked when the sheet opens.
 */
export function facetCounts(f, caught = new Set()) {
  const out = { flavours: {}, spirits: {}, kind: {}, status: {} };
  const count = (g) => DRINKS.filter(matcher(g, caught)).length;
  for (const x of FLAVOUR_ORDER) out.flavours[x] = count({ ...f, flavours: [x] });
  for (const x of SPIRIT_ORDER) out.spirits[x] = count({ ...f, spirits: [x] });
  for (const x of ['cocktail', 'spirit']) out.kind[x] = count({ ...f, kind: x });
  for (const x of ['unlocked', 'locked']) out.status[x] = count({ ...f, status: x });
  out.total = count(f);
  return out;
}

/* ------------------------------------------------------------------ */
/* For you                                                              */
/* ------------------------------------------------------------------ */

export const FRONT = 12; // drinks at the head of each section: six rows of two

/** The section keys: the flavours in answer order; with none, the spirits; with neither, no For you. */
export function sectionKeys(answers) {
  if (answers.flavours?.length) return answers.flavours.map((k) => ({ kind: 'flavour', key: k }));
  if (answers.spirits?.length) return answers.spirits.map((k) => ({ kind: 'spirit', key: k }));
  return [];
}

const hitOf = (d, s) => (s.kind === 'flavour' ? R.flavourHit(d, s.key) : R.spiritHits(d).get(s.key) ?? 0);
const inSection = (d, s) => (s.kind === 'flavour' ? hasFlavour(d, s.key) : hasSpirit(d, s.key));

/**
 * The whole For-you order.
 *
 *   1. Every drink belongs to at most ONE section: the key it hits hardest, ties to the
 *      earlier answer (a strawberry daiquiri, sour 1 and fruity 1, is a sour for a person who
 *      said sour first). Below the line in every key: no section.
 *   2. A section's FRONT is recommend(answers, 12) with every drink outside the section
 *      excluded: the scorer's own order, caps and photographed openers. When the person's own
 *      gates (their spirits, cocktails or spirits) leave fewer than 12, the rest of the front
 *      comes from the same call with the gates lifted, so a gin drinker's "Fruity" still fills.
 *   3. "Everything else": every drink not in a front, in Nº order. Every drink appears once.
 *   4. `rank`: one total order for a search or a filter in For-you mode: the fronts as shown,
 *      then every other drink by its section (first answer first, none last), each by Nº.
 *
 * Caught drinks are NOT excluded: the Dex is the book, and a tile never jumps away because
 * it was caught. Depends on the answers alone, so it is worked once per answers and memoised.
 */
export function forYou(answers) {
  const keys = sectionKeys(answers);
  if (keys.length === 0) return null;
  const open = { ...answers, spirits: [], styleOf: null, styles: [], drinks: null };

  const home = new Map(); // id → section index
  for (const d of DRINKS) {
    let best = -1;
    let bestHit = 0;
    keys.forEach((s, i) => {
      if (!inSection(d, s)) return;
      const h = hitOf(d, s);
      if (h > bestHit) { best = i; bestHit = h; }
    });
    if (best >= 0) home.set(d.id, best);
  }

  const taken = new Set();
  const sections = keys.map((s, i) => {
    const outside = DRINKS.filter((d) => home.get(d.id) !== i).map((d) => d.id);
    // 'both' gates nothing; only its "two of each" guarantee would put a bottle of white rum
    // among the sours, so a section asks without it. recommend() can return 3 for n < 3 (its
    // photographed openers run before the count is checked), hence the slices.
    const asked = { ...answers, drinks: answers.drinks === 'both' ? null : answers.drinks };
    const first = R.recommend({ ...asked, exclude: outside }, FRONT).map((p) => p.id).slice(0, FRONT);
    let ids = first;
    if (ids.length < FRONT) {
      const more = R.recommend({ ...open, exclude: [...outside, ...ids] }, FRONT - ids.length).map((p) => p.id);
      ids = [...ids, ...more].slice(0, FRONT);
    }
    ids = ids.filter((id) => !taken.has(id));
    ids.forEach((id) => taken.add(id));
    const all = DRINKS.filter((d) => inSection(d, s)).length; // the "See all" figure: the chip's own count
    const words = s.kind === 'flavour' ? FLAVOUR_WORDS[s.key] : SPIRIT_WORDS[s.key];
    return { kind: s.kind, key: s.key, label: words, ids, all };
  });
  const rest = DRINKS.filter((d) => !taken.has(d.id)).map((d) => d.id);

  // The total order, for search and filters in For-you mode: the fronts as shown, then every
  // other drink by its section (first answer first, no section last), each by number. No
  // scoring here: on the phone this is the fronts (stored) plus tasteTags bits, O(n).
  const front = sections.flatMap((s) => s.ids);
  const frontAt = new Map(front.map((id, i) => [id, i]));
  const secOf = (d) => (home.has(d.id) ? home.get(d.id) : keys.length);
  const rank = DRINKS.slice()
    .sort((a, b) => {
      const fa = frontAt.has(a.id), fb = frontAt.has(b.id);
      if (fa || fb) return fa && fb ? frontAt.get(a.id) - frontAt.get(b.id) : fa ? -1 : 1;
      return secOf(a) - secOf(b) || a.dexNumber - b.dexNumber;
    })
    .map((d) => d.id);
  return { sections, rest, rank };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                  */
/* ------------------------------------------------------------------ */

/** Persona E, the mockups' person: Jan's own example, "fruity or sour". */
export const PERSONA_E = {
  goal: null, drinks: 'both', spirits: ['rum', 'agave'], styleOf: 'rum', styles: ['white'],
  flavours: ['sour', 'fruity'], home: 'sometimes',
  bar: ['white-rum', 'tequila', 'lime', 'lemon', 'sugar-syrup', 'soda-water'],
};
/** The persona's Dex in the mockups: 14 caught, the drinks a rum-and-tequila person has had. */
export const CAUGHT_E = [
  'daiquiri', 'mojito', 'margarita', 'pina-colada', 'cuba-libre', 'paloma', 'mai-tai', 'aperol-spritz',
  'negroni', 'old-fashioned', 'espresso-martini', 'cosmopolitan', 'tequila-sunrise', 'whiskey-sour',
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  const caught = new Set(CAUGHT_E.filter((id) => BY_ID.has(id)));
  const empty = { flavours: [], spirits: [], kind: 'all', status: 'all' };
  const counts = facetCounts(empty, caught);
  const t1 = performance.now();
  console.log('Chip counts with nothing on (the sheet at rest):');
  console.log('  flavours', FLAVOUR_ORDER.map((k) => `${k} ${counts.flavours[k]}`).join(' · '));
  console.log('  spirits ', SPIRIT_ORDER.map((k) => `${k} ${counts.spirits[k]}`).join(' · '));
  console.log('  kind    ', counts.kind, ' status', counts.status, ' total', counts.total);
  const on = { flavours: ['sour', 'fruity'], spirits: [], kind: 'cocktail', status: 'locked' };
  const cOn = facetCounts(on, caught);
  console.log('\nSheet frame (Sour and citrusy + Fruity, Cocktails, Not yet):', cOn.total, 'drinks');
  console.log('  flavours', FLAVOUR_ORDER.map((k) => `${k} ${cOn.flavours[k]}`).join(' · '));
  console.log('  spirits ', SPIRIT_ORDER.map((k) => `${k} ${cOn.spirits[k]}`).join(' · '));
  console.log('  kind    ', cOn.kind, ' status', cOn.status);

  const t2 = performance.now();
  const fy = forYou(PERSONA_E);
  const t3 = performance.now();
  console.log(`\nPersona E: ${JSON.stringify(PERSONA_E)}`);
  for (const s of fy.sections) {
    console.log(`\n  ${s.label}  (See all ${s.all})`);
    for (const id of s.ids) {
      const d = BY_ID.get(id);
      console.log(`    ${String(d.dexNumber).padStart(4, '0')}  ${d.name.padEnd(26)} ${d.subcategory.padEnd(16)} ${PHOTOS.has(id) ? 'photo' : '-'}${caught.has(id) ? '  caught' : ''}`);
    }
  }
  console.log(`\n  Everything else: ${fy.rest.length} by number, from ${fy.rest.slice(0, 4).map((id) => BY_ID.get(id).name).join(', ')} …`);
  // Why fronts of 12 (spec §2.2): the rows a WHOLE first section would take before the second.
  {
    const keys = sectionKeys(PERSONA_E);
    const own = DRINKS.filter((d) => {
      let best = -1;
      let bestHit = 0;
      keys.forEach((s, i) => {
        if (inSection(d, s) && hitOf(d, s) > bestHit) { best = i; bestHit = hitOf(d, s); }
      });
      return best === 0;
    }).length;
    console.log(`  a whole ${fy.sections[0].label} section: ${own} drinks of its own, ${Math.ceil(own / 2)} rows before ${fy.sections[1].label}`);
  }
  console.log(`  Total ${fy.sections.reduce((n, s) => n + s.ids.length, 0) + fy.rest.length} (catalogue ${DRINKS.length})`);
  const fyRun = forYou({ ...PERSONA_E });
  console.log(`  deterministic: ${JSON.stringify(fyRun.sections.map((s) => s.ids)) === JSON.stringify(fy.sections.map((s) => s.ids)) && fyRun.rank.join() === fy.rank.join()}`);
  console.log(`  rank is a permutation: ${new Set(fy.rank).size === DRINKS.length}`);

  // Search "rum" in For-you mode: the rank order, filtered.
  const rumHits = fy.rank.filter((id) => /rum/i.test(BY_ID.get(id).name)).slice(0, 6).map((id) => BY_ID.get(id).name);
  console.log(`  "rum" in For-you order: ${rumHits.join(', ')} …`);

  // Run A's person (gin, whiskey; bitter, strong) for the spec's second example.
  const A = { goal: 'discover', drinks: 'both', spirits: ['gin', 'whiskey'], styleOf: 'whiskey', styles: ['bourbon'], flavours: ['bitter', 'strong'], home: 'sometimes', bar: ['gin', 'bourbon', 'lime', 'lemon', 'sugar-syrup', 'soda-water', 'campari', 'sweet-vermouth'] };
  const fa = forYou(A);
  for (const s of fa.sections) console.log(`\n  run A · ${s.label} (See all ${s.all}): ${s.ids.map((id) => BY_ID.get(id).name).join(', ')}`);
  // Spirits only, no flavours: spirit sections.
  const fs = forYou({ spirits: ['whiskey'], flavours: [], drinks: 'spirits' });
  console.log(`\n  spirits only · ${fs.sections[0].label} (See all ${fs.sections[0].all}): ${fs.sections[0].ids.map((id) => BY_ID.get(id).name).join(', ')}`);
  console.log(`\n  timings (Node, M-series): facet counts ${(t1 - t0).toFixed(1)} ms · forYou ${(t3 - t2).toFixed(1)} ms`);

  if (process.argv.includes('--write')) {
    const pick = (id) => {
      const d = BY_ID.get(id);
      return { id, n: d.dexNumber, name: d.name, sub: d.subcategory, cat: d.category, photo: PHOTOS.has(id), caught: caught.has(id) };
    };
    const byNumber = DRINKS.slice(0, 40).map((d) => pick(d.id));
    const restAt = (n) => {
      const i = fy.rest.findIndex((id) => BY_ID.get(id).dexNumber >= n);
      return fy.rest.slice(i, i + 12).map(pick);
    };
    const sheet = { counts: cOn, filter: on };
    const sheetRest = { counts, filter: empty };
    const out = {
      persona: PERSONA_E,
      caughtCount: caught.size,
      total: DRINKS.length,
      sections: fy.sections.map((s) => ({ ...s, items: s.ids.map(pick) })),
      restCount: fy.rest.length,
      restHead: fy.rest.slice(0, 8).map(pick),
      restAt400: restAt(400),
      byNumber,
      sheet,
      sheetRest,
      words: { flavours: FLAVOUR_WORDS, spirits: SPIRIT_WORDS, flavourOrder: FLAVOUR_ORDER, spiritOrder: SPIRIT_ORDER },
      fruityMatching: R.matchingCount({ flavours: ['sour', 'fruity'] }),
    };
    mkdirSync(join(HERE, '../data'), { recursive: true });
    writeFileSync(join(HERE, '../data/dex.js'), `/* GENERATED by tools/dex-order.mjs --write. Real output over src/data. */\nwindow.DEX = ${JSON.stringify(out, null, 1)};\n`);
    console.log('\nwrote data/dex.js');
  }
}
