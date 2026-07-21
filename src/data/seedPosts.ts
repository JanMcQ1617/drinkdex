import type { Post } from '@/types';

/**
 * Starter community feed.
 *
 * Local-only fiction — these are seeded demo accounts (see people.ts), not
 * real users. When the Supabase backend lands these get replaced wholesale
 * by real rows. Every `drinkId` must exist in drinks.json; validated by
 * scripts/check-seed.mjs.
 */
export const SEED_POSTS: Post[] = [
  {
    id: 'seed-01',
    authorId: 'u-maya',
    drinkId: 'sherry-cobbler',
    caption:
      'LEGENDARY pull at a hotel bar in Old San Juan. The bartender was impressed I even asked for it.',
    photoUri: null,
    createdAt: '2026-07-17T21:40:00Z',
    likes: 41,
    commentCount: 6,
  },
  {
    id: 'seed-02',
    authorId: 'u-henry',
    drinkId: 'schwarzbier',
    caption:
      'Black lager, first entry of the weekend. Roasty but it drinks light — do not sleep on this style.',
    photoUri: null,
    createdAt: '2026-07-17T19:05:00Z',
    likes: 17,
    commentCount: 2,
  },
  {
    id: 'seed-03',
    authorId: 'u-lena',
    drinkId: 'porn-star-martini',
    caption:
      'The passion fruit one. Yes it comes with a champagne sidecar. Yes I logged both sips.',
    photoUri: null,
    createdAt: '2026-07-17T02:15:00Z',
    likes: 33,
    commentCount: 8,
  },
  {
    id: 'seed-04',
    authorId: 'u-dev',
    drinkId: 'tequila-blanco',
    caption: 'Neat blanco, no lime, no salt. Trust the plant.',
    photoUri: null,
    createdAt: '2026-07-16T23:30:00Z',
    likes: 25,
    commentCount: 4,
  },
  {
    id: 'seed-05',
    authorId: 'u-maya',
    drinkId: 'moscow-mule',
    caption: 'Copper mug check. Ginger beer was properly spicy for once.',
    photoUri: null,
    createdAt: '2026-07-16T20:12:00Z',
    likes: 12,
    commentCount: 1,
  },
  {
    id: 'seed-06',
    authorId: 'u-theo',
    drinkId: 'american-porter',
    caption: 'Porter + a thunderstorm on the porch. Cozy entry no. 3 this month.',
    photoUri: null,
    createdAt: '2026-07-16T01:48:00Z',
    likes: 19,
    commentCount: 3,
  },
  {
    id: 'seed-07',
    authorId: 'u-lena',
    drinkId: 'seelbach',
    caption:
      'RARE unlock — the "lost" Louisville cocktail that turned out to be a hoax and stayed delicious anyway.',
    photoUri: null,
    createdAt: '2026-07-15T22:00:00Z',
    likes: 38,
    commentCount: 11,
  },
  {
    id: 'seed-08',
    authorId: 'u-sofia',
    drinkId: 'ruby-port',
    caption:
      'Ended the dinner party with ruby port and blue cheese. Instant classic pairing, zero regrets.',
    photoUri: null,
    createdAt: '2026-07-15T04:20:00Z',
    likes: 22,
    commentCount: 5,
  },
  {
    id: 'seed-09',
    authorId: 'u-henry',
    drinkId: 'miami-vice',
    caption: 'Half piña colada, half strawberry daiquiri, zero shame. Beach rules apply.',
    photoUri: null,
    createdAt: '2026-07-14T21:10:00Z',
    likes: 29,
    commentCount: 7,
  },
  {
    id: 'seed-10',
    authorId: 'u-lena',
    drinkId: 'london-dry-gin',
    caption: 'Tasting flight night: London dry, straight, learning to actually name the botanicals.',
    photoUri: null,
    createdAt: '2026-07-14T02:33:00Z',
    likes: 14,
    commentCount: 2,
  },
  {
    id: 'seed-11',
    authorId: 'u-sofia',
    drinkId: 'nigori',
    caption: 'Cloudy sake with spicy takeout. The haze is the point.',
    photoUri: null,
    createdAt: '2026-07-13T23:55:00Z',
    likes: 16,
    commentCount: 3,
  },
  {
    id: 'seed-12',
    authorId: 'u-dev',
    drinkId: 'grasshopper',
    caption:
      'Retro night. Grasshopper is basically drinkable mint chip and I will not be taking questions.',
    photoUri: null,
    createdAt: '2026-07-13T01:05:00Z',
    likes: 27,
    commentCount: 9,
  },
];
