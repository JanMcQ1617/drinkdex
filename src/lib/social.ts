import { File } from 'expo-file-system';

import { getDrink } from '@/data';
import type { ProfileRow } from '@/lib/database.types';
import { stripMetadata } from '@/lib/pour';
import { supabase } from '@/lib/supabase';
import type { Post, UserProfile } from '@/types';

/** Splits a list into runs of at most `size`, for requests that carry ids in the URL. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/*
 * Ids per GET request. `.in()` puts every id in the query string, about 39
 * encoded bytes each, and gateways refuse URLs past a few kilobytes. 150
 * keeps a request near 6 KB — so a follow list built by one "Follow all" on
 * an Instagram import no longer fails every feed load, which is what one
 * unchunked `.in()` did past a few hundred follows.
 */
const IDS_PER_REQUEST = 150;

/*
 * The caption older builds wrote when the user typed nothing. The photo,
 * the drink name and its spec line already say an entry was logged, so the
 * sentence was filler under every post; nothing writes it any more, but
 * rows from before still carry it, so it is treated as no caption at all.
 */
const LEGACY_FILLER_CAPTION = 'Logged a new entry.';

/** True when a caption has nothing to show: empty, or the old filler line. */
export function isBlankCaption(caption: string | null | undefined): boolean {
  const c = caption?.trim() ?? '';
  return c.length === 0 || c === LEGACY_FILLER_CAPTION;
}

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
    avatarPath: row.avatar_path,
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

/**
 * The columns a normal client reads from profiles.
 *
 * No longer a privilege boundary — migration 008 moved the discovery
 * hashes out to profile_secrets, so profiles holds nothing private and
 * `select *` would be harmless. Kept explicit anyway: it is the list the
 * UserProfile mapper expects, and naming columns keeps a future private
 * column from being published by an existing query.
 */
/* ==================================================================== */
/* Profile columns                                                      */
/*                                                                      */
/* A function rather than a constant, because the client and the         */
/* database can disagree about whether `avatar_path` exists yet.         */
/*                                                                      */
/* PostgREST fails the WHOLE select if any requested column is missing,  */
/* so a build that asks for a column the schema has not got does not     */
/* lose the avatar — it loses the profile. That is what "column          */
/* profiles.avatar_path does not exist" looked like on the profile tab:  */
/* no name, no bio, no counts, just an error where a person should be.   */
/*                                                                      */
/* This can happen in both directions and neither is exotic: a build     */
/* shipped ahead of its migration, or an OTA JS update reaching a phone  */
/* before someone runs the SQL. The optional column is therefore treated */
/* as optional — asked for once, and dropped for the rest of the session */
/* if the server says it does not know it.                              */
/* ==================================================================== */

const PROFILE_COLS_CORE = 'id, username, display_name, accent, bio, created_at';
const PROFILE_COLS_FULL = 'id, username, display_name, accent, bio, avatar_path, created_at';

let avatarColumnPresent = true;

export function profileCols(): string {
  return avatarColumnPresent ? PROFILE_COLS_FULL : PROFILE_COLS_CORE;
}

/**
 * True when the error is Postgres 42703 — undefined column — naming the
 * avatar column. Anything else is a real failure and must not be
 * swallowed by a retry.
 *
 * Matched on the code first; the message is only consulted to be sure it
 * is OUR column that is missing rather than some unrelated typo, because
 * retrying without the avatar would not fix that and would hide it.
 */
export function isMissingAvatarColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const missing = error.code === '42703' || /does not exist/i.test(error.message ?? '');
  return missing && /avatar_path/i.test(error.message ?? '');
}

/** Stops asking for the avatar column for the rest of this session. */
export function disableAvatarColumn(): void {
  avatarColumnPresent = false;
}

/* ==================================================================== */
/* People and follows                                                   */
/* ==================================================================== */

/** Everyone with an account, newest first. Excludes you. */
export async function fetchPeople(myId: string): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileCols())
    .neq('id', myId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  // The select string is chosen at runtime, so supabase-js cannot infer the
  // row shape from it. profileCols() only ever returns a subset of
  // ProfileRow's columns, which is exactly what the cast asserts.
  return ((data ?? []) as unknown as ProfileRow[]).map(toProfile);
}

