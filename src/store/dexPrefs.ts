import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createGuardedStorage } from '@/lib/guardedStorage';

/* ==================================================================== */
/* The Dex's per-phone choice: its order                                */
/*                                                                      */
/* specs/v4.2/spec.md §2.3. For you or By number, from the Order sheet, */
/* and null until the person chooses: the Dex is then For you when the  */
/* answers make one, By number when they do not (§2.1; dexOrderFor      */
/* below). The spec's whole shape is `{ order }`. The first share's     */
/* notice (§4.7) is kept beside the collections, in store/collections'  */
/* useCollectionPrefs, which the collection page reads: one flag in one */
/* place, so the line can never show twice for want of the other.       */
/*                                                                      */
/* A CONVENIENCE, NEVER SYNCED. Nothing here is sent anywhere or tied   */
/* to an account: a second phone starts at the default, which is the    */
/* right way round (the order follows the answers, which do sync).      */
/* Guarded storage all the same, so a failed read never writes the      */
/* default over a choice that was made.                                 */
/* ==================================================================== */

/** The Dex's two orders: the person's kinds of drinks first, or Nº 0001 to the last. */
export type DexOrderChoice = 'foryou' | 'number';

interface DexPrefsState {
  /** False until the saved choice has been read. */
  hydrated: boolean;
  /** The Order sheet's choice; null = never chosen (§2.1's default). */
  order: DexOrderChoice | null;
  setOrder: (order: DexOrderChoice | null) => void;
}

type Persisted = Pick<DexPrefsState, 'order'>;

const ORDERS: readonly DexOrderChoice[] = ['foryou', 'number'];
const orderOf = (v: unknown): DexOrderChoice | null =>
  typeof v === 'string' && (ORDERS as readonly string[]).includes(v) ? (v as DexOrderChoice) : null;

export const useDexPrefs = create<DexPrefsState>()(
  persist(
    (set) => ({
      hydrated: false,
      order: null,

      setOrder: (order) => set({ order: order === null ? null : orderOf(order) }),
    }),
    {
      name: 'sipply-dex.v1',
      storage: createJSONStorage(createGuardedStorage),
      partialize: (s): Persisted => ({ order: s.order }),
      /*
       * Read through a check, as store/taste does: a blob from another
       * build loads as what it can. A choice made in the moment before the
       * read came back is kept over the saved one (it is the newer).
       */
      merge: (saved, current) => {
        const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof Persisted, unknown>>;
        return {
          ...current,
          order: current.order ?? orderOf(s.order),
          hydrated: true,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        // The failure path never reaches merge. This write is refused by the guarded storage.
        if (error) useDexPrefs.setState({ hydrated: true });
      },
    },
  ),
);

/**
 * The order the Dex opens in (§2.1, §2.3). For you needs answers that
 * make one, and their fronts worked out (lib/dexOrder's forYou of
 * store/taste's dexFronts is not null); without them the Dex is By number
 * and shows no order key. With them, the person's own choice, else For you.
 */
export function dexOrderFor(choice: DexOrderChoice | null, forYouAvailable: boolean): DexOrderChoice {
  if (!forYouAvailable) return 'number';
  return choice ?? 'foryou';
}
