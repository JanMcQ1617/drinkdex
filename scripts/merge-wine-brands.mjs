/**
 * Promotes the wine bottlings into the Dex as cards (v4.15,
 * specs/v4.15/wine-bottles.md).
 *
 * Run: node scripts/merge-wine-brands.mjs [--dry]
 *
 * The wine twin of merge-spirit-brands.mjs. The Dex's wine cards are
 * appellations, styles and grapes (merge-wines.mjs, merge-wine-atlas.mjs):
 * "Pauillac", not "Château Latour". This adds the bottles, from
 * scripts/winebranddata/, one file per part of the wine world: real
 * bottlings, each naming the wine card it is filed under (`s`), its
 * producer's country, region, colour and grapes, and the page it was
 * confirmed on (`src`, kept in the source, never projected).
 *
 * WHY GENERATED, on the same terms as the spirits: every field is either a
 * fact carried by the bottle (its name, country, region, colour, grapes,
 * and its strength or a sourced note where the row has one) or INHERITED
 * from the card it is filed under. How a Pauillac is served is true of
 * every Pauillac.
 *
 * WHAT A BOTTLE MAY INHERIT. A card's words are written for something: a
 * colour (the Côtes de Provence card is a rosé's) and sometimes one grape
 * (Napa Valley's are Cabernet's). A bottle of that colour and grape takes
 * the card's tasting notes, glass, serve, strength and composition; one
 * that is not (a white Côtes de Provence, a sparkling Vouvray, a Napa
 * Merlot) takes its colour's from scripts/lib/wine-styles.mjs, the table
 * the atlas cards are written from, so nothing describes a bottle as
 * something it is not. scripts/lib/wine-brands.mjs (cardDescribes) says
 * which. Rarity is always the card's.
 *
 * WHERE A BOTTLE IS. A bottle filed under a place is in the Region option
 * its card is in, as the app's own code works regions out
 * (scripts/lib/dex-regions.mjs): its origin is its own region where that
 * lands it there, else its card's origin (a Brunello whose row says
 * Tuscany takes "Montalcino, Italy"), else its card's name, for a card the
 * app puts in the region it is named for (the Santorini card's origin says
 * Cyclades, and the app files it under Santorini). A bottle of a
 * nationwide name keeps its own region where some card is in it, and one
 * filed under a grape or a style keeps its own ("South Eastern
 * Australia"). The composition's Region line keeps the bottle's own region
 * throughout.
 *
 * REFUSES, rather than writing a card with a gap: a row whose `s` is not a
 * wine card, a colour the style table does not know, a bottle filed under a
 * place in another country, a strength not written like "13.5%", a key the
 * row may not carry, two rows that fold to one name, a name another card
 * already has, a bottle no origin puts beside its card in the Region
 * filter, a card the bottlings would move out of its region, and a
 * bottling card whose row has left the source (remove it with
 * `node scripts/remove-drinks.mjs <id> --keep-numbers`, which keeps the
 * phones' records and every other number, then re-run; without the flag
 * it renumbers every later card). The rest of the contract is dex-merge's:
 * read-and-merge, sticky dex numbers by id, ids suffixed `-wb`, a hard
 * refusal on any cross-category id collision, and an assertion that no
 * other category changes size.
 *
 * RUN AFTER merge-wines.mjs and merge-wine-atlas.mjs (the cards a bottle is
 * filed under are theirs), then build-wine-atlas-links.mjs, which links
 * every bottle to its appellation or grape.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { assertShapePreserved, dexCountry, fold, merge, reportAndGate, validate } from './lib/dex-merge.mjs';
import { dexRegions } from './lib/dex-regions.mjs';
import { atlasGrapes, atlasIndex, bottlingId, cardDescribes, isBottling, loadWineBrands, styleCards, styleFacts } from './lib/wine-brands.mjs';
import { STYLE } from './lib/wine-styles.mjs';

const ROOT = new URL('../', import.meta.url);
const DRINKS = new URL('src/data/drinks.json', ROOT);
const ATLAS = new URL('src/data/wineAtlas.json', ROOT);
const OWNER = 'merge-wine-brands.mjs';
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const atlas = JSON.parse(readFileSync(ATLAS, 'utf8'));
const idx = atlasIndex(atlas);
const cards = styleCards(drinks);
const brands = loadWineBrands();

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

const KEYS = new Set(['n', 's', 'c', 'region', 'colour', 'grapes', 'abv', 'note', 'src', 'file']);
/** The colours a bottle may be: STYLE's, but Various, which is a denomination's, never a bottle's. */
const COLOURS = new Set(Object.keys(STYLE).filter((k) => k !== 'Various'));
const ABV = /^\d+(\.\d+)?(–\d+(\.\d+)?)?%$/;

