export type DrinkCategory = 'cocktail' | 'spirit';

/** @deprecated rarity, removed in v3.1; deleted at the close-out. Nothing in src/ reads it. */
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
  /**
   * @deprecated rarity, removed in v3.1. drinks.json keeps the field (the
   * generators still write it), but nothing in src/ reads it; the close-out
   * deletes it here, which makes tsc prove that.
   */
  rarity: Rarity;
  tastingNotes: string[];
  glassware?: string;
  /** Core spec ingredients — cocktails only */
  ingredients?: string[];
  funFact: string;
  /**
   * Where and when the drink began, who is credited and how it got its name:
   * one researched paragraph, written by the origin-story phase and merged by
   * scripts/merge-origin-stories.mjs (spec v3.1 §18). Absent until then, and
   * for any drink no defensible story could be written for; the drink page's
   * Origin story band falls back to funFact. Once a drink has one, its
   * funFact is no longer shown.
   */
  originStory?: string;
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
  /** The signed-in user saved this post (saves table). */
  savedByMe?: boolean;
  commentCount?: number;
  /** True when authored by the signed-in user. */
  mine?: boolean;
}

/**
 * A song on a story: one Apple Music catalog song, as the apple-music Edge
 * Function returns it (spec v3.1 §13.2). Defined here so the post and the
 * pour can carry one; lib/music.ts re-exports it.
 *
 * Stored on the photo row (post_photos), not the post: a drink is one post,
 * and a re-post with no song must not inherit last month's.
 */
export interface Song {
  /** Apple Music catalog song id, digits. */
  id: string;
  title: string;
  artist: string;
  album: string | null;
  /** https://isN-ssl.mzstatic.com/..., sized 300x300. Shown only beside a playable preview. */
  artworkUrl: string | null;
  /** The 30-second preview, https://audio-ssl.itunes.apple.com/... */
  previewUrl: string;
  /** The song in Apple Music, https://music.apple.com/... Always on screen beside a preview. */
  appleMusicUrl: string;
  durationMs: number | null;
  /** The two-letter storefront it was found in ("us"). */
  storefront: string;
}

/** One photo shared to a post in the last 24 hours (recent_pours). */
export interface Pour {
  postId: string;
  authorId: string;
  drinkId: string;
  path: string;
  /** ISO */
  at: string;
  /**
   * The song added with this photo (migration 020), or null: none was
   * added, the server predates 020, or the row is missing any field a
   * preview needs.
   */
  music: Song | null;
}

/* ------------------------------------------------------------------ */
/* Tournaments (migration 020)                                         */
/*                                                                     */
/* Friends compete to try the most DIFFERENT drinks: each distinct     */
/* drink a member posts during the window counts once, at most three   */
/* new ones a day. Standings are computed on the server from posts;     */
/* nothing here is a count of how much anyone drinks.                  */
/* ------------------------------------------------------------------ */

/** 'finished' only once the results are frozen (finalize_tournament). */
export type TournamentState = 'upcoming' | 'live' | 'finished';

/** The caller's place in it. The host is always 'host', never 'accepted'. */
export type TournamentRole = 'host' | 'invited' | 'accepted' | 'declined';

/** One row of my_tournaments(): a tournament you host or were invited to. */
export interface TournamentSummary {
  id: string;
  name: string;
  hostId: string;
  /** ISO */
  startsAt: string;
  /** ISO, exclusive: the last instant that counts is just before it. */
  endsAt: string;
  /** First to this many different drinks; null = most by the end. */
  target: number | null;
  /** When counting stopped (its end, the host ending it, or the goal); null until frozen. */
  finishedAt: string | null;
  /** Null when nobody posted, before it finishes, or when the winner is someone you are blocked with. */
  winnerId: string | null;
  winnerDistinct: number | null;
  state: TournamentState;
  myStatus: TournamentRole;
  /** Accepted members, host included. */
  members: number;
  /** Your place and count; null while you have not joined. */
  myRank: number | null;
  myDistinct: number | null;
}

