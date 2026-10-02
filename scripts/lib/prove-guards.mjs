/**
 * Proves every guard in dex-merge.mjs actually fires, against planted bad
 * input. A check that has never been seen to fail is not a check — the dead
 * collision guard sat in four scripts for a day reading correctly and being
 * structurally incapable of firing.
 *
 * The planted rows are built from real rows of drinks.json: `base` is a
 * spirit (the beer row it used to be went with the beer layer, and every
 * case built on it then fired on "missing category" instead of on its own
 * guard), and `cocktail` is the first cocktail. A case that names the
 * error it expects only passes when THAT error fires, so a row that is
 * wrong for some other reason cannot pass for the guard under test.
 *
 * Run: node scripts/lib/prove-guards.mjs
 */
import { readFileSync } from 'node:fs';
import { validate, merge, assertShapePreserved } from './dex-merge.mjs';

const drinks = JSON.parse(readFileSync(new URL('../../src/data/drinks.json', import.meta.url), 'utf8'));
const base = drinks.find((d) => d.category === 'spirit' && d.serve?.how && d.composition?.components?.length);
const cocktail = drinks.find((d) => d.category === 'cocktail');
if (!base || !cocktail) {
  console.error('  prove-guards: drinks.json has no spirit or no cocktail to build fixtures from');
  process.exit(1);
}
const mk = (o) => ({ ...base, ...o });
const mkCocktail = (o) => ({ ...cocktail, ...o });

let pass = 0, fail = 0;
const expect = (label, incoming, cat, shouldFire, match) => {
  const r = validate({ drinks, incoming, category: cat, owner: 'prove' });
  const hit = match ? r.errors.find((e) => e.includes(match)) : r.errors[0];
  const fired = hit !== undefined;
  const ok = fired === shouldFire && (shouldFire || r.errors.length === 0);
  if (ok) pass++; else fail++;
  const detail = (hit ?? r.errors[0] ?? '(no error)').slice(0, 74);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(36)} ${detail}`);
};

console.log('  guards that MUST fire:');
expect('cross-category id collision', [mk({ id: cocktail.id })], 'spirit', true, 'would overwrite');
expect('duplicate id within import', [mk({ id: 'p-1' }), mk({ id: 'p-1', name: 'Other' })], 'spirit', true, 'duplicate id');
expect('accent-insensitive name clash', [mk({ id: 'p-2', name: 'Cachaca' })], 'spirit', true, 'collides');
expect('label: comma-qualified', [mk({ id: 'p-3', name: 'Zz1', origin: 'New Orleans, United States' })], 'spirit', true, 'the Dex writes');
expect('label: slash-qualified', [mk({ id: 'p-4', name: 'Zz2', origin: 'Canada / United States' })], 'spirit', true, 'the Dex writes');
expect('label: Czech Republic', [mk({ id: 'p-5', name: 'Zz3', origin: 'Plzeň, Czech Republic' })], 'spirit', true, 'the Dex writes');
expect('missing serve.how', [mk({ id: 'p-6', name: 'Zz4', serve: {} })], 'spirit', true, 'serve.how');
expect('non-cocktail with a recipe', [mk({ id: 'p-7', name: 'Zz5', recipe: { ingredients: [], steps: [] } })], 'spirit', true, 'only cocktails');
expect('missing required field', [mk({ id: 'p-8', name: 'Zz6', funFact: null })], 'spirit', true, 'missing funFact');

expect('abv 0.0%', [mk({ id: 'p-20', name: 'Zz20', abv: '0.0%' })], 'spirit', true, 'floor');
expect('abv range starting at zero', [mk({ id: 'p-21', name: 'Zz21', abv: '0\u20138%' })], 'spirit', true, 'floor');
expect('abv stated alcohol-free', [mk({ id: 'p-22', name: 'Zz22', abv: 'Alcohol-Free' })], 'spirit', true, 'floor');
expect('abv strictly under the floor', [mk({ id: 'p-23', name: 'Zz23', abv: '<0.5%' })], 'spirit', true, 'floor');

/* Check 7. A drink added in the app is `u_<uuid>`; the catalogue must never
 * hold one, or getDrink() would stop being catalogue-only. Built from the
 * cocktail, so the row is a real, complete card whose only fault is its id. */
expect('id alphabet: custom u_x', [mkCocktail({ id: 'u_x', name: 'Zz30' })], 'cocktail', true, 'id must be');
expect('id alphabet: upper case', [mkCocktail({ id: 'Zz-31', name: 'Zz31' })], 'cocktail', true, 'id must be');

console.log('\n  clean input that must NOT fire:');
expect('valid new card', [mk({ id: 'p-9', name: 'Zz7', origin: 'Hawaii, USA' })], 'spirit', false);
expect('replacing our own row', [mk({})], 'spirit', false);
expect('valid new cocktail (slug id)', [mkCocktail({ id: 'zz-32', name: 'Zz32' })], 'cocktail', false);
expect('abv 0.5-1.5% (the Kvass string)', [mk({ id: 'p-24', name: 'Zz24', abv: '0.5\u20131.5%' })], 'spirit', false);
expect('abv undocumented, not absent', [mk({ id: 'p-25', name: 'Zz25', abv: 'Not published' })], 'spirit', false);
expect('abv varies by producer', [mk({ id: 'p-26', name: 'Zz26', abv: 'Varies by producer' })], 'spirit', false);
expect('abv with a small volume in it', [mk({ id: 'p-27', name: 'Zz27', abv: '5% (0.33 L)' })], 'spirit', false);


console.log('\n  merge behaviour:');
const inc = [mk({ id: cocktail.id, name: 'Zz8' })];
const probs = assertShapePreserved({ before: drinks, after: merge({ drinks, incoming: inc }).out, category: 'spirit' });
const shapeOk = probs.some((p) => p.includes('RECLASSIFIED'));
if (shapeOk) pass++; else fail++;
console.log(`  ${shapeOk ? 'ok  ' : 'FAIL'} ${'shape assertion catches reclassify'.padEnd(36)} ${probs[0]?.slice(0, 74) ?? '(none)'}`);

const again = merge({ drinks, incoming: drinks.filter((d) => d.category === 'spirit').slice(0, 50) });
const sticky = again.added.length === 50 && again.fresh === 0;
if (sticky) pass++; else fail++;
console.log(`  ${sticky ? 'ok  ' : 'FAIL'} ${'dex numbers sticky on re-run'.padEnd(36)} fresh=${again.fresh} of ${again.added.length} (0 = true no-op)`);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
