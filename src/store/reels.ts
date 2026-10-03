import { create } from 'zustand';

import * as api from '@/lib/reels';
import type { Reel, ReelCursor } from '@/lib/reels';
import { fetchProfiles } from '@/lib/social';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';

/*
 * The Reels feed: one global list, newest first, paged as you swipe.
 *
 * Every reel in `feed` has its author in `authors`. A page whose authors
 * could not be read fails as a whole (the feed would otherwise draw reels
 * with nobody's name on them), and a reel whose author did not come back
 * (an account deleted, or a block that landed, between the two reads) is
 * left out of that page.
 */
interface ReelsState {
  feed: Reel[];
  /** Where the next page starts; null when the last page has been read. */
  next: ReelCursor;
  /**
   * The first page. 'loading' only while nothing is held: a reload over a
   * feed already on screen keeps it there and sets `refreshing` instead, so
   * pull-to-refresh never swaps the feed for a spinner.
   */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** A reload is under way over the feed already shown. */
  refreshing: boolean;
  loadingMore: boolean;
  /** The last loadMore failed; the end page offers "Try again". Cleared by the next attempt. */
  moreError: boolean;
  authors: Record<string, UserProfile>;
  /** Session-wide sound switch, not persisted. Reels start with sound. */
  muted: boolean;
  /** When the first page last loaded, for the stale-on-focus reload. 0 = never. */
  loadedAt: number;
  /**
   * Bumped after a post, a delete, a report or a block, so a screen that
   * holds its own list of reels (a profile's Reels tab) knows to refetch.
   * Never goes back down, reset included, so a key a screen already holds
   * can never be met again by a later state.
   */
  reelsVersion: number;
  /**
   * Which account's feed this is, as a counter that reset() bumps. Every
   * action reads it before its first await and checks it again after each
   * one, and writes nothing once it has moved on: a page for account A that
   * resolved after a switch must not land in account B's feed. Kept out of
   * EMPTY so a reset cannot put it back to a number an older request holds.
   */
  gen: number;

  /** The first page; replaces the feed. */
  load: (myId: string) => Promise<void>;
  /** The next page. A no-op while one is loading, before the first page, or after the last. */
  loadMore: (myId: string) => Promise<void>;
  /**
   * Likes or unlikes a reel from anywhere. `wasLiked` is the state the user
   * saw when they tapped. The feed's copy flips at once and flips back if
   * the write fails; resolves to false then, so a cell holding its own
   * optimistic heart can drop it.
   */
  toggleLike: (myId: string, reelId: string, wasLiked: boolean) => Promise<boolean>;
  setMuted: (muted: boolean) => void;
  /**
   * Your new reel, first in the feed (it is the newest anywhere). Inserted
   * only over a loaded feed; before that, the next load fetches it. One gap,
   * left open on purpose: a load or reload already in flight may have read
   * the feed before the post landed, and then replaces the feed without
   * this reel until the load after it (a pull, or the stale reload). The
   * recorder takes far longer than a page load, so it needs a stalled
   * network to happen.
   */
  prepend: (reel: Reel, author: UserProfile) => void;
  /** After a delete or a report: the reel leaves the feed at once. */
  remove: (reelId: string) => void;
  /**
   * After a block: everything by that person leaves the feed at once. The
   * read policy hides them from the next query; without this their reels
   * would stay on screen until a reload, which reads as a block that did
   * not work.
   */
  dropAuthor: (authorId: string) => void;
  reset: () => void;
}

const EMPTY = {
  feed: [] as Reel[],
  next: null as ReelCursor,
  status: 'idle' as ReelsState['status'],
  refreshing: false,
  loadingMore: false,
  moreError: false,
  authors: {} as Record<string, UserProfile>,
  muted: false,
  loadedAt: 0,
};

/**
 * One page plus the profiles of its authors that are not already held
 * (`fetched` holds only those). Throws when either read fails.
 */
async function pageWithAuthors(
  myId: string,
  cursor: ReelCursor,
  held: Record<string, UserProfile>,
): Promise<{ reels: Reel[]; next: ReelCursor; fetched: Record<string, UserProfile> }> {
  const page = await api.fetchReels(myId, cursor);
  const missing = page.reels.map((r) => r.authorId).filter((id) => !held[id]);
  const fetched = missing.length ? await fetchProfiles(missing) : {};
  const reels = page.reels.filter((r) => held[r.authorId] || fetched[r.authorId]);
  return { reels, next: page.next, fetched };
}

