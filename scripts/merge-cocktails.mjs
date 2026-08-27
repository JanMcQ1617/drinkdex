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
}

/* ---- everything else is shared ---- */

const report = validate({ drinks, incoming, category: 'cocktail', owner: OWNER });
reportAndGate({
  errors: [...errors, ...report.errors],
  warnings: report.warnings,
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
