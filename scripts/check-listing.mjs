#!/usr/bin/env node
/**
 * Counts and checks the App Store listing in docs/appstore.md: every
 * fenced block under a `<!-- listing:<field> -->` marker.
 *
 *   node scripts/check-listing.mjs
 *
 * Prints each field's length in characters (as App Store Connect counts
 * them: one per character, a line break included, an em dash one) against
 * Apple's limit, and exits 1 if any field is over, if the keywords break
 * Apple's rules (no space after a comma, no word already in the name or
 * subtitle, no word twice), or if any field uses a phrase guideline 1.4.3
 * reads as asking people to drink, or to drink more.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'docs', 'appstore.md');

const LIMITS = {
  name: 30,
  subtitle: 30,
  keywords: 100,
  promotional: 170,
  description: 4000,
  'description-bottlings': 4000,
  whatsnew: 4000,
};

/* Words and phrases 1.4.3 reads as encouraging drinking (App Review rejected nothing yet; these are the ones earlier rounds took out). */
const BANNED = [
  /\bdrink more\b/i,
  /\bget drunk\b/i,
  /\bdrunk\b/i,
  /\bwasted\b/i,
  /\bparty\b/i,
  /\bpartying\b/i,
  /\bbinge\b/i,
  /\bshots?\b/i,
  /\bchug/i,
  /\bbottoms up\b/i,
  /\bhappy hour\b/i,
  /\bpour\b/i,
  /\btasting\b/i,
  /\bbar\b/i,
  /\btry every\b/i,
  /\bcollect every\b/i,
  /\bwaiting to be (found|tried)\b/i,
  /\bwhat (your )?friends are drinking\b/i,
  /\bdrinking game/i,
];

const chars = (s) => [...s].length;

const text = fs.readFileSync(FILE, 'utf8');
const fields = new Map();
for (const m of text.matchAll(/<!--\s*listing:([a-z-]+)\s*-->\s*\n```[^\n]*\n([\s\S]*?)\n```/g)) {
  if (fields.has(m[1])) throw new Error(`listing:${m[1]} appears twice in docs/appstore.md`);
  fields.set(m[1], m[2]);
}

let bad = 0;
const fail = (msg) => {
  bad++;
  console.log(`  ✗ ${msg}`);
};

for (const required of ['name', 'subtitle', 'keywords', 'promotional', 'description']) {
  if (!fields.has(required)) fail(`no <!-- listing:${required} --> block`);
}

for (const [field, value] of fields) {
  const limit = LIMITS[field];
  const n = chars(value);
  console.log(`${field.padEnd(22)} ${String(n).padStart(5)} / ${limit ?? '?'}`);
  if (limit === undefined) fail(`${field}: no known limit`);
  else if (n > limit) fail(`${field}: ${n} is over ${limit}`);
  if (field !== 'keywords' && value !== value.trim()) fail(`${field}: starts or ends with white space`);
  for (const re of BANNED) {
    const hit = re.exec(value);
    if (hit) fail(`${field}: "${hit[0]}" (guideline 1.4.3)`);
  }
}

if (fields.has('description') && fields.has('description-bottlings')) {
  const total = chars(fields.get('description')) + 1 + chars(fields.get('description-bottlings'));
  console.log(`${'description + bottlings'.padEnd(22)} ${String(total).padStart(5)} / 4000`);
  if (total > 4000) fail(`description with the bottlings sentence is ${total}, over 4000`);
}

const kw = fields.get('keywords');
if (kw !== undefined) {
  if (/\s/.test(kw)) fail('keywords: contains white space (no spaces after commas)');
  const words = kw.split(',');
  if (words.some((w) => w === '')) fail('keywords: an empty entry (a doubled or trailing comma)');
  const stem = (w) => w.toLowerCase().replace(/(es|s)$/, '');
  const taken = new Set(
    `${fields.get('name') ?? ''} ${fields.get('subtitle') ?? ''}`
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w && !['and', 'a', 'the', 'to', 'of', 'for'].includes(w))
      .map(stem),
  );
  const seen = new Set();
  for (const w of words) {
    const s = stem(w);
    if (taken.has(s)) fail(`keywords: "${w}" is already in the name or subtitle`);
    if (seen.has(s)) fail(`keywords: "${w}" twice (singular and plural count as one)`);
    seen.add(s);
  }
  console.log(`${'keyword count'.padEnd(22)} ${String(words.length).padStart(5)}`);
}

if (bad) {
  console.log(`\n${bad} problem${bad === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('\nAll fields within their limits; keywords and wording pass.');
