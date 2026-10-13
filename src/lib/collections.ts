import { getDrink } from '@/data';
import type { CollectionRow, Json, ProfileRow } from '@/lib/database.types';
import { isMissingFunction, primeSignedUrls, profileCols, toProfile } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { Post, UserProfile } from '@/types';

/* ==================================================================== */
/* Saved collections (migration 023; specs/v4.2/spec.md §4)             */
/*                                                                      */
/* A collection is a named group of things in All saved: saved drinks   */
/* (store/taste, synced to want_to_try) and saved posts (saves), side   */
/* by side. A thing can be in several. IN A COLLECTION ⇒ SAVED: adding  */
/* saves first (the callers do), and unsaving takes the thing out of    */
/* every collection (023's triggers on saves and want_to_try, and the   */
/* phone's own copy at once, store/collections).                        */
/*                                                                      */
/* OWNER ONLY. Both tables are readable and writable by their owner and */
/* nobody else; a shared collection is read through one function,       */
/* get_shared_collection(share id), never through the tables, so        */
/* nothing can be listed. The share id is not the collection's id:      */
/* stopping sharing throws it away, and sharing again mints a new one.  */
/*                                                                      */
/* BEFORE 023 IS APPLIED the server answers a missing table (PGRST205,  */
/* 42P01) or function (PGRST202). That switches collections off for the */
/* rest of this runtime, exactly as savesSupported() does for 017, and  */
/* every surface reads collectionsSupported() and hides: no bar after a */
/* save, no long-press sheet, the Saved tab as build 23. The next       */
/* launch asks again, so applying 023 needs no new build.               */
/*                                                                      */
/* Written in lib/social's style: plain async functions that throw the  */
/* server's error (or a CollectionError where the reason matters to a   */
/* screen); the store holds the state and decides what to show.         */
/* ==================================================================== */

/** 023's caps, said by the screens before the server has to. */
export const COLLECTIONS_MAX = 50;
export const COLLECTION_ITEMS_MAX = 200;
/** A name is 1 to 40 characters, trimmed (collections_name_shape). */
export const COLLECTION_NAME_MAX = 40;

/** The web page a shared link opens (docs/c/index.html); the id rides in the fragment, never sent to GitHub. */
const SHARE_PAGE = 'https://janmcq1617.github.io/drinkdex/c/';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A share id or a collection id: both are uuids, checked before anything is asked of the server. */
export const isUuid = (v: string) => UUID.test(v);

/** The one https link for everyone (spec §4.7): the web page, which offers Open in Sipply. */
export const shareLink = (shareId: string) => `${SHARE_PAGE}#${shareId}`;

/* ==================================================================== */
/* Shapes                                                               */
/* ==================================================================== */

export type ItemKind = 'drink' | 'post';

/** A thing in All saved, as a collection names it: a catalogue drink, or a post. */
export type ItemRef = { kind: ItemKind; id: string };

/** One thing in a collection, with what a cover or a tile needs to draw it. */
export interface CollectionItem {
  kind: ItemKind;
  /** The catalogue id for a drink, the post's id for a post. */
  id: string;
  /** The drink it shows: itself, or the post's drink. */
  drinkId: string;
  /** A post's newest photo (its preview), for covers and tiles; null for a drink. */
  photoPath: string | null;
  /** A post's author and when it was posted, for its tile; '' for a drink. */
  authorId: string;
  postedAt: string;
  /** When it went into the collection. */
  at: string;
}

export interface Collection {
  id: string;
  name: string;
  /** The live link's id while shared by link, else null. */
  shareId: string | null;
  createdAt: string;
  /**
   * The Saved tab's order. Moved by every item added and every rename,
   * and also by sharing and stopping sharing: 023's touch_collection
   * stamps every update, whatever its draft's column comment says. The
   * store mirrors all four, so the phone orders as the server will.
   */
  updatedAt: string;
  /**
   * Newest first, and only what this phone can draw: a drink the
   * catalogue no longer has, or a post that is gone or hidden (blocked
   * either way, or its drink left the Dex), is left out, as Saved leaves
   * those out of All saved.
   */
  items: CollectionItem[];
}

/** Same thing, by kind and id. */
export const sameItem = (a: ItemRef, b: ItemRef) => a.kind === b.kind && a.id === b.id;

