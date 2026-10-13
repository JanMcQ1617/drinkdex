#!/usr/bin/env node
/*
 * Reference implementation of the onboarding recommender (spec.md §5).
 *
 * v4.2 (specs/v4.2/spec.md §1.2 and Decided 5). The v4-onboarding reference plus: the seventh
 * flavour, `fruity` (FLAVOURS, LIKE, barRows' extras); the `noteAbvMax` strength cap, on fruity
 * and on sour (above 30% abv only the family counts); and `flavourHit` / `spiritHits` exported
 * for the Dex's taste filters and its For-you order (tools/dex-order.mjs). Nothing else differs.
 * Runs A, C and D give the v4-onboarding output; run B's flavour card reads 147 where it read
 * 149 (La Bandera and Bandera, 40% tequila shots that only say lime, left sour), with the same
 * six picks. This file REPLACED specs/v4-onboarding/tools/recommend.mjs: the two are the same
 * file, byte for byte, and scripts/check-recommend.mjs fails if they part.
 *
 * Plain JS over the repo's own data, so the example runs in spec.md are the
 * real output, not invented. src/lib/recommend.ts ports this line for line
 * (it reads the same files through @/data, @/data/drinkPhotos and @/lib/bar).
 *
 *   node specs/v4.2/tools/recommend.mjs                    # prints the example runs
 *   node specs/v4-onboarding/tools/recommend.mjs --write   # also writes ../data/example.js beside
 *                                                          # the copy run (v4-onboarding's mockups)
 *
 * DETERMINISTIC: no randomness, no clock. Ties go to the lower Dex number.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const DRINKS = JSON.parse(readFileSync(join(ROOT, 'src/data/drinks.json'), 'utf8'));
const BAR = JSON.parse(readFileSync(join(ROOT, 'src/data/barIndex.json'), 'utf8'));
const PHOTOS = new Set(
  [...readFileSync(join(ROOT, 'src/data/drinkPhotos.ts'), 'utf8').matchAll(/'([a-z0-9-]+)': require/g)].map((m) => m[1]),
);
/** lib/tastes FIRST_TASTES: 24 curated classics a new person has likely ordered. The "well known" signal. */
const KNOWN_ORDER = (
  [...(readFileSync(join(ROOT, 'src/lib/tastes.ts'), 'utf8').match(/const IDS = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
);
const KNOWN = new Set(KNOWN_ORDER);
/** Tie-break: the curated order (Piña Colada first), then Dex number. */
const knownRank = (id) => (KNOWN.has(id) ? KNOWN_ORDER.indexOf(id) : 99);
const ING = Object.fromEntries(BAR.ingredients.map((i) => [i.id, i]));
const RECIPE = Object.fromEntries(BAR.recipes.map((r) => [r.id, r]));
const BY_ID = Object.fromEntries(DRINKS.map((d) => [d.id, d]));

/* ------------------------------------------------------------------ */
/* The answers                                                         */
/* ------------------------------------------------------------------ */

/** The seven spirit choices and what each means in the catalogue. */
export const SPIRITS = {
  gin: { label: 'gin', family: 'gin', subcats: ['Gin', 'Genever'] },
  rum: { label: 'rum', family: 'rum', subcats: ['Rum', 'Cane Spirit'], extraIds: ['cachaca'] },
  agave: { label: 'tequila', family: 'tequila', subcats: ['Agave'] },
  whiskey: { label: 'whiskey', family: 'whiskey', subcats: ['American Whiskey', 'Scotch', 'Irish Whiskey', 'World Whisky'] },
  vodka: { label: 'vodka', family: 'vodka', subcats: ['Vodka'] },
  brandy: { label: 'brandy', family: 'brandy', subcats: ['Brandy', 'Fruit Brandy', 'Pomace Brandy'] },
  liqueur: { label: 'liqueurs', family: null, subcats: ['Liqueur', 'Amaro', 'Herbal Liqueur'] },
};

/** The follow-up, asked for the FIRST of whiskey, rum, agave that was picked. */
export const STYLES = {
  whiskey: {
    bourbon: { label: 'bourbon', ids: ['bourbon', 'tennessee-whiskey'], spirit: (d) => d.subcategory === 'American Whiskey' && !/rye/.test(d.id) },
    rye: { label: 'rye', ids: ['rye-whiskey', 'canadian-rye-whisky'], spirit: (d) => /rye/.test(d.id) },
    scotch: { label: 'Scotch', ids: ['scotch-whisky'], spirit: (d) => d.subcategory === 'Scotch' },
    irish: { label: 'Irish whiskey', ids: ['irish-whiskey'], spirit: (d) => d.subcategory === 'Irish Whiskey' },
    japanese: { label: 'Japanese whisky', ids: ['japanese-whisky'], spirit: (d) => d.subcategory === 'World Whisky' && /Japan/.test(d.origin) },
  },
  rum: {
    white: { label: 'white rum', ids: ['white-rum', 'aged-white-rum'], spirit: (d) => d.subcategory === 'Rum' && /white|blanc|light|silver/.test(d.id) },
    aged: { label: 'aged rum', ids: ['aged-rum', 'gold-rum', 'dark-rum', 'demerara-rum', 'jamaican-rum', 'blackstrap-rum'], spirit: (d) => d.subcategory === 'Rum' && !/white|blanc|light|silver|spiced/.test(d.id) },
    agricole: { label: 'agricole', ids: ['rhum-agricole', 'cachaca'], spirit: (d) => d.subcategory === 'Cane Spirit' || /agricole|cachaca/.test(d.id) },
    spiced: { label: 'spiced rum', ids: ['spiced-rum'], spirit: (d) => /spiced/.test(d.id) },
  },
  agave: {
    blanco: { label: 'blanco tequila', ids: ['silver-tequila', 'tequila'], spirit: (d) => /tequila-(blanco|plata|silver)/.test(d.id) },
    reposado: { label: 'reposado', ids: ['reposado-tequila'], spirit: (d) => /reposado/.test(d.id) && /tequila/.test(d.id) },
    anejo: { label: 'añejo', ids: ['anejo-tequila'], spirit: (d) => /anejo/.test(d.id) && /tequila/.test(d.id) },
    mezcal: { label: 'mezcal', ids: ['mezcal'], spirit: (d) => /mezcal/.test(d.id) },
  },
};

/** The seven flavour choices: the style families that ARE it, and the note words that SAY it. */
export const FLAVOURS = {
  refreshing: {
    label: 'refreshing',
    subcats: ['Highball', 'Spritz', 'Fizz', 'Julep & Cobbler', 'Sparkling', 'Frozen'],
    notes: ['mint', 'cucumber', 'soda', 'tonic', 'quinine', 'ginger', 'effervescence', 'sparkling', 'crisp', 'refreshing', 'prosecco', 'grapefruit', 'light citrus', 'clean'],
    abvMax: 15,
  },
  // v4.2 Decided 5 (Jan, 13 Oct 2026): the strength cap fruity has. Above 30% only the family
  // (Sour) says it, so a bare 40% bottle whose notes say "citrus" or "lemon" (Tequila Blanco,
  // Ouzo, Cognac VS, White Rum) is not a sour, while a Daiquiri is (its family) and a Paloma or
  // a 20% Ginjinha still are (their notes).
  sour: {
    label: 'sour',
    subcats: ['Sour'],
    notes: ['lime', 'lemon', 'citrus', 'tart', 'sour', 'grapefruit', 'yuzu', 'sour cherry', 'passionfruit'],
    noteAbvMax: 30,
  },
  // v4.2 (Jan, 13 Oct 2026: "fruity or sour"). Fruit that is not citrus: citrus is sour's. The
  // fruit-led families, the fresh-fruit note words (never the dried and sherried notes a whisky
  // carries, nor the maraschino cherry on every Manhattan) and the fruit juices, purees and fruit
  // liqueurs a recipe names. noteAbvMax 30: above 30% only the family counts, so a 40% bottle
  // that only SAYS fruit ("orchard fruit" on a Speyside) is 0, while a fruit brandy or a 16%
  // Chambord is fruity (v4.2 spec §1.2).
  fruity: {
    label: 'fruity',
    subcats: ['Tiki & Tropical', 'Punch & Cobbler', 'Fruit Brandy'],
    notes: ['apple', 'pineapple', 'banana', 'peach', 'pear', 'apricot', 'raspberry', 'strawberry', 'cranberry', 'blackcurrant', 'pomegranate', 'passionfruit', 'passion fruit', 'mango', 'berry', 'red fruit', 'red berry', 'stone fruit', 'tropical fruit', 'green apple', 'melon', 'plum', 'lychee', 'sour cherry', 'tart berry', 'tart plum', 'ripe pear', 'ripe banana', 'orchard fruit', 'baked apple', 'cider', 'sloe', 'watermelon', 'guava', 'jam', 'juicy', 'blackberry', 'bramble jam', 'berries', 'red berries', 'tart fruit', 'tart red fruit', 'sloe berry', 'ripe peach', 'white peach', 'muskmelon', 'honeydew melon', 'guavaberry', 'cloudberry', 'tropical'],
    ids: ['pineapple-juice', 'cranberry-juice', 'apple-juice', 'cloudy-apple-juice', 'passionfruit-juice', 'passion-fruit-puree', 'passionfruit-syrup', 'strawberries', 'strawberry-puree', 'pineapple', 'banana', 'peaches', 'white-peach-puree', 'raspberry-syrup', 'raspberry-cordial', 'creme-de-cassis', 'chambord', 'creme-de-mure', 'blackberry-liqueur', 'peach-schnapps', 'peach-liqueur', 'apricot-liqueur', 'pear-liqueur', 'melon-liqueur', 'banana-liqueur', 'creme-de-banana', 'cherry-liqueur', 'cherry-heering', 'passion-fruit-liqueur', 'sloe-gin', 'sour-apple-schnapps', 'mango-juice', 'guava-juice', 'papaya-juice', 'pomegranate-juice', 'blackcurrant-juice', 'blackcurrant-cordial', 'watermelon', 'papaya', 'mixed-fruit', 'seasonal-fruit', 'seasonal-berries', 'chopped-fruit', 'green-grapes'],
    noteAbvMax: 30,
  },
  sweet: {
    label: 'sweet',
    subcats: ['Creamy & Dessert', 'Tiki', 'Tiki & Tropical'],
    notes: ['sweet', 'vanilla', 'honey', 'caramel', 'toffee', 'butterscotch', 'chocolate', 'brown sugar', 'molasses', 'coconut', 'pineapple', 'tropical fruit', 'condensed milk', 'marzipan', 'candy', 'jam'],
  },
  bitter: {
    label: 'bitter',
    subcats: ['Amaro'],
    notes: ['bitter', 'bitter orange', 'bitters', 'gentian', 'bitter herbs', 'bitter herb', 'bitter root', 'quinine', 'wormwood', 'artichoke', 'rhubarb', 'dark chocolate'],
    ids: ['campari', 'aperol', 'fernet-branca', 'cynar'],
  },
  strong: {
    label: 'strong',
    subcats: ['Spirit-Forward'],
    notes: ['rye spice', 'charred oak', 'heat', 'clean heat', 'sharp heat'],
    abvMin: 25,
  },
  creamy: {
    label: 'creamy',
    subcats: ['Creamy & Dessert'],
    notes: ['cream', 'egg', 'foam', 'milk', 'condensed milk', 'butter', 'coconut', 'velvety'],
    ids: ['egg-white', 'cream', 'heavy-cream', 'irish-cream'],
  },
};

/* ------------------------------------------------------------------ */
/* Facts about a drink, worked out once                                */
/* ------------------------------------------------------------------ */

/** "16–18%" → 17; "40%" → 40; unknown → null. */
export function abvOf(d) {
  const nums = String(d.abv ?? '').match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length === 0) return null;
  return nums.length === 1 ? nums[0] : (nums[0] + nums[1]) / 2;
}

/** Every recipe ingredient id, generics included. */
function idsOf(d) {
  return new Set((RECIPE[d.id]?.slots ?? []).flat());
}

/** The first spirits-shelf bottle's family (lib/bar baseSpirit), or 'none'. */
export function baseSpirit(d) {
  for (const slot of RECIPE[d.id]?.slots ?? []) {
    const s = slot.map((id) => ING[id]).find((i) => i?.shelf === 'spirits');
    if (s) return s.family ?? 'other';
  }
  return 'none';
}

/** Which spirit choices a drink is, and whether it is the drink's base or only in it. */
export function spiritHits(d) {
  const hits = new Map(); // choice → 1 (base / the bottle itself) | 0.6 (in it)
  if (d.category === 'spirit') {
    for (const [k, s] of Object.entries(SPIRITS)) if (s.subcats.includes(d.subcategory)) hits.set(k, 1);
    return hits;
  }
  const base = baseSpirit(d);
  const ids = idsOf(d);
  for (const [k, s] of Object.entries(SPIRITS)) {
    if (s.family && s.family === base) hits.set(k, 1);
    else if (s.family && [...ids].some((id) => ING[id]?.family === s.family)) hits.set(k, 0.6);
    else if (s.extraIds?.some((id) => ids.has(id))) hits.set(k, base === 'other' ? 1 : 0.6);
  }
  if ([...ids].some((id) => ING[id]?.category === 'liqueur')) hits.set('liqueur', Math.max(hits.get('liqueur') ?? 0, base === 'none' ? 1 : 0.6));
  return hits;
}

/** 0, 0.5 or 1: how plainly a drink is this flavour. */
export function flavourHit(d, f) {
  const F = FLAVOURS[f];
  const abv = abvOf(d);
  if (F.subcats.includes(d.subcategory)) return 1;
  if (F.abvMin && abv !== null && abv >= F.abvMin) return 1; // every spirit is strong; so is a stirred 28% cocktail
  if (F.noteAbvMax && abv !== null && abv > F.noteAbvMax) return 0; // v4.2 (fruity, sour): past this, only the family says it
  const notes = (d.tastingNotes ?? []).map((n) => n.toLowerCase());
  const said = notes.filter((n) => F.notes.includes(n)).length;
  const ids = idsOf(d);
  const named = F.ids?.some((id) => ids.has(id)) ? 1 : 0;
  let s = Math.min(1, 0.5 * (said + named));
  if (F.abvMax && abv !== null && abv > F.abvMax + 10) s = Math.min(s, 0.5); // a 35% "refreshing" is not
  return s;
}

const CLASSIC = { common: 1, uncommon: 0.6, rare: 0.25, legendary: 0 };

/* ------------------------------------------------------------------ */
/* Bar                                                                 */
/* ------------------------------------------------------------------ */

/** Slots unmet with this bar (lib/bar matchBar): 0 = you can make it now. */
function missingCount(d, bar) {
  const r = RECIPE[d.id];
  if (!r || bar.size === 0) return Infinity;
  return r.slots.filter((slot) => !slot.some((id) => bar.has(id))).length;
}

/** How many cocktails this bar makes (the bar screen's feedback card). */
export function makeableCount(barIds) {
  const bar = new Set(barIds);
  return DRINKS.filter((d) => missingCount(d, bar) === 0).length;
}

/** The bar checklist's eight rows and which start ticked (spec §3, step 10). */
export function barRows(answers) {
  const spiritIds = { gin: 'gin', rum: 'white-rum', agave: 'tequila', whiskey: 'bourbon', vodka: 'vodka', brandy: 'cognac', liqueur: 'campari' };
  const style = answers.styles?.[0];
  const styleId = style && answers.styleOf ? STYLES[answers.styleOf][style].ids[0] : null;
  const picked = (answers.spirits ?? []).map((s) => (s === answers.styleOf && styleId ? styleId : spiritIds[s]));
  const spirits = picked.length ? picked.slice(0, 3) : ['white-rum', 'tequila', 'gin'];
  const basics = ['lime', 'lemon', 'sugar-syrup', 'soda-water'];
  // The two extra rows follow the flavours: bitter → Campari, strong → sweet vermouth and bitters, and so on.
  const byFlavour = { bitter: ['campari'], strong: ['sweet-vermouth', 'angostura-bitters'], sour: ['triple-sec'], fruity: ['pineapple-juice'], refreshing: ['ginger-beer'], sweet: ['grenadine'], creamy: ['coffee-liqueur'] };
  const extras = [...new Set([...(answers.flavours ?? []).flatMap((f) => byFlavour[f]), 'angostura-bitters', 'sweet-vermouth', 'triple-sec', 'ginger-beer'])].filter((id) => !spirits.includes(id));
  const rows = [...spirits, ...basics, ...extras].slice(0, 8);
  const ticked = new Set([...spirits, ...basics]);
  return rows.map((id) => ({ id, label: ING[id]?.label ?? id, ticked: ticked.has(id) }));
}

/* ------------------------------------------------------------------ */
/* The score                                                           */
/* ------------------------------------------------------------------ */

const W = { base: 0.4, style: 0.25, flavour: 0.3, photo: 0.15, known: 0.1 };
const W_CLASSIC = { track: 0.3, discover: 0.1, home: 0.2, friends: 0.2, null: 0.2 };

export function score(d, a, bar) {
  // 1. Category gate.
  if (a.drinks === 'cocktails' && d.category !== 'cocktail') return null;
  if (a.drinks === 'spirits' && d.category === 'cocktail' && d.subcategory !== 'Spirit-Forward') return null;
  // Fortified wines are in the catalogue as spirits; never the opening pick for anyone.
  if (['Sherry', 'Port', 'Vermouth', 'Fortified'].includes(d.subcategory)) return null;
  if (a.exclude?.has(d.id)) return null;

  const why = [];
  // 2. Base spirit.
  let base = 0.5;
  let baseLabel = null;
  if (a.spirits?.length) {
    const hits = spiritHits(d);
    let best = 0;
    for (const s of a.spirits) if ((hits.get(s) ?? 0) > best) { best = hits.get(s); baseLabel = SPIRITS[s].label; }
    base = best;
    if (best === 0) return null; // picked spirits are a filter, not a hint
  }
  // 3. Follow-up style.
  let style = 0;
  if (a.styleOf && a.styles?.length) {
    const ids = idsOf(d);
    for (const st of a.styles) {
      const S = STYLES[a.styleOf][st];
      if (d.category === 'spirit' ? S.spirit(d) : S.ids.some((id) => ids.has(id))) { style = 1; baseLabel = S.label; break; }
    }
  }
  // Always the first slot (null without a spirit), so a flavour never reads as the spirit in whyLine.
  why.push(baseLabel);
  // 4. Flavour.
  let flavour = 0.5;
  if (a.flavours?.length) {
    const hits = a.flavours.map((f) => [f, flavourHit(d, f)]);
    flavour = hits.reduce((s, [, h]) => s + h, 0) / hits.length;
    const top = hits.filter(([, h]) => h > 0).sort((x, y) => y[1] - x[1])[0];
    if (top) why.push(FLAVOURS[top[0]].label);
  }
  // 5. Classics and photo.
  const classic = CLASSIC[d.rarity] ?? 0;
  const photo = PHOTOS.has(d.id) ? 1 : 0;
  // 6. Home bar.
  let home = 0;
  const miss = missingCount(d, bar);
  if (a.home === 'often') home = miss === 0 ? 0.15 : miss === 1 ? 0.05 : 0;
  if (a.home === 'sometimes') home = miss === 0 ? 0.08 : miss === 1 ? 0.03 : 0;
  if (a.goal === 'home' && d.category === 'cocktail' && (RECIPE[d.id]?.slots.length ?? 9) <= 4) home += 0.05;

  const known = KNOWN.has(d.id) ? 1 : 0;
  // Spirits people asked for bottles: a stirred cocktail is welcome, but after the bottles.
  const lean = a.drinks === 'spirits' && d.category === 'cocktail' ? -0.1 : 0;

  const total =
    W.base * base + W.style * style + W.flavour * flavour + W_CLASSIC[a.goal ?? 'null'] * classic +
    W.photo * photo + W.known * known + home + lean;
  return { d, total, why, makeNow: miss === 0, photo: !!photo };
}

/** The variety key: two picks never share one. */
function familyKey(d) {
  // Spirits: one style ("Bourbon") and one named bottle ("Buffalo Trace", ids ending -sb) per style family.
  if (d.category === 'spirit') return `s:${d.subcategory}:${d.id.endsWith('-sb') ? 'bottle' : 'style'}`;
  return `c:${baseSpirit(d)}:${d.subcategory}`;
}

/** Which spirit's share a pick uses: the bottle's own spirit (Scotch → whiskey), or the cocktail's base. */
function shareKey(d) {
  if (d.category === 'spirit') {
    const k = Object.keys(SPIRITS).find((s) => SPIRITS[s].subcats.includes(d.subcategory));
    return k ? (SPIRITS[k].family ?? k) : d.subcategory;
  }
  return baseSpirit(d);
}

/** The "why" line under a pick's name. */
const LIKE = { refreshing: 'something refreshing', sour: 'sours', fruity: 'fruity drinks', sweet: 'sweet drinks', bitter: 'bitter', strong: 'strong drinks', creamy: 'creamy drinks' };

function whyLine(r, a) {
  const [spirit, flavour] = r.why;
  const f = flavour && LIKE[Object.keys(FLAVOURS).find((k) => FLAVOURS[k].label === flavour)];
  if (spirit && f) return `Because you like ${spirit} and ${f}`;
  if (spirit) return `Because you like ${spirit}`;
  if (f) return `Because you like ${f}`;
  return a.goal === 'discover' ? 'One to try first' : 'A classic to start with';
}

export const PICKS = 6;

/**
 * The first picks. Greedy, best first, with variety caps:
 *   - one per family key (base spirit + style for cocktails, style for spirits) and two per
 *     subcategory, each with one more seat for a style the person asked for by flavour;
 *   - a fair share per picked spirit, bottles and cocktails together (shareKey);
 *   - 'both' keeps at least 2 cocktails and 2 spirits when the pool has them;
 *   - photo preference is in the score (0.15), and the first 3 picks must be
 *     photographed when 3 photographed candidates exist, so the screen opens on colour.
 */
export function recommend(answers, n = PICKS) {
  const a = { ...answers, exclude: new Set(answers.exclude ?? []) };
  const bar = new Set(a.bar ?? []);
  const pool = DRINKS.map((d) => score(d, a, bar))
    .filter(Boolean)
    .sort((x, y) => y.total - x.total || knownRank(x.d.id) - knownRank(y.d.id) || x.d.dexNumber - y.d.dexNumber);

  const out = [];
  const keys = new Map();
  const perBase = new Map();
  const perSub = new Map();
  const perBottle = new Map();
  const take = (r) => {
    out.push(r);
    perSub.set(r.d.subcategory, (perSub.get(r.d.subcategory) ?? 0) + 1);
    keys.set(familyKey(r.d), (keys.get(familyKey(r.d)) ?? 0) + 1);
    const b = shareKey(r.d);
    perBase.set(b, (perBase.get(b) ?? 0) + 1);
    if (r.d.category === 'spirit') perBottle.set(r.d.subcategory, (perBottle.get(r.d.subcategory) ?? 0) + 1);
  };
  const fits = (r) => {
    // A style the person asked for by flavour (strong → Spirit-Forward, sour → Sour) gets one more
    // seat: a strong-and-bitter gin drinker sees the Negroni AND the Martini, not a French 75.
    const asked = (a.flavours ?? []).some((f) => FLAVOURS[f].subcats.includes(r.d.subcategory)) ? 1 : 0;
    if ((keys.get(familyKey(r.d)) ?? 0) >= 1 + asked) return false;
    if ((perSub.get(r.d.subcategory) ?? 0) >= 2 + asked) return false; // two highballs at most
    // Bottles: one per style family (one Scotch, one bourbon) unless the person asked for spirits.
    if (r.d.category === 'spirit' && a.drinks !== 'spirits' && (perBottle.get(r.d.subcategory) ?? 0) >= 1) return false;
    // A fair share per picked spirit, bottles and cocktails together (2 picked → 3 each; none picked → 2).
    // Only for picked spirits: a Negroni counted as gin uses the gin share, never a sixth whiskey.
    const share = a.spirits?.length ? Math.max(2, Math.ceil(n / a.spirits.length)) : 2;
    return (perBase.get(shareKey(r.d)) ?? 0) < share;
  };
  // Pass 1: three photographed openers.
  for (const r of pool) { if (out.length >= 3) break; if (r.photo && fits(r)) take(r); }
  // Pass 2: 'both' guarantees.
  if (a.drinks === 'both') {
    for (const cat of ['spirit', 'cocktail']) {
      let have = out.filter((r) => r.d.category === cat).length;
      for (const r of pool) { if (have >= 2 || out.length >= n) break; if (r.d.category === cat && !out.includes(r) && fits(r)) { take(r); have++; } }
    }
  }
  // Pass 3: the rest, best first.
  for (const r of pool) { if (out.length >= n) break; if (!out.includes(r) && fits(r)) take(r); }
  // Pass 4: a tiny pool (strict answers) relaxes the caps rather than return fewer than 5.
  for (const r of pool) { if (out.length >= Math.min(5, n)) break; if (!out.includes(r)) take(r); }

  // Photographed first, then by score, so the list reads as the collage resolved.
  out.sort((x, y) => Number(y.photo) - Number(x.photo) || y.total - x.total);
  return out.map((r) => ({
    id: r.d.id,
    name: r.d.name,
    dexNumber: r.d.dexNumber,
    category: r.d.category,
    subcategory: r.d.subcategory,
    abv: r.d.abv,
    photo: r.photo,
    makeNow: r.makeNow,
    why: whyLine(r, a),
    score: Math.round(r.total * 1000) / 1000,
  }));
}

/** The flavour screen's feedback card: drinks that clear the bar for these answers so far. */
export function matchingCount(answers) {
  const a = { ...answers, exclude: new Set() };
  return DRINKS.filter((d) => {
    const r = score(d, a, new Set());
    if (!r) return false;
    if (!a.flavours?.length) return true;
    return a.flavours.some((f) => flavourHit(d, f) >= 0.5);
  }).length;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const RUNS = {
  A: {
    title: 'Gin and whiskey (bourbon), bitter and strong, both, sometimes at home',
    answers: {
      goal: 'discover', drinks: 'both', spirits: ['gin', 'whiskey'], styleOf: 'whiskey', styles: ['bourbon'],
      flavours: ['bitter', 'strong'], home: 'sometimes',
      bar: ['gin', 'bourbon', 'lime', 'lemon', 'sugar-syrup', 'soda-water', 'campari', 'sweet-vermouth'],
    },
  },
  B: {
    title: 'Rum (white) and tequila, refreshing and sour, cocktails, never at home',
    answers: { goal: 'friends', drinks: 'cocktails', spirits: ['rum', 'agave'], styleOf: 'rum', styles: ['white'], flavours: ['refreshing', 'sour'], home: 'never', bar: [] },
  },
  C: {
    title: 'Skipped everything (only the age question answered)',
    answers: { goal: null, drinks: null, spirits: [], flavours: [], home: null, bar: [] },
  },
  D: {
    title: 'Spirits only, Scotch, strong',
    answers: { goal: 'track', drinks: 'spirits', spirits: ['whiskey'], styleOf: 'whiskey', styles: ['scotch'], flavours: ['strong'], home: 'never', bar: [] },
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = {};
  for (const [k, run] of Object.entries(RUNS)) {
    const picks = recommend(run.answers);
    const bar = run.answers.bar ?? [];
    const made = picks.filter((p) => p.makeNow).length;
    out[k] = {
      title: run.title,
      answers: run.answers,
      picks,
      makeNowCount: made,
      matching: matchingCount(run.answers),
      barMakes: bar.length ? makeableCount(bar) : 0,
      barRows: barRows(run.answers),
    };
    out[k].barMakesDefault = makeableCount(out[k].barRows.filter((r) => r.ticked).map((r) => r.id));
    console.log(`\nRun ${k}: ${run.title}`);
    console.log(`  matching (flavour card): ${out[k].matching}   bar makes: ${out[k].barMakes} (pre-ticked rows alone: ${out[k].barMakesDefault})   picks you can make now: ${made}`);
    for (const p of picks) {
      console.log(`  ${String(p.dexNumber).padStart(4, '0')}  ${p.name.padEnd(28)} ${p.category.padEnd(8)} ${p.subcategory.padEnd(18)} ${p.photo ? 'photo' : '-    '} ${p.makeNow ? 'make-now' : '        '} ${p.score}  "${p.why}"`);
    }
  }
  // Collage pool for run A: photographed drinks from the scored pool, best first.
  const a = { ...RUNS.A.answers, exclude: new Set() };
  out.collage = DRINKS.map((d) => score(d, a, new Set(a.bar)))
    .filter((r) => r && r.photo)
    .sort((x, y) => y.total - x.total)
    .slice(0, 18)
    .map((r) => r.d.id);
  if (process.argv.includes('--write')) {
    mkdirSync(join(HERE, '../data'), { recursive: true });
    writeFileSync(join(HERE, '../data/example.js'), `/* GENERATED by tools/recommend.mjs --write. Real output over src/data. */\nwindow.EXAMPLE = ${JSON.stringify(out, null, 1)};\n`);
    console.log('\nwrote data/example.js');
  }
}
