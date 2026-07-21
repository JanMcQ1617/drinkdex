/**
 * Merges generated composition data into drinks.json.
 *
 * Run: node scripts/merge-composition.mjs
 * Idempotent — re-running overwrites `composition` rather than duplicating.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const SCRATCH =
  '/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-Claude-Shit/5bf4dd01-3a85-4f85-8bbe-22afe9e09cc4/scratchpad';

const DRINKS = new URL('../src/data/drinks.json', import.meta.url);

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const drinks = read(DRINKS);
const parts = {
  beer: read(`${SCRATCH}/composition-beer.json`),
  wine: read(`${SCRATCH}/composition-wine.json`),
  spirit: read(`${SCRATCH}/composition-spirit.json`),
};

const all = { ...parts.beer, ...parts.wine, ...parts.spirit };

/*
 * Sake is filed under `wine` in this dataset but is brewed from rice, so a
 * literal "Grapes" label would render as nonsense. Relabel rather than
 * recategorize — the Dex "regions" are a deliberate 150/100/90/120 split.
 */
const RICE_BASED = new Set(['daiginjo', 'ginjo', 'honjozo', 'junmai', 'nigori']);

let attached = 0;
let relabeled = 0;
const missing = [];

for (const drink of drinks) {
  if (drink.category === 'cocktail') continue;

  const comp = all[drink.id];
  if (!comp) {
    missing.push(`${drink.category}/${drink.id}`);
    continue;
  }

  if (RICE_BASED.has(drink.id)) {
    for (const c of comp.components) {
      if (c.label === 'Grapes') {
        c.label = 'Rice';
        // The generator prefixed details with "No grapes:" to flag this.
        c.detail = c.detail.replace(/^No grapes:\s*/i, '');
        relabeled++;
      }
    }
  }

  drink.composition = comp;
  attached++;
}

writeFileSync(DRINKS, JSON.stringify(drinks, null, 2) + '\n');

console.log(`\n  attached:  ${attached}`);
console.log(`  relabeled: ${relabeled} sake "Grapes" -> "Rice"`);
console.log(`  missing:   ${missing.length}${missing.length ? ' -> ' + missing.join(', ') : ''}`);

// Every non-cocktail must end up with a composition.
const gaps = drinks.filter((d) => d.category !== 'cocktail' && !d.composition);
const cocktailsWithRecipe = drinks.filter((d) => d.category === 'cocktail' && d.recipe).length;

console.log(`\n  non-cocktails without composition: ${gaps.length}`);
console.log(`  cocktails with recipe:             ${cocktailsWithRecipe} / 150\n`);

process.exit(gaps.length === 0 && missing.length === 0 ? 0 : 1);
