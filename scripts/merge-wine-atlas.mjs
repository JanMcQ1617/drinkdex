/**
 * Promotes the wine atlas into the Dex as cards.
 *
 * Run: node scripts/merge-wine-atlas.mjs [--dry]
 *
 * The wine equivalent of scripts/merge-beer-brands.mjs. src/data/wineAtlas.json
 * is a reference layer of 1,558 named wines — appellations, protected
 * denominations and classic styles — each carrying its country, region,
 * denomination type, style and grape varieties. This turns every one of them
 * into a Dex card.
 *
 * WHY GENERATED. Same reasoning as the beer layer: nobody hand-writes 1,500
 * cards, and invented tasting copy would be fabrication at scale. Every field
 * is either a FACT the atlas already carries — name, country, region,
 * denomination, style, grape varieties, and the country and grape notes
 * written alongside them — or derived deterministically from the style. Where
 * the atlas is silent this says so instead of guessing.
 *
 * WHAT THESE ARE NOT. An entry here is an appellation or a named wine style,
 * not a producer's bottling: "Barolo", not "Giacomo Conterno Monfortino". The
 * atlas says so in its own note and the cards inherit that scope honestly.
 *
 * Contract, matching the other merge scripts: read-and-merge (four sessions
 * write drinks.json, never rebuild), sticky dex numbers by id, ids suffixed
 * `-wn`, and a hard refusal on any cross-category id collision.
 *
 * RUN AFTER scripts/merge-wines.mjs. The authored cards it writes are the
 * skip list below, so an atlas wine the Dex already describes by hand is
 * never generated a second time.
 *
 * BACK FROM 20 SEP 2026 (v4.14, specs/v4.14/wine-restore.md). Removed with
 * the rest of wine in 2a75eec and restored with the ids it made then, so a
 * card's id is the one a phone logged before the removal. Two things changed,
 * both because the port and the sherries stayed on the spirit shelf
 * (scripts/spiritdata/99-fortified.json) when wine left:
 *
 *   - the skip list still counts those twelve as authored wine cards, as it
 *     did when they were. Without that, the atlas's "Cream Sherry" and
 *     "Pedro Ximénez Sherry" would come back as generated wine cards beside
 *     the spirit cards of the same name, under ids no phone ever held;
 *   - SAME_AS_A_SPIRIT_CARD leaves out the eight atlas wines that ARE one of
 *     those spirit cards under the atlas's name ("Porto Ruby" is Ruby Port,
 *     "Fino" is Fino Sherry). Before the removal the Dex carried both, the
 *     same wine twice in one category; restored, it would be the same wine
 *     in two, a spirit and a wine, which a filter by kind makes impossible to
 *     miss. Every other fortified wine (Madeira, Banyuls, Rutherglen Muscat,
 *     Porto Colheita) is a wine by the atlas's own style and comes back.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { validate, merge, assertShapePreserved, reportAndGate } from './lib/dex-merge.mjs';
import { STYLE } from './lib/wine-styles.mjs';

const ROOT = new URL('../', import.meta.url);
const DRINKS = new URL('src/data/drinks.json', ROOT);
const ATLAS = new URL('src/data/wineAtlas.json', ROOT);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const atlas = JSON.parse(readFileSync(ATLAS, 'utf8'));

const fold = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* How each style is served and made: STYLE, scripts/lib/wine-styles.mjs. */

/* ------------------------------------------------------------------ */

const countries = atlas.countries;
const grapes = atlas.grapes;

/*
 * The bottlings (-wb, scripts/merge-wine-brands.mjs, v4.15) are left out
 * of both lists below. They are numbered after these cards and named so
 * that no atlas wine shares a name with one (that merge refuses it), so
 * leaving them out changes nothing today; it keeps a bottle from ever
 * counting as the authored card that makes an atlas wine skip, or from
 * pushing an atlas name onto a qualifier. Should a name ever clash, the
 * shared name check below refuses the run instead.
 */
const isBottling = (d) => d.id.endsWith('-wb');

const takenNames = new Map(
  drinks.filter((d) => !d.id.endsWith('-wn') && !isBottling(d)).map((d) => [fold(d.name), d.name])
);

