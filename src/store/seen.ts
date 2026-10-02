import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/* ==================================================================== */
/* What you have already looked at                                      */
/*                                                                      */
/* Two marks, both kept on this phone and nowhere else: the newest pour */
/* you have viewed from each person (so Today's pours can frame what is */
/* new in wine), and the newest Activity you have opened (so Home's     */
/* heart can say there is something new). Nobody is told you looked:    */
/* there are no view receipts, so nothing can leak and no table is      */
/* needed.                                                              */
/*                                                                      */
/* KEYED BY ACCOUNT, so it needs no reset on sign-out: a second account */
/* on the same phone reads its own marks, and the first account's come  */
/* back when it signs in again.                                         */
/*                                                                      */
/* LOSING IT IS HARMLESS. A failed read or a cleared install only makes */
/* everything read as new once more, which is why this store writes     */
/* through plain AsyncStorage and does not copy the collection store's  */
/* guarded writes: there is nothing here a lost read could destroy that */
/* matters.                                                             */
/* ==================================================================== */

/**
 * `expo export` static rendering runs this module in Node, where
 * AsyncStorage's web backend (window.localStorage) is unavailable. The
 * collection and bar stores fall back the same way.
 */
const noopStorage: StateStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

/** A pour mark older than this can no longer match a pour in the row (24 h), so it is dropped. */
const POUR_MARK_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Whether ISO timestamp `a` is later than `b`.
 *
 * By time, not by string. Postgres trims trailing zeros from the fraction
 * of a second, so two stamps of the same moment can differ in length, and
 * a string comparison is right only as long as every stamp has the same
 * offset. A stamp that will not parse falls back to the string order
 * rather than reading as "never".
 */
export function isLater(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a > b;
  return ta > tb;
}

/** The later of two stamps, either of which may be missing. */
export function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return isLater(b, a) ? b : a;
}

interface SeenState {
  /** False until the saved marks have been read; until then nothing is drawn as new. */
  hydrated: boolean;
  /** myId → authorId → ISO of the newest pour viewed. */
  pours: Record<string, Record<string, string>>;
  /** myId → ISO of the newest activity opened. */
  activity: Record<string, string>;
  /** Keeps the later of the stored mark and `at`. */
  markPourSeen: (myId: string, authorId: string, at: string) => void;
  /** Keeps the later of the stored mark and `at`. */
  markActivitySeen: (myId: string, at: string) => void;
}

type Marks = Pick<SeenState, 'pours' | 'activity'>;

/** Pour marks that can still match a pour in the row; activity marks are kept whole. */
function prunePours(pours: SeenState['pours'], now: number): SeenState['pours'] {
  const out: SeenState['pours'] = {};
  for (const [me, byAuthor] of Object.entries(pours)) {
    const kept: Record<string, string> = {};
    for (const [author, at] of Object.entries(byAuthor)) {
      const t = Date.parse(at);
      if (!Number.isNaN(t) && now - t < POUR_MARK_TTL_MS) kept[author] = at;
    }
    if (Object.keys(kept).length > 0) out[me] = kept;
  }
  return out;
}

/**
 * The saved marks and any made in this session before they were read,
 * entry by entry, keeping the later of each. A pour viewed in the moment
 * between launch and the read would otherwise be overwritten by an older
 * saved mark and read as new again.
 */
function mergeMarks(saved: Partial<Marks> | undefined, current: Marks): Marks {
  const pours: SeenState['pours'] = { ...(saved?.pours ?? {}) };
  for (const [me, byAuthor] of Object.entries(current.pours)) {
    const merged = { ...(pours[me] ?? {}) };
    for (const [author, at] of Object.entries(byAuthor)) {
      merged[author] = laterOf(merged[author], at) ?? at;
    }
    pours[me] = merged;
  }
  const activity: SeenState['activity'] = { ...(saved?.activity ?? {}) };
  for (const [me, at] of Object.entries(current.activity)) {
    activity[me] = laterOf(activity[me], at) ?? at;
  }
  return { pours, activity };
}

export const useSeen = create<SeenState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      pours: {},
      activity: {},

      markPourSeen: (myId, authorId, at) => {
        const mine = get().pours[myId] ?? {};
        const prev = mine[authorId];
        // Viewing an older pour after a newer one must not move the mark back.
        if (prev && !isLater(at, prev)) return;
        set({ pours: { ...get().pours, [myId]: { ...mine, [authorId]: at } } });
      },

      markActivitySeen: (myId, at) => {
        const prev = get().activity[myId];
        if (prev && !isLater(at, prev)) return;
        set({ activity: { ...get().activity, [myId]: at } });
      },
    }),
    {
      name: 'sipply-seen-v1',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? noopStorage : AsyncStorage)),
      partialize: (s) => ({ pours: s.pours, activity: s.activity }),
      /*
       * Pruned and flagged in merge rather than by mutating the state handed
       * to onRehydrateStorage: that mutation changes the object in place and
       * notifies nobody, so a tile waiting on `hydrated` would never see it
       * flip (the bar store learned this first). persist applies merge's
       * result through the store's own setter, which does notify.
       */
      merge: (saved, current) => {
        const marks = mergeMarks(saved as Partial<Marks> | undefined, current);
        return {
          ...current,
          pours: prunePours(marks.pours, Date.now()),
          activity: marks.activity,
          hydrated: true,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        // A failed read never reaches merge. Everything reads as new once.
        if (error) useSeen.setState({ hydrated: true });
      },
    },
  ),
);
