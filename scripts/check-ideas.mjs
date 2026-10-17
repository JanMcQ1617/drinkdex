/**
 * The daily ideas' guard (specs/v4.3/spec.md §3.4 to §3.6). The app has no
 * Jest, so this is their test, run beside check-design.
 *
 *   1. THE COPY. src/data/dailyIdeas.ts must be specs/v4.3/ideas.mjs,
 *      typed: the same categories and the same 200 messages, in the same
 *      order. An edit is made in both, and fails here until it is.
 *   2. EVERY LINE'S RULES, tools/schedule.mjs's checkCatalogue over the
 *      app's file: around 200; unique ids and bodies; the counts per
 *      category; known needs, opens and tokens; {caught} only with
 *      caught2, {left} only with caught, {suggestion} only opening a drink;
 *      a fixed drink that is in drinks.json; at most 120 characters filled
 *      with the longest real values; no dash, "!", emoji, typed capitals or
 *      U+2116; a capital first and a full stop or question mark last;
 *      British spelling; and App Store 1.4.3's banned list below. A list
 *      cannot judge tone, so every line was also read by a person; this
 *      keeps a later edit honest.
 *   3. THE PLANNER. src/lib/dailyIdeas.ts, transpiled with the project's
 *      own typescript and its two imports stubbed, plans beside the
 *      reference's plan() for the spec's five people over 180 days,
 *      replanning on every opening, and must give the same fortnight to the
 *      letter each time. Then the promises are checked on the port's own
 *      deliveries: one a day at most, no message or drink twice within 60
 *      days, no category two days running, never more than 14 pending,
 *      and none of WINDOW_DAYS over 30 (iOS keeps 64).
 *   4. WHAT THE PORT ADDS. Today is never planned once today's idea is in
 *      the history (a later time set after it fired); a person whose posts
 *      and follows are not known yet (null) gets no post or friends line
 *      that guesses; a drink the catalogue has lost is never named.
 *
 * Run: node scripts/check-ideas.mjs
 * Exits 1 on any failure.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import * as ref from '../specs/v4.3/tools/schedule.mjs';
import * as refCopy from '../specs/v4.3/ideas.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8');

const failures = [];
const fail = (msg) => failures.push(msg);

const toEsm = (source, fileName) =>
  ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  }).outputText;
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

/* ------------------------------------------------------------------ */
/* The app's catalogue, loaded                                         */
/* ------------------------------------------------------------------ */

