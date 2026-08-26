/**
 * Check candidate wine Dex card names against the atlas BEFORE adding them
 * to drinks.json.
 *
 * build-wine-atlas-links.mjs requires every `category: 'wine'` entry to
 * resolve to something — an atlas wine, an atlas grape, or an explicit
 * override — and exits 1 if any does not. This tells you which names will
 * resolve on their own, and for the ones that won't, what the atlas calls
 * the same thing.
 *
 * Matching is EXACT on an accent-folded name. There is no fuzzy matching by
 * design: a substring rule would happily link "Valle de Uco" to "Valle de
 * la Orotava".
 *
 *   node scripts/check-wine-atlas-names.mjs "Central Otago" "Colchagua"
 *   node scripts/check-wine-atlas-names.mjs --file names.txt
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const atlas = JSON.parse(readFileSync(join(ROOT, 'src/data/wineAtlas.json'), 'utf8'));

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const wines = new Map();
atlas.wines.forEach((w, i) => {
  const k = fold(w.n);
  if (!wines.has(k)) wines.set(k, []);
  wines.get(k).push(i);
});
const grapes = new Map();
atlas.grapes.forEach((g, i) => {
  for (const n of [g.name, ...g.synonyms]) if (!grapes.has(fold(n))) grapes.set(fold(n), i);
});

let args = process.argv.slice(2);
if (args[0] === '--file') args = readFileSync(args[1], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
if (!args.length) {
  console.error('usage: node scripts/check-wine-atlas-names.mjs "Name" ...  |  --file names.txt');
  process.exit(2);
}

/**
 * Atlas names that share a DISTINCTIVE word with the candidate.
 *
 * Generic geography words are dropped, or "Uco Valley" helpfully suggests
 * every valley in Australia.
 */
const GENERIC = new Set([
  'valley', 'wine', 'wines', 'region', 'coast', 'hills', 'hill', 'county',
  'district', 'mountain', 'mountains', 'ridge', 'river', 'lake', 'creek',
  'bench', 'slope', 'slopes', 'valle', 'vallee', 'valles', 'upper', 'lower',
  'north', 'south', 'east', 'west', 'central', 'grand', 'saint', 'santa',
]);
function near(name) {
  const words = fold(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !GENERIC.has(w));
  if (!words.length) return [];
  const hits = [];
  for (const w of atlas.wines) {
    const f = fold(w.n);
    if (words.some((word) => f.includes(word))) {
      hits.push(`${w.n} (${atlas.countries[w.c].name})`);
      if (hits.length >= 4) break;
    }
  }
  return hits;
}

let ok = 0;
const unresolved = [];
for (const name of args) {
  const k = fold(name);
  if (wines.has(k)) {
    const n = wines.get(k).length;
    console.log(`  MATCH  wine   ${name}  ->  ${n} atlas ${n === 1 ? 'entry' : 'entries'}`);
    ok++;
  } else if (grapes.has(k)) {
    const g = atlas.grapes[grapes.get(k)];
    console.log(`  MATCH  grape  ${name}  ->  ${g.name}, ${g.wines.length} wines`);
    ok++;
  } else {
    unresolved.push(name);
    const n = near(name);
    console.log(`  NEEDS OVERRIDE  ${name}`);
    if (n.length) console.log(`         atlas has: ${n.join('; ')}`);
  }
}

console.log(`\n${ok} of ${args.length} resolve on their own; ${unresolved.length} need an entry in build-wine-atlas-links.mjs`);
if (unresolved.length) {
  console.log('\nPaste into the WINES map (or GRAPES, or ABSENT if it has no atlas counterpart):');
  for (const u of unresolved) {
    console.log(`  '${u.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}': ['<exact atlas wine name>'],`);
  }
}
process.exit(unresolved.length ? 1 : 0);
