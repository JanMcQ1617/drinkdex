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
 * v4 (specs/v4-changes.md 6.6, the shelves model). Each ingredient now also
 * carries what My Bar's screen needs so it never guesses:
 *
 *   shelf     one of seven, always in one order (SHELF, below)
 *   family    spirits only: the family its picker groups it under
 *   aliases   every other name that finds it (the VARIANT left sides and
 *             the brand list), so "Cointreau" finds Triple sec
 *   brands, kind   the brand names among them, and how to say what they
 *             are ("Cointreau is a triple sec")
 *   proper    its label starts with a proper noun, so a sentence keeps the
 *             capital ("Add Campari", but "Add dry vermouth")
 *
 * and the index carries `expands`: each generic and the family it stands
 * for, so a search row can say "Any whiskey · covered by your bourbon".
 *
 * Every id this file merges away is renamed on load by RETIRED in
 * src/store/bar.ts, so a saved bar keeps its bottles. Add it there too.
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
/* Rewrites — a whole raw string the parser would split wrongly.       */
/* ------------------------------------------------------------------ */

/*
 * A choice that shares one noun between both sides. Split on "or" as
 * written, "Red or white wine" made a bottle called "Red" (the Clericot's)
 * and "Elderflower syrup or liqueur" one called "Liqueur". The noun is
 * written out on both sides first.
 */
const REWRITE = {
  'red or white wine': 'red wine or white wine',
  'elderflower syrup or liqueur': 'elderflower syrup or elderflower liqueur',
  'manzanilla or fino sherry': 'manzanilla sherry or fino sherry',
};

/* ------------------------------------------------------------------ */
/* Variants — different spellings of one bottle. Left side is folded   */
/* into the right. The left sides are emitted as the right's aliases.  */
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
  'red vermouth': 'sweet vermouth',
  'sweet red vermouth': 'sweet vermouth',
  'lemon-lime soda': 'lemonade',
  'lemon soda': 'lemonade',

  /*
   * v4 merges (shelves spec 7.4, the judges' list): one bottle that the
   * data wrote as two, so it showed twice in a picker and a tick on one
   * did not pour the other's drinks.
   */
  'angostura': 'angostura bitters',
  'lime disc': 'lime',
  'lime zest': 'lime',
  'orange slices': 'orange',
  'orgeat syrup': 'orgeat',
  'golden rum': 'gold rum',
  'kahlúa': 'coffee liqueur',
  'agave nectar': 'agave syrup',
  'egg': 'whole egg',
  'eggs': 'whole egg',
  'whole eggs': 'whole egg',
  'passion fruit syrup': 'passionfruit syrup',
  'olives': 'olive',
  'strawberry': 'strawberries',
  'peach': 'peaches',
  'sweetened condensed milk': 'condensed milk',
  'midori': 'melon liqueur',
  'midori melon liqueur': 'melon liqueur',
  // A pour written with how it is served: the bottle is the same.
  'absinthe rinse': 'absinthe',
  'galliano float': 'galliano',
  'irish cream float': 'irish cream',
  'amontillado sherry float': 'amontillado sherry',
  'irish whiskey shot': 'irish whiskey',
  'beer chaser': 'beer',
  // The bare halves of a choice ("Bourbon or rye", "Plymouth or Navy gin", "Whisky or Amarula").
  'rye': 'rye whiskey',
  'navy gin': 'navy strength gin',
  'amarula': 'amarula cream liqueur',
  'fernet': 'fernet-branca',
};

/*
 * Brand names people type, the bottle each one is, and how to say it
 * (shelves spec 4.4, the setup judge's line "Cointreau is a triple sec").
 * `kind` keeps its article and any proper noun's capital.
 */
