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
  created_at: string;
  /**
   * Salted phone hash for contact matching. Write-only from the client:
   * migration 002 revokes the SELECT column privilege, so this never comes
   * back on a read — it's here only so `update({ phone_hash })` typechecks.
   */
  phone_hash?: string | null;
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
        Insert: Omit<PostRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
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
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
