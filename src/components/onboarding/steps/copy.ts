import type { Flavour, HeardFrom, HomeAnswer, Spirit, StyleOf, TasteAnswers } from '@/store/taste';

import type { Option } from './Choices';

/* ==================================================================== */
/* The flow's words (specs/v4.1-changes.md 1.2; index.html)             */
/*                                                                      */
/* Sentence case throughout, no capitals typed in, curly apostrophes.   */
/* An option's label is the same text VoiceOver reads.                  */
/* ==================================================================== */

export const HELLO = 'Welcome! Let’s find your drinks.';
export const AGE = 'Are you of legal drinking age where you live?';
export const HEARD = 'How did you hear about Sipply?';
export const USUALLY = 'What do you usually drink?';
export const SPIRITS = 'Which spirits do you like?';
export const SPIRITS_SUB = 'Pick up to 5. You can change them later.';
export const FLAVOURS = 'How do you like your drinks?';
export const FLAVOURS_SUB = 'Pick up to 3.';
export const HOME = 'Do you make drinks at home?';
export const BAR = 'Tick what’s in your bar.';
export const BAR_SUB = 'I’ll show you what you can make. You can add the rest in My Bar.';
export const ALL_SET = 'All set! Let’s keep your picks.';

/** The most a multi choice takes (spec 1.2). */
export const MAX_SPIRITS = 5;
export const MAX_FLAVOURS = 3;

export type AgeAnswer = 'yes' | 'no';

export const AGE_OPTIONS: readonly Option<AgeAnswer>[] = [
  { key: 'yes', label: 'Yes, I am' },
  { key: 'no', label: 'No, not yet' },
];

export const HEARD_OPTIONS: readonly Option<HeardFrom>[] = [
  { key: 'friend', label: 'A friend' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'app-store', label: 'The App Store' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'google', label: 'Google' },
  { key: 'other', label: 'Something else' },
];

export type DrinksAnswer = NonNullable<TasteAnswers['drinks']>;

export const USUALLY_OPTIONS: readonly Option<DrinksAnswer>[] = [
  { key: 'cocktails', label: 'Cocktails' },
  { key: 'spirits', label: 'Spirits, neat or on ice' },
  { key: 'both', label: 'Both' },
];

export const SPIRIT_OPTIONS: readonly Option<Spirit>[] = [
  { key: 'gin', label: 'Gin' },
  { key: 'rum', label: 'Rum' },
  { key: 'agave', label: 'Tequila and mezcal' },
  { key: 'whiskey', label: 'Whiskey' },
  { key: 'vodka', label: 'Vodka' },
  { key: 'brandy', label: 'Brandy and cognac' },
  { key: 'liqueur', label: 'Liqueurs and amaro' },
];

export const FLAVOUR_OPTIONS: readonly Option<Flavour>[] = [
  { key: 'refreshing', label: 'Refreshing' },
  { key: 'sour', label: 'Sour and citrusy' },
  { key: 'sweet', label: 'Sweet' },
  { key: 'bitter', label: 'Bitter' },
  { key: 'strong', label: 'Strong and stirred' },
  { key: 'creamy', label: 'Creamy' },
];

export const HOME_OPTIONS: readonly Option<HomeAnswer>[] = [
  { key: 'never', label: 'Never' },
  { key: 'sometimes', label: 'Sometimes' },
  { key: 'often', label: 'Often' },
];

/** The follow-up's word, in bold in its question. */
const FOLLOW_WORD: Record<StyleOf, string> = { whiskey: 'whiskey', rum: 'rum', agave: 'tequila' };

export function followUpPrompt(styleOf: StyleOf): string {
  return `Which **${FOLLOW_WORD[styleOf]}** do you reach for?`;
}

/** The follow-up's options, by STYLES key, as the spec words them. */
const STYLE_LABEL: Record<string, string> = {
  bourbon: 'Bourbon',
  rye: 'Rye',
  scotch: 'Scotch',
  irish: 'Irish whiskey',
  japanese: 'Japanese whisky',
  white: 'White rum',
  aged: 'Aged or dark rum',
  agricole: 'Rhum agricole or cachaça',
  spiced: 'Spiced rum',
  blanco: 'Blanco',
  reposado: 'Reposado',
  anejo: 'Añejo',
  mezcal: 'Mezcal',
};

/** A style's label, or the recommender's own word with its first letter raised. */
export function followLabel(key: string, fallback: string): string {
  return STYLE_LABEL[key] ?? (fallback ? fallback[0]!.toUpperCase() + fallback.slice(1) : key);
}

/** "That’s 574 drinks in the Dex that match." */
export function matchWords(n: number, formatted: string) {
  return n === 1
    ? { before: 'That’s ', figure: formatted, after: ' drink in the Dex that matches.' }
    : { before: 'That’s ', figure: formatted, after: ' drinks in the Dex that match.' };
}

/** "You can make 17 drinks with this.", or the line for a bar that makes nothing yet. */
export function makeWords(n: number, formatted: string) {
  if (n === 0) return { before: 'Nothing yet. One more bottle opens up more.' };
  return n === 1
    ? { before: 'You can make ', figure: formatted, after: ' drink with this.' }
    : { before: 'You can make ', figure: formatted, after: ' drinks with this.' };
}
