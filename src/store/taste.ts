import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getDrink } from '@/data';
import type { Json } from '@/lib/database.types';
import { createGuardedStorage } from '@/lib/guardedStorage';
import { supabase } from '@/lib/supabase';
import { isPlaceholderUsername, onAccountDeleted, useAuth } from '@/store/auth';

/* ==================================================================== */
/* Your tastes: the onboarding answers, the picks, and saved drinks     */
/*                                                                      */
/* specs/v4.1-changes.md §3. One store for what the first run asks and  */
/* what it gives back: the answers (they drive lib/recommend), the six  */
/* picks the results step showed, and the saved drinks, which its       */
/* "Save" key and the bookmark on every drink's page fill, and the      */
/* Saved tab shows. Saved drinks are NOT the Dex: the Dex is the drinks */
/* you have had. They are bookmarks, any drink, caught or not; catching */
/* one leaves it saved (Jan, 13 Oct 2026: saving drinks to find them    */
/* quickly, where it had been a want-to-try list the Dex pruned).       */
/*                                                                      */
/* THE PHONE'S FIRST, THE ACCOUNT'S WHEN THERE IS ONE. Everything here  */
/* works signed out and is kept on the phone (createGuardedStorage, so  */
/* nothing is written before the saved copy has been read). Once a      */
/* session exists, the answers and the list are kept with the account   */
/* too (migration 022: taste_profiles and want_to_try), so they follow  */
/* a person to a new phone. Nothing is ever sent while signed out, and  */
/* nothing before an account exists.                                    */
/*                                                                      */
/* BEFORE 022 IS APPLIED the server answers a missing table (PGRST205,  */
/* 42P01): the store marks the feature unsupported for this runtime and */
/* keeps the local copy, with no error anywhere. The next launch asks   */
/* again, so applying the migration needs no new build.                 */
/*                                                                      */
/* WHO THE LOCAL COPY BELONGS TO. `syncedFor` is the account the copy   */
/* was last tied to. Get started clears it (the answers belong to       */
/* whoever is on the phone, and go to the account they make). A session */
/* for a different account clears the answers, picks and list first, so */
/* a second account on the phone never inherits the first's.            */
/*                                                                      */
/* THE UNDER-AGE LOCK SURVIVES EVERYTHING. "No, not yet" keeps only     */
/* underAgeUntil, for 24 hours (spec §11). Account deletion resets the  */
/* store to new except that field, so deleting a just-made account is   */
/* not a way round the lock.                                            */
/*                                                                      */
/* THE DEX'S FRONTS (v4.2 §2.2). The For-you Dex opens each section on  */
/* the recommender's best 12 for these answers. That is up to six       */
/* recommend() runs (budgeted at 120 ms on an iPhone 12), so they are   */
/* worked when the answers change, never when the Dex draws, and kept   */
/* here as `dexFronts`, stamped with the answers and the catalogue they */
/* were worked for. lib/recommend provides the worker                   */
/* (provideDexFronts): this module cannot import it, because it imports */
/* this one. They are worked in the persist migrate, once, for answers  */
/* from before v4.2; beside the picks at the first run's pour and at a  */
/* retake's (setPicks); and by the subscriber, at an idle moment, when  */
/* the answers change after the first run (Settings, another phone's    */
/* answers through firstSync). Answers with no flavour and no spirit    */
/* (Clear your tastes) drop them at once. Never inside a render.        */
/* ==================================================================== */

export type Goal = 'discover' | 'track' | 'home' | 'friends';
export type Spirit = 'gin' | 'rum' | 'agave' | 'whiskey' | 'vodka' | 'brandy' | 'liqueur';
export type Flavour = 'refreshing' | 'sour' | 'fruity' | 'sweet' | 'bitter' | 'strong' | 'creamy';
export type StyleOf = 'whiskey' | 'rum' | 'agave';
export type HomeAnswer = 'never' | 'sometimes' | 'often';
export type HeardFrom = 'friend' | 'instagram' | 'tiktok' | 'app-store' | 'facebook' | 'google' | 'other';
export type OnboardingStep =
  | 'welcome' | 'hello' | 'age' | 'underage' | 'heard' | 'dexintro' | 'usually' | 'spirits'
  | 'followup' | 'flavours' | 'home' | 'bar' | 'pour' | 'results' | 'allset' | 'signin';

export interface TasteAnswers {
  v: 1;
  goal: Goal | null; // always null in v4.1 (no question asks it)
  drinks: 'cocktails' | 'spirits' | 'both' | null;
  spirits: Spirit[]; // tap order, ≤ 5
  styleOf: StyleOf | null;
  styles: string[]; // STYLES[styleOf] keys
  flavours: Flavour[]; // ≤ 3
  home: HomeAnswer | null;
  bar: string[]; // barIndex ingredient ids ticked at the bar step's Continue
}