/** "Sparkling Rosé" -> "sparkling rosé", Vin Jaune staying a name. */
const colourWord = (c) => (c === 'Vin Jaune' ? 'vin jaune' : c.toLowerCase());

/** "Pinot Noir, Meunier and Chardonnay", as the authored cards list grapes. */
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "An Échézeaux", "An Ürziger Würzgarten": the accent folded before the vowel is read. */
const article = (word) => (/^[aeiou]/i.test(word.normalize('NFD')) ? 'An' : 'A');

/** A country after "from": the USA, the United Kingdom, France. */
const fromCountry = (c) => (c === 'USA' || c === 'United Kingdom' ? `the ${c}` : c);

/** Sentence case for a note, with its stop, as the spirit layer writes one. */
const sentence = (s) => `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}`;

/* ------------------------------------------------------------------ */
/* Rows -> cards                                                       */
/* ------------------------------------------------------------------ */

const errors = [];
const seenId = new Map();
const perStyle = new Map();
for (const b of brands) perStyle.set(b.s, (perStyle.get(b.s) ?? 0) + 1);
const stats = { describes: 0, colourWords: 0, ownRegion: 0, cardRegion: 0, unmatchedGrapes: new Map() };
/** The bottles filed under a place, whose origin is settled against the app's Region filter after the loop. */
const placing = [];
/** Each bottle's own origin, its region and country as its row gives them. */
const ownOf = new Map();