const BRANDS = {
  'sweet vermouth': { kind: 'a sweet vermouth', names: ['Martini Rosso', 'Cinzano Rosso'] },
  'dry vermouth': { kind: 'a dry vermouth', names: ['Noilly Prat', 'Dolin Dry', 'Martini Extra Dry'] },
  'white rum': { kind: 'a white rum', names: ['Bacardi'] },
  'coffee liqueur': { kind: 'a coffee liqueur', names: ['Kahlúa', 'Tia Maria'] },
  'irish cream': { kind: 'an Irish cream', names: ['Baileys'] },
  'maraschino liqueur': { kind: 'a maraschino liqueur', names: ['Luxardo'] },
  'triple sec': { kind: 'a triple sec', names: ['Cointreau', 'Combier'] },
  'soda water': { kind: 'soda water', names: ['Club soda', 'Seltzer'] },
  'melon liqueur': { kind: 'a melon liqueur', names: ['Midori'] },
  'gin': { kind: 'a gin', names: ['Tanqueray', 'Beefeater', "Gordon's", 'Bombay Sapphire', "Hendrick's"] },
  'vodka': { kind: 'a vodka', names: ['Smirnoff', 'Absolut', 'Grey Goose', "Tito's"] },
  'tequila': { kind: 'a tequila', names: ['Jose Cuervo', 'Patrón', 'Don Julio'] },
  'irish whiskey': { kind: 'an Irish whiskey', names: ['Jameson', 'Bushmills'] },
  'spiced rum': { kind: 'a spiced rum', names: ['Captain Morgan', 'Sailor Jerry'] },
  'coconut rum': { kind: 'a coconut rum', names: ['Malibu'] },
  'cola': { kind: 'a cola', names: ['Coca-Cola', 'Coke', 'Pepsi'] },
};

/* ------------------------------------------------------------------ */
/* Families — a recipe asking for the KEY is satisfied by any VALUE.   */
/* One-directional on purpose; see note 2 at the top.                  */
/* ------------------------------------------------------------------ */

/*
 * v4: liqueurs are no longer family members (shelves spec 7.4). Sloe gin
 * sat in gin's family, so owning sloe gin filled the gin slot of 165
 * recipes and "made" a Martini; apricot and peach brandy filled every
 * brandy slot the same way. They are their own bottles on the liqueurs
 * shelf now.
 */