export const EMPTY_ANSWERS: TasteAnswers = {
  v: 1,
  goal: null,
  drinks: null,
  spirits: [],
  styleOf: null,
  styles: [],
  flavours: [],
  home: null,
  bar: [],
};

export const WANT_TO_TRY_MAX = 200;
export const UNDER_AGE_LOCK_MS = 24 * 60 * 60 * 1000;

/** One For-you section's front: its key and the recommender's best drinks for it, in order. */
export type DexFrontSection =
  | { kind: 'flavour'; key: Flavour; ids: string[] }
  | { kind: 'spirit'; key: Spirit; ids: string[] };

/**
 * The For-you Dex's section fronts (v4.2 §2.2), as lib/dexOrder's
 * computeDexFronts works them out. `forAnswers` is the stable key of
 * what they were worked for (the answers, tasteTags' catalogue and scorer
 * stamp, and the photo set): when it is no longer the key of the current
 * answers, they are worked out again.
 */
export interface DexFronts {
  forAnswers: string;
  sections: DexFrontSection[];
}

export interface TasteState {
  hydrated: boolean;
  answers: TasteAnswers;
  step: OnboardingStep; // resume point (first-run only)
  ageOk: boolean;
  underAgeUntil: number | null;
  picks: string[]; // the six shown on results, in order
  saved: string[]; // saved drinks (bookmarks), NEWEST FIRST, ≤ 200, catalogue ids only, caught or not
  heardFrom: HeardFrom | null;
  done: boolean; // first-run finished (allset passed, Not now, or signed in)
  syncedFor: string | null; // account the local copy belongs to
  dexFronts: DexFronts | null; // the For-you Dex's section fronts; null without a flavour or a spirit
  signInFirst: boolean; // NOT persisted: "I already have an account" this runtime

  setAnswers: (patch: Partial<Omit<TasteAnswers, 'v'>>) => void;
  setStep: (step: OnboardingStep) => void;
  startFirstRun: () => void; // Get started: syncedFor = null (these answers belong to whoever is on the phone)
  confirmAge: () => void;
  refuseAge: (now?: number) => void;
  setHeardFrom: (v: HeardFrom | null) => void;
  setPicks: (ids: string[]) => void;
  toggleSaved: (id: string) => boolean; // returns the new state; refuses an add at the cap (returns false)
  setSaved: (id: string, on: boolean) => void;
  chooseSignIn: () => void; // signInFirst = true
  finish: () => void; // done = true, step = 'welcome'
  clearAnswers: () => void; // answers = EMPTY_ANSWERS, picks = [] (saved kept)
}

/* ==================================================================== */
/* Shapes, checked                                                      */
/*                                                                      */
/* Everything that comes in (a persisted blob, a server row, a patch)   */
/* passes through these, so the store only ever holds answers the       */
/* recommender can read. Kept here rather than read from lib/recommend: */
/* that module imports this one, and the reverse would be a cycle.      */
/* ==================================================================== */

const GOALS: readonly Goal[] = ['discover', 'track', 'home', 'friends'];
const DRINK_KINDS: readonly NonNullable<TasteAnswers['drinks']>[] = ['cocktails', 'spirits', 'both'];
const SPIRIT_KEYS: readonly Spirit[] = ['gin', 'rum', 'agave', 'whiskey', 'vodka', 'brandy', 'liqueur'];
const FLAVOUR_KEYS: readonly Flavour[] = ['refreshing', 'sour', 'fruity', 'sweet', 'bitter', 'strong', 'creamy'];
const HOME_ANSWERS: readonly HomeAnswer[] = ['never', 'sometimes', 'often'];
const HEARD: readonly HeardFrom[] = ['friend', 'instagram', 'tiktok', 'app-store', 'facebook', 'google', 'other'];
/** The follow-up's keys, as lib/recommendCore's STYLES has them. */
const STYLE_KEYS: Record<StyleOf, readonly string[]> = {
  whiskey: ['bourbon', 'rye', 'scotch', 'irish', 'japanese'],
  rum: ['white', 'aged', 'agricole', 'spiced'],
  agave: ['blanco', 'reposado', 'anejo', 'mezcal'],
};
const STEPS: readonly OnboardingStep[] = [
  'welcome', 'hello', 'age', 'underage', 'heard', 'dexintro', 'usually', 'spirits',
  'followup', 'flavours', 'home', 'bar', 'pour', 'results', 'allset', 'signin',
];
const SPIRITS_MAX = 5;
const FLAVOURS_MAX = 3;
const BAR_MAX = 64;
/** A catalogue or bar-index id: the shape migration 022 checks drink_id against. */
const ID_SHAPE = /^[a-z0-9][a-z0-9-]{0,79}$/;

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;

/** The valid members of `v`, once each, in order, at most `max`. */
function listOf<T extends string>(v: unknown, ok: (x: string) => boolean, max: number): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    if (typeof x === 'string' && ok(x) && !out.includes(x as T)) out.push(x as T);
    if (out.length >= max) break;
  }
  return out;
}

