/**
 * Removes named entries from drinks.json and closes the gaps in the numbering.
 *
 * Run: node scripts/remove-drinks.mjs <id> [<id> ...] [--dry]
 *
 * WHY A SCRIPT AND NOT AN EDIT. drinks.json is generated and shared by four
 * sessions. Hand-editing it loses the numbering invariant and the proof that
 * nothing else moved. This does the removal, the compaction and the checks in
 * one pass, and refuses to write if any of them fail.
 *
 * REMOVE FROM THE SOURCE FILES TOO. A row left in scripts/*data is re-added by
 * that category's merge on its next run, so removing only here looks correct
 * and silently undoes itself. The alcohol-free prune learned this the
 * expensive way; the check at the end of this script is the cheap version.
 *
 * RENUMBERING IS SAFE FOR COLLECTIONS. src/store/collection.ts keys unlocks by
 * drink id, not by dexNumber, so a renumber changes the number printed on a
 * card and nothing else. If that ever stops being true this script must not be
 * run again without migrating the store first.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRINKS = path.join(ROOT, 'src', 'data', 'drinks.json');
const SCRIPTS = path.join(ROOT, 'scripts');

const dry = process.argv.includes('--dry');
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (!targets.length) {
  console.error('usage: node scripts/remove-drinks.mjs <id> [<id> ...] [--dry]');
  process.exit(1);
}

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const byId = new Map(drinks.map((d) => [d.id, d]));

/* Every id must exist. A typo that silently removes nothing is worse than an
 * error, because the run reports success and the duplicate stays in the Dex. */
const unknown = targets.filter((id) => !byId.has(id));
if (unknown.length) {
  console.error(`\nABORT — these ids are not in drinks.json:\n`);
  for (const id of unknown) console.error('  ' + id);
  process.exit(1);
}

const doomed = new Set(targets);
const kept = drinks.filter((d) => !doomed.has(d.id));
const out = kept
  .slice()
  .sort((a, b) => a.dexNumber - b.dexNumber)
  .map((d, i) => ({ ...d, dexNumber: i + 1 }));

/* Post-conditions. */
const problems = [];
if (out.length !== drinks.length - targets.length) {
  problems.push(`row count is ${out.length}, expected ${drinks.length - targets.length}`);
}
const outIds = new Set(out.map((d) => d.id));
for (const d of drinks) {
  if (!doomed.has(d.id) && !outIds.has(d.id)) problems.push(`${d.id} ("${d.name}") lost`);
}
for (const id of targets) if (outIds.has(id)) problems.push(`${id} was meant to go and stayed`);
out.forEach((d, i) => {
  if (d.dexNumber !== i + 1) problems.push(`${d.id}: dexNumber ${d.dexNumber} at index ${i}`);
});
/* Nothing but dexNumber may differ on a surviving row. */
for (const d of out) {
  const before = byId.get(d.id);
  const strip = (o) => { const { dexNumber, ...rest } = o; return JSON.stringify(rest); };
  if (strip(d) !== strip(before)) problems.push(`${d.id}: content changed, not just its number`);
}
if (problems.length) {
  console.error('\nABORT — nothing written:\n');
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

/* Warn — loudly — about any target still sitting in a source file. */
const stillSourced = [];
for (const dir of readdirSync(SCRIPTS)) {
  const full = path.join(SCRIPTS, dir);
  if (!statSync(full).isDirectory()) continue;
  for (const f of readdirSync(full).filter((n) => n.endsWith('.json'))) {
    let rows;
    try { rows = JSON.parse(readFileSync(path.join(full, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(rows)) continue;
    for (const r of rows) if (r && doomed.has(r.id)) stillSourced.push(`${dir}/${f}: ${r.id}`);
  }
}
if (stillSourced.length) {
  console.error('\nABORT — these are still in a source file and the next merge would re-add them:\n');
  for (const s of stillSourced) console.error('  ' + s);
  console.error('\nRemove them from the source first. Nothing written.');
  process.exit(1);
}

for (const id of targets) console.log(`  removing #${byId.get(id).dexNumber} ${byId.get(id).name}`);
if (dry) {
  console.log(`\ndry run — would remove ${targets.length} and renumber ${out.length}`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  console.log(`\nRemoved ${targets.length}; ${out.length} remain, renumbered #1–#${out.length}.`);
}
const byCat = out.reduce((a, d) => ((a[d.category] = (a[d.category] ?? 0) + 1), a), {});
console.log('By category:', byCat);
