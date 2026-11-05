/**
 * The wine bottlings (scripts/winebranddata/, v4.15), read one way by every
 * script that needs them: merge-wine-brands.mjs writes them as cards,
 * build-wine-atlas-links.mjs puts them on the map, and
 * specs/v4.15/wine-bottles.test.mjs checks both.
 *
 * A row is a bottle: { n, s, c, region?, colour, grapes?, abv?, note?, src }.
 * `s` names the wine card it is filed under, by its exact Dex name: an atlas
 * appellation ("Pauillac"), an authored region or style ("Champagne",
 * "Mendoza", "Bordeaux Blend") or a grape ("Chardonnay"). What that card is
 * decides what a bottle may take from it, so the reading of a card lives
 * here (styleFacts), once.
 */

import { readdirSync, readFileSync } from 'node:fs';

import { fold } from './dex-merge.mjs';

const SRC = new URL('../winebranddata/', import.meta.url);

/** Every row, file by file in name order, row by row: the order the numbers follow. */
export function loadWineBrands() {
  return readdirSync(SRC)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((file) => JSON.parse(readFileSync(new URL(file, SRC), 'utf8')).map((b) => ({ ...b, file })));
}

/** A bottling's id: its name folded, `-wb`, as the spirit layer's are `-sb`. */
export const bottlingId = (b) => `${fold(b.n)}-wb`;
export const isBottling = (id) => id.endsWith('-wb');

/** The cards a bottling may be filed under: every wine card but the bottlings, by exact name. */
export function styleCards(drinks) {
  return new Map(drinks.filter((d) => d.category === 'wine' && !isBottling(d.id)).map((d) => [d.name, d]));
}

/* ------------------------------------------------------------------ */
/* The atlas, looked up by name                                        */
/* ------------------------------------------------------------------ */

const loose = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Wine and grape lookups over the atlas, as build-wine-atlas-links.mjs
 * resolves them: a wine by its exact name, then without a Dex qualifier
 * ("Faro (Sicily)" is Faro); a grape by its name or a synonym, exact then
 * accent-folded, so "Shiraz" is Syrah and "Pinot Grigio" Pinot Gris.
 */