/** The follow-up a list of spirits asks: the first of whiskey, rum and agave, in tap order. */
function styleOfFor(spirits: readonly Spirit[]): StyleOf | null {
  return (spirits.find((s) => s === 'whiskey' || s === 'rum' || s === 'agave') as StyleOf | undefined) ?? null;
}

/** Any value, read as answers; anything unusable is left at its empty value. */
function parseAnswers(raw: unknown): TasteAnswers {
  const a = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const spirits = listOf<Spirit>(a.spirits, (x) => oneOf(SPIRIT_KEYS, x) !== null, SPIRITS_MAX);
  const styleOf = oneOf<StyleOf>(['whiskey', 'rum', 'agave'], a.styleOf);
  return {
    v: 1,
    goal: oneOf(GOALS, a.goal),
    drinks: oneOf(DRINK_KINDS, a.drinks),
    spirits,
    styleOf: styleOf && spirits.includes(styleOf) ? styleOf : null,
    styles: styleOf ? listOf(a.styles, (x) => STYLE_KEYS[styleOf].includes(x), STYLE_KEYS[styleOf].length) : [],
    flavours: listOf<Flavour>(a.flavours, (x) => oneOf(FLAVOUR_KEYS, x) !== null, FLAVOURS_MAX),
    home: oneOf(HOME_ANSWERS, a.home),
    bar: listOf(a.bar, (x) => ID_SHAPE.test(x), BAR_MAX),
  };
}

/** Catalogue drink ids only, once each, at most `max`. */
const drinkIds = (v: unknown, max: number) => listOf<string>(v, (x) => getDrink(x) !== undefined, max);

/** True when anything was answered. */
export function hasAnswers(a: TasteAnswers): boolean {
  return (
    a.goal !== null ||
    a.drinks !== null ||
    a.spirits.length > 0 ||
    a.styles.length > 0 ||
    a.flavours.length > 0 ||
    a.home !== null ||
    a.bar.length > 0
  );
}

const SPIRIT_WORD: Record<Spirit, string> = {
  gin: 'gin',
  rum: 'rum',
  agave: 'tequila',
  whiskey: 'whiskey',
  vodka: 'vodka',
  brandy: 'brandy',
  liqueur: 'liqueurs',
};

const FLAVOUR_WORD: Record<Flavour, string> = {
  refreshing: 'refreshing',
  sour: 'sour',
  fruity: 'fruity',
  sweet: 'sweet',
  bitter: 'bitter',
  strong: 'strong',
  creamy: 'creamy',
};

const sentence = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * The answers in one line, for Settings → Your tastes: "Gin, whiskey ·
 * bitter, strong". The spirits and the flavours when there are any; else
 * what you drink, else whether you make drinks at home. Null when nothing
 * was answered.
 */
export function tasteSummary(a: TasteAnswers): string | null {
  if (!hasAnswers(a)) return null;
  const parts = [
    a.spirits.map((s) => SPIRIT_WORD[s]).join(', '),
    a.flavours.map((f) => FLAVOUR_WORD[f]).join(', '),
  ].filter(Boolean);
  if (parts.length > 0) return sentence(parts.join(' · '));
  if (a.drinks) {
    return a.drinks === 'cocktails' ? 'Cocktails' : a.drinks === 'spirits' ? 'Spirits, neat or on ice' : 'Cocktails and spirits';
  }
  if (a.home) {
    return a.home === 'never' ? 'You don’t make drinks at home' : `You make drinks at home ${a.home}`;
  }
  if (a.bar.length > 0) return `${a.bar.length} ${a.bar.length === 1 ? 'bottle' : 'bottles'} in your bar`;
  return null;
}

/** True while a "No, not yet" from the last 24 hours stands. */
export function underAgeActive(now: number = Date.now()): boolean {
  const until = useTaste.getState().underAgeUntil;
  return until !== null && now < until;
}

/* ==================================================================== */
/* The store                                                            */
/* ==================================================================== */

/** Everything a new phone starts with, except the under-age lock, which the caller keeps. */
const FRESH = {
  answers: EMPTY_ANSWERS,
  step: 'welcome' as OnboardingStep,
  ageOk: false,
  picks: [] as string[],
  saved: [] as string[],
  heardFrom: null as HeardFrom | null,
  done: false,
  syncedFor: null as string | null,
  signInFirst: false,
  dexFronts: null as DexFronts | null,
};

type Persisted = Pick<
  TasteState,
  'answers' | 'step' | 'ageOk' | 'underAgeUntil' | 'picks' | 'saved' | 'heardFrom' | 'done' | 'syncedFor' | 'dexFronts'
>;

/* ==================================================================== */
/* The Dex's fronts: the worker, and when it runs                       */
/* ==================================================================== */

/**
 * What lib/recommend hands this store at its module foot (provideDexFronts):
 * the key the fronts for some answers would carry, cheap, and the fronts
 * themselves, which cost up to six recommend() runs.
 */