/** Whether `c` holds `ref`. */
export const holds = (c: Collection, ref: ItemRef) => c.items.some((i) => sameItem(i, ref));

/** "9 drinks · 2 posts", the words a tile and a page use; "Nothing yet" when empty. */
export function contentsLine(items: readonly { kind: ItemKind }[]): string {
  const drinks = items.filter((i) => i.kind === 'drink').length;
  const posts = items.length - drinks;
  const parts = [
    drinks > 0 ? `${drinks} ${drinks === 1 ? 'drink' : 'drinks'}` : null,
    posts > 0 ? `${posts} ${posts === 1 ? 'post' : 'posts'}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing yet';
}

/** The same for VoiceOver: "9 drinks and 2 posts". */
export const contentsSpoken = (items: readonly { kind: ItemKind }[]) => contentsLine(items).split(' · ').join(' and ');

/**
 * A name as the server keeps it: trimmed. Its length is counted in
 * characters (code points), as char_length is, so an emoji is one of the
 * 40, never two.
 */
export const cleanName = (raw: string) => raw.trim();
export const nameLength = (name: string) => [...name].length;
export const nameOk = (name: string) => {
  const n = nameLength(cleanName(name));
  return n >= 1 && n <= COLLECTION_NAME_MAX;
};

/* ==================================================================== */
/* Feature presence and errors                                          */
/* ==================================================================== */

let present = true;

/** False once the server has said 023's tables or functions are missing. Re-asked by the next launch. */
export const collectionsSupported = () => present;

/** Postgres's undefined_table, or PostgREST's "not in the schema cache": 023 is not applied. */
function isMissingRelation(e: { code?: string; message?: string } | null | undefined): boolean {
  return (
    !!e &&
    (e.code === '42P01' ||
      e.code === 'PGRST205' ||
      /does not exist|could not find the table/i.test(e.message ?? ''))
  );
}

/**
 * Why a write was refused, in the words a screen needs:
 *
 *   collections_full   the account has 50 (collections_cap)
 *   collection_full    the collection has 200 items (collection_items_cap)
 *   objectionable      the name cannot go on a shared link (share_collection, touch_collection)
 *   not_found          gone, or not yours (the sharing functions' P0002)
 *   unsupported        023 is not applied (and collections are now off for the runtime)
 *   failed             anything else: offline, a timeout, the server
 */
export type CollectionFailure =
  | 'collections_full'
  | 'collection_full'
  | 'objectionable'
  | 'not_found'
  | 'unsupported'
  | 'failed';

export class CollectionError extends Error {
  constructor(
    readonly reason: CollectionFailure,
    message?: string,
  ) {
    super(message ?? reason);
  }
}

type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/** The failure a server error stands for; a missing 023 also switches collections off here. */
function failureOf(e: PgError): CollectionFailure {
  if (isMissingRelation(e) || isMissingFunction(e)) {
    present = false;
    return 'unsupported';
  }
  const text = `${e.message ?? ''} ${e.details ?? ''}`;
  if (/collections_full/.test(text)) return 'collections_full';
  if (/collection_full/.test(text)) return 'collection_full';
  if (/collection_name_objectionable/.test(text)) return 'objectionable';
  if (e.code === 'P0002' || /collection_not_found/.test(text)) return 'not_found';
  return 'failed';
}

/** Throws the server's error as a CollectionError. */
function raise(e: PgError): never {
  throw new CollectionError(failureOf(e), e.message);
}

/** The reason any thrown value stands for, for a store that catches everything. */
export function failureReason(e: unknown): CollectionFailure {
  return e instanceof CollectionError ? e.reason : 'failed';
}

/* ==================================================================== */
/* Reading your own                                                     */
/* ==================================================================== */

const COLLECTION_COLS = 'id, name, share_id, created_at, updated_at';
/**
 * An item, with its post's drink, photo, author and date embedded: the
 * covers and the tiles draw from these, so the Saved tab needs no second
 * request per collection. posts_read applies inside the embed, so a post
 * you are blocked with comes back null and is left out.
 */
const ITEM_COLS = 'collection_id, kind, drink_id, post_id, created_at, post:posts(drink_id, photo_path, author_id, created_at)';
/** PostgREST's row cap per response (Supabase's default max_rows). The items are paged by it. */
const PAGE = 1000;
/** Collection ids per item request, well inside a gateway's URL limit (50 uuids is about 2 KB). */
const IDS_PER_REQUEST = COLLECTIONS_MAX;

type ItemQueryRow = {
  collection_id: string;
  kind: ItemKind;
  drink_id: string | null;
  post_id: string | null;
  created_at: string;
  post: { drink_id: string; photo_path: string | null; author_id: string; created_at: string } | null;
};

/** A row as an item this phone can draw, or null (see Collection.items). */
function toItem(r: ItemQueryRow): CollectionItem | null {
  if (r.kind === 'drink') {
    if (!r.drink_id || !getDrink(r.drink_id)) return null;
    return { kind: 'drink', id: r.drink_id, drinkId: r.drink_id, photoPath: null, authorId: '', postedAt: '', at: r.created_at };
  }
  if (!r.post_id || !r.post || !getDrink(r.post.drink_id)) return null;
  return {
    kind: 'post',
    id: r.post_id,
    drinkId: r.post.drink_id,
    photoPath: r.post.photo_path,
    authorId: r.post.author_id,
    postedAt: r.post.created_at,
    at: r.created_at,
  };
}

function toCollection(row: Pick<CollectionRow, 'id' | 'name' | 'share_id' | 'created_at' | 'updated_at'>, items: CollectionItem[]): Collection {
  return {
    id: row.id,
    name: row.name,
    shareId: row.share_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

/** Every item of these collections, newest first, by collection id. Paged past the row cap. */
async function fetchItems(ids: readonly string[]): Promise<Map<string, CollectionItem[]>> {
  const out = new Map<string, CollectionItem[]>(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const part = ids.slice(i, i + IDS_PER_REQUEST);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('collection_items')
        .select(ITEM_COLS)
        .in('collection_id', part)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) raise(error);
      // The embed's shape is chosen by the select string, which supabase-js cannot read; ITEM_COLS is what the cast asserts.
      const rows = (data ?? []) as unknown as ItemQueryRow[];
      for (const r of rows) {
        const item = toItem(r);
        if (item) out.get(r.collection_id)?.push(item);
      }
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

/**
 * Your collections, the one saved to last first, each with its items.
 * Two kinds of request (the collections, then their items in pages),
 * which is cheaper to read than a lateral join and carries everything the
 * Saved tab, the save sheet's boxes and the unsave confirm need, so none
 * of them asks the server again.
 */
export async function fetchCollections(myId: string): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select(COLLECTION_COLS)
    .eq('owner_id', myId)
    .order('updated_at', { ascending: false })
    .limit(COLLECTIONS_MAX);
  if (error) raise(error);
  const rows = data ?? [];
  const items = await fetchItems(rows.map((r) => r.id));
  const list = rows.map((r) => toCollection(r, items.get(r.id) ?? []));
  // The covers' post photos in one signing request rather than one per cell, as PostGrid's callers prime theirs.
  void primeSignedUrls('pours', list.flatMap((c) => postPhotos(c.items.slice(0, 4))));
  return list;
}

/** The photo paths of a run of items' posts. */
const postPhotos = (items: readonly CollectionItem[]) =>
  items.flatMap((i) => (i.kind === 'post' && i.photoPath ? [i.photoPath] : []));

/** One of your collections, or null when it is gone (or not yours: RLS answers nothing). */
export async function fetchCollection(id: string): Promise<Collection | null> {
  const { data, error } = await supabase.from('collections').select(COLLECTION_COLS).eq('id', id).maybeSingle();
  if (error) raise(error);
  if (!data) return null;
  const items = (await fetchItems([data.id])).get(data.id) ?? [];
  // Its page's post tiles, signed in one request.
  void primeSignedUrls('pours', postPhotos(items));
  return toCollection(data, items);
}

/** Which of your collections hold this thing (the sheet's boxes, the unsave confirm), by id. */
export async function membership(ref: ItemRef): Promise<string[]> {
  const q = supabase.from('collection_items').select('collection_id').eq('kind', ref.kind);
  const { data, error } = await (ref.kind === 'drink' ? q.eq('drink_id', ref.id) : q.eq('post_id', ref.id));
  if (error) raise(error);
  return [...new Set((data ?? []).map((r) => r.collection_id))];
}

/* ==================================================================== */
/* Writing your own                                                     */
/* ==================================================================== */

/** A new, empty, private collection. The name is trimmed; at 50 this throws 'collections_full'. */
export async function createCollection(myId: string, name: string): Promise<Collection> {
  const { data, error } = await supabase
    .from('collections')
    .insert({ owner_id: myId, name: cleanName(name) })
    .select(COLLECTION_COLS)
    .single();
  if (error) raise(error);
  return toCollection(data, []);
}

/**
 * A new name. While the collection is shared, a name the content filter
 * catches is refused ('objectionable', 023's touch_collection) and the old
 * name stays. Returns the server's updated_at, which a rename moves.
 */
export async function renameCollection(id: string, name: string): Promise<string> {
  const { data, error } = await supabase
    .from('collections')
    .update({ name: cleanName(name) })
    .eq('id', id)
    .select('updated_at')
    .maybeSingle();
  if (error) raise(error);
  if (!data) throw new CollectionError('not_found');
  return data.updated_at;
}

/** Deletes a collection and what is in it (its items cascade). Its things stay in All saved; a link stops answering. */
export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from('collections').delete().eq('id', id);
  if (error) raise(error);
}

/**
 * Puts a thing into a collection. Already in it is the desired state (the
 * partial unique index's 23505). At 200 this throws 'collection_full'.
 * The caller saves the thing first: in a collection ⇒ saved.
 */
export async function addItem(collectionId: string, ref: ItemRef): Promise<void> {
  const { error } = await supabase.from('collection_items').insert(
    ref.kind === 'drink'
      ? { collection_id: collectionId, kind: 'drink', drink_id: ref.id }
      : { collection_id: collectionId, kind: 'post', post_id: ref.id },
  );
  if (!error || error.code === '23505') return;
  raise(error);
}

/** Takes things out of one collection. They stay in All saved. */
export async function removeItems(collectionId: string, refs: readonly ItemRef[]): Promise<void> {
  const drinks = refs.filter((r) => r.kind === 'drink').map((r) => r.id);
  const posts = refs.filter((r) => r.kind === 'post').map((r) => r.id);
  const items = () => supabase.from('collection_items').delete().eq('collection_id', collectionId);
  const [d, p] = await Promise.all([
    drinks.length > 0 ? items().eq('kind', 'drink').in('drink_id', drinks) : null,
    posts.length > 0 ? items().eq('kind', 'post').in('post_id', posts) : null,
  ]);
  if (d?.error) raise(d.error);
  if (p?.error) raise(p.error);
}

/**
 * Takes a thing out of every one of your collections: an unsave, after
 * its confirm. 023's triggers do the same when the unsave reaches the
 * server, but a drink's unsave is pushed on a debounce (store/taste), and
 * this makes every other phone's Saved right at once. RLS keeps the
 * delete to your own collections.
 */
export async function removeEverywhere(ref: ItemRef): Promise<void> {
  const q = supabase.from('collection_items').delete().eq('kind', ref.kind);
  const { error } = await (ref.kind === 'drink' ? q.eq('drink_id', ref.id) : q.eq('post_id', ref.id));
  if (error) raise(error);
}

/**
 * Turns the link on and returns its share id (the same one when it is
 * already on). A name the content filter catches is refused
 * ('objectionable'): a link makes it public.
 */
export async function shareCollection(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('share_collection', { p_collection: id });
  if (error) raise(error);
  if (typeof data !== 'string' || !isUuid(data)) throw new CollectionError('failed');
  return data.toLowerCase();
}

/** Turns the link off for good: the share id is thrown away, in the app and on the web. */
export async function unshareCollection(id: string): Promise<void> {
  const { error } = await supabase.rpc('unshare_collection', { p_collection: id });
  if (error) raise(error);
}

/* ==================================================================== */
/* Someone's shared collection                                          */
/* ==================================================================== */

/** One thing on a shared link. `postId` is null signed out, and for a post you may not see. */
export interface SharedItem {
  kind: ItemKind;
  /** The drink: itself, or the one the post shows. */
  drinkId: string;
  postId: string | null;
  at: string;
}

export interface SharedCollection {
  name: string;
  /** The owner's username, without the @. */
  owner: string;
  /** Your own link: open your collection instead. */
  mine: boolean;
  /** Your collection's id, only when `mine`. */
  collectionId: string | null;
  /** Newest first, catalogue drinks only. */
  items: SharedItem[];
  /**
   * What is on the link that this build cannot draw: a drink its
   * catalogue does not know (added in a later build), or a post of one.
   * Never shown; a copy made with Save collection takes them back out,
   * since this phone cannot put them in All saved (in a collection ⇒
   * saved).
   */
  undrawable: ItemRef[];
}

/**
 * What the function answered, shape-checked rather than trusted (it is
 * jsonb), with what this build cannot draw left out: a drink the
 * catalogue does not know (added on another build, or a drink someone
 * added), or a malformed row.
 */
function toShared(raw: Json): SharedCollection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as { [k: string]: Json | undefined };
  if (typeof o.name !== 'string' || typeof o.owner !== 'string') return null;
  const list = Array.isArray(o.items) ? o.items : [];
  const items: SharedItem[] = [];
  const undrawable: ItemRef[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const kind = it.kind === 'drink' || it.kind === 'post' ? it.kind : null;
    const drinkId = typeof it.drink_id === 'string' ? it.drink_id : null;
    if (!kind || !drinkId) continue;
    const postId = kind === 'post' && typeof it.post_id === 'string' && isUuid(it.post_id) ? it.post_id.toLowerCase() : null;
    if (!getDrink(drinkId)) {
      if (kind === 'drink') undrawable.push({ kind, id: drinkId });
      else if (postId) undrawable.push({ kind, id: postId });
      continue;
    }
    items.push({ kind, drinkId, postId, at: typeof it.at === 'string' ? it.at : '' });
  }
  return {
    name: o.name,
    owner: o.owner,
    mine: o.mine === true,
    collectionId: typeof o.collection_id === 'string' && isUuid(o.collection_id) ? o.collection_id.toLowerCase() : null,
    items,
    undrawable,
  };
}

/**
 * A shared collection by its share id, or null when the link is off,
 * unknown, deleted, or its owner is blocked with you either way (one
 * answer for all four: a block never says it is one). Signed out works:
 * the function is anon's too. Before 023 this throws 'unsupported'.
 */
export async function fetchShared(shareId: string): Promise<SharedCollection | null> {
  if (!isUuid(shareId)) return null;
  const { data, error } = await supabase.rpc('get_shared_collection', { p_share: shareId.toLowerCase() });
  if (error) raise(error);
  return toShared(data);
}

/** "Save collection": your private copy (same name, its drinks, the posts you can see). Returns its id. */
export async function copyShared(shareId: string): Promise<string> {
  const { data, error } = await supabase.rpc('copy_shared_collection', { p_share: shareId.toLowerCase() });
  if (error) raise(error);
  if (typeof data !== 'string' || !isUuid(data)) throw new CollectionError('failed');
  return data.toLowerCase();
}

/**
 * The posts on a shared link that you may see, as tiles: a signed-in read
 * of posts by id, under posts_read, so a post deleted since, or one whose
 * author you are blocked with, simply does not come back. Only what a
 * grid tile draws (its photo, drink and date); the post's own screen
 * fetches the rest when it is opened.
 */
export async function fetchPostTiles(ids: readonly string[]): Promise<Post[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, drink_id, caption, photo_path, created_at')
    .in('id', unique);
  if (error) throw error;
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  void primeSignedUrls('pours', (data ?? []).flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  // In the link's order, not the response's.
  return unique.flatMap((id) => {
    const r = byId.get(id);
    if (!r || !getDrink(r.drink_id)) return [];
    return [
      {
        id: r.id,
        authorId: r.author_id,
        drinkId: r.drink_id,
        caption: r.caption,
        photoUri: null,
        photoPath: r.photo_path,
        createdAt: r.created_at,
        likes: 0,
      },
    ];
  });
}

/**
 * The owner's profile, for the face and the link to their page. The
 * function names them by username only, so this is one read of profiles
 * (profiles_read: any signed-in account not blocked either way). Null
 * signed out, or when it cannot be read: the line then shows the name
 * alone.
 */
export async function fetchOwner(username: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('profiles').select(profileCols()).eq('username', username).maybeSingle();
  if (error || !data) return null;
  // profileCols() is a subset of ProfileRow's columns chosen at runtime, which is what the cast asserts.
  return toProfile(data as unknown as ProfileRow);
}
