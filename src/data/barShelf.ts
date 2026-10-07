import type { Ingredient, IngredientCategory } from '@/lib/bar';

/* ==================================================================== */
/* The back bar's furniture                                             */
/*                                                                      */
/* Where each ingredient stands on My Bar's shelves, in what order, and */
/* what it looks like there. Pure data: the art is drawn from these     */
/* names by components/bar/BottleArt.tsx, and the colours behind the    */
/* names live in components/bar/paint.ts.                               */
/*                                                                      */
/* Three shelves, as a home bar is stocked: spirits on top; liqueurs,   */
/* wine and syrups in the middle; and the RAIL for everything you reach */
/* for while mixing (bitters, mixers, citrus, juice, fresh things).      */
/*                                                                      */
/* Bottle art is drawn per TYPE, not per brand: about a dozen bottle    */
/* forms and a few fresh forms, coloured from a short table for the     */
/* common ingredients and by category for the rest. Labels carry a rule */
/* and a small device, never words, so no brand's label is imitated.    */
/* ==================================================================== */

export type ShelfKey = 'spirits' | 'middle' | 'rail';

export const SHELF_ORDER: readonly ShelfKey[] = ['spirits', 'middle', 'rail'];

/** What VoiceOver calls each shelf ("Spirits, 5 bottles"). */
export const SHELF_NAME: Record<ShelfKey, string> = {
  spirits: 'Spirits',
  middle: 'Liqueurs, wine and syrups',
  rail: 'The rail',
};

/*
 * Which shelf an ingredient stands on, from its category in the bar index.
 * Misfilings (ginger beer as a spirit, brands left in 'other') are put
 * right where the index is built, CATEGORY_OVERRIDE in
 * scripts/build-bar-index.mjs, so the shelves and the add sheet's chips
 * agree with every other reader of the index.
 */
export function shelfOf(i: Ingredient): ShelfKey {
  const c = i.category;
  if (c === 'spirit') return 'spirits';
  if (c === 'liqueur' || c === 'wine' || c === 'syrup') return 'middle';
  return 'rail';
}

/*
 * Order along a shelf: by family, then the most-used first. A bar groups
 * its bottles (the gins together, the whiskeys together), and the basics
 * land where the mockup put them: gin, vodka, white rum, bourbon; the two
 * vermouths, triple sec, syrup; bitters, soda, the citrus, mint.
 */
const FAMILY: Record<ShelfKey, RegExp[]> = {
  spirits: [
    /gin|genever|jenever|plymouth/,
    /vodka|zubrowka/,
    /rum|rhum|cachaca|arrack|pitorro/,
    /whisk|bourbon|rye|scotch|jack-daniel|jim-beam|johnnie/,
    /tequila|mezcal/,
    /brandy|cognac|armagnac|calvados|applejack|pisco/,
  ],
  middle: [
    /vermouth|campari|aperol|lillet|dubonnet|punt-e-mes|amer|cynar|suze|select|gancia|carpano/,
    /wine|champagne|prosecco|cava|sekt|port|sherry|sake|claret|cider|ale|lager|beer|stout|porter|pilsner/,
    /./, // liqueurs
  ],
  rail: [
    /bitters/,
    /soda|tonic|cola|ginger|water|lemonade|energy|tea|coffee|espresso/,
  ],
};

/** Syrups sit after the liqueurs on the middle shelf; citrus, juice, then fresh things on the rail. */
const CATEGORY_RANK: Partial<Record<IngredientCategory, number>> = {
  syrup: 9,
  citrus: 3,
  juice: 4,
  produce: 5,
  dairy: 6,
  spice: 7,
  savoury: 8,
  other: 9,
};

/** A sort key along the shelf (its family): lower stands further left. Ties go to the most used. */
export function shelfRank(i: Ingredient): number {
  const shelf = shelfOf(i);
  const fixed = shelf === 'spirits' ? undefined : CATEGORY_RANK[i.category];
  if (fixed != null) return fixed;
  const at = FAMILY[shelf].findIndex((re) => re.test(i.id));
  return at < 0 ? FAMILY[shelf].length : at;
}

