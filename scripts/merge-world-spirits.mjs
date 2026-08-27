/**
 * Merges the world-spirits expansion into drinks.json.
 *
 * Run: node scripts/merge-world-spirits.mjs [--dry]
 *
 * Idempotent — entries are keyed by id, so re-running replaces the previous
 * import rather than appending a second copy, and a dex number an id already
 * holds is reused so a re-run is a true no-op even after another session has
 * appended rows.
 *
 * Validation, merging and the shape assertion all come from
 * scripts/lib/dex-merge.mjs. This file used to carry its own copies of the
 * cross-category collision check, the accent-insensitive name check and the
 * country-label convention. They are gone: a guard living in one script only
 * fires when that script runs, which is why the same label bug was fixed three
 * times in three places. What stays here is only what is specific to a spirit
 * card — the fields it must carry, and the fact that it must NOT carry a
 * recipe, because you do not build a spirit.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  validate,
  merge,
  assertShapePreserved,
  reportAndGate,
} from './lib/dex-merge.mjs';

const SOURCE = new URL('./spiritdata/', import.meta.url);
const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const OWNER = 'merge-world-spirits.mjs';
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const files = readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort();
const source = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SOURCE), 'utf8')));

/* Fields are projected explicitly rather than spread, so a stray key in a
 * source file cannot leak into drinks.json unnoticed. */
const incoming = source.map((s) => ({
  id: s.id,
  name: s.name,
  category: 'spirit',
  subcategory: s.subcategory,
  description: s.description,
  abv: s.abv,
  origin: s.origin,
  rarity: s.rarity,
  tastingNotes: s.tastingNotes,
  glassware: s.glassware,
  funFact: s.funFact,
  /* Placeholder. merge() does { ...card, dexNumber } — because the key
   * already exists here, the spread keeps it in this position and the
   * assignment only changes its value. Without it dexNumber lands last and
   * every one of the 441 spirit rows reorders, a 1,764-line diff in a
   * generated file for no change in data. */
  dexNumber: 0,
  serve: s.serve,
  composition: s.composition,
}));

/* ---- spirit-specific shape, the only checks this script still owns ---- */

const REQUIRED = ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
  'tastingNotes', 'glassware', 'funFact', 'serve', 'composition'];
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);

const errors = [];
for (const s of source) {
  const where = s.id ?? s.name ?? '(unnamed)';
  for (const key of REQUIRED) {
    if (s[key] === undefined || s[key] === null || s[key] === '') {
      errors.push(`${where}: missing ${key}`);
    }
  }
  if (!RARITIES.has(s.rarity)) errors.push(`${where}: bad rarity "${s.rarity}"`);
  if (!Array.isArray(s.tastingNotes) || s.tastingNotes.length < 2) {
    errors.push(`${where}: needs 2+ tasting notes`);
  }
  if (s.serve && (!s.serve.temp || !s.serve.glass || !s.serve.how)) {
    errors.push(`${where}: incomplete serve guide`);
  }
  if (s.composition && (!s.composition.summary || !Array.isArray(s.composition.components) ||
      s.composition.components.length < 3 || !s.composition.process)) {
    errors.push(`${where}: incomplete composition`);
  }
  /* A spirit is made, not built. A recipe here means the row was authored
   * against the cocktail template. */
  if (s.recipe) errors.push(`${where}: spirits must not carry a recipe`);
}

/* ---- everything else is shared ---- */

const report = validate({ drinks, incoming, category: 'spirit', owner: OWNER });
reportAndGate({
  errors: [...errors, ...report.errors],
  warnings: report.warnings,
  owner: OWNER,
});

const { out, added, fresh, refreshed } = merge({ drinks, incoming });

const problems = assertShapePreserved({ before: drinks, after: out, category: 'spirit' });
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
  console.log(`Wrote ${out.length} entries (${added.length} spirits, #${lo}–#${hi}).`);
}

const byCat = {};
for (const d of out) byCat[d.category] = (byCat[d.category] ?? 0) + 1;
console.log('By category:', byCat);
