import type { Drink, DrinkCategory, Rarity } from '@/types';

/** Dark speakeasy palette */
export const colors = {
  bg: '#0E0B08',
  surface: '#18130F',
  card: '#211A14',
  cardBorder: '#2E251C',
  cardBorderLit: '#453722',
  text: '#F4EDE3',
  textMuted: '#A39683',
  textFaint: '#6E6355',
  gold: '#D4AF37',
  goldDim: '#8A7223',
  danger: '#D95C4A',
  overlay: 'rgba(8, 6, 4, 0.72)',
} as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayBlack: 'Fraunces_900Black',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const CATEGORY_ORDER: DrinkCategory[] = ['cocktail', 'beer', 'wine', 'spirit'];

export const CATEGORY_META: Record<
  DrinkCategory,
  { label: string; plural: string; color: string; emoji: string; blurb: string }
> = {
  cocktail: { label: 'Cocktail', plural: 'Cocktails', color: '#EF6C57', emoji: '🍸', blurb: 'Mixed & stirred' },
  beer: { label: 'Beer', plural: 'Beers', color: '#E8A33D', emoji: '🍺', blurb: 'Brewed & poured' },
  wine: { label: 'Wine', plural: 'Wines', color: '#B04A6E', emoji: '🍷', blurb: 'Pressed & aged' },
  spirit: { label: 'Spirit', plural: 'Spirits', color: '#9C7BD4', emoji: '🥃', blurb: 'Distilled & bold' },
};

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export const RARITY_META: Record<Rarity, { label: string; color: string; weight: number }> = {
  common: { label: 'Common', color: '#9AA3AE', weight: 0 },
  uncommon: { label: 'Uncommon', color: '#57C785', weight: 1 },
  rare: { label: 'Rare', color: '#5B8DD9', weight: 2 },
  legendary: { label: 'Legendary', color: '#D4AF37', weight: 3 },
};

/** Best-effort emoji glyph for a drink, based on its glassware + category. */
export function drinkGlyph(drink: Pick<Drink, 'category' | 'glassware' | 'subcategory'>): string {
  const g = (drink.glassware ?? '').toLowerCase();
  const s = drink.subcategory.toLowerCase();
  if (g.includes('flute') || g.includes('champagne')) return '🥂';
  if (g.includes('coupe') || g.includes('martini') || g.includes('nick')) return '🍸';
  if (g.includes('tiki') || g.includes('hurricane') || s.includes('tiki')) return '🍹';
  if (g.includes('copper') || g.includes('mug') && drink.category === 'cocktail') return '🥤';
  if (g.includes('sake') || s.includes('sake')) return '🍶';
  if (g.includes('shot')) return '🥃';
  switch (drink.category) {
    case 'cocktail':
      return '🍸';
    case 'beer':
      return '🍺';
    case 'wine':
      return '🍷';
    case 'spirit':
      return '🥃';
  }
}
