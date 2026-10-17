import { formatCount } from '@/data';
import { CATEGORIES, IDEAS, type CategoryKey, type DailyIdea, type Need, type Opens } from '@/data/dailyIdeas';

/* ==================================================================== */
/* Daily ideas: which message, on which day                             */
/*                                                                      */
/* specs/v4.3/spec.md §3.4, the port of tools/schedule.mjs's plan()     */
/* over the 200 messages in data/dailyIdeas. Pure: no store, no native  */
/* module, no clock but the `now` it is handed, so the same inputs give */
/* the same fortnight on every call. lib/notifications reads the        */
/* phone's state, hands it here, and schedules what comes back.         */
/* scripts/check-ideas.mjs runs this file beside the reference over the */
/* spec's people and fails when the two plan differently.               */
/*                                                                      */
/* WHY A ROLLING FORTNIGHT. iOS keeps at most 64 pending local          */
/* notifications per app, and a message chosen weeks ahead would be     */
/* chosen for a person who no longer exists (they have posted since,    */
/* followed someone, saved a drink). So the plan covers the next 14     */
/* days only and is made again whenever Sipply opens or something       */
/* changes; someone who stops opening the app gets the 14 already       */
/* planned and then nothing, which is what stops it nagging (spec §8,   */
/* question 2).                                                         */
/*                                                                      */
/* DETERMINISTIC. The only randomness is a generator seeded by the      */
/* install id and the calendar day, so replanning ten times a day picks */
/* the same message for the same evening, and two phones do not get the */
/* same message on the same evening.                                    */
/*                                                                      */
/* THE PROMISES (spec §3.1): one a day at most (none more today once    */
/* today's has gone out, whatever the clock does next); never the same  */
/* message within 60 days; never the same drink named within 60 days;   */
/* never the same category two days running; no message whose words    */
/* would be untrue of the person that day ("Post your first drink" to   */
/* someone with posts, "{caught} drinks" to an empty Dex, a collections */
/* line before 023, a tag line before 024 has answered).                */
/*                                                                      */
/* WHERE IT PARTS FROM THE REFERENCE, each on purpose: today is skipped */
/* once today's idea is in the history (a later time set after it      */
/* fired, or a flight west, must not bring a second); what is not known */
/* yet this session (posts, follows: `null`) holds no need, so no line  */
/* guesses; and a drink the catalogue has lost since (an over-the-air   */
/* update) is never named. With everything known, as for the spec's     */
/* people, the two plan the same.                                       */
/* ==================================================================== */

/** Days planned ahead. iOS keeps 64 pending; Sipply holds at most this many of them. */
export const WINDOW_DAYS = 14;
/** A message is not used again until this many days after it was last delivered. */
export const NO_REPEAT_DAYS = 60;
/** How long a delivered message is remembered on the phone. */
export const HISTORY_DAYS = 90;
/** The longest a filled body may be (scripts/check-ideas holds every line to it). */
export const BODY_MAX = 120;
/** Today is planned only while its time is at least this far away. */
const MIN_LEAD_MS = 60_000;

/*
 * The 64 cap is iOS's, for every pending notification of the app. A later
 * kind (a tag push is remote, so it never counts) must still have room.
 */
if (WINDOW_DAYS > 30) throw new Error('WINDOW_DAYS must stay well under the 64 notifications iOS keeps pending');

/**
 * What the planner knows about the person, read on the phone when it
 * plans (lib/notifications readIdeasState). `null` = not known yet (the
 * feed has not loaded this session): a need that depends on it does not
 * hold, so "Post your first drink" never reaches someone whose posts
 * simply have not been read back yet.
 */
export interface IdeasState {
  /** Signed in. Posting, Activity, Find friends and profiles need it. */
  account: boolean;
  /** Drinks in the Dex (catalogue entries caught). */
  caught: number;
  /** Drinks in the catalogue. */
  total: number;
  /** Your own posts; null while unknown. */
  posts: number | null;
  /** Drinks of your own (add-drink). */
  custom: number;
  /** People you follow; null while unknown. */
  following: number | null;
  /** Saved drinks and posts. */
  saved: number;
  /** The first run's answers are there. */
  tastes: boolean;
  /** 023's collections answered, signed in. */
  collectionsLive: boolean;
  /** 024's tags answered by the server, signed in. */
  tagsLive: boolean;
  /** A drink was logged today (local day): today's idea would only repeat it. */
  loggedToday: boolean;
  /** A post was made today. */
  postedToday: boolean;
}