export const useReels = create<ReelsState>()((set, get) => ({
  ...EMPTY,
  reelsVersion: 0,
  gen: 0,

  load: async (myId) => {
    // A focus and a pull landing together must not send the first page twice.
    if (get().status === 'loading' || get().refreshing) return;
    const gen = get().gen;
    const holding = get().feed.length > 0;
    if (holding) set({ refreshing: true });
    else set({ status: 'loading' });
    try {
      /*
       * Authors are fetched afresh rather than merged into what is held:
       * a reload is when a changed avatar or name should show. The page's
       * own authors are all that the new feed needs.
       */
      const page = await pageWithAuthors(myId, null, {});
      if (get().gen !== gen) return;
      set({
        feed: page.reels,
        next: page.next,
        authors: page.fetched,
        status: 'ready',
        refreshing: false,
        moreError: false,
        loadedAt: Date.now(),
      });
    } catch {
      if (get().gen !== gen) return;
      // A failed reload keeps the feed it had; only an empty screen shows the error.
      if (holding) set({ refreshing: false });
      else set({ status: 'error' });
    }
  },

  loadMore: async (myId) => {
    const { next, loadingMore, status } = get();
    if (loadingMore || next === null || status !== 'ready') return;
    const gen = get().gen;
    set({ loadingMore: true, moreError: false });
    try {
      const page = await pageWithAuthors(myId, next, get().authors);
      if (get().gen !== gen) return;
      /*
       * A reload while this page was in flight replaced the feed and its
       * cursor; this page then belongs to a list that is gone. Dropped, and
       * the new feed's own cursor carries on from where it ends.
       */
      if (get().next !== next) {
        set({ loadingMore: false });
        return;
      }
      /*
       * Authors merge into what is held now, not what was held when the
       * request left: a prepend meanwhile keeps its author, and a block
       * meanwhile (dropAuthor) of someone already in the feed keeps them
       * out of this page too, because their profile was held when the
       * request left and so was not fetched again. Someone blocked from
       * elsewhere who was not in the feed can still arrive with this page;
       * the next load leaves them out.
       * Keyset paging cannot repeat a reel; the id check only makes sure
       * no id is ever in the list twice, which would give two pages one key.
       */
      const authors = { ...get().authors, ...page.fetched };
      const seen = new Set(get().feed.map((r) => r.id));
      set({
        feed: [...get().feed, ...page.reels.filter((r) => !seen.has(r.id) && authors[r.authorId])],
        next: page.next,
        authors,
        loadingMore: false,
      });
    } catch {
      if (get().gen !== gen) return;
      // A page for a feed a reload has replaced failing says nothing about the new one.
      set(get().next === next ? { loadingMore: false, moreError: true } : { loadingMore: false });
    }
  },

  toggleLike: async (myId, reelId, wasLiked) => {
    const gen = get().gen;
    /*
     * Written only when a feed reel actually flips: a like on a reel opened
     * on its own (reel/[id], an author's reels) is often on one the feed
     * does not hold, and a fresh copy of the same feed re-ran the Reels
     * tab's list underneath it.
     */
    const patch = (on: boolean) => {
      const flips = (r: Reel) => r.id === reelId && r.likedByMe !== on;
      if (!get().feed.some(flips)) return;
      set({
        feed: get().feed.map((r) =>
          flips(r) ? { ...r, likedByMe: on, likes: Math.max(0, r.likes + (on ? 1 : -1)) } : r,
        ),
      });
    };

    patch(!wasLiked);
    try {
      if (wasLiked) await api.unlikeReel(myId, reelId);
      else await api.likeReel(myId, reelId);
      return true;
    } catch {
      if (get().gen !== gen) return false;
      patch(wasLiked);
      return false;
    }
  },

  setMuted: (muted) => set({ muted }),

  prepend: (reel, author) => {
    const { status } = get();
    const common = {
      authors: { ...get().authors, [author.id]: author },
      reelsVersion: get().reelsVersion + 1,
    };
    if (status === 'ready') {
      set({ ...common, feed: [reel, ...get().feed.filter((r) => r.id !== reel.id)] });
      return;
    }
    /*
     * No feed is shown yet, so there is no paging to slot it into. The next
     * load brings it back as the newest reel; an error state goes back to
     * idle so that the tab's first focus makes that load.
     */
    set({ ...common, status: status === 'error' ? 'idle' : status });
  },

  remove: (reelId) =>
    set({
      feed: get().feed.filter((r) => r.id !== reelId),
      reelsVersion: get().reelsVersion + 1,
    }),

  dropAuthor: (authorId) => {
    const { [authorId]: _dropped, ...authors } = get().authors;
    set({
      feed: get().feed.filter((r) => r.authorId !== authorId),
      authors,
      reelsVersion: get().reelsVersion + 1,
    });
  },

  reset: () => set({ ...EMPTY, gen: get().gen + 1, reelsVersion: get().reelsVersion + 1 }),
}));

/*
 * A different account, or none, means this store holds someone else's
 * feed, likes and sound setting. The store watches the auth store itself
 * rather than being reset by it, so the sign-in code never has to import
 * the Reels code: sign-out, account deletion, a revoked session and a
 * reset link for another account all change the user id, and every one of
 * them lands here. Token refreshes keep the same id and reset nothing.
 */
let watchedUserId = useAuth.getState().session?.user.id ?? null;
useAuth.subscribe((state) => {
  const id = state.session?.user.id ?? null;
  if (id === watchedUserId) return;
  watchedUserId = id;
  useReels.getState().reset();
});
