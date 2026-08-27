/**
 * Merges the world-cocktails expansion into drinks.json.
 *
 * Run: node scripts/merge-cocktails.mjs [--dry]
 *
 * Idempotent — entries are keyed by id, so re-running replaces the previous
 * import rather than appending a second copy, and a dex number an id already
 * holds is reused so a re-run is a true no-op even after another session has
 * appended rows.
 *
 * Validation, merging and the shape assertion all come from
 * scripts/lib/dex-merge.mjs. This file used to carry its own copies of the
 * cross-category collision check, the accent-insensitive name check and the
 * pre-write shape diff. They are gone — a guard living in one script only
 * fires when that script runs. What stays here is only what is specific to a
 * cocktail card: it carries `ingredients` and a `recipe`, and must NOT carry
 * `serve` or `composition`, which is the exact reverse of the spirit, beer
 * and wine shape.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  abvBelowFloor,
  validate,
  merge,
  assertShapePreserved,
  reportAndGate,
} from './lib/dex-merge.mjs';

const SOURCE = new URL('./cocktaildata/', import.meta.url);
const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const OWNER = 'merge-cocktails.mjs';
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const files = readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort();
const source = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SOURCE), 'utf8')));

/* Fields are projected explicitly rather than spread, so a stray key in a
 * source file cannot leak into drinks.json unnoticed. */
const incoming = source.map((c) => ({
  id: c.id,
  name: c.name,
  category: 'cocktail',
  subcategory: c.subcategory,
  description: c.description,
  abv: c.abv,
  origin: c.origin,
  rarity: c.rarity,
  tastingNotes: c.tastingNotes,
  glassware: c.glassware,
  ingredients: c.ingredients,
  funFact: c.funFact,
  /* Placeholder, and it has to sit exactly here. merge() does
   * { ...card, dexNumber } — because the key already exists at this position
   * the spread keeps it here and the assignment only changes its value.
   * Without it dexNumber lands last and all 763 cocktail rows reorder: a
   * diff of thousands of lines in a generated file for no change in data. */
  dexNumber: 0,
  recipe: c.recipe,
}));

/* ---- cocktail-specific shape, the only checks this script still owns ---- */

const REQUIRED = ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
  'tastingNotes', 'glassware', 'ingredients', 'funFact', 'recipe'];
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);

const errors = [];
for (const c of source) {
  const where = c.id ?? c.name ?? '(unnamed)';
  for (const key of REQUIRED) {
    if (c[key] === undefined || c[key] === null || c[key] === '') {
      errors.push(`${where}: missing ${key}`);
    }
  }
  if (!RARITIES.has(c.rarity)) errors.push(`${where}: bad rarity "${c.rarity}"`);
  if (!Array.isArray(c.tastingNotes) || c.tastingNotes.length < 2) {
    errors.push(`${where}: needs 2+ tasting notes`);
  }
  /* `ingredients` is the at-a-glance list on the card; `recipe.ingredients`
   * is the measured spec. They are different fields and a card needs both. */
  if (!Array.isArray(c.ingredients) || c.ingredients.length < 1) {
    errors.push(`${where}: needs a spec ingredient list`);
  }

  const r = c.recipe;
  if (r) {
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) {
      errors.push(`${where}: recipe needs 2+ ingredients`);
    } else for (const i of r.ingredients) {
      if (!i.item || !i.amount) errors.push(`${where}: recipe ingredient missing item/amount`);
    }
    if (!Array.isArray(r.steps) || r.steps.length < 3) errors.push(`${where}: recipe needs 3+ steps`);
    if (!r.method) errors.push(`${where}: recipe missing method`);
  }

  /* The inverse of the spirits check — a cocktail with a serve guide means a
   * record was authored against the wrong template. */
  if (c.serve || c.composition) errors.push(`${where}: cocktails must not carry serve/composition`);

  /* The alcohol floor itself is check 6 in the shared validator and is NOT
   * repeated here. A duplicate lived in this file while that commit was in
   * flight; carrying two copies of one rule is what made the Kvass removal
   * ambiguous, so it goes the moment it stops being necessary.
   *
   * What stays is cocktail-only and deliberately not promoted upward: a
   * cocktail must state a strength at all. 174 beer cards legitimately read
   * "Not published" and one wine card reads "Varies by producer", so the
   * shared module has to let those through — a cocktail is authored right
   * here and has no such excuse. Guarded by abvBelowFloor so that an
   * "Alcohol-Free" row, which also contains no digit, reports the floor error
   * alone rather than both. */
  if (!abvBelowFloor(c.abv) && !/\d/.test(String(c.abv ?? ''))) {
    errors.push(`${where}: abv "${c.abv}" states no strength`);
  }
}

