import { File } from 'expo-file-system';

import type { ProfileRow } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { Post, UserProfile } from '@/types';

/* ==================================================================== */
/* Mapping                                                              */
/* ==================================================================== */

export function toProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    accent: row.accent,
    bio: row.bio ?? undefined,
    joinedAt: row.created_at,
  };
}

/**
 * PostgREST returns an embedded aggregate as either `[{count: n}]` or a
 * bare number depending on version — normalize both.
 */
function likeCount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as { count?: number };
    return first?.count ?? 0;
  }
  return 0;
}

interface PostQueryRow {
  id: string;
  author_id: string;
  drink_id: string;
  caption: string;
  photo_path: string | null;
  created_at: string;
  likes?: unknown;
}

function toPost(row: PostQueryRow, myId: string, myLikes: Set<string>): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    drinkId: row.drink_id,
    caption: row.caption,
    photoUri: null, // resolved lazily via signedPhotoUrl
    photoPath: row.photo_path,
    createdAt: row.created_at,
    likes: likeCount(row.likes),
    likedByMe: myLikes.has(row.id),
    commentCount: 0,
    mine: row.author_id === myId,
  };
}

const POST_SELECT = 'id, author_id, drink_id, caption, photo_path, created_at, likes(count)';

/*
 * Explicit columns, never '*'. Migration 002 revokes the column privilege
 * on profiles.phone_hash, so a `select *` would fail with "permission
 * denied for column phone_hash". Only the match_contacts RPC reads it.
 */
const PROFILE_COLS = 'id, username, display_name, accent, bio, created_at';

/* ==================================================================== */
/* People and follows                                                   */
/* ==================================================================== */

/** Everyone with an account, newest first. Excludes you. */
export async function fetchPeople(myId: string): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .neq('id', myId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []).map(toProfile);
}

export async function searchPeople(myId: string, term: string): Promise<UserProfile[]> {
  const q = term.trim();
  if (!q) return fetchPeople(myId);

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .neq('id', myId)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(50);

  if (error) throw error;
  return (data ?? []).map(toProfile);
}

export async function fetchFollowing(myId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', myId);

  if (error) throw error;
  return (data ?? []).map((r) => r.following_id);
}

export async function fetchFollowerCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);

  if (error) throw error;
  return count ?? 0;
}

export async function follow(myId: string, targetId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: myId, following_id: targetId });
  // Racing double-taps hit the composite PK; that's already the desired state.
  if (error && !error.message.includes('duplicate')) throw error;
}

export async function unfollow(myId: string, targetId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', myId)
    .eq('following_id', targetId);
  if (error) throw error;
}

/* ==================================================================== */
/* Posts                                                                */
/* ==================================================================== */

async function fetchMyLikes(myId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('likes').select('post_id').eq('user_id', myId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.post_id));
}

/**
 * The home feed: posts from the people you follow, plus your own.
 *
 * The follow set is passed in rather than joined so the feed can render
 * from cache while follows are still loading.
 */
export async function fetchFeed(myId: string, followingIds: string[]): Promise<Post[]> {
  const authors = [myId, ...followingIds];

  const [{ data, error }, myLikes] = await Promise.all([
    supabase
      .from('posts')
      .select(POST_SELECT)
      .in('author_id', authors)
      .order('created_at', { ascending: false })
      .limit(100),
    fetchMyLikes(myId),
  ]);

  if (error) throw error;
  return (data ?? []).map((r) => toPost(r as PostQueryRow, myId, myLikes));
}

export async function fetchPostsByAuthor(authorId: string, myId: string): Promise<Post[]> {
  const [{ data, error }, myLikes] = await Promise.all([
    supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })
      .limit(100),
    fetchMyLikes(myId),
  ]);

  if (error) throw error;
  return (data ?? []).map((r) => toPost(r as PostQueryRow, myId, myLikes));
}

/** Profiles for a set of author ids, as a lookup. */
export async function fetchProfiles(ids: string[]): Promise<Record<string, UserProfile>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).in('id', ids);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.id, toProfile(r)]));
}

/* ==================================================================== */
/* Photos                                                               */
/* ==================================================================== */

/**
 * Uploads a locally-persisted proof photo.
 *
 * Objects are namespaced `<uid>/<file>` because the storage policy checks
 * the first path segment against auth.uid().
 */
export async function uploadPhoto(myId: string, localUri: string): Promise<string | null> {
  try {
    const file = new File(localUri);
    if (!file.exists) return null;

    const ext = localUri.split('.').pop()?.split('?')[0] ?? 'jpg';
    const path = `${myId}/${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error } = await supabase.storage
      .from('pours')
      .upload(path, bytes, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false });

    if (error) throw error;
    return path;
  } catch {
    // A failed photo upload must not lose the post itself.
    return null;
  }
}

/** The bucket is private, so reads go through a short-lived signed URL. */
export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('pours').createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}

/* ==================================================================== */
/* Writes                                                               */
/* ==================================================================== */

export async function createPost(
  myId: string,
  drinkId: string,
  caption: string,
  localPhotoUri: string | null,
): Promise<void> {
  const photoPath = localPhotoUri ? await uploadPhoto(myId, localPhotoUri) : null;

  const { error } = await supabase
    .from('posts')
    .insert({ author_id: myId, drink_id: drinkId, caption, photo_path: photoPath });

  if (error) throw error;
}

export async function deletePostsForDrink(myId: string, drinkId: string): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('author_id', myId)
    .eq('drink_id', drinkId);
  if (error) throw error;
}

export async function likePost(myId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: myId });
  if (error && !error.message.includes('duplicate')) throw error;
}

export async function unlikePost(myId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', myId);
  if (error) throw error;
}

export async function updateProfile(
  myId: string,
  patch: { display_name?: string; bio?: string; accent?: string },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', myId);
  if (error) throw error;
}

/* ==================================================================== */
/* Friend discovery — invites and contacts                              */
/* ==================================================================== */

interface MatchRow {
  id: string;
  username: string;
  display_name: string;
  accent: string;
  bio: string | null;
  created_at: string;
}

/**
 * Turns an accepted invite into a mutual follow via the accept_invite RPC.
 *
 * The reciprocal edge (inviter → me) is one RLS forbids the client to
 * write, so the server does both sides. No-ops on a self- or bad invite.
 */
export async function acceptInvite(inviterId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_invite', { inviter: inviterId });
  if (error) throw error;
}

/**
 * Makes this account findable by contact matching, or clears it.
 *
 * Stores only the salted hash — never the number. Pass null to opt back
 * out (e.g. from a settings toggle).
 */
export async function setPhoneHash(myId: string, phoneHash: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ phone_hash: phoneHash }).eq('id', myId);
  if (error) throw error;
}

/**
 * Given hashes of the numbers in the user's address book, returns the
 * Clink accounts that opted in with a matching hash.
 *
 * Chunked because the hash set can be large and PostgREST caps URL length
 * on the array argument.
 */
export async function matchContacts(hashes: string[]): Promise<UserProfile[]> {
  const unique = [...new Set(hashes)].filter(Boolean);
  if (unique.length === 0) return [];

  const CHUNK = 300;
  const out: UserProfile[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('match_contacts', {
      hashes: unique.slice(i, i + CHUNK),
    });
    if (error) throw error;
    for (const row of (data ?? []) as MatchRow[]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(
        toProfile({
          id: row.id,
          username: row.username,
          display_name: row.display_name,
          accent: row.accent,
          bio: row.bio,
          created_at: row.created_at,
        }),
      );
    }
  }
  return out;
}