/** One accepted member's line in the standings. */
export interface Standing {
  userId: string;
  /** Different drinks counted. */
  distinct: number;
  /** How many of those counted today (the tournament's day). 0 once frozen. */
  today: number;
  /** When they reached their current count: the tie-break, earlier first. */
  reachedAt: string | null;
  /** 1 is first. Gaps where someone you are blocked with is left out. */
  rank: number;
}

/** tournament_board(): one tournament, as its page shows it. */
export interface TournamentBoard
  extends Omit<TournamentSummary, 'members' | 'myRank' | 'myDistinct' | 'winnerDistinct'> {
  /** The host ended it early. */
  endedAt: string | null;
  /** New drinks that count per member per day (the server's constant, 3). */
  dailyCap: number;
  /** The winner is someone you are blocked with: say so, never who. */
  winnerHidden: boolean;
  /** In rank order; anyone you are blocked with is left out. */
  standings: Standing[];
  /** User ids still invited, oldest invitation first. */
  invited: string[];
}

/**
 * One row of Activity: a like on one of your posts, or a new follower.
 * `key` is unique across both kinds (`like:<post>:<user>`, `follow:<user>`),
 * so a list can key on it directly.
 */
export type ActivityItem =
  | {
      kind: 'like';
      key: string;
      actorId: string;
      postId: string;
      drinkId: string;
      photoPath: string | null;
      at: string;
    }
  | { kind: 'follow'; key: string; actorId: string; at: string };

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

/* ------------------------------------------------------------------ */
/* Drinks people add themselves                                        */
/*                                                                     */
/* A custom drink lives in its own store, never in the collection's    */
/* unlocks, and is sent to the server as a suggestion (the              */
/* drink_submissions table, migration 018).                             */
/* ------------------------------------------------------------------ */

/**
 * Where a custom drink stands with the server.
 *
 *   'local'     — signed out when it was saved; sent once someone signs in.
 *   'pending'   — waiting to be sent, or sent and not yet acknowledged.
 *   'synced'    — the server holds this version.
 *   'refused'   — the server's checks or content filter refused a field
 *                 (named in `syncDetail`); an edit sends it again.
 *   'quota'     — 30 suggestions in 30 days; it retries on its own.
 *   'duplicate' — this account already suggested a drink with this name.
 */
export type CustomSync = 'local' | 'pending' | 'synced' | 'refused' | 'quota' | 'duplicate';

/** Jan's verdict on a suggestion: drink_submissions.status. */
export type SubmissionStatus = 'new' | 'added' | 'duplicate' | 'declined';

export interface CustomDrinkFields {
  name: string;
  category: DrinkCategory;
  subcategory: string;
  subcategoryIsNew: boolean;
  description: string;
  abvLow: number | null;
  abvHigh: number | null;
  origin: string;
  glassware: string;
  tastingNotes: string[];
  funFact: string;
  // Cocktail only.
  ingredients: RecipeIngredient[];
  steps: string[];
  method: string;
  garnish: string;
  // Spirit only.
  base: string;
  distillation: string;
  aging: string;
  serveTemp: string;
  serveHow: string;
  pairings: string[];
  process: string;
  noteForTeam: string;
}

export interface CustomDrink extends CustomDrinkFields {
  /** 'u_<uuid>'. The uuid doubles as the drink_submissions primary key. */
  id: string;
  createdAt: string;
  updatedAt: string;
  /** FILE NAME under Documents/custom/, never an absolute uri: the container path changes on update. */
  photoFile: string | null;
  /** Which photoFile the server copy is of. */
  uploadedPhotoFile: string | null;
  /** '<uid>/submission-<uuid>-<ts>.jpg' in `pours`. */
  photoPath: string | null;
  /** Uid that owns the server row; null = never sent. */
  submittedBy: string | null;
  /**
   * Whether the server row exists, so the next write is an update. Never an
   * upsert: the quota trigger fires on an upsert's insert half even when
   * the row is already there, so every edit would count against the quota.
   */
  everInserted: boolean;
  sync: CustomSync;
  /** The column the server refused, for the status line. */
  syncDetail?: string;
  status: SubmissionStatus;
  catalogueId: string | null;
}