/* ---- everything else is shared ---- */

/* A drink already in the Dex under a DIFFERENT name is the collision the
 * name check cannot see. Nine got through that way and had to be removed
 * afterwards — Ward 8 against Ward Eight, Rose against Rose Cocktail, Yale
 * against Yale Cocktail, and six more whose two names share no folded form at
 * all. What they did share was a spec ingredient list, so that is the key.
 *
 * A WARNING and never an error. Weißer Spritzer, Gemišt and Fröccs are three
 * countries' names for wine and soda and all three belong; so do Batanga and
 * Charro Negro, and Mimosa and Buck's Fizz. Nothing here can tell those from a
 * true duplicate — only a person reading the two cards can — so it asks
 * instead of blocking. Nine such pairs survive that reading today and are
 * meant to. */
const ingredientKey = (row) =>
  [...new Set((row.ingredients ?? []).map((i) => String(i).toLowerCase().trim()))]
    .sort()
    .join('|');

const incomingIds = new Set(incoming.map((c) => c.id));
const liveByIngredients = new Map();
for (const d of drinks) {
  if (d.category !== 'cocktail' || incomingIds.has(d.id)) continue;
  const k = ingredientKey(d);
  if (!k) continue;
  if (!liveByIngredients.has(k)) liveByIngredients.set(k, []);
  liveByIngredients.get(k).push(d);
}
/* Compare against the rest of the IMPORT as well as against the Dex. Colony
 * and Southern Bride arrived in the same batch as each other, so a check that
 * only looked at existing rows would have said nothing about either. */
const twinWarnings = [];
const seenTwin = new Set();
for (const c of incoming) {
  const k = ingredientKey(c);
  if (!k) continue;
  const twins = [
    ...(liveByIngredients.get(k) ?? []),
    ...incoming.filter((o) => o.id !== c.id && ingredientKey(o) === k),
  ];
  if (!twins.length) continue;
  /* One warning per group, not one per member of it. */
  const groupKey = [c.id, ...twins.map((t) => t.id)].sort().join('+');
  if (seenTwin.has(groupKey)) continue;
  seenTwin.add(groupKey);
  twinWarnings.push(
    `"${c.name}" has the same ingredients as ${twins.map((t) => `"${t.name}"`).join(', ')} — same drink under two names?`
  );
}

const report = validate({ drinks, incoming, category: 'cocktail', owner: OWNER });
reportAndGate({
  errors: [...errors, ...report.errors],
  warnings: [...twinWarnings, ...report.warnings],
  owner: OWNER,
});

const { out, added, fresh, refreshed } = merge({ drinks, incoming });

const problems = assertShapePreserved({ before: drinks, after: out, category: 'cocktail' });
if (problems.length) {
  console.error(`\nshape assertion failed — nothing written:\n`);
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

if (dry) {
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${refreshed} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  const lo = Math.min(...added.map((d) => d.dexNumber));
  const hi = Math.max(...added.map((d) => d.dexNumber));
  console.log(`Wrote ${out.length} entries (${added.length} cocktails, #${lo}–#${hi}).`);
}

const byCat = {};
for (const d of out) byCat[d.category] = (byCat[d.category] ?? 0) + 1;
console.log('By category:', byCat);
