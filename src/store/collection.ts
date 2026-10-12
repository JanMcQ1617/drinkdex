import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { getDrink, TOTAL } from '@/data';
import { MILESTONES, milestoneCrossed, rankTitle } from '@/lib/milestones';
import { discardAllPhotos, discardPhoto, rebase } from '@/lib/pour';
import { useCelebrate } from '@/store/celebrate';
import type { UnlockRecord } from '@/types';

/**
 * `expo export` static rendering runs this module in Node, where AsyncStorage's
 * web backend (window.localStorage) is unavailable. Fall back to a no-op store
 * there; native and browser environments both define `window`.
 */
const noopStorage: StateStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

/*
 * NOTHING IS WRITTEN UNTIL SOMETHING HAS BEEN READ.
 *
 * persist writes the whole collection on every setState, and it calls the
 * post-rehydration callback on failure as well as on success. So when the
 * read failed, the first write after it — including the one that marks the
 * store hydrated so the splash can lift — put the still-empty in-memory map
 * over the user's saved one. Every entry and every photo link, gone at
 * launch, with no action from the user.
 *
 * This wrapper refuses writes until a read has come back. A read that
 * throws leaves the saved blob on disk for the next launch to try again;
 * the cost is that pours logged in that session are not saved, which is
 * the right way round. A read that comes back with text that will not
 * parse DOES count as read: that blob is already unreadable, and holding
 * writes back would stop the app ever saving again.
 */
let readBack = false;

const guardedStorage: StateStorage = {
  getItem: async (name) => {
    const value = await AsyncStorage.getItem(name);
    readBack = true;
    return value;
  },
  setItem: async (name, value) => {
    if (!readBack) return;
    await AsyncStorage.setItem(name, value);
  },
  removeItem: (name) => AsyncStorage.removeItem(name),
};

/* ==================================================================== */
/* Rehydration                                                          */
/* ==================================================================== */

/** Index into MILESTONES of the rung `count` entries holds, or -1. */
const rungAt = (count: number) =>
  MILESTONES.findIndex((m) => m.title === rankTitle(count, TOTAL));

interface Saved {
  unlocks?: Record<string, UnlockRecord>;
  retired?: Record<string, UnlockRecord>;
  bestRung?: number;
}

/*
 * What a saved collection becomes in memory, run on EVERY launch.
 *
 * Records are sorted by whether their drink is still in the catalogue. The
 * index went from 7,653 entries to 2,089 and the ids that left are still in
 * collections saved before then; counted as entries, they put a higher
 * number on the Dex header than Stats could find, fired rank-ups the user
 * had not earned, and left the Collected filter showing fewer cards than
 * its own count. They move to `retired` instead of being deleted, and move
 * back if their drink returns — so nothing a user logged is ever lost to a
 * catalogue edit, and `unlocks` holds catalogue ids only. That invariant is
 * what lets every reader count with Object.keys and look up without a
 * guard.
 *
 * It runs here rather than only in `migrate` because the catalogue is
 * regenerated independently of this store's version: the next removal
 * would not bump it, and the sort has to happen anyway.
 */
function settle(saved: Saved | undefined) {
  const unlocks: Record<string, UnlockRecord> = {};
  const retired: Record<string, UnlockRecord> = {};
  // Retired first, so a live record for the same id wins.
  for (const source of [saved?.retired, saved?.unlocks]) {
    if (!source) continue;
    for (const [id, record] of Object.entries(source)) {
      if (!record || typeof record !== 'object') continue;
      // drinkId restated from the key: Stats counts by the record's own
      // drinkId and the Dex by key, and the two must name the same drink.
      const next = { ...record, drinkId: id, photoUri: rebase(record.photoUri ?? null) };
      if (getDrink(id)) unlocks[id] = next;
      else retired[id] = next;
    }
  }
  const count = Object.keys(unlocks).length;
  // Seeded from the count too, so a collection saved before this field
  // existed does not re-award the rank it already holds.
  const kept = typeof saved?.bestRung === 'number' ? saved.bestRung : -1;
  const bestRung = Math.max(kept, rungAt(count));
  return { unlocks, retired, bestRung };
}

/* ==================================================================== */
/* Store                                                                */
/* ==================================================================== */

