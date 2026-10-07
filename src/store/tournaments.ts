import { create } from 'zustand';

import * as api from '@/lib/tournaments';
import type { Result } from '@/lib/tournaments';
import { useAuth } from '@/store/auth';
import type { TournamentBoard, TournamentSummary } from '@/types';

/*
 * Your tournaments, for Home's trophy and its badge, the Tournaments list,
 * and each tournament's page.
 *
 * Nothing here is cached across launches: standings move whenever a member
 * posts, and a stale leaderboard is worse than a moment's spinner. Not
 * persisted, so a relaunch also asks again whether migration 020 is there.
 */
interface TournamentsState {
  /**
   * False once the server has said my_tournaments does not exist
   * (migration 020 not applied): the trophy and every tournament screen
   * hide. Starts true so a build that reaches a migrated server shows the
   * trophy on the first answer; a later answer turns it back on.
   */
  supported: boolean;
  /** Newest start first, as my_tournaments returns them. */
  list: TournamentSummary[];
  /** Invitations still open (not finished): the dot on Home's trophy. */
  pendingInvites: number;
  /** A load is in flight. The list keeps what it had meanwhile. */
  loading: boolean;
  /** The last load failed (offline, or the server refused); the list is what it was before. */
  failed: boolean;
  /** Each tournament page's last answer, by id. */
  boards: Record<string, TournamentBoard>;
  /**
   * Which account's tournaments these are, as a counter that reset() bumps.
   * Every action reads it before its first await and writes nothing if it
   * has moved on, so an answer for account A never lands in account B's
   * list. Kept out of EMPTY so a reset cannot put it back.
   */
  gen: number;

  /** Refetches the list. Refetch on focus and after every tournament action. */
  load: () => Promise<void>;
  /** Refetches one tournament. A not_found answer drops it from `boards`. */
  loadBoard: (id: string) => Promise<Result<TournamentBoard>>;
  /** After you delete or leave one: it leaves the list and boards at once, before the next load. */
  forget: (id: string) => void;
  reset: () => void;
}

type Data = Omit<TournamentsState, 'gen' | 'load' | 'loadBoard' | 'forget' | 'reset'>;

const EMPTY: Data = {
  supported: true,
  list: [],
  pendingInvites: 0,
  loading: false,
  failed: false,
  boards: {},
};

/** Open invitations: yours to answer, in a tournament that has not finished. */
const pendingIn = (list: TournamentSummary[]) =>
  list.filter((t) => t.myStatus === 'invited' && t.state !== 'finished').length;

/*
 * Loads that overlap (a focus refetch racing a pull to refresh) are
 * numbered, and only the newest writes: an older answer arriving last must
 * not replace a newer list.
 */
let loadSeq = 0;

export const useTournaments = create<TournamentsState>((set, get) => ({
  ...EMPTY,
  gen: 0,

  load: async () => {
    // Signed out, the functions are not callable (anon holds no grant).
    if (!useAuth.getState().session) return;
    const gen = get().gen;
    const seq = ++loadSeq;
    set({ loading: true });
    try {
      const list = await api.fetchMyTournaments();
      if (get().gen !== gen || seq !== loadSeq) return;
      if (list === null) {
        set({ supported: false, list: [], pendingInvites: 0, loading: false, failed: false });
        return;
      }
      set({ supported: true, list, pendingInvites: pendingIn(list), loading: false, failed: false });
    } catch {
      if (get().gen !== gen || seq !== loadSeq) return;
      set({ loading: false, failed: true });
    }
  },

  loadBoard: async (id) => {
    const gen = get().gen;
    const result = await api.fetchBoard(id);
    if (get().gen !== gen) return result;
    if (result.ok) {
      set({ boards: { ...get().boards, [id]: result.value } });
    } else if (result.reason === 'not_found') {
      const { [id]: _gone, ...rest } = get().boards;
      set({ boards: rest });
    }
    return result;
  },

  forget: (id) => {
    const list = get().list.filter((t) => t.id !== id);
    const { [id]: _gone, ...boards } = get().boards;
    set({ list, boards, pendingInvites: pendingIn(list) });
  },

  reset: () => {
    loadSeq += 1;
    set({ ...EMPTY, gen: get().gen + 1 });
  },
}));

/*
 * A different account, or none, means this store holds someone else's
 * tournaments. It watches the auth store itself, as store/reels.ts does,
 * so the sign-in code never imports this one: sign-out, account deletion,
 * a revoked session and a switch of account all change the user id, and
 * every one of them lands here. Token refreshes keep the id and reset
 * nothing.
 */
let watchedUserId = useAuth.getState().session?.user.id ?? null;
useAuth.subscribe((state) => {
  const id = state.session?.user.id ?? null;
  if (id === watchedUserId) return;
  watchedUserId = id;
  useTournaments.getState().reset();
});
