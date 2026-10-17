#!/usr/bin/env node
/*
 * Daily ideas: the reference scheduler and the catalogue's checks
 * (specs/v4.3/spec.md §3.4 to §3.6).
 *
 * Two jobs, both ported on landing:
 *
 *   1. CHECK the catalogue (../ideas.mjs) against every rule a line must
 *      keep: 200 or more, unique ids and bodies, the counts per category,
 *      known needs, opens and tokens, the 120-character limit with the
 *      longest real token values, no dash, no "!", no emoji, no capitals
 *      typed in, and the App Store 1.4.3 banned list. Becomes
 *      scripts/check-ideas.mjs over src/data/dailyIdeas.ts.
 *   2. PLAN the next 14 days for a person's state, deterministically, and
 *      SIMULATE half a year of reschedules for five people, asserting what
 *      the spec promises: one idea a day at most, never the same message
 *      twice within 60 days, never the same category two days running,
 *      never more than 14 pending, today skipped once you have logged or
 *      posted today. Becomes src/lib/dailyIdeas.ts (plan, fill, eligible).
 *
 *   node specs/v4.3/tools/schedule.mjs            # checks + the five people's first fortnight
 *   node specs/v4.3/tools/schedule.mjs --quiet    # checks only, exit 1 on any failure
 *
 * DETERMINISTIC: the only randomness is a seeded generator keyed by the
 * install id and the calendar day, so a phone that reschedules ten times a
 * day plans the same message for the same day every time, and two phones
 * do not get the same message on the same evening.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORIES, IDEAS } from '../ideas.mjs';
import { recommend } from '../../v4.2/tools/recommend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const DRINKS = JSON.parse(readFileSync(join(ROOT, 'src/data/drinks.json'), 'utf8'));
const BY_ID = Object.fromEntries(DRINKS.map((d) => [d.id, d]));
const COCKTAILS = DRINKS.filter((d) => d.category === 'cocktail');
const TOTAL = DRINKS.length;

/* ------------------------------------------------------------------ */
/* The numbers the spec quotes                                         */
/* ------------------------------------------------------------------ */

/** Days planned ahead. iOS keeps 64 pending; Sipply uses at most this many of them. */
export const WINDOW_DAYS = 14;
/** A message is not used again until this many days after it was last delivered. */
export const NO_REPEAT_DAYS = 60;
/** How long a delivered message is remembered on the phone. */
export const HISTORY_DAYS = 90;
/** The longest a filled body may be. */
export const BODY_MAX = 120;
/** How many suggestions are drawn per reschedule (enough for every explore day in a window). */
const SUGGESTIONS = 30;

