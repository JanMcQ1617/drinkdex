/**
 * Promotes the spirit brand atlas into the Dex as cards.
 *
 * Run: node scripts/merge-spirit-brands.mjs [--dry]
 *
 * The third of the brand layers, after beer (merge-beer-brands.mjs) and wine
 * (merge-wine-atlas.mjs). Spirits had no atlas of their own, so the source is
 * scripts/spiritbranddata/ — real bottlings, each naming the spirit Dex style
 * it belongs to.
 *
 * WHY GENERATED, on the same terms as the other two: every field is either a
 * fact carried by the brand — its name, producer country, and the sourced note
 * where one exists — or INHERITED from the Dex card for its style. That is
 * honest for spirits in the same way it is for beer: how you serve an Islay
 * single malt is true of every Islay single malt.
 *
 * Unlike beer, this refuses to run on an unresolved style. A brand whose `s`
 * does not name a real spirit entry is a data error, not a card with a gap —
 * there is no equivalent of "the brewery does not publish this", because the
 * style is something I asserted when writing the row.
 *
 * Contract: read-and-merge, sticky dex numbers, ids suffixed `-sb`, hard
 * refusal on cross-category id collision, and an assertion that no other
 * category changes size.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { validate, merge, assertShapePreserved, reportAndGate } from './lib/dex-merge.mjs';

const ROOT = new URL('../', import.meta.url);
const DRINKS = new URL('src/data/drinks.json', ROOT);
const SRC = new URL('scripts/spiritbranddata/', ROOT);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const files = readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
const brands = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, SRC), 'utf8')));

const fold = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Authored spirit cards, by name — the styles a brand may point at. */
const STYLES = new Map(
  drinks
    .filter((d) => d.category === 'spirit' && !d.id.endsWith('-sb'))
    .map((d) => [d.name.toLowerCase(), d])
);

const takenNames = new Map(
  drinks.filter((d) => !d.id.endsWith('-sb')).map((d) => [fold(d.name), d.name])
);

/*
 * Spirits the Dex already carries as authored cards. 98 rows in the brand
 * atlas share a name with one, because for a great many world spirits the
 * brand IS the category — Campari, Konyagi, Samogon, Chang'aa. Generating
 * those would put the same bottle in the Dex twice, the second time thinner.
 * The authored card wins. Same rule as the wine atlas.
 */
const AUTHORED = new Set(
  drinks.filter((d) => d.category === 'spirit' && !d.id.endsWith('-sb')).map((d) => fold(d.name))
);

function uniqueName(b) {
  for (const cand of [b.n, `${b.n} (${b.c})`, `${b.n} (${b.s})`]) {
    if (!takenNames.has(fold(cand))) {
      takenNames.set(fold(cand), cand);
      return cand;
    }
  }
  const cand = `${b.n} (${b.s}, ${b.c})`;
  takenNames.set(fold(cand), cand);
  return cand;
}

/**
 * Rarity as scarcity, not quality. Allocated bottlings and single casks are
 * genuinely hard to find; a supermarket blend is not.
 */
function rarityOf(b, style) {
  const t = `${b.n} ${b.note ?? ''}`.toLowerCase();
  if (/pappy|louis xiii|xo|extra añejo|solist|21|25|most sought/.test(t)) return 'legendary';
  if (/single barrel|cask strength|barrel proof|single cask|18|15|pechuga|tobalá/.test(t)) return 'rare';
  if (/vsop|reposado|añejo|12|10|small batch|bottled-in-bond/.test(t)) return 'uncommon';
  if (style && (style.rarity === 'rare' || style.rarity === 'legendary')) return 'uncommon';
  return 'common';
}

const errors = [];
const cards = [];
const seenId = new Set();

let skippedAuthored = 0;
for (const b of brands) {
  if (AUTHORED.has(fold(b.n))) { skippedAuthored++; continue; }
  const style = STYLES.get(b.s.toLowerCase());
  if (!style) {
    errors.push(`"${b.n}": style "${b.s}" is not a spirit entry in the Dex`);
    continue;
  }
  const id = `${fold(b.n)}-sb`;
  if (seenId.has(id)) {
    errors.push(`"${b.n}": duplicate generated id ${id}`);
    continue;
  }
  seenId.add(id);

  const note = b.note ? `${b.note[0].toUpperCase()}${b.note.slice(1)}${/[.!?]$/.test(b.note) ? '' : '.'}` : null;

  cards.push({
    id,
    name: uniqueName(b),
    category: 'spirit',
    /* The FAMILY, matching every authored card — the artwork layer resolves
     * from subcategory, and using the style name instead leaves it unmapped.
     * Learned the hard way on the beer layer. */
    subcategory: style.subcategory,
    description: `${style.name} from ${b.c}.${note ? ` ${note}` : ''}`,
    abv: style.abv,
    origin: b.c,
    rarity: rarityOf(b, style),
    tastingNotes: style.tastingNotes,
    glassware: style.glassware,
    funFact: note
      ? `${b.n}: ${b.note}`
      : (() => {
          const n = brands.filter((x) => x.s === b.s).length;
          return n <= 1
            ? `The only ${style.name} bottling catalogued here.`
            : `One of ${n} ${style.name} bottlings catalogued here.`;
        })(),
    serve: style.serve,
    composition: style.composition,
  });
}

/* ---- validate, merge, gate — all shared (scripts/lib/dex-merge.mjs) ---- */

const report = validate({ drinks, incoming: cards, category: 'spirit', owner: 'merge-spirit-brands.mjs' });
reportAndGate(report);

const { out, added, fresh, refreshed } = merge({ drinks, incoming: cards });

const problems = assertShapePreserved({ before: drinks, after: out, category: 'spirit' });
if (problems.length) {
  console.error(`\nmerge-spirit-brands.mjs: the merge changed rows it does not own — nothing written:\n`);
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

if (dry) {
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${refreshed} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${out.length} entries — ${fresh} new, ${refreshed} refreshed`);
}
console.log(`  skipped (already authored): ${skippedAuthored}`);
console.log(`  spirit brand cards: ${cards.length} from ${files.length} source files`);
console.log(`  dex ${Math.min(...added.map((a) => a.dexNumber))}–${Math.max(...added.map((a) => a.dexNumber))}`);
