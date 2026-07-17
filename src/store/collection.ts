import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UnlockRecord } from '@/types';

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
      unlock: (drinkId, photoUri, note) =>
        set((s) => ({
          unlocks: {
            ...s.unlocks,
            [drinkId]: { drinkId, photoUri, date: new Date().toISOString(), note },
          },
        })),
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
      resetAll: () => set({ unlocks: {} }),
    }),
    {
      name: 'drinkdex-collection',
      storage: createJSONStorage(() => AsyncStorage),
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