const FAMILY = {
  rum: ['white rum', 'dark rum', 'gold rum', 'aged rum', 'jamaican rum',
        'demerara rum', 'overproof rum', 'blackstrap rum', 'spiced rum'],
  whiskey: ['bourbon', 'rye whiskey', 'scotch whisky', 'irish whiskey',
            'canadian whisky', 'japanese whisky', 'tennessee whiskey'],
  tequila: ['silver tequila', 'reposado tequila', 'añejo tequila'],
  gin: ['old tom gin', 'london dry gin', 'navy strength gin'],
  vermouth: ['sweet vermouth', 'dry vermouth', 'blanc vermouth'],
  brandy: ['cognac', 'armagnac', 'calvados', 'applejack', 'pisco'],
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

/*
 * Where the substring rules file a thing wrongly, by id, over their answer.
 * "gin" is inside "ginger" (ginger beer, ale and syrup came out spirits),
 * the liqueur "maraschino" inside "maraschino cherry", and brand names
 * carry no kind word at all, so they fell to 'other'. The shelf (below)
 * starts from the category, so this is the one place to put a misfiling
 * right.
 */
const CATEGORY_OVERRIDE = {
  'ginger-beer': 'mixer',
  'ginger-ale': 'mixer',
  ginger: 'produce',
  'ginger-syrup': 'syrup',
  'honey-ginger-syrup': 'syrup',
  'green-ginger-wine': 'wine',
  'maraschino-cherry': 'produce',
  watermelon: 'produce',
  'jack-daniel-s': 'spirit',
  'jim-beam': 'spirit',
  'johnnie-walker': 'spirit',
  'blended-scotch': 'spirit',
  'islay-scotch-float': 'spirit',
  plymouth: 'spirit',
  jenever: 'spirit',
  'jonge-jenever': 'spirit',
  zubrowka: 'spirit',
  orujo: 'spirit',
  pitorro: 'spirit',
  frangelico: 'liqueur',
  'southern-comfort': 'liqueur',
  'vana-tallinn': 'liqueur',
  // Carpano Antica and Gancia Americano are vermouths, which file as wine.
  'carpano-antica': 'wine',
  'gancia-americano': 'wine',
  'select-aperitivo': 'liqueur',
  // Beers file as wine ("Wine & beer").
  pilsner: 'wine',
  'berliner-weisse': 'wine',
  umeshu: 'liqueur',
  'sour-mix': 'mixer',

  /*
   * v4 refile (the setup judge's list): the 'other' pile held 80 things,
   * most of them a spirit, a soda or a fruit under a name with no kind word
   * in it. Filed by what they are, so the Other shelf keeps only the odd
   * ones: a starter culture, a snake.
   */
  'aguardente-de-cana': 'spirit', 'barack-palinka': 'spirit', borovicka: 'spirit',
  brannvin: 'spirit', cana: 'spirit', chacha: 'spirit', horilka: 'spirit',
  konyagi: 'spirit', rak: 'spirit', 'seco-herrerano': 'spirit', tsikoudia: 'spirit',
  tuica: 'spirit', urrak: 'spirit', waragi: 'spirit', trasch: 'spirit',
  'riga-black-balsam': 'liqueur', braulio: 'liqueur', anis: 'liqueur', coecoei: 'liqueur',
  'denki-bran': 'liqueur', ojen: 'liqueur',
  // Arrack and rakija are distilled (the "arrack" and "raki" needles file them as liqueurs).
  'batavia-arrack': 'spirit', 'ceylon-arrack': 'spirit', 'coconut-arrack': 'spirit', rakija: 'spirit',
  almdudler: 'mixer', kinnie: 'mixer', limca: 'mixer', ting: 'mixer', 'thai-red-bull': 'mixer',
  'hoppy-beverage': 'mixer', 'sweet-and-sour': 'mixer',
  huangjiu: 'wine', tej: 'wine', pipeno: 'wine', 'red-burgundy': 'wine',
  panela: 'syrup', papelon: 'syrup', sweetener: 'syrup', 'blackcurrant-cordial': 'syrup',
  'calpis-concentrate': 'syrup',
  papaya: 'produce', quenepas: 'produce', 'mixed-fruit': 'produce', 'seasonal-fruit': 'produce',
  'chopped-fruit': 'produce', fruit: 'produce', 'sweet-woodruff': 'produce', tarragon: 'produce',
  rue: 'produce', yakult: 'dairy',
};

/* ------------------------------------------------------------------ */
/* Shelves — the seven My Bar shows, always in this order.             */
/* ------------------------------------------------------------------ */

/*
 * The order a bar is stocked and a recipe is read (shelves spec 4.1):
 * spirit, modifier, lengthener, fresh, sweet, dashes, the rest. From the
 * category, with the wine split two ways and about thirty ids moved by
 * hand (specs/v4-mockups/mybar/shelves/tools/shelves.py, where they were
 * worked out against the mock).
 */
const SHELF_BY_CATEGORY = {
  spirit: 'spirits', liqueur: 'liqueurs', wine: 'liqueurs', bitters: 'bitters',
  citrus: 'fresh', juice: 'mixers', syrup: 'syrups', mixer: 'mixers', dairy: 'fresh',
  produce: 'fresh', spice: 'other', savoury: 'other', other: 'other',
};

/*
 * Wine you top or lengthen a drink with is a mixer; fortified and
 * aromatised wine (vermouth, sherry, port, Lillet-style) stays with the
 * liqueurs, which is where a bar keeps it.
 */
const WINE_TO_MIXERS = ['champagne', 'prosecco', 'cava', 'sparkling', 'sekt', 'red-wine', 'white-wine',
  'rose-wine', 'wine', 'lager', 'ale', 'beer', 'stout', 'porter', 'pilsner', 'cider', 'weisse', 'claret',
  'burgundy', 'sake', 'rice-wine', 'palm-wine', 'sweet-white', 'sweet-red', 'aligote', 'huangjiu', 'tej',
  'pipeno'];
const FORTIFIED = /vermouth|sherry|(^|-)port(-|$)/;

const SHELF_OVERRIDE = {
  // Bottled "spirits" that are liqueurs on a real shelf.
  'apricot-brandy': 'liqueurs', 'peach-brandy': 'liqueurs', 'cherry-brandy': 'liqueurs',
  'sloe-gin': 'liqueurs', 'coconut-rum': 'liqueurs',
  // Citrus that comes in a bottle or a can.
  lemonade: 'mixers', 'grapefruit-soda': 'mixers', 'ting-grapefruit-soda': 'mixers', 'lemon-squash': 'mixers',
  'icelandic-orange-soda': 'mixers', 'lemon-paeroa': 'mixers', 'lime-cordial': 'syrups',
  'orange-flower-water': 'other', 'orange-marmalade': 'other', 'lemon-sorbet': 'other',
  // Syrups and a liqueur filed under spice.
  'cinnamon-syrup': 'syrups', 'vanilla-syrup': 'syrups', 'allspice-dram': 'liqueurs',
  'vanilla-vodka': 'spirits', 'vanilla-ice-cream': 'fresh',
  // Cordials and shrubs filed as produce.
  'elderflower-cordial': 'syrups', 'raspberry-cordial': 'syrups', 'raspberry-shrub': 'syrups',
  'cherry-heering': 'liqueurs', 'maraschino-cherry': 'other',
  // A wine that is fortified (Stone's), a beer whose name holds "port".
  'green-ginger-wine': 'liqueurs', porter: 'mixers',
};

function shelfOf(id, category) {
  if (SHELF_OVERRIDE[id]) return SHELF_OVERRIDE[id];
  if (category === 'wine' && !FORTIFIED.test(id)
      && WINE_TO_MIXERS.some((w) => id === w || id.startsWith(`${w}-`) || id.endsWith(`-${w}`))) {
    return 'mixers';
  }
  return SHELF_BY_CATEGORY[category];
}

/*
 * A spirit's family, for the Spirits picker's groups and the Make list's
 * sections (shelves spec 4.3, 4.5). The five generic families first, from
 * FAMILY itself; then the label's own kind word; then a few names that
 * carry none (Plymouth is a gin, Horilka a vodka).
 */
const FAMILY_OF_ID = {
  mezcal: 'tequila', plymouth: 'gin', 'ginebra-san-miguel': 'gin', waragi: 'gin',
  genever: 'gin', jenever: 'gin', 'jonge-jenever': 'gin',
  'jack-daniel-s': 'whiskey', 'jim-beam': 'whiskey', 'johnnie-walker': 'whiskey',
  'blended-scotch': 'whiskey', 'islay-scotch-float': 'whiskey',
  zubrowka: 'vodka', horilka: 'vodka', pitorro: 'rum',
};

function familyOf(id, label) {
  for (const g of ['gin', 'rum', 'whiskey', 'brandy', 'tequila']) {
    if (id === g || FAMILY[g].map(slug).includes(id)) return g;
  }
  if (FAMILY_OF_ID[id]) return FAMILY_OF_ID[id];
  const l = label.toLowerCase();
  if (/(^|\s)rum\b|rhum|rum$/.test(l)) return 'rum';
  if (l.includes('whisk') || l.includes('bourbon')) return 'whiskey';
  if (l.includes('vodka')) return 'vodka';
  if (l === 'gin' || l.endsWith(' gin')) return 'gin';
  if (l.includes('brandy') || l.includes('cognac') || l.includes('pisco')) return 'brandy';
  if (l.includes('tequila') || l.includes('mezcal')) return 'tequila';
  return 'other';
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/*
 * The parser lowercases everything, so a brand came out "Jim beam" and
 * "Grand marnier". Written out here as the bottle spells it.
 */
const LABEL = {
  'jack-daniel-s': "Jack Daniel's", 'jim-beam': 'Jim Beam', 'johnnie-walker': 'Johnnie Walker',
  'ginebra-san-miguel': 'Ginebra San Miguel', 'grand-marnier': 'Grand Marnier',
  'fernet-branca': 'Fernet-Branca', 'amaro-averna': 'Amaro Averna', 'amaro-montenegro': 'Amaro Montenegro',
  'amaro-nardini': 'Amaro Nardini', 'amaro-nonino': 'Amaro Nonino', 'southern-comfort': 'Southern Comfort',
  'vana-tallinn': 'Vana Tallinn', 'pimm-s-no-1': "Pimm's No. 1",
  'st-germain-elderflower-liqueur': 'St-Germain elderflower liqueur', 'amer-picon': 'Amer Picon',
  'punt-e-mes': 'Punt e Mes', 'cherry-heering': 'Cherry Heering', 'old-tom-gin': 'Old Tom gin',
  'old-monk-rum': 'Old Monk rum', 'riga-black-balsam': 'Riga Black Balsam', 'seco-herrerano': 'Seco Herrerano',
  'denki-bran': 'Denki Bran', 'licor-43': 'Licor 43', 'carpano-antica': 'Carpano Antica',
  'gancia-americano': 'Gancia Americano', 'lillet-blanc': 'Lillet Blanc', 'select-aperitivo': 'Select Aperitivo',
  'sangsom-thai-rum': 'Sangsom Thai rum', 'bundaberg-rum': 'Bundaberg rum', 'klipdrift-brandy': 'Klipdrift brandy',
  'xoriguer-gin': 'Xoriguer gin', 'blended-scotch': 'Blended Scotch', 'blended-scotch-whisky': 'Blended Scotch whisky',
  'islay-scotch-float': 'Islay Scotch float', 'green-chartreuse': 'Green Chartreuse',
  'yellow-chartreuse': 'Yellow Chartreuse', 'canadian-rye-whisky': 'Canadian rye whisky',
  'dark-jamaican-rum': 'Dark Jamaican rum', 'overproof-jamaican-rum': 'Overproof Jamaican rum',
  'red-burgundy': 'Red Burgundy', 'lemon-paeroa': 'Lemon & Paeroa', 'thai-red-bull': 'Thai Red Bull',
  'salsa-lizano': 'Salsa Lizano', 'mexican-lager': 'Mexican lager',
};

/*
 * Labels that open on a proper noun keep their capital mid-sentence:
 * "Add Campari", "covered by your Irish whiskey". Everything else is
 * lowered there ("Add dry vermouth"). By first word, plus the ids whose
 * whole name is a brand that opens on a common word (Cherry Heering).
 */
const PROPER_FIRST = new Set(`Almdudler Amarula Amer Angostura Aperol Argentine Balinese Barbadian Batavia
  Becherovka Bénédictine Braulio Bundaberg Calpis Campari Canadian Carpano Ceylon Chambord Chilean Clamato
  Coecoei Colombiana Cynar Cypriot Denki Drambuie Dubonnet Fernet-Branca Frangelico Galliano Gancia Ginebra
  Grand Haitian Icelandic Inländerrum Irish Islay Jack Jamaican Japanese Jim Johnnie Jägermeister Kinnie
  Klipdrift Konyagi Licor Lillet Limca London Mexican Midori Old Peychaud's Pimm's Plymouth Punt Riga Sangsom
  Scotch Seco Select Seville Southern Spanish St-Germain Suze Swedish Tabasco Tatratea Tennessee Thai Ting
  Unicum Vana Waragi Worcestershire Xoriguer Yakult Żubrówka`.split(/\s+/));
const PROPER_IDS = new Set(['cherry-heering', 'green-chartreuse', 'yellow-chartreuse', 'amaro-averna',
  'amaro-montenegro', 'amaro-nardini', 'amaro-nonino']);

/* ------------------------------------------------------------------ */

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** First letter up: how the parser writes a label or an alias from its lowercased form. */
const display = (s) => s.replace(/^./, (m) => m.toUpperCase());

/**
 * Strips qualifiers that describe preparation rather than the bottle.
 * "Dry" goes from "dry gin" and "dry white wine", but stays on vermouth:
 * dry and sweet vermouth are different bottles, and stripping it sent all
 * 70 "Dry vermouth" recipes (Martini, Bamboo, Bronx) to the generic slot,
 * so sweet vermouth alone was said to pour a Martini.
 */
const clean = (raw) =>
  raw.toLowerCase().trim()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/^(fresh|freshly squeezed|chilled|cold|good|quality|dry(?!\s+vermouth\b))\s+(?=\w)/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** One raw string -> the set of canonical ids that satisfy it. */
function resolve_(raw) {
  const rewritten = REWRITE[raw.toLowerCase().trim()] ?? raw;
  // A choice written into one field: either side satisfies the slot.
  if (/\bor\b/i.test(rewritten)) {
    const parts = rewritten.split(/\s+or\s+/i);
    if (parts.length > 1 && parts.every((p) => p.trim())) {
      return [...new Set(parts.flatMap((p) => resolve_(p)))];
    }
  }
  const c = clean(rewritten);
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
    const nice = display(VARIANT[c] ?? c);
    m.set(nice, (m.get(nice) ?? 0) + 1);
    rawByFreq.set(id, m);
  }
}
for (const [id, counts] of rawByFreq) {
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  labelOf.set(id, best);
}
for (const [id, label] of Object.entries(LABEL)) if (labelOf.has(id)) labelOf.set(id, label);

/* ---- Aliases: the VARIANT left sides and the brands, per bottle ---- */

const aliasesOf = new Map(); // id -> Map(folded -> display)
const addAlias = (id, name) => {
  const folded = slug(name);
  if (folded === id) return; // the label itself
  const m = aliasesOf.get(id) ?? new Map();
  if (!m.has(folded)) m.set(folded, name);
  aliasesOf.set(id, m);
};
for (const [left, right] of Object.entries(VARIANT)) addAlias(slug(right), display(left));
const brandsOf = new Map();
for (const [bottle, { kind, names }] of Object.entries(BRANDS)) {
  const id = slug(bottle);
  brandsOf.set(id, { kind, names });
  for (const n of names) addAlias(id, n);
}

const ingredients = [...labelOf.entries()]
  .map(([id, label]) => {
    const category = CATEGORY_OVERRIDE[id] ?? categorise(label);
    const shelf = shelfOf(id, category);
    const aliases = [...(aliasesOf.get(id)?.values() ?? [])];
    const brand = brandsOf.get(id);
    const first = label.split(' ')[0];
    return {
      id,
      label,
      category,
      shelf,
      uses: useCount.get(id) ?? 0,
      ...(shelf === 'spirits' ? { family: familyOf(id, label) } : null),
      ...(aliases.length ? { aliases } : null),
      ...(brand ? { brands: brand.names, kind: brand.kind } : null),
      ...(PROPER_FIRST.has(first) || PROPER_IDS.has(id) ? { proper: true } : null),
    };
  })
  .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label));

