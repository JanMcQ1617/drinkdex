#!/usr/bin/env node
/*
 * Builds src/data/barIndex.json — the vocabulary My Bar picks from, and the
 * per-cocktail requirement list it matches against.
 *
 * WHY THIS IS NOT JUST A SET OF STRINGS. The 882 cocktails between them name
 * 551 distinct ingredients, and 52% of those appear exactly once. Matching
 * the raw strings would be wrong in three specific ways, and each one is
 * handled below:
 *
 *   1. VARIANTS. "White rum" and "Light rum" are one bottle written two
 *      ways. Someone who owns one and is told they cannot make a drink
 *      calling for the other will not trust the feature again.
 *
 *   2. GENERIC vs SPECIFIC, which is the inverse and easy to get backwards.
 *      A recipe asking for "Rum" is satisfied by ANY rum, so owning white
 *      rum should unlock it. But a recipe asking for "Overproof rum" is NOT
 *      satisfied by white rum — that is a different bottle doing a different
 *      job. So generics expand to their family; specifics do not expand to
 *      their generic. Getting this symmetric would either lock people out of
 *      drinks they can make or promise them ones they cannot.
 *
 *   3. DISJUNCTIONS. 31 strings are a choice written into one field —
 *      "Vodka or gin", "Milk or ice cream". The slot is satisfied by either
 *      side, so it resolves to the union.
 *
 * STAPLES ARE DROPPED, not required. Ice, water, sugar, salt, plain garnish
 * and rim instructions are assumed present. This is a judgement call and it
 * is the difference between a feature that works and one that tells a person
 * with a full bar they cannot make a Daiquiri because ice was not ticked.
 *
 * Run: node scripts/build-bar-index.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRINKS = resolve(ROOT, 'src/data/drinks.json');
const OUT = resolve(ROOT, 'src/data/barIndex.json');

/* ------------------------------------------------------------------ */
/* Staples — assumed present, never required, never pickable.          */
/* ------------------------------------------------------------------ */

const STAPLE = [
  /^ice$/i, /^crushed ice$/i, /^blended ice$/i, /^cracked ice$/i,
  /^(hot |cold |warm |boiling )?water$/i,
  /^(granulated |caster |white )?sugar$/i,
  /^salt$/i, /^pepper$/i,
  /\brim$/i, /^garnish/i, /garnish$/i,
  // Too vague to stock: "Fruit", "Citrus", "Spices", "Seasonal berries".
  /^(fruit|citrus|spices|seasonings?|berries)$/i,
];

const isStaple = (s) => STAPLE.some((re) => re.test(s.trim()));

/* ------------------------------------------------------------------ */
/* Variants — different spellings of one bottle. Left side is folded   */
/* into the right.                                                     */
/* ------------------------------------------------------------------ */

const VARIANT = {
  'light rum': 'white rum',
  'silver rum': 'white rum',
  'simple syrup': 'sugar syrup',
  'sugar syrup': 'sugar syrup',
  'rich simple syrup': 'sugar syrup',
  'egg yolks': 'egg yolk',
  'egg whites': 'egg white',
  'fresh mint': 'mint',
  'mint leaves': 'mint',
  'mint sprig': 'mint',
  'lime wedge': 'lime',
  'lime juice': 'lime',
  'lime peel': 'lime',
  'lemon wedge': 'lemon',
  'lemon juice': 'lemon',
  'lemon peel': 'lemon',
  'lemon twist': 'lemon',
  'orange juice': 'orange',
  'orange peel': 'orange',
  'orange twist': 'orange',
  'orange slice': 'orange',
  'grapefruit juice': 'grapefruit',
  'club soda': 'soda water',
  'sparkling mineral water': 'soda water',
  'sparkling water': 'soda water',
  'heavy cream': 'cream',
  'double cream': 'cream',
  'whipping cream': 'cream',
  'lightly whipped cream': 'whipped cream',
  'blanco tequila': 'silver tequila',
  'white tequila': 'silver tequila',
  'whisky': 'whiskey',
  'blended american whiskey': 'whiskey',
  'green crème de menthe': 'crème de menthe',
  'white crème de cacao': 'crème de cacao',
  'dark crème de cacao': 'crème de cacao',
  'clove': 'cloves',
  'orange liqueur': 'triple sec',
  'cointreau': 'triple sec',
  'lemon-lime soda': 'lemonade',
  'lemon soda': 'lemonade',
};

