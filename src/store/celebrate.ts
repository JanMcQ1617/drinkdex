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

export type Celebration =
  /** A new entry joined the collection. */
  | { kind: 'collected'; drinkId: string }
  /** The rank ladder advanced a rung. */
  | { kind: 'milestone'; milestone: Milestone; collected: number };

interface CelebrateState {
  queue: Celebration[];
  /** Adds one to the back of the queue. */
  celebrate: (c: Celebration) => void;
  /** Retires the front one. */
  dismiss: () => void;
  /** Drops everything — used when the collection is reset out from under it. */
  clear: () => void;
}

export const useCelebrate = create<CelebrateState>()((set) => ({
  queue: [],
  celebrate: (c) => set((s) => ({ queue: [...s.queue, c] })),
  dismiss: () => set((s) => ({ queue: s.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}));