/*
 * Wines the Dex already carries as authored cards. 135 atlas entries share a
 * name with one — Barolo, Champagne, Rioja, Sauternes — and generating those
 * would put the same wine in the Dex twice: once hand-written with real
 * tasting copy, once derived and thinner, distinguished only by a bracketed
 * region. The authored card wins; the atlas entry is skipped.
 *
 * The fortified wines on the spirit shelf count as authored here too: they
 * were authored wine cards when this list was first drawn, and two atlas
 * wines share their names exactly (Cream Sherry, Pedro Ximénez Sherry).
 */
const SPIRIT_SHELF_WINES = new Set(['Sherry', 'Port', 'Vermouth']);
const AUTHORED_WINES = new Set(
  drinks
    .filter(
      (d) =>
        (d.category === 'wine' && !d.id.endsWith('-wn') && !isBottling(d)) ||
        (d.category === 'spirit' && SPIRIT_SHELF_WINES.has(d.subcategory)),
    )
    .map((d) => fold(d.name))
);

/**
 * Atlas wines that are a spirit-shelf card under another name: atlas name ->
 * the spirit card's id. Left out while that card is in the Dex (see the
 * header), and only then: if the spirit card ever goes, its atlas twin comes
 * back as the wine it is. A name here that the atlas no longer has stops the
 * run, so the list cannot quietly go stale.
 */
const SAME_AS_A_SPIRIT_CARD = {
  'Porto Ruby': 'ruby-port',
  'Porto Tawny': 'tawny-port',
  'Porto Vintage': 'vintage-port',
  Fino: 'fino-sherry',
  'Manzanilla de Sanlúcar': 'manzanilla-sherry',
  Amontillado: 'amontillado-sherry',
  Oloroso: 'oloroso-sherry',
  'Palo Cortado': 'palo-cortado-sherry',
};
{
  const atlasNames = new Set(atlas.wines.map((w) => w.n));
  const stale = Object.keys(SAME_AS_A_SPIRIT_CARD).filter((n) => !atlasNames.has(n));
  if (stale.length) {
    console.error(`\nmerge-wine-atlas.mjs: SAME_AS_A_SPIRIT_CARD names wines the atlas does not have: ${stale.join(', ')}`);
    process.exit(1);
  }
}
const spiritIds = new Set(drinks.filter((d) => d.category === 'spirit').map((d) => d.id));
const isSpiritTwin = (w) => spiritIds.has(SAME_AS_A_SPIRIT_CARD[w.n] ?? '');

/**
 * The Dex `origin` field follows its own country convention, which is not the
 * atlas's. "United States" is right for a country LIST — it is what the Wine
 * Atlas screen renders — and wrong for an origin STRING, where every one of
 * the Dex's other 867 US entries writes "USA".
 *
 * Applied to prose fields ONLY. The card `id` is built from country.name and
 * must not move: 242 ids would change from -unitedstates-wn to -usa-wn,
 * breaking every collection record and every atlas link that references them.
 */
const DEX_COUNTRY = {
  'United States': 'USA',
  'Czech Republic': 'Czechia',
};
const dexCountry = (name) => DEX_COUNTRY[name] ?? name;

function uniqueName(w, country) {
  /* A qualifier that repeats the name adds nothing: "Mendoza (Mendoza)". */
  const candidates = [
    w.n,
    ...(fold(w.r) === fold(w.n) ? [] : [`${w.n} (${w.r})`]),
    `${w.n} (${country.name})`,
    `${w.n} (${w.r}, ${country.name})`,
  ];
  for (const c of candidates) {
    if (!takenNames.has(fold(c))) {
      takenNames.set(fold(c), c);
      return c;
    }
  }
  const c = `${w.n} (${w.t}, ${country.name})`;
  takenNames.set(fold(c), c);
  return c;
}

/** A denomination is rarer the more specific its legal tier. */
function rarityOf(w) {
  if (/Vin Jaune|Prädikat|Vinea Wachau/.test(w.t)) return 'legendary';
  if (/Fortified|Sweet|Orange/.test(w.s)) return 'rare';
  if (/DOCG|DAC|PDO|DO$/.test(w.t)) return 'uncommon';
  if (w.t === 'Regional' || w.t === 'Grape wine') return 'common';
  return 'uncommon';
}

