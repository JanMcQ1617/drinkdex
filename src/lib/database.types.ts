/**
 * Shape of the tables in supabase/schema.sql.
 *
 * Hand-written rather than generated: generating requires a personal
 * access token we don't have, and the schema is small enough that drift
 * is easy to spot. If you change schema.sql, change this too.
 *
 * Type aliases, not interfaces: supabase-js constrains the schema against
 * `Record<string, …>`, and an interface has no implicit index signature, so
 * declaring these as interfaces silently collapses every insert and update
 * argument to `never`.
 */

export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  accent: string;
  bio: string | null;
  /**
   * Object path in the private `pours` bucket. Null = initials fallback.
   *
   * OPTIONAL, not merely nullable: a client running ahead of migration 010
   * stops requesting the column entirely, so rows come back without the
   * key at all rather than with null in it.
   */
  avatar_path?: string | null;
  created_at: string;
};

/**
 * Discovery hashes, in their own table since migration 008.
 *
 * Declared for documentation only — no client role holds any grant on
 * profile_secrets, so this is never selected, inserted or updated from the
 * app. It is reached exclusively through set_phone_hash /
 * set_instagram_hash and the two hash matchers, match_contacts and
 * match_instagram, all SECURITY DEFINER. match_facebook_friends never
 * reads it: it matches on auth.identities instead.
 */
export type ProfileSecretRow = {
  user_id: string;
  phone_hash: string | null;
  instagram_hash: string | null;
  updated_at: string;
};

export type PostRow = {
  id: string;
  author_id: string;
  drink_id: string;
  caption: string;
  photo_path: string | null;
  created_at: string;
};

export type BlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

/**
 * A report names exactly ONE subject: a post, a reel or a person. That is
 * enforced when the report is filed (prepare_report trigger, migration 012,
 * widened to reels by 019). A report outlives its reporter and its subject:
 * each column is set to null on deletion, and reported_author_id plus
 * snapshot keep what a moderator needs.
 */
export type ReportRow = {
  id: string;
  reporter_id: string | null;
  reported_post_id: string | null;
  reported_user_id: string | null;
  /** The reported reel (migration 019). Set to null when the reel is deleted. */
  reported_reel_id: string | null;
  /** Who wrote the reported post or reel, or the reported person. No foreign key, so it survives them. */
  reported_author_id: string | null;
  /**
   * The caption, drink and date of the post or reel, and the author's name
   * and bio, as they stood when it was filed. Since 019 it also says which
   * kind of subject it was ('post', 'reel' or 'account').
   */
  snapshot: { [key: string]: unknown } | null;
  reason: string;
  note: string | null;
  created_at: string;
};

export type PostPhotoRow = {
  id: string;
  post_id: string;
  path: string;
  /** When the picture was taken. Orders the carousel, newest first. */
  taken_at: string;
  created_at: string;
};

export type FollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

export type LikeRow = {
  post_id: string;
  user_id: string;
  created_at: string;
};

/**
 * An invite link's token (migration 011).
 *
 * The link carries this random token rather than the inviter's user id, so
 * a link cannot be forged for someone who never sent one. Every column has a
 * server default — inviter_id is auth.uid() — so the client creates one
 * with an empty insert and reads the token back.
 */
export type InviteRow = {
  token: string;
  inviter_id: string;
  created_at: string;
  expires_at: string;
};

/**
 * A saved post (migration 017): a private bookmark, readable by its owner
 * only. Insert names the two ids; created_at is the server's.
 */
export type SaveRow = {
  user_id: string;
  post_id: string;
  created_at: string;
};

/**
 * One row of recent_pours() (migration 017): a photo shared in the last
 * 24 hours by the caller or someone the caller follows. poured_at is the
 * photo's created_at, not the post's: logging a drink again adds a photo to
 * the old post, and that photo is still today's pour.
 */
export type RecentPourRow = {
  post_id: string;
  author_id: string;
  drink_id: string;
  path: string;
  poured_at: string;
};

