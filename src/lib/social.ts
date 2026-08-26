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
  /*
   * `unknown` for the same reason as `likes`: database.types.ts is
   * hand-written and does not declare the posts -> post_photos relation, so
   * supabase-js types an embedded select as SelectQueryError. Narrowed by
   * photoList() below rather than trusted.
   */
  post_photos?: unknown;
}

/**
 * Photo paths for a post, NEWEST FIRST.
 *
 * Sorted here rather than trusted from the query: PostgREST gives no order
 * guarantee on an embedded resource, and the carousel's whole contract is
 * that the most recent picture comes first. Shape-checked because the
 * embed is typed `unknown`.
 */
function photoList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is { path: string; taken_at: string } =>
        typeof r === 'object' && r !== null && typeof (r as { path?: unknown }).path === 'string',
    )
    .slice()
    .sort((a, b) => (a.taken_at < b.taken_at ? 1 : -1))
    .map((r) => r.path);
}

function toPost(row: PostQueryRow, myId: string, myLikes: Set<string>): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    drinkId: row.drink_id,
    caption: row.caption,
    photoUri: null, // resolved lazily via signedPhotoUrl
    photoPath: row.photo_path,
    /*
     * Sorted here rather than trusted from the query: PostgREST gives no
     * order guarantee on an embedded resource, and the carousel's whole
     * contract is that the newest picture comes first.
     */
    photoPaths: photoList(row.post_photos),
    createdAt: row.created_at,
    likes: likeCount(row.likes),
    likedByMe: myLikes.has(row.id),
    commentCount: 0,
    mine: row.author_id === myId,
  };
}

const POST_SELECT =
  'id, author_id, drink_id, caption, photo_path, created_at, likes(count), post_photos(path, taken_at)';

/*
 * Explicit columns, never '*'. Migration 002 revokes the column privilege
 * on profiles.phone_hash, so a `select *` would fail with "permission
 * denied for column phone_hash". Only the match_contacts RPC reads it.
 */
/**
 * The columns a normal client reads from profiles.
 *
 * No longer a privilege boundary — migration 008 moved the discovery
 * hashes out to profile_secrets, so profiles holds nothing private and
 * `select *` would be harmless. Kept explicit anyway: it is the list the
 * UserProfile mapper expects, and naming columns keeps a future private
 * column from being published by an existing query.
 */
export const PROFILE_COLS = 'id, username, display_name, accent, bio, created_at';

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

/**
 * Records a pour: creates the post for this drink if it is the first one,
 * then attaches the photo to it.
 *
 * A drink is ONE post per person (posts_one_per_drink, migration 007).
 * Logging the same drink again used to insert a second row, so a profile
 * filled with duplicates of one entry — it now adds a photo to the post that
 * already exists, and the trigger promotes the newest to the preview.
 */
export async function createPost(
  myId: string,
  drinkId: string,
  caption: string,
  localPhotoUri: string | null,
): Promise<void> {
  /*
   * onConflict rather than a select-then-insert: two logs racing from the
   * same account would both see "no post" and the second insert would fail
   * on the unique constraint. The caption is NOT overwritten — the first one
   * describes the first time they had it, which is what the post is dated.
   */
  const { data: post, error } = await supabase
    .from('posts')
    .upsert(
      { author_id: myId, drink_id: drinkId, caption },
      { onConflict: 'author_id,drink_id', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) throw error;
  if (!localPhotoUri || !post) return;

  const path = await uploadPhoto(myId, localPhotoUri);
  if (!path) return;

  // The trigger repoints posts.photo_path at the newest photo.
  const { error: photoError } = await supabase
    .from('post_photos')
    .insert({ post_id: post.id, path });
  if (photoError) throw photoError;
}

/**
 * Adds another photo to the post for this drink, newest first.
 *
 * Replaces the old behaviour, which swapped the single photo and deleted the
 * previous file. Several pictures of one drink taken weeks apart are the
 * same entry photographed twice, not a reason to throw the first away.
 *
 * Returns false if the upload failed, so the caller can leave the local
 * record alone rather than showing a photo the server does not have.
 */
export async function addPhotoForDrink(
  myId: string,
  drinkId: string,
  localPhotoUri: string,
): Promise<boolean> {
  const { data: post, error } = await supabase
    .from('posts')
    .select('id')
    .eq('author_id', myId)
    .eq('drink_id', drinkId)
    .maybeSingle();
  if (error) throw error;

  // No post yet — the entry was collected before sharing existed, or offline.
  if (!post) {
    await createPost(myId, drinkId, 'Logged a new entry.', localPhotoUri);
    return true;
  }

  const path = await uploadPhoto(myId, localPhotoUri);
  if (!path) return false;

  const { error: photoError } = await supabase
    .from('post_photos')
    .insert({ post_id: post.id, path });
  if (photoError) throw photoError;

  return true;
}

/**
 * Deletes an object from the pours bucket, tolerating failure.
 *
 * Storage has NO foreign key to posts — objects are tied to a user only by
 * the path convention `<uid>/<file>` — so nothing is removed on our behalf
 * when a post row goes. Every path that drops a post has to drop its photo
 * explicitly or the file is orphaned in the bucket forever.
 *
 * Failure is swallowed on purpose: an orphaned object is a storage cost, but
 * a throw here would abort the row delete and leave the user unable to remove
 * an entry at all. The row is the thing the user can see.
 */
async function removeStoredPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from('pours').remove([path]);
  } catch {
    // Orphaned object; the row delete matters more.
  }
}