/** A message that was delivered (or is planned): enough to keep the no-repeat promises. */
export interface SentIdea {
  id: string;
  /** Its category, for "never two days running". A string: an older catalogue's may be gone. */
  cat: string;
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** The drink it named (the day's suggestion, or a knowledge line's own), if any. */
  drink: string | null;
}

export interface PlannedIdea extends SentIdea {
  /** Local fire time. */
  at: Date;
  /** Tokens filled. Body only: iOS puts the app's name on the line above it. */
  body: string;
  /** The in-app path a tap opens (lib/notifications routeNotification). */
  url: string;
}

/**
 * What a tap opens, by the message's `opens` (spec §3.7). Paths, not
 * screens: the notification carries the string, so a later push (a tag,
 * spec §2.5) can open any allowed path with no client change.
 */
export const OPENS: Readonly<Record<Opens, string>> = {
  log: '/log',
  addDrink: '/add-drink?from=shelf',
  dex: '/dex',
  drink: '/drink/{id}',
  progress: '/stats',
  saved: '/saved',
  findFriends: '/find-friends',
  home: '/',
  activity: '/activity',
  profile: '/profile',
  tastes: '/settings?open=tastes',
};

/** What each need means (data/dailyIdeas). Unknown counts (null) hold neither "none" nor "some". */
export const NEEDS: Readonly<Record<Need, (s: IdeasState) => boolean>> = {
  empty: (s) => s.caught === 0,
  caught: (s) => s.caught >= 1,
  caught2: (s) => s.caught >= 2,
  account: (s) => s.account,
  noPosts: (s) => s.account && s.posts === 0,
  posted: (s) => (s.posts ?? 0) >= 1,
  noCustom: (s) => s.custom === 0,
  custom: (s) => s.custom >= 1,
  noFollows: (s) => s.account && s.following === 0,
  follows: (s) => (s.following ?? 0) >= 1,
  tastes: (s) => s.tastes,
  noTastes: (s) => !s.tastes,
  saved: (s) => s.saved >= 1,
  collections: (s) => s.account && s.collectionsLive,
  tags: (s) => s.account && (s.following ?? 0) >= 1 && s.tagsLive,
};

/** Categories in the order a tie is broken: the catalogue's own. */
const CATEGORY_ORDER = Object.keys(CATEGORIES) as CategoryKey[];

/**
 * How often each category is drawn, for this state (spec §3.4's table).
 * Jan's two examples lead while they are true of the person: "post your
 * first drinks" for someone signed in with drinks and nothing posted,
 * and creating a drink for everyone. Zero leaves a category out.
 */
export function weights(s: IdeasState): Record<CategoryKey, number> {
  return {
    first: s.caught === 0 ? 5 : 0,
    post: s.account && s.caught >= 1 && s.posts === 0 ? 4 : 0,
    log: s.caught >= 1 ? 3 : 0,
    create: s.caught === 0 ? 1 : 2,
    explore: 3,
    dex: 2,
    saved: s.account ? 2 : 1,
    friends: s.account ? 2 : 0,
    know: 2,
    tastes: s.tastes ? 0 : 2,
  };
}

