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
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { validate, merge, assertShapePreserved, reportAndGate } from './lib/dex-merge.mjs';

const ROOT = new URL('../', import.meta.url);
const DRINKS = new URL('src/data/drinks.json', ROOT);
const ATLAS = new URL('src/data/wineAtlas.json', ROOT);
const dry = process.argv.includes('--dry');

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const atlas = JSON.parse(readFileSync(ATLAS, 'utf8'));

const fold = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ------------------------------------------------------------------ */
/* Style → how you actually treat the wine                             */
/*                                                                     */
/* Keyed on the atlas's own `s` field. Everything here is true of the  */
/* STYLE, which is the same basis the authored wine cards use — a      */
/* sparkling wine is served cold in a flute whoever made it.           */
/* ------------------------------------------------------------------ */

const STYLE = {
  Red: {
    sub: 'Regional Red', glass: 'Red wine glass', abv: '12.5–14.5%',
    temp: '60-65°F, cool room temperature',
    notes: ['red fruit', 'tannin', 'earth', 'oak'],
    pair: ['Roast meats', 'Hard cheese', 'Mushroom dishes'],
    how: 'Pour into a large bowl and give it air — most reds are built to open up rather than to be drunk the moment the cork is out. Serve cooler than the room actually is; at true room temperature the alcohol comes forward and the fruit flattens.',
    vinif: 'Fermented on the skins for colour and tannin, then aged in oak or steel depending on the house.',
  },
  White: {
    sub: 'White', glass: 'White wine glass', abv: '11.5–13.5%',
    temp: '45-50°F, well chilled',
    notes: ['citrus', 'orchard fruit', 'mineral', 'crisp acidity'],
    pair: ['White fish', 'Goat cheese', 'Salads'],
    how: 'Chill it properly but not to numbness — under about 45°F the aromatics shut down and you taste only cold. Pour small and let the glass warm in your hand between sips; a white that tastes of nothing straight from the fridge often blooms after ten minutes.',
    vinif: 'Pressed off the skins before fermentation, then fermented cool to keep the aromatics.',
  },
  Rosé: {
    sub: 'Rosé', glass: 'White wine glass', abv: '11.5–13%',
    temp: '45-50°F, well chilled',
    notes: ['strawberry', 'citrus peel', 'dry finish'],
    pair: ['Charcuterie', 'Grilled vegetables', 'Seafood'],
    how: 'Serve it cold and drink it young. Rosé is one of the few wines where the current vintage is almost always the right one, and a bottle kept for a special occasion is usually a bottle wasted.',
    vinif: 'Brief skin contact — hours, not days — for colour, then fermented like a white.',
  },
  Sparkling: {
    sub: 'Sparkling', glass: 'Champagne flute', abv: '11.5–12.5%',
    temp: '43-47°F, well chilled',
    notes: ['green apple', 'brioche', 'citrus', 'fine bead'],
    pair: ['Oysters', 'Fried food', 'Almonds'],
    how: 'Chill hard, open quietly — the loud pop wastes pressure that should end up in the glass. Pour against the side and let the foam settle rather than filling in one go.',
    vinif: 'A base wine taken through a second fermentation that traps its own carbon dioxide.',
  },
  'Sparkling Rosé': {
    sub: 'Sparkling', glass: 'Champagne flute', abv: '11.5–12.5%',
    temp: '43-47°F, well chilled',
    notes: ['red berry', 'brioche', 'citrus', 'fine bead'],
    pair: ['Charcuterie', 'Salmon', 'Berry desserts'],
    how: 'Treat it exactly like any other sparkling wine: hard chill, quiet opening, poured against the glass. The colour comes from brief skin contact, not from anything that changes how you serve it.',
    vinif: 'A rosé base wine taken through a second fermentation in bottle or tank.',
  },
  'Sparkling Red': {
    sub: 'Sparkling', glass: 'Red wine glass', abv: '11–13%',
    temp: '50-55°F, lightly chilled',
    notes: ['blackberry', 'plum', 'soft tannin', 'foam'],
    pair: ['Cured meats', 'Rich pasta', 'Chocolate'],
    how: 'Chill it less than a white sparkling — the tannin turns harsh when it is too cold. Pour into a proper wine glass rather than a flute so the fruit has room.',
    vinif: 'A red base wine refermented to trap carbon dioxide, often finished off-dry.',
  },
  'Sweet White': {
    sub: 'Dessert', glass: 'Small dessert wine glass', abv: '9–14%',
    temp: '43-47°F, well chilled',
    notes: ['honey', 'apricot', 'candied citrus', 'bright acidity'],
    pair: ['Blue cheese', 'Fruit tarts', 'Foie gras'],
    how: 'Pour two or three ounces, no more — this is concentrated and a full glass defeats it. Serve cold enough that the acidity stays sharp against the sugar, which is what stops a sweet wine tasting like syrup.',
    vinif: 'Sugar concentrated in the fruit — by botrytis, freezing or drying — then fermented only part way.',
  },
  'Sweet Red': {
    sub: 'Dessert', glass: 'Small dessert wine glass', abv: '10–15%',
    temp: '55-60°F, cellar cool',
    notes: ['dried fig', 'cherry', 'cocoa', 'sweet finish'],
    pair: ['Dark chocolate', 'Aged cheese', 'Nut tarts'],
    how: 'Serve cooler than a dry red but warmer than a white dessert wine, and pour small. The sweetness carries a long way and a modest glass lasts a whole course.',
    vinif: 'Fermentation halted with sugar remaining, sometimes from dried or late-picked fruit.',
  },
  'Sweet Rosé': {
    sub: 'Dessert', glass: 'White wine glass', abv: '9–12%',
    temp: '43-47°F, well chilled',
    notes: ['strawberry', 'candied citrus', 'sweet finish'],
    pair: ['Fruit desserts', 'Spicy food', 'Soft cheese'],
    how: 'Cold, small pours, and young. Its whole appeal is fresh sweet fruit, and neither age nor warmth does it any favours.',
    vinif: 'Brief skin contact for colour, with fermentation stopped while sugar remains.',
  },
  Fortified: {
    sub: 'Fortified Wine', glass: 'Copita', abv: '15–22%',
    temp: '55-60°F, cellar cool',
    notes: ['dried fruit', 'nut', 'caramel', 'spirit warmth'],
    pair: ['Aged cheese', 'Nuts', 'Dried fruit'],
    how: 'Pour a small measure into something with a narrow rim so the aromatics gather. Fortified wine keeps for weeks after opening where a table wine would not, so there is no need to finish the bottle.',
    vinif: 'Grape spirit added during or after fermentation, raising strength and often leaving sugar behind.',
  },
  'Vin Jaune': {
    sub: 'White', glass: 'White wine glass', abv: '13.5–15%',
    temp: '55-60°F, cellar cool',
    notes: ['walnut', 'curry spice', 'green apple', 'salt'],
    pair: ['Comté', 'Chicken in cream', 'Walnuts'],
    how: 'Serve it far warmer than an ordinary white — cold mutes the walnut and spice that are the entire point. Open it well ahead; this is a wine that rewards an hour in the glass.',
    vinif: 'Aged years under a film of yeast in a barrel deliberately left unfilled.',
  },
  Orange: {
    sub: 'Skin-Contact', glass: 'White wine glass', abv: '11.5–13.5%',
    temp: '50-55°F, lightly chilled',
    notes: ['dried apricot', 'tea tannin', 'nut', 'grip'],
    pair: ['Spiced dishes', 'Hard cheese', 'Roast vegetables'],
    how: 'Treat it like a light red rather than a white: barely chilled, in a glass with some bowl. It has tannin, and tannin served ice-cold turns to grit.',
    vinif: 'White grapes fermented on their skins for days or months, taking colour and tannin.',
  },
  Various: {
    sub: 'Regional Red', glass: 'Wine glass', abv: 'Varies by producer',
    temp: '50-60°F, depending on style',
    notes: ['varies by producer'],
    pair: ['Depends what is in the bottle'],
    how: 'This denomination covers more than one style, so the bottle in front of you decides. Check the label for colour and sweetness and treat it accordingly.',
    vinif: 'Varies — the denomination permits several styles.',
  },
};

