/**
 * The Dex's Region filter, as the app works it out, for the scripts that
 * must agree with it (v4.15: merge-wine-brands.mjs places each bottling in
 * its appellation's region).
 *
 * WHY THE APP'S OWN CODE. A wine's region is read from its origin by
 * src/components/dex/dexFacets.ts, and not simply: the part before the
 * country with its brackets dropped, one region written two ways read as
 * one (REGION_ALIAS: Niederösterreich is Lower Austria), "Maipo Valley"
 * read as Maipo where the catalogue also writes Maipo, a card named for a
 * region its country writes put in that region (the Cahors card is in
 * Cahors whatever its origin says), England read out of "United
 * Kingdom". A copy of those rules here would drift from the app's the day
 * one changes, and a bottle would quietly sit in a different Region option
 * from its card (81 did, v4.15's review). So this transpiles dexFacets.ts
 * with the project's own `typescript`, as build-share-index.mjs does for
 * drinkLabels, and asks it.
 *
 *   const regionsOf = await dexRegions();
 *   regionsOf(drinks) // Map id -> "Montalcino|Italy", or null: in no region
 *
 * Every drink of the catalogue goes in, all categories, since the app reads
 * which endings are countries from all of them.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const FACETS = new URL('../../src/components/dex/dexFacets.ts', import.meta.url);

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

/** Only the facets the Region filter needs; the rest are empty, as the catalogue gives them. */
const WORDS = {
  kind: { cocktail: 'Cocktails', spirit: 'Spirits', wine: 'Wines' },
  status: { all: 'All', unlocked: 'Logged', locked: 'Not yet' },
  strength: { light: 'Light', medium: 'Medium', strong: 'Strong' },
  make: 'I can make it',
};

export async function dexRegions() {
  const js = ts.transpileModule(readFileSync(FACETS, 'utf8'), {
    fileName: 'dexFacets.ts',
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  }).outputText;
  /* dexFacets imports types only. Anything it starts importing at run time stops this, rather than loading half a module. */
  if (/^\s*import\s/m.test(js) || /\brequire\(/.test(js)) throw new Error('src/components/dex/dexFacets.ts imports something at run time');
  const { createFacets, NO_FACETS } = await import(dataUrl(js));
  if (typeof createFacets !== 'function' || !NO_FACETS) throw new Error('src/components/dex/dexFacets.ts no longer exports createFacets and NO_FACETS');

  return (drinks) => {
    const model = createFacets({
      drinks,
      flavours: [],
      spirits: [],
      flavourMask: () => 0,
      spiritMask: () => 0,
      grapesOf: () => [],
      styleWord: (s) => s,
      words: WORDS,
    });
    const ctx = { caught: () => false, canMake: null };
    const wines = drinks.filter((d) => d.category === 'wine');
    const out = new Map(wines.map((d) => [d.id, null]));
    for (const o of model.options.region) {
      const isIn = model.matcher({ ...NO_FACETS, kind: 'wine', regions: [o.key] }, ctx);
      for (const d of wines) if (isIn(d)) out.set(d.id, o.key);
    }
    return out;
  };
}
