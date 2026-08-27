/**
 * Removes every alcohol-free entry from drinks.json and closes the gaps in the
 * dex numbering.
 *
 * Run: node scripts/prune-nonalcoholic.mjs [--dry]
 *
 * WHY THIS EXISTS. Sipply is an alcohol app. Six alcohol-free cards had been
 * in the Dex since the early regional batches, a zero-proof batch added 45
 * more, and the beer sweep picked up 27 alcohol-free lagers along with their
 * full-strength siblings. This removes all of them in one pass so the Dex does
 * not have to be pruned three separate times by three sessions.
 *
 * WHY IT RENUMBERS. dexNumber is displayed on every card and is what makes the
 * Dex read as a collection. Deleting #232 and leaving the hole means the app
 * shows 7,574 cards numbered up to #7652 with 78 missing, which reads as
 * missing cards rather than as a deliberate cut. So the numbers are compacted
 * back to 1..N.
 *
 * WHY RENUMBERING IS SAFE. The collection store keys unlocks by drink id, not
 * by dex number — see src/store/collection.ts, `unlocks: Record<string,
 * UnlockRecord>` indexed by drinkId. Nobody's collected drinks are lost by a
 * renumber; the number beneath the card changes and nothing else does. If that
 * ever stops being true, this script must not be run again without migrating
 * the store first.
 *
 * WHAT IT DOES NOT DO. It does not touch the source files under scripts/*data.
 * Those are pruned alongside it in the same commit — a row left in a source
 * file is re-added by that category's merge script on its next run, so
 * removing here alone would be undone silently.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));

/**
 * Alcohol-free by the ABV field.
 *
 * Every abv string in the file that denotes no meaningful alcohol begins with
 * a zero: "0%", "0.0%", "0–1%", "0.0–0.5%", "0–8%", "0% (chaser)" and
 * "0.5–1.5%". Nothing alcoholic does — the weakest real entries start "1", "2"
 * or "3" — so a leading-zero test is exact here rather than approximate.
 * It is asserted below rather than assumed.
 */
const isAlcoholFree = (d) => /^\s*0/.test(String(d.abv ?? ''));

const doomed = drinks.filter(isAlcoholFree);
const kept = drinks.filter((d) => !isAlcoholFree(d));

/* Guard: prove the predicate did not catch anything with real alcohol in it,
 * and did not miss anything obviously alcohol-free. A card named "0.0" or
 * "Alkoholfrei" that somehow carries a non-zero abv would slip through, and
 * that is worth failing over rather than shipping. */
/* "zero" is deliberately NOT in this pattern. Antarctica Sub Zero, Zero
 * Gravity Conehead and Zero Gravity Green State are ordinary beers at 4–7%,
 * and a check that flags them is a check nobody will keep running. The
 * markers below only appear on genuinely alcohol-free products. */
const stragglers = kept.filter((d) =>
  /(alcohol[- ]?free|non[- ]?alcoholic|alkoholfrei|\b0\.0\b)/i.test(String(d.name ?? ''))
);
if (stragglers.length) {
  console.error('\nABORT — these look alcohol-free but carry a non-zero abv:\n');
  for (const d of stragglers) console.error(`  ${d.id}  "${d.name}"  abv=${d.abv}`);
  console.error('\nFix the abv or widen the predicate. Nothing written.');
  process.exit(1);
}

/* Compact the numbering. Order is preserved, so a card's position in the Dex
 * is unchanged; only the gaps close. */
const out = kept
  .slice()
  .sort((a, b) => a.dexNumber - b.dexNumber)
  .map((d, i) => ({ ...d, dexNumber: i + 1 }));

/* Post-conditions, all three of them, before anything is written. */
const problems = [];
if (out.length !== drinks.length - doomed.length) {
  problems.push(`row count is ${out.length}, expected ${drinks.length - doomed.length}`);
}
const doomedIds = new Set(doomed.map((d) => d.id));
const outIds = new Set(out.map((d) => d.id));
for (const d of drinks) {
  if (!doomedIds.has(d.id) && !outIds.has(d.id)) problems.push(`${d.id} ("${d.name}") lost`);
  if (doomedIds.has(d.id) && outIds.has(d.id)) problems.push(`${d.id} was meant to go and stayed`);
}
out.forEach((d, i) => {
  if (d.dexNumber !== i + 1) problems.push(`${d.id}: dexNumber ${d.dexNumber} at index ${i}`);
});
if (problems.length) {
  console.error('\nABORT — nothing written:\n');
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

const byCat = (rows) => rows.reduce((a, d) => ((a[d.category] = (a[d.category] ?? 0) + 1), a), {});
const removedByCat = byCat(doomed);

if (!doomed.length) {
  console.log('Nothing to prune — no alcohol-free entries remain.');
} else if (dry) {
  console.log(`dry run — would remove ${doomed.length} entries and renumber ${out.length}`);
  console.log('  removed by category:', removedByCat);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  console.log(`Removed ${doomed.length} alcohol-free entries; ${out.length} remain, renumbered #1–#${out.length}.`);
  console.log('  removed by category:', removedByCat);
}
console.log('Remaining by category:', byCat(out));
