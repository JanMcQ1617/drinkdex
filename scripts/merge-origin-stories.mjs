/**
 * Attaches the origin stories in scripts/origindata/ to drinks.json.
 *
 * Run: node scripts/merge-origin-stories.mjs [--dry]
 *
 * The strict runner for the stories. The cocktail and spirit merges attach
 * them too (merge() in scripts/lib/dex-merge.mjs), but as bystanders: a
 * broken story there is a warning and the story is left off. Here it is an
 * error and nothing is written, so this is the script to run after editing a
 * batch file.
 *
 * Idempotent: the output depends only on drinks.json and the batch files, so
 * a second run writes the same bytes. Only `originStory` changes; the run
 * proves that row by row before it writes.
 *
 * A drink with no story is reported, not refused: the app falls back to its
 * fun fact, and a drink a merge adds later arrives without one.
 */

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { attachOriginStories } from './lib/dex-merge.mjs';

const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const OWNER = 'merge-origin-stories.mjs';
const dry = process.argv.includes('--dry');

/* drinks.json ships in the app bundle and is 3.2 MB without the stories;
 * 2,089 stories at about 550 characters come to about 1.15 MB, so 1.7 MB
 * leaves room without letting the file double. */
const BUDGET_BYTES = 1_700_000;

const serialise = (rows) => JSON.stringify(rows, null, 1) + '\n';
const withoutStory = (row) => {
  const rest = { ...row };
  delete rest.originStory;
  return rest;
};
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
const sample = (ids) => ids.slice(0, 20).join(', ') + (ids.length > 20 ? `, …and ${ids.length - 20} more` : '');

const before = readFileSync(DRINKS, 'utf8');
const drinks = JSON.parse(before);
const { out, errors, warnings, report } = attachOriginStories(drinks, { strict: true });

/* Belt to the validator's braces: every row, minus its story, must be
 * byte-identical to the row it came from, in the same place. This is the
 * proof that the run touched `originStory` and nothing else. */
if (out.length !== drinks.length) {
  errors.push(`row count moved ${drinks.length} -> ${out.length}`);
} else {
  for (let i = 0; i < out.length; i++) {
    if (JSON.stringify(withoutStory(out[i])) !== JSON.stringify(withoutStory(drinks[i]))) {
      errors.push(`${drinks[i].id}: changed outside originStory`);
    }
  }
}

if (report) {
  console.log('Origin stories by batch file:');
  for (const f of report.files) {
    const range = f.attached ? `#${f.lo}–#${f.hi}` : '—';
    console.log(`  ${f.file}  ${String(f.attached).padStart(4)} of ${String(f.entries).padStart(4)} attached  ${range}`);
  }
  console.log(`\nAttached ${report.attached} of ${report.total} drinks.`);
  console.log(
    report.missing.length
      ? `Missing a story (${report.missing.length}; the app shows their fun fact): ${sample(report.missing)}`
      : 'Missing a story: none.'
  );
  if (report.noYear.length) {
    console.log(`No year in the story (${report.noYear.length}; the dateline shows the place alone): ${sample(report.noYear)}`);
  }
}

for (const w of warnings.slice(0, 20)) console.warn(`  warn  ${w}`);
if (warnings.length > 20) console.warn(`  warn  …and ${warnings.length - 20} more`);

if (errors.length) {
  console.error(`\n${OWNER}: ${errors.length} problem(s) — nothing written:\n`);
  for (const e of errors.slice(0, 40)) console.error('  ' + e);
  if (errors.length > 40) console.error(`  …and ${errors.length - 40} more`);
  process.exit(1);
}

const next = serialise(out);
const bytesBefore = Buffer.byteLength(before);
const bytesAfter = Buffer.byteLength(next);
/* The stories' own weight, measured against the same rows with no story,
 * so it reads the same on the first run and on every re-run. */
const storyBytes = bytesAfter - Buffer.byteLength(serialise(out.map(withoutStory)));
const delta = bytesAfter - bytesBefore;

console.log(
  `\nBytes added to drinks.json by the stories: +${storyBytes} (${mb(storyBytes)}, budget ${mb(BUDGET_BYTES)}); ` +
  `this run: ${delta >= 0 ? '+' : ''}${delta} (${mb(bytesBefore)} -> ${mb(bytesAfter)}).`
);
if (storyBytes > BUDGET_BYTES) {
  const longest = out
    .filter((d) => d.originStory)
    .sort((a, b) => b.originStory.length - a.originStory.length)
    .slice(0, 10)
    .map((d) => `${d.id} (${d.originStory.length})`);
  console.warn(`  warn  over the ${mb(BUDGET_BYTES)} budget; longest stories: ${longest.join(', ')}`);
}

if (next === before) {
  console.log('drinks.json already up to date — nothing to write.');
} else if (dry) {
  console.log(`dry run — would write ${out.length} entries.`);
} else {
  writeFileSync(DRINKS, next);
  console.log(`Wrote ${out.length} entries.`);
}