export interface DexFrontsWorker {
  key: (answers: TasteAnswers) => string;
  compute: (answers: TasteAnswers) => DexFronts | null;
}

let frontsWorker: DexFrontsWorker | null = null;

/**
 * Whether these answers make a For-you Dex at all: a flavour or a spirit
 * (v4.2 §2.1; lib/dexOrder's sectionKeys reads them the same way).
 * Without one there are no fronts, and nothing to work out.
 */
const asksForYou = (a: TasteAnswers) => a.flavours.length > 0 || a.spirits.length > 0;

/** The key these answers' fronts would carry, or null when they make none (or no worker has come yet). */
function frontsKeyFor(a: TasteAnswers): string | null {
  return frontsWorker && asksForYou(a) ? frontsWorker.key(a) : null;
}

/**
 * The fronts for these answers, or null. A worker that throws leaves null
 * rather than breaking what called it (a hydration, an idle task): the Dex
 * is then By number, and the next change of answers tries again.
 */
function frontsFor(a: TasteAnswers): DexFronts | null {
  if (!frontsWorker || !asksForYou(a)) return null;
  try {
    return frontsWorker.compute(a);
  } catch {
    return null;
  }
}

/** A section's front is at most this long: lib/dexOrder's FRONT, six rows of two (check-recommend compares them). */
const FRONT_MAX = 12;

/** Stored fronts, checked: all flavour or all spirit sections, once each; catalogue ids, once each, FRONT_MAX at most. */
function parseFronts(raw: unknown): DexFronts | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { forAnswers?: unknown; sections?: unknown };
  if (typeof r.forAnswers !== 'string' || !Array.isArray(r.sections)) return null;
  const sections: DexFrontSection[] = [];
  for (const x of r.sections.slice(0, SPIRITS_MAX)) {
    if (!x || typeof x !== 'object') continue;
    const { kind, key, ids } = x as { kind?: unknown; key?: unknown; ids?: unknown };
    // The sections are all flavours or all spirits, once each (lib/dexOrder sectionKeys).
    if (sections.length > 0 && sections[0]!.kind !== kind) continue;
    if (sections.some((s) => s.key === key)) continue;
    const list = drinkIds(ids, FRONT_MAX);
    const f = kind === 'flavour' ? oneOf(FLAVOUR_KEYS, key) : null;
    const sp = kind === 'spirit' ? oneOf(SPIRIT_KEYS, key) : null;
    if (f) sections.push({ kind: 'flavour', key: f, ids: list });
    else if (sp) sections.push({ kind: 'spirit', key: sp, ids: list });
  }
  return { forAnswers: r.forAnswers, sections };
}

/** True while the stored fronts were worked for other answers, or another catalogue. */
function frontsStale(s: Pick<TasteState, 'answers' | 'dexFronts'>): boolean {
  if (!frontsWorker) return false;
  return (s.dexFronts?.forAnswers ?? null) !== frontsKeyFor(s.answers);
}

/** Works the fronts out now if they are stale. Synchronous: only ever called from a timer or an idle task. */
function refreshDexFronts() {
  const s = useTaste.getState();
  if (!s.hydrated || !frontsStale(s)) return;
  useTaste.setState({ dexFronts: frontsFor(s.answers) });
}

/*
 * The answers settle before the fronts are worked: a retake writes its
 * answers step by step, and only the last of them matters. Then an idle
 * moment, so the 120 ms never lands on a tap, a push or a scroll.
 */
const FRONTS_SETTLE_MS = 1200;
const FRONTS_IDLE_TIMEOUT_MS = 2000;
let frontsTimer: ReturnType<typeof setTimeout> | null = null;
let frontsIdle: number | null = null;