const dataJs = toEsm(read('src/data/dailyIdeas.ts'), 'dailyIdeas.ts');
if (/^\s*import\s/m.test(dataJs) || /\brequire\(/.test(dataJs)) {
  console.error('  FAIL  src/data/dailyIdeas.ts imports something at runtime: data and types only');
  process.exit(1);
}
const dataUrlCode = dataUrl(dataJs);
const { CATEGORIES, IDEAS } = await import(dataUrlCode);

/* 1. The copy is the spec's. */
if (JSON.stringify(CATEGORIES) !== JSON.stringify(refCopy.CATEGORIES)) {
  fail('CATEGORIES differs from specs/v4.3/ideas.mjs');
}
{
  const n = Math.max(IDEAS.length, refCopy.IDEAS.length);
  for (let i = 0; i < n; i++) {
    const a = JSON.stringify(IDEAS[i]);
    const b = JSON.stringify(refCopy.IDEAS[i]);
    if (a !== b) fail(`idea ${i + 1} differs from specs/v4.3/ideas.mjs: ${a ?? '(missing)'} vs ${b ?? '(missing)'}`);
  }
}

/* ------------------------------------------------------------------ */
/* 2. Every line's rules                                               */
/* ------------------------------------------------------------------ */

const DRINKS = JSON.parse(read('src/data/drinks.json'));
const BY_ID = Object.fromEntries(DRINKS.map((d) => [d.id, d]));
const COCKTAILS = DRINKS.filter((d) => d.category === 'cocktail');
const TOTAL = DRINKS.length;
const TOKENS = ['caught', 'total', 'left', 'suggestion'];

/*
 * App Store 1.4.3: nothing that encourages drinking, or drinking more.
 * Each pattern names the habit it keeps out (tools/schedule.mjs's list).
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

{
  const ids = new Set();
  const bodies = new Set();
  const perCat = {};
  if (IDEAS.length < 200) fail(`only ${IDEAS.length} ideas; Jan asked for around 200`);
  for (const m of IDEAS) {
    const where = m.id ?? '(no id)';
    if (!/^[a-z]+-\d{2}$/.test(m.id ?? '')) fail(`${where}: id must read <category>-NN`);
    if (ids.has(m.id)) fail(`${where}: duplicate id`);
    ids.add(m.id);
    if (!CATEGORIES[m.cat]) {
      fail(`${where}: unknown category ${m.cat}`);
      continue;
    }
    if (!m.id.startsWith(m.cat + '-')) fail(`${where}: id and category disagree`);
    perCat[m.cat] = (perCat[m.cat] ?? 0) + 1;
    const key = m.body.toLowerCase();
    if (bodies.has(key)) fail(`${where}: same body as another idea`);
    bodies.add(key);
    if (!ref.OPENS[m.opens]) fail(`${where}: unknown opens ${m.opens}`);
    for (const n of [...(m.needs ?? []), ...CATEGORIES[m.cat].needs]) if (!ref.NEEDS[n]) fail(`${where}: unknown need ${n}`);
    const used = [...m.body.matchAll(/\{([a-z]+)\}/g)].map((x) => x[1]);
    for (const t of used) if (!TOKENS.includes(t)) fail(`${where}: unknown token {${t}}`);
    const needs = new Set([...(m.needs ?? []), ...CATEGORIES[m.cat].needs]);
    if (used.includes('caught') && !needs.has('caught2')) fail(`${where}: {caught} needs caught2, or it can read "1 drinks"`);
    if (used.includes('left') && !(needs.has('caught') || needs.has('caught2'))) fail(`${where}: {left} needs caught`);
    if (used.includes('suggestion') && m.opens !== 'drink') fail(`${where}: {suggestion} must open drink`);
    if (m.opens === 'drink' && !used.includes('suggestion') && !m.drink) fail(`${where}: opens drink but names no drink`);
    if (m.drink && !BY_ID[m.drink]) fail(`${where}: drink ${m.drink} is not in drinks.json`);
    if (m.drink && used.includes('suggestion')) fail(`${where}: a fixed drink and {suggestion} both`);
    const filled = m.body.replace(/\{([a-z]+)\}/g, (_, t) => LONGEST[t] ?? t);
    if (filled.length > ref.BODY_MAX) fail(`${where}: ${filled.length} characters filled, over ${ref.BODY_MAX}`);
    if (/[–—]/.test(m.body)) fail(`${where}: a dash; use a full stop or a colon`);
    if (/!/.test(m.body)) fail(`${where}: an exclamation mark`);
    if (/\p{Extended_Pictographic}/u.test(m.body)) fail(`${where}: an emoji`);
    if (/\b[A-Z]{3,}\b/.test(m.body)) fail(`${where}: capitals typed into copy`);
    if (/№/.test(m.body)) fail(`${where}: U+2116; the Dex number sign is U+00BA`);
    const lead = m.body.replace(/^\{[a-z]+\}/, 'X');
    if (!/^[A-Z0-9X+]/.test(lead)) fail(`${where}: starts lower case`);
    if (!/[.?]$/.test(m.body)) fail(`${where}: ends without a full stop or a question mark`);
    if (/\b(color|flavor|favorite|organize|recognize)\b/i.test(m.body)) fail(`${where}: American spelling`);
    for (const [re, why] of BANNED) if (re.test(m.body)) fail(`${where}: banned (${why}): "${m.body.match(re)[0]}"`);
  }
  for (const [cat, c] of Object.entries(CATEGORIES)) {
    if ((perCat[cat] ?? 0) !== c.count) fail(`${cat}: ${perCat[cat] ?? 0} ideas, the table says ${c.count}`);
  }
}

/* ------------------------------------------------------------------ */
/* 3. The planner, beside the reference                                */
/* ------------------------------------------------------------------ */

const formatCount = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const libJs = toEsm(read('src/lib/dailyIdeas.ts'), 'dailyIdeas.ts')
  .replace(/from ['"]@\/data['"]/, `from '${dataUrl(`export const formatCount = ${formatCount.toString()};`)}'`)
  .replace(/from ['"]@\/data\/dailyIdeas['"]/, `from '${dataUrlCode}'`);
if (/from ['"]@\//.test(libJs)) {
  console.error('  FAIL  src/lib/dailyIdeas.ts imports more than @/data and @/data/dailyIdeas: stub it here');
  process.exit(1);
}
const port = await import(dataUrl(libJs));

for (const k of ['WINDOW_DAYS', 'NO_REPEAT_DAYS', 'HISTORY_DAYS', 'BODY_MAX']) {
  if (port[k] !== ref[k]) fail(`${k} is ${port[k]}, the reference's ${ref[k]}`);
}
if (JSON.stringify(port.OPENS) !== JSON.stringify(ref.OPENS)) fail('OPENS differs from the reference');
if (port.WINDOW_DAYS > 30) fail('WINDOW_DAYS over 30: iOS keeps 64 pending for the whole app');

const nameOf = (id) => BY_ID[id]?.name;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayKey = ref.dayKey;
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);

/** The reference's state as the port reads it: counts, plus the catalogue total. */
const portState = (s) => ({
  account: s.account,
  caught: s.caught,
  total: TOTAL,
  posts: s.posts,
  custom: s.custom,
  following: s.following,
  saved: s.saved,
  tastes: s.tastes,
  collectionsLive: s.collectionsLive,
  tagsLive: s.tagsLive,
  loggedToday: s.loggedToday,
  postedToday: s.postedToday,
});

const SAME_ANSWERS = { goal: null, drinks: 'both', spirits: ['rum', 'agave'], styleOf: 'rum', styles: ['white'], flavours: ['sour', 'fruity'], home: 'sometimes', bar: [] };

/** tools/schedule.mjs's five people, as it simulates them. */
const PEOPLE = {
  N: { opens: () => true, state: (d) => ({ account: false, caught: d >= 9 ? 1 : 0, posts: 0, custom: 0, following: 0, saved: 0, tastes: false }) },
  S: { opens: (d) => d % 3 === 0, state: () => ({ account: true, caught: 3, posts: 0, custom: 0, following: 0, saved: 1, tastes: true, answers: SAME_ANSWERS }) },
  E: { opens: (d) => d % 7 !== 3, state: () => ({ account: true, caught: 14, posts: 5, custom: 0, following: 6, saved: 9, tastes: true, collectionsLive: true, tagsLive: true, answers: SAME_ANSWERS }) },
  R: {
    opens: () => true,
    state: () => ({ account: true, caught: 120, posts: 40, custom: 2, following: 30, saved: 25, tastes: true, collectionsLive: true, tagsLive: true,
      answers: { goal: null, drinks: 'cocktails', spirits: ['gin', 'whiskey'], styleOf: 'whiskey', styles: ['bourbon'], flavours: ['bitter', 'strong'], home: 'often', bar: [] } }),
  },
  Q: { opens: (d) => d === 0, state: () => ({ account: true, caught: 2, posts: 1, custom: 0, following: 2, saved: 0, tastes: false }) },
};
const caughtIdsFor = (n) => COCKTAILS.slice(0, n).map((d) => d.id);
const show = (p) => `${p.day} ${p.id} ${p.url} ${p.body}`;

/** Both planners on one person; the port's deliveries for the promise checks. */
function simulate(key, days = 180) {
  const P = PEOPLE[key];
  const start = new Date(2026, 9, 16, 12, 0);
  const history = [];
  let pending = [];
  let worst = 0;
  for (let d = 0; d < days; d++) {
    const noon = addDays(start, d);
    noon.setHours(12);
    for (const p of pending) if (p.at <= noon && !history.some((h) => h.day === p.day)) history.push({ id: p.id, cat: p.cat, day: p.day, drink: p.drink });
    pending = pending.filter((p) => p.at > noon);
    if (!P.opens(d)) continue;
    const base = P.state(d);
    const s = { collectionsLive: false, tagsLive: false, loggedToday: false, postedToday: false, ...base, caughtIds: caughtIdsFor(base.caught) };
    const kept = history.filter((h) => h.day >= dayKey(addDays(noon, -ref.HISTORY_DAYS)));
    const theirs = ref.plan({ state: s, hour: 18, minute: 0, history: kept, now: noon, installId: `install-${key}` });
    const mine = port.plan({
      state: portState(s), hour: 18, minute: 0, history: kept, now: noon, installId: `install-${key}`,
      suggestions: ref.suggestionsFor(s), nameOf,
    });
    const a = mine.map((p) => `${show(p)} @${p.at.toISOString()} ${p.drink}`).join('\n');
    const b = theirs.map((p) => `${show(p)} @${p.at.toISOString()} ${p.drink}`).join('\n');
    if (a !== b) {
      fail(`person ${key}, day ${d}: the port plans differently from the reference`);
      return { history, worst };
    }
    worst = Math.max(worst, mine.length);
    pending = mine;
  }
  return { history, worst };
}

function promises(key, history, worst) {
  if (worst > port.WINDOW_DAYS) fail(`person ${key}: ${worst} pending at once`);
  history.forEach((h, i) => {
    if (history.findIndex((x) => x.day === h.day) !== i) fail(`person ${key}: two ideas on ${h.day}`);
    for (let j = i - 1; j >= 0; j--) {
      if (daysBetween(history[j].day, h.day) >= port.NO_REPEAT_DAYS) break;
      if (history[j].id === h.id) fail(`person ${key}: ${h.id} again after ${daysBetween(history[j].day, h.day)} days`);
      if (h.drink && history[j].drink === h.drink) fail(`person ${key}: ${h.drink} named twice within 60 days`);
    }
    const prev = history[i - 1];
    if (prev && daysBetween(prev.day, h.day) === 1 && prev.cat === h.cat) fail(`person ${key}: ${h.cat} two days running on ${h.day}`);
  });
}

const delivered = {};
for (const key of Object.keys(PEOPLE)) {
  const { history, worst } = simulate(key);
  promises(key, history, worst);
  delivered[key] = history.length;
}

/* ------------------------------------------------------------------ */
/* 4. What the port adds                                               */
/* ------------------------------------------------------------------ */

{
  const s = portState({ account: true, caught: 14, posts: 5, custom: 0, following: 6, saved: 9, tastes: true, collectionsLive: true, tagsLive: true, loggedToday: false, postedToday: false });
  const base = { state: s, minute: 0, installId: 'install-check', suggestions: COCKTAILS.slice(20, 60).map((d) => d.id), nameOf };

  // Today's idea went out at 6 PM; at 7 PM the time moves to 9 PM. Today stays done.
  const evening = new Date(2026, 9, 16, 19, 0);
  const before = port.plan({ ...base, hour: 18, history: [], now: new Date(2026, 9, 16, 12, 0) });
  const fired = before.filter((p) => p.at <= evening).map(({ id, cat, day, drink }) => ({ id, cat, day, drink }));
  if (fired.length !== 1 || fired[0].day !== '2026-10-16') fail('the 6 PM idea of 16 Oct was not planned for the time-move test');
  const after = port.plan({ ...base, hour: 21, history: fired, now: evening });
  if (after.some((p) => p.day === '2026-10-16')) fail('a second idea on a day whose idea already went out (time moved later)');
  if (after.length !== port.WINDOW_DAYS) fail(`after the time moved, ${after.length} planned, not ${port.WINDOW_DAYS}`);

  // Unknown posts and follows: nothing that depends on them.
  const unknown = port.plan({ ...base, hour: 18, state: { ...s, posts: null, following: null }, history: [], now: new Date(2026, 9, 16, 12, 0) });
  const needsOf = (id) => {
    const m = IDEAS.find((x) => x.id === id);
    return [...CATEGORIES[m.cat].needs, ...(m.needs ?? [])];
  };
  const guessing = unknown.filter((p) => needsOf(p.id).some((n) => ['noPosts', 'posted', 'noFollows', 'follows', 'tags'].includes(n)));
  if (guessing.length) fail(`with posts and follows unknown, planned ${guessing.map((p) => p.id).join(', ')}`);

  // A knowledge line's drink gone from the catalogue is never named.
  const lost = new Set(IDEAS.filter((m) => m.drink).map((m) => m.drink));
  const pickOnly = (id) => (lost.has(id) ? undefined : nameOf(id));
  for (let d = 0; d < 120; d += 7) {
    const now = new Date(2026, 9, 16 + d, 12, 0);
    const ideas = port.plan({ ...base, hour: 18, nameOf: pickOnly, history: [], now });
    const named = ideas.filter((p) => p.drink && lost.has(p.drink));
    if (named.length) fail(`named a drink the catalogue lost: ${named.map((p) => p.id).join(', ')}`);
  }
}

/* ------------------------------------------------------------------ */

const longest = Math.max(...IDEAS.map((m) => m.body.replace(/\{([a-z]+)\}/g, (_, t) => LONGEST[t]).length));
console.log(`\n  Daily ideas: ${IDEAS.length} messages in ${Object.keys(CATEGORIES).length} categories, longest filled ${longest} of ${ref.BODY_MAX} characters.`);
console.log(`  Port beside the reference, 180 days each: ${Object.entries(delivered).map(([k, n]) => `${k} ${n}`).join(' · ')} delivered.`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  PASS: the copy is the spec\'s, every line keeps its rules, and the port plans as the reference does.\n');
