import { File } from 'expo-file-system';

import { getDrink } from '@/data';
import type { PostLikerRow, ProfileRow } from '@/lib/database.types';
import { STORY_MUSIC, musicColumns, songFromRow } from '@/lib/music';
// Types only: lib/places imports this file at runtime, so the reverse stays type-only (no cycle).
import type { PlaceRef } from '@/lib/places';
import { isPlaceId } from '@/lib/placeSearch';
import { stripMetadata } from '@/lib/pour';
import { supabase } from '@/lib/supabase';
import type { ActivityItem, Post, Pour, Song, UserProfile } from '@/types';

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
/* How long ago                                                         */
/*                                                                      */
/* A post's "2h", a pour's, a like's. Here rather than in PostCard,     */
/* which re-exports them, so the likers sheet PostCard opens can use    */
/* them without the two files importing each other.                     */
/* ==================================================================== */

/** Whole units since `iso`, or null for "just now". */
function elapsed(iso: string): { n: number; unit: 'minute' | 'hour' | 'day' | 'week' } | null {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return null;
  if (min < 60) return { n: min, unit: 'minute' };
  const h = Math.floor(min / 60);
  if (h < 24) return { n: h, unit: 'hour' };
  const d = Math.floor(h / 24);
  if (d < 7) return { n: d, unit: 'day' };
  return { n: Math.floor(d / 7), unit: 'week' };
}

/** "2h" / "3d" style relative timestamp, for tight spots: a post's author row, the story viewer's header, Activity rows. */
export function timeAgo(iso: string): string {
  const t = elapsed(iso);
  return t ? `${t.n}${t.unit[0]}` : 'now';
}

/**
 * The same timestamp in words: "2 hours ago". The card shows it this way
 * too now, at the foot of the post, where there is room for the words;
 * VoiceOver reads "2h" as "2 h" and "3w" as "3 w".
 */
