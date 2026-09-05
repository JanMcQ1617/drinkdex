import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * `expo export` static rendering runs this module in Node, where AsyncStorage's
 * web backend (window.localStorage) is unavailable. Same fallback as the
 * collection store — see the note there.
 */
const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

interface BarState {
  /**
   * Ingredient ids you have on the shelf.
   *
   * A Record rather than a Set because persist serialises through JSON, and a
   * Set round-trips to `{}` — silently, so the bar would look full until the
   * app restarted and then be empty. The value is always `true`; absence is
   * the only "no".
   */
  owned: Record<string, true>;
  hydrated: boolean;
  toggle: (id: string) => void;
  add: (ids: string[]) => void;
  clear: () => void;
}

export const useBar = create<BarState>()(
  persist(
    (set) => ({
      owned: {},
      hydrated: false,

      toggle: (id) =>
        set((s) => {
          const next = { ...s.owned };
          if (next[id]) delete next[id];
          else next[id] = true;
          return { owned: next };
        }),

      /** Used by the starter-bar shortcut, which adds a dozen at once. */
      add: (ids) =>
        set((s) => {
          const next = { ...s.owned };
          for (const id of ids) next[id] = true;
          return { owned: next };
        }),

      clear: () => set({ owned: {} }),
    }),
    {
      name: 'sipply-bar',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : AsyncStorage,
      ),
      partialize: (s) => ({ owned: s.owned }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
