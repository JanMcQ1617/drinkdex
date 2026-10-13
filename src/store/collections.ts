import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import * as api from '@/lib/collections';
import type { Collection, CollectionFailure, CollectionItem, ItemRef } from '@/lib/collections';
import { createGuardedStorage } from '@/lib/guardedStorage';
import { onAccountDeleted, useAuth } from '@/store/auth';
import { useTaste } from '@/store/taste';

/* ==================================================================== */
/* Your collections, and the save bar and sheet                         */
/*                                                                      */
/* specs/v4.2/spec.md §4. NOT PERSISTED: collections live on the        */
/* server (migration 023), so they need an account, follow you to a     */
/* new phone and can be shared; this store is the runtime's copy of the */
/* list, read when a session arrives and on the Saved tab, and changed  */
/* in place by every write so a screen never waits on a refetch to look */
/* right. `version` moves with every change, as useSocial.savesVersion  */
/* does, for a screen that holds its own copy.                          */
/*                                                                      */
/* WHEN COLLECTIONS SHOW AT ALL. Only with a session, and only once the */
/* server has answered with the tables there (status 'ready'). Signed   */
/* out, before the first answer, and before 023 is applied ('off'),     */
/* nothing about collections is drawn anywhere: saving works exactly as */
/* build 23, no bar, no long-press sheet, the Saved tab as it was.      */
/* collectionsOn() is the one test every surface asks.                  */
/*                                                                      */
/* IN A COLLECTION ⇒ SAVED, on the phone too. A drink that leaves the   */
/* saved drinks (store/taste) by any path leaves every collection here  */
/* at once (the subscriber at the foot); a post's unsave goes through   */
/* forget(). The server does the same with 023's triggers.              */
/*                                                                      */
/* THE BAR AND THE SHEET are state here, drawn once by                  */
/* components/collections/CollectionsHost over the whole app, so a      */
/* bookmark deep in a list only says "this was saved" and the host does */
/* the rest.                                                            */
/* ==================================================================== */

/**
 * The thing a bookmark saved, with what the bar and the sheet draw: a
 * drink by its id, or a post with its photo and its author's name (the
 * sheet's line names the author, so a post never reads as its drink
 * being saved).
 */
export type SavedThing =
  | { kind: 'drink'; id: string }
  | {
      kind: 'post';
      id: string;
      drinkId: string;
      photoPath: string | null;
      author: string;
      authorId: string;
      postedAt: string;
    };

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: CollectionFailure };

type Status = 'off' | 'loading' | 'ready' | 'error';

interface CollectionsState {
  /** The account this list is for; null signed out. */
  uid: string | null;
  /**
   * 'off' signed out or while 023 is missing; 'loading' until the first
   * answer; 'ready' once the list is known (a later refresh that fails
   * keeps it ready, with the list it had); 'error' when the first read
   * failed (offline at launch), retried on the next focus or return.
   */
  status: Status;
  /** Yours, the one saved to last first (updated_at desc). */
  list: Collection[];
  /** Moves with every change to the list. */
  version: number;
  /** When the list was last read from the server, for the focus refresh's staleness. */
  loadedAt: number;
  /** Bumped by reset(): an answer for an older account writes nothing (useSocial's gen). */
  gen: number;
  /** The save bar: what was just saved, and a counter so a new save restarts it. */
  bar: { thing: SavedThing; n: number } | null;
  /** The save-to-collection sheet, open on a thing. */
  sheet: { thing: SavedThing; n: number } | null;

  /** Reads the list again unless it is fresh (or `force`). */
  refresh: (force?: boolean) => Promise<void>;
  /** Reads one collection again, for its page. Null when it is gone. */
  refreshOne: (id: string) => Promise<Collection | null | 'failed'>;
  /** Makes a collection, with `first` in it (saved by the caller first). */
  create: (name: string, first?: SavedThing | null) => Promise<Outcome<Collection>>;
  rename: (id: string, name: string) => Promise<Outcome<void>>;
  remove: (id: string) => Promise<boolean>;
  /** Puts a thing into a collection, or takes it out; optimistic, rolled back on failure. */
  setItem: (collectionId: string, thing: SavedThing, on: boolean) => Promise<Outcome<void>>;
  /** Puts several saved things into one collection (Add from All saved); resolves to how many went in. */
  addMany: (collectionId: string, things: readonly SavedThing[]) => Promise<number>;
  removeItems: (collectionId: string, refs: readonly ItemRef[]) => Promise<boolean>;
  share: (id: string) => Promise<Outcome<string>>;
  unshare: (id: string) => Promise<boolean>;
  /**
   * An unsave: the thing leaves every collection on this phone, and with
   * `server`, on the server at once too (023's trigger does it when the
   * unsave lands; this is for a drink, whose unsave is pushed later).
   */
  forget: (ref: ItemRef, server?: boolean) => void;