export const OPENS = {
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

export const NEEDS = {
  empty: (s) => s.caught === 0,
  caught: (s) => s.caught >= 1,
  caught2: (s) => s.caught >= 2,
  account: (s) => s.account,
  noPosts: (s) => s.account && s.posts === 0,
  posted: (s) => s.posts >= 1,
  noCustom: (s) => s.custom === 0,
  custom: (s) => s.custom >= 1,
  noFollows: (s) => s.account && s.following === 0,
  follows: (s) => s.following >= 1,
  tastes: (s) => s.tastes,
  noTastes: (s) => !s.tastes,
  saved: (s) => s.saved >= 1,
  collections: (s) => s.account && s.collectionsLive,
  tags: (s) => s.account && s.following >= 1 && s.tagsLive,
};

const TOKENS = ['caught', 'total', 'left', 'suggestion'];

/* ------------------------------------------------------------------ */
/* 1. The catalogue's checks                                           */
/* ------------------------------------------------------------------ */

/*
 * App Store 1.4.3: nothing that encourages drinking, or drinking more.
 * Each pattern names the habit it keeps out. A list cannot judge tone,
 * so every line was also read by a person; this keeps a later edit honest.
 */
const BANNED = [
  [/\bhave an?\b/i, 'an invitation to have one ("have a look" too: say "take a look")'],
  [/\b(grab|pour (yourself|one|a))\b/i, 'an invitation to have one'],
  [/\bdrink(ing)? up\b|\bdrinking\b/i, 'drinking as the verb'],
  [/\bsip(s|ping)?\b|\bcheers\b|\bbottoms up\b/i, 'drinking as the verb'],
  [/\bshots?\b|\brounds?\b|\bnightcap\b/i, 'rounds and shots'],
  [/\bhappy hour\b|\btonight\b|\bthis (evening|afternoon|morning)\b|\bafter work\b|o'clock/i, 'a time to drink'],
  [/\bweekend\b|\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/i, 'a day to drink'],
  [/\bthirst(y)?\b|\bbuzz(ed)?\b|\btipsy\b|\bdrunk\b|\bhangover\b|\bwasted\b|\bparty\b|\bbooz(e|y)\b/i, 'the effect, not the drink'],
  [/\btreat yourself\b|\bdeserve\b|\btime for\b|\bneed a\b/i, 'drinking as a reward'],
  [/\bstreak\b|\bin a row\b|\bevery (day|night)\b|\bdaily\b/i, 'a habit or a streak'],
  [/\bcatch (them )?all\b|\bchallenge\b|\bbeat\b|\brace\b|\bgoal\b|\btarget\b|\bmore drinks\b/i, 'a count to raise'],
  [/\banother (round|one|drink|glass)\b|\bnext (drink|one|round|glass)\b/i, 'one more'],
  [/\btry(ing)?\b/i, 'trying a drink (say read, look up, save, make)'],
  [/\border\b|\bbars?\b/i, 'going out to drink'],
  [/\bstrong(er|est)?\b/i, 'strength as a draw'],
];

const LONGEST = {
  caught: '2,088',
  total: TOTAL.toLocaleString('en-US'),
  left: '2,088',
  suggestion: COCKTAILS.reduce((a, d) => (d.name.length > a.length ? d.name : a), ''),
};

export function checkCatalogue() {
  const fail = [];
  const ids = new Set();
  const bodies = new Set();
  const perCat = {};
  if (IDEAS.length < 200) fail.push(`only ${IDEAS.length} ideas; Jan asked for around 200`);
  for (const m of IDEAS) {
    const where = m.id ?? '(no id)';
    if (!/^[a-z]+-\d{2}$/.test(m.id ?? '')) fail.push(`${where}: id must read <category>-NN`);
    if (ids.has(m.id)) fail.push(`${where}: duplicate id`);
    ids.add(m.id);
    if (!CATEGORIES[m.cat]) fail.push(`${where}: unknown category ${m.cat}`);
    if (!m.id.startsWith(m.cat + '-')) fail.push(`${where}: id and category disagree`);
    perCat[m.cat] = (perCat[m.cat] ?? 0) + 1;
    const key = m.body.toLowerCase();
    if (bodies.has(key)) fail.push(`${where}: same body as another idea`);
    bodies.add(key);
    if (!OPENS[m.opens]) fail.push(`${where}: unknown opens ${m.opens}`);
    for (const n of [...(m.needs ?? []), ...CATEGORIES[m.cat].needs]) if (!NEEDS[n]) fail.push(`${where}: unknown need ${n}`);
    const used = [...m.body.matchAll(/\{([a-z]+)\}/g)].map((x) => x[1]);
    for (const t of used) if (!TOKENS.includes(t)) fail.push(`${where}: unknown token {${t}}`);
    const needs = new Set([...(m.needs ?? []), ...CATEGORIES[m.cat].needs]);
    if (used.includes('caught') && !needs.has('caught2')) fail.push(`${where}: {caught} needs caught2, or it can read "1 drinks"`);
    if (used.includes('left') && !(needs.has('caught') || needs.has('caught2'))) fail.push(`${where}: {left} needs caught`);
    if (used.includes('suggestion') && m.opens !== 'drink') fail.push(`${where}: {suggestion} must open drink`);
    if (m.opens === 'drink' && !used.includes('suggestion') && !m.drink) fail.push(`${where}: opens drink but names no drink`);
    if (m.drink && !BY_ID[m.drink]) fail.push(`${where}: drink ${m.drink} is not in drinks.json`);
    if (m.drink && used.includes('suggestion')) fail.push(`${where}: a fixed drink and {suggestion} both`);
    const filled = m.body.replace(/\{([a-z]+)\}/g, (_, t) => LONGEST[t] ?? t);
    if (filled.length > BODY_MAX) fail.push(`${where}: ${filled.length} characters filled, over ${BODY_MAX}`);
    if (/[\u2013\u2014]/.test(m.body)) fail.push(`${where}: a dash; use a full stop or a colon`);
    if (/!/.test(m.body)) fail.push(`${where}: an exclamation mark`);
    if (/\p{Extended_Pictographic}/u.test(m.body)) fail.push(`${where}: an emoji`);
    if (/\b[A-Z]{3,}\b/.test(m.body)) fail.push(`${where}: capitals typed into copy`);
    if (/\u2116/.test(m.body)) fail.push(`${where}: U+2116; the Dex number sign is U+00BA`);
    const lead = m.body.replace(/^\{[a-z]+\}/, 'X');
    if (!/^[A-Z0-9X+]/.test(lead)) fail.push(`${where}: starts lower case`);
    if (!/[.?]$/.test(m.body)) fail.push(`${where}: ends without a full stop or a question mark`);
    if (/\b(colou?r|flavou?r|favou?rite)\b/i.test(m.body) && /\b(color|flavor|favorite)\b/i.test(m.body)) fail.push(`${where}: American spelling`);
    for (const [re, why] of BANNED) if (re.test(m.body)) fail.push(`${where}: banned (${why}): "${m.body.match(re)[0]}"`);
  }
  for (const [cat, c] of Object.entries(CATEGORIES)) {
    if ((perCat[cat] ?? 0) !== c.count) fail.push(`${cat}: ${perCat[cat] ?? 0} ideas, the table says ${c.count}`);
  }
  return { fail, perCat };
}

/* ------------------------------------------------------------------ */
/* 2. Planning                                                         */
/* ------------------------------------------------------------------ */

/** A local calendar day, YYYY-MM-DD. */
export const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);

/** FNV-1a, then mulberry32: a seeded generator per (install, day). */
function rng(seed) {
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

/** How often each category is drawn, for this state. Zero leaves it out. */
export function weights(s) {
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

export function eligible(m, s) {
  const needs = [...CATEGORIES[m.cat].needs, ...(m.needs ?? [])];
  if (!needs.every((n) => NEEDS[n](s))) return false;
  if (m.body.includes('{left}') && TOTAL - s.caught < 2) return false;
  return true;
}

/**
 * The day's suggested cocktails, best first: the recommender over the
 * person's answers (cocktails only, nothing already caught), or with no
 * answers its plain classics order. The planner takes the first one not
 * suggested in the last 60 days. Saved drinks are left out too: "save it" about a
 * drink already saved says nothing.
 */
export function suggestionsFor(s) {
  const answers = s.tastes
    ? { ...s.answers, drinks: 'cocktails' }
    : { goal: null, drinks: 'cocktails', spirits: [], flavours: [], home: null, bar: [] };
  return recommend({ ...answers, exclude: [...s.caughtIds, ...(s.savedDrinkIds ?? [])] }, SUGGESTIONS)
    .filter((p) => p.category === 'cocktail')
    .map((p) => p.id);
}

export function fill(body, s, drinkId) {
  return body
    .replaceAll('{caught}', s.caught.toLocaleString('en-US'))
    .replaceAll('{total}', TOTAL.toLocaleString('en-US'))
    .replaceAll('{left}', (TOTAL - s.caught).toLocaleString('en-US'))
    .replaceAll('{suggestion}', drinkId ? BY_ID[drinkId].name : '');
}

/**
 * The next WINDOW_DAYS ideas. `history` is what was delivered, oldest
 * first: { id, cat, day, drink? }. Returns what to schedule, each with its
 * local fire time and the in-app path a tap opens.
 */
export function plan({ state: s, hour = 18, minute = 0, history, now, installId }) {
  const out = [];
  const today = dayKey(now);
  const fireAt = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
  const todayFire = fireAt(now);
  let first = 0;
  // Today only while its time is at least a minute away, and not on a day you already logged or posted.
  if (todayFire - now < 60000 || s.loggedToday || s.postedToday) first = 1;
  const lastUse = new Map();
  const lastDrink = new Map();
  for (const h of history) {
    lastUse.set(h.id, h.day);
    if (h.drink) lastDrink.set(h.drink, h.day);
  }
  const yesterday = dayKey(addDays(now, first - 1));
  let prevCat = history.length && history[history.length - 1].day === yesterday ? history[history.length - 1].cat : null;
  const W = weights(s);
  const pool = IDEAS.filter((m) => eligible(m, s));
  const suggestions = suggestionsFor(s);

  for (let i = first; out.length < WINDOW_DAYS && i < first + WINDOW_DAYS; i++) {
    const date = addDays(now, i);
    const day = dayKey(date);
    const fresh = (m) => !lastUse.has(m.id) || daysBetween(lastUse.get(m.id), day) >= NO_REPEAT_DAYS;
    const pick = (list) => list.find((d) => !lastDrink.has(d) || daysBetween(lastDrink.get(d), day) >= NO_REPEAT_DAYS);
    const nextDrink = pick(suggestions);
    // A drink is named at most once in 60 days, whether it is the day's suggestion or a fact's own drink.
    const drinkFresh = (id) => !lastDrink.has(id) || daysBetween(lastDrink.get(id), day) >= NO_REPEAT_DAYS;
    const usable = (m) =>
      fresh(m) && (m.body.includes('{suggestion}') ? !!nextDrink : !m.drink || drinkFresh(m.drink));
    let cats = Object.keys(W).filter((c) => W[c] > 0 && pool.some((m) => m.cat === c && usable(m)));
    if (cats.length > 1) cats = cats.filter((c) => c !== prevCat);
    if (cats.length === 0) {
      prevCat = null;
      continue; // Nothing left that has not been sent in 60 days: no idea that day, rather than a repeat.
    }
    const r = rng(`${installId}:${day}`);
    const sum = cats.reduce((a, c) => a + W[c], 0);
    let roll = r() * sum;
    const cat = cats.find((c) => (roll -= W[c]) < 0) ?? cats[cats.length - 1];
    // Never sent beats sent long ago; among equals, the seeded draw.
    const cands = pool.filter((m) => m.cat === cat && usable(m));
    const never = cands.filter((m) => !lastUse.has(m.id));
    const from = never.length ? never : [...cands].sort((a, b) => (lastUse.get(a.id) < lastUse.get(b.id) ? -1 : 1)).slice(0, 3);
    const m = from[Math.floor(r() * from.length)];
    const drink = m.body.includes('{suggestion}') ? nextDrink : m.drink ?? null;
    const url = OPENS[m.opens].replace('{id}', drink ?? '');
    out.push({ day, at: fireAt(date), id: m.id, cat, body: fill(m.body, s, drink), url, drink });
    lastUse.set(m.id, day);
    if (drink) lastDrink.set(drink, day);
    prevCat = cat;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Simulation                                                       */
/* ------------------------------------------------------------------ */

/** Five people; `on(day)` changes their state as the days pass. */
const PEOPLE = {
  N: {
    title: 'New, signed out, no answers, opens the app every day; catches a first drink on day 9',
    opens: () => true,
    state: (d) => ({ account: false, caught: d >= 9 ? 1 : 0, posts: 0, custom: 0, following: 0, saved: 0, tastes: false }),
  },
  S: {
    title: 'Signed in, 3 caught, never posted, follows nobody, answered; opens every third day',
    opens: (d) => d % 3 === 0,
    state: () => ({ account: true, caught: 3, posts: 0, custom: 0, following: 0, saved: 1, tastes: true,
      answers: { goal: null, drinks: 'both', spirits: ['rum', 'agave'], styleOf: 'rum', styles: ['white'], flavours: ['sour', 'fruity'], home: 'sometimes', bar: [] } }),
  },
  E: {
    title: 'Persona E: 14 caught, 5 posts, follows 6, collections and tags live; opens most days',
    opens: (d) => d % 7 !== 3,
    state: () => ({ account: true, caught: 14, posts: 5, custom: 0, following: 6, saved: 9, tastes: true, collectionsLive: true, tagsLive: true,
      answers: { goal: null, drinks: 'both', spirits: ['rum', 'agave'], styleOf: 'rum', styles: ['white'], flavours: ['sour', 'fruity'], home: 'sometimes', bar: [] } }),
  },
  R: {
    title: 'Regular: 120 caught, 40 posts, 2 drinks of their own, follows 30; opens every day',
    opens: () => true,
    state: () => ({ account: true, caught: 120, posts: 40, custom: 2, following: 30, saved: 25, tastes: true, collectionsLive: true, tagsLive: true,
      answers: { goal: null, drinks: 'cocktails', spirits: ['gin', 'whiskey'], styleOf: 'whiskey', styles: ['bourbon'], flavours: ['bitter', 'strong'], home: 'often', bar: [] } }),
  },
  Q: {
    title: 'Quiet: signed in, 2 caught, opens the app on day 0 only (the window runs out on day 14)',
    opens: (d) => d === 0,
    state: () => ({ account: true, caught: 2, posts: 1, custom: 0, following: 2, saved: 0, tastes: false }),
  },
};

/** The first catalogue drinks, as a stand-in Dex of `n` caught ids. */
const caughtIdsFor = (n) => COCKTAILS.slice(0, n).map((d) => d.id);

function simulate(key, days = 180) {
  const P = PEOPLE[key];
  const start = new Date(2026, 9, 16, 12, 0); // 16 Oct 2026, noon
  const history = [];
  let pending = [];
  const problems = [];
  const firstFortnight = [];
  for (let d = 0; d < days; d++) {
    const noon = addDays(start, d);
    noon.setHours(12);
    // What fired yesterday evening was delivered.
    const evening = new Date(noon.getTime() - 18 * 3600 * 1000);
    for (const p of pending) if (p.at <= noon && !history.some((h) => h.day === p.day)) history.push({ id: p.id, cat: p.cat, day: p.day, drink: p.drink });
    pending = pending.filter((p) => p.at > noon);
    if (P.opens(d)) {
      const base = P.state(d);
      const s = { collectionsLive: false, tagsLive: false, loggedToday: false, postedToday: false, ...base, caughtIds: caughtIdsFor(base.caught) };
      const cutoff = dayKey(addDays(noon, -HISTORY_DAYS));
      const kept = history.filter((h) => h.day >= cutoff);
      pending = plan({ state: s, hour: 18, minute: 0, history: kept, now: noon, installId: `install-${key}` });
      if (pending.length > WINDOW_DAYS) problems.push(`day ${d}: ${pending.length} pending`);
      if (d === 0) firstFortnight.push(...pending);
    }
    void evening;
  }
  // The promises.
  const byDay = new Map();
  history.forEach((h, i) => {
    if (byDay.has(h.day)) problems.push(`two ideas on ${h.day}`);
    byDay.set(h.day, h);
    for (let j = i - 1; j >= 0; j--) {
      if (daysBetween(history[j].day, h.day) >= NO_REPEAT_DAYS) break;
      if (history[j].id === h.id) problems.push(`${h.id} repeated after ${daysBetween(history[j].day, h.day)} days`);
      if (h.drink && history[j].drink === h.drink) problems.push(`${h.drink} suggested twice within 60 days`);
    }
    const prev = history[i - 1];
    if (prev && daysBetween(prev.day, h.day) === 1 && prev.cat === h.cat) problems.push(`${h.cat} two days running on ${h.day}`);
  });
  const mix = {};
  for (const h of history) mix[h.cat] = (mix[h.cat] ?? 0) + 1;
  return { title: P.title, delivered: history.length, days, problems, mix, firstFortnight };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const quiet = process.argv.includes('--quiet');
  const { fail, perCat } = checkCatalogue();
  console.log(`Catalogue: ${IDEAS.length} ideas  ${Object.entries(perCat).map(([c, n]) => `${c} ${n}`).join(' · ')}`);
  console.log(`  longest filled body: ${Math.max(...IDEAS.map((m) => m.body.replace(/\{([a-z]+)\}/g, (_, t) => LONGEST[t]).length))} characters (limit ${BODY_MAX}; {suggestion} filled as "${LONGEST.suggestion}")`);
  if (fail.length) {
    console.log(`  FAIL (${fail.length}):`);
    for (const f of fail) console.log('   - ' + f);
  } else console.log('  PASS: every rule');

  let simFail = 0;
  for (const key of Object.keys(PEOPLE)) {
    const r = simulate(key);
    simFail += r.problems.length;
    console.log(`\nPerson ${key}: ${r.title}`);
    console.log(`  ${r.delivered} ideas delivered in ${r.days} days · ${r.problems.length ? 'FAIL ' + r.problems.slice(0, 5).join('; ') : 'PASS: one a day at most, no repeat within 60 days, no category twice running'}`);
    console.log(`  mix: ${Object.entries(r.mix).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ')}`);
    if (!quiet) {
      console.log('  planned on day 0:');
      for (const p of r.firstFortnight) console.log(`    ${p.day} 18:00  ${p.id.padEnd(11)} ${p.url.padEnd(26)} ${p.body}`);
    }
  }
  if (fail.length || simFail) process.exit(1);
}
