import { create } from 'zustand';

import type { Milestone } from '@/lib/milestones';

/* ==================================================================== */
/* Celebrations                                                         */
/*                                                                      */
/* A queue, not a single slot, because one action can earn two of       */
/* these: logging the pour that takes you from 24% to 25% is both a new */
/* entry AND a new rank. Holding one at a time would drop whichever     */
/* arrived second — and it is always the rank that arrives second, so   */
/* the rarer, better moment is the one that would go missing.           */
/*                                                                      */
/* Kept out of the collection store on purpose. That store is           */
/* persisted, and a queue of transient UI moments has no business being */
/* written to disk and replayed on next launch.                         */
/* ==================================================================== */

/** What a caller raises. */
export type CelebrationInput =
  /** A new entry joined the collection. */
  | { kind: 'collected'; drinkId: string }
  /** The rank ladder advanced a rung. */
  | { kind: 'milestone'; milestone: Milestone; collected: number };

/*
 * What sits in the queue: the same thing, plus an identity.
 *
 * The overlay keys each card on `id`. Two queued cards otherwise render
 * as one React element whose content changes — the second never gets its
 * entrance, and a halo that already played for the first stays spent —
 * which quietly undoes the reason this is a queue. The id is also how
 * the two mounted overlays (root and log sheet) agree that a card has
 * already been announced to VoiceOver.
 */
export type Celebration = CelebrationInput & { id: number };

interface CelebrateState {
  queue: Celebration[];
  /** Adds one to the back of the queue. */
  celebrate: (c: CelebrationInput) => void;
  /** Retires the front one. */
  dismiss: () => void;
  /** Drops everything — used when the collection is reset out from under it. */
  clear: () => void;
}

/** Never reset, so an id is never reused within a session, even after clear(). */
let nextId = 1;

export const useCelebrate = create<CelebrateState>()((set) => ({
  queue: [],
  celebrate: (c) => {
    const id = nextId++;
    set((s) => ({ queue: [...s.queue, { ...c, id }] }));
  },
  dismiss: () => set((s) => ({ queue: s.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}));