function cancelFronts() {
  if (frontsTimer) clearTimeout(frontsTimer);
  frontsTimer = null;
  if (frontsIdle !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(frontsIdle);
  frontsIdle = null;
}

function scheduleFronts(settleMs: number) {
  cancelFronts();
  frontsTimer = setTimeout(() => {
    frontsTimer = null;
    // `expo export` runs this module in Node, which has no idle callbacks.
    if (typeof requestIdleCallback !== 'function') {
      refreshDexFronts();
      return;
    }
    frontsIdle = requestIdleCallback(
      () => {
        frontsIdle = null;
        refreshDexFronts();
      },
      { timeout: FRONTS_IDLE_TIMEOUT_MS },
    );
  }, settleMs);
}

/**
 * lib/recommend's worker, handed over at its module foot. That module is
 * reached from the root layout (FirstRun, then the flow), so it is here
 * before the saved copy has been read, and the migrate can use it. If it
 * ever came later, the fronts are worked as soon as it does.
 */
export function provideDexFronts(worker: DexFrontsWorker): void {
  frontsWorker = worker;
  const s = useTaste.getState();
  if (s.hydrated && frontsStale(s)) scheduleFronts(0);
}

export const useTaste: UseBoundStore<StoreApi<TasteState>> = create<TasteState>()(
  persist(
    (set, get): TasteState => ({
      ...FRESH,
      hydrated: false,
      underAgeUntil: null,

      setAnswers: (patch) => {
        const prev = get().answers;
        const next = parseAnswers({ ...prev, ...patch });
        /*
         * The follow-up belongs to the spirits: it is the first of whiskey,
         * rum and agave in tap order (v4.1 §1.2). An explicit styleOf is
         * kept when it is one of the spirits; otherwise it is worked out
         * here, so a spirits patch can never leave a follow-up for a spirit
         * that was unticked. When the follow-up changes, its old ticks go
         * with it, unless the same patch sets new ones.
         */
        const asked = 'styleOf' in patch && next.styleOf !== null ? next.styleOf : styleOfFor(next.spirits);
        next.styleOf = asked;
        if (asked === null) next.styles = [];
        else if (asked !== prev.styleOf && !('styles' in patch)) next.styles = [];
        else next.styles = next.styles.filter((s) => STYLE_KEYS[asked].includes(s));
        set({ answers: next });
      },

      setStep: (step) => {
        if (oneOf(STEPS, step)) set({ step });
      },

      startFirstRun: () => set({ syncedFor: null }),

      confirmAge: () => set({ ageOk: true }),

      /*
       * "No, not yet": nothing is kept but the lock (spec §11). The saved
       * drinks stay, because they were saved before this run.
       */
      refuseAge: (now = Date.now()) =>
        set({
          underAgeUntil: now + UNDER_AGE_LOCK_MS,
          ageOk: false,
          answers: EMPTY_ANSWERS,
          picks: [],
          heardFrom: null,
          step: 'welcome',
          dexFronts: null,
        }),

      setHeardFrom: (v) => set({ heardFrom: v === null ? null : oneOf(HEARD, v) }),

      setPicks: (ids) => set({ picks: drinkIds(ids, 24) }),

      /*
       * Newest first. An add is refused (false) for an id the catalogue
       * does not know, and at the cap. A drink already in the Dex is saved
       * like any other: these are bookmarks, and the server's table has no
       * Dex rule either (the Dex is on the phone).
       */
      toggleSaved: (id) => {
        const { saved } = get();
        if (saved.includes(id)) {
          set({ saved: saved.filter((x) => x !== id) });
          return false;
        }
        if (getDrink(id) === undefined || saved.length >= WANT_TO_TRY_MAX) return false;
        set({ saved: [id, ...saved] });
        return true;
      },

      setSaved: (id, on) => {
        if (get().saved.includes(id) !== on) get().toggleSaved(id);
      },

      chooseSignIn: () => set({ signInFirst: true }),

      finish: () => set({ done: true, step: 'welcome' }),

      /*
       * Settings → Clear your tastes. The answers and the picks they made
       * go, and so does "How did you hear", which is an answer too; the
       * saved drinks stay, as the confirm says. The sync then writes
       * the account's answers as {}.
       */
      clearAnswers: () => set({ answers: EMPTY_ANSWERS, picks: [], heardFrom: null, dexFronts: null }),
    }),
    {
      name: 'sipply-taste.v1',
      storage: createJSONStorage(createGuardedStorage),
      /*
       * 2 since v4.2 (the fronts). Every blob before it was written at
       * persist's default version, 0, because the store named none: the
       * shape the name calls v1. A build from before v4.2 has no migrate,
       * so it reads a version-2 blob as nothing (a TestFlight downgrade
       * starts the phone's copy over; an account's answers and saved
       * drinks come back from the server at its first sync).
       */
      version: 2,
      partialize: (s): Persisted => ({
        answers: s.answers,
        step: s.step,
        ageOk: s.ageOk,
        underAgeUntil: s.underAgeUntil,
        picks: s.picks,
        saved: s.saved,
        heardFrom: s.heardFrom,
        done: s.done,
        syncedFor: s.syncedFor,
        dexFronts: s.dexFronts,
      }),
      /*
       * v1 → v2 (v4.2 §2.2): answers given before the Dex had a For-you
       * order get their fronts here, once, while the splash is up, so the
       * first Dex after the update already opens on them. Everything else
       * in the blob is left for merge to check, as before.
       */
      migrate: (saved) => {
        const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
        return { ...s, dexFronts: frontsFor(parseAnswers(s.answers)) };
      },
      /*
       * `hydrated` is set here, as store/bar does, so marking it costs no
       * write. Every field is read through its check: a blob from a future
       * build, or one a catalogue edit has outdated, loads as what it can,
       * and an id getDrink no longer knows is dropped from the picks and
       * the list rather than drawn as a blank row.
       *
       * Resume (v4.1 §1.2): a kill mid-flow comes back to its step only
       * while the age was answered yes; the stop screen comes back as the
       * welcome, and the reveal as the picks it had made.
       */
      merge: (saved, current) => {
        const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof Persisted, unknown>>;
        const ageOk = s.ageOk === true;
        const picks = drinkIds(s.picks, 24);
        let step = oneOf(STEPS, s.step) ?? 'welcome';
        if (!ageOk || step === 'underage') step = 'welcome';
        else if (step === 'pour' && picks.length > 0) step = 'results';
        const until = typeof s.underAgeUntil === 'number' && Number.isFinite(s.underAgeUntil) ? s.underAgeUntil : null;
        return {
          ...current,
          answers: parseAnswers(s.answers),
          step,
          ageOk,
          underAgeUntil: until,
          picks,
          saved: drinkIds(s.saved, WANT_TO_TRY_MAX),
          heardFrom: oneOf(HEARD, s.heardFrom),
          done: s.done === true,
          syncedFor: typeof s.syncedFor === 'string' ? s.syncedFor : null,
          dexFronts: parseFronts(s.dexFronts),
          hydrated: true,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        // The failure path never reaches merge. This write is refused by the guarded storage.
        if (error) useTaste.setState({ hydrated: true });
        afterHydrate();
        /*
         * Fronts from a build with another catalogue or scorer (the stamp
         * in their key moved): worked again at the first idle moment. The
         * Dex draws the stored ones until then, skipping what is gone.
         */
        if (frontsStale(useTaste.getState())) scheduleFronts(0);
      },
    },
  ),
);

/* ==================================================================== */
/* Sync with the account (v4.1 §3.4)                                    */
/* ==================================================================== */

/** Postgres's undefined_table, or PostgREST's "not in the schema cache": 022 is not applied. */
function isMissingRelation(e: { code?: string; message?: string } | null | undefined): boolean {
  return (
    !!e &&
    (e.code === '42P01' ||
      e.code === 'PGRST205' ||
      /does not exist|could not find the table/i.test(e.message ?? ''))
  );
}

/** want_to_try's cap trigger. The local cap is the same, so this is a race, and ignored. */
const isListFull = (e: { message?: string } | null | undefined) => /want_to_try_full/.test(e?.message ?? '');

/** False once the server has said 022's tables are missing. Reset by the next launch. */
let supported = true;

/** The account whose first sync this runtime has run (or is running). */
let syncedUid: string | null = null;
/** The account a session arrived for, while waiting for the store to load or for the under-age check. */
let arrivedUid: string | null = null;
/** What the server holds after the last read or write: the list, and the answers as sent. */
let serverSaved: Set<string> | null = null;
let serverAnswers: string | null = null;
let serverHeard: HeardFrom | null = null;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Failed tries in a row, for the back-off; back to 0 after any success. */
let failures = 0;
/** One request at a time: a push waits for the one before it. */
let queue: Promise<void> = Promise.resolve();

const PUSH_DELAY_MS = 2000;
/*
 * A failed sync or push (offline, a timeout) is tried again after 20 s,
 * then 40 s, then 80 s, then left for the next change, session or launch.
 * Without it, an edit made just before the connection dropped would wait
 * for the next launch, where the server's older answers would win.
 */
const RETRY_BASE_MS = 20_000;
const RETRY_MAX = 3;

const sessionUid = () => useAuth.getState().session?.user.id ?? null;
const answersKey = (a: TasteAnswers) => JSON.stringify(hasAnswers(a) ? a : {});

function forgetSync() {
  if (pushTimer) clearTimeout(pushTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pushTimer = null;
  retryTimer = null;
  failures = 0;
  syncedUid = null;
  arrivedUid = null;
  serverSaved = null;
  serverAnswers = null;
  serverHeard = null;
}

/** Runs `job` after every request already queued, swallowing its failure (the caller schedules the retry). */
function enqueue(job: () => Promise<void>): Promise<void> {
  queue = queue.then(job).catch(() => undefined);
  return queue;
}

/** After a failure that is not the missing migration: try `again` later, a few times. */
function retryLater(again: () => void) {
  if (!supported || failures >= RETRY_MAX) return;
  failures += 1;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    again();
  }, RETRY_BASE_MS * 2 ** (failures - 1));
}

/**
 * Writes the answers row. An update first, then an insert if there was no
 * row: the grants (022) let a client insert user_id but update only the
 * answers and heard_from, and PostgREST's upsert would set every column it
 * was sent, user_id included, which the update grant refuses. A second
 * phone inserting first makes ours a 23505, answered by updating.
 */
async function writeProfile(uid: string, answers: TasteAnswers, heard: HeardFrom | null, sendHeard: boolean) {
  const payload: { answers: Json; heard_from?: HeardFrom | null } = {
    answers: (hasAnswers(answers) ? answers : {}) as unknown as Json,
  };
  if (sendHeard) payload.heard_from = heard;
  const update = () => supabase.from('taste_profiles').update(payload).eq('user_id', uid).select('user_id');
  const first = await update();
  if (first.error) throw first.error;
  if ((first.data ?? []).length > 0) return;
  const inserted = await supabase.from('taste_profiles').insert({ user_id: uid, ...payload });
  if (!inserted.error) return;
  if (inserted.error.code !== '23505') throw inserted.error;
  const again = await update();
  if (again.error) throw again.error;
}

async function insertSaved(uid: string, ids: readonly string[]) {
  if (ids.length === 0) return;
  // Oldest first, so the server's clock orders them as the phone does (022 stamps each row with clock_timestamp()).
  const rows = [...ids].reverse().map((drink_id) => ({ user_id: uid, drink_id }));
  const { error } = await supabase
    .from('want_to_try')
    .upsert(rows, { onConflict: 'user_id,drink_id', ignoreDuplicates: true });
  if (error && !isListFull(error)) throw error;
}

/** True while `uid` is still the signed-in account and the feature is on. */
const current = (uid: string) => supported && sessionUid() === uid;

/**
 * The first sync for an account, on a session's arrival and at launch with
 * one restored: read both tables, let the server's answers win when it has
 * any, merge the lists (the server's order first, then the phone's own),
 * and send what only the phone had.
 */
async function firstSync(uid: string) {
  const [row, list] = await Promise.all([
    supabase.from('taste_profiles').select('answers, heard_from').eq('user_id', uid).maybeSingle(),
    supabase
      .from('want_to_try')
      .select('drink_id, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(WANT_TO_TRY_MAX),
  ]);
  if (isMissingRelation(row.error) || isMissingRelation(list.error)) {
    supported = false;
    return;
  }
  if (row.error) throw row.error;
  if (list.error) throw list.error;
  if (!current(uid)) return;

  /* ---- Answers ---- */
  const local = useTaste.getState();
  const raw = row.data?.answers;
  const fromServer =
    raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { v?: unknown }).v === 1 ? parseAnswers(raw) : null;
  const heardOnServer = oneOf(HEARD, row.data?.heard_from);
  const serverWins = fromServer !== null && hasAnswers(fromServer);
  // "How did you hear" follows the answers: the winner's when it has one, else the other side's.
  const heard = serverWins ? (heardOnServer ?? local.heardFrom) : (local.heardFrom ?? heardOnServer);
  if (serverWins) {
    useTaste.setState({ answers: fromServer, heardFrom: heard });
    serverAnswers = answersKey(fromServer);
    serverHeard = heardOnServer;
  } else {
    if (heard !== local.heardFrom) useTaste.setState({ heardFrom: heard });
    if (hasAnswers(local.answers)) {
      await writeProfile(uid, local.answers, heard, heard !== heardOnServer);
      serverAnswers = answersKey(local.answers);
      serverHeard = heard;
    } else {
      // No row, {} and an empty v1 object all mean "nothing answered": nothing to send yet.
      serverAnswers = answersKey(EMPTY_ANSWERS);
      serverHeard = heardOnServer;
    }
  }
  if (!current(uid)) return;

  /* ---- Saved drinks ---- */
  const onServer = (list.data ?? []).map((r) => r.drink_id);
  const known = new Set(onServer);
  /** The server's order first, then the phone's own; catalogue drinks, caught or not, 200 at most. */
  const union = (phone: readonly string[]) =>
    [...onServer, ...phone.filter((id) => !known.has(id))]
      .filter((id, i, all) => all.indexOf(id) === i && getDrink(id) !== undefined)
      .slice(0, WANT_TO_TRY_MAX);
  const kept = new Set(union(useTaste.getState().saved));
  const toSend = useTaste.getState().saved.filter((id) => !known.has(id) && kept.has(id));
  await insertSaved(uid, toSend);
  if (!current(uid)) return;
  serverSaved = new Set([...onServer, ...toSend]);
  // Read again: a drink saved or taken off while the request was out is kept, and the push sends it.
  useTaste.setState({ saved: union(useTaste.getState().saved), syncedFor: uid });
  /*
   * A drink on the server that the catalogue lost was left out above;
   * the push removes it there too.
   */
  schedulePush();
}

/** Every change after the first sync, debounced: the answers as one write, the list as a diff. */
async function push(uid: string) {
  if (!current(uid) || syncedUid !== uid || serverSaved === null) return;
  const s = useTaste.getState();

  const key = answersKey(s.answers);
  if (key !== serverAnswers || s.heardFrom !== serverHeard) {
    await writeProfile(uid, s.answers, s.heardFrom, s.heardFrom !== serverHeard);
    serverAnswers = key;
    serverHeard = s.heardFrom;
  }
  if (!current(uid)) return;

  const now = new Set(s.saved);
  // Removals first, so a full list has room for what replaces them.
  const removed = [...serverSaved].filter((id) => !now.has(id));
  if (removed.length > 0) {
    const { error } = await supabase.from('want_to_try').delete().eq('user_id', uid).in('drink_id', removed);
    if (error) throw error;
    for (const id of removed) serverSaved.delete(id);
  }
  if (!current(uid)) return;
  const added = s.saved.filter((id) => !serverSaved!.has(id));
  if (added.length > 0) {
    await insertSaved(uid, added);
    for (const id of added) serverSaved.add(id);
  }
}

function schedulePush() {
  const uid = sessionUid();
  if (!uid || !supported || syncedUid !== uid || serverSaved === null) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void enqueue(async () => {
      try {
        await push(uid);
        failures = 0;
      } catch (e) {
        if (isMissingRelation(e as { code?: string; message?: string })) supported = false;
        else retryLater(schedulePush);
        throw e;
      }
    });
  }, PUSH_DELAY_MS);
}

