import { CATEGORY_META, colors, RARITY_META } from '@/constants/theme';
import type { UserProfile } from '@/types';

/**
 * Seeded demo accounts.
 *
 * These are fictional characters, not real users — the feed is local-only
 * until the Supabase backend lands. Mirrors the shape of a `profiles`
 * table so swapping to real rows is a data-source change.
 */

export const ME_ID = 'me';

export const ME: UserProfile = {
  id: ME_ID,
  username: 'you',
  displayName: 'You',
  accent: colors.goldInk,
  bio: 'Collecting one pour at a time.',
  joinedAt: '2026-07-16T00:00:00Z',
};

export const PEOPLE: UserProfile[] = [
  ME,
  {
    id: 'u-maya',
    username: 'maya.pours',
    displayName: 'Maya Ortiz',
    accent: CATEGORY_META.cocktail.color,
    bio: 'Hotel bars and old menus. Sherry apologist.',
    joinedAt: '2026-05-02T00:00:00Z',
  },
  {
    id: 'u-henry',
    username: 'hopheadhenry',
    displayName: 'Henry Kwon',
    accent: CATEGORY_META.beer.color,
    bio: 'Beer first. 100 styles or bust.',
    joinedAt: '2026-04-18T00:00:00Z',
  },
  {
    id: 'u-sofia',
    username: 'sofiadrinks',
    displayName: 'Sofía Reyes',
    accent: CATEGORY_META.wine.color,
    bio: 'Wine buyer. Ask me about Jerez.',
    joinedAt: '2026-03-27T00:00:00Z',
  },
  {
    id: 'u-dev',
    username: 'devonpours',
    displayName: 'Devon Clarke',
    accent: CATEGORY_META.spirit.color,
    bio: 'Agave, always. Mezcal > everything.',
    joinedAt: '2026-06-09T00:00:00Z',
  },
  {
    id: 'u-lena',
    username: 'lena.b',
    displayName: 'Lena Brandt',
    accent: RARITY_META.uncommon.color,
    bio: 'Home bartender. Terrible at garnishes.',
    joinedAt: '2026-06-21T00:00:00Z',
  },
  {
    id: 'u-theo',
    username: 'theo.nightcap',
    displayName: 'Theo Marsh',
    accent: RARITY_META.rare.color,
    bio: 'One nightcap, logged nightly.',
    joinedAt: '2026-02-14T00:00:00Z',
  },
];

export const PEOPLE_BY_ID: Record<string, UserProfile> = Object.fromEntries(
  PEOPLE.map((p) => [p.id, p]),
);

/** Never returns undefined — unknown authors fall back to a neutral profile. */
export function profileFor(id: string): UserProfile {
  return (
    PEOPLE_BY_ID[id] ?? {
      id,
      username: id,
      displayName: id,
      accent: RARITY_META.common.color,
      joinedAt: '2026-01-01T00:00:00Z',
    }
  );
}

/** Who you follow at first launch. */
export const INITIAL_FOLLOWING = ['u-maya', 'u-henry', 'u-sofia'];
