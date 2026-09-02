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
    (set) => ({
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
      unlock: (drinkId, photoUri, note) =>
        set((s) => {
          // Re-logging an entry you already have is an edit, not a catch.
          const isNew = !s.unlocks[drinkId];
          const before = Object.keys(s.unlocks).length;

          if (isNew) {
            const after = before + 1;
            useCelebrate.getState().celebrate({ kind: 'collected', drinkId });

            const rung = milestoneCrossed(before, after, TOTAL);
            /*
             * Queued second so it lands second. The entry is the thing the
             * user just did; the rank is the consequence, and a consequence
             * shown before its cause reads as a non-sequitur.
             */
            if (rung) {
              useCelebrate.getState().celebrate({
                kind: 'milestone',
                milestone: rung,
                collected: after,
              });
            }
          }

          return {
            unlocks: {
              ...s.unlocks,
              [drinkId]: { drinkId, photoUri, date: new Date().toISOString(), note },
            },
          };
        }),
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
