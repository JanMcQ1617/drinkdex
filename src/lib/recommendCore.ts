/* ==================================================================== */
/* The onboarding recommender, data in, picks out                       */
/*                                                                      */
/* A line-for-line port of specs/v4.2/tools/recommend.mjs (the          */
/* reference, v4-onboarding spec §5 with v4.2 §1.2's fruity and the     */
/* strength cap of Decided 5; specs/v4-onboarding/tools/recommend.mjs   */
/* is the same file), so the picks on a phone are the picks in the      */
/* spec's example runs. Every function below keeps the reference's name,*/
/* order of operations and arithmetic order: the scores are compared to */
/* the reference's to the bit by scripts/check-recommend.mjs, which     */
/* transpiles THIS file and runs it in Node beside the reference.       */
/*                                                                      */
/* NO RUNTIME IMPORTS. Type imports only, so the check script can load  */
/* the file on its own. The data comes in through createRecommender:    */
/* lib/recommend binds it to the app's catalogue, bar index and photos; */
/* the check script binds it to the same JSON the reference reads.      */
/*                                                                      */
/* Where the port differs from the reference, and why (none changes an  */
/* output for answers the store can hold):                              */
/*   - lookups are Maps, not plain objects, so a hostile id never finds */
/*     Object.prototype ('constructor');                                */
/*   - an unknown style or flavour key is skipped instead of throwing;  */
/*   - the classics signal C comes in per drink id (data.classics),     */
/*     worked out from the catalogue by scripts/check-recommend.mjs     */
/*     --write into data/classics.json. The app never reads the field   */
/*     it is made from (check-design rule 14): it is a hidden weight,   */
/*     never shown (spec §5.3, step 5).                                 */
/*                                                                      */
/* The bar logic is the reference's exact-id missingCount, NOT          */
/* lib/bar's matchBar, so the picks and makeNow match bit for bit. The  */
/* bar step's on-screen count is matchBar's (v4.1 §2.2).                */
/*                                                                      */
/* DETERMINISTIC: no randomness, no clock. Ties go to the curated order */
/* of the first tastes, then the lower Dex number.                      */
/* ==================================================================== */

import type { Flavour, Goal, HomeAnswer, Spirit, StyleOf } from '@/store/taste';

/* ------------------------------------------------------------------ */
/* The data it closes over                                             */
/* ------------------------------------------------------------------ */

/** The catalogue fields the recommender reads. The app's Drink satisfies it. */
export interface RecDrink {
  id: string;
  dexNumber: number;
  name: string;
  category: 'cocktail' | 'spirit';
  subcategory: string;
  abv?: string;
  origin: string;
  tastingNotes?: readonly string[];
}

/** A bar-index ingredient, as data/barIndex.json writes it. */
export interface RecIngredient {
  id: string;
  label: string;
  shelf?: string;
  family?: string;
  category?: string;
}

/** A bar-index recipe: each slot is the ids any one of which fills it. */
export interface RecRecipe {
  id: string;
  slots: readonly (readonly string[])[];
}

export interface RecommenderData {
  /** Sorted by Dex number (the reference's pool order). */
  drinks: readonly RecDrink[];
  ingredients: readonly RecIngredient[];
  recipes: readonly RecRecipe[];
  /** Ids with a catalogue photograph (data/drinkPhotos). */
  photoIds: ReadonlySet<string>;
  /** lib/tastes' curated classics, in order: the "well known" signal and the tie-break. */
  knownIds: readonly string[];
  /** The classics signal C (0 to 1) per drink id; a missing id is 0. */
  classics: Readonly<Record<string, number>>;
}

/** What the answers look like to the recommender. TasteAnswers satisfies it. */
export interface RecAnswers {
  goal?: Goal | null;
  drinks?: 'cocktails' | 'spirits' | 'both' | null;
  spirits?: readonly Spirit[];
  styleOf?: StyleOf | null;
  styles?: readonly string[];
  flavours?: readonly Flavour[];
  home?: HomeAnswer | null;
  bar?: readonly string[];
  /** Drinks never to pick (the Dex, after onboarding). */
  exclude?: readonly string[];
}