/* Each generic the index holds, and the family it stands for (coveredBy, in src/lib/bar.ts). */
const expands = Object.fromEntries(
  Object.entries(FAMILY)
    .filter(([g, members]) => members.length && labelOf.has(slug(g)))
    .map(([g, members]) => [slug(g), members.map(slug).filter((id) => labelOf.has(id))]),
);

/* ---- Guards: a fix that silently stopped applying fails the build ---- */

const fail = (msg) => {
  console.error(`  ${msg}`);
  process.exit(1);
};
for (const [name, table] of [['CATEGORY_OVERRIDE', CATEGORY_OVERRIDE], ['SHELF_OVERRIDE', SHELF_OVERRIDE],
  ['FAMILY_OF_ID', FAMILY_OF_ID], ['LABEL', LABEL]]) {
  const stale = Object.keys(table).filter((id) => !labelOf.has(id));
  if (stale.length) fail(`${name} names ids the index no longer has: ${stale.join(', ')}`);
}
const lostBrand = Object.keys(BRANDS).filter((b) => !labelOf.has(slug(b)));
if (lostBrand.length) fail(`BRANDS names bottles the index no longer has: ${lostBrand.join(', ')}`);
const merged = Object.entries(VARIANT).filter(([l, r]) => slug(l) !== slug(r) && labelOf.has(slug(l)));
if (merged.length) fail(`VARIANT left sides still standing as their own ids: ${merged.map(([l]) => l).join(', ')}`);
// The family fix: no liqueur may fill a spirit family's slot again.
for (const id of ['sloe-gin', 'apricot-brandy', 'peach-brandy']) {
  if (Object.values(expands).some((m) => m.includes(id))) fail(`${id} is back inside a spirit family`);
}

writeFileSync(
  OUT,
  JSON.stringify({ ingredients, recipes, expands }, null, 0) + '\n',
  'utf8',
);

const count = (key) => ingredients.reduce((acc, i) => ((acc[i[key]] = (acc[i[key]] ?? 0) + 1), acc), {});
console.log(`  cocktails with a usable spec : ${recipes.length} / ${cocktails.length}`);
console.log(`  distinct ingredients         : ${ingredients.length}  (from 551 raw strings)`);
console.log(`  never used directly (family expansions only): ${ingredients.filter((i) => !i.uses).length}`);
console.log(`  by shelf                     :`, count('shelf'));
console.log(`  spirits by family            :`, count('family'));
console.log(`  with aliases                 : ${ingredients.filter((i) => i.aliases).length}`);
console.log(`  wrote ${OUT}`);
