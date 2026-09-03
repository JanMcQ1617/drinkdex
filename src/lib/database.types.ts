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
 * A report names EITHER a post or a person, never both — the
 * report_has_one_subject check in migration 006 enforces it server-side.
 */
export type ReportRow = {
  id: string;
  reporter_id: string;
  reported_post_id: string | null;
  reported_user_id: string | null;
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, 'created_at'> & { created_at?: string };
        Update: Partial<Omit<ProfileRow, 'id'>>;
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
          created_at?: string;
          photo_path?: string | null;
        };
        Update: Partial<Omit<PostRow, 'id' | 'author_id'>>;
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
         * to pass the other as an explicit null is noise. The
         * report_has_one_subject check enforces that exactly one arrives.
         */
        Insert: Omit<ReportRow, 'id' | 'created_at' | 'reported_post_id' | 'reported_user_id'> & {
          id?: string;
          created_at?: string;
          reported_post_id?: string | null;
          reported_user_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /**
       * Takes no arguments on purpose: it reads auth.uid() server-side, so it
       * cannot be aimed at another account. See migration 005.
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
      accept_invite: {
        Args: { inviter: string };
        Returns: undefined;
      };
      match_contacts: {
        Args: { hashes: string[] };
        Returns: {
          id: string;
          username: string;
          display_name: string;
          accent: string;
          bio: string | null;
          created_at: string;
        }[];
      };
      /**
       * Echoes matched_hash back so the caller can label a row with the
       * handle it came from — the plaintext never leaves the device, so
       * only the device can read that mapping. See migration 008.
       */
      match_instagram: {
        Args: { hashes: string[] };
        Returns: {
          id: string;
          username: string;
          display_name: string;
          accent: string;
          bio: string | null;
          created_at: string;
          matched_hash: string;
        }[];
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