/** One pick, as the reference returns it. */
export interface RecPick {
  id: string;
  name: string;
  dexNumber: number;
  category: 'cocktail' | 'spirit';
  subcategory: string;
  abv: string | undefined;
  photo: boolean;
  makeNow: boolean;
  why: string;
  score: number;
}

export interface RecBarRow {
  id: string;
  label: string;
  ticked: boolean;
}

/** score()'s answer for one drink. */
export interface Scored {
  d: RecDrink;
  total: number;
  /** [spirit or style label | null, flavour label?]: the spirit slot is always first. */
  why: (string | null)[];
  makeNow: boolean;
  photo: boolean;
}

/* ------------------------------------------------------------------ */
/* The answers                                                         */
/* ------------------------------------------------------------------ */

export interface SpiritChoice {
  label: string;
  family: string | null;
  subcats: readonly string[];
  extraIds?: readonly string[];
}

/** The seven spirit choices and what each means in the catalogue. */
export const SPIRITS: Record<Spirit, SpiritChoice> = {
  gin: { label: 'gin', family: 'gin', subcats: ['Gin', 'Genever'] },
  rum: { label: 'rum', family: 'rum', subcats: ['Rum', 'Cane Spirit'], extraIds: ['cachaca'] },
  agave: { label: 'tequila', family: 'tequila', subcats: ['Agave'] },
  whiskey: { label: 'whiskey', family: 'whiskey', subcats: ['American Whiskey', 'Scotch', 'Irish Whiskey', 'World Whisky'] },
  vodka: { label: 'vodka', family: 'vodka', subcats: ['Vodka'] },
  brandy: { label: 'brandy', family: 'brandy', subcats: ['Brandy', 'Fruit Brandy', 'Pomace Brandy'] },
  liqueur: { label: 'liqueurs', family: null, subcats: ['Liqueur', 'Amaro', 'Herbal Liqueur'] },
};

export interface StyleChoice {
  label: string;
  ids: string[];
  spirit: (d: RecDrink) => boolean;
}

