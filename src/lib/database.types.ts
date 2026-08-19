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