export function timeAgoSpoken(iso: string): string {
  const t = elapsed(iso);
  return t ? `${t.n} ${t.unit}${t.n === 1 ? '' : 's'} ago` : 'just now';
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

function toPost(
  row: PostQueryRow,
  myId: string,
  myLikes: Set<string>,
  mySaves: Set<string>,
  likers: Map<string, UserProfile> | null,
  tags: Map<string, UserProfile[]> | null,
  places: Map<string, Record<string, PlaceRef>> | null,
): Post {
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
    // No map: unknown, so the card shows the count. A post missing from it: nobody but you to name.
    likedBy: likers ? (likers.get(row.id) ?? null) : undefined,
    savedByMe: mySaves.has(row.id),
    // No map: unknown, so the header draws no "with" line. A post missing from it: nobody tagged.
    tagged: tags ? (tags.get(row.id) ?? []) : undefined,
    // No map: unknown, so no "at" line. A post missing from it: no photo of it has a place.
    places: places ? (places.get(row.id) ?? {}) : undefined,
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
/* Feature presence                                                     */
/*                                                                      */
/* The same problem one level up: a build can reach a phone before Jan  */
/* runs the migration that adds a table or a function. Saves (017),     */
/* recent_pours (017), the likers functions (021), tags (024) and the   */
/* places on a post's photos (026) are the ones this file reads         */
/* (lib/tournaments reads 020's functions the same way, lib/places the  */
/* rest of 026's). A missing one is read as "feature off", never as a   */
/* failure: the save button hides, Today's pours shows only your own    */
/* tile, a post's likes line is the plain count, there is no Tag people */
/* row, no "with" line and no tag in Activity, and no "at" line, no     */
/* Add place and no place section, while the feed itself, which needs   */
/* none of them, keeps working.                                         */
/*                                                                      */
/* Saves, the likers, tags and places are remembered for the rest of    */
/* the session once the server says they are not there, as the avatar   */
/* column is, so a missing function costs the loads already in flight   */
/* at launch one failed request each, and nothing after. A relaunch     */
/* asks again, so applying the migration needs no new build.            */
/* ==================================================================== */

let savesTablePresent = true;

/** False once the server has said the saves table does not exist. */
export const savesSupported = () => savesTablePresent;

let likersFunctionsPresent = true;

/** False once the server has said migration 021's likers functions do not exist. */
export const likersSupported = () => likersFunctionsPresent;

let tagsTablePresent = true;
/* True once a read of post_tags has come back this session: 024 is there, not merely not yet refused. */
let tagsTableAnswered = false;

/** False once the server has said migration 024's post_tags does not exist. */
export const tagsSupported = () => tagsTablePresent;

/**
 * True once the server has answered a read of post_tags this session, so
 * 024 is known to be there. tagsSupported() is true until the server says
 * otherwise, which is right for drawing (a row that hides itself on the
 * first answer); words that promise tags exist, such as a daily idea
 * scheduled a fortnight ahead, wait for this instead.
 */
export const tagsConfirmed = () => tagsTablePresent && tagsTableAnswered;

/** Postgres's undefined_table, or PostgREST's "not in the schema cache". */
function isMissingRelation(e: { code?: string; message?: string } | null): boolean {
  return (
    !!e &&
    (e.code === '42P01' ||
      e.code === 'PGRST205' ||
      /does not exist|could not find the table/i.test(e.message ?? ''))
  );
}

/** PostgREST's "no such function", or Postgres's undefined_function. */
export function isMissingFunction(e: { code?: string } | null): boolean {
  return !!e && (e.code === 'PGRST202' || e.code === '42883');
}

/**
 * 024 is not applied: no post_tags (PGRST205, 42P01), or an embed from it
 * PostgREST cannot place (PGRST200, its schema cache has no such table).
 * Never the avatar column's 42703, whose "does not exist" would otherwise
 * read as tags missing and switch them off for the session.
 */
function isMissingTags(e: { code?: string; message?: string } | null): boolean {
  return !!e && !isMissingAvatarColumn(e) && (isMissingRelation(e) || e.code === 'PGRST200');
}

/*
 * Places (026). The flag lives here rather than in lib/places because
 * this file reads post_photos.apple_place_id for every post (fetchPostPlaces)
 * and lib/places imports this one; lib/places re-exports placesSupported,
 * which is where the screens take it from.
 */
let placesPresent = true;

/** False once the server has said migration 026 is not there: no "at" line, no Add place, no place page data. */
export const placesSupported = () => placesPresent;

/** Stops asking for places for the rest of this session (lib/places, on a missing table or function). */
export function disablePlaces(): void {
  placesPresent = false;
}

/**
 * 026 is not applied, read from any of its reads: no such function
 * (PGRST202, 42883), or no post_photos.apple_place_id / place_label
 * (42703 on a read, PGRST204 on a write naming one). The column cases
 * must name a place column, and never match the avatar column's 42703: a
 * typo elsewhere must not switch places off, and the avatar must not
 * either. (Since the licence rework, §0.5, there is no places table and
 * no embed to miss.)
 */
export function isMissingPlaces(e: { code?: string; message?: string } | null): boolean {
  if (!e || isMissingAvatarColumn(e)) return false;
  if (isMissingFunction(e)) return true;
  const msg = e.message ?? '';
  return (e.code === '42703' || e.code === 'PGRST204') && /apple_place_id|place_label/i.test(msg);
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

/** How many people someone follows. The pair to fetchFollowerCount. */
export async function fetchFollowingCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Whether `theirId` follows you, for a "Follow back" label. A head request:
 * follows are readable under RLS (that is what makes counts work), so this
 * reads nothing a count does not already reveal.
 */
export async function fetchFollowsMe(theirId: string, myId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', theirId)
    .eq('following_id', myId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Rows per followers or following list. A full page gets a "latest 200" footer. */
export const CONNECTIONS_PAGE = 200;

/*
 * Each follow row embeds the profile on the far end of the edge. follows
 * has two foreign keys to profiles, so the embed has to name which one;
 * these are Postgres's default names for the two inline references in the
 * base schema. A PGRST201 ("more than one relationship") means they are not
 * what the live database calls them: check with
 *   select conname from pg_constraint where conrelid = 'public.follows'::regclass;
 */
const CONNECTION_EMBED = {
  followers: { fk: 'follows_follower_id_fkey', on: 'following_id' },
  following: { fk: 'follows_following_id_fkey', on: 'follower_id' },
} as const;

/**
 * Someone's followers, or the people they follow, newest edge first.
 *
 * Visible to any signed-in account: follows are already readable for the
 * counts, so the list exposes nothing new. Anyone blocked either way is
 * missing on both sides of RLS: follows_read drops the edge, and
 * profiles_read would null the embed, which is dropped here too.
 */
export async function fetchConnections(
  userId: string,
  list: 'followers' | 'following',
): Promise<UserProfile[]> {
  const { fk, on } = CONNECTION_EMBED[list];
  const { data, error } = await supabase
    .from('follows')
    .select(`created_at, person:profiles!${fk}(${profileCols()})`)
    .eq(on, userId)
    .order('created_at', { ascending: false })
    .limit(CONNECTIONS_PAGE);

  if (error) throw error;
  // Cast through unknown like every embed here: database.types.ts declares
  // no relationships, so supabase-js cannot type the embedded profile.
  const rows = (data ?? []) as unknown as { person: ProfileRow | null }[];
  return rows.flatMap((r) => (r.person ? [toProfile(r.person)] : []));
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
 * Which of THESE posts you saved, scoped like fetchMyLikes.
 *
 * Never throws: any failure reads as "none saved". A bookmark drawn empty
 * on a saved post costs one tap that changes nothing (the insert is a
 * duplicate, which counts as success); a throw here would cost the whole
 * feed. A missing table also switches saving off for the session.
 */
async function fetchMySaves(myId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0 || !savesTablePresent) return new Set();
  try {
    const { data, error } = await supabase
      .from('saves')
      .select('post_id')
      .eq('user_id', myId)
      .in('post_id', postIds);
    if (error) {
      if (isMissingRelation(error)) savesTablePresent = false;
      return new Set();
    }
    return new Set((data ?? []).map((r) => r.post_id));
  } catch {
    return new Set();
  }
}

/**
 * A liker row (migration 021) as a profile. joinedAt is '' because the
 * functions do not return it: neither the "Liked by" line nor the likers
 * list says when anyone joined, and nothing reads the field (PostCard's
 * unknown author carries the same '').
 */
function likerToProfile(
  r: Pick<PostLikerRow, 'user_id' | 'username' | 'display_name' | 'accent' | 'avatar_path'>,
): UserProfile {
  return {
    id: r.user_id,
    username: r.username,
    displayName: r.display_name,
    accent: r.accent,
    avatarPath: r.avatar_path,
    joinedAt: '',
  };
}

/** Posts per post_like_summaries call: the server reads at most 100 and ignores the rest. */
const SUMMARIES_PER_CALL = 100;

/**
 * The liker each of THESE posts' "Liked by" line names, by post id
 * (migration 021). A post with nobody to name, no likes or only yours, is
 * missing from the map, which toPost reads as null: known, nobody.
 *
 * Null means unknown: the functions are missing (which also switches the
 * likers off for the session, as a missing saves table does) or a call
 * failed. Never throws, like fetchMySaves: an unknown liker costs the line
 * its name and the card falls back to the count, where a throw would cost
 * the whole feed.
 */
async function fetchLikeSummaries(postIds: string[]): Promise<Map<string, UserProfile> | null> {
  if (!likersFunctionsPresent) return null;
  if (postIds.length === 0) return new Map();
  try {
    const pages = await Promise.all(
      chunk(postIds, SUMMARIES_PER_CALL).map(async (part) => {
        const { data, error } = await supabase.rpc('post_like_summaries', { p_post_ids: part });
        if (error) {
          if (isMissingFunction(error)) likersFunctionsPresent = false;
          return null;
        }
        return data ?? [];
      }),
    );
    // One failed chunk makes the whole answer unknown: a post in it would
    // otherwise read as "nobody to name" when somebody is.
    if (pages.some((page) => page === null)) return null;
    return new Map(pages.flatMap((page) => page ?? []).map((r) => [r.post_id, likerToProfile(r)]));
  } catch {
    return null;
  }
}

/*
 * Posts per post_tags read. A request returns at most the API's row cap
 * (1,000 on hosted Supabase) without saying it stopped, and a post holds
 * up to POST_TAGS_MAX tags, so 100 posts is the most one request can
 * carry whole. IDS_PER_REQUEST's 150 could come back cut short.
 */
const TAGGED_POSTS_PER_REQUEST = 100;

/*
 * A tag with its person embedded. Typed loosely like every embed here
 * (database.types.ts declares no relationships) and cast, not trusted:
 * `person` is null when profiles_read hides them, which post_tags_read
 * has already done for anyone you are blocked with, so null is rare.
 */
interface TagQueryRow {
  post_id: string;
  created_at: string;
  person: ProfileRow | null;
}

/**
 * Who is tagged on THESE posts (migration 024), by post id, each post's
 * people oldest tag first: the author's pick order, since setPostTags
 * writes them one at a time. A post with nobody tagged is missing from the
 * map, which toPost reads as [].
 *
 * Null means unknown: the table is missing (which also switches tags off
 * for the session) or a read failed. Never throws, like fetchLikeSummaries.
 * A read of its own rather than an embed in POST_SELECT: PostgREST fails a
 * whole select whose embed it does not know (PGRST200), and a post read
 * must never fail because of its tags.
 */
async function fetchPostTags(postIds: string[]): Promise<Map<string, UserProfile[]> | null> {
  if (!tagsTablePresent) return null;
  if (postIds.length === 0) return new Map();
  try {
    const pages = await Promise.all(
      chunk(postIds, TAGGED_POSTS_PER_REQUEST).map(async (part) => {
        const { data, error } = await supabase
          .from('post_tags')
          .select(`post_id, created_at, person:profiles(${profileCols()})`)
          .in('post_id', part)
          .order('created_at')
          .order('tagged_id');
        if (error) {
          if (isMissingTags(error)) tagsTablePresent = false;
          return null;
        }
        tagsTableAnswered = true;
        return (data ?? []) as unknown as TagQueryRow[];
      }),
    );
    // One failed chunk makes the whole answer unknown, as for the likers:
    // a post in it would otherwise read as "nobody tagged" when somebody is.
    if (pages.some((page) => page === null)) return null;
    const out = new Map<string, UserProfile[]>();
    for (const row of pages.flatMap((page) => page ?? [])) {
      if (!row.person) continue;
      const person = toProfile(row.person);
      const people = out.get(row.post_id);
      if (people) people.push(person);
      else out.set(row.post_id, [person]);
    }
    return out;
  } catch {
    return null;
  }
}

/*
 * A tagged photo's two place columns (migration 026). Typed loosely and
 * checked, not trusted: the label is someone else's words.
 */
interface PlacedPhotoRow {
  post_id: string;
  path: string;
  apple_place_id: unknown;
  place_label: unknown;
}

/*
 * The checks lib/places' toPlaceRef runs, for the two columns a photo
 * carries. Written here rather than imported: lib/places imports this
 * file, and a runtime import back would be a cycle. The server already
 * holds the label to one tidy line of 1 to 60 characters; this only
 * refuses what is not a string.
 */
function photoPlaceRef(id: unknown, label: unknown): PlaceRef | null {
  if (!isPlaceId(id)) return null;
  const said = typeof label === 'string' ? label.trim() : '';
  if (!said) return null;
  return { appleId: id, label: said };
}

/**
 * Where THESE posts' photos were had (migration 026), by post id, then by
 * photo path: each photo's Place ID and its poster's label, nothing else
 * (the server holds nothing else, §0.5). A post with no tagged photo is missing from the map, which
 * toPost reads as {}.
 *
 * fetchPostTags exactly: the same chunks, null for unknown (026 missing,
 * which also switches places off for the session, or a read failed), and
 * never a throw. A read of its own rather than an embed in POST_SELECT,
 * for 024's reason: a post read must never fail because of its places.
 * The chunk is the tags' 100 posts; a post's photos are not capped, so a
 * page of 100 posts would need more than ten tagged photos each on
 * average to reach the API's 1,000-row cap.
 */
async function fetchPostPlaces(postIds: string[]): Promise<Map<string, Record<string, PlaceRef>> | null> {
  if (!placesPresent) return null;
  if (postIds.length === 0) return new Map();
  try {
    const pages = await Promise.all(
      chunk(postIds, TAGGED_POSTS_PER_REQUEST).map(async (part) => {
        const { data, error } = await supabase
          .from('post_photos')
          .select('post_id, path, apple_place_id, place_label')
          .in('post_id', part)
          .not('apple_place_id', 'is', null);
        if (error) {
          if (isMissingPlaces(error)) placesPresent = false;
          return null;
        }
        return (data ?? []) as unknown as PlacedPhotoRow[];
      }),
    );
    // One failed chunk makes the whole answer unknown: a post in it would read as "no place" when it has one.
    if (pages.some((page) => page === null)) return null;
    const out = new Map<string, Record<string, PlaceRef>>();
    for (const row of pages.flatMap((page) => page ?? [])) {
      if (typeof row.post_id !== 'string' || typeof row.path !== 'string') continue;
      const place = photoPlaceRef(row.apple_place_id, row.place_label);
      if (!place) continue;
      const byPath = out.get(row.post_id);
      if (byPath) byPath[row.path] = place;
      else out.set(row.post_id, { [row.path]: place });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Rows to posts, minus any whose drink has left the Dex.
 *
 * posts.drink_id has no foreign key, and beer and wine were removed on
 * 20 Sep 2026 with no server cleanup, so those posts still come back. The
 * cards render nothing for them, but every count, grid and empty-state check
 * works from the array — "Posts 12" over five tiles, or a feed of nothing
 * with no empty state. Dropping them here keeps every consumer on one list.
 * Order is kept, so a caller that sorted the rows (Saved, by when you saved
 * each one) gets its posts back in that order.
 */
async function toPosts(rows: PostQueryRow[], myId: string): Promise<Post[]> {
  const live = rows.filter((r) => getDrink(r.drink_id));
  const ids = live.map((r) => r.id);
  const [myLikes, mySaves, likers, tags, places] = await Promise.all([
    fetchMyLikes(myId, ids),
    fetchMySaves(myId, ids),
    fetchLikeSummaries(ids),
    fetchPostTags(ids),
    fetchPostPlaces(ids),
  ]);
  return live.map((r) => toPost(r, myId, myLikes, mySaves, likers, tags, places));
}

/**
 * Whether PostCard draws anything for this post. It renders null for a
 * drink that is not in this build (the wine and beer removed on 20 Sep
 * 2026 still have posts), so every list of posts filters with this
 * rather than leaving a zero-height cell and its gap. Widen it here, and
 * only here, when another kind of drink gains posts.
 */
export function isRenderablePost(post: Post): boolean {
  return getDrink(post.drinkId) !== undefined;
}

/**
 * How many of the people you follow (never you) have a post in `feed`
 * from today, by the phone's clock: Home's dateline ("6 friends posted
 * today"). Distinct people, not posts. Read from the feed already on the
 * phone, so it costs no request; the feed is the newest FEED_SIZE posts,
 * which a day of friends' posts does not outrun in practice.
 *
 * `following` and not "every author but you": the feed can still hold
 * someone you unfollowed a moment ago, until its next fetch.
 */
export function friendsPostedToday(
  feed: readonly Post[],
  following: readonly string[],
  myId: string,
  now: Date,
): number {
  const followed = new Set(following);
  const who = new Set<string>();
  for (const post of feed) {
    if (post.authorId === myId || !followed.has(post.authorId) || who.has(post.authorId)) continue;
    const at = new Date(post.createdAt);
    // Local calendar day, not the last 24 hours: the line says "today" under today's date.
    if (
      at.getFullYear() === now.getFullYear() &&
      at.getMonth() === now.getMonth() &&
      at.getDate() === now.getDate()
    ) {
      who.add(post.authorId);
    }
  }
  return who.size;
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

/**
 * One post, for the single-post screen. Null when it is gone, when you are
 * blocked with its author either way (posts_read hides it), or when its
 * drink has left the Dex: all three are "unavailable" to the screen, and
 * none is an error. Throws only when the request itself failed.
 */
export async function fetchPost(postId: string, myId: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const [post] = await toPosts([data as unknown as PostQueryRow], myId);
  return post ?? null;
}

/**
 * Your saved posts, most recently saved first.
 *
 * A saved post whose author you have since blocked, either way, comes back
 * with a null `post`, because posts_read applies inside the embed; those
 * are dropped. The save row itself stays, and goes with the post or with
 * your account (both cascade).
 *
 * With the table missing (migration 017 not applied) this switches saving
 * off and resolves empty, so the screen can ask savesSupported() and say
 * "not available" rather than "nothing saved".
 */
export async function fetchSavedPosts(myId: string): Promise<Post[]> {
  if (!savesTablePresent) return [];
  const { data, error } = await supabase
    .from('saves')
    .select(`created_at, post:posts(${POST_SELECT})`)
    .eq('user_id', myId)
    .order('created_at', { ascending: false })
    .limit(FEED_SIZE);

  if (error) {
    if (isMissingRelation(error)) {
      savesTablePresent = false;
      return [];
    }
    throw error;
  }
  const rows = (data ?? []) as unknown as { post: PostQueryRow | null }[];
  return toPosts(
    rows.flatMap((r) => (r.post ? [r.post] : [])),
    myId,
  );
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
/* Today's pours and Activity                                           */
/* ==================================================================== */

/**
 * Every photo shared in the last 24 hours by you or anyone you follow,
 * newest first, for the row of story circles on Home.
 *
 * By photo, not by post: posting a drink again adds a photo to its old post
 * (one post per drink), and that photo is still one of today's. The function
 * runs as the caller, so the tables' own read policies, blocks included,
 * decide what comes back.
 *
 * Empty, not an error, when the function is missing (migration 017 not
 * applied): the row then shows only your own tile. Pours of drinks that
 * have left the Dex are dropped, as toPosts drops their posts.
 *
 * Each pour carries the song added with that photo (migration 020), or
 * null; before 020 the function returns no music columns and every pour
 * reads as having none.
 */
export async function fetchRecentPours(): Promise<Pour[]> {
  const { data, error } = await supabase.rpc('recent_pours');
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return (data ?? [])
    .filter((r) => getDrink(r.drink_id))
    .map((r) => ({
      postId: r.post_id,
      authorId: r.author_id,
      drinkId: r.drink_id,
      path: r.path,
      at: r.poured_at,
      music: songFromRow(r),
    }));
}

/** At most this many Activity rows, from at most ACTIVITY_DAYS back. */
const ACTIVITY_LIMIT = 60;
const ACTIVITY_DAYS = 30;

/*
 * The likes side of Activity embeds the liked post with !inner, so the
 * filter on posts.author_id narrows the likes themselves (a plain embed
 * would return every like and null out the posts that did not match).
 * Typed `unknown` like every embed here, and narrowed by shape: PostgREST
 * returns a many-to-one embed as an object, but nothing in the types
 * promises that.
 */
interface LikeActivityRow {
  post_id: string;
  user_id: string;
  created_at: string;
  posts?: unknown;
}

/** The liked post's drink and preview photo; the author filter already ran on the server. */
type LikedPost = { drink_id: string; photo_path: string | null };

function likedPost(raw: unknown): LikedPost | null {
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (typeof one !== 'object' || one === null) return null;
  const p = one as { drink_id?: unknown; photo_path?: unknown };
  if (typeof p.drink_id !== 'string') return null;
  return { drink_id: p.drink_id, photo_path: typeof p.photo_path === 'string' ? p.photo_path : null };
}

const newestAtFirst = (a: { at: string }, b: { at: string }) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/*
 * The tags side of Activity (migration 024): tags of you, each with the
 * post it is on. !inner like the likes side, so a post posts_read hides
 * takes its tag row with it; post_tags_read already requires the post be
 * visible, so in practice nothing is dropped by it.
 */
interface TagActivityRow {
  post_id: string;
  created_at: string;
  posts?: unknown;
}

/** The post a tag is on: who wrote it, its drink and its preview photo. */
type TaggingPost = { author_id: string; drink_id: string; photo_path: string | null };

function taggingPost(raw: unknown): TaggingPost | null {
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (typeof one !== 'object' || one === null) return null;
  const p = one as { author_id?: unknown; drink_id?: unknown; photo_path?: unknown };
  if (typeof p.author_id !== 'string' || typeof p.drink_id !== 'string') return null;
  return {
    author_id: p.author_id,
    drink_id: p.drink_id,
    photo_path: typeof p.photo_path === 'string' ? p.photo_path : null,
  };
}

/**
 * Tags of you since `since`, newest first, at most ACTIVITY_LIMIT. Empty,
 * not an error, before 024 (and tags go off for the session); throws when
 * the read itself failed, as the likes and follows reads do.
 */
async function fetchTagsOfMe(myId: string, since: string): Promise<TagActivityRow[]> {
  if (!tagsTablePresent) return [];
  const { data, error } = await supabase
    .from('post_tags')
    .select('post_id, created_at, posts!inner(id, author_id, drink_id, photo_path)')
    .eq('tagged_id', myId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (error) {
    if (isMissingTags(error)) {
      tagsTablePresent = false;
      return [];
    }
    throw error;
  }
  tagsTableAnswered = true;
  return (data ?? []) as unknown as TagActivityRow[];
}

/**
 * Likes on your posts, new followers and people tagging you in their posts
 * (024), newest first: one row per event, at most 60, from the last 30
 * days. Built from the likes, follows and post_tags tables as they are;
 * nothing new is stored, so a tag removed (by you, its author or a block)
 * takes its row with it. Your own likes of your own posts are not
 * activity. Likes and tags on a drink that has left the Dex are dropped,
 * since the row would point at a post nobody can open.
 */
export async function fetchActivity(myId: string): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [likes, follows, tags] = await Promise.all([
    supabase
      .from('likes')
      .select('post_id, user_id, created_at, posts!inner(id, author_id, drink_id, photo_path)')
      .eq('posts.author_id', myId)
      .neq('user_id', myId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', myId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
    fetchTagsOfMe(myId, since),
  ]);
  if (likes.error) throw likes.error;
  if (follows.error) throw follows.error;

  const items: ActivityItem[] = [];
  for (const row of (likes.data ?? []) as unknown as LikeActivityRow[]) {
    const post = likedPost(row.posts);
    if (!post || !getDrink(post.drink_id)) continue;
    items.push({
      kind: 'like',
      key: `like:${row.post_id}:${row.user_id}`,
      actorId: row.user_id,
      postId: row.post_id,
      drinkId: post.drink_id,
      photoPath: post.photo_path,
      at: row.created_at,
    });
  }
  for (const row of follows.data ?? []) {
    items.push({
      kind: 'follow',
      key: `follow:${row.follower_id}`,
      actorId: row.follower_id,
      at: row.created_at,
    });
  }
  for (const row of tags) {
    const post = taggingPost(row.posts);
    if (!post || !getDrink(post.drink_id)) continue;
    items.push({
      kind: 'tag',
      key: `tag:${row.post_id}`,
      actorId: post.author_id,
      postId: row.post_id,
      drinkId: post.drink_id,
      photoPath: post.photo_path,
      at: row.created_at,
    });
  }
  return items.sort(newestAtFirst).slice(0, ACTIVITY_LIMIT);
}

/**
 * When you were last tagged (024), or null: never, or before 024 (tags go
 * off for the session). Throws when the read itself failed. No join:
 * post_tags_read already shows only tags on posts you can see.
 */
async function fetchLatestTagAt(myId: string): Promise<string | null> {
  if (!tagsTablePresent) return null;
  const { data, error } = await supabase
    .from('post_tags')
    .select('created_at')
    .eq('tagged_id', myId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingTags(error)) {
      tagsTablePresent = false;
      return null;
    }
    throw error;
  }
  tagsTableAnswered = true;
  return data?.[0]?.created_at ?? null;
}

/**
 * When the newest like on one of your posts, the newest follow of you or
 * the newest tag of you (024) happened, whichever is latest; null when
 * there is none. Feeds the dot on Home's heart, so it has no time floor: a
 * like from five weeks ago is still unseen if Activity was never opened.
 * Three one-row reads; before 024 the tag read answers null.
 */
export async function fetchLatestActivityAt(myId: string): Promise<string | null> {
  const [like, follow, tag] = await Promise.all([
    supabase
      .from('likes')
      .select('created_at, posts!inner(author_id)')
      .eq('posts.author_id', myId)
      .neq('user_id', myId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('follows')
      .select('created_at')
      .eq('following_id', myId)
      .order('created_at', { ascending: false })
      .limit(1),
    fetchLatestTagAt(myId),
  ]);
  if (like.error) throw like.error;
  if (follow.error) throw follow.error;

  const a = (like.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
  const b = follow.data?.[0]?.created_at ?? null;
  // The server's own timestamptz strings, one format, so they compare as text.
  return [a, b, tag].reduce<string | null>((latest, t) => (t && (!latest || t > latest) ? t : latest), null);
}

/* ==================================================================== */
/* Who liked a post (migration 021)                                     */
/* ==================================================================== */

/** People per page of a post's likers list. */
export const LIKERS_PAGE = 50;

/**
 * Where the next page of likers starts: the last row's like time and id.
 * `at` is the server's string, passed back untouched: a Date would drop
 * the microseconds, and the next page would then repeat the row it
 * started from.
 */
export type LikersCursor = { at: string; user: string };

/**
 * Someone in a post's likers list, whether you followed them when the page
 * loaded, and when they liked it (the RPC's liked_at, the same string the
 * cursor carries), for the sheet's "liked 2h ago".
 */
export type PostLiker = UserProfile & { followedByMe: boolean; likedAt: string };

/**
 * Everyone who liked a post, newest first, LIKERS_PAGE at a time. You are
 * listed like anyone; anyone blocked either way is not (the function's
 * read policies, and its own block check). `next` is null on the last
 * page.
 *
 * 'unsupported' when the server has no post_likers (021 not applied), so
 * the sheet can say "soon" rather than "could not load": a phone ahead of
 * its server is not a failure. Throws when the request itself failed.
 */
export async function fetchPostLikers(
  postId: string,
  cursor?: LikersCursor | null,
): Promise<{ people: PostLiker[]; next: LikersCursor | null } | 'unsupported'> {
  if (!likersFunctionsPresent) return 'unsupported';
  const { data, error } = await supabase.rpc('post_likers', {
    p_post_id: postId,
    p_limit: LIKERS_PAGE,
    p_before_at: cursor?.at ?? null,
    p_before_user: cursor?.user ?? null,
  });
  if (error) {
    if (isMissingFunction(error)) {
      likersFunctionsPresent = false;
      return 'unsupported';
    }
    throw error;
  }
  const rows = data ?? [];
  const last = rows[rows.length - 1];
  return {
    people: rows.map((r) => ({ ...likerToProfile(r), followedByMe: r.followed_by_me, likedAt: r.liked_at })),
    // A short page is the last one; a full one may be too, which costs one empty request.
    next: last && rows.length === LIKERS_PAGE ? { at: last.liked_at, user: last.user_id } : null,
  };
}

/* ==================================================================== */
/* Tags (migration 024; specs/v4.3/spec.md §1, §2)                      */
/*                                                                      */
/* The people a post's author was with: up to ten people they follow,   */
/* on the post rather than a photo (a post is one drink, 007). Only the */
/* author tags; the tagged person can remove themselves, and that       */
/* sticks for the post; a block removes the tags between two people     */
/* both ways. The server holds every one of those rules (024's policies */
/* and triggers); nothing here pre-checks more than it needs to explain */
/* a refusal. Read beside the likes and saves in toPosts, and in        */
/* Activity, all gated on tagsSupported() like saves on savesSupported. */
/* ==================================================================== */

/** At most this many people on one post (024's post_tags_full). */
export const POST_TAGS_MAX = 10;

/**
 * The tags on YOUR post of this drink, for a re-post's compose row (spec
 * §1.2): the post's id, null when there is no post yet, and who is on it,
 * oldest tag first.
 *
 * Never throws. Tags off (024 not applied) or a failed post read come back
 * as no post and nobody; a failed tags read, as the post with nobody. The
 * row then starts empty and Post only adds, which is safe: tagging someone
 * already tagged counts as done (setPostTags). A tags read that found 024
 * missing has switched tags off by the time this resolves, so the caller
 * asks tagsSupported() again before drawing the row.
 *
 * With no post yet there are no tags to read, so while no read of
 * post_tags has answered this session (the + window opened straight after
 * a cold start, before Home's feed), one one-row read asks whether 024 is
 * there at all: before it, the row would otherwise stand on a server that
 * has no tags until its first tap.
 */
export async function fetchMyPostTags(
  myId: string,
  drinkId: string,
): Promise<{ postId: string | null; people: UserProfile[] }> {
  if (!tagsTablePresent) return { postId: null, people: [] };
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id')
      .eq('author_id', myId)
      .eq('drink_id', drinkId)
      .maybeSingle();
    if (error) return { postId: null, people: [] };
    if (!data) {
      if (!tagsTableAnswered) await probeTags(myId);
      return { postId: null, people: [] };
    }
    const tags = await fetchPostTags([data.id]);
    return { postId: data.id, people: tags?.get(data.id) ?? [] };
  } catch {
    return { postId: null, people: [] };
  }
}

/** One row of your own tags, read only to learn whether 024 is there. Never throws. */
async function probeTags(myId: string): Promise<void> {
  try {
    const { error } = await supabase.from('post_tags').select('post_id').eq('tagged_id', myId).limit(1);
    if (!error) tagsTableAnswered = true;
    else if (isMissingTags(error)) tagsTablePresent = false;
  } catch {
    // Unknown still; the next read of post_tags settles it.
  }
}

/**
 * Why one person could not be tagged:
 *
 *   not-allowed  024's insert policy said no (42501): you do not follow
 *                them (any more), they removed themselves from this post,
 *                a block either way, or yourself. Also an account deleted
 *                meanwhile (23503).
 *   full         ten on the post already (post_tags_full, P0001)
 *   failed       anything else: offline, a timeout, the server, or 024
 *                not applied
 */
export type TagRefusal = 'not-allowed' | 'full' | 'failed';

/** Tags one person; null when they are tagged now (a repeat is 23505, already done). Never throws. */
async function tagOne(postId: string, taggedId: string): Promise<TagRefusal | null> {
  try {
    const { error } = await supabase.from('post_tags').insert({ post_id: postId, tagged_id: taggedId });
    if (!error || error.code === '23505') return null;
    if (error.code === '42501' || error.code === '23503') return 'not-allowed';
    if (error.code === 'P0001' && /post_tags_full/.test(error.message ?? '')) return 'full';
    if (isMissingTags(error)) tagsTablePresent = false;
    return 'failed';
  } catch {
    return 'failed';
  }
}

/** Who is on this post now, by id, or null when the read failed. Never throws. */
async function taggedIdsOn(postId: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase.from('post_tags').select('tagged_id').eq('post_id', postId);
    if (error) return null;
    return new Set((data ?? []).map((r) => r.tagged_id));
  } catch {
    return null;
  }
}

/**
 * Writes the difference between `prev` (who the post had when the person
 * started) and `next` (who they picked) on your post.
 *
 * Removals first, in one delete, so swapping someone at ten frees the
 * place before it is taken. Then one insert per new person, in pick order
 * and one at a time: one refusal never drops the rest, and the server's
 * clock keeps the pick order, which is the order fetchPostTags reads back
 * and the "with" line names them in.
 *
 *   added    tagged now, including anyone who already was
 *   removed  untagged now: all of `prev` not in `next`, or [] when the
 *            delete failed (or tags are off) and nobody was
 *   refused  everyone in `next` but not `prev` who is not on the post,
 *            and why; after the first 'full' the rest are 'full' with no
 *            request
 *
 * Someone in both lists is left alone, so a person who removed themselves
 * while the author was choosing is never put back. Never throws: the
 * caller patches its copy of the post from the answer.
 */
export async function setPostTags(
  myId: string,
  postId: string,
  next: readonly string[],
  prev: readonly string[],
): Promise<{ added: string[]; removed: string[]; refused: { id: string; why: TagRefusal }[] }> {
  const had = new Set(prev);
  const keep = new Set(next);
  const toAdd = [...keep].filter((id) => !had.has(id));
  const toRemove = [...had].filter((id) => !keep.has(id));

  const added: string[] = [];
  const refused: { id: string; why: TagRefusal }[] = [];
  let removed: string[] = [];

  if (toRemove.length > 0 && tagsTablePresent) {
    try {
      const { error } = await supabase
        .from('post_tags')
        .delete()
        .eq('post_id', postId)
        .in('tagged_id', toRemove);
      if (!error) removed = toRemove;
      else if (isMissingTags(error)) tagsTablePresent = false;
    } catch {
      // Nobody was removed; `removed` stays empty and the caller puts them back.
    }
  }

  let full = false;
  const refusals = new Map<string, TagRefusal>();
  for (const id of toAdd) {
    let why: TagRefusal | null;
    if (!tagsTablePresent) why = 'failed';
    else if (id === myId) why = 'not-allowed';
    else if (full) why = 'full';
    else why = await tagOne(postId, id);

    if (why !== null) refusals.set(id, why);
    if (why === 'full') full = true;
  }

  /*
   * A refusal can name someone who is on the post already. Postgres runs
   * 024's cap trigger, then its insert policy, and only then the primary
   * key, so a repeat comes back post_tags_full at ten, or 42501 when you
   * have unfollowed them since, never the 23505 that means done. That
   * happens whenever `prev` was short: the re-post's tags read failed
   * (fetchMyPostTags), or the copy of the post was stale. So any refusal
   * reads the post's tags once, and whoever is on it counts as added; if
   * that read fails too, the refusals stand.
   */
  if (refusals.size > 0 && tagsTablePresent) {
    const onPost = await taggedIdsOn(postId);
    for (const id of [...refusals.keys()]) {
      if (onPost?.has(id)) refusals.delete(id);
    }
  }
  for (const id of toAdd) {
    const why = refusals.get(id);
    if (why) refused.push({ id, why });
    else added.push(id);
  }
  return { added, removed, refused };
}

/**
 * Takes you off someone's post (spec §1.5). It sticks: 024 keeps a
 * refusal, so its author cannot tag you on that post again, and they are
 * not told. A tag already gone (the author untagged you, the post was
 * deleted) is the state asked for. Throws when the request failed, so the
 * caller can put you back.
 */
export async function removeMyTag(myId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('post_tags')
    .delete()
    .eq('post_id', postId)
    .eq('tagged_id', myId);
  if (!error) return;
  if (isMissingTags(error)) tagsTablePresent = false;
  throw error;
}

/* ==================================================================== */
/* Photos                                                               */
/* ==================================================================== */

/*
 * Every photo leaves the device through stripMetadata first, pour photos,
 * avatars and the photo on a drink suggestion alike: a fresh JPEG with no
 * EXIF and no GPS. A picture taken at home and posted to a feed would
 * otherwise publish where the poster lives. The object is therefore always
 * a .jpg sent as image/jpeg, whatever the picker handed over — HEIC
 * included.
 *
 * If stripping fails, the upload fails. The original is never sent as a
 * fallback, because that fallback is the leak.
 *
 * The stripped copy is a temporary file made for this upload alone, so it
 * is removed afterwards, sent or not; the caller's own file is left alone.
 *
 * Exported for lib/submissions, whose suggestion photos go to the same
 * `pours/<uid>/` folder and must take the same strip. Resolves false when
 * the local file is gone; throws when stripping or the upload fails.
 */
export async function putStrippedPhoto(
  localUri: string,
  path: string,
  maxEdge?: number,
  options?: { square?: boolean },
): Promise<boolean> {
  if (!new File(localUri).exists) return false;
  const clean = await stripMetadata(localUri, maxEdge, options);
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

const AVATAR_MAX_EDGE = 512;

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
    /*
     * 512px, not the 2048px pour photos get: an avatar is never drawn larger
     * than the edit preview's 88pt disc (264px on a 3x screen), and every
     * list of people downloads and decodes one per row. Square, the centre
     * of the photo: a round avatar shows nothing else, and a square file is
     * what lets a small face's early-resized decode cover its circle
     * (expo-image fits that thumbnail inside the frame, so a 4:3 one fell a
     * third short). 512 is nearly twice the largest disc, so there is no
     * reason to send 1024 to every list of people.
     */
    return (await putStrippedPhoto(localUri, path, AVATAR_MAX_EDGE, { square: true })) ? path : null;
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
 * Keyed by bucket and path, holding the promise rather than the result so
 * that N simultaneous mounts of one avatar share a single request instead
 * of racing N of them. Two buckets are read this way: `pours` (pour photos,
 * avatars, suggestion photos) and `reels` (a reel's poster and video). The
 * same path in each is a different object, hence the bucket in the key.
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
 *
 * Still one hour, in memory only, for reels too. A longer-lived URL, or one
 * persisted across launches, would let someone you have since blocked keep
 * fetching your file for its whole life, which undoes the block-aware
 * Storage policies both buckets have.
 */
const SIGNED_TTL_MS = 55 * 60 * 1000;
const SIGNED_URL_SECONDS = 60 * 60;

/** The private buckets whose objects are read through signed URLs. */
export type Bucket = 'pours' | 'reels';

interface SignedEntry {
  at: number;
  url: Promise<string | null>;
  settled?: string;
}

const signedCache = new Map<string, SignedEntry>();

const signedKey = (bucket: Bucket, path: string) => `${bucket}:${path}`;

/** A cache entry still inside its TTL, or undefined. */
function freshEntry(key: string): SignedEntry | undefined {
  const hit = signedCache.get(key);
  return hit && Date.now() - hit.at < SIGNED_TTL_MS ? hit : undefined;
}

/*
 * Entries past their TTL are deleted, at most once a minute, as new ones
 * go in. freshEntry already reads them as misses, but nothing removed
 * them: every path signed in a session stayed in the map until the app
 * was killed, a long signed URL and its promise each. Every page of the
 * Reels feed adds two per reel (fetchReels signs the poster and the video
 * up front), plus one per pour photo and avatar scrolled past, so the map
 * grew for as long as someone kept swiping. Only expired entries go, so
 * no answer changes.
 */
const SWEEP_EVERY_MS = 60 * 1000;
let lastSweep = 0;

function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, entry] of signedCache) {
    if (now - entry.at >= SIGNED_TTL_MS) signedCache.delete(key);
  }
}

/**
 * Puts an entry in the cache whose URL is whatever `sign` resolves to.
 * Only successes stay: an entry whose URL comes back null removes itself
 * (and only itself, never a newer entry for the same key), so the next
 * mount signs again. Never rejects.
 */
function cacheSigning(key: string, sign: Promise<string | null>): SignedEntry {
  const entry = { at: Date.now() } as SignedEntry;
  sweepExpired(entry.at);
  const evict = () => {
    if (signedCache.get(key) === entry) signedCache.delete(key);
  };
  entry.url = sign
    .then((url) => {
      if (!url) {
        evict();
        return null;
      }
      entry.settled = url;
      return url;
    })
    .catch(() => {
      evict();
      return null;
    });
  signedCache.set(key, entry);
  return entry;
}

/** The bucket is private, so reads go through a short-lived signed URL. Never rejects. */
export async function signedPhotoUrl(path: string | null, bucket: Bucket = 'pours'): Promise<string | null> {
  if (!path) return null;

  const key = signedKey(bucket, path);
  const hit = freshEntry(key);
  if (hit) return hit.url;

  return cacheSigning(
    key,
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data, error }) => (error ? null : (data?.signedUrl ?? null))),
  ).url;
}

/*
 * Paths per createSignedUrls request. The paths travel in a POST body, not
 * the URL, so this is about keeping one failure small rather than a size
 * limit: a profile grid or a page of reels is one request either way.
 */
const SIGN_PER_REQUEST = 100;

/**
 * Signs many paths at once and seeds the cache with them: one request for
 * a whole profile grid or a page of reel posters, instead of one per tile
 * as each mounts.
 *
 * Paths already signed and still fresh are skipped. The rest are cached at
 * once, before the request returns, so a tile that mounts meanwhile shares
 * this request instead of starting its own. A path the server would not
 * sign, or a request that failed, leaves no entry behind: the tile then
 * signs on its own, as if this had never run. Never rejects.
 */
export async function primeSignedUrls(bucket: Bucket, paths: string[]): Promise<void> {
  const wanted = [...new Set(paths.filter(Boolean))].filter((p) => !freshEntry(signedKey(bucket, p)));
  if (wanted.length === 0) return;

  await Promise.all(
    chunk(wanted, SIGN_PER_REQUEST).map((part) => {
      const batch = supabase.storage
        .from(bucket)
        .createSignedUrls(part, SIGNED_URL_SECONDS)
        .then(({ data, error }) => {
          const urls = new Map<string, string>();
          if (error || !data) return urls;
          for (const row of data) {
            if (row.path && row.signedUrl && !row.error) urls.set(row.path, row.signedUrl);
          }
          return urls;
        });
      return Promise.all(
        part.map((p) => cacheSigning(signedKey(bucket, p), batch.then((urls) => urls.get(p) ?? null)).url),
      );
    }),
  );
}

/**
 * The signed URL for `path` if one has already arrived, synchronously.
 * Undefined when it has not — the caller then waits on signedPhotoUrl.
 */
export function peekSignedPhoto(path: string | null | undefined, bucket: Bucket = 'pours'): string | undefined {
  if (!path) return undefined;
  return freshEntry(signedKey(bucket, path))?.settled;
}

/**
 * Drops a path from the signed-URL cache: when its file is replaced or
 * deleted, or when a reel's video would not play and is signed again.
 */
export function forgetSignedPhoto(path: string | null, bucket: Bucket = 'pours'): void {
  if (path) signedCache.delete(signedKey(bucket, path));
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
 * Resolves to the post's id, new or existing, so the caller can write its
 * tags (setPostTags), and `withPhoto`: false only when the post is up but
 * the photo meant for it is not on it, so the caller can say so (true with
 * no photo to send). Throws when the post itself could not be written. The
 * server dates the post (created_at is never sent).
 *
 * `music` is the song for this photo's story (migration 020). It goes on
 * the photo row, never the post, so a later re-post with no song does not
 * inherit it, and only while EXPO_PUBLIC_STORY_MUSIC is on. If the server
 * will not take the song (a column 020 has not added yet, the content
 * filter, the shape check), the photo is written again without it: the
 * photo matters more than the song.
 *
 * `place` is where this photo was had (migration 026, v4.8 P5): Apple's
 * Place ID and the poster's label, the only two things Sipply keeps about
 * a venue (§0.5). Like the song it goes on the photo row, never the post,
 * because a re-post of the same drink can be at another bar; and like the
 * song it never costs the photo. A place-bearing insert refused because of
 * the place (the label's content filter, detail 'place'; a shape check;
 * or PGRST204, 026 not applied) is written again without it. `placed`
 * says whether it went on: true when there was no place to send, so only a
 * place that was asked for and dropped reads false ('unplaced'). With no
 * photo there is nothing to carry a place, which is false too when one was
 * asked for; the compose rows offer a place only beside a photo.
 */
export async function createPost(
  myId: string,
  drinkId: string,
  caption: string,
  localPhotoUri: string | null,
  music?: Song | null,
  place?: PlaceRef | null,
): Promise<{ withPhoto: boolean; postId: string; placed: boolean }> {
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

  const noPlace = !place;
  if (!localPhotoUri) return { withPhoto: true, postId, placed: noPlace };

  const path = await uploadPhoto(myId, localPhotoUri);
  if (!path) return { withPhoto: false, postId, placed: noPlace };

  /*
   * The trigger repoints posts.photo_path at the newest photo. If the row
   * cannot be written the post is still up, so this is the same answer as a
   * failed upload rather than a throw that would call the whole post failed —
   * and the object just uploaded is removed, since nothing points at it.
   *
   * The song and the place each drop out on a refusal that names them,
   * the place first: a PGRST204 naming apple_place_id is 026 missing, not
   * the song, and reading it as the song's would lose a song the server
   * would have taken. Each pass removes one of them, so there are at most three
   * inserts, and one in the usual case.
   */
  let song = music && STORY_MUSIC !== 'off' ? musicColumns(music) : {};
  let placeCols: { apple_place_id?: string; place_label?: string } = place
    ? { apple_place_id: place.appleId, place_label: place.label }
    : {};
  for (;;) {
    const { error: photoError } = await supabase
      .from('post_photos')
      .insert({ post_id: postId, path, ...song, ...placeCols });
    if (!photoError) return { withPhoto: true, postId, placed: noPlace || placeCols.apple_place_id !== undefined };
    if (placeCols.apple_place_id !== undefined && isPlaceRefusal(photoError)) {
      if (photoError.code === 'PGRST204') disablePlaces();
      placeCols = {};
    } else if (Object.keys(song).length > 0 && isMusicRefusal(photoError)) {
      song = {};
    } else {
      await removeStoredPhoto(path);
      return { withPhoto: false, postId, placed: noPlace };
    }
  }
}

/**
 * True when a photo insert failed because of its place and would go
 * through without it: the label's content filter (P0001
 * objectionable_content, detail 'place'; the compose step runs the same
 * filter first, so this is a modified client or a newer word list), one of
 * 026's place checks (23514 naming post_photos_place_*), or PGRST204
 * naming a place column (026 not applied).
 */
function isPlaceRefusal(e: { code?: string; message?: string; details?: string | null }): boolean {
  const said = `${e.message ?? ''} ${e.details ?? ''}`;
  if (e.code === 'P0001') return /objectionable_content/.test(e.message ?? '') && e.details === 'place';
  if (e.code === '23514') return /post_photos_place/.test(said);
  return e.code === 'PGRST204' && /apple_place_id|place_label/i.test(said);
}

/**
 * True when a photo insert failed because of its song and would go
 * through without it: PGRST204 (PostgREST does not know a column, so 020
 * is not applied yet), the content filter on the title or artist
 * (objectionable_content, detail 'music'), or the music shape check.
 * Anything else, a failed photo is a failed photo with or without a song.
 */
function isMusicRefusal(e: { code?: string; message?: string; details?: string | null }): boolean {
  if (e.code === 'PGRST204') return true;
  if (e.code === 'P0001' && /objectionable_content/.test(e.message ?? '') && e.details === 'music') return true;
  return e.code === '23514' && /post_photos_music_shape/.test(e.message ?? '');
}

/**
 * What became of a photo meant to keep a post in step with the Dex.
 *
 *   'added'   — the photo is on the post, as its newest picture.
 *   'no-post' — there is no post for this drink, so nothing was uploaded
 *               and nothing was written. The entry stays private.
 *   'failed'  — there is a post, but the photo did not make it onto it.
 */
export type PostPhotoOutcome = 'added' | 'no-post' | 'failed';

/**
 * Adds another photo to the post for this drink, newest first — and ONLY to
 * a post that already exists. It never creates one.
 *
 * Replaces the old behaviour, which swapped the single photo and deleted the
 * previous file. Several pictures of one drink taken weeks apart are the
 * same entry photographed twice, not a reason to throw the first away.
 *
 * 'failed' lets the caller say the post still shows the old picture, and
 * 'no-post' lets it skip the refetch a changed post needs. Throws when the
 * lookup for the post itself did not go through.
 *
 * Never sends a song: music goes only with an explicit Save & post
 * (createPost), and a photo kept in step with the Dex is not that.
 */
export async function addPhotoForDrink(
  myId: string,
  drinkId: string,
  localPhotoUri: string,
): Promise<PostPhotoOutcome> {
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
   * to leave the entry private. The photo is not even uploaded: a picture
   * in the bucket with no post pointing at it is one nobody asked to share.
   */
  if (!post) return 'no-post';

  const path = await uploadPhoto(myId, localPhotoUri);
  if (!path) return 'failed';

  /*
   * As in createPost: an object no row points at is removed, not left
   * behind. That includes a post deleted between the lookup above and this
   * insert: the post_photos insert policy and its foreign key both need the
   * post to exist, so the row is refused, and nothing is re-created.
   */
  const { error: photoError } = await supabase
    .from('post_photos')
    .insert({ post_id: post.id, path });
  if (photoError) {
    await removeStoredPhoto(path);
    return 'failed';
  }

  return 'added';
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

/**
 * Deletes one of your own posts: the row, its gallery rows (they cascade),
 * likes and saves (they cascade too, 017), and the photo files in storage.
 * Paths are read BEFORE the delete for the same reason as
 * deletePostsForDrink: afterwards nothing records which files were the
 * post's. Someone else's post id deletes nothing — the author filter here
 * and posts_delete_own on the server both refuse it.
 */
export async function deletePost(myId: string, postId: string): Promise<void> {
  const { data: row, error: readError } = await supabase
    .from('posts')
    .select('photo_path')
    .eq('id', postId)
    .eq('author_id', myId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) return; // Already gone.

  const { data: extra } = await supabase.from('post_photos').select('path').eq('post_id', postId);

  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('author_id', myId);
  if (error) throw error;

  const paths = new Set<string>([
    ...(row.photo_path ? [row.photo_path] : []),
    ...(extra ?? []).map((photo) => photo.path),
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

/*
 * Saves are private bookmarks (migration 017): only their owner can read
 * them, and only a post the saver can see can be saved. A missing table
 * switches saving off for the session before the error goes up, so the
 * bookmark that was just tapped is the last one drawn.
 */

/** Saves a post. A second save of the same post is already the desired state. */
export async function savePost(myId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('saves').insert({ user_id: myId, post_id: postId });
  if (!error || error.code === '23505' || error.message.includes('duplicate')) return;
  if (isMissingRelation(error)) savesTablePresent = false;
  throw error;
}

export async function unsavePost(myId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('saves')
    .delete()
    .eq('user_id', myId)
    .eq('post_id', postId);
  if (!error) return;
  if (isMissingRelation(error)) savesTablePresent = false;
  throw error;
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

/*
 * Ids per match_facebook_friends call: the server's own cap, past which it
 * raises 'too_many_ids'. Facebook stops a personal account at 5,000 friends
 * and user_friends lists only those who use Sipply, so this is one call in
 * practice. Chunked anyway, so a longer list becomes a second request
 * rather than a refusal of the whole list.
 */
const FACEBOOK_IDS_PER_CALL = 5000;

/**
 * Given the app-scoped Facebook ids of the user's friends, returns the
 * Sipply accounts signed in with those Facebook identities.
 *
 * Sent as they are, not hashed like the contact and Instagram matchers: an
 * app-scoped id means nothing outside Sipply's Facebook app, and the server
 * has to compare it with the identity Supabase Auth already holds. Never
 * includes you or anyone blocked either way — the server leaves them out —
 * and comes back empty when this account has no Facebook identity itself.
 */
export async function matchFacebookFriends(fbIds: string[]): Promise<UserProfile[]> {
  const unique = [...new Set(fbIds.map((id) => id.trim()))].filter(Boolean);
  if (unique.length === 0) return [];

  const out: UserProfile[] = [];
  const seen = new Set<string>();

  for (const part of chunk(unique, FACEBOOK_IDS_PER_CALL)) {
    const { data, error } = await supabase.rpc('match_facebook_friends', { fb_ids: part });
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
