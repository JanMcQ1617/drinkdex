import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { daysBetween, dayKey, HISTORY_DAYS, type SentIdea } from '@/lib/dailyIdeas';
import { createGuardedStorage } from '@/lib/guardedStorage';

/* ==================================================================== */
/* Daily ideas: this phone's choice, and what it has sent               */
/*                                                                      */
/* specs/v4.3/spec.md §3.2 to §3.10. A PHONE setting, not an account's: */
/* the notifications are scheduled on this phone, so signing out keeps  */
/* the choice (the ideas that need an account just drop out of the      */
/* plan), and a second phone is asked on its own.                       */
/*                                                                      */
/* WHAT IS KEPT, AND WHY ON THE PHONE. `history` is every idea that was */
/* due to fire in the last 90 days: the no-repeat promise (never the    */
/* same message within 60 days) can only be kept by remembering what    */
/* was sent, and nothing about daily ideas is ever sent anywhere        */
/* (docs/privacy.md). `planned` is the last plan, so the next replan    */
/* knows which of them have fired since.                                */
/*                                                                      */
/* THE ASK (§3.2). Never on first launch, never before the person has   */
/* done something: `due` is set only by noteDone, from a real catch,    */
/* post, drink of their own, save or follow made in a running app. At   */
/* most two asks by itself, the second only 14 days after the first    */
/* and after something new; a "Don't Allow" in iOS's prompt ends them.  */
/* Settings may always offer it again, because the person asked there.  */
/*                                                                      */
/* Guarded storage (lib/guardedStorage): a failed read must never write */
/* the defaults over a choice and a history that were made.             */
/* ==================================================================== */

/** What iOS (or Android) says about Sipply's notifications. */
export type NotificationsPermission = 'granted' | 'denied' | 'undetermined';

/** The ask's last answer. */
export type IdeasAnswer = 'allowed' | 'notNow' | 'denied';

/** Things a person does that make the ask fair (§3.2's "a first"). */
export type DoneKind = 'catch' | 'post' | 'create' | 'save' | 'follow';

/** One scheduled idea, as kept between replans (the Date as ISO, since this is JSON). */
export interface PlannedRecord extends SentIdea {
  at: string;
}

/** The time a new phone starts at: 6:00 PM (Jan's answer 3). */
export const DEFAULT_HOUR = 18;
export const DEFAULT_MINUTE = 0;
/** Asks the app makes by itself, at most (§3.2). */
const MAX_ASKS = 2;
/** The second ask waits at least this long after the first. */
const SECOND_ASK_DAYS = 14;

interface NotificationPrefsState {
  /** False until the saved state has been read back. */
  hydrated: boolean;
  /** The Settings box: daily ideas on. Only ever true with iOS's permission granted at the time. */
  enabled: boolean;
  hour: number;
  minute: number;
  /** Random, made once per install: seeds the planner so two phones differ (lib/dailyIdeas). */
  installId: string;
  /** Times the app has asked by itself (Settings' own asks are not counted against it). */
  asks: number;
  lastAskedAt: string | null;
  answer: IdeasAnswer | null;
  /** Something happened that makes the ask fair; shown on the next calm tab (IdeasOptInHost). */
  due: boolean;
  /** The last catch, post, own drink, save or follow, for the second ask's "something new". */
  lastDoneAt: string | null;
  planned: PlannedRecord[];
  history: SentIdea[];
  /** The time zone the plan was made in: a change replans. */
  tz: string | null;
  /** NOT persisted. When this runtime last replanned (ms), for the foreground's 10-minute rule. */
  plannedAt: number | null;
  /** NOT persisted. The OS permission as last read; null before the first read. */
  permission: NotificationsPermission | null;

  setEnabled: (on: boolean) => void;
  setTime: (hour: number, minute: number) => void;
  /** Records a first or a later action; may make the ask due (§3.2). */
  noteDone: (kind: DoneKind) => void;
  /** The ask was answered (or dismissed). Counts against MAX_ASKS when it was the app's own. */
  answered: (answer: IdeasAnswer, own: boolean) => void;
  /** The ask cannot be made after all (permission denied meanwhile, on already): clears `due`. */
  dropDue: () => void;
  /** Moves every planned idea whose time has passed into history, and forgets history older than 90 days. */
  settle: (now: Date) => void;
  /** The plan just scheduled. */
  setPlan: (planned: PlannedRecord[], tz: string | null) => void;
  setPermission: (p: NotificationsPermission) => void;
}

type Persisted = Pick<
  NotificationPrefsState,
  | 'enabled'
  | 'hour'
  | 'minute'
  | 'installId'
  | 'asks'
  | 'lastAskedAt'
  | 'answer'
  | 'due'
  | 'lastDoneAt'
  | 'planned'
  | 'history'
  | 'tz'
>;

const ANSWERS: readonly IdeasAnswer[] = ['allowed', 'notNow', 'denied'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isString = (v: unknown): v is string => typeof v === 'string';
const intIn = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** A sent idea read back, or null when the blob is not one (another build's, or damaged). */
function sentOf(v: unknown): SentIdea | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isString(o.id) || !isString(o.cat) || !isString(o.day) || !DAY.test(o.day)) return null;
  return { id: o.id, cat: o.cat, day: o.day, drink: isString(o.drink) ? o.drink : null };
}

function plannedOf(v: unknown): PlannedRecord | null {
  const s = sentOf(v);
  const at = (v as { at?: unknown } | null)?.at;
  return s && isString(at) && !Number.isNaN(Date.parse(at)) ? { ...s, at } : null;
}