  showBar: (thing: SavedThing) => void;
  /** Hides the bar; with `n`, only if it is still that save's. */
  hideBar: (n?: number) => void;
  openSheet: (thing: SavedThing) => void;
  closeSheet: () => void;
  reset: () => void;
}

/** A list read this recently is not read again on focus. */
const STALE_MS = 30_000;

const EMPTY = {
  status: 'off' as Status,
  list: [] as Collection[],
  loadedAt: 0,
  bar: null as CollectionsState['bar'],
  sheet: null as CollectionsState['sheet'],
};

const nowIso = () => new Date().toISOString();

/**
 * The one saved to last first, as the server orders them. By time, not by
 * string: the server's stamps carry microseconds and "+00:00", the
 * phone's own (an optimistic add) milliseconds and "Z".
 */
function byUpdated(a: Collection, b: Collection): number {
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  return tb - ta;
}

/** A saved thing as the item a collection holds, for an optimistic add. */
export function itemOf(thing: SavedThing): CollectionItem {
  return thing.kind === 'drink'
    ? { kind: 'drink', id: thing.id, drinkId: thing.id, photoPath: null, authorId: '', postedAt: '', at: nowIso() }
    : {
        kind: 'post',
        id: thing.id,
        drinkId: thing.drinkId,
        photoPath: thing.photoPath,
        authorId: thing.authorId,
        postedAt: thing.postedAt,
        at: nowIso(),
      };
}

export const refOf = (thing: SavedThing): ItemRef => ({ kind: thing.kind, id: thing.id });

/*
 * Writes under way, and a count of every write started, so a refresh that
 * was in flight across one is thrown away rather than putting the
 * server's older answer over the phone's newer one (the next focus reads
 * again). Module state, beside the store, as store/taste keeps its sync's.
 */
let pending = 0;
let writes = 0;
let flight: { gen: number; done: Promise<void> } | null = null;