/** True when the message's category's needs and its own all hold now, and its words can be filled. */
export function eligible(m: DailyIdea, s: IdeasState): boolean {
  const needs = [...CATEGORIES[m.cat].needs, ...(m.needs ?? [])];
  if (!needs.every((n) => NEEDS[n](s))) return false;
  // Never "1 drinks still grey".
  if (m.body.includes('{left}') && s.total - s.caught < 2) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Days and draws                                                      */
/* ------------------------------------------------------------------ */

/** A local calendar day, YYYY-MM-DD. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local midnight `n` days on (DST-safe: built from the calendar, never from milliseconds). */
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Whole days from `a` to `b`, both YYYY-MM-DD, measured at local noon so a DST change never rounds it. */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00`).getTime() - new Date(`${a}T12:00`).getTime()) / 86_400_000);
}

/** FNV-1a, then mulberry32: a seeded generator per (install, day). */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The body with its tokens filled, counts grouped as the app draws them ("2,089"). */
export function fill(body: string, s: IdeasState, drinkName: string): string {
  return body
    .replaceAll('{caught}', formatCount(s.caught))
    .replaceAll('{total}', formatCount(s.total))
    .replaceAll('{left}', formatCount(Math.max(0, s.total - s.caught)))
    .replaceAll('{suggestion}', drinkName);
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

export interface PlanInput {
  state: IdeasState;
  hour: number;
  minute: number;
  /** What was delivered, any order: the no-repeat promises read it. */
  history: readonly SentIdea[];
  now: Date;
  installId: string;
  /**
   * Cocktail ids to suggest, best first (spec §3.5; lib/notifications:
   * the first run's recommender over the person's answers, nothing caught
   * or saved). The planner takes the first one not named in 60 days.
   */
  suggestions: readonly string[];
  /** A drink's name; undefined for an id the catalogue lost. */
  nameOf: (drinkId: string) => string | undefined;
  /** The catalogue; the default is the app's. */
  ideas?: readonly DailyIdea[];
}

/**
 * The next WINDOW_DAYS ideas, one per local day at most, each with its
 * fire time and the path a tap opens. A day with nothing left that has
 * not been sent in 60 days gets no idea rather than a repeat.
 */
export function plan({
  state: s,
  hour,
  minute,
  history,
  now,
  installId,
  suggestions,
  nameOf,
  ideas = IDEAS,
}: PlanInput): PlannedIdea[] {
  const out: PlannedIdea[] = [];
  const fireAt = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);

  /*
   * Today only while its time is at least a minute away, and not on a day
   * a drink was already logged or posted: the idea would only ask for what
   * was just done. Nor once today's idea has gone out: a later time set in
   * Settings, or a flight west, puts today's time back in the future after
   * it fired, and one a day means one.
   */
  const today = dayKey(now);
  const startsTomorrow =
    fireAt(now).getTime() - now.getTime() < MIN_LEAD_MS ||
    s.loggedToday ||
    s.postedToday ||
    history.some((h) => h.day === today);
  const first = startsTomorrow ? 1 : 0;

  // Oldest first, so the latest use of an id or a drink is the one kept.
  const sent = [...history].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const lastUse = new Map<string, string>();
  const lastDrink = new Map<string, string>();
  for (const h of sent) {
    lastUse.set(h.id, h.day);
    if (h.drink) lastDrink.set(h.drink, h.day);
  }
  const latest = sent[sent.length - 1];
  let prevCat: string | null = latest && latest.day === dayKey(addDays(now, first - 1)) ? latest.cat : null;

  const W = weights(s);
  const pool = ideas.filter((m) => eligible(m, s));

  for (let i = first; i < first + WINDOW_DAYS; i++) {
    const date = addDays(now, i);
    const day = dayKey(date);
    const fresh = (m: DailyIdea) => {
      const last = lastUse.get(m.id);
      return last === undefined || daysBetween(last, day) >= NO_REPEAT_DAYS;
    };
    // A drink is named at most once in 60 days, whether it is the day's suggestion or a fact's own drink.
    const drinkFresh = (id: string) => {
      const last = lastDrink.get(id);
      return last === undefined || daysBetween(last, day) >= NO_REPEAT_DAYS;
    };
    const nextDrink = suggestions.find((id) => drinkFresh(id) && nameOf(id) !== undefined) ?? null;
    const usable = (m: DailyIdea) =>
      fresh(m) &&
      (m.body.includes('{suggestion}')
        ? nextDrink !== null
        : !m.drink || (drinkFresh(m.drink) && nameOf(m.drink) !== undefined));

    let cats = CATEGORY_ORDER.filter((c) => W[c] > 0 && pool.some((m) => m.cat === c && usable(m)));
    if (cats.length > 1) cats = cats.filter((c) => c !== prevCat);
    if (cats.length === 0) {
      prevCat = null;
      continue;
    }
    const r = rng(`${installId}:${day}`);
    const sum = cats.reduce((a, c) => a + W[c], 0);
    let roll = r() * sum;
    const cat = cats.find((c) => (roll -= W[c]) < 0) ?? cats[cats.length - 1]!;

    // Never sent beats sent long ago; among equals, the seeded draw.
    const cands = pool.filter((m) => m.cat === cat && usable(m));
    const never = cands.filter((m) => !lastUse.has(m.id));
    const from = never.length
      ? never
      : [...cands].sort((a, b) => ((lastUse.get(a.id) ?? '') < (lastUse.get(b.id) ?? '') ? -1 : 1)).slice(0, 3);
    const m = from[Math.floor(r() * from.length)]!;

    const drink = m.body.includes('{suggestion}') ? nextDrink : (m.drink ?? null);
    out.push({
      id: m.id,
      cat,
      day,
      drink,
      at: fireAt(date),
      body: fill(m.body, s, drink ? (nameOf(drink) ?? '') : ''),
      url: OPENS[m.opens].replace('{id}', drink ?? ''),
    });
    lastUse.set(m.id, day);
    if (drink) lastDrink.set(drink, day);
    prevCat = cat;
  }
  return out;
}
