/**
 * Proves every guard in dex-merge.mjs actually fires, against planted bad
 * input. A check that has never been seen to fail is not a check — the dead
 * collision guard sat in four scripts for a day reading correctly and being
 * structurally incapable of firing.
 *
 * Run: node scripts/lib/prove-guards.mjs
 */
import { readFileSync } from 'node:fs';
import { validate, merge, assertShapePreserved, fold, originTokens } from './dex-merge.mjs';

const drinks = JSON.parse(readFileSync(new URL('../../src/data/drinks.json', import.meta.url), 'utf8'));
const base = drinks.find((d) => d.category === 'beer' && d.id.endsWith('-br'));
const cocktail = drinks.find((d) => d.category === 'cocktail');
const mk = (o) => ({ ...base, ...o });

let pass = 0, fail = 0;
const expect = (label, incoming, cat, shouldFire) => {
  const r = validate({ drinks, incoming, category: cat, owner: 'prove' });
  const fired = r.errors.length > 0;
  const ok = fired === shouldFire;
  ok ? pass++ : fail++;
  const detail = fired ? r.errors[0].slice(0, 74) : '(no error)';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(36)} ${detail}`);
};

console.log('  guards that MUST fire:');
expect('cross-category id collision', [mk({ id: cocktail.id })], 'beer', true);
expect('duplicate id within import', [mk({ id: 'p-1' }), mk({ id: 'p-1', name: 'Other' })], 'beer', true);
expect('accent-insensitive name clash', [mk({ id: 'p-2', name: 'Cachaca' })], 'spirit', true);
expect('label: comma-qualified', [mk({ id: 'p-3', name: 'Zz1', origin: 'New Orleans, United States' })], 'beer', true);
expect('label: slash-qualified', [mk({ id: 'p-4', name: 'Zz2', origin: 'Canada / United States' })], 'beer', true);
expect('label: Czech Republic', [mk({ id: 'p-5', name: 'Zz3', origin: 'Plzeň, Czech Republic' })], 'beer', true);
expect('missing serve.how', [mk({ id: 'p-6', name: 'Zz4', serve: {} })], 'beer', true);
expect('non-cocktail with a recipe', [mk({ id: 'p-7', name: 'Zz5', recipe: { ingredients: [], steps: [] } })], 'beer', true);
expect('missing required field', [mk({ id: 'p-8', name: 'Zz6', funFact: null })], 'beer', true);

expect('abv 0.0%', [mk({ id: 'p-20', name: 'Zz20', abv: '0.0%' })], 'beer', true);
expect('abv range starting at zero', [mk({ id: 'p-21', name: 'Zz21', abv: '0\u20138%' })], 'beer', true);
expect('abv stated alcohol-free', [mk({ id: 'p-22', name: 'Zz22', abv: 'Alcohol-Free' })], 'beer', true);
expect('abv strictly under the floor', [mk({ id: 'p-23', name: 'Zz23', abv: '<0.5%' })], 'beer', true);

console.log('\n  clean input that must NOT fire:');
expect('valid new card', [mk({ id: 'p-9', name: 'Zz7', origin: 'Hawaii, USA' })], 'beer', false);
expect('replacing our own row', [mk({})], 'beer', false);
expect('abv 0.5-1.5% (the Kvass string)', [mk({ id: 'p-24', name: 'Zz24', abv: '0.5\u20131.5%' })], 'beer', false);
expect('abv undocumented, not absent', [mk({ id: 'p-25', name: 'Zz25', abv: 'Not published' })], 'beer', false);
expect('abv varies by producer', [mk({ id: 'p-26', name: 'Zz26', abv: 'Varies by producer' })], 'beer', false);
expect('abv with a small volume in it', [mk({ id: 'p-27', name: 'Zz27', abv: '5% (0.33 L)' })], 'beer', false);


console.log('\n  merge behaviour:');
const inc = [mk({ id: cocktail.id, name: 'Zz8' })];
const probs = assertShapePreserved({ before: drinks, after: merge({ drinks, incoming: inc }).out, category: 'beer' });
const shapeOk = probs.length > 0;
shapeOk ? pass++ : fail++;
console.log(`  ${shapeOk ? 'ok  ' : 'FAIL'} ${'shape assertion catches reclassify'.padEnd(36)} ${probs[0]?.slice(0, 74) ?? '(none)'}`);

const again = merge({ drinks, incoming: drinks.filter((d) => d.id.endsWith('-br')).slice(0, 50) });
const sticky = again.fresh === 0;
sticky ? pass++ : fail++;
console.log(`  ${sticky ? 'ok  ' : 'FAIL'} ${'dex numbers sticky on re-run'.padEnd(36)} fresh=${again.fresh} (0 = true no-op)`);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