/* ------------------------------------------------------------------ */
/* Families — a recipe asking for the KEY is satisfied by any VALUE.   */
/* One-directional on purpose; see note 2 at the top.                  */
/* ------------------------------------------------------------------ */

const FAMILY = {
  rum: ['white rum', 'dark rum', 'gold rum', 'aged rum', 'jamaican rum',
        'demerara rum', 'overproof rum', 'blackstrap rum', 'spiced rum'],
  whiskey: ['bourbon', 'rye whiskey', 'scotch whisky', 'irish whiskey',
            'canadian whisky', 'japanese whisky', 'tennessee whiskey'],
  tequila: ['silver tequila', 'reposado tequila', 'añejo tequila'],
  gin: ['old tom gin', 'london dry gin', 'sloe gin', 'navy strength gin'],
  vermouth: ['sweet vermouth', 'dry vermouth', 'blanc vermouth'],
  brandy: ['cognac', 'armagnac', 'calvados', 'applejack', 'pisco', 'peach brandy',
           'apricot brandy'],
  'sparkling wine': ['champagne', 'prosecco', 'cava'],
  bitters: ['angostura bitters', 'orange bitters', "peychaud's bitters"],
  sherry: ['fino sherry', 'oloroso sherry', 'amontillado sherry', 'manzanilla sherry'],
  port: ['ruby port', 'tawny port', 'port wine'],
  'crème de cacao': [],
  'crème de menthe': [],
};

/* ------------------------------------------------------------------ */
/* Categories for the picker, in the order they are shown. First rule  */
/* that matches wins, so the specific ones come before the loose ones. */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  ['bitters', ['bitters']],
  ['savoury', ['worcestershire', 'hot sauce', 'tabasco', 'sangrita', 'celery salt',
               'olive brine', 'pickle', 'chilli', 'chili', 'horseradish', 'soy sauce']],
  ['spice', ['nutmeg', 'cinnamon', 'clove', 'vanilla', 'cardamom', 'cocoa', 'allspice',
             'star anise', 'anise seed', 'saffron', 'peppercorn', 'grated']],
  ['liqueur', ['liqueur', 'curaçao', 'curacao', 'triple sec', 'chartreuse', 'bénédictine',
               'campari', 'aperol', 'cynar', 'fernet', 'amaretto', 'schnapps', 'crème de',
               'creme de', 'sambuca', 'galliano', 'jägermeister', 'advocaat', 'kirsch',
               'falernum', 'allspice dram', 'anisette', 'pastis', 'amer picon', 'maraschino',
               'irish cream', 'drambuie', 'lillet', 'punt e mes', 'suze', 'sloe gin', 'pimm',
               'limoncello', 'amaro', 'chambord', 'kümmel', 'kummel', 'licor', 'punsch',
               'dubonnet', 'grand marnier', 'strega', 'becherovka', 'zwack', 'unicum',
               'midori', 'chartreuse', 'ouzo', 'raki', 'arrack', 'goldschläger']],
  ['spirit', ['gin', 'vodka', 'rum', 'rhum', 'whisk', 'bourbon', 'tequila', 'mezcal',
              'cachaça', 'pisco', 'brandy', 'cognac', 'armagnac', 'calvados', 'applejack',
              'arak', 'soju', 'shochu', 'singani', 'absinthe', 'aquavit', 'akvavit', 'grappa',
              'rye', 'aguardiente', 'guaro', 'boukha', 'brennivín', 'baijiu', 'eau-de-vie',
              'slivovitz', 'tsipouro', 'korn', 'schnaps', 'moonshine', 'genever']],
  ['wine', ['wine', 'champagne', 'prosecco', 'cava', 'sherry', 'port', 'vermouth', 'sake',
            'lager', 'ale', 'beer', 'stout', 'cider', 'claret', 'madeira', 'marsala',
            'moscato', 'retsina', 'sekt', 'crémant', 'lambrusco', 'mead']],
  ['citrus', ['lemon', 'lime', 'orange', 'grapefruit', 'citrus', 'yuzu', 'calamansi']],
  ['syrup', ['syrup', 'honey', 'agave', 'grenadine', 'orgeat', 'sugar', 'molasses', 'maple',
             'nectar', 'jam', 'marmalade']],
  ['juice', ['juice', 'purée', 'puree']],
  ['mixer', ['soda', 'cola', 'tonic', 'lemonade', 'water', 'tea', 'coffee', 'espresso',
             'energy drink', 'kombucha', 'root beer']],
  ['dairy', ['milk', 'cream', 'egg', 'butter', 'yoghurt', 'yogurt']],
  ['produce', ['mint', 'cucumber', 'strawberr', 'pineapple', 'banana', 'peach', 'apple',
               'berr', 'basil', 'ginger', 'celery', 'tomato', 'olive', 'cherry', 'coconut',
               'raisin', 'grape', 'melon', 'mango', 'passion', 'rhubarb', 'fig', 'date',
               'rosemary', 'thyme', 'sage', 'lavender', 'hibiscus', 'elderflower']],
];