/* ==================================================================== */
/* Looks                                                                */
/* ==================================================================== */

/** Bottle silhouettes (sizes in components/bar/BottleArt.tsx). */
export type BottleForm =
  | 'tall'
  | 'slim'
  | 'square'
  | 'whiskey'
  | 'rye'
  | 'wine'
  | 'aperitif'
  | 'squat'
  | 'agave'
  | 'dasher'
  | 'small'
  | 'beer';

/** Things on the rail that are not bottles. */
export type FreshForm =
  | 'lemon'
  | 'lime'
  | 'orange'
  | 'grapefruit'
  | 'fruit'
  | 'sprig'
  | 'siphon'
  | 'can'
  | 'carton'
  | 'egg'
  | 'jug'
  | 'jar';

/** Names for the liquid's colour, mapped to the artwork's LIQUID palette in paint.ts. */
export type Pour =
  | 'clear'
  | 'paleStraw'
  | 'straw'
  | 'gold'
  | 'amber'
  | 'copper'
  | 'brown'
  | 'darkBrown'
  | 'coffee'
  | 'redWine'
  | 'deepRed'
  | 'red'
  | 'rose'
  | 'whiteWine'
  | 'orange'
  | 'pink'
  | 'green'
  | 'mint'
  | 'blue'
  | 'violet'
  | 'cream'
  | 'milky';

export type Glass = 'clear' | 'frost' | 'green' | 'dark' | 'amber' | 'blue';
export type Ink = 'wine' | 'merlot' | 'espresso' | 'green' | 'blue' | 'taupe' | 'copper';
export type Cap = 'espresso' | 'wine' | 'metal' | 'cork' | 'gold' | 'red' | 'green';

export interface BottleLook {
  kind: 'bottle';
  form: BottleForm;
  pour: Pour;
  glass?: Glass;
  /** How full, 0..1 of the body. */
  fill?: number;
  /** Label: `dark` paper (rye, cognac) or the default bone; a band in `band` ink. */
  dark?: boolean;
  band?: Ink;
  cap?: Cap;
  /** A wax seal run down the neck (bourbon). */
  wax?: boolean;
}

export interface FreshLook {
  kind: 'fresh';
  form: FreshForm;
  /** The colour of the thing (a can's paint, a carton's juice, a jar's contents). */
  tint?: Pour;
}

export type Look = BottleLook | FreshLook;

const b = (form: BottleForm, pour: Pour, rest: Omit<BottleLook, 'kind' | 'form' | 'pour'> = {}): BottleLook => ({
  kind: 'bottle',
  form,
  pour,
  ...rest,
});
const f = (form: FreshForm, tint?: Pour): FreshLook => ({ kind: 'fresh', form, tint });

