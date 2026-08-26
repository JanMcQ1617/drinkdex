/**
 * Promotes the brand layer into the Dex as cards.
 *
 * Run: node scripts/merge-beer-brands.mjs [--dry]
 *
 * Jan asked for every beer in the Dex, not the 129 styles. This generates one
 * card per real product in src/data/breweries.json — 3,000+ of them — and
 * merges them into drinks.json alongside the authored style cards.
 *
 * WHY THIS IS GENERATED AND NOT AUTHORED. Nobody can hand-write 3,000 cards,
 * and inventing tasting copy per brand would be fabrication at scale. So every
 * field here is either a FACT already carried by the brand (its brewery, city,
 * country, ABV, and the one-line note that was sourced with it) or INHERITED
 * from the Dex card for its own style. Inheritance is honest: how you serve a
 * Czech Pilsner is true of every Czech pilsner, including this one. What it is
 * not is unique — a brand card describes its style accurately and its own
 * particular character only as far as the sourced note goes.
 *
 * Brands whose style could never be resolved get a card that says plainly that
 * the recipe is not published, rather than borrowing a style at random.
 *
 * Contract, matching scripts/merge-beers.mjs: read-and-merge (four sessions
 * write drinks.json, so it is never rebuilt from scratch), dex numbers are
 * sticky by id so a re-run is a true no-op, and generated ids are suffixed
 * `-br` so they can never collide with an authored card.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const DRINKS = new URL('src/data/drinks.json', ROOT);
const BREWERIES = new URL('src/data/breweries.json', ROOT);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const countries = JSON.parse(readFileSync(BREWERIES, 'utf8'));

const fold = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const byId = new Map(drinks.map((d) => [d.id, d]));

/* Bare style names that would exact-capture brands in build-breweries.mjs. */
const RESERVED = new Set(['lager', 'pils', 'pilsner', 'ipa', 'pale ale', 'stout', 'porter',
  'bitter', 'trappist', 'abbey', 'dark lager', 'light lager', 'strong lager', 'amber']);

/* ------------------------------------------------------------------ */
/* Flatten the brand layer                                             */
/* ------------------------------------------------------------------ */

const brands = countries.flatMap((c) =>
  c.breweries.flatMap((b) =>
    b.beers.map((x) => ({
      ...x,
      country: c.country,
      code: c.code,
      region: c.region,
      brewery: b.name,
      city: b.city,
      founded: b.founded ?? null,
      researched: b.researched === true,
    }))
  )
);

/* ------------------------------------------------------------------ */
/* Names must be unique against the Dex, against each other, and must  */
/* never be a bare style string. Qualify with the brewery first — it   */
/* reads naturally ("Ocean Lab Stout") — then fall back to country.    */
/* ------------------------------------------------------------------ */

const takenNames = new Map(
  drinks.filter((d) => !d.id.endsWith('-br')).map((d) => [fold(d.name), d.name])
);

function uniqueName(b) {
  const candidates = [b.name];
  if (!b.name.toLowerCase().startsWith(b.brewery.toLowerCase())) {
    candidates.push(`${b.brewery} ${b.name}`);
  }
  candidates.push(`${b.name} (${b.country})`);
  candidates.push(`${b.brewery} ${b.name} (${b.country})`);

  for (const cand of candidates) {
    if (RESERVED.has(cand.toLowerCase())) continue;
    if (!takenNames.has(fold(cand))) {
      takenNames.set(fold(cand), cand);
      return cand;
    }
  }
  /* Last resort: the id is unique by construction, so this always terminates. */
  const cand = `${b.name} (${b.brewery}, ${b.country})`;
  takenNames.set(fold(cand), cand);
  return cand;
}

/* ------------------------------------------------------------------ */
/* Card fields                                                         */
/* ------------------------------------------------------------------ */

/** Strip the trailing prose some notes carry after an em dash. */
const cleanNote = (n) => (n ? n.replace(/\s*—\s*/g, ' — ').trim() : null);

/*
 * The atlas names countries the way a country list should ("United States",
 * "Türkiye"); the Dex's authored entries settled on a different convention
 * for the origin field, and four categories plus every source file already
 * use it. Generated cards must follow the Dex, not the atlas, or 515 beers
 * split the USA into two buckets in every country grouping — which is the
 * exact split the cocktail session had just normalised away.
 *
 * Only genuine divergences belong here. Czechia is deliberately absent: the
 * Dex majority already writes "Czechia" (8) over "Czech Republic" (2).
 */
const ORIGIN_ALIASES = {
  'United States': 'USA',
  'Türkiye': 'Turkey',
  'Antigua & Barbuda': 'Antigua and Barbuda',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Trinidad & Tobago': 'Trinidad and Tobago',
};

function originOf(b) {
  const country = ORIGIN_ALIASES[b.country] ?? b.country;
  return b.city ? `${b.city}, ${country}` : country;
}

/**
 * Rarity is a real signal here, not decoration: how hard the beer is to
 * find. A brewery whose lineup we verified against its own listing is a
 * small independent; a national lager is everywhere.
 */