const incoming = [];
for (const b of brands) {
  const where = `${b.file} "${b.n}"`;
  const stray = Object.keys(b).filter((k) => !KEYS.has(k));
  if (stray.length) { errors.push(`${where}: keys a bottling may not carry: ${stray.join(', ')}`); continue; }
  for (const k of ['n', 's', 'c', 'colour', 'src']) {
    if (typeof b[k] !== 'string' || !b[k].trim()) errors.push(`${where}: missing ${k}`);
  }
  if (typeof b.n !== 'string' || typeof b.s !== 'string' || typeof b.c !== 'string') continue;
  if (b.region != null && (typeof b.region !== 'string' || !b.region.trim())) errors.push(`${where}: region must be a name or absent`);
  if (b.grapes != null && (!Array.isArray(b.grapes) || !b.grapes.length || b.grapes.some((g) => typeof g !== 'string' || !g.trim()))) {
    errors.push(`${where}: grapes must be a list of names or absent`);
  }
  if (b.abv != null && !ABV.test(b.abv)) errors.push(`${where}: abv "${b.abv}" must read like "13.5%" or "11.5–12.5%"`);
  if (b.note != null && (typeof b.note !== 'string' || !b.note.trim())) errors.push(`${where}: note must be text or absent`);
  if (!/^https?:\/\//.test(b.src ?? '')) errors.push(`${where}: src must be the page the bottle was confirmed on`);
  if (!COLOURS.has(b.colour)) { errors.push(`${where}: colour "${b.colour}" is not one of ${[...COLOURS].join(', ')}`); continue; }

  const card = cards.get(b.s);
  if (!card) { errors.push(`${where}: "${b.s}" is not a wine card in the Dex`); continue; }
  const facts = styleFacts(card, idx);
  if (facts.kind === 'place' && idx.country(facts.atlasWine) !== b.c) {
    errors.push(`${where}: filed under ${card.name}, which is in ${idx.country(facts.atlasWine)}, not ${b.c}`);
    continue;
  }

  const id = bottlingId(b);
  if (seenId.has(id)) { errors.push(`${where}: folds to the same name as "${seenId.get(id)}"`); continue; }
  seenId.set(id, b.n);

  const country = dexCountry(b.c);
  const own = b.region ? `${b.region}, ${country}` : country;
  /* A first guess for a bottle filed under a place: settled below, against the app's Region filter (WHERE A BOTTLE IS). */
  const origin = facts.kind === 'place' && !b.region ? card.origin : own;
  ownOf.set(id, own);

  const describes = cardDescribes(b, facts, idx);
  if (describes) stats.describes++;
  else stats.colourWords++;
  const st = STYLE[b.colour];
  const grapes = b.grapes ?? [];
  for (const g of grapes) if (!idx.grape(g)) stats.unmatchedGrapes.set(g, (stats.unmatchedGrapes.get(g) ?? 0) + 1);

  /* The variety as the bottle spells it: [yellow tail] Shiraz is a Shiraz, Tormaresca's a Primitivo. */
  const varietyWord =
    facts.kind === 'variety'
      ? (grapes.find((g) => facts.grape && idx.grape(g) === facts.grape) ??
        (card.name.includes(' / ') ? card.name.split(' / ').find((n) => fold(b.n).includes(fold(n))) ?? card.name.split(' / ')[0] : card.name))
      : null;
  const colourOff = !facts.colours.has(b.colour);
  const lead = colourOff ? `${colourWord(b.colour)} ` : '';
  /* In prose a card is its name without the Dex's qualifier: "Icewine (Ontario)" is an Icewine. */
  const plain = card.name.replace(/\s*\(.*\)\s*$/, '');
  if (facts.kind === 'place') placing.push({ id, card, choices: [...new Set([origin, card.origin, `${plain}, ${country}`])] });
  const what =
    facts.kind === 'variety'
      ? `${lead}${varietyWord}${grapes.length > 1 ? ' blend' : ''}`
      : `${lead}${plain}`;
  /* A place card names the place, so only the country follows it; a grape or a style is from wherever the bottle is. */
  const from = facts.kind === 'place' ? fromCountry(country) : b.region ? `${b.region}, ${country}` : fromCountry(country);
  const made = grapes.length && !(facts.kind === 'variety' && grapes.length === 1) ? ` Made from ${list(grapes)}.` : '';
  const note = b.note ? sentence(b.note.trim()) : null;
  const description = `${article(what)} ${what} from ${from}.${made}${note ? ` ${note}` : ''}`;

  const n = perStyle.get(b.s);
  const funFact = note
    ? `${b.n}: ${note}`
    : n === 1
      ? `The only ${plain} bottling catalogued here.`
      : `One of ${n} ${plain} bottlings catalogued here.`;

  /* The composition: the card's where its words describe the bottle, with the bottle's own grapes and region. */
  const placeRegion = facts.kind === 'place' && (!b.region || fold(b.region) === fold(facts.atlasWine.r));
  const composition = describes
    ? {
        ...card.composition,
        components: card.composition.components.map((c) =>
          c.label === 'Grapes' && grapes.length
            ? { ...c, detail: list(grapes) }
            : c.label === 'Region' && !placeRegion
              ? { ...c, detail: own }
              : c,
        ),
      }
    : {
        summary: `${b.colour[0]}${colourWord(b.colour).slice(1)} wine from ${own}.`,
        components: [
          { label: 'Grapes', detail: grapes.length ? list(grapes) : facts.kind === 'variety' && varietyWord ? varietyWord : 'Not published by the producer.' },
          { label: 'Region', detail: own },
          { label: 'Vinification', detail: st.vinif },
        ],
        process:
          facts.kind === 'place'
            ? `Made to the rules of ${plain} for ${colourWord(b.colour)} wine.`
            : facts.kind === 'variety'
              ? `Made from ${varietyWord} as ${article(colourWord(b.colour)).toLowerCase()} ${colourWord(b.colour)} wine.`
              : st.vinif,
      };

  incoming.push({
    id,
    name: b.n,
    category: 'wine',
    /* The family, as every wine card's is: the filters and the pour colour read it. */
    subcategory: describes ? card.subcategory : st.sub,
    description,
    abv: b.abv ?? (describes ? card.abv : st.abv),
    origin,
    rarity: card.rarity,
    tastingNotes: describes ? card.tastingNotes : st.notes,
    glassware: describes ? card.glassware : st.glass,
    funFact,
    serve: describes ? card.serve : { temp: st.temp, glass: st.glass, how: st.how, pair: st.pair },
    composition,
  });
}

/* A bottling card whose row has gone: refuse rather than leave it, or take it out silently. */
{
  const ids = new Set(incoming.map((c) => c.id));
  const gone = drinks.filter((d) => isBottling(d.id) && !ids.has(d.id));
  for (const d of gone) {
    errors.push(`${d.id} ("${d.name}"): its row has left scripts/winebranddata/; remove the card first, keeping every other number: node scripts/remove-drinks.mjs ${d.id} --keep-numbers`);
  }
}

/* ------------------------------------------------------------------ */
/* Where a bottle is: its card's region, as the app reads regions      */
/* ------------------------------------------------------------------ */

/*
 * The app works a wine's region out of its origin (dexFacets), with rules
 * a script here would only copy and drift from, so this asks the app's
 * code (scripts/lib/dex-regions.mjs). A bottle filed under a place takes
 * the first of its choices that puts it in the Region option its card is
 * in: its own region, its card's origin, then its card's name. A Brunello
 * whose row says Tuscany takes the card's "Montalcino, Italy"; the Cahors
 * card's origin says Southwest France, but the app puts a card named for
 * a region its country writes in that region, so a Cahors takes "Cahors,
 * France". A nationwide card (Sekt Austria, IGP Pays d'Oc) is in no
 * region, and its bottle keeps a region of its own only where some card
 * is in it. A fallback writes nothing the cards do not already write, so
 * this settles in a round or two; it refuses if it does not, if a bottle
 * cannot be placed, or if the bottlings move any card's own region.
 */
if (!errors.length) {
  const regionsOf = await dexRegions();
  const others = drinks.filter((d) => !isBottling(d.id));
  const before = regionsOf(others);
  const cardRegions = new Set([...before.values()].filter(Boolean));
  const byId = new Map(incoming.map((c) => [c.id, c]));
  const step = new Map(placing.map((p) => [p.id, 0]));
  /* Each round moves the bottles not yet beside their card one choice on, and nothing else; a choice is never taken back. */
  let now;
  for (let round = 0; ; round++) {
    now = regionsOf([...others, ...incoming]);
    const off = placing.filter((p) => {
      const want = before.get(p.card.id);
      const got = now.get(p.id);
      return want ? got !== want : got !== null && !cardRegions.has(got);
    });
    if (!off.length) break;
    if (round === 4) {
      for (const p of off.slice(0, 10)) errors.push(`${p.id}: not settled in its card ${p.card.name}'s Region option (${before.get(p.card.id) ?? 'none'}) after ${round + 1} rounds; it lands in ${now.get(p.id)}`);
      break;
    }
    for (const p of off) {
      const next = before.get(p.card.id) ? p.choices[step.get(p.id) + 1] : p.card.origin;
      if (next == null || next === byId.get(p.id).origin) {
        errors.push(`${p.id}: no origin puts it in its card ${p.card.name}'s Region option (${before.get(p.card.id) ?? 'none'}); it lands in ${now.get(p.id)}`);
        continue;
      }
      step.set(p.id, step.get(p.id) + 1);
      byId.get(p.id).origin = next;
    }
    if (errors.length) break;
  }
  /* And no card that is not a bottle is in another region for the bottles' being there. */
  const moved = others.filter((d) => d.category === 'wine' && now.get(d.id) !== before.get(d.id));
  for (const d of moved.slice(0, 10)) errors.push(`${d.id} ("${d.name}"): the bottlings move this card from Region ${before.get(d.id)} to ${now.get(d.id)}`);
}
for (const c of incoming) {
  if (c.origin === ownOf.get(c.id)) stats.ownRegion++;
  else stats.cardRegion++;
}

/* ---- validate, merge, gate — all shared (scripts/lib/dex-merge.mjs) ---- */

const report = validate({ drinks, incoming, category: 'wine', owner: OWNER });
reportAndGate({ ...report, errors: [...errors, ...report.errors] });

const { out, added, fresh, refreshed } = merge({ drinks, incoming });

const problems = assertShapePreserved({ before: drinks, after: out, category: 'wine' });
if (problems.length) {
  console.error(`\n${OWNER}: the merge changed rows it does not own — nothing written:\n`);
  for (const p of problems.slice(0, 20)) console.error('  ' + p);
  process.exit(1);
}

if (dry) {
  console.log(`dry run — would write ${out.length} entries (${fresh} new, ${refreshed} refreshed)`);
} else {
  writeFileSync(DRINKS, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${out.length} entries — ${fresh} new, ${refreshed} refreshed`);
}
const files = new Set(brands.map((b) => b.file)).size;
console.log(`  wine bottlings: ${incoming.length} from ${files} source files, filed under ${perStyle.size} cards`);
console.log(`  dex ${Math.min(...added.map((a) => a.dexNumber))}–${Math.max(...added.map((a) => a.dexNumber))}`);
console.log(`  words: ${stats.describes} take their card's, ${stats.colourWords} their colour's`);
console.log(`  origin: ${stats.ownRegion} their own region, ${stats.cardRegion} their appellation's`);
const withAtlasGrapes = brands.filter((b) => cards.has(b.s) && atlasGrapes(b, idx, styleFacts(cards.get(b.s), idx)).length).length;
console.log(`  grapes: ${withAtlasGrapes} bottles name grapes the atlas knows; ${stats.unmatchedGrapes.size} names it does not (kept on the card, not in the Grape filter)`);
