/**
 * Merges the world-cocktails expansion into drinks.json.
 *
 * Run: node scripts/merge-cocktails.mjs [--dry]
 *
 * Idempotent — entries are keyed by id, so re-running replaces the previous
 * import rather than appending a second copy.
 *
 * Mirrors scripts/merge-world-spirits.mjs. The one difference that matters:
 * cocktails carry `ingredients` and a `recipe` and must NOT carry `serve` or
 * `composition`, which is the reverse of the spirit/beer/wine shape.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('./cocktaildata/', import.meta.url);

const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));

/** Accent-insensitive key, so "Visinata" cannot slip past "Vișinată". */
const fold = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const files = readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort();
const incoming = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SOURCE), 'utf8')));

const incomingIds = new Set(incoming.map((d) => d.id));

/* Everything that was already here, minus any previous run of this import.
 * Read-and-merge, never rebuild: three other sessions' generators write this
 * same file, so regenerating from cocktaildata alone would drop the spirits,
 * beers and wines. */
/* Only drop a PRIOR entry when the incoming record replaces it in the SAME
 * category. Filtering on id alone silently converted a spirit/beer/wine
 * into a cocktail when ids collided across categories, and the collision
 * check below could never fire because it read from this filtered array. */
const kept = drinks.filter((d) => !(incomingIds.has(d.id) && d.category === 'cocktail'));
const priorById = new Map(drinks.map((d) => [d.id, d]));
const nameIndex = new Map(kept.map((d) => [fold(d.name), d.name]));

const REQUIRED = ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
  'tastingNotes', 'glassware', 'ingredients', 'funFact', 'recipe'];
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);

const errors = [];
const seenId = new Set();
const seenName = new Map();

for (const c of incoming) {
  const where = c.id ?? c.name ?? '(unnamed)';
  for (const key of REQUIRED) {
    if (c[key] === undefined || c[key] === null || c[key] === '') errors.push(`${where}: missing ${key}`);
  }
  if (!RARITIES.has(c.rarity)) errors.push(`${where}: bad rarity "${c.rarity}"`);
  if (!Array.isArray(c.tastingNotes) || c.tastingNotes.length < 2) errors.push(`${where}: needs 2+ tasting notes`);
  if (!Array.isArray(c.ingredients) || c.ingredients.length < 1) errors.push(`${where}: needs a spec ingredient list`);

  const r = c.recipe;
  if (r) {
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) errors.push(`${where}: recipe needs 2+ ingredients`);
    else for (const i of r.ingredients) {
      if (!i.item || !i.amount) errors.push(`${where}: recipe ingredient missing item/amount`);
    }
    if (!Array.isArray(r.steps) || r.steps.length < 3) errors.push(`${where}: recipe needs 3+ steps`);
    if (!r.method) errors.push(`${where}: recipe missing method`);
  }

  /* The inverse of the spirits check — a cocktail with a serve guide means a
   * record was authored against the wrong template. */
  if (c.serve || c.composition) errors.push(`${where}: cocktails must not carry serve/composition`);

  if (seenId.has(c.id)) errors.push(`${where}: duplicate id within import`);
  seenId.add(c.id);
  const prior = priorById.get(c.id);
  if (prior && prior.category !== 'cocktail') {
    errors.push(`${where}: id collides with existing ${prior.category} "${prior.name}"`);
  }

  const nk = fold(c.name);
  if (seenName.has(nk)) errors.push(`${where}: duplicate name within import ("${seenName.get(nk)}")`);
  seenName.set(nk, c.name);
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
 * another session appended entries would renumber every cocktail and leave a
 * hole where they used to sit.
 */
const existingDex = new Map(drinks.map((d) => [d.id, d.dexNumber]));
let next = Math.max(0, ...drinks.map((d) => d.dexNumber)) + 1;
const added = incoming.map((c) => ({
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
  dexNumber: existingDex.get(c.id) ?? next++,
  recipe: c.recipe,
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
  console.log(`Wrote ${out.length} entries (${added.length} cocktails, #${lo}–#${hi}).`);
}

const byCat = {};
for (const d of out) byCat[d.category] = (byCat[d.category] ?? 0) + 1;
console.log('By category:', byCat);