const skipped = atlas.wines.filter((w) => AUTHORED_WINES.has(fold(w.n)));
const twins = atlas.wines.filter((w) => !AUTHORED_WINES.has(fold(w.n)) && isSpiritTwin(w));
const cards = atlas.wines.filter((w) => !AUTHORED_WINES.has(fold(w.n)) && !isSpiritTwin(w)).map((w) => {
  const country = countries[w.c];
  const st = STYLE[w.s] ?? STYLE.Various;
  const vars = (w.g ?? []).map((gi) => grapes[gi]).filter(Boolean);
  const varNames = vars.map((g) => g.name);

  const grapeClause = varNames.length
    ? `Made from ${varNames.slice(0, 4).join(', ')}${varNames.length > 4 ? ` and ${varNames.length - 4} more` : ''}.`
    : 'The atlas does not record which varieties are permitted here.';

  /* Prefer a grape's own note, then the country's — both are written text
   * from the atlas, not something invented for this card. */
  const grapeNote = vars.find((g) => g.note)?.note ?? null;
  const funFact = grapeNote
    ? `${vars.find((g) => g.note).name}: ${grapeNote}`
    : country.note || `${country.name} has ${country.wines} named wines in this atlas.`;

  /*
   * The description's first words. "A" used to go before every tier, so 751
   * cards opened "A AOC red wine" or "A AVA white wine" (build 40's review):
   * the article now follows the word after it, and every tier the atlas
   * spells with a vowel first is said with one (AOC, AVA, IGP, Einzellage,
   * Anbaugebiet). "National", the region of a country's nationwide names,
   * is no place to be from ("from National, France"), and Vin de France,
   * the one Various, is wine of any colour, not a "various wine".
   */
  const tier = w.t === 'Regional' || w.t === 'Grape wine' ? '' : `${w.t} `;
  const kind = w.s === 'Various' ? 'wine of any colour' : `${w.s.toLowerCase()} wine`;
  const from = w.r === 'National' ? dexCountry(country.name) : `${w.r}, ${dexCountry(country.name)}`;

  return {
    id: `${fold(w.n)}-${fold(country.name)}-wn`,
    name: uniqueName(w, country),
    category: 'wine',
    subcategory: st.sub,
    description: `${/^[aeiou]/i.test(tier || kind) ? 'An' : 'A'} ${tier}${kind} from ${from}. ${grapeClause}`,
    abv: st.abv,
    origin: `${w.r}, ${dexCountry(country.name)}`,
    rarity: rarityOf(w),
    tastingNotes: st.notes,
    glassware: st.glass,
    funFact,
    serve: { temp: st.temp, glass: st.glass, how: st.how, pair: st.pair },
    composition: {
      summary: `${w.s} wine from ${w.r}${w.t === 'Regional' ? '' : `, ${w.t}`}.`,
      components: [
        { label: 'Grapes', detail: varNames.length ? varNames.join(', ') : 'Not recorded in the atlas.' },
        { label: 'Region', detail: `${w.r}, ${dexCountry(country.name)}` },
        { label: 'Vinification', detail: st.vinif },
      ],
      process: `${w.t === 'Regional' || w.t === 'Grape wine' ? 'A regional wine' : `Protected as ${w.t}`}, made in ${w.r} and bottled to the local rules for ${w.s.toLowerCase()} wine.`,
    },
  };
});

/* ---- validate, merge, gate — all shared (scripts/lib/dex-merge.mjs) ---- */

const report = validate({ drinks, incoming: cards, category: 'wine', owner: 'merge-wine-atlas.mjs' });
reportAndGate(report);

const { out, added, fresh, refreshed } = merge({ drinks, incoming: cards });

const problems = assertShapePreserved({ before: drinks, after: out, category: 'wine' });
if (problems.length) {
  console.error(`\nmerge-wine-atlas.mjs: the merge changed rows it does not own — nothing written:\n`);
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

if (dry) {
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${refreshed} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${out.length} entries — ${fresh} new, ${refreshed} refreshed`);
}
console.log(`  skipped (already authored): ${skipped.length}`);
console.log(`  left out (a spirit-shelf card under the atlas's name): ${twins.map((w) => w.n).join(', ') || 'none'}`);
console.log(`  wine cards: ${cards.length}  |  dex ${Math.min(...added.map((a) => a.dexNumber))}–${Math.max(...added.map((a) => a.dexNumber))}`);