/*
 * Substring match on the lowercased label, first category wins. Bitters and
 * liqueurs are tested before spirits deliberately: "Orange bitters" contains
 * no spirit word but "Sloe gin" does, and it belongs with the liqueurs.
 */
const categorise = (label) => {
  const l = label.toLowerCase();
  for (const [name, needles] of CATEGORIES) {
    if (needles.some((n) => l.includes(n))) return name;
  }
  return 'other';
};

/* ------------------------------------------------------------------ */

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Strips qualifiers that describe preparation rather than the bottle. */
const clean = (raw) =>
  raw.toLowerCase().trim()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/^(fresh|freshly squeezed|chilled|cold|good|quality|dry)\s+(?=\w)/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** One raw string -> the set of canonical ids that satisfy it. */
function resolve_(raw) {
  // A choice written into one field: either side satisfies the slot.
  if (/\bor\b/i.test(raw)) {
    const parts = raw.split(/\s+or\s+/i);
    if (parts.length > 1 && parts.every((p) => p.trim())) {
      return [...new Set(parts.flatMap((p) => resolve_(p)))];
    }
  }
  const c = clean(raw);
  const canon = VARIANT[c] ?? c;
  const family = FAMILY[canon];
  // A generic expands to itself plus every specific under it, so owning any
  // one of them satisfies the slot.
  return family && family.length ? [canon, ...family].map(slug) : [slug(canon)];
}

const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
const cocktails = drinks.filter((d) => d.category === 'cocktail');

const labelOf = new Map(); // id -> nicest label seen
const useCount = new Map(); // id -> how many cocktails name it
const recipes = [];

for (const d of cocktails) {
  const slots = [];
  for (const raw of d.ingredients ?? []) {
    if (isStaple(raw)) continue;
    const ids = resolve_(raw);
    if (!ids.length) continue;
    slots.push(ids);
    for (const id of ids) {
      if (!labelOf.has(id)) {
        labelOf.set(id, id.replace(/-/g, ' ').replace(/^./, (m) => m.toUpperCase()));
      }
    }
    // Only the first id of a slot counts toward "how common is this
    // ingredient" — the expansions of a generic are not extra usage.
    useCount.set(ids[0], (useCount.get(ids[0]) ?? 0) + 1);
  }
  if (slots.length) recipes.push({ id: d.id, name: d.name, slots });
}

// Prefer the label as the data actually writes it, for the common case.
const rawByFreq = new Map();
for (const d of cocktails) {
  for (const raw of d.ingredients ?? []) {
    if (isStaple(raw) || /\bor\b/i.test(raw)) continue;
    const c = clean(raw);
    const id = slug(VARIANT[c] ?? c);
    const m = rawByFreq.get(id) ?? new Map();
    const nice = (VARIANT[c] ?? c).replace(/^./, (ch) => ch.toUpperCase());
    m.set(nice, (m.get(nice) ?? 0) + 1);
    rawByFreq.set(id, m);
  }
}
for (const [id, counts] of rawByFreq) {
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  labelOf.set(id, best);
}

const ingredients = [...labelOf.entries()]
  .map(([id, label]) => ({ id, label, category: categorise(label), uses: useCount.get(id) ?? 0 }))
  .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label));

writeFileSync(
  OUT,
  JSON.stringify({ ingredients, recipes }, null, 0) + '\n',
  'utf8',
);

const byCat = ingredients.reduce((acc, i) => ((acc[i.category] = (acc[i.category] ?? 0) + 1), acc), {});
console.log(`  cocktails with a usable spec : ${recipes.length} / ${cocktails.length}`);
console.log(`  distinct ingredients         : ${ingredients.length}  (from 551 raw strings)`);
console.log(`  never used directly (family expansions only): ${ingredients.filter((i) => !i.uses).length}`);
console.log(`  by category                  :`, byCat);
console.log(`  wrote ${OUT}`);
