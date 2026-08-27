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
 * THIS USED TO BE A LEADING-ZERO TEST, and a comment here claimed that was
 * "exact rather than approximate". It was not. A range's leading character
 * describes its FLOOR and the question is about its CEILING: "0–8%" begins
 * with a zero and tops out at eight. The test also rejected a legitimate
 * "0.5%" and waved through "alcohol-free" and "<0.5%", neither of which
 * begins with a zero.
 *
 * It is now the same rule merge-cocktails.mjs gates on, and it has to stay
 * that way — when the prune and the gate disagreed, they disagreed about
 * exactly one row (Kvass, 0.5–1.5%), which the prune removed and the gate
 * would have admitted. Two rules for one question is how that happens.
 *
 * THE THRESHOLD IS 0.5%, the line most jurisdictions draw, and a range must
 * clear it at its LOW end. "Not published" is deliberately NOT alcohol-free:
 * 174 beer cards carry it and it means undocumented, not absent.
 */
/* The alcohol floor, kept byte-compatible with abvBelowFloor() in
 * scripts/lib/dex-merge.mjs. This is a TEMPORARY duplicate: the shared
 * validator gained the same check as check 6, and the moment that lands on
 * main this block should be deleted so there is one rule and not two. It is
 * here only because that commit is not on main yet and cocktails should not
 * go unguarded in the gap.
 *
 * Three details, each of which I had wrong and a peer caught:
 *
 *  - FIRST number, not the minimum. A range is written low end first, so the
 *    first number IS the floor. Taking the minimum reads "5% (0.33 L)" as
 *    0.33 and throws out a real drink. No row in the Dex flips verdict today
 *    — the only rows where first and min differ are the two Izarra spirits at
 *    "40% green, 32% yellow" — so this is latent rather than active, which is
 *    exactly when it is cheap to fix.
 *  - A leading "<" or "≤" inverts the comparison, so "<0.5%" rejects while a
 *    bare "0.5%" clears.
 *  - "Varies by producer" is a second undocumented-strength phrase. A
 *    carve-out keyed only to "Not published" would have condemned it. */
const ABV_FLOOR = 0.5;
const ABV_UNDOCUMENTED = /not published|varies/i;
const ABV_ABSENT = /alcohol[-\s]?free|non[-\s]?alcoholic|de[-\s]?alcoholi[sz]|no alcohol/i;

function abvBelowFloor(abv) {
  const s = String(abv ?? '');
  if (ABV_UNDOCUMENTED.test(s)) return false;
  if (ABV_ABSENT.test(s)) return true;
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return false;
  const n = Number(m[0]);
  return /^\s*[<≤]/.test(s) ? n <= ABV_FLOOR : n < ABV_FLOOR;
}

const isAlcoholFree = (d) => abvBelowFloor(d.abv);
const FREE_MARKER = ABV_ABSENT;

const doomed = drinks.filter(isAlcoholFree);
const kept = drinks.filter((d) => !isAlcoholFree(d));

/* TWO guards, because the first version of this script only had one and I
 * described it to two other sessions as having both.
 *
 * The under-prune guard looks at what was KEPT for anything that reads
 * alcohol-free. The over-prune guard looks at what was DOOMED for anything
 * that reads alcoholic. A prune that removes a real drink is the more
 * expensive mistake of the two and it was the one running unchecked. */

const keptButFree = kept.filter((d) =>
  /* "zero" is deliberately NOT in this pattern. Antarctica Sub Zero, Zero
   * Gravity Conehead and Zero Gravity Green State are ordinary beers at 4–7%,
   * and a check that flags them is a check nobody will keep running. */
  FREE_MARKER.test(String(d.name ?? ''))
);

const doomedButStrong = doomed.filter((d) => !abvBelowFloor(d.abv));

if (keptButFree.length || doomedButStrong.length) {
  console.error('\nABORT — nothing written:\n');
  for (const d of keptButFree) {
    console.error(`  KEPT but looks alcohol-free   ${d.id}  "${d.name}"  abv=${d.abv}`);
  }
  for (const d of doomedButStrong) {
    console.error(`  DOOMED but reads alcoholic    ${d.id}  "${d.name}"  abv=${d.abv}`);
  }
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
