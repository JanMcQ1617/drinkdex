// Relative import, not the '@/' alias, so this module can be compiled and
// audited standalone by scripts/check-artwork.mjs.
import type { Drink } from '../../types';

/* ==================================================================== */
/* Liquid color                                                         */
/*                                                                      */
/* Derived, not authored — 460 hand-picked colors would drift.           */
/* Cocktails and spirits match on name + subcategory + tasting notes, so */
/* "Espresso Martini" reads coffee-dark and "Aviation" reads violet.     */
/* Beer and wine match on style only; see the note above BEER_NAME_RULES.*/
/*                                                                      */
/* Pure and React-free on purpose: scripts/check-artwork.mjs compiles    */
/* this file alone and audits all 460 drinks for miscolored output.      */
/* ==================================================================== */

export const LIQUID = {
  clear: '#E4E8E4',
  paleStraw: '#F0D785',
  straw: '#EFC757',
  gold: '#E3AE33',
  amber: '#D3892A',
  copper: '#B4601F',
  brown: '#8A4A1C',
  darkBrown: '#4E2711',
  nearBlack: '#2A1608',
  coffee: '#3A200E',
  redWine: '#7B1E3A',
  deepRed: '#59102A',
  rose: '#EDA2A4',
  whiteWine: '#EAD68A',
  orange: '#E8792B',
  tomato: '#BF3A22',
  pink: '#E46E97',
  green: '#8FB93E',
  mint: '#7CC48C',
  blue: '#4A8FD4',
  violet: '#7B4A9E',
  cream: '#EBDCC0',
  milky: '#EDE6D6',
} as const;

/*
 * Every token is anchored with \b.
 *
 * Without it, short tokens match inside longer words and quietly paint the
 * wrong drink: `gin` matched "ginger heat" and rendered a Moscow Mule as
 * clear gin. `port` inside "porter" and `light` inside "delightful" are the
 * same trap. Keep the boundaries when adding rules.
 */
const b = (alts: string) => new RegExp(`\\b(?:${alts})`);

/** Unmistakable regardless of category — checked first for every drink. */
const SIGNATURE: [RegExp, string][] = [
  [b('espresso|coffee|kahlua|mudslide|black russian'), LIQUID.coffee],
  [b('cola|root beer|dr pepper'), LIQUID.darkBrown],
  [b('tomato|clamato|bloody|caesar|michelada'), LIQUID.tomato],
  [b('blue cura|blue lagoon|blue hawaii'), LIQUID.blue],
  [b('creme de violette|aviation|lavender|violet'), LIQUID.violet],
  [b('mint|mojito|grasshopper|midori|melon|matcha|chartreuse'), LIQUID.mint],
  [b('cream|milk|colada|alexander|flip|eggnog|horchata|ramos'), LIQUID.cream],
  [b('nigori|milky|cloudy'), LIQUID.milky],
];

/*
 * Beer and wine are resolved from STYLE (name + subcategory), never from
 * tasting notes.
 *
 * Notes describe flavor, not color, and the two diverge constantly:
 * Brunello tastes of espresso and is deep red; Soave tastes of melon and
 * is pale gold; a barleywine tastes of plum and is brown. Matching notes
 * painted all three wrong.
 */

/** Style names more specific than their subcategory implies. */
const BEER_NAME_RULES: [RegExp, string][] = [
  [b('schwarz|black lager|dunkel'), LIQUID.nearBlack],
  [b('kriek|framboise|fruit lambic|flanders red'), LIQUID.deepRed],
  [b('barleywine|barley wine|quadrupel|wee heavy'), LIQUID.brown],
  [b('tripel|blonde|golden|saison|witbier|weisse|gose|berliner'), LIQUID.straw],
];

export const BEER_BY_SUBCATEGORY: Record<string, string> = {
  'Pale Lager': LIQUID.paleStraw,
  'Hybrid Ale': LIQUID.paleStraw,
  'Wheat Beer': LIQUID.straw,
  'Sour & Wild': LIQUID.straw,
  'Farmhouse Ale': LIQUID.straw,
  IPA: LIQUID.gold,
  'Pale Ale': LIQUID.gold,
  'Belgian Ale': LIQUID.gold,
  Specialty: LIQUID.gold,
  'Amber & Dark Lager': LIQUID.copper,
  'Amber & Red Ale': LIQUID.copper,
  'English Ale': LIQUID.copper,
  Bock: LIQUID.copper,
  'Brown Ale': LIQUID.brown,
  'Scottish Ale': LIQUID.brown,
  'Strong Ale': LIQUID.brown,
  Porter: LIQUID.darkBrown,
  'Barrel-Aged': LIQUID.darkBrown,
  Stout: LIQUID.nearBlack,
};

const WINE_NAME_RULES: [RegExp, string][] = [
  [b('nigori'), LIQUID.milky],
  [b('sake|junmai|ginjo|daiginjo|honjozo'), LIQUID.clear],
  [b('fino|manzanilla'), LIQUID.paleStraw],
  [b('pedro xim|oloroso|cream sherry'), LIQUID.darkBrown],
  [b('tawny'), LIQUID.amber],
  [b('ros[ée]|blush|white zinfandel'), LIQUID.rose],
  [b('orange wine|skin.contact|amber wine'), LIQUID.orange],
];