const listOf = <T>(v: unknown, read: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(read).filter((x): x is T => x !== null) : [];

/** Whether the app may make the ask by itself now, before reading iOS's status (§3.2 rule 3). */
function mayBecomeDue(s: NotificationPrefsState, now: Date): boolean {
  if (s.enabled || s.answer === 'denied' || s.answer === 'allowed' || s.asks >= MAX_ASKS) return false;
  if (s.asks === 0 || !s.lastAskedAt) return true;
  return daysBetween(dayKey(new Date(s.lastAskedAt)), dayKey(now)) >= SECOND_ASK_DAYS;
}

export const useNotificationPrefs = create<NotificationPrefsState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      enabled: false,
      hour: DEFAULT_HOUR,
      minute: DEFAULT_MINUTE,
      installId: '',
      asks: 0,
      lastAskedAt: null,
      answer: null,
      due: false,
      lastDoneAt: null,
      planned: [],
      history: [],
      tz: null,
      plannedAt: null,
      permission: null,

      setEnabled: (on) => set({ enabled: on }),
      setTime: (hour, minute) => {
        const h = intIn(hour, 0, 23);
        const m = intIn(minute, 0, 59);
        if (h === null || m === null) return;
        set({ hour: h, minute: m });
      },
      noteDone: () => {
        const now = new Date();
        const s = get();
        set({ lastDoneAt: now.toISOString(), due: s.due || mayBecomeDue(s, now) });
      },
      answered: (answer, own) => {
        const s = get();
        set({
          answer,
          due: false,
          ...(own ? { asks: Math.min(MAX_ASKS, s.asks + 1), lastAskedAt: new Date().toISOString() } : null),
        });
      },
      dropDue: () => set({ due: false }),
      settle: (now) => {
        const s = get();
        const t = now.getTime();
        const fired = s.planned.filter((p) => Date.parse(p.at) <= t);
        const cutoff = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - HISTORY_DAYS));
        // One idea a day: a day already in history keeps what it has.
        const days = new Set(s.history.map((h) => h.day));
        const history = [
          ...s.history,
          ...fired.filter((p) => !days.has(p.day)).map(({ id, cat, day, drink }) => ({ id, cat, day, drink })),
        ].filter((h) => h.day >= cutoff);
        if (fired.length === 0 && history.length === s.history.length) return;
        set({ history, planned: s.planned.filter((p) => Date.parse(p.at) > t) });
      },
      setPlan: (planned, tz) => set({ planned, tz, plannedAt: Date.now() }),
      setPermission: (permission) => {
        if (get().permission !== permission) set({ permission });
      },
    }),
    {
      name: 'sipply-ideas.v1',
      storage: createJSONStorage(createGuardedStorage),
      partialize: (s): Persisted => ({
        enabled: s.enabled,
        hour: s.hour,
        minute: s.minute,
        installId: s.installId,
        asks: s.asks,
        lastAskedAt: s.lastAskedAt,
        answer: s.answer,
        due: s.due,
        lastDoneAt: s.lastDoneAt,
        planned: s.planned,
        history: s.history,
        tz: s.tz,
      }),
      /*
       * Read through a check, as store/dexPrefs does: a blob from another
       * build loads as what it can, and anything unreadable falls back to
       * the default. The install id is made here when there is none, so
       * it exists from the first plan and never changes after.
       */
      merge: (saved, current) => {
        const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof Persisted, unknown>>;
        return {
          ...current,
          enabled: s.enabled === true,
          hour: intIn(s.hour, 0, 23) ?? DEFAULT_HOUR,
          minute: intIn(s.minute, 0, 59) ?? DEFAULT_MINUTE,
          installId: isString(s.installId) && s.installId ? s.installId : current.installId || Crypto.randomUUID(),
          asks: intIn(s.asks, 0, MAX_ASKS) ?? 0,
          lastAskedAt: isString(s.lastAskedAt) ? s.lastAskedAt : null,
          answer: ANSWERS.find((a) => a === s.answer) ?? null,
          due: s.due === true,
          lastDoneAt: isString(s.lastDoneAt) ? s.lastDoneAt : null,
          planned: listOf(s.planned, plannedOf),
          history: listOf(s.history, sentOf),
          tz: isString(s.tz) ? s.tz : null,
          hydrated: true,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        /*
         * The failure path never reaches merge. Marked hydrated so the app
         * works this session (the write is refused by the guarded storage,
         * so nothing saved is overwritten); an install id for this session
         * only, since the saved one could not be read.
         */
        if (error) {
          useNotificationPrefs.setState({
            hydrated: true,
            installId: useNotificationPrefs.getState().installId || Crypto.randomUUID(),
          });
        }
      },
    },
  ),
);

/**
 * Whether the app may put the ask up by itself now (§3.2 rule 3): it is
 * due, iOS has not refused, daily ideas are off, and the ask count and
 * the second ask's wait allow it.
 */
export function mayAsk(
  s: NotificationPrefsState,
  permission: NotificationsPermission,
  now: Date = new Date(),
): boolean {
  if (!s.due || permission === 'denied' || !mayBecomeDue(s, now)) return false;
  // The second ask: something new happened after the first.
  if (s.asks >= 1 && s.lastAskedAt && (!s.lastDoneAt || s.lastDoneAt <= s.lastAskedAt)) return false;
  return true;
}