/*
 * The record for an id, own keys only, like getDrink. `unlocks` is a plain
 * object, so a bare index with 'constructor' finds the Object function —
 * truthy — and updatePhoto would have written a record built from it.
 */
const recordFor = (unlocks: Record<string, UnlockRecord>, drinkId: string) =>
  Object.prototype.hasOwnProperty.call(unlocks, drinkId) ? unlocks[drinkId] : undefined;

interface CollectionState {
  /** drinkId -> unlock record. Catalogue ids only — see settle(). */
  unlocks: Record<string, UnlockRecord>;
  /** Records whose drink has left the catalogue, kept in case it returns. */
  retired: Record<string, UnlockRecord>;
  /** Index into MILESTONES of the highest rung already celebrated; -1 for none. */
  bestRung: number;
  /** true once persisted state has been rehydrated from disk */
  hydrated: boolean;
  unlock: (drinkId: string, photoUri: string | null, note?: string) => void;
  /**
   * Takes in the pour of a drink someone added, once the catalogue has it
   * (lib/submissions). False when this bundle does not know the id yet, or
   * when this launch could not read the collection back (so nothing written
   * now would be saved); the caller keeps its entry and tries again on a
   * later launch.
   */
  adopt: (drinkId: string, record: UnlockRecord) => boolean;
  updatePhoto: (drinkId: string, photoUri: string) => void;
  relock: (drinkId: string) => void;
  resetAll: () => void;
}

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => {
      /*
       * A drink joining the collection: write it, then raise the
       * celebrations. Shared by unlock and adopt so the two ways an entry
       * can arrive cannot drift apart on what a new entry is owed — the
       * rank rules below apply to both. See unlock for why the side effects
       * come after `set`.
       */
      const enter = (record: UnlockRecord) => {
        const { unlocks: prev, bestRung } = get();
        const before = Object.keys(prev).length;
        const after = before + 1;
        const rung = milestoneCrossed(before, after, TOTAL);
        const rungIndex = rung ? MILESTONES.indexOf(rung) : -1;
        /*
         * A rung celebrates once. Relocking an entry and logging another
         * crosses the same line again, and hearing "New rank" for a rank
         * already held reads as the app having forgotten.
         */
        const earned = rungIndex > bestRung;

        set({
          unlocks: { ...prev, [record.drinkId]: record },
          ...(earned ? { bestRung: rungIndex } : null),
        });

        const { celebrate } = useCelebrate.getState();
        celebrate({ kind: 'collected', drinkId: record.drinkId });

        /*
         * Queued second so it lands second. The entry is the thing the user
         * just did; the rank is the consequence, and a consequence shown
         * before its cause reads as a non-sequitur.
         */
        if (rung && earned) celebrate({ kind: 'milestone', milestone: rung, collected: after });
      };

      return {
        unlocks: {},
        retired: {},
        bestRung: -1,
        hydrated: false,
        /*
         * The single choke point for "a pour was logged", which is why the
         * celebration is raised in this store (enter, above) rather than at
         * the call sites: there are two ways in — a Dex entry and the tab
         * bar's centre action — and celebrating from each would be two
         * chances to drift apart.
         *
         * THE SIDE EFFECTS RUN OUTSIDE `set`, AND THAT IS THE WHOLE POINT.
         * The celebration used to be raised inside the updater passed to
         * `set`, which is a function zustand calls to COMPUTE the next state
         * and which must therefore be pure. Raising it from in there meant the
         * queue was written during a state computation — dropped or run twice
         * depending on how React scheduled the render, and in practice the
         * card never appeared. Read first, write, then act. Deleting a
         * replaced photo file is an act, so it follows the same rule.
         */
        unlock: (drinkId, photoUri, note) => {
          // Unknown ids are refused, which keeps settle()'s invariant true
          // between launches as well as at them.
          if (!getDrink(drinkId)) return;
          const { unlocks: prev } = get();
          const old = recordFor(prev, drinkId);

          if (!old) {
            enter({ drinkId, photoUri, date: new Date().toISOString(), note });
            return;
          }

          /*
           * Re-logging an entry you already have is an edit, not a catch —
           * and an edit keeps what it was not asked to change. The record
           * used to be rebuilt from scratch, so a re-log with the note left
           * blank erased the saved note, and the "Logged <date>" on the
           * detail screen jumped to today, away from the post it was first
           * shared with. Only a new photo, and the note if one was written,
           * move. No celebration and no rank: the count did not change.
           */
          const record: UnlockRecord = {
            ...old,
            photoUri: photoUri ?? old.photoUri,
            note: note ?? old.note,
          };
          set({ unlocks: { ...prev, [drinkId]: record } });
          if (old.photoUri !== record.photoUri) discardPhoto(old.photoUri);
        },
        /*
         * A drink someone added has joined the catalogue (drink_submissions
         * marked 'added' or 'duplicate', and this bundle has the id), so its
         * pour becomes an ordinary entry, keeping the date and note it was
         * logged with. It is a new entry like any other: it counts, it can be
         * posted, and it raises the collected card and any rank it earns.
         *
         * Already collected under the catalogue id: the entry the user has
         * keeps its place and its photo, and the incoming photo is deleted,
         * since the caller is about to forget the record that held it.
         */
        adopt: (drinkId, record) => {
          if (!getDrink(drinkId)) return false;
          /*
           * This launch could not read the collection back, so nothing
           * written now is saved (guardedStorage, above). The caller would
           * still forget its own record, and the pour would be gone from
           * both stores at the next launch. Refused instead: the custom
           * entry keeps the pour and adoption runs again on a later launch.
           */
          if (!readBack) return false;
          const existing = recordFor(get().unlocks, drinkId);
          if (existing) {
            if (record.photoUri !== existing.photoUri) discardPhoto(record.photoUri);
            return true;
          }
          enter({ ...record, drinkId, photoUri: record.photoUri ?? null });
          return true;
        },
        updatePhoto: (drinkId, photoUri) => {
          const { unlocks } = get();
          const old = recordFor(unlocks, drinkId);
          if (!old) return;
          set({ unlocks: { ...unlocks, [drinkId]: { ...old, photoUri } } });
          if (old.photoUri !== photoUri) discardPhoto(old.photoUri);
        },
        /*
         * Relock and reset delete the photo files as well as the records.
         * Both confirmations tell the user their photo is forgotten, and a
         * photo left in Documents is not forgotten: it stays on the phone and
         * in its backups, and the folder only ever grew.
         */
        relock: (drinkId) => {
          const { unlocks } = get();
          const old = recordFor(unlocks, drinkId);
          if (!old) return;
          const next = { ...unlocks };
          delete next[drinkId];
          set({ unlocks: next });
          discardPhoto(old.photoUri);
        },
        resetAll: () => {
          // Anything still queued refers to a collection that no longer exists.
          useCelebrate.getState().clear();
          set({ unlocks: {}, retired: {}, bestRung: -1 });
          discardAllPhotos();
        },
      };
    },
    {
      name: 'drinkdex-collection',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : guardedStorage
      ),
      /*
       * Version 1 added `retired` and `bestRung`. The shape change itself
       * needs no conversion — settle() fills both on every launch — but a
       * version bump is what makes persist write the settled state straight
       * back, so the saved blob takes the new shape at the first launch
       * rather than at the user's next log.
       */
      version: 1,
      migrate: (saved) => saved as Saved,
      partialize: (s) => ({ unlocks: s.unlocks, retired: s.retired, bestRung: s.bestRung }),
      /*
       * `hydrated` is set HERE, not from onRehydrateStorage. persist applies
       * the merged state with the store's raw setter, so this marks the
       * store ready without a write; setting it through setState afterwards
       * rewrote the whole collection on every launch.
       */
      merge: (saved, current) => ({
        ...current,
        ...settle(saved as Saved | undefined),
        hydrated: true,
      }),
      onRehydrateStorage: () => (_state, error) => {
        // The failure path never reaches merge, and the splash still has to
        // lift. This setState does write — which guardedStorage refuses
        // while nothing has been read back.
        if (error) useCollection.setState({ hydrated: true });
      },
    }
  )
);

/** Convenience selector: is a drink unlocked? Own keys only, like getDrink. */
export const useIsUnlocked = (drinkId: string) =>
  useCollection((s) => recordFor(s.unlocks, drinkId) !== undefined);