/**
 * The first sync, once it may run: the store has loaded, a session is
 * here, and its profile row has been read. The profile first, because both
 * tables hang off it (a write before handle_new_user's row would be a
 * foreign-key refusal), and because it says whether this is a brand-new
 * account made inside the under-age lock: AuthGate deletes that one, so
 * nothing of this phone's is ever sent to it. A failed sync is tried again
 * when the profile is next read, or at the next session.
 */
function maybeFirstSync() {
  const uid = arrivedUid;
  if (!uid || syncedUid === uid || !useTaste.getState().hydrated || sessionUid() !== uid) return;
  const profile = useAuth.getState().profile;
  if (!profile || profile.id !== uid) return;
  if (underAgeActive() && isPlaceholderUsername(profile.username)) return;
  syncedUid = uid;
  if (!supported) return;
  void enqueue(async () => {
    try {
      await firstSync(uid);
      failures = 0;
    } catch (e) {
      if (syncedUid === uid) syncedUid = null;
      if (isMissingRelation(e as { code?: string; message?: string })) supported = false;
      // Anything else (offline): again shortly, and at the next profile read, session or launch.
      else retryLater(maybeFirstSync);
      throw e;
    }
  });
}

/**
 * A session arrived (any way in, or restored at launch). The first run is
 * over; the local copy belongs to this account from now on, and if it was
 * another account's, it is cleared first (the lock stays). Then the sync.
 */
