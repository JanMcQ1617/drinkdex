/**
 * Merges the world-spirits expansion into drinks.json.
 *
 * Run: node scripts/merge-world-spirits.mjs [--dry]
 *
 * Idempotent — entries are keyed by id, so re-running replaces the previous
 * import rather than appending a second copy.
 *
 * Dex numbers are assigned in file order starting after the highest number
 * already in drinks.json. That is stable on a quiet repo, but NOT if another
 * session has appended entries since the last run: those now hold the higher
 * numbers, so a re-run moves every spirit to the end of the dex. Re-run only
 * when the source files here have actually changed.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('./spiritdata/', import.meta.url);

const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));

/** Accent-insensitive key, so "Cachaca" cannot slip past "Cachaça". */
const fold = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const files = readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort();
const incoming = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SOURCE), 'utf8')));

const incomingIds = new Set(incoming.map((d) => d.id));

/*
 * Everything already here, minus any previous run of THIS import.
 *
 * The category guard matters: an incoming id may only displace an entry that
 * is itself a spirit. Without it, a spirit sharing an id with a cocktail
 * silently converted that cocktail into a spirit — which is exactly what
 * `pink-gin` did on the first run of this batch.
 */
const kept = drinks.filter((d) => !(incomingIds.has(d.id) && d.category === 'spirit'));
const priorById = new Map(drinks.map((d) => [d.id, d]));
const nameIndex = new Map(kept.map((d) => [fold(d.name), d.name]));
const idIndex = new Set(kept.map((d) => d.id));

const REQUIRED = ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
  'tastingNotes', 'glassware', 'funFact', 'serve', 'composition'];
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);

const errors = [];
const seenId = new Set();
const seenName = new Map();

for (const s of incoming) {
  const where = s.id ?? s.name ?? '(unnamed)';
  for (const key of REQUIRED) {
    if (s[key] === undefined || s[key] === null || s[key] === '') errors.push(`${where}: missing ${key}`);
  }
  if (!RARITIES.has(s.rarity)) errors.push(`${where}: bad rarity "${s.rarity}"`);
  if (!Array.isArray(s.tastingNotes) || s.tastingNotes.length < 2) errors.push(`${where}: needs 2+ tasting notes`);
  if (s.serve && (!s.serve.temp || !s.serve.glass || !s.serve.how)) errors.push(`${where}: incomplete serve guide`);
  if (s.composition && (!s.composition.summary || !Array.isArray(s.composition.components) ||
      s.composition.components.length < 3 || !s.composition.process)) {
    errors.push(`${where}: incomplete composition`);
  }
  if (s.recipe) errors.push(`${where}: spirits must not carry a recipe`);

  if (seenId.has(s.id)) errors.push(`${where}: duplicate id within import`);
  seenId.add(s.id);
  const prior = priorById.get(s.id);
  if (prior && prior.category !== 'spirit') {
    errors.push(`${where}: id collides with existing ${prior.category} ${prior.name}`);
  }
  if (idIndex.has(s.id)) errors.push(`${where}: id collides with a non-spirit entry`);

  const nk = fold(s.name);
  if (seenName.has(nk)) errors.push(`${where}: duplicate name within import ("${seenName.get(nk)}")`);
  seenName.set(nk, s.name);
  if (nameIndex.has(nk)) errors.push(`${where}: name collides with existing "${nameIndex.get(nk)}"`);
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) — nothing written:\n`);
  for (const e of errors.slice(0, 40)) console.error('  ' + e);
  if (errors.length > 40) console.error(`  …and ${errors.length - 40} more`);
  process.exit(1);
}

/*
 * Reuse the dex number an entry already holds, so a re-run is a true no-op.
 * Only genuinely new ids draw from the end. Without this, a re-run after
 * another session appended entries would renumber every spirit and leave a
 * hole where they used to sit.
 */
const existingDex = new Map(drinks.map((d) => [d.id, d.dexNumber]));
let next = Math.max(0, ...drinks.map((d) => d.dexNumber)) + 1;
const added = incoming.map((s) => ({
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
  dexNumber: existingDex.get(s.id) ?? next++,
  serve: s.serve,
  composition: s.composition,
}));

const out = [...kept, ...added].sort((a, b) => a.dexNumber - b.dexNumber);

if (dry) {
  console.log(`dry run — would write ${out.length} entries (${added.length} new)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  const lo = Math.min(...added.map((d) => d.dexNumber));
  const hi = Math.max(...added.map((d) => d.dexNumber));
  console.log(`Wrote ${out.length} entries (${added.length} spirits, #${lo}–#${hi}).`);
}

const byCat = {};
for (const d of out) byCat[d.category] = (byCat[d.category] ?? 0) + 1;
console.log('By category:', byCat);
