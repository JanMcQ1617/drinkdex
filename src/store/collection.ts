import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { TOTAL } from '@/data';
import { milestoneCrossed } from '@/lib/milestones';
import { useCelebrate } from '@/store/celebrate';
import type { UnlockRecord } from '@/types';

/**
 * `expo export` static rendering runs this module in Node, where AsyncStorage's
 * web backend (window.localStorage) is unavailable. Fall back to a no-op store
 * there; native and browser environments both define `window`.
 */
const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

interface CollectionState {
  /** drinkId -> unlock record */
  unlocks: Record<string, UnlockRecord>;
  /** true once persisted state has been rehydrated from disk */
  hydrated: boolean;
  unlock: (drinkId: string, photoUri: string | null, note?: string) => void;
  updatePhoto: (drinkId: string, photoUri: string) => void;
  relock: (drinkId: string) => void;
  resetAll: () => void;
}

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => ({
      unlocks: {},
      hydrated: false,
      /*
       * The single choke point for "a pour was logged", which is why the
       * celebration is raised here rather than at the call sites. There
       * are two ways in now — a Dex entry and the tab bar's centre action
       * — and celebrating from each of them would mean two chances to
       * drift apart, with the divergence only visible to whoever happens
       * to use the less-travelled one.
       */
      /*
       * The single choke point for "a pour was logged", which is why the
       * celebration is raised here rather than at the call sites: there are
       * two ways in, and celebrating from each would be two chances to
       * drift apart.
       *
       * THE SIDE EFFECT RUNS OUTSIDE `set`, AND THAT IS THE WHOLE POINT.
       * It used to sit inside the updater passed to `set`, which is a
       * function zustand calls to COMPUTE the next state and which must
       * therefore be pure. Raising a celebration from in there meant the
       * queue was written during a state computation — dropped or run
       * twice depending on how React scheduled the render, and in practice
       * the card never appeared. Read first, write, then act.
       */
      unlock: (drinkId, photoUri, note) => {
        const prev = get().unlocks;
        // Re-logging an entry you already have is an edit, not a catch.
        const isNew = !prev[drinkId];
        const before = Object.keys(prev).length;

        set({
          unlocks: {
            ...prev,
            [drinkId]: { drinkId, photoUri, date: new Date().toISOString(), note },
          },
        });

        if (!isNew) return;

        const after = before + 1;
        const { celebrate } = useCelebrate.getState();
        celebrate({ kind: 'collected', drinkId });

        /*
         * Queued second so it lands second. The entry is the thing the user
         * just did; the rank is the consequence, and a consequence shown
         * before its cause reads as a non-sequitur.
         */
        const rung = milestoneCrossed(before, after, TOTAL);
        if (rung) celebrate({ kind: 'milestone', milestone: rung, collected: after });
      },
      updatePhoto: (drinkId, photoUri) =>
        set((s) =>
          s.unlocks[drinkId]
            ? { unlocks: { ...s.unlocks, [drinkId]: { ...s.unlocks[drinkId], photoUri } } }
            : s
        ),
      relock: (drinkId) =>
        set((s) => {
          const next = { ...s.unlocks };
          delete next[drinkId];
          return { unlocks: next };
        }),
      resetAll: () => {
        // Anything still queued refers to a collection that no longer exists.
        useCelebrate.getState().clear();
        set({ unlocks: {} });
      },
    }),
    {
      name: 'drinkdex-collection',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : AsyncStorage
      ),
      partialize: (s) => ({ unlocks: s.unlocks }),
      onRehydrateStorage: () => () => {
        useCollection.setState({ hydrated: true });
      },
    }
  )
);

/** Convenience selector: is a drink unlocked? */
export const useIsUnlocked = (drinkId: string) =>
  useCollection((s) => Boolean(s.unlocks[drinkId]));