function sessionArrived(uid: string) {
  arrivedUid = uid;
  const s = useTaste.getState();
  if (!s.hydrated) return; // afterHydrate picks it up
  const patch: Partial<TasteState> = { done: true, step: 'welcome', signInFirst: false, syncedFor: uid };
  if (s.syncedFor !== null && s.syncedFor !== uid) {
    Object.assign(patch, { answers: EMPTY_ANSWERS, picks: [], saved: [], heardFrom: null, ageOk: false });
  }
  useTaste.setState(patch);
  maybeFirstSync();
}

/** The store has loaded: take a session that arrived before it. */
function afterHydrate() {
  const uid = sessionUid();
  if (uid) sessionArrived(uid);
}

/* ---- Wiring, at the module's foot (as store/signInFlow does) ---- */

useAuth.subscribe((state, prev) => {
  const uid = state.session?.user.id ?? null;
  const was = prev.session?.user.id ?? null;
  if (uid !== was) {
    // Signed out, or another account: whatever was waiting to be sent was for the last one.
    forgetSync();
    if (uid) sessionArrived(uid);
    return;
  }
  // The profile arriving releases the first sync (maybeFirstSync says why it waits).
  if (uid && state.profile !== prev.profile) maybeFirstSync();
});

/* Answers, "How did you hear" and the list, pushed 2 s after they settle. */
useTaste.subscribe((state, prev) => {
  if (!state.hydrated) return;
  if (state.answers !== prev.answers || state.heardFrom !== prev.heardFrom || state.saved !== prev.saved) {
    schedulePush();
  }
  if (state.answers !== prev.answers || state.picks !== prev.picks || state.done !== prev.done) {
    answersMoved(state, prev);
  }
});

