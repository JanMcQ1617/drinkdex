export type DrinkCategory = 'cocktail' | 'spirit';

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

/** Home serving guide — spirits, including the fortified wines that mix */
export interface ServeGuide {
  temp: string;
  glass: string;
  how: string;
  pair?: string[];
}

export interface CompositionComponent {
  /**
   * Varies by what the thing is — Base/Distillation/Aging for a distilled
   * spirit, Grapes/Region/Vinification for the fortified wines that stayed
   * on the spirit shelf, so a sherry still reads as a sherry.
   */
  label: string;
  detail: string;
}

/**
 * What a drink is made of.
 *
 * Spirits carry this instead of a `recipe` — you don't build them, so a
 * step list would be a lie.
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
  /** Object path in the private `pours` bucket. Undefined = initials. */
  avatarPath?: string | null;
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