/* ------------------------------------------------------------------ */

const countries = atlas.countries;
const grapes = atlas.grapes;

const takenNames = new Map(
  drinks.filter((d) => !d.id.endsWith('-wn')).map((d) => [fold(d.name), d.name])
);

/*
 * Wines the Dex already carries as authored cards. 135 atlas entries share a
 * name with one — Barolo, Champagne, Rioja, Sauternes — and generating those
 * would put the same wine in the Dex twice: once hand-written with real
 * tasting copy, once derived and thinner, distinguished only by a bracketed
 * region. The authored card wins; the atlas entry is skipped.
 */
const AUTHORED_WINES = new Set(
  drinks.filter((d) => d.category === 'wine' && !d.id.endsWith('-wn')).map((d) => fold(d.name))
);

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
const cards = atlas.wines.filter((w) => !AUTHORED_WINES.has(fold(w.n))).map((w) => {
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

  return {
    id: `${fold(w.n)}-${fold(country.name)}-wn`,
    name: uniqueName(w, country),
    category: 'wine',
    subcategory: st.sub,
    description:
      `${w.t === 'Regional' || w.t === 'Grape wine' ? 'A' : `A ${w.t}`} ${w.s.toLowerCase()} wine from ` +
      `${w.r}, ${dexCountry(country.name)}. ${grapeClause}`,
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
console.log(`  wine cards: ${cards.length}  |  dex ${Math.min(...added.map((a) => a.dexNumber))}–${Math.max(...added.map((a) => a.dexNumber))}`);
