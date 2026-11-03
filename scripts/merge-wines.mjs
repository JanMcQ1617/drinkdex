/**
 * Merges the authored wine cards into drinks.json.
 *
 * Run: node scripts/merge-wines.mjs [--dry]
 *
 * These are Dex CARDS written by hand: the varietals, the classic regions and
 * styles (00-classics.json), and the world-wine expansion by region (01 to
 * 09). The generated cards, one per named wine in the atlas, come from
 * scripts/merge-wine-atlas.mjs, which runs AFTER this: it skips every atlas
 * wine that shares a name with a card here, so the hand-written card wins.
 *
 * BACK FROM 20 SEP 2026 (v4.14). Wine left the Dex in 2a75eec, and this
 * script, its source files and merge-wine-atlas.mjs went with it. They came
 * back for the App Store launch with the same ids, because a phone keeps a
 * record whose drink has left the catalogue in `retired` (store/collection's
 * settle) and moves it back the moment that id exists again: a wine logged
 * before 20 Sep re-links on the first launch of a build that has it. The
 * numbers are new (the old ones were taken by the renumbering that removal
 * did), so they follow the Dex's highest.
 *
 * 00-classics.json is NEW as a file, not as data. The original 90 wine cards
 * (Nº 250 to 339 before the removal) were written straight into drinks.json
 * and never had a source of their own, so a re-merge could not have brought
 * them back. They are those rows, less the twelve that stayed on the
 * spirit shelf as scripts/spiritdata/99-fortified.json (vermouth, sherry,
 * port) and the five sakes, which are brewed from rice and are not wine
 * (specs/v4.14/wine-restore.md says why they stay out). Nine cards had a
 * line reworded on the way back, for App Review 1.4.3, which allows no
 * nudge to drink more: Gamay was "dangerously gulpable" and to be poured
 * "generously", as Zinfandel was; Cabernet Sauvignon's five ounces were
 * "generous", Lambrusco's measure too, Montepulciano d'Abruzzo poured "full
 * glasses" at "a price that encourages a second bottle" and kept one
 * "within arm's reach of dinner", and Vinho Verde ended "keep it coming".
 * Grüner Veltliner said "pour freely", Txakoli "drink it fast", and Cava's
 * price made it "guilt-free" (the review of build 40 found those three).
 *
 * Naming constraint, from the atlas link map: a card resolves to atlas data by
 * EXACT accent-folded name, so cards are named as the atlas names the
 * appellation — "Colchagua Valley", not "Colchagua". Run
 * scripts/build-wine-atlas-links.mjs after the two merges; it exits 1 on any
 * card that resolves to nothing.
 *
 * Validation, merging and the shape assertion come from
 * scripts/lib/dex-merge.mjs, as for every other writer of drinks.json. What
 * stays here is what is specific to a wine card: its fields, the component
 * labels a wine's composition may use, and that it never carries a recipe.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { assertShapePreserved, merge, reportAndGate, validate } from './lib/dex-merge.mjs';

const SOURCE = new URL('./winedexdata/', import.meta.url);
const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const OWNER = 'merge-wines.mjs';
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const files = readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort();
const source = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SOURCE), 'utf8')));

/* Fields are projected explicitly rather than spread, so a stray key in a
 * source file cannot leak into drinks.json unnoticed. */
const incoming = source.map((w) => ({
  id: w.id,
  name: w.name,
  category: 'wine',
  subcategory: w.subcategory,
  description: w.description,
  abv: w.abv,
  origin: w.origin,
  rarity: w.rarity,
  tastingNotes: w.tastingNotes,
  glassware: w.glassware,
  funFact: w.funFact,
  /* Placeholder, where these rows always carried it: merge() does
   * { ...card, dexNumber }, and a key that already exists keeps its
   * position, so the assignment changes only its value. */
  dexNumber: 0,
  serve: w.serve,
  composition: w.composition,
}));

/* ---- wine-specific shape, the only checks this script owns ---- */

const REQUIRED = ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
  'tastingNotes', 'glassware', 'funFact', 'serve', 'composition'];
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);
/* "Rice" was sake's, and sake is not in the Dex: a Rice label now means a
 * row that should not be here. */
const LABELS = new Set(['Grapes', 'Region', 'Vinification', 'Aging']);

const errors = [];
for (const w of source) {
  const where = w.id ?? w.name ?? '(unnamed)';
  for (const key of REQUIRED) {
    if (w[key] === undefined || w[key] === null || w[key] === '') errors.push(`${where}: missing ${key}`);
  }
  if (!RARITIES.has(w.rarity)) errors.push(`${where}: bad rarity "${w.rarity}"`);
  if (!Array.isArray(w.tastingNotes) || w.tastingNotes.length < 2) errors.push(`${where}: needs 2+ tasting notes`);

  if (w.serve) {
    for (const k of ['temp', 'glass', 'how']) {
      if (!w.serve[k]) errors.push(`${where}: serve missing ${k}`);
    }
    if (!Array.isArray(w.serve.pair) || w.serve.pair.length < 2) errors.push(`${where}: needs 2+ pairings`);
  }
  const c = w.composition;
  if (c) {
    if (!c.summary || !c.process) errors.push(`${where}: composition missing summary/process`);
    if (!Array.isArray(c.components) || c.components.length < 3) errors.push(`${where}: needs 3+ components`);
    else for (const comp of c.components) {
      if (!LABELS.has(comp.label)) errors.push(`${where}: bad component label "${comp.label}"`);
      if (!comp.detail) errors.push(`${where}: component "${comp.label}" has no detail`);
    }
  }

  /* Inverse of the cocktail check: a wine with a recipe means the row was
   * authored against the wrong template. */
  if (w.recipe || w.ingredients) errors.push(`${where}: wines must not carry recipe/ingredients`);
}

/* ---- everything else is shared ---- */

const report = validate({ drinks, incoming, category: 'wine', owner: OWNER });
reportAndGate({ errors: [...errors, ...report.errors], warnings: report.warnings, owner: OWNER });

const { out, added, fresh, refreshed } = merge({ drinks, incoming });

const problems = assertShapePreserved({ before: drinks, after: out, category: 'wine' });
if (problems.length) {
  console.error(`\n${OWNER}: the merge changed rows it does not own — nothing written:\n`);
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

if (dry) {
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${refreshed} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  const lo = Math.min(...added.map((d) => d.dexNumber));
  const hi = Math.max(...added.map((d) => d.dexNumber));
  console.log(`Wrote ${out.length} entries (${added.length} wines, #${lo}–#${hi}).`);
}

const byCat = {};
for (const d of out) byCat[d.category] = (byCat[d.category] ?? 0) + 1;
console.log('By category:', byCat);