export function atlasIndex(atlas) {
  const wines = new Map(atlas.wines.map((w) => [w.n, w]));
  const exactGrape = new Map();
  const looseGrape = new Map();
  for (const g of atlas.grapes) {
    for (const n of [g.name, ...g.synonyms]) {
      if (!exactGrape.has(n)) exactGrape.set(n, g.name);
      if (!looseGrape.has(loose(n))) looseGrape.set(loose(n), g.name);
    }
  }
  const byName = new Map(atlas.grapes.map((g) => [g.name, g]));
  const names = new Set(atlas.grapes.map((g) => loose(g.name)));
  const wine = (name) => wines.get(name) ?? wines.get(name.replace(/\s*\(.*$/, '').trim()) ?? null;
  const grape = (name) => exactGrape.get(name) ?? looseGrape.get(loose(name)) ?? null;
  /** Whether a name is a grape's own, not only some grape's synonym ("Grenache" is; "Trebbiano" and "Bonarda" are not). */
  const isGrapeName = (name) => names.has(loose(name));
  const synonymsOf = (name) => byName.get(name)?.synonyms ?? [];
  /** Every grape whose name begins with this one as a word: "Bonarda" begins Bonarda Argentina and Bonarda Piemontese. */
  const grapesBeginning = (name) => atlas.grapes.map((g) => g.name).filter((n) => loose(n).startsWith(`${loose(name)} `));
  const country = (w) => atlas.countries[w.c].name;
  const grapesOf = (w) => (w.g ?? []).map((i) => atlas.grapes[i].name);
  return { wine, grape, isGrapeName, synonymsOf, grapesBeginning, country, grapesOf };
}

/* ------------------------------------------------------------------ */
/* What a card is                                                      */
/* ------------------------------------------------------------------ */

/** A card's family as a colour, the atlas's word for it (STYLE's keys). */
const FAMILY_COLOUR = {
  'Regional Red': 'Red',
  'Red Varietal': 'Red',
  White: 'White',
  Rosé: 'Rosé',
  'Skin-Contact': 'Orange',
  Sparkling: 'Sparkling',
  Dessert: 'Sweet White',
  'Fortified Wine': 'Fortified',
};

/**
 * The authored cards whose words are written for colours their family
 * does not say. Moscato d'Asti is filed Dessert and is frizzante, and the
 * atlas styles that wine Sparkling, as the research did its ten bottles:
 * both are what the card describes. Two of v4.16's styles
 * (specs/v4.16/style-cards.md) are filed Dessert, where STYLE files every
 * sweet wine: Sweet Red, whose words are a sweet red's alone, so a sweet
 * white filed under it would take the sweet white's words rather than
 * the red's; and New World Moscato, whose words are written for its pink
 * and red bottles as well as the white (STYLE's sweet-red words are a
 * dessert wine's, dried fig and cocoa at cellar temperature, not a light
 * Moscato's).
 */
const COLOURS_OF = {
  "Moscato d'Asti": ['Sweet White', 'Sparkling'],
  'Sweet Red': ['Sweet Red'],
  'New World Moscato': ['Sweet White', 'Sweet Rosé', 'Sweet Red'],
};

/**
 * Where a card written for several colours words one of them apart.
 * New World Moscato's tasting notes are the white's (orange blossom,
 * honey); the pink and the red take a dash of red wine and taste of red
 * berries, as the card's description says and their producers write
 * (Barefoot's cherries and raspberries, Sutter Home's and [yellow
 * tail]'s strawberry). Its serve is written for all three.
 */
const NOTES_OF = {
  'New World Moscato': {
    'Sweet Rosé': ['muscat grape', 'strawberry', 'raspberry', 'cherry'],
    'Sweet Red': ['muscat grape', 'strawberry', 'raspberry', 'cherry'],
  },
};

/** The tasting notes a bottle of this colour takes from a card whose words describe it. */
export const cardNotes = (card, colour) => NOTES_OF[card.name]?.[colour] ?? card.tastingNotes;

/**
 * Atlas tiers that name a grape or a recipe, not a place: a Brazilian
 * Tannat is a Tannat however Uruguay's national varietal is filed, and
 * Meritage is a blend sold from California to Ontario.
 */
const NOT_A_PLACE = new Set(['Grape wine', 'Varietal style', 'Trademark blend']);

/**
 * The one grape an authored card's words are written for, when its Grapes
 * line says so outright: a grape alone ("Pinot Noir."), only or alone
 * ("Nebbiolo only"), or before ", with" ("Cabernet Sauvignon, often with
 * Merlot…"). Napa Valley's words are about Cabernet, Marlborough's about
 * Sauvignon Blanc, Mendoza's about Malbec.
 *
 * A list of equals has none (Champagne's "Chardonnay, Pinot Noir and
 * Meunier", Cava's three), and neither does a line that leads with a
 * share ("Tempranillo mainly", "Grenache-dominant", "Furmint led"): the
 * qualifier stops the name resolving, so a Garnacha Rioja and a
 * Mourvèdre-heavy Châteauneuf keep their card's words, which are about the
 * place's wine, not one grape in it.
 */
function hardLead(detail, idx) {
  const m = String(detail ?? '').match(/^([^,;.(]+?)(?:\s+(?:only|alone)\b|;|\.\s*$|,\s*(?:often\s+|usually\s+|sometimes\s+)?with\b)/);
  return m ? idx.grape(m[1].trim()) : null;
}

/**
 * What a bottle may take from the card it is filed under:
 *
 *  - kind: 'place' (an appellation or region: the bottle must be from its
 *    country), 'variety' (a grape card), or 'style' (a recipe made
 *    anywhere: Bordeaux Blend, Orange Wine, Pét-Nat, Provence Rosé);
 *  - atlasWine: the atlas wine a place is, for its region and country;
 *  - grape: the variety a variety card is;
 *  - colours: the colours the card's own words describe. A generated
 *    (-wn) card says what the atlas says; an authored card says what its
 *    family says, because its words were written for that family: the
 *    Niagara Peninsula card is about icewine, whatever else the atlas
 *    files there (or COLOURS_OF says, where they were written for others);
 *  - lead: the grape the card's words are about, if any (hardLead; a
 *    variety card's is its variety). A generated card's words are its
 *    colour's and have none.
 */
export function styleFacts(card, idx) {
  const generated = card.id.endsWith('-wn');
  const named = idx.wine(card.name);
  const variety = named ? null : idx.grape(card.name) ?? (card.name.includes(' / ') ? idx.grape(card.name.split(' / ')[0]) : null);
  const kind = variety || (named && NOT_A_PLACE.has(named.t)) ? 'variety' : named ? 'place' : 'style';
  /* A national varietal (Uruguay's Tannat) is its one grape; Meritage is several, and none. */
  const grape = variety ?? (kind === 'variety' && named?.g?.length === 1 ? idx.grapesOf(named)[0] : null);
  const colours = new Set(generated && named ? [named.s] : (COLOURS_OF[card.name] ?? [FAMILY_COLOUR[card.subcategory]]));
  const grapesLine = card.composition?.components?.find((c) => c.label === 'Grapes')?.detail;
  const lead = generated ? null : kind === 'variety' ? grape : hardLead(grapesLine, idx);
  return { kind, atlasWine: named, grape, colours, lead };
}

/**
 * A bottle's grapes as the atlas names them, where it does; the rest are
 * left to the card's Grapes line.
 *
 * Read against the card first, then the atlas at large. A name that is no
 * grape's own, only a synonym, means different grapes in different places:
 * "Bonarda" is the atlas's Croatina, Lombardy's, but an Argentine Bonarda
 * is Bonarda Argentina, and "Trebbiano" is Trebbiano Toscano at large but
 * Trebbiano Abruzzese in Abruzzo (v4.15's review: El Enemigo's and
 * Zuccardi's Bonardas were under Grape: Croatina). So such a name, under a
 * grape card whose variety it begins, is that variety; else the one grape
 * it begins that is named for the bottle's country (a Bonarda from Santa
 * Rosa, Mendoza, is Bonarda Argentina, though the atlas files Santa
 * Rosa's Bonarda as Croatina); else, under a place, the grape the place
 * permits, or the one whose name or synonym it begins. A grape's own name
 * ("Grenache", "Pinot Noir") is always that grape.
 */
export function atlasGrapes(b, idx, facts) {
  const begins = (name, g) => loose(name) === loose(g) || loose(name).startsWith(`${loose(g)} `);
  const permitted = facts?.kind === 'place' ? idx.grapesOf(facts.atlasWine) : [];
  const one = (g) => {
    const at = idx.grape(g);
    if (idx.isGrapeName(g)) return at;
    if (facts?.kind === 'variety' && facts.grape) {
      if (at === facts.grape) return at;
      if (begins(facts.grape, g)) return facts.grape;
    }
    const national = idx.grapesBeginning(g).filter((n) => loose(n).endsWith(` ${loose(b.c)}`));
    if (national.length === 1) return national[0];
    if (permitted.includes(at)) return at;
    const hits = permitted.filter((p) => [p, ...idx.synonymsOf(p)].some((n) => begins(n, g)));
    return hits.length === 1 ? hits[0] : at;
  };
  return [...new Set((b.grapes ?? []).map(one).filter(Boolean))];
}

/**
 * Whether the card's own words describe this bottle: the bottle is one of
 * the colours the card is written for, and, where the card is written for
 * one grape, the bottle is made from it (or does not say). Where they do
 * not, the bottle takes its colour's words (scripts/lib/wine-styles.mjs)
 * instead of a card written for something else: a white Côtes de Provence
 * is not served like the rosé, nor a Napa Merlot tasted like the Cabernet.
 */
export function cardDescribes(b, facts, idx) {
  if (!facts.colours.has(b.colour)) return false;
  if (!facts.lead || !(b.grapes ?? []).length) return true;
  return atlasGrapes(b, idx, facts).includes(facts.lead);
}