/** The common ingredients, one by one. Everything else takes its category's look (lookOf). */
const LOOKS: Record<string, Look> = {
  // Spirits
  gin: b('square', 'clear', { glass: 'frost', band: 'green', cap: 'metal' }),
  'old-tom-gin': b('square', 'paleStraw', { glass: 'frost', band: 'wine', cap: 'espresso' }),
  'london-dry-gin': b('square', 'clear', { glass: 'frost', band: 'blue', cap: 'metal' }),
  vodka: b('slim', 'clear', { cap: 'espresso' }),
  'white-rum': b('tall', 'clear', { band: 'blue', cap: 'espresso' }),
  rum: b('tall', 'gold', { band: 'wine', cap: 'espresso' }),
  'gold-rum': b('tall', 'gold', { band: 'espresso', cap: 'espresso' }),
  'dark-rum': b('tall', 'darkBrown', { dark: true, band: 'copper', cap: 'espresso' }),
  'aged-rum': b('squat', 'copper', { band: 'espresso', cap: 'cork' }),
  'demerara-rum': b('tall', 'brown', { band: 'wine', cap: 'espresso' }),
  'jamaican-rum': b('tall', 'amber', { band: 'green', cap: 'espresso' }),
  'coconut-rum': b('tall', 'milky', { glass: 'frost', cap: 'espresso' }),
  'overproof-rum': b('tall', 'gold', { band: 'wine', cap: 'red' }),
  cachaca: b('tall', 'clear', { band: 'green', cap: 'gold' }),
  whiskey: b('whiskey', 'amber', { band: 'espresso', cap: 'espresso' }),
  bourbon: b('whiskey', 'amber', { band: 'espresso', cap: 'wine', wax: true }),
  'rye-whiskey': b('rye', 'copper', { dark: true, band: 'taupe', cap: 'espresso' }),
  'scotch-whisky': b('whiskey', 'gold', { band: 'espresso', cap: 'espresso' }),
  'irish-whiskey': b('rye', 'gold', { band: 'green', cap: 'gold' }),
  'canadian-whisky': b('whiskey', 'amber', { band: 'wine', cap: 'gold' }),
  'japanese-whisky': b('square', 'amber', { band: 'espresso', cap: 'espresso' }),
  tequila: b('agave', 'paleStraw', { band: 'copper', cap: 'cork' }),
  'silver-tequila': b('agave', 'clear', { band: 'blue', cap: 'cork' }),
  'reposado-tequila': b('agave', 'gold', { band: 'copper', cap: 'cork' }),
  'anejo-tequila': b('agave', 'amber', { dark: true, band: 'taupe', cap: 'cork' }),
  mezcal: b('agave', 'clear', { glass: 'green', band: 'espresso', cap: 'cork' }),
  brandy: b('squat', 'copper', { band: 'wine', cap: 'espresso' }),
  cognac: b('squat', 'copper', { dark: true, cap: 'espresso' }),
  armagnac: b('squat', 'brown', { band: 'espresso', cap: 'cork' }),
  calvados: b('squat', 'amber', { band: 'green', cap: 'cork' }),
  applejack: b('tall', 'amber', { band: 'wine', cap: 'espresso' }),
  pisco: b('tall', 'clear', { band: 'copper', cap: 'metal' }),
  'apricot-brandy': b('squat', 'orange', { band: 'copper', cap: 'espresso' }),
  absinthe: b('tall', 'green', { glass: 'green', cap: 'espresso' }),
  aquavit: b('slim', 'paleStraw', { band: 'blue', cap: 'metal' }),
  // Liqueurs
  campari: b('aperitif', 'red', { cap: 'espresso' }),
  aperol: b('aperitif', 'orange', { cap: 'espresso' }),
  'triple-sec': b('squat', 'orange', { glass: 'amber', cap: 'espresso' }),
  'orange-curacao': b('squat', 'amber', { glass: 'amber', band: 'wine', cap: 'espresso' }),
  curacao: b('squat', 'amber', { glass: 'amber', cap: 'espresso' }),
  'grand-marnier': b('squat', 'amber', { band: 'wine', cap: 'red', wax: true }),
  'blue-curacao': b('aperitif', 'blue', { cap: 'espresso' }),
  'maraschino-liqueur': b('wine', 'clear', { glass: 'green', band: 'wine', cap: 'red' }),
  benedictine: b('squat', 'amber', { dark: true, band: 'wine', cap: 'red', wax: true }),
  'green-chartreuse': b('squat', 'green', { cap: 'espresso' }),
  'yellow-chartreuse': b('squat', 'gold', { cap: 'espresso' }),
  falernum: b('small', 'straw', { cap: 'cork' }),
  'creme-de-cacao': b('tall', 'darkBrown', { band: 'copper', cap: 'espresso' }),
  'coffee-liqueur': b('tall', 'coffee', { dark: true, band: 'taupe', cap: 'red' }),
  kahlua: b('tall', 'coffee', { dark: true, band: 'taupe', cap: 'red' }),
  amaretto: b('squat', 'copper', { glass: 'amber', cap: 'espresso' }),
  cynar: b('aperitif', 'darkBrown', { band: 'green', cap: 'espresso' }),
  'fernet-branca': b('aperitif', 'darkBrown', { glass: 'dark', band: 'espresso', cap: 'espresso' }),
  'irish-cream': b('squat', 'cream', { glass: 'dark', band: 'green', cap: 'gold' }),
  'creme-de-menthe': b('tall', 'mint', { cap: 'espresso' }),
  'white-creme-de-menthe': b('tall', 'clear', { band: 'green', cap: 'espresso' }),
  'lillet-blanc': b('wine', 'whiteWine', { band: 'copper', cap: 'gold' }),
  'creme-de-cassis': b('small', 'deepRed', { cap: 'espresso' }),
  'peach-schnapps': b('tall', 'paleStraw', { band: 'copper', cap: 'espresso' }),
  'sloe-gin': b('square', 'redWine', { band: 'wine', cap: 'espresso' }),
  'creme-de-violette': b('small', 'violet', { cap: 'gold' }),
  galliano: b('slim', 'gold', { cap: 'gold' }),
  'st-germain-elderflower-liqueur': b('square', 'paleStraw', { band: 'copper', cap: 'gold' }),
  'elderflower-liqueur': b('square', 'paleStraw', { band: 'copper', cap: 'gold' }),
  jagermeister: b('square', 'darkBrown', { glass: 'dark', band: 'copper', cap: 'espresso' }),
  'melon-liqueur': b('tall', 'green', { cap: 'espresso' }),
  midori: b('tall', 'green', { cap: 'espresso' }),
  limoncello: b('slim', 'straw', { cap: 'gold' }),
  chambord: b('squat', 'violet', { cap: 'gold' }),
  'banana-liqueur': b('tall', 'straw', { cap: 'espresso' }),
  'punt-e-mes': b('wine', 'darkBrown', { glass: 'dark', band: 'wine', cap: 'espresso' }),
  dubonnet: b('wine', 'redWine', { glass: 'dark', band: 'wine', cap: 'gold' }),
  'dubonnet-rouge': b('wine', 'redWine', { glass: 'dark', band: 'wine', cap: 'gold' }),
  pastis: b('slim', 'gold', { band: 'blue', cap: 'gold' }),
  anisette: b('slim', 'clear', { band: 'blue', cap: 'gold' }),
  sambuca: b('slim', 'clear', { band: 'wine', cap: 'gold' }),
  kirsch: b('slim', 'clear', { band: 'wine', cap: 'red' }),
  advocaat: b('squat', 'straw', { glass: 'frost', cap: 'gold' }),
  // Wine and beer
  vermouth: b('wine', 'amber', { band: 'merlot', cap: 'gold' }),
  'sweet-vermouth': b('wine', 'darkBrown', { glass: 'dark', band: 'merlot', cap: 'wine' }),
  'dry-vermouth': b('wine', 'paleStraw', { glass: 'green', band: 'green', cap: 'metal' }),
  'blanc-vermouth': b('wine', 'whiteWine', { band: 'taupe', cap: 'gold' }),
  champagne: b('wine', 'straw', { glass: 'green', cap: 'gold' }),
  prosecco: b('wine', 'paleStraw', { glass: 'green', cap: 'gold' }),
  'sparkling-wine': b('wine', 'paleStraw', { glass: 'green', cap: 'gold' }),
  cava: b('wine', 'paleStraw', { glass: 'green', cap: 'gold' }),
  'red-wine': b('wine', 'redWine', { glass: 'dark', cap: 'wine' }),
  'white-wine': b('wine', 'whiteWine', { glass: 'green', cap: 'metal' }),
  'rose-wine': b('wine', 'rose', { cap: 'metal' }),
  'port-wine': b('wine', 'deepRed', { glass: 'dark', band: 'espresso', cap: 'wine' }),
  'ruby-port': b('wine', 'deepRed', { glass: 'dark', band: 'espresso', cap: 'wine' }),
  'tawny-port': b('wine', 'amber', { glass: 'dark', band: 'espresso', cap: 'cork' }),
  sherry: b('wine', 'amber', { band: 'wine', cap: 'cork' }),
  'fino-sherry': b('wine', 'paleStraw', { band: 'green', cap: 'cork' }),
  sake: b('slim', 'clear', { glass: 'frost', band: 'wine', cap: 'metal' }),
  lager: b('beer', 'straw', { glass: 'amber', cap: 'gold' }),
  beer: b('beer', 'gold', { glass: 'amber', cap: 'gold' }),
  ale: b('beer', 'amber', { glass: 'amber', cap: 'red' }),
  'mexican-lager': b('beer', 'paleStraw', { cap: 'gold' }),
  cider: b('beer', 'straw', { glass: 'green', cap: 'metal' }),
  'hard-cider': b('beer', 'straw', { glass: 'green', cap: 'metal' }),
  // Syrups
  'sugar-syrup': b('small', 'clear', { cap: 'cork' }),
  grenadine: b('small', 'red', { cap: 'espresso' }),
  orgeat: b('small', 'milky', { cap: 'cork' }),
  'honey-syrup': b('small', 'gold', { cap: 'cork' }),
  'agave-syrup': b('small', 'straw', { cap: 'espresso' }),
  'maple-syrup': b('small', 'copper', { cap: 'red' }),
  'demerara-syrup': b('small', 'amber', { cap: 'cork' }),
  'passionfruit-syrup': b('small', 'orange', { cap: 'espresso' }),
  'raspberry-syrup': b('small', 'pink', { cap: 'espresso' }),
  honey: f('jar', 'gold'),
  'brown-sugar': f('jar', 'copper'),
  // Bitters
  'angostura-bitters': b('dasher', 'darkBrown', { glass: 'dark', cap: 'red' }),
  'orange-bitters': b('dasher', 'orange', { glass: 'amber', cap: 'gold' }),
  'peychaud-s-bitters': b('dasher', 'red', { cap: 'espresso' }),
  // Mixers
  'soda-water': f('siphon'),
  'tonic-water': b('small', 'clear', { glass: 'green', cap: 'metal' }),
  cola: f('can', 'red'),
  'ginger-beer': f('can', 'straw'),
  'ginger-ale': f('can', 'green'),
  'energy-drink': f('can', 'blue'),
  lemonade: f('carton', 'straw'),
  'grapefruit-soda': f('can', 'pink'),
  coffee: f('jar', 'coffee'),
  espresso: f('jar', 'coffee'),
  'black-tea': f('jar', 'copper'),
  // Citrus
  lemon: f('lemon'),
  lime: f('lime'),
  orange: f('orange'),
  grapefruit: f('grapefruit'),
  // Juice
  'pineapple-juice': f('carton', 'gold'),
  'cranberry-juice': f('carton', 'red'),
  'tomato-juice': f('carton', 'red'),
  'apple-juice': f('carton', 'straw'),
  'passionfruit-juice': f('carton', 'orange'),
  // Fresh
  mint: f('sprig'),
  cucumber: f('fruit', 'green'),
  pineapple: f('fruit', 'gold'),
  strawberries: f('fruit', 'red'),
  banana: f('fruit', 'straw'),
  ginger: f('fruit', 'straw'),
  'maraschino-cherry': f('fruit', 'red'),
  // Dairy and eggs
  'egg-white': f('egg'),
  'egg-yolk': f('egg'),
  'whole-egg': f('egg'),
  eggs: f('egg'),
  cream: f('jug', 'cream'),
  milk: f('jug', 'milky'),
  'condensed-milk': f('jar', 'cream'),
  'coconut-cream': f('jar', 'milky'),
  'whipped-cream': f('jug', 'milky'),
  // Spices and savoury
  nutmeg: f('jar', 'copper'),
  cinnamon: f('jar', 'brown'),
  cloves: f('jar', 'darkBrown'),
  'worcestershire-sauce': b('dasher', 'darkBrown', { glass: 'dark', cap: 'gold' }),
  'hot-sauce': b('dasher', 'red', { cap: 'green' }),
  tabasco: b('dasher', 'red', { cap: 'green' }),
};