/**
 * A drink someone added themselves, sent as a suggestion (migration 018).
 * Readable and writable by its submitter only. status, catalogue_id and
 * reviewed_at are Jan's columns: no client role is granted them, and the
 * prepare trigger resets them on every client insert. name_key, created_at
 * and updated_at are the trigger's.
 */
export type DrinkSubmissionRow = {
  /** Made on the phone, so a retry after a lost response is the same row. */
  id: string;
  submitter_id: string;
  name: string;
  /** Lower-cased, accent-free letters and digits of the name; one per submitter. */
  name_key: string;
  category: 'cocktail' | 'spirit';
  subcategory: string;
  subcategory_is_new: boolean;
  description: string;
  abv_low: number | null;
  abv_high: number | null;
  origin: string;
  glassware: string;
  tasting_notes: string[];
  fun_fact: string;
  ingredients: { item: string; amount: string }[];
  steps: string[];
  method: string;
  garnish: string;
  base: string;
  distillation: string;
  aging: string;
  serve_temp: string;
  serve_how: string;
  pairings: string[];
  process: string;
  note_for_team: string;
  /** `<submitter_id>/submission-<id>-<ts>.jpg` in the private `pours` bucket. */
  photo_path: string | null;
  status: 'new' | 'added' | 'duplicate' | 'declined';
  catalogue_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A short video (migration 019). Called a reel everywhere, in code and on screen. */
export type ReelRow = {
  /** Made on the phone, so the files can be named after it before the row exists. */
  id: string;
  author_id: string;
  /** `<author_id>/<id>.mov` (or `.mp4`) in the private `reels` bucket (CHECK-enforced). */
  video_path: string;
  /** `<author_id>/<id>.jpg` in the private `reels` bucket. */
  poster_path: string;
  caption: string;
  /** An id in the bundled drinks.json, like posts.drink_id. Optional. */
  drink_id: string | null;
  duration_ms: number;
  /** Filmed with the phone sideways: the viewer letterboxes instead of cropping. */
  landscape: boolean;
  created_at: string;
};

export type ReelLikeRow = {
  reel_id: string;
  user_id: string;
  created_at: string;
};

/**
 * my_reel_quota() (migration 019): the caller's counts and the server's
 * limits, read back so the recorder's copy follows whatever the SQL says.
 */
export type ReelQuotaRow = {
  posted_today: number;
  live: number;
  files: number;
  day_limit: number;
  live_limit: number;
};

/**
 * What every friend matcher returns: the public profile columns of each
 * account it found, the same set PROFILE_COLS_FULL reads from profiles.
 * One declaration, so the three matchers cannot drift apart and each row
 * goes through the one toProfile mapper.
 */
export type MatchedProfileRow = {
  id: string;
  username: string;
  display_name: string;
  accent: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, 'created_at'>;
        /*
         * No created_at, here or on posts, follows, likes and post_photos:
         * the server owns it (the pin_created_at triggers of migrations 011
         * and 017 set it on insert and refuse to change it on update), so
         * the types stop a client from even trying.
         */
        Update: Partial<Omit<ProfileRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      posts: {
        Row: PostRow;
        /*
         * photo_path is optional on insert: it is a denormalised preview
         * maintained by the sync_post_preview trigger (migration 007), not
         * something a caller supplies. Writing it by hand would be
         * overwritten by the next photo anyway.
         */
        Insert: Omit<PostRow, 'id' | 'created_at' | 'photo_path'> & {
          id?: string;
          photo_path?: string | null;
        };
        Update: Partial<Omit<PostRow, 'id' | 'author_id' | 'created_at'>>;
        Relationships: [];
      };
      follows: {
        Row: FollowRow;
        Insert: Omit<FollowRow, 'created_at'>;
        Update: never;
        Relationships: [];
      };
      likes: {
        Row: LikeRow;
        Insert: Omit<LikeRow, 'created_at'>;
        Update: never;
        Relationships: [];
      };
      post_photos: {
        Row: PostPhotoRow;
        Insert: Omit<PostPhotoRow, 'id' | 'taken_at' | 'created_at'> & {
          id?: string;
          taken_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      blocks: {
        Row: BlockRow;
        Insert: Omit<BlockRow, 'created_at'> & { created_at?: string };
        Update: never;
        Relationships: [];
      };
      reports: {
        Row: ReportRow;
        /*
         * The subject columns are optional on insert, not just nullable:
         * a report names ONE of a post, a reel or a person, so requiring the
         * caller to pass the others as explicit nulls is noise. The
         * prepare_report trigger (migration 012, widened by 019) enforces
         * that exactly one arrives.
         *
         * reported_author_id and snapshot are not offered at all: the same
         * trigger fills them from the subject and overwrites anything sent.
         * reporter_id is nullable on the row only because deleting the
         * reporter blanks it; a new report always names who filed it.
         */
        Insert: Omit<
          ReportRow,
          | 'id'
          | 'created_at'
          | 'reporter_id'
          | 'reported_post_id'
          | 'reported_user_id'
          | 'reported_reel_id'
          | 'reported_author_id'
          | 'snapshot'
        > & {
          id?: string;
          created_at?: string;
          reporter_id: string;
          reported_post_id?: string | null;
          reported_user_id?: string | null;
          reported_reel_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      invites: {
        Row: InviteRow;
        /*
         * inviter_id and nothing else, matching the column grant. The token,
         * creation time and expiry are the server's; a client that sent an
         * expiry would be refused, so the type does not offer one.
         */
        Insert: { inviter_id?: string };
        Update: never;
        Relationships: [];
      };
      /*
       * Migration 017. Insert names the two ids and nothing else, matching
       * the column grant. No update: a save is made or removed, never
       * changed.
       */
      saves: {
        Row: SaveRow;
        Insert: { user_id: string; post_id: string };
        Update: never;
        Relationships: [];
      };
      drink_submissions: {
        Row: DrinkSubmissionRow;
        /*
         * Only the granted columns (migration 018). submitter_id comes from
         * its default, auth.uid(), and the trigger overwrites it anyway; the
         * review columns and the clocks are the server's.
         */
        Insert: Omit<
          DrinkSubmissionRow,
          | 'submitter_id'
          | 'name_key'
          | 'status'
          | 'catalogue_id'
          | 'reviewed_at'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<
          Omit<
            DrinkSubmissionRow,
            | 'id'
            | 'submitter_id'
            | 'name_key'
            | 'status'
            | 'catalogue_id'
            | 'reviewed_at'
            | 'created_at'
            | 'updated_at'
          >
        >;
        Relationships: [];
      };
      reels: {
        Row: ReelRow;
        /*
         * The id is sent (the files are already named after it); created_at
         * is the server's (pin_created_at). landscape defaults to false.
         */
        Insert: Omit<ReelRow, 'created_at' | 'landscape'> & { landscape?: boolean };
        /* No update grant and no update policy: delete and post again. */
        Update: { [k: string]: never };
        Relationships: [];
      };
      reel_likes: {
        Row: ReelLikeRow;
        /* Like likes: the two ids. created_at is its default's. */
        Insert: Omit<ReelLikeRow, 'created_at'>;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /**
       * Takes no arguments on purpose: it reads auth.uid() server-side, so it
       * cannot be aimed at another account. See migration 005.
       *
       * Since migration 011 it no longer touches storage: the client empties
       * the user's folders through the Storage API first, and the function
       * raises an error containing 'photos_remaining' if any object is still
       * there. Since 019 that check covers `reels/<uid>/` as well as
       * `pours/<uid>/`, under the same error string.
       */
      delete_own_account: {
        Args: Record<never, never>;
        Returns: undefined;
      };
      /**
       * The email step's "sign in or sign up" lookup. Migration 016.
       *
       * 'new' (no account), 'password' (an account with a password) or
       * 'other' (an account made by Apple, Google, Facebook or phone, with no
       * password). Callable by anon. Metered per caller and overall; past
       * the meter it raises 'rate_limited', and the app falls back to a
       * password step that offers both paths, as it does when the function
       * is missing. An address it cannot read raises 'invalid_email', which
       * the app shows as "doesn't look right" on the email step.
       */
      sign_in_method: {
        Args: { e: string };
        Returns: string;
      };
      /**
       * Photos shared in the last 24 h by you and the people you follow.
       * Migration 017. SECURITY INVOKER, so blocks are honoured by the
       * tables' own read policies. At most 300 rows, newest first.
       */
      recent_pours: {
        Args: Record<never, never>;
        Returns: RecentPourRow[];
      };
      /**
       * The caller's reel counts and the server's limits, so the recorder
       * can say "come back tomorrow" before anyone films anything. One row.
       * Migration 019.
       */
      my_reel_quota: {
        Args: Record<string, never>;
        Returns: ReelQuotaRow[];
      };
      /** True if either party has blocked the other. See migration 006. */
      blocked_with: {
        Args: { other: string };
        Returns: boolean;
      };
      /**
       * Redeems an invite token into a mutual follow. Returns the inviter's
       * id, or null when the token is expired or unknown, is your own, or
       * either of you has blocked the other. Migration 011; the old
       * accept_invite(inviter uuid), which took a bare user id, is dropped.
       */
      accept_invite: {
        Args: { invite_token: string };
        Returns: string | null;
      };
      /**
       * At most 500 hashes per call, and 3,000 per rolling day across both
       * matchers; past that the server raises 'rate_limited'. Migration 011.
       */
      match_contacts: {
        Args: { hashes: string[] };
        Returns: MatchedProfileRow[];
      };
      /**
       * Echoes matched_hash back so the caller can label a row with the
       * handle it came from — the plaintext never leaves the device, so
       * only the device can read that mapping. See migration 008. Same
       * per-call and per-day caps as match_contacts.
       */
      match_instagram: {
        Args: { hashes: string[] };
        Returns: (MatchedProfileRow & { matched_hash: string })[];
      };
      /**
       * Sipply accounts behind a list of Facebook user ids. Migration 015.
       *
       * The ids are the app-scoped ones Facebook's user_friends edge returns:
       * only friends who also signed in to Sipply with Facebook and granted
       * that permission, each under an id that means nothing outside
       * Sipply's Facebook app. The server matches them against the Facebook
       * identities Supabase Auth stores for each account.
       *
       * Authenticated only, and empty for a caller with no Facebook identity
       * of their own. Never returns the caller, or anyone who has blocked
       * the caller or been blocked by them. At most 5,000 ids per call; past
       * that it raises 'too_many_ids'. Not metered against the hash
       * matchers' daily quota: app-scoped ids cannot be walked the way phone
       * numbers can.
       */
      match_facebook_friends: {
        Args: { fb_ids: string[] };
        Returns: MatchedProfileRow[];
      };
      /**
       * The content filter itself, callable by anon as well: at signup the
       * profile row is written by a trigger, and a refusal there reaches
       * the app as a bare 500, so a form can ask this first. `glued` is the
       * username check. src/lib/moderation.ts mirrors it offline.
       * Migration 011.
       */
      is_objectionable: {
        Args: { t: string; glued?: boolean };
        Returns: boolean;
      };
      /** Batch follow. Returns the number of NEW edges. See migration 008. */
      follow_many: {
        Args: { targets: string[] };
        Returns: number;
      };
      /**
       * Both setters take only the hash and read auth.uid() server-side, so
       * neither can be aimed at another account. Null clears. Migration 008.
       */
      set_phone_hash: {
        Args: { hash: string | null };
        Returns: undefined;
      };
      set_instagram_hash: {
        Args: { hash: string | null };
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