export const WINE_BY_SUBCATEGORY: Record<string, string> = {
  White: LIQUID.whiteWine,
  'Red Varietal': LIQUID.redWine,
  'Regional Red': LIQUID.redWine,
  Sparkling: LIQUID.paleStraw,
  Sherry: LIQUID.amber,
  Dessert: LIQUID.amber,
  'Fortified Wine': LIQUID.amber,
  Vermouth: LIQUID.amber,
  Port: LIQUID.deepRed,
  'Rosé': LIQUID.rose,
  Sake: LIQUID.clear,
  'Skin-Contact': LIQUID.orange,
};

const SPIRIT_RULES: [RegExp, string][] = [
  [b('amaro|fernet|averna|cynar|jager|becherovka|unicum'), LIQUID.darkBrown],
  [b('campari|aperol|bitter rosso'), LIQUID.orange],
  [b('chambord|cassis|framboise|raspberry|sloe|hibiscus'), LIQUID.pink],
  [b('limoncello|limoncino'), LIQUID.straw],
  [
    b(
      'whisk|bourbon|rye|scotch|islay|speyside|highland|cognac|armagnac|brandy|calvados|dark rum|aged rum|rhum vieux|extra a[ñn]ejo|solera|a[ñn]ejo|reposado',
    ),
    LIQUID.amber,
  ],
  [b('gold rum|dorado|oro'), LIQUID.gold],
  [
    b(
      'gin|vodka|blanco|silver|plata|white rum|cacha[cç]a|soju|shochu|baijiu|aquavit|grappa|pisco|joven|new make|moonshine|korn|arak|ouzo|raki|absinthe',
    ),
    LIQUID.clear,
  ],
];

/** Generic tasting-note signals — weakest, checked last. */
const NOTE_RULES: [RegExp, string][] = [
  [b('ginger|mule|dark and stormy'), LIQUID.straw],
  [b('chocolate|cocoa|molasses'), LIQUID.darkBrown],
  [b('cherry|strawberry|cranberry|cosmopolitan|watermelon|guava|rhubarb'), LIQUID.pink],
  [b('berry|grape|plum|fig|blackcurrant|blackberry'), LIQUID.violet],
  [b('apple|pear|cucumber|basil|herbal|celery|kiwi'), LIQUID.green],
  [b('peach|apricot|mango|pineapple|passion|tiki|papaya'), LIQUID.orange],
  [b('orange|aperitif|paloma|grapefruit|marmalade'), LIQUID.orange],
  [b('honey|caramel|vanilla|toffee|butterscotch|maple|almond'), LIQUID.gold],
  [b('citrus|lime|lemon|margarita|daiquiri|gimlet|sour|yuzu'), LIQUID.paleStraw],
];

const CATEGORY_DEFAULT: Record<Drink['category'], string> = {
  cocktail: LIQUID.straw,
  beer: LIQUID.gold,
  wine: LIQUID.redWine,
  spirit: LIQUID.amber,
};

function firstMatch(rules: [RegExp, string][], text: string): string | undefined {
  for (const [re, color] of rules) {
    if (re.test(text)) return color;
  }
  return undefined;
}

/**
 * The pour color for a drink.
 *
 * Derived from the drink's own words rather than a lookup table, so new
 * entries get a sensible color without anyone maintaining a list of 460.
 *
 * Beer and wine read STYLE only (name + subcategory). Cocktails and
 * spirits also read tasting notes, where notes genuinely do signal color —
 * a cocktail described as "cherry, almond" really is red.
 *
 * Cocktails deliberately skip SPIRIT_RULES: a cocktail's words routinely
 * name its base spirit, and matching those paints the finished drink the
 * color of the bottle it came from — a Whiskey Sour is not neat whiskey.
 */
export function liquidColor(
  drink: Pick<Drink, 'name' | 'category' | 'subcategory' | 'tastingNotes'>,
): string {
  const style = `${drink.name} ${drink.subcategory}`.toLowerCase();
  const full = [drink.name, drink.subcategory, ...(drink.tastingNotes ?? [])]
    .join(' ')
    .toLowerCase();

  switch (drink.category) {
    case 'beer':
      return (
        firstMatch(BEER_NAME_RULES, style) ??
        BEER_BY_SUBCATEGORY[drink.subcategory] ??
        CATEGORY_DEFAULT.beer
      );
    case 'wine':
      return (
        firstMatch(WINE_NAME_RULES, style) ??
        WINE_BY_SUBCATEGORY[drink.subcategory] ??
        CATEGORY_DEFAULT.wine
      );
    case 'spirit':
      return (
        firstMatch([...SIGNATURE, ...SPIRIT_RULES, ...NOTE_RULES], full) ?? CATEGORY_DEFAULT.spirit
      );
    case 'cocktail':
      return firstMatch([...SIGNATURE, ...NOTE_RULES], full) ?? CATEGORY_DEFAULT.cocktail;
  }
}
