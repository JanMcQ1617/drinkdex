import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isCustomId, newCustomId, normaliseFields, submissionIdOf } from '@/lib/customDrinks';
import { createGuardedStorage } from '@/lib/guardedStorage';
import { discardAllCustomPhotos, discardCustomPhoto, discardPhoto, rebase } from '@/lib/pour';
import { useAuth } from '@/store/auth';
import type { CustomDrink, CustomDrinkFields, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Drinks people add themselves, and their pours                        */
/*                                                                      */
/* A store of its own, never the collection's `unlocks`. That map is    */
/* catalogue ids only (see settle() in store/collection.ts), and the    */
/* Dex header, Stats, ranks and celebrations all count with             */
/* Object.keys(unlocks): a custom drink in there would move every one   */
/* of those numbers, and none of them is about drinks people added.     */
/*                                                                      */
/* A pour of a custom drink is an ordinary UnlockRecord in `pours`,     */
/* keyed by the custom id, with its photo in the same `unlocks/` folder */
/* as every pour photo. When the catalogue gains the drink, the pour    */
/* moves to the collection as it is (lib/submissions, adopt).           */
/*                                                                      */
/* Sending to Sipply is lib/submissions' job. This store only keeps the */
/* bookkeeping it needs: whether the server row exists, who owns it,    */
/* which photo it has, and tombstones for rows still to delete.         */
/* ==================================================================== */

/** A server row to delete: the drink was deleted on the phone after it was sent. */
export type Tombstone = { uuid: string; photoPath: string | null; submittedBy: string };

/**
 * Where to go after the add-a-drink form closes, handed to the screen that
 * opened it (the Dex or the log sheet), which takes it on focus. A custom
 * id for the drink just saved, or a catalogue id for a "Similar in the
 * Dex" row the person tapped instead.
 */
export type Handoff = { target: 'dex' | 'log'; kind: 'custom' | 'catalogue'; id: string };

interface CustomDrinksState {
  /** Custom id ('u_<uuid>') -> the drink. */
  drinks: Record<string, CustomDrink>;
  /** Custom id -> its pour. Same shape and relog rules as the collection's. */
  pours: Record<string, UnlockRecord>;
  tombstones: Tombstone[];
  /** true once persisted state has been read back from disk. */
  hydrated: boolean;
  /** Not persisted. */
  handoff: Handoff | null;
  /** Not persisted: the log sheet's photo, offered to the form it opens. */
  seed: { photoUri: string | null } | null;

  /**
   * Saves a new drink. Synchronous and local; lib/submissions sends it.
   * `id` is for a form that named the photo's file before saving (from
   * newCustomId); without one, or with one already taken, a new id is made.
   */
  add: (fields: CustomDrinkFields, photoFile: string | null, id?: string) => CustomDrink;
  update: (id: string, fields: CustomDrinkFields, photoFile: string | null) => void;
  remove: (id: string) => void;
  logPour: (id: string, photoUri: string | null, note?: string) => void;
  /** Reset collection: the drinks stay, unlogged, as catalogue entries stay locked. */
  clearPours: () => void;
  /** Delete account: everything, including the entry photos on disk. */
  resetAll: () => void;
  /** After adopt: forget the entry, but not the pour photo the collection now holds. */
  dropAdopted: (id: string) => void;
  /** Sync bookkeeping, from lib/submissions. */
  patch: (id: string, p: Partial<Omit<CustomDrink, 'id'>>) => void;
  /** A server row still to delete, from lib/submissions. */
  bury: (t: Tombstone) => void;
  /** lib/submissions, once a tombstone's row and photo are gone. */
  unbury: (t: Tombstone) => void;
  setHandoff: (h: Handoff) => void;
  /** The handoff, if it is for `target`, cleared as it is read. */
  takeHandoff: (target: 'dex' | 'log') => Handoff | null;
  setSeed: (s: { photoUri: string | null }) => void;
  /** The seed, cleared as it is read; the form reads it once on mount. */
  takeSeed: () => { photoUri: string | null } | null;
}

/** Own keys only, like getDrink: 'constructor' is not a drink. */
const own = <T>(map: Record<string, T>, id: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined;

/** A copy of `map` without `id`. */
function without<T>(map: Record<string, T>, id: string): Record<string, T> {
  const next = { ...map };
  delete next[id];
  return next;
}

interface Saved {
  drinks?: Record<string, CustomDrink>;
  pours?: Record<string, UnlockRecord>;
  tombstones?: Tombstone[];
}

/*
 * What a saved blob becomes in memory, on every launch.
 *
 * Pour photo uris are re-rooted under the current container (rebase: iOS
 * moves the container on an update, and a stale absolute uri draws
 * nothing). A pour whose drink is missing is dropped; it could never be
 * shown. Only well-formed custom ids survive, restated from their keys.
 *
 * Nothing here may throw. A throw out of merge sends persist down its error
 * path, and the guarded storage is all that would stand between that and
 * an empty store saved over the real one.
 */
function settle(saved: Saved | undefined) {
  const drinks: Record<string, CustomDrink> = {};
  const pours: Record<string, UnlockRecord> = {};
  for (const [id, c] of Object.entries(saved?.drinks ?? {})) {
    if (!isCustomId(id) || !c || typeof c !== 'object') continue;
    drinks[id] = { ...c, id };
  }
  for (const [id, record] of Object.entries(saved?.pours ?? {})) {
    if (!own(drinks, id) || !record || typeof record !== 'object') continue;
    pours[id] = { ...record, drinkId: id, photoUri: rebase(record.photoUri ?? null) };
  }
  const raw = saved?.tombstones;
  const tombstones = Array.isArray(raw)
    ? raw.filter((t) => t && typeof t.uuid === 'string' && typeof t.submittedBy === 'string')
    : [];
  return { drinks, pours, tombstones };
}

export const useCustomDrinks = create<CustomDrinksState>()(
  persist(
    (set, get) => ({
      drinks: {},
      pours: {},
      tombstones: [],
      hydrated: false,
      handoff: null,
      seed: null,

      add: (fields, photoFile, id) => {
        const { drinks } = get();
        const key = id && isCustomId(id) && !own(drinks, id) ? id : newCustomId();
        const now = new Date().toISOString();
        const drink: CustomDrink = {
          ...normaliseFields(fields),
          id: key,
          createdAt: now,
          updatedAt: now,
          photoFile,
          uploadedPhotoFile: null,
          photoPath: null,
          submittedBy: null,
          everInserted: false,
          // 'local' says "sign in and it is sent"; either way it is sent at
          // the next flush that has a session.
          sync: useAuth.getState().session ? 'pending' : 'local',
          status: 'new',
          catalogueId: null,
        };
        set({ drinks: { ...drinks, [key]: drink } });
        return drink;
      },

      /*
       * An edit. While Sipply has not reviewed the suggestion (status
       * 'new'), the edit is sent again: sync goes back to 'pending', which
       * also gives a refused, over-quota or duplicate drink another try.
       * Once reviewed, the server row is Jan's and the policy refuses the
       * update, so edits stay on the phone and sync is left as it is.
       */
      update: (id, fields, photoFile) => {
        const { drinks } = get();
        const old = own(drinks, id);
        if (!old) return;
        const next: CustomDrink = {
          ...old,
          ...normaliseFields(fields),
          id,
          photoFile,
          updatedAt: new Date().toISOString(),
          ...(old.status === 'new' ? { sync: 'pending' as const, syncDetail: undefined } : null),
        };
        set({ drinks: { ...drinks, [id]: next } });
        // After the swap, outside `set`, as the collection does.
        if (old.photoFile && old.photoFile !== photoFile) discardCustomPhoto(old.photoFile);
      },

      /*
       * Gone from the phone, with its photos: the entry photo and the pour
       * photo. A drink that reached the server, or may have (a send whose
       * answer was lost also sets submittedBy, lib/submissions), leaves a
       * tombstone, so the suggestion is withdrawn too — the confirmation
       * says it will be. The tombstone carries the uid that owns the row,
       * so only that account ever deletes it.
       */
      remove: (id) => {
        const { drinks, pours, tombstones } = get();
        const old = own(drinks, id);
        if (!old) return;
        const pour = own(pours, id);
        set({
          drinks: without(drinks, id),
          pours: pour ? without(pours, id) : pours,
          tombstones: old.submittedBy
            ? [
                ...tombstones,
                { uuid: submissionIdOf(id), photoPath: old.photoPath, submittedBy: old.submittedBy },
              ]
            : tombstones,
        });
        discardCustomPhoto(old.photoFile);
        if (pour) discardPhoto(pour.photoUri);
      },

      /*
       * The collection's relog rules (store/collection.ts, unlock): a
       * second pour of the same drink is an edit that keeps its date, and
       * keeps its note unless a new one was written. No celebration: a
       * custom drink has no dex number to celebrate, and it does not move
       * the collection's count.
       */
      logPour: (id, photoUri, note) => {
        const { drinks, pours } = get();
        if (!own(drinks, id)) return;
        const old = own(pours, id);
        const record: UnlockRecord = old
          ? { ...old, photoUri: photoUri ?? old.photoUri, note: note ?? old.note }
          : { drinkId: id, photoUri, date: new Date().toISOString(), note };
        set({ pours: { ...pours, [id]: record } });
        if (old && old.photoUri !== record.photoUri) discardPhoto(old.photoUri);
      },

      /*
       * Reset collection runs this beside the collection's own reset, which
       * deletes the whole `unlocks/` folder (these pours' photos included);
       * each is deleted here as well, so this is complete on its own.
       */
      clearPours: () => {
        const { pours } = get();
        set({ pours: {} });
        for (const record of Object.values(pours)) discardPhoto(record.photoUri);
      },

      /*
       * Delete account. The server rows go with the account (the
       * drink_submissions cascade) and their photos with the account's
       * folder sweep, so no tombstone is kept: there is nothing left for
       * one to delete, and nobody left to delete it as.
       */
      resetAll: () => {
        const { pours } = get();
        set({ drinks: {}, pours: {}, tombstones: [], handoff: null, seed: null });
        for (const record of Object.values(pours)) discardPhoto(record.photoUri);
        discardAllCustomPhotos();
      },

      /*
       * The catalogue has the drink now and the collection has its pour.
       * The entry and its own photo go; the pour's photo stays, because the
       * collection's record points at it. No tombstone: the server row stays
       * as Jan's history of where the drink came from.
       */
      dropAdopted: (id) => {
        const { drinks, pours } = get();
        const old = own(drinks, id);
        if (!old) return;
        set({
          drinks: without(drinks, id),
          pours: own(pours, id) ? without(pours, id) : pours,
        });
        discardCustomPhoto(old.photoFile);
      },

      patch: (id, p) => {
        const { drinks } = get();
        const old = own(drinks, id);
        if (!old) return;
        set({ drinks: { ...drinks, [id]: { ...old, ...p, id } } });
      },

      bury: (t) => set((s) => ({ tombstones: [...s.tombstones, t] })),

      /*
       * By uuid AND photo: one drink can leave two tombstones (deleted while
       * its first send was in flight, lib/submissions), each with its own
       * photo to remove, and clearing one must not forget the other.
       */
      unbury: (t) =>
        set((s) => ({
          tombstones: s.tombstones.filter((x) => x.uuid !== t.uuid || x.photoPath !== t.photoPath),
        })),

      setHandoff: (h) => set({ handoff: h }),
      takeHandoff: (target) => {
        const h = get().handoff;
        if (!h || h.target !== target) return null;
        set({ handoff: null });
        return h;
      },

      setSeed: (seed) => set({ seed }),
      takeSeed: () => {
        const seed = get().seed;
        if (seed) set({ seed: null });
        return seed;
      },
    }),
    {
      name: 'sipply-custom-drinks',
      // Writes nothing until a read has come back: see lib/guardedStorage.
      storage: createJSONStorage(() => createGuardedStorage()),
      version: 1,
      partialize: (s) => ({ drinks: s.drinks, pours: s.pours, tombstones: s.tombstones }),
      /*
       * `hydrated` is set HERE, not from onRehydrateStorage, for the
       * collection store's reason: persist applies the merged state with
       * the store's raw setter, so this marks the store ready without a
       * write.
       */
      merge: (saved, current) => ({
        ...current,
        ...settle(saved as Saved | undefined),
        hydrated: true,
      }),
      onRehydrateStorage: () => (_state, error) => {
        // The failure path never reaches merge, and the screens that wait
        // on `hydrated` still have to stop waiting. This setState does
        // write, which the guarded storage refuses while nothing has been
        // read back.
        if (error) useCustomDrinks.setState({ hydrated: true });
      },
    },
  ),
);

/*
 * SELECTORS. Zustand v5 throws "getSnapshot should be cached" on a
 * selector that returns a new array or object on every call. Select the
 * stable records (s => s.drinks) and derive lists with useMemo, or use
 * useShallow. Never `s => Object.values(s.drinks)`.
 */

/** A custom drink by id, own keys only; undefined for anything else. */
export const useCustomDrink = (id: string | null | undefined) =>
  useCustomDrinks((s) => (typeof id === 'string' ? own(s.drinks, id) : undefined));

/** A custom drink's pour, own keys only. */
export const useCustomPour = (id: string | null | undefined) =>
  useCustomDrinks((s) => (typeof id === 'string' ? own(s.pours, id) : undefined));

/** A custom drink by id, outside React. */
export const customDrinkById = (id: string | null | undefined): CustomDrink | undefined =>
  typeof id === 'string' ? own(useCustomDrinks.getState().drinks, id) : undefined;