export const useCollections = create<CollectionsState>()((set, get) => {
  /** Replaces one collection by id, keeping the order the server would. */
  const patch = (id: string, change: (c: Collection) => Collection) => {
    const list = get().list.map((c) => (c.id === id ? change(c) : c)).sort(byUpdated);
    set({ list, version: get().version + 1 });
  };

  /** Runs a write with the bookkeeping refresh reads (see `pending`). */
  const write = async <T>(job: () => Promise<T>): Promise<T> => {
    pending += 1;
    writes += 1;
    try {
      return await job();
    } finally {
      pending -= 1;
    }
  };

  /** A failure as an outcome; a missing 023 also turns collections off. */
  const fail = (e: unknown): { ok: false; reason: CollectionFailure } => {
    const reason = api.failureReason(e);
    if (reason === 'unsupported') set({ ...EMPTY, version: get().version + 1 });
    return { ok: false, reason };
  };

  return {
    ...EMPTY,
    uid: null,
    version: 0,
    gen: 0,

    refresh: async (force) => {
      const { uid, gen } = get();
      if (!uid || !api.collectionsSupported()) {
        if (get().status !== 'off') set({ ...EMPTY, version: get().version + 1 });
        return;
      }
      if (flight?.gen === gen) return flight.done;
      if (!force && get().status === 'ready' && Date.now() - get().loadedAt < STALE_MS) return;

      const started = writes;
      if (get().status !== 'ready') set({ status: 'loading' });
      const done = (async () => {
        try {
          const list = await api.fetchCollections(uid);
          if (get().gen !== gen) return;
          // A write started or still out since the read began: the phone's copy is newer, and the next focus reads again.
          if (get().status === 'ready' && (writes !== started || pending > 0)) return;
          set({ status: 'ready', list: list.sort(byUpdated), loadedAt: Date.now(), version: get().version + 1 });
        } catch (e) {
          if (get().gen !== gen) return;
          if (api.failureReason(e) === 'unsupported') set({ ...EMPTY, version: get().version + 1 });
          else if (get().status !== 'ready') set({ status: 'error' });
        }
      })();
      flight = { gen, done };
      try {
        await done;
      } finally {
        if (flight?.done === done) flight = null;
      }
    },

    refreshOne: async (id) => {
      const gen = get().gen;
      const started = writes;
      try {
        const fresh = await api.fetchCollection(id);
        if (get().gen !== gen) return 'failed';
        if (writes !== started || pending > 0) return get().list.find((c) => c.id === id) ?? null;
        if (!fresh) {
          if (get().list.some((c) => c.id === id)) {
            set({ list: get().list.filter((c) => c.id !== id), version: get().version + 1 });
          }
          return null;
        }
        const known = get().list.some((c) => c.id === id);
        set({
          list: (known ? get().list.map((c) => (c.id === id ? fresh : c)) : [fresh, ...get().list]).sort(byUpdated),
          version: get().version + 1,
        });
        return fresh;
      } catch (e) {
        fail(e);
        return 'failed';
      }
    },

    create: async (name, first) => {
      const { uid, gen } = get();
      if (!uid) return { ok: false, reason: 'failed' };
      if (get().list.length >= api.COLLECTIONS_MAX) return { ok: false, reason: 'collections_full' };
      try {
        const made = await write(() => api.createCollection(uid, name));
        let collection = made;
        if (first) {
          try {
            await write(() => api.addItem(made.id, refOf(first)));
            collection = { ...made, items: [itemOf(first)], updatedAt: nowIso() };
          } catch {
            // The collection was made; only its first thing did not go in. The sheet shows it unticked.
          }
        }
        if (get().gen !== gen) return { ok: true, value: collection };
        set({ list: [collection, ...get().list.filter((c) => c.id !== made.id)].sort(byUpdated), version: get().version + 1 });
        return { ok: true, value: collection };
      } catch (e) {
        if (get().gen !== gen) return { ok: false, reason: 'failed' };
        return fail(e);
      }
    },

    rename: async (id, name) => {
      const gen = get().gen;
      const clean = api.cleanName(name);
      try {
        const updatedAt = await write(() => api.renameCollection(id, clean));
        if (get().gen === gen) patch(id, (c) => ({ ...c, name: clean, updatedAt }));
        return { ok: true, value: undefined };
      } catch (e) {
        if (get().gen !== gen) return { ok: false, reason: 'failed' };
        return fail(e);
      }
    },

    remove: async (id) => {
      const gen = get().gen;
      try {
        await write(() => api.deleteCollection(id));
        if (get().gen === gen) set({ list: get().list.filter((c) => c.id !== id), version: get().version + 1 });
        return true;
      } catch (e) {
        if (get().gen === gen) fail(e);
        return false;
      }
    },

    setItem: async (collectionId, thing, on) => {
      const gen = get().gen;
      const ref = refOf(thing);
      const before = get().list.find((c) => c.id === collectionId);
      if (!before) return { ok: false, reason: 'not_found' };
      if (api.holds(before, ref) === on) return { ok: true, value: undefined };
      if (on && before.items.length >= api.COLLECTION_ITEMS_MAX) return { ok: false, reason: 'collection_full' };

      // At once, as the sheet's box ticks; an add moves the collection to the front, as the server's clock will.
      patch(collectionId, (c) =>
        on
          ? { ...c, items: [itemOf(thing), ...c.items], updatedAt: nowIso() }
          : { ...c, items: c.items.filter((i) => !api.sameItem(i, ref)) },
      );
      try {
        await write(() => (on ? api.addItem(collectionId, ref) : api.removeItems(collectionId, [ref])));
        return { ok: true, value: undefined };
      } catch (e) {
        if (get().gen !== gen) return { ok: false, reason: 'failed' };
        // Back as it was, unless the collection has gone meanwhile.
        if (get().list.some((c) => c.id === collectionId)) patch(collectionId, () => before);
        return fail(e);
      }
    },

    addMany: async (collectionId, things) => {
      let added = 0;
      for (const thing of things) {
        const done = await get().setItem(collectionId, thing, true);
        if (done.ok) added += 1;
        else if (done.reason !== 'failed') break;
      }
      return added;
    },

    removeItems: async (collectionId, refs) => {
      const gen = get().gen;
      const before = get().list.find((c) => c.id === collectionId);
      if (!before || refs.length === 0) return !!before;
      patch(collectionId, (c) => ({ ...c, items: c.items.filter((i) => !refs.some((r) => api.sameItem(i, r))) }));
      try {
        await write(() => api.removeItems(collectionId, refs));
        return true;
      } catch (e) {
        if (get().gen !== gen) return false;
        if (get().list.some((c) => c.id === collectionId)) patch(collectionId, () => before);
        fail(e);
        return false;
      }
    },

    share: async (id) => {
      const gen = get().gen;
      try {
        const shareId = await write(() => api.shareCollection(id));
        // A link already on comes back unchanged and the server writes nothing, so its order stays; a new one is an update, which moves it.
        if (get().gen === gen) patch(id, (c) => (c.shareId === shareId ? c : { ...c, shareId, updatedAt: nowIso() }));
        return { ok: true, value: shareId };
      } catch (e) {
        if (get().gen !== gen) return { ok: false, reason: 'failed' };
        return fail(e);
      }
    },

    unshare: async (id) => {
      const gen = get().gen;
      try {
        await write(() => api.unshareCollection(id));
        if (get().gen === gen) patch(id, (c) => ({ ...c, shareId: null, updatedAt: nowIso() }));
        return true;
      } catch (e) {
        if (get().gen === gen) fail(e);
        return false;
      }
    },

    forget: (ref, server) => {
      const { list, uid } = get();
      if (list.some((c) => api.holds(c, ref))) {
        set({
          list: list.map((c) => (api.holds(c, ref) ? { ...c, items: c.items.filter((i) => !api.sameItem(i, ref)) } : c)),
          version: get().version + 1,
        });
      }
      /*
       * Whether or not this phone's copy still held it: a drink's own
       * subscriber (at the foot) has usually taken it out already. Best
       * effort; the trigger on the unsave does the same once it lands.
       */
      if (server && uid) void write(() => api.removeEverywhere(ref)).catch(() => undefined);
    },

    showBar: (thing) => set({ bar: { thing, n: (get().bar?.n ?? 0) + 1 } }),
    hideBar: (n) => {
      const bar = get().bar;
      if (bar && (n === undefined || bar.n === n)) set({ bar: null });
    },
    openSheet: (thing) => set({ sheet: { thing, n: (get().sheet?.n ?? 0) + 1 }, bar: null }),
    closeSheet: () => {
      if (get().sheet) set({ sheet: null });
    },

    reset: () => set({ ...EMPTY, uid: null, version: get().version + 1, gen: get().gen + 1 }),
  };
});

