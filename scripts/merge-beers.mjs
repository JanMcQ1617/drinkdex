/**
 * Merges the world-beer Dex expansion into drinks.json.
 *
 * Run: node scripts/merge-beers.mjs [--dry]
 *
 * These are Dex CARDS (beer styles and traditional brews), not the brand
 * layer. Brands live in src/data/breweries.json and are built separately by
 * scripts/build-breweries.mjs — this script never touches them.
 *
 * Naming constraint, learned from the brand layer: styleRef resolution
 * exact-matches a brand's full lowercased style string against Dex names, so
 * an entry named plainly "Lager" would silently recapture hundreds of brands.
 * Keep every name here QUALIFIED — "Filipino Pale Pilsen", never "Pilsen".
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('./beerdexdata/', import.meta.url);
const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));

/** Accent-insensitive key, so "Maltol" cannot slip past "Maltøl". */
const fold = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const files = readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort();
const incoming = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SOURCE), 'utf8')));
const incomingIds = new Set(incoming.map((d) => d.id));

/* Read-and-merge, never rebuild: four sessions write this file. */
/* Only drop a PRIOR entry when the incoming record replaces it in the SAME
 * category. Filtering on id alone silently converted a spirit/beer/wine
 * into a beer when ids collided across categories, and the collision
 * check below could never fire because it read from this filtered array. */
const kept = drinks.filter((d) => !(incomingIds.has(d.id) && d.category === 'beer'));
const priorById = new Map(drinks.map((d) => [d.id, d]));
const nameIndex = new Map(kept.map((d) => [fold(d.name), d.name]));

const REQUIRED = ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
  'tastingNotes', 'glassware', 'funFact', 'serve', 'composition'];
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);
const LABELS = new Set(['Malt', 'Hops', 'Yeast', 'Other']);

/* Bare style names that would exact-capture brands away from their current
 * Dex entry. A qualified name containing one of these as a word is fine —
 * matching is on the whole string. */
const RESERVED = new Set(['lager', 'pils', 'pilsner', 'ipa', 'pale ale', 'stout', 'porter',
  'bitter', 'trappist', 'abbey', 'dark lager', 'light lager', 'strong lager', 'amber']);

const errors = [];
const seenId = new Set();
const seenName = new Map();

for (const b of incoming) {
  const where = b.id ?? b.name ?? '(unnamed)';
  for (const key of REQUIRED) {
    if (b[key] === undefined || b[key] === null || b[key] === '') errors.push(`${where}: missing ${key}`);
  }
  if (!RARITIES.has(b.rarity)) errors.push(`${where}: bad rarity "${b.rarity}"`);
  if (!Array.isArray(b.tastingNotes) || b.tastingNotes.length < 2) errors.push(`${where}: needs 2+ tasting notes`);

  if (b.serve) {
    for (const k of ['temp', 'glass', 'how']) {
      if (!b.serve[k]) errors.push(`${where}: serve missing ${k}`);
    }
    if (!Array.isArray(b.serve.pair) || b.serve.pair.length < 2) errors.push(`${where}: needs 2+ pairings`);
  }
  const c = b.composition;
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
  if (b.recipe || b.ingredients) errors.push(`${where}: beers must not carry recipe/ingredients`);

  if (RESERVED.has(b.name.toLowerCase())) {
    errors.push(`${where}: name "${b.name}" is a bare style string and would recapture brands — qualify it`);
  }

  if (seenId.has(b.id)) errors.push(`${where}: duplicate id within import`);
  seenId.add(b.id);
  const prior = priorById.get(b.id);
  if (prior && prior.category !== 'beer') {
    errors.push(`${where}: id collides with existing ${prior.category} "${prior.name}"`);
  }

  const nk = fold(b.name);
  if (seenName.has(nk)) errors.push(`${where}: duplicate name within import ("${seenName.get(nk)}")`);
  seenName.set(nk, b.name);
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
const added = incoming.map((b) => ({
  id: b.id,
  name: b.name,
  category: 'beer',
  subcategory: b.subcategory,
  description: b.description,
  abv: b.abv,
  origin: b.origin,
  rarity: b.rarity,
  tastingNotes: b.tastingNotes,
  glassware: b.glassware,
  funFact: b.funFact,
  dexNumber: existingDex.get(b.id) ?? next++,
  serve: b.serve,
  composition: b.composition,
}));

const out = [...kept, ...added].sort((a, b) => a.dexNumber - b.dexNumber);

/* Shape check before writing. The collision guard above should make this
 * unreachable, but both silent-corruption bugs found in this repo were
 * invisible to an exit code and obvious in a count diff — so the diff is
 * done here rather than left to whoever remembers to look. */
const priorCat = new Map(drinks.map((d) => [d.id, d.category]));
const reclassified = out.filter((d) => priorCat.has(d.id) && priorCat.get(d.id) !== d.category);
const dropped = drinks.filter((d) => !new Set(out.map((o) => o.id)).has(d.id));
if (reclassified.length || dropped.length) {
  console.error('\nABORT — the merge would change the shape of drinks.json:');
  for (const d of reclassified) console.error(`  ${d.id}: ${priorCat.get(d.id)} -> ${d.category}`);
  for (const d of dropped) console.error(`  ${d.id}: dropped entirely`);
  process.exit(1);
}

if (dry) {
  const fresh = added.filter((d) => !existingDex.has(d.id)).length;
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${added.length - fresh} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  const lo = Math.min(...added.map((d) => d.dexNumber));
  const hi = Math.max(...added.map((d) => d.dexNumber));
  console.log(`Wrote ${out.length} entries (${added.length} beers, #${lo}–#${hi}).`);
}

const byCat = {};
for (const d of out) byCat[d.category] = (byCat[d.category] ?? 0) + 1;
console.log('By category:', byCat);
