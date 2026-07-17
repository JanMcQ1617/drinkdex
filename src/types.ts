export type DrinkCategory = 'cocktail' | 'beer' | 'wine' | 'spirit';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

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
}

export interface UnlockRecord {
  drinkId: string;
  /** Local URI of the user's proof photo (null only if photo was lost) */
  photoUri: string | null;
  /** ISO date of the unlock */
  date: string;
  note?: string;
}