const HERB = /mint|basil|sage|thyme|rosemary|tarragon|leaf|leaves|lemongrass|shiso|verbena|rue/;
const CITRUS_LIKE = /lemon|lime|orange|grapefruit|yuzu|mandarin|clementine|citrus|calamansi/;

/** A spirit the table does not name, by what its id says it is. */
function spiritLook(id: string): Look {
  if (/gin|genever|jenever|plymouth/.test(id)) return b('square', 'clear', { glass: 'frost', band: 'green', cap: 'metal' });
  if (/vodka|zubrowka|soju|shochu|baijiu/.test(id)) return b('slim', 'clear', { cap: 'espresso' });
  if (/rum|rhum|cachaca|pitorro/.test(id)) return b('tall', /white|blanc|silver/.test(id) ? 'clear' : 'amber', { band: 'wine', cap: 'espresso' });
  if (/whisk|bourbon|rye|scotch|jack|beam|johnnie/.test(id)) return b('whiskey', 'amber', { band: 'espresso', cap: 'espresso' });
  if (/tequila|mezcal|agave/.test(id)) return b('agave', 'paleStraw', { band: 'copper', cap: 'cork' });
  if (/brandy|cognac|armagnac|calvados|pisco|grappa|rakija|palinka/.test(id)) return b('squat', /pisco|grappa|eau/.test(id) ? 'clear' : 'copper', { band: 'wine', cap: 'espresso' });
  return b('tall', 'clear', { band: 'taupe', cap: 'espresso' });
}

