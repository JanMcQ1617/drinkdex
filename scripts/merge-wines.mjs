/**
 * Merges the world-wine Dex expansion into drinks.json.
 *
 * Run: node scripts/merge-wines.mjs [--dry]
 *
 * These are Dex CARDS, not the wine atlas. The atlas is a separate reference
 * layer built by scripts/build-wine-atlas.mjs — this script never touches it.
 *
 * Naming constraint, from the atlas link map: a card resolves to atlas data by
 * EXACT accent-folded name, so cards are named as the atlas names the
 * appellation — "Colchagua Valley", not "Colchagua". Run
 * scripts/build-wine-atlas-links.mjs after this; it exits 1 on any card that
 * resolves to nothing.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('./winedexdata/', import.meta.url);
const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));

/** Accent-insensitive key, so "Dingac" cannot slip past "Dingač". */
const fold = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const files = readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort();
const incoming = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SOURCE), 'utf8')));
const incomingIds = new Set(incoming.map((d) => d.id));

/* Read-and-merge, never rebuild: four sessions write this file. */
const kept = drinks.filter((d) => !incomingIds.has(d.id));
const nameIndex = new Map(kept.map((d) => [fold(d.name), d.name]));
const idIndex = new Set(kept.map((d) => d.id));

const REQUIRED = ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
  'tastingNotes', 'glassware', 'funFact', 'serve', 'composition'];
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);
const LABELS = new Set(['Grapes', 'Rice', 'Region', 'Vinification', 'Aging']);

const errors = [];
const seenId = new Set();
const seenName = new Map();

for (const w of incoming) {
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

  /* Inverse of the cocktail check — a beer with a recipe means the record was
   * authored against the wrong template. */
  if (w.recipe || w.ingredients) errors.push(`${where}: wines must not carry recipe/ingredients`);


  if (seenId.has(w.id)) errors.push(`${where}: duplicate id within import`);
  seenId.add(w.id);
  if (idIndex.has(w.id)) errors.push(`${where}: id collides with an existing entry`);

  const nk = fold(w.name);
  if (seenName.has(nk)) errors.push(`${where}: duplicate name within import ("${seenName.get(nk)}")`);
  seenName.set(nk, w.name);
  if (nameIndex.has(nk)) errors.push(`${where}: name collides with existing "${nameIndex.get(nk)}"`);
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) — nothing written:\n`);
  for (const e of errors.slice(0, 40)) console.error('  ' + e);
  if (errors.length > 40) console.error(`  …and ${errors.length - 40} more`);
  process.exit(1);
}

/* Sticky dex numbers, so a re-run is a true no-op. */
const existingDex = new Map(drinks.map((d) => [d.id, d.dexNumber]));
let next = Math.max(0, ...drinks.map((d) => d.dexNumber)) + 1;
const added = incoming.map((w) => ({
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
  dexNumber: existingDex.get(w.id) ?? next++,
  serve: w.serve,
  composition: w.composition,
}));

const out = [...kept, ...added].sort((a, b) => a.dexNumber - b.dexNumber);

if (dry) {
  const fresh = added.filter((d) => !existingDex.has(d.id)).length;
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${added.length - fresh} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  const lo = Math.min(...added.map((d) => d.dexNumber));
  const hi = Math.max(...added.map((d) => d.dexNumber));
  console.log(`Wrote ${out.length} entries (${added.length} wines, #${lo}–#${hi}).`);
}

const byCat = {};
for (const d of out) byCat[d.category] = (byCat[d.category] ?? 0) + 1;
console.log('By category:', byCat);
