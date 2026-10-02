import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/* ==================================================================== */
/* Persisted-store storage that never writes before it has read          */
/*                                                                      */
/* The rule is store/collection.ts's, written down there first. That    */
/* store and store/bar.ts keep their own copies (moving them would be   */
/* churn for nothing). This is the same logic as a factory, so every    */
/* newer persisted store has it without one more copy.                  */
/* ==================================================================== */

/**
 * AsyncStorage for a zustand `persist` store, refusing writes until a read
 * has come back.
 *
 * persist writes the whole store on every setState, and it calls the
 * post-rehydration callback on failure as well as on success. So when the
 * read failed, the first write after it — including the one that marks the
 * store hydrated — put the still-empty in-memory state over the saved one:
 * everything the user had, gone at launch, with no action from them.
 *
 * A read that throws leaves the saved blob on disk for the next launch to
 * try again; the cost is that changes made in that session are not saved,
 * which is the right way round. A read that comes back with text that will
 * not parse DOES count as read: that blob is already unreadable, and
 * holding writes back would stop the store ever saving again.
 *
 * One flag per call, so each store waits for its own read, not another's.
 *
 * `expo export` static rendering runs store modules in Node, where
 * AsyncStorage's web backend (window.localStorage) is unavailable. There
 * the storage reads nothing and writes nothing; native and browser
 * environments both define `window`. Checked per call rather than once,
 * because the store module is imported before anything has run.
 */
export function createGuardedStorage(): StateStorage {
  let readBack = false;
  const serverSide = () => typeof window === 'undefined';
  return {
    getItem: async (name) => {
      if (serverSide()) return null;
      const value = await AsyncStorage.getItem(name);
      readBack = true;
      return value;
    },
    setItem: async (name, value) => {
      if (serverSide() || !readBack) return;
      await AsyncStorage.setItem(name, value);
    },
    removeItem: async (name) => {
      if (serverSide()) return;
      await AsyncStorage.removeItem(name);
    },
  };
}