const looked = new Map<string, Look>();

/**
 * The look of any ingredient: its own entry, else its category's. One
 * object per id, made once, so a memoised bay sees the same look on every
 * render.
 */
export function lookOf(i: Ingredient): Look {
  let look = looked.get(i.id);
  if (!look) {
    look = Object.prototype.hasOwnProperty.call(LOOKS, i.id) ? LOOKS[i.id]! : fallbackLook(i);
    looked.set(i.id, look);
  }
  return look;
}

function fallbackLook(i: Ingredient): Look {
  switch (i.category) {
    case 'spirit':
      return spiritLook(i.id);
    case 'liqueur':
      return b('squat', 'amber', { band: 'wine', cap: 'espresso' });
    case 'wine':
      if (/beer|ale|lager|stout|porter|pilsner|weisse|cider/.test(i.id)) return b('beer', 'gold', { glass: 'amber', cap: 'gold' });
      if (/vermouth/.test(i.id)) return b('wine', 'amber', { band: 'merlot', cap: 'gold' });
      if (/red|port|claret|burgundy/.test(i.id)) return b('wine', 'redWine', { glass: 'dark', cap: 'wine' });
      return b('wine', 'whiteWine', { glass: 'green', cap: 'metal' });
    case 'bitters':
      return b('dasher', 'darkBrown', { glass: 'dark', cap: 'red' });
    case 'citrus':
      if (/lime/.test(i.id)) return f('lime');
      if (/grapefruit/.test(i.id)) return f('grapefruit');
      if (/orange|mandarin|clementine/.test(i.id)) return f('orange');
      if (/soda|ade/.test(i.id)) return f('can', 'straw');
      return f('lemon');
    case 'juice':
      return f('carton', /tomato|cranberry|pomegranate|blood/.test(i.id) ? 'red' : /apple|pear/.test(i.id) ? 'straw' : 'orange');
    case 'syrup':
      return b('small', 'straw', { cap: 'cork' });
    case 'mixer':
      if (/water|soda/.test(i.id)) return b('small', 'clear', { glass: 'green', cap: 'metal' });
      if (/tea|coffee|chocolate/.test(i.id)) return f('jar', 'coffee');
      return f('can', 'straw');
    case 'dairy':
      return /egg/.test(i.id) ? f('egg') : f('jug', 'cream');
    case 'produce':
      if (HERB.test(i.id)) return f('sprig');
      if (CITRUS_LIKE.test(i.id)) return f('lemon');
      return f('fruit', /berr|cherr|straw|raspb|pomegran/.test(i.id) ? 'red' : /cucumber|apple|pear|kiwi/.test(i.id) ? 'green' : 'gold');
    case 'spice':
      return f('jar', 'copper');
    case 'savoury':
      return b('dasher', 'red', { cap: 'green' });
    default:
      return HERB.test(i.id) ? f('sprig') : f('jar', 'straw');
  }
}

/**
 * What a shelf label says, in lines: one line, unless the label is two
 * words past ten letters ("Rye / whiskey", "Sweet / vermouth"), so a tag is
 * never wider than its bottle needs. Longer names break where the bay's
 * width allows (components/bar/layout.ts works the lines out).
 */
export const LABEL_SPLIT_AT = 10;