/*
 * The fronts follow the answers. Answers with no flavour and no spirit
 * have none, at once (Clear your tastes, another account's arrival). The
 * first run works them out beside its picks, at the pour, and not at
 * each step on the way there; after it, any change of answers (a retake,
 * the server's answers in firstSync) is worked once they settle.
 */
function answersMoved(state: TasteState, prev: TasteState) {
  if (!asksForYou(state.answers)) {
    cancelFronts();
    if (state.dexFronts !== null) useTaste.setState({ dexFronts: null });
    return;
  }
  if (state.picks !== prev.picks) scheduleFronts(0);
  else if (state.done) scheduleFronts(FRONTS_SETTLE_MS);
}

/*
 * NO PRUNING. Until 13 Oct 2026 a drink that entered the Dex left this
 * list, which made it a want-to-try list. Saved drinks are bookmarks now
 * (the Saved tab), so catching one leaves it saved, and nothing here
 * watches the Dex.
 */

/*
 * Account deletion: back to a new phone's store, so the welcome shows
 * again, except the under-age lock. Nothing is sent: the account is gone.
 */
onAccountDeleted(() => {
  forgetSync();
  cancelFronts();
  const { underAgeUntil } = useTaste.getState();
  useTaste.setState({ ...FRESH, underAgeUntil });
});
