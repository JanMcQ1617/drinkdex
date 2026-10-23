import { create } from 'zustand';

import { fetchFriendsBoard } from '@/lib/friendsBoard';
import { useAuth } from '@/store/auth';
import type { FriendStanding } from '@/types';

/*
 * The Tournaments tab's Friends board (specs/v4.7/spec.md 3.3): you and
 * the people you follow, by how many different drinks each has posted.
 *
 * The tournaments store's shape and guards exactly: numbered loads where
 * only the newest writes, a `gen` that reset() bumps so an answer for one
 * account never lands in the next one's board, and its own watch on the
 * auth store. Not persisted: a count moves whenever someone posts, and a
 * relaunch also asks again whether migration 025 is there.
 */
interface FriendsBoardState {
  /**
   * False once the server has said friends_board does not exist
   * (migration 025 not applied): the tab leaves its Friends half out.
   * Starts true so a build that reaches a migrated server shows it on the
   * first answer; a later answer turns it back on.
   */
  supported: boolean;
  /** Most entries first, then username, as friends_board returns them. You are always in it. */
  rows: FriendStanding[];
  /** A load is in flight. The rows keep what they had meanwhile. */
  loading: boolean;
  /** The last load failed (offline, or the server refused); the rows are what they were before. */
  failed: boolean;
  /** Has answered once, either way: until then empty rows are "not asked yet", never "nobody". */
  loaded: boolean;
  /** Which account's board this is (see store/tournaments): kept out of EMPTY so a reset cannot put it back. */
  gen: number;

  /** Refetches the board. On focus and on pull. */
  load: () => Promise<void>;
  reset: () => void;
}

type Data = Omit<FriendsBoardState, 'gen' | 'load' | 'reset'>;

const EMPTY: Data = {
  supported: true,
  rows: [],
  loading: false,
  failed: false,
  loaded: false,
};

/* A focus refetch racing a pull: only the newest load writes. */
let loadSeq = 0;

export const useFriendsBoard = create<FriendsBoardState>((set, get) => ({
  ...EMPTY,
  gen: 0,

  load: async () => {
    // Signed out, the function is not callable (anon holds no grant).
    if (!useAuth.getState().session) return;
    const gen = get().gen;
    const seq = ++loadSeq;
    set({ loading: true });
    try {
      const rows = await fetchFriendsBoard();
      if (get().gen !== gen || seq !== loadSeq) return;
      if (rows === null) {
        set({ supported: false, rows: [], loading: false, failed: false, loaded: true });
        return;
      }
      set({ supported: true, rows, loading: false, failed: false, loaded: true });
    } catch {
      if (get().gen !== gen || seq !== loadSeq) return;
      set({ loading: false, failed: true, loaded: true });
    }
  },

  reset: () => {
    loadSeq += 1;
    set({ ...EMPTY, gen: get().gen + 1 });
  },
}));

/*
 * A different account, or none, means this store holds someone else's
 * board. Watched here, as store/tournaments does, so the sign-in code never
 * imports this one; token refreshes keep the id and reset nothing.
 */
let watchedUserId = useAuth.getState().session?.user.id ?? null;
useAuth.subscribe((state) => {
  const id = state.session?.user.id ?? null;
  if (id === watchedUserId) return;
  watchedUserId = id;
  useFriendsBoard.getState().reset();
});