export async function deletePostsForDrink(myId: string, drinkId: string): Promise<void> {
  /*
   * Read the paths BEFORE deleting the rows. Afterwards there is no record of
   * which objects belonged to those posts, and the photos become unreachable
   * garbage — the same trap migration 005 was written to avoid for account
   * deletion, which this path never handled.
   */
  const { data: doomed, error: readError } = await supabase
    .from('posts')
    .select('id, photo_path')
    .eq('author_id', myId)
    .eq('drink_id', drinkId);
  if (readError) throw readError;

  /*
   * post_photos cascades from posts, so the ROWS take care of themselves —
   * but the storage objects they point at do not, and there are now several
   * per post rather than one. Collect them while the rows still exist.
   */
  const ids = (doomed ?? []).map((row) => row.id);
  const { data: extra } = ids.length
    ? await supabase.from('post_photos').select('path').in('post_id', ids)
    : { data: [] as { path: string }[] };

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('author_id', myId)
    .eq('drink_id', drinkId);
  if (error) throw error;

  const paths = new Set<string>([
    ...(doomed ?? []).map((row) => row.photo_path).filter(Boolean as unknown as (v: string | null) => v is string),
    ...(extra ?? []).map((row) => row.path),
  ]);
  await Promise.all([...paths].map((path) => removeStoredPhoto(path)));
}

/**
 * Points every post for this drink at a NEW photo, and deletes the old files.
 *
 * Changing the photo on a collected entry used to be purely local: the store
 * swapped `unlocks[drinkId].photoUri` and nothing reached the server, so the
 * post kept showing the replaced image and the old object stayed in the
 * bucket. Both are fixed here.
 *
 * Returns false if the upload failed, so the caller can leave the local record
 * alone rather than showing a photo the server does not have.
 */
export async function replacePostPhotoForDrink(
  myId: string,
  drinkId: string,
  localPhotoUri: string,
): Promise<boolean> {
  const newPath = await uploadPhoto(myId, localPhotoUri);
  if (!newPath) return false;

  const { data: previous, error: readError } = await supabase
    .from('posts')
    .select('photo_path')
    .eq('author_id', myId)
    .eq('drink_id', drinkId);
  if (readError) throw readError;

  const { error } = await supabase
    .from('posts')
    .update({ photo_path: newPath })
    .eq('author_id', myId)
    .eq('drink_id', drinkId);
  if (error) throw error;

  // Only after the rows point at the new file — deleting first would leave a
  // window where the post references an object that is already gone.
  await Promise.all(
    (previous ?? [])
      .map((row) => row.photo_path)
      .filter((path) => path && path !== newPath)
      .map((path) => removeStoredPhoto(path)),
  );

  return true;
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
 *
 * Goes through an RPC because the hash lives in profile_secrets, which has
 * no grants for any client role at all (migration 008). The user id
 * argument is kept for call-site symmetry but deliberately unused: the
 * function reads auth.uid() server-side, so this cannot be aimed at
 * anyone else's row.
 */
export async function setPhoneHash(_myId: string, phoneHash: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_phone_hash', { hash: phoneHash });
  if (error) throw error;
}

/**
 * Given hashes of the numbers in the user's address book, returns the
 * Sipply accounts that opted in with a matching hash.
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

/**
 * Makes this account findable by Instagram handle, or clears it.
 *
 * Same contract as setPhoneHash, including the ignored id argument: only
 * the salted hash of the normalized handle is stored, never the handle,
 * and the server decides whose row it lands on. Pass null to opt back out.
 */
export async function setInstagramHash(
  _myId: string,
  handleHash: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_instagram_hash', { hash: handleHash });
  if (error) throw error;
}

/**
 * Given hashes of the handles in the user's Instagram export, returns the
 * Sipply accounts that opted in with a matching hash.
 *
 * Keyed by hash rather than returning bare profiles: the caller holds the
 * hash → handle map locally, so it can label a row "@sarah.g" without the
 * server ever having seen the handle. Chunked for the same reason
 * matchContacts is — PostgREST caps the URL length of an array argument.
 */
export async function matchInstagram(
  hashes: string[],
): Promise<{ profile: UserProfile; hash: string }[]> {
  const unique = [...new Set(hashes)].filter(Boolean);
  if (unique.length === 0) return [];

  const CHUNK = 300;
  const out: { profile: UserProfile; hash: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('match_instagram', {
      hashes: unique.slice(i, i + CHUNK),
    });
    if (error) throw error;
    for (const row of (data ?? []) as (MatchRow & { matched_hash: string })[]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({
        hash: row.matched_hash,
        profile: toProfile({
          id: row.id,
          username: row.username,
          display_name: row.display_name,
          accent: row.accent,
          bio: row.bio,
          created_at: row.created_at,
        }),
      });
    }
  }
  return out;
}

/**
 * Follows a whole list in one request. Returns how many edges were NEW.
 *
 * The reason the import is worth having: matching 40 friends and then
 * making the user tap Follow 40 times is the problem, not the solution.
 * Chunked at the server's own cap so a large list degrades into a few
 * requests instead of being silently truncated.
 */
export async function followMany(targetIds: string[]): Promise<number> {
  const unique = [...new Set(targetIds)].filter(Boolean);
  if (unique.length === 0) return 0;

  const CHUNK = 500;
  let added = 0;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('follow_many', {
      targets: unique.slice(i, i + CHUNK),
    });
    if (error) throw error;
    added += typeof data === 'number' ? data : 0;
  }
  return added;
}
