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
  recipe?: Recipe;
  serve?: ServeGuide;
}

/** A pour shared to the feed — yours or the community's. */
export interface Post {
  id: string;
  author: string;
  /** Emoji avatar */
  avatar: string;
  /** Avatar ring / accent color */
  accent: string;
  drinkId: string;
  caption: string;
  photoUri: string | null;
  createdAt: string;
  likes: number;
  mine?: boolean;
}

export interface UnlockRecord {
  drinkId: string;
  /** Local URI of the user's proof photo (null only if photo was lost) */
  photoUri: string | null;
  /** ISO date of the unlock */
  date: string;
  note?: string;
}
