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
 * set_instagram_hash and the two matchers, all SECURITY DEFINER.
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
 * A report names EITHER a post or a person, never both. Exactly one subject
 * is enforced when the report is filed (prepare_report trigger, migration
 * 012). A report outlives its reporter, post and subject: each column is set
 * to null on deletion, and reported_author_id plus snapshot keep what a
 * moderator needs.
 */
export type ReportRow = {
  id: string;
  reporter_id: string | null;
  reported_post_id: string | null;
  reported_user_id: string | null;
  /** Who wrote the reported post, or the reported person. No foreign key, so it survives them. */
  reported_author_id: string | null;
  /** The post's caption and drink, and the author's name and bio, as they stood when it was filed. */
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, 'created_at'>;
        /*
         * No created_at, here or on posts: the server owns both (migration
         * 011's pin_created_at triggers set it on insert and refuse to
         * change it on update), so the types stop a client from even trying.
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
        Insert: Omit<FollowRow, 'created_at'> & { created_at?: string };
        Update: never;
        Relationships: [];
      };
      likes: {
        Row: LikeRow;
        Insert: Omit<LikeRow, 'created_at'> & { created_at?: string };
        Update: never;
        Relationships: [];
      };
      post_photos: {
        Row: PostPhotoRow;
        Insert: Omit<PostPhotoRow, 'id' | 'taken_at' | 'created_at'> & {
          id?: string;
          taken_at?: string;
          created_at?: string;
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
         * Both subject columns are optional on insert, not just nullable:
         * a report names EITHER a post or a person, so requiring the caller
         * to pass the other as an explicit null is noise. The prepare_report
         * trigger (migration 012) enforces that exactly one arrives.
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
          | 'reported_author_id'
          | 'snapshot'
        > & {
          id?: string;
          created_at?: string;
          reporter_id: string;
          reported_post_id?: string | null;
          reported_user_id?: string | null;
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
    };
    Views: Record<never, never>;
    Functions: {
      /**
       * Takes no arguments on purpose: it reads auth.uid() server-side, so it
       * cannot be aimed at another account. See migration 005.
       *
       * Since migration 011 it no longer touches storage: the client empties
       * the user's folder in `pours` through the Storage API first, and the
       * function raises an error containing 'photos_remaining' if any object
       * is still there.
       */
      delete_own_account: {
        Args: Record<never, never>;
        Returns: undefined;
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
        Returns: {
          id: string;
          username: string;
          display_name: string;
          accent: string;
          bio: string | null;
          avatar_path: string | null;
          created_at: string;
        }[];
      };
      /**
       * Echoes matched_hash back so the caller can label a row with the
       * handle it came from — the plaintext never leaves the device, so
       * only the device can read that mapping. See migration 008. Same
       * per-call and per-day caps as match_contacts.
       */
      match_instagram: {
        Args: { hashes: string[] };
        Returns: {
          id: string;
          username: string;
          display_name: string;
          accent: string;
          bio: string | null;
          avatar_path: string | null;
          created_at: string;
          matched_hash: string;
        }[];
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
