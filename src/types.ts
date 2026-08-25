export type DrinkCategory = 'cocktail' | 'beer' | 'wine' | 'spirit';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface RecipeIngredient {
  item: string;
  amount: string;
}

/** Make-at-home build — cocktails only */
export interface Recipe {
  ingredients: RecipeIngredient[];
  steps: string[];
  garnish?: string;
  method?: string;
}

/** Home serving guide — beers, wines, and spirits */
export interface ServeGuide {
  temp: string;
  glass: string;
  how: string;
  pair?: string[];
}

export interface CompositionComponent {
  /**
   * Varies by category — Malt/Hops/Yeast for beer, Grapes/Region/Vinification
   * for wine, Base/Distillation/Aging for spirits. Sake, filed under wine but
   * brewed from rice, overrides "Grapes" with "Rice".
   */
  label: string;
  detail: string;
}

/**
 * What a drink is made of.
 *
 * Beers, wines, and spirits carry this instead of a `recipe` — you don't
 * build them, so a step list would be a lie.
 */
export interface Composition {
  summary: string;
  components: CompositionComponent[];
  process: string;
}

export interface Drink {
  id: string;
  dexNumber: number;
  name: string;
  category: DrinkCategory;
  subcategory: string;
  description: string;
  abv: string;
  origin: string;
  rarity: Rarity;
  tastingNotes: string[];
  glassware?: string;
  /** Core spec ingredients — cocktails only */
  ingredients?: string[];
  funFact: string;
  /** Cocktails: how to build it. */
  recipe?: Recipe;
  /** Non-cocktails: how to serve it. */
  serve?: ServeGuide;
  /** Non-cocktails: what it's made of. */
  composition?: Composition;
}

/* ------------------------------------------------------------------ */
/* Wine atlas                                                          */
/*                                                                     */
/* Reference, not collection. The Dex is 460 authored cards you go out  */
/* and collect; the atlas is the map behind them — every named wine and */
/* every grape variety, so a wine card has somewhere to point.          */
/* Nothing here carries a dexNumber.                                    */
/* ------------------------------------------------------------------ */

export type WineStyle =
  | 'Red'
  | 'White'
  | 'Rosé'
  | 'Sparkling'
  | 'Sparkling Red'
  | 'Sparkling Rosé'
  | 'Sweet White'
  | 'Sweet Red'
  | 'Sweet Rosé'
  | 'Fortified'
  | 'Orange'
  | 'Vin Jaune'
  | 'Various';

export type GrapeColor = 'Red' | 'White' | 'Pink';

/**
 * A named wine: an appellation, a protected denomination (AOC, DOCG, DO,
 * AVA, GI, WO, PDO) or a classic style. Not a producer's label — those
 * number in the millions and cannot be enumerated.
 *
 * Keys are short because this ships 1,558 of them in the bundle.
 */
export interface AtlasWine {
  /** Name. */
  n: string;
  /** Index into WineAtlas.countries. */
  c: number;
  /** Region. */
  r: string;
  /** Classification tier, as that country records it. */
  t: string;
  /** Style. */
  s: WineStyle;
  /** Indices into WineAtlas.grapes. */
  g: number[];
}

export interface AtlasCountry {
  name: string;
  /** One line of orientation. */
  note: string;
  /** How many atlas wines it holds. */
  wines: number;
}

export interface AtlasGrape {
  name: string;
  color: GrapeColor;
  /** Where the variety is from, not where it is grown. */
  origin: string;
  /** Regional names folded into this entry — Shiraz under Syrah. */
  synonyms: string[];
  note: string;
  /** Indices into WineAtlas.wines. */
  wines: number[];
  /** Indices into WineAtlas.countries. */
  countries: number[];
}

/** What a wine Dex card points at in the atlas. */
export interface AtlasLink {
  /** Indices into WineAtlas.wines. */
  wines: number[];
  /** Index into WineAtlas.grapes, for cards that are a variety. */
  grape: number | null;
  /** Why this card has nothing to link to — sake, vermouth. */
  absent?: string;
}

export interface WineAtlas {
  version: number;
  generated: string;
  note: string;
  counts: {
    wines: number;
    countries: number;
    regions: number;
    grapes: number;
    /** Canonical varieties plus every synonym. */
    grapeNames: number;
  };
  countries: AtlasCountry[];
  grapes: AtlasGrape[];
  wines: AtlasWine[];
}

/* ------------------------------------------------------------------ */
/* Social                                                              */
/*                                                                     */
/* Shaped to mirror the eventual Supabase schema one-to-one — profiles, */
/* posts, follows, likes — so swapping the local store for real queries */
/* is a data-source change, not a rewrite.                              */
/* ------------------------------------------------------------------ */

export interface UserProfile {
  id: string;
  /** Without the leading @. */
  username: string;
  displayName: string;
  /** Avatar ring and initials background. */
  accent: string;
  bio?: string;
  joinedAt: string;
}

/** A pour shared to the feed. */
export interface Post {
  id: string;
  authorId: string;
  drinkId: string;
  caption: string;
  /** Local proof-photo URI. Always null on server-sourced posts — see `photoPath`. */
  photoUri: string | null;
  /** Storage object key in the private `pours` bucket; read via a signed URL. */
  photoPath?: string | null;
  /**
   * Every photo on this post, NEWEST FIRST. `photoPath` is the first of
   * these — kept as its own field because the feed, the profile grid and the
   * tiles all read it, so the denormalised preview meant none of them had to
   * change when posts gained multiple photos.
   */
  photoPaths?: string[];
  createdAt: string;
  likes: number;
  likedByMe?: boolean;
  commentCount?: number;
  /** True when authored by the signed-in user. */
  mine?: boolean;
}

/** Directed edge — mirrors a `follows` table. */
export interface Follow {
  followerId: string;
  followingId: string;
  since: string;
}

export interface UnlockRecord {
  drinkId: string;
  /** Local URI of the user's proof photo (null only if photo was lost) */
  photoUri: string | null;
  /** ISO date of the unlock */
  date: string;
  note?: string;
}