/** The follow-up, asked for the FIRST of whiskey, rum, agave that was picked. */
export const STYLES: Record<StyleOf, Record<string, StyleChoice>> = {
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

export interface FlavourChoice {
  label: string;
  subcats: readonly string[];
  notes: readonly string[];
  abvMax?: number;
  abvMin?: number;
  ids?: readonly string[];
  /** Above this abv only the family says it: the notes and the recipe count for nothing (v4.2). */
  noteAbvMax?: number;
}

/** The seven flavour choices: the style families that ARE it, and the note words that SAY it. */
export const FLAVOURS: Record<Flavour, FlavourChoice> = {
  refreshing: {
    label: 'refreshing',
    subcats: ['Highball', 'Spritz', 'Fizz', 'Julep & Cobbler', 'Sparkling', 'Frozen'],
    notes: ['mint', 'cucumber', 'soda', 'tonic', 'quinine', 'ginger', 'effervescence', 'sparkling', 'crisp', 'refreshing', 'prosecco', 'grapefruit', 'light citrus', 'clean'],
    abvMax: 15,
  },
  // v4.2 Decided 5: the strength cap fruity has. Above 30% only the family (Sour) says it, so
  // a bare 40% bottle whose notes say "citrus" or "lemon" (Tequila Blanco, Ouzo, Cognac VS) is
  // not a sour, while a Daiquiri is (its family) and a Paloma still is (its notes).
  sour: {
    label: 'sour',
    subcats: ['Sour'],
    notes: ['lime', 'lemon', 'citrus', 'tart', 'sour', 'grapefruit', 'yuzu', 'sour cherry', 'passionfruit'],
    noteAbvMax: 30,
  },
  // v4.2 §1.2 (Jan: "fruity or sour"). Fruit that is not citrus, which is sour's: the fruit-led
  // families, the fresh-fruit note words (never the dried and sherried notes a whisky carries,
  // nor plain "cherry", the maraschino on every Manhattan) and the fruit juices, purees, syrups
  // and liqueurs a recipe names (never grenadine, maraschino liqueur or the orange liqueurs).
  // noteAbvMax 30: a 40% Speyside that says "orchard fruit, pear" is not fruity, a fruit brandy
  // is (its family), and so is a 16.5% Chambord (its notes).
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
/* Weights                                                             */
/* ------------------------------------------------------------------ */

export const W = { base: 0.4, style: 0.25, flavour: 0.3, photo: 0.15, known: 0.1 } as const;
export const W_CLASSIC: Record<Goal | 'null', number> = { track: 0.3, discover: 0.1, home: 0.2, friends: 0.2, null: 0.2 };

export const PICKS = 6 as const;

/** "16–18%" → 17; "40%" → 40; unknown → null. */
export function abvOf(d: Pick<RecDrink, 'abv'>): number | null {
  const nums = String(d.abv ?? '').match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length === 0) return null;
  return nums.length === 1 ? nums[0]! : (nums[0]! + nums[1]!) / 2;
}

/** The "why" line's flavour phrases. */
const LIKE: Record<Flavour, string> = {
  refreshing: 'something refreshing',
  sour: 'sours',
  fruity: 'fruity drinks',
  sweet: 'sweet drinks',
  bitter: 'bitter',
  strong: 'strong drinks',
  creamy: 'creamy drinks',
};

/** Answers with `exclude` held as a Set, as the reference's recommend() makes them. */
type Prepared = Omit<RecAnswers, 'exclude'> & { exclude: ReadonlySet<string> };

const BAR_SPIRIT_IDS: Record<Spirit, string> = {
  gin: 'gin',
  rum: 'white-rum',
  agave: 'tequila',
  whiskey: 'bourbon',
  vodka: 'vodka',
  brandy: 'cognac',
  liqueur: 'campari',
};

/** The bar rows' extras, led by the flavours: bitter → Campari, strong → sweet vermouth and bitters, and so on. */
const BAR_BY_FLAVOUR: Record<Flavour, readonly string[]> = {
  bitter: ['campari'],
  strong: ['sweet-vermouth', 'angostura-bitters'],
  sour: ['triple-sec'],
  fruity: ['pineapple-juice'],
  refreshing: ['ginger-beer'],
  sweet: ['grenadine'],
  creamy: ['coffee-liqueur'],
};

const BAR_BASICS = ['lime', 'lemon', 'sugar-syrup', 'soda-water'] as const;

/* ------------------------------------------------------------------ */
/* The recommender                                                     */
/* ------------------------------------------------------------------ */

export function createRecommender(data: RecommenderData) {
  const DRINKS = data.drinks;
  const PHOTOS = data.photoIds;
  const KNOWN_ORDER = data.knownIds;
  const KNOWN = new Set(KNOWN_ORDER);
  const KNOWN_INDEX = new Map<string, number>();
  KNOWN_ORDER.forEach((id, i) => {
    if (!KNOWN_INDEX.has(id)) KNOWN_INDEX.set(id, i);
  });
  /** Tie-break: the curated order (Piña Colada first), then Dex number. */
  const knownRank = (id: string) => (KNOWN.has(id) ? KNOWN_INDEX.get(id)! : 99);
  const ING = new Map(data.ingredients.map((i) => [i.id, i] as const));
  const RECIPE = new Map(data.recipes.map((r) => [r.id, r] as const));
  const classicOf = (id: string) =>
    Object.prototype.hasOwnProperty.call(data.classics, id) ? data.classics[id]! : 0;

  /* ---- Facts about a drink, worked out once ---- */

  /** Every recipe ingredient id, generics included. */
  function idsOf(d: RecDrink): Set<string> {
    return new Set((RECIPE.get(d.id)?.slots ?? []).flat());
  }

  /** The first spirits-shelf bottle's family (lib/bar baseSpirit), or 'none'. */
  function baseSpirit(d: RecDrink): string {
    for (const slot of RECIPE.get(d.id)?.slots ?? []) {
      const s = slot.map((id) => ING.get(id)).find((i) => i?.shelf === 'spirits');
      if (s) return s.family ?? 'other';
    }
    return 'none';
  }

  /** Which spirit choices a drink is, and whether it is the drink's base or only in it. */
  function spiritHits(d: RecDrink): Map<Spirit, number> {
    const hits = new Map<Spirit, number>(); // choice → 1 (base / the bottle itself) | 0.6 (in it)
    const entries = Object.entries(SPIRITS) as [Spirit, SpiritChoice][];
    if (d.category === 'spirit') {
      for (const [k, s] of entries) if (s.subcats.includes(d.subcategory)) hits.set(k, 1);
      return hits;
    }
    const base = baseSpirit(d);
    const ids = idsOf(d);
    for (const [k, s] of entries) {
      if (s.family && s.family === base) hits.set(k, 1);
      else if (s.family && [...ids].some((id) => ING.get(id)?.family === s.family)) hits.set(k, 0.6);
      else if (s.extraIds?.some((id) => ids.has(id))) hits.set(k, base === 'other' ? 1 : 0.6);
    }
    if ([...ids].some((id) => ING.get(id)?.category === 'liqueur')) hits.set('liqueur', Math.max(hits.get('liqueur') ?? 0, base === 'none' ? 1 : 0.6));
    return hits;
  }

  /** 0, 0.5 or 1: how plainly a drink is this flavour. */
  function flavourHit(d: RecDrink, f: Flavour): number {
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

  /* ---- Bar ---- */

  /** Slots unmet with this bar (exact ids): 0 = you can make it now. */
  function missingCount(d: RecDrink, bar: ReadonlySet<string>): number {
    const r = RECIPE.get(d.id);
    if (!r || bar.size === 0) return Infinity;
    return r.slots.filter((slot) => !slot.some((id) => bar.has(id))).length;
  }

  /** How many cocktails this bar makes, by the reference's rule (kept for the check script). */
  function makeableCount(barIds: readonly string[]): number {
    const bar = new Set(barIds);
    return DRINKS.filter((d) => missingCount(d, bar) === 0).length;
  }

  /** The bar checklist's eight rows and which start ticked (spec §5.5). */
  function barRows(answers: RecAnswers): RecBarRow[] {
    const style = answers.styles?.[0];
    const styleId = style && answers.styleOf ? (STYLES[answers.styleOf]?.[style]?.ids[0] ?? null) : null;
    const picked = (answers.spirits ?? []).map((s) => (s === answers.styleOf && styleId ? styleId : BAR_SPIRIT_IDS[s]));
    const spirits = picked.length ? picked.slice(0, 3) : ['white-rum', 'tequila', 'gin'];
    const basics = BAR_BASICS;
    // The two extra rows follow the flavours: bitter → Campari, strong → sweet vermouth and bitters, and so on.
    const extras = [...new Set([...(answers.flavours ?? []).flatMap((f) => BAR_BY_FLAVOUR[f] ?? []), 'angostura-bitters', 'sweet-vermouth', 'triple-sec', 'ginger-beer'])].filter((id) => !spirits.includes(id));
    const rows = [...spirits, ...basics, ...extras].slice(0, 8);
    const ticked = new Set<string>([...spirits, ...basics]);
    return rows.map((id) => ({ id, label: ING.get(id)?.label ?? id, ticked: ticked.has(id) }));
  }

  /* ---- The score ---- */

  function score(d: RecDrink, a: Prepared, bar: ReadonlySet<string>): Scored | null {
    // 1. Category gate.
    if (a.drinks === 'cocktails' && d.category !== 'cocktail') return null;
    if (a.drinks === 'spirits' && d.category === 'cocktail' && d.subcategory !== 'Spirit-Forward') return null;
    // Fortified wines are in the catalogue as spirits; never the opening pick for anyone.
    if (['Sherry', 'Port', 'Vermouth', 'Fortified'].includes(d.subcategory)) return null;
    if (a.exclude?.has(d.id)) return null;

    const why: (string | null)[] = [];
    // 2. Base spirit.
    let base = 0.5;
    let baseLabel: string | null = null;
    if (a.spirits?.length) {
      const hits = spiritHits(d);
      let best = 0;
      for (const s of a.spirits) if ((hits.get(s) ?? 0) > best) { best = hits.get(s)!; baseLabel = SPIRITS[s].label; }
      base = best;
      if (best === 0) return null; // picked spirits are a filter, not a hint
    }
    // 3. Follow-up style.
    let style = 0;
    if (a.styleOf && a.styles?.length) {
      const ids = idsOf(d);
      for (const st of a.styles) {
        const S = STYLES[a.styleOf]?.[st];
        if (!S) continue;
        if (d.category === 'spirit' ? S.spirit(d) : S.ids.some((id) => ids.has(id))) { style = 1; baseLabel = S.label; break; }
      }
    }
    // Always the first slot (null without a spirit), so a flavour never reads as the spirit in whyLine.
    why.push(baseLabel);
    // 4. Flavour.
    let flavour = 0.5;
    if (a.flavours?.length) {
      const hits = a.flavours.map((f) => [f, flavourHit(d, f)] as const);
      flavour = hits.reduce((s, [, h]) => s + h, 0) / hits.length;
      const top = hits.filter(([, h]) => h > 0).sort((x, y) => y[1] - x[1])[0];
      if (top) why.push(FLAVOURS[top[0]].label);
    }
    // 5. Classics and photo.
    const classic = classicOf(d.id);
    const photo = PHOTOS.has(d.id) ? 1 : 0;
    // 6. Home bar.
    let home = 0;
    const miss = missingCount(d, bar);
    if (a.home === 'often') home = miss === 0 ? 0.15 : miss === 1 ? 0.05 : 0;
    if (a.home === 'sometimes') home = miss === 0 ? 0.08 : miss === 1 ? 0.03 : 0;
    if (a.goal === 'home' && d.category === 'cocktail' && (RECIPE.get(d.id)?.slots.length ?? 9) <= 4) home += 0.05;

    const known = KNOWN.has(d.id) ? 1 : 0;
    // Spirits people asked for bottles: a stirred cocktail is welcome, but after the bottles.
    const lean = a.drinks === 'spirits' && d.category === 'cocktail' ? -0.1 : 0;

    const total =
      W.base * base + W.style * style + W.flavour * flavour + W_CLASSIC[a.goal ?? 'null'] * classic +
      W.photo * photo + W.known * known + home + lean;
    return { d, total, why, makeNow: miss === 0, photo: !!photo };
  }

  /** The variety key: two picks never share one. */
  function familyKey(d: RecDrink): string {
    // Spirits: one style ("Bourbon") and one named bottle ("Buffalo Trace", ids ending -sb) per style family.
    if (d.category === 'spirit') return `s:${d.subcategory}:${d.id.endsWith('-sb') ? 'bottle' : 'style'}`;
    return `c:${baseSpirit(d)}:${d.subcategory}`;
  }

  /** Which spirit's share a pick uses: the bottle's own spirit (Scotch → whiskey), or the cocktail's base. */
  function shareKey(d: RecDrink): string {
    if (d.category === 'spirit') {
      const k = (Object.keys(SPIRITS) as Spirit[]).find((s) => SPIRITS[s].subcats.includes(d.subcategory));
      return k ? (SPIRITS[k].family ?? k) : d.subcategory;
    }
    return baseSpirit(d);
  }

  /** The "why" line under a pick's name. */
  function whyLine(r: Scored, a: Pick<RecAnswers, 'goal'>): string {
    const [spirit, flavour] = r.why;
    const key = flavour == null ? undefined : (Object.keys(FLAVOURS) as Flavour[]).find((k) => FLAVOURS[k].label === flavour);
    const f = flavour && key !== undefined ? LIKE[key] : undefined;
    if (spirit && f) return `Because you like ${spirit} and ${f}`;
    if (spirit) return `Because you like ${spirit}`;
    if (f) return `Because you like ${f}`;
    return a.goal === 'discover' ? 'A good place to start' : 'A classic to start with';
  }

  function prepare(answers: RecAnswers): Prepared {
    return { ...answers, exclude: new Set(answers.exclude ?? []) };
  }

  /**
   * The first picks. Greedy, best first, with variety caps:
   *   - one per family key (base spirit + style for cocktails, style for spirits) and two per
   *     subcategory, each with one more seat for a style the person asked for by flavour;
   *   - a fair share per picked spirit, bottles and cocktails together (shareKey);
   *   - 'both' keeps at least 2 cocktails and 2 spirits when the pool has them;
   *   - photo preference is in the score (0.15), and the first 3 picks must be
   *     photographed when 3 photographed candidates exist, so the screen opens on colour.
   */
  function recommend(answers: RecAnswers, n: number = PICKS): RecPick[] {
    const a = prepare(answers);
    const bar = new Set(a.bar ?? []);
    const pool = DRINKS.map((d) => score(d, a, bar))
      .filter((r): r is Scored => Boolean(r))
      .sort((x, y) => y.total - x.total || knownRank(x.d.id) - knownRank(y.d.id) || x.d.dexNumber - y.d.dexNumber);

    const out: Scored[] = [];
    const keys = new Map<string, number>();
    const perBase = new Map<string, number>();
    const perSub = new Map<string, number>();
    const perBottle = new Map<string, number>();
    const take = (r: Scored) => {
      out.push(r);
      perSub.set(r.d.subcategory, (perSub.get(r.d.subcategory) ?? 0) + 1);
      keys.set(familyKey(r.d), (keys.get(familyKey(r.d)) ?? 0) + 1);
      const b = shareKey(r.d);
      perBase.set(b, (perBase.get(b) ?? 0) + 1);
      if (r.d.category === 'spirit') perBottle.set(r.d.subcategory, (perBottle.get(r.d.subcategory) ?? 0) + 1);
    };
    const fits = (r: Scored) => {
      // A style the person asked for by flavour (strong → Spirit-Forward, sour → Sour) gets one more
      // seat: a strong-and-bitter gin drinker sees the Negroni AND the Martini, not a French 75.
      const asked = (a.flavours ?? []).some((f) => FLAVOURS[f]?.subcats.includes(r.d.subcategory)) ? 1 : 0;
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
      for (const cat of ['spirit', 'cocktail'] as const) {
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
  function matchingCount(answers: RecAnswers): number {
    const a: Prepared = { ...answers, exclude: new Set<string>() };
    return DRINKS.filter((d) => {
      const r = score(d, a, new Set());
      if (!r) return false;
      if (!a.flavours?.length) return true;
      return a.flavours.some((f) => flavourHit(d, f) >= 0.5);
    }).length;
  }

  /**
   * The pour step's collage: photographed drinks from the scored pool, best
   * first (the reference CLI's collage, by its sort: score alone, ties in
   * Dex order), topped up from the curated classics with photographs when
   * the pool has fewer than `n`. Ids only.
   */
  function collage(answers: RecAnswers, n = 12): string[] {
    const a = prepare(answers);
    const bar = new Set(a.bar ?? []);
    const ids = DRINKS.map((d) => score(d, a, bar))
      .filter((r): r is Scored => r !== null && r.photo)
      .sort((x, y) => y.total - x.total)
      .slice(0, n)
      .map((r) => r.d.id);
    if (ids.length < n) {
      const have = new Set(ids);
      const catalogue = new Set(DRINKS.map((d) => d.id));
      for (const id of KNOWN_ORDER) {
        if (ids.length >= n) break;
        if (!have.has(id) && PHOTOS.has(id) && catalogue.has(id)) {
          ids.push(id);
          have.add(id);
        }
      }
    }
    return ids;
  }

  return {
    abvOf,
    baseSpirit,
    spiritHits,
    flavourHit,
    missingCount,
    makeableCount,
    barRows,
    /** The reference's score(d, a, bar), with `exclude` as a list. */
    score: (d: RecDrink, answers: RecAnswers, bar: ReadonlySet<string>) => score(d, prepare(answers), bar),
    familyKey,
    shareKey,
    whyLine,
    recommend,
    matchingCount,
    collage,
  };
}

export type Recommender = ReturnType<typeof createRecommender>;