/** Whether anything about collections may be drawn: a session, 023 there, the list known. */
export function collectionsOn(s: Pick<CollectionsState, 'uid' | 'status'> = useCollections.getState()): boolean {
  return s.uid !== null && s.status === 'ready' && api.collectionsSupported();
}

/** collectionsOn, for a component: re-renders when the answer changes. */
export function useCollectionsOn(): boolean {
  return useCollections((s) => s.uid !== null && s.status === 'ready') && api.collectionsSupported();
}

/** The collections holding `ref`, in the list's order (the unsave confirm names them). */
export function collectionsHolding(ref: ItemRef, list: readonly Collection[] = useCollections.getState().list): Collection[] {
  return list.filter((c) => api.holds(c, ref));
}

/* ==================================================================== */
/* A note seen once: the first share's line (spec §4.7)                 */
/*                                                                      */
/* Kept on the phone, as store/dexPrefs keeps the Dex's order: a        */
/* convenience, never synced. Losing it only shows the line once more.  */
/* ==================================================================== */

interface CollectionPrefs {
  hydrated: boolean;
  shareNoticeSeen: boolean;
  markShareNoticeSeen: () => void;
}

export const useCollectionPrefs = create<CollectionPrefs>()(
  persist(
    (set) => ({
      hydrated: false,
      shareNoticeSeen: false,
      markShareNoticeSeen: () => set({ shareNoticeSeen: true }),
    }),
    {
      name: 'sipply-collections.v1',
      storage: createJSONStorage(createGuardedStorage),
      partialize: (s) => ({ shareNoticeSeen: s.shareNoticeSeen }),
      merge: (saved, current) => ({
        ...current,
        shareNoticeSeen: !!saved && typeof saved === 'object' && (saved as { shareNoticeSeen?: unknown }).shareNoticeSeen === true,
        hydrated: true,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) useCollectionPrefs.setState({ hydrated: true });
      },
    },
  ),
);

/* ---- Wiring, at the module's foot (as store/taste does) ---- */

/** A new account (or none): the last one's list goes, and this one's is read. */
function sessionChanged(uid: string | null) {
  const store = useCollections.getState();
  store.reset();
  if (!uid) return;
  useCollections.setState({ uid });
  void useCollections.getState().refresh(true);
}

useAuth.subscribe((state, prev) => {
  const uid = state.session?.user.id ?? null;
  const was = prev.session?.user.id ?? null;
  if (uid !== was) sessionChanged(uid);
});

// A session restored before this module was first imported.
{
  const uid = useAuth.getState().session?.user.id ?? null;
  if (uid) sessionChanged(uid);
}

onAccountDeleted(() => useCollections.getState().reset());

/*
 * A saved drink taken out by any path (its bookmark after the confirm,
 * the first picks' key, a sync from another phone) leaves every
 * collection on this phone too. The server's trigger on want_to_try does
 * the same when the change is pushed.
 */
useTaste.subscribe((state, prev) => {
  if (state.saved === prev.saved || useCollections.getState().list.length === 0) return;
  const now = new Set(state.saved);
  for (const id of prev.saved) if (!now.has(id)) useCollections.getState().forget({ kind: 'drink', id });
});

/* Back from the background: the list may have changed on another phone. Stale-gated, so a quick switch costs nothing. */
AppState.addEventListener('change', (next) => {
  if (next === 'active' && useCollections.getState().uid) void useCollections.getState().refresh();
});
