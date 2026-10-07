import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/**
 * `expo export` static rendering runs this module in Node, where AsyncStorage's
 * web backend (window.localStorage) is unavailable. Same fallback as the
 * collection store — see the note there.
 */
const noopStorage: StateStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

/*
 * NOTHING IS WRITTEN UNTIL SOMETHING HAS BEEN READ — the collection
 * store's rule, for the same reason (see guardedStorage there).
 *
 * persist writes the whole shelf on every setState, and it runs the
 * post-rehydration callback on failure as well as on success. With plain
 * AsyncStorage, a read that threw left the in-memory shelf empty, and the
 * first write after it put that empty shelf over the saved one: a shelf
 * built a tap at a time, gone at launch, with no action from the user.
 *
 * A read that throws now leaves the saved blob on disk for the next launch
 * to try again, and ticks made in that session are not saved, which is the
 * right way round. A read that comes back with text that will not parse
 * does count as read: that blob is already lost, and holding writes back
 * would stop the shelf ever saving again.
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

/*
 * Ids the bar index no longer has, and the bottle each one meant. Until
 * build 16 the index stripped "dry" from "Dry vermouth", so every one of
 * those 70 recipes asked for a generic "Vermouth", and that is the bottle
 * a shelf saved. It meant dry vermouth, so it moves there and pours the
 * same drinks it did. "Red vermouth" is sweet vermouth written another way.
 */
const RETIRED: Record<string, string> = {
  vermouth: 'dry-vermouth',
  'red-vermouth': 'sweet-vermouth',
  'sweet-red-vermouth': 'sweet-vermouth',
};

function renameRetired(owned: Record<string, true>): Record<string, true> {
  if (!Object.keys(RETIRED).some((id) => owned[id])) return owned;
  const next: Record<string, true> = {};
  for (const id of Object.keys(owned)) next[RETIRED[id] ?? id] = true;
  return next;
}

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
        typeof window === 'undefined' ? noopStorage : guardedStorage,
      ),
      partialize: (s) => ({ owned: s.owned }),
      /*
       * `hydrated` is set in merge, not by mutating the state handed to
       * onRehydrateStorage. That mutation changed the object in place and
       * notified nobody, so a subscriber never saw the flag flip. persist
       * applies merge's result with the store's raw setter, which does
       * notify, and does not write the shelf back.
       */
      merge: (saved, current) => {
        const s = saved as Partial<BarState> | undefined;
        return {
          ...current,
          ...s,
          ...(s?.owned ? { owned: renameRetired(s.owned) } : null),
          hydrated: true,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        // The failure path never reaches merge. This setState does write,
        // which guardedStorage refuses while nothing has been read back.
        if (error) useBar.setState({ hydrated: true });
      },
    },
  ),
);