export async function searchPeople(myId: string, term: string): Promise<UserProfile[]> {
  // The search box invites "@username", but usernames are stored bare.
  const q = term.trim().replace(/^@+/, '');
  if (!q) return fetchPeople(myId);

  /*
   * Escaped twice, in this order, because the term passes through two
   * parsers.
   *
   * First for LIKE, so a typed % or _ is a character rather than a
   * wildcard. Then for PostgREST: inside or=(…) a comma or parenthesis is
   * grammar, so an unquoted "Smith, J" split the filter, the request failed
   * with a 400, and the screen said nobody was found. Double-quoted, those
   * are plain text; PostgREST then strips one level of backslashes, which is
   * why the LIKE escapes need escaping again to reach Postgres intact.
   *
   * A typed * still matches anything: PostgREST maps it to % after
   * unquoting, and for a people search that is harmless.
   */
  const like = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const v = like.replace(/[\\"]/g, (c) => `\\${c}`);

  const { data, error } = await supabase
    .from('profiles')
    .select(profileCols())
    .neq('id', myId)
    .or(`username.ilike."%${v}%",display_name.ilike."%${v}%"`)
    .limit(50);

  if (error) throw error;
  return ((data ?? []) as unknown as ProfileRow[]).map(toProfile);
}

/*
 * Paged, because an unpaged select stops at the API's row cap (1,000 on
 * hosted Supabase) without saying so, and every follow past it silently
 * dropped out of the feed.
 */
const FOLLOWING_PAGE = 1000;

export async function fetchFollowing(myId: string): Promise<string[]> {
  const out: string[] = [];
  let from = 0;
  let more = true;

  while (more) {
    const { data, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', myId)
      .order('following_id')
      .range(from, from + FOLLOWING_PAGE - 1);

    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows.map((r) => r.following_id));
    more = rows.length === FOLLOWING_PAGE;
    from += FOLLOWING_PAGE;
  }
  return out;
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

/**
 * Which of THESE posts you have liked.
 *
 * Scoped to the rows on screen rather than every like you have ever made:
 * the unscoped read grew without limit, and past the API's 1,000-row cap it
 * came back as an arbitrary subset, so some liked posts rendered unliked and
 * the next tap sent a second like. A hundred ids fit one request.
 */
async function fetchMyLikes(myId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', myId)
    .in('post_id', postIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.post_id));
}

/**
 * Rows to posts, minus any whose drink has left the Dex.
 *
 * posts.drink_id has no foreign key, and beer and wine were removed on
 * 20 Sep 2026 with no server cleanup, so those posts still come back. The
 * cards render nothing for them, but every count, grid and empty-state check
 * works from the array — "Posts 12" over five tiles, or a feed of nothing
 * with no empty state. Dropping them here keeps every consumer on one list.
 */
async function toPosts(rows: PostQueryRow[], myId: string): Promise<Post[]> {
  const live = rows.filter((r) => getDrink(r.drink_id));
  const myLikes = await fetchMyLikes(
    myId,
    live.map((r) => r.id),
  );
  return live.map((r) => toPost(r, myId, myLikes));
}

const FEED_SIZE = 100;

const newestFirst = (a: PostQueryRow, b: PostQueryRow) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;

/**
 * The home feed: posts from the people you follow, plus your own.
 *
 * The follow set is passed in rather than joined so the feed can render
 * from cache while follows are still loading. Past IDS_PER_REQUEST authors
 * the set is split: each request returns its own newest hundred, and the
 * feed is the newest hundred of all of them.
 */
export async function fetchFeed(myId: string, followingIds: string[]): Promise<Post[]> {
  const authors = [...new Set([myId, ...followingIds])];

  const pages = await Promise.all(
    chunk(authors, IDS_PER_REQUEST).map(async (ids) => {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .in('author_id', ids)
        .order('created_at', { ascending: false })
        .limit(FEED_SIZE);
      if (error) throw error;
      return (data ?? []) as unknown as PostQueryRow[];
    }),
  );

  const rows = pages.length === 1 ? pages[0] : pages.flat().sort(newestFirst).slice(0, FEED_SIZE);
  return toPosts(rows, myId);
}

export async function fetchPostsByAuthor(authorId: string, myId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(FEED_SIZE);

  if (error) throw error;
  return toPosts((data ?? []) as unknown as PostQueryRow[], myId);
}

/**
 * How many posts someone has, for a profile header. The list above stops at
 * FEED_SIZE, so its length cannot be the count.
 *
 * A head request through the same RLS as fetchPostsByAuthor, so a block
 * hides the count along with the posts. It counts rows the server holds,
 * which includes any post whose drink has left the Dex (toPosts drops those
 * from lists); while a profile's whole list fits in one page, the list's
 * own length is the number that matches the grid.
 */
export async function fetchPostCount(authorId: string): Promise<number> {
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', authorId);
  if (error) throw error;
  return count ?? 0;
}

/** Profiles for a set of author ids, as a lookup. */
export async function fetchProfiles(ids: string[]): Promise<Record<string, UserProfile>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const pages = await Promise.all(
    chunk(unique, IDS_PER_REQUEST).map(async (part) => {
      const { data, error } = await supabase.from('profiles').select(profileCols()).in('id', part);
      if (error) throw error;
      return (data ?? []) as unknown as ProfileRow[];
    }),
  );
  return Object.fromEntries(pages.flat().map((r) => [r.id, toProfile(r)]));
}

/* ==================================================================== */
/* Photos                                                               */
/* ==================================================================== */

/*
 * Every photo leaves the device through stripMetadata first, pour photos
 * and avatars alike: a fresh JPEG with no EXIF and no GPS. A picture taken
 * at home and posted to a feed would otherwise publish where the poster
 * lives. The object is therefore always a .jpg sent as image/jpeg, whatever
 * the picker handed over — HEIC included.
 *
 * If stripping fails, the upload fails. The original is never sent as a
 * fallback, because that fallback is the leak.
 *
 * The stripped copy is a temporary file made for this upload alone, so it
 * is removed afterwards, sent or not; the caller's own file is left alone.
 */
async function putStrippedPhoto(localUri: string, path: string): Promise<boolean> {
  if (!new File(localUri).exists) return false;
  const clean = await stripMetadata(localUri);
  try {
    const bytes = await new File(clean).arrayBuffer();
    const { error } = await supabase.storage
      .from('pours')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return true;
  } finally {
    if (clean !== localUri) {
      try {
        const temp = new File(clean);
        if (temp.exists) temp.delete();
      } catch {
        // A stray file in the cache directory, which the OS clears anyway.
      }
    }
  }
}

/**
 * Uploads a locally-persisted proof photo.
 *
 * Objects are namespaced `<uid>/<file>` because the storage policy checks
 * the first path segment against auth.uid().
 */
export async function uploadPhoto(myId: string, localUri: string): Promise<string | null> {
  try {
    const path = `${myId}/${Date.now()}.jpg`;
    return (await putStrippedPhoto(localUri, path)) ? path : null;
  } catch {
    // A failed photo upload must not lose the post itself.
    return null;
  }
}

/**
 * Uploads a new profile picture and returns its object path.
 *
 * Same bucket and same `<uid>/` prefix as pour photos — see migration 010
 * for why avatars live in `pours` rather than a bucket of their own. The
 * short version: the RLS and the account-deletion sweep both already key
 * on that prefix, and a second bucket would mean maintaining both twice.
 *
 * The `avatar-` prefix is for humans reading the bucket, not for code.
 * Nothing keys on it.
 */
export async function uploadAvatar(myId: string, localUri: string): Promise<string | null> {
  try {
    const path = `${myId}/avatar-${Date.now()}.jpg`;
    return (await putStrippedPhoto(localUri, path)) ? path : null;
  } catch {
    return null;
  }
}

/*
 * Signed URLs, memoised for slightly less than the hour they are minted
 * for.
 *
 * Avatars are the reason this exists. A pour photo is signed once per
 * card, but the same avatar appears beside every post in a feed, in the
 * follow list, on the profile and in settings — without a cache that is
 * one network round trip per appearance of the SAME image, and a list
 * scroll re-signs them all again on every remount.
 *
 * Keyed by path, holding the promise rather than the result so that N
 * simultaneous mounts of one avatar share a single request instead of
 * racing N of them.
 *
 * Only successes are kept. A failure used to be cached like any answer, so
 * one dropped request — a Wi-Fi to cellular handoff, a request cut off by
 * backgrounding — replaced that photo with artwork everywhere for the rest
 * of the hour. A failed entry now removes itself when it settles: mounts
 * already waiting share the one failure, and the next mount signs again.
 *
 * The settled URL is kept beside the promise so a card that remounts, or a
 * gallery that pages back, can paint the photo on its first frame instead
 * of waiting a tick for a promise that has already resolved.
 */
const SIGNED_TTL_MS = 55 * 60 * 1000;

interface SignedEntry {
  at: number;
  url: Promise<string | null>;
  settled?: string;
}

const signedCache = new Map<string, SignedEntry>();

/** The bucket is private, so reads go through a short-lived signed URL. */
export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;

  const hit = signedCache.get(path);
  if (hit && Date.now() - hit.at < SIGNED_TTL_MS) return hit.url;

  const entry = { at: Date.now() } as SignedEntry;
  // Only evicts THIS entry: a newer one for the same path is left alone.
  const evict = () => {
    if (signedCache.get(path) === entry) signedCache.delete(path);
  };

  entry.url = supabase.storage
    .from('pours')
    .createSignedUrl(path, 60 * 60)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        evict();
        return null;
      }
      entry.settled = data.signedUrl;
      return data.signedUrl;
    })
    .catch(() => {
      evict();
      return null;
    });

  signedCache.set(path, entry);
  return entry.url;
}