function rarityOf(b, style) {
  const s = `${b.style ?? ''} ${b.note ?? ''}`.toLowerCase();
  if (/trappist|lambic|gueuze|barrel|imperial stout|barley\s?wine|wild ale|spontaneous/.test(s)) return 'legendary';
  if (/national beer|the island's beer|oldest/.test(s)) return 'rare';
  if (b.researched) return 'rare';
  if (/craft|sour|saison|farmhouse|kveik|smoked|rauch/.test(s)) return 'uncommon';
  if (style && (style.rarity === 'rare' || style.rarity === 'legendary')) return 'uncommon';
  return 'common';
}

/**
 * The sourced note is often just the style in lowercase ("pilsner"), which
 * the card already states in full. Keep only what the note adds beyond it —
 * usually the clause after an em dash ("Brazil's oldest brand").
 */
function extraFromNote(note, style) {
  if (!note) return null;
  const parts = note.split('—').map((x) => x.trim()).filter(Boolean);
  const styleWords = new Set(fold(style?.name ?? '').match(/.{1,}/g) ? fold(style?.name ?? '') : '');
  const kept = parts.filter((part) => {
    const f = fold(part);
    if (!f) return false;
    const sf = fold(style?.name ?? '');
    /* Drop the part if it IS the style, or the style contains it. */
    if (sf && (sf === f || sf.includes(f) || f.includes(sf))) return false;
    /* Drop bare brewery descriptors — they are not about this beer. */
    if (/^(craft|organic craft|craft brewery)(,|$)/i.test(part)) return false;
    return true;
  });
  if (!kept.length) return null;
  const out = kept.join(' — ');
  return `${out[0].toUpperCase()}${out.slice(1)}${/[.!?]$/.test(out) ? '' : '.'}`;
}

function describe(b, style) {
  const where = b.city ? `${b.city}, ${b.country}` : b.country;
  /* An eponymous beer ("Bohemia" by Bohemia) must not read "X brewed by X". */
  const eponymous = fold(b.brewery) === fold(b.name);
  const head = style
    ? eponymous
      ? `${style.name} from ${where}.`
      : `${style.name} brewed by ${b.brewery} in ${where}.`
    : eponymous
      ? `Brewed in ${where}.`
      : `Brewed by ${b.brewery} in ${where}.`;
  const extra = extraFromNote(b.note ?? b.style, style);
  return extra ? `${head} ${extra}` : head;
}

function funFactOf(b, style) {
  if (b.founded) {
    return `${b.brewery} has been brewing in ${b.city ?? b.country} since ${b.founded}.`;
  }
  if (b.researched) {
    return `${b.brewery}'s lineup was checked against the brewery's own listing, so this is what they actually pour.`;
  }
  if (style) {
    const n = countByStyle.get(style.id) ?? 0;
    const k = countriesByStyle.get(style.id)?.size ?? 0;
    if (n <= 1) return `The only ${style.name} in this atlas — no other brewery here makes one.`;
    return `One of ${n} beers in this atlas brewed to the ${style.name} style, across ${k} ${k === 1 ? 'country' : 'countries'}.`;
  }
  return `${b.brewery} is one of ${breweryCount.get(b.country)} breweries catalogued in ${b.country}.`;
}

/* Precomputed so funFactOf states real counts rather than guesses. */
const countByStyle = new Map();
const countriesByStyle = new Map();
const breweryCount = new Map();
for (const c of countries) breweryCount.set(c.country, c.breweries.length);
for (const b of brands) {
  if (!b.styleRef) continue;
  countByStyle.set(b.styleRef, (countByStyle.get(b.styleRef) ?? 0) + 1);
  if (!countriesByStyle.has(b.styleRef)) countriesByStyle.set(b.styleRef, new Set());
  countriesByStyle.get(b.styleRef).add(b.country);
}

/** For a brand whose style never resolved, say so rather than borrowing one. */
function undocumented(b) {
  return {
    glassware: 'Whatever the bar pours it in',
    tastingNotes: ['unlisted'],
    serve: {
      temp: 'Cold, as the brewery intends',
      glass: 'Whatever the bar pours it in',
      how: `No published serving guidance for this one. ${b.brewery} lists it without a style, so treat it the way the bar does — cold, in whatever they hand you — and let the first sip tell you what it is.`,
      pair: ['Whatever is on the table'],
    },
    composition: {
      summary: `Not documented. ${b.brewery} does not publish a grain bill or hop schedule for this beer.`,
      components: [
        { label: 'Malt', detail: 'Not published by the brewery.' },
        { label: 'Hops', detail: 'Not published by the brewery.' },
        { label: 'Yeast', detail: 'Not published by the brewery.' },
      ],
      process: 'Unrecorded. Listed here because the beer is real and verifiable even where its recipe is not.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const cards = brands.map((b) => {
  const style = b.styleRef ? byId.get(b.styleRef) : null;
  const fallback = style ? null : undocumented(b);

  return {
    id: `${b.id}-br`,
    name: uniqueName(b),
    category: 'beer',
    /* The FAMILY, not the style name. Every authored card across all four
     * categories puts a family here ("Pale Lager", "IPA"), and the artwork
     * layer resolves beer liquid colour from it — BEER_BY_SUBCATEGORY. Using
     * the style name instead left all 3,109 brand cards unmapped and falling
     * back to a default colour. The specific style is not lost: it opens the
     * card's description and is one tap away through the Atlas. */
    subcategory: style ? style.subcategory : 'Uncatalogued',
    description: describe(b, style),
    abv: b.abv ?? style?.abv ?? 'Not published',
    origin: originOf(b),
    rarity: rarityOf(b, style),
    tastingNotes: style ? style.tastingNotes : fallback.tastingNotes,
    glassware: style ? style.glassware : fallback.glassware,
    funFact: funFactOf(b, style),
    serve: style ? style.serve : fallback.serve,
    composition: style ? style.composition : fallback.composition,
  };
});

/* ------------------------------------------------------------------ */
/* Validate before writing — same gates merge-beers.mjs applies        */
/* ------------------------------------------------------------------ */

const errors = [];
const seenId = new Set();
const seenName = new Set();
for (const c of cards) {
  if (seenId.has(c.id)) errors.push(`duplicate generated id ${c.id}`);
  seenId.add(c.id);
  const nk = fold(c.name);
  if (seenName.has(nk)) errors.push(`duplicate generated name "${c.name}"`);
  seenName.add(nk);
  if (RESERVED.has(c.name.toLowerCase())) errors.push(`"${c.name}" is a bare style string`);
  for (const f of ['id', 'name', 'subcategory', 'description', 'abv', 'origin', 'rarity',
    'tastingNotes', 'glassware', 'funFact', 'serve', 'composition']) {
    if (c[f] == null) errors.push(`${c.id}: missing ${f}`);
  }
  if (!c.serve?.how || !c.composition?.components?.length) errors.push(`${c.id}: hollow serve/composition`);
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) — nothing written:\n`);
  for (const e of errors.slice(0, 30)) console.error('  ' + e);
  process.exit(1);
}

/*
 * Cross-category collision guard.
 *
 * The obvious filter — drop every incoming id from `drinks` and re-add — is
 * silently destructive: if a generated id matches an existing COCKTAIL, that
 * cocktail is dropped and replaced by a beer. No error, no missing row, just
 * one category quietly one lighter. That exact bug converted a Pink Gin
 * cocktail into a spirit elsewhere in this repo today.
 *
 * The `-br` suffix makes a collision unlikely; unlikely is not checked. So
 * check it, and only ever replace a row that is already a beer of ours.
 */
const priorById = new Map(drinks.map((d) => [d.id, d]));
const collisions = cards
  .map((c) => [c, priorById.get(c.id)])
  .filter(([, prior]) => prior && prior.category !== 'beer');
if (collisions.length) {
  console.error(`\n${collisions.length} id collision(s) with another category — nothing written:\n`);
  for (const [c, prior] of collisions.slice(0, 20)) {
    console.error(`  ${c.id}: would overwrite ${prior.category} "${prior.name}"`);
  }
  process.exit(1);
}

const generatedIds = new Set(cards.map((c) => c.id));
const kept = drinks.filter((d) => !generatedIds.has(d.id));
const existingDex = new Map(drinks.map((d) => [d.id, d.dexNumber]));
let next = Math.max(0, ...drinks.map((d) => d.dexNumber)) + 1;

const added = cards.map((c) => ({ ...c, dexNumber: existingDex.get(c.id) ?? next++ }));
const out = [...kept, ...added].sort((a, b) => a.dexNumber - b.dexNumber);

const fresh = added.filter((c) => !existingDex.has(c.id)).length;
if (dry) {
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${added.length - fresh} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${out.length} entries — ${fresh} new brand cards, ${added.length - fresh} refreshed`);
}

/* Belt and braces: prove no other category lost an entry. */
const before = drinks.reduce((a, d) => ((a[d.category] = (a[d.category] ?? 0) + 1), a), {});
const after = out.reduce((a, d) => ((a[d.category] = (a[d.category] ?? 0) + 1), a), {});
for (const cat of ['cocktail', 'wine', 'spirit']) {
  if ((before[cat] ?? 0) !== (after[cat] ?? 0)) {
    console.error(`FATAL: ${cat} went ${before[cat]} -> ${after[cat]}`);
    process.exit(1);
  }
}
console.log(`  categories held: cocktail ${after.cocktail}, wine ${after.wine}, spirit ${after.spirit}`);

const withStyle = cards.filter((c) => c.subcategory !== 'Uncatalogued').length;
console.log(`  brand cards: ${cards.length}  (${withStyle} inherit a style, ${cards.length - withStyle} undocumented)`);
console.log(`  dex numbers: ${Math.min(...added.map((a) => a.dexNumber))}–${Math.max(...added.map((a) => a.dexNumber))}`);