/**
 * The signed URL for `path` if one has already arrived, synchronously.
 * Undefined when it has not — the caller then waits on signedPhotoUrl.
 */
export function peekSignedPhoto(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const hit = signedCache.get(path);
  return hit && Date.now() - hit.at < SIGNED_TTL_MS ? hit.settled : undefined;
}

/** Drops a path from the signed-URL cache — used when it is replaced. */
export function forgetSignedPhoto(path: string | null): void {
  if (path) signedCache.delete(path);
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
 *
 * Resolves to false when the post is up but its photo is not on it, so the
 * caller can say so; throws when the post itself could not be written. The
 * server dates the post (created_at is never sent).
 */
export async function createPost(
  myId: string,
  drinkId: string,
  caption: string,
  localPhotoUri: string | null,
): Promise<boolean> {
  /*
   * onConflict rather than a select-then-insert: two logs racing from the
   * same account would both see "no post" and the second insert would fail
   * on the unique constraint.
   *
   * DO NOTHING on that conflict, not DO UPDATE. `ignoreDuplicates: false`
   * made PostgREST rewrite every column it was sent, caption included, so
   * re-logging a drink replaced "First one at the Tales bar" with whatever
   * the new log said. The first caption describes the first time they had
   * it, which is what the post is dated, so it stays — except on a post
   * that never had words, where a later note fills the gap rather than
   * being dropped.
   */
  const { data: inserted, error } = await supabase
    .from('posts')
    .upsert(
      { author_id: myId, drink_id: drinkId, caption },
      { onConflict: 'author_id,drink_id', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();
  if (error) throw error;

  let postId = inserted?.id;
  if (!postId) {
    const { data: existing, error: readError } = await supabase
      .from('posts')
      .select('id, caption')
      .eq('author_id', myId)
      .eq('drink_id', drinkId)
      .single();
    if (readError) throw readError;
    postId = existing.id;

    if (!isBlankCaption(caption) && isBlankCaption(existing.caption)) {
      const { error: captionError } = await supabase
        .from('posts')
        .update({ caption })
        .eq('id', existing.id);
      if (captionError) throw captionError;
    }
  }

  if (!localPhotoUri) return true;

  const path = await uploadPhoto(myId, localPhotoUri);
  if (!path) return false;

  /*
   * The trigger repoints posts.photo_path at the newest photo. If the row
   * cannot be written the post is still up, so this is the same answer as a
   * failed upload rather than a throw that would call the whole post failed —
   * and the object just uploaded is removed, since nothing points at it.
   */
  const { error: photoError } = await supabase
    .from('post_photos')
    .insert({ post_id: postId, path });
  if (photoError) {
    await removeStoredPhoto(path);
    return false;
  }
  return true;
}

/**
 * Adds another photo to the post for this drink, newest first.
 *
 * Replaces the old behaviour, which swapped the single photo and deleted the
 * previous file. Several pictures of one drink taken weeks apart are the
 * same entry photographed twice, not a reason to throw the first away.
 *
 * Returns false if the photo did not make it onto the post, so the caller
 * can say the post still shows the old picture. True when there was nothing
 * to keep in step (see below).
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

  /*
   * No post, so nothing to keep in step: the entry was kept to the Dex
   * ("Save to Dex"), was collected before sharing existed, or its post
   * failed. Following a post never publishes one. This branch used to call
   * createPost, so changing the photo on a private entry posted it to every
   * follower without being asked. Sharing a never-posted entry is the
   * explicit "Save & post", which goes through addPost -> createPost and
   * keeps the caption; drink/[id].tsx's "Save photo" relies on this branch
   * to leave the entry private.
   */
  if (!post) return true;

  const path = await uploadPhoto(myId, localPhotoUri);
  if (!path) return false;

  // As in createPost: an object no row points at is removed, not left behind.
  const { error: photoError } = await supabase
    .from('post_photos')
    .insert({ post_id: post.id, path });
  if (photoError) {
    await removeStoredPhoto(path);
    return false;
  }

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
export async function removeStoredPhoto(path: string | null | undefined): Promise<void> {
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

/**
 * Redeems an invite token into a mutual follow via the accept_invite RPC.
 *
 * The reciprocal edge (inviter → me) is one RLS forbids the client to
 * write, so the server does both sides. The link carries a random token,
 * not the inviter's user id (migration 011): a bare id could be pasted into
 * a link by anyone, and made its owner follow whoever opened it.
 *
 * Resolves to the inviter's id, or null when the token is expired or
 * unknown, is your own, or either of you has blocked the other — none of
 * which is an error. Throws only when the request itself failed.
 */
export async function acceptInvite(token: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('accept_invite', { invite_token: token });
  if (error) throw error;
  return data ?? null;
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

/*
 * Hashes per matcher call. The server refuses more than 500 in one call
 * (migration 011); 300 stays clear of that edge. The daily quota — 3,000
 * hashes across both matchers — is counted per hash, so smaller calls cost
 * nothing extra. Past the quota the server raises 'rate_limited', which is
 * thrown to the caller as is: it is the caller that has to say "try again
 * tomorrow" rather than "none of your contacts are here".
 */
const HASHES_PER_CALL = 300;

/**
 * Given hashes of the numbers in the user's address book, returns the
 * Sipply accounts that opted in with a matching hash.
 */
export async function matchContacts(hashes: string[]): Promise<UserProfile[]> {
  const unique = [...new Set(hashes)].filter(Boolean);
  if (unique.length === 0) return [];

  const out: UserProfile[] = [];
  const seen = new Set<string>();

  for (const part of chunk(unique, HASHES_PER_CALL)) {
    const { data, error } = await supabase.rpc('match_contacts', { hashes: part });
    if (error) throw error;
    for (const row of data ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(toProfile(row));
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
 * server ever having seen the handle. Chunked and rate-limited exactly as
 * matchContacts is — the two share one daily quota.
 */
export async function matchInstagram(
  hashes: string[],
): Promise<{ profile: UserProfile; hash: string }[]> {
  const unique = [...new Set(hashes)].filter(Boolean);
  if (unique.length === 0) return [];

  const out: { profile: UserProfile; hash: string }[] = [];
  const seen = new Set<string>();

  for (const part of chunk(unique, HASHES_PER_CALL)) {
    const { data, error } = await supabase.rpc('match_instagram', { hashes: part });
    if (error) throw error;
    for (const row of data ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ hash: row.matched_hash, profile: toProfile(row) });
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
