/**
 * The Dock's geometry and timeline, checked against the film itself.
 *
 * v4.6 (specs/v4.6-details/spec.md, B). The flight starts on the frame
 * the film ends on, so the vector wordmark has to appear exactly where
 * the film's end frame drew its ink, or the swap shows. That rect is a
 * pure function of the screen (src/lib/introDockPlan.ts,
 * filmWordmarkRect); this runs that very file (it imports nothing and
 * uses only erasable TypeScript, as penPath.ts does) against:
 *
 *   - the film's generator output, tools/data.json in
 *     ~/Projects/sipply-intro/d-the-tag (or $SIPPLY_INTRO_DATA): its
 *     viewBox must be the app's (brand/paths), and its wordmarkFilmBox,
 *     placed the way VideoIntro places the film, must be the rect, to
 *     1e-6 pt, on three phones;
 *   - the spec's table (B.1), to the 0.01 pt it prints;
 *   - the timeline's own promises (B.4): every group inside the clock,
 *     the stories after the wordmark has left their row, the rule drawn
 *     by the end, the hand-off where the flight ends.
 *
 * Without data.json (a machine that does not hold the film's source) the
 * generator half is skipped with a note, and the rest still runs.
 *
 * Run: node scripts/check-intro-dock.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The .ts files have no package "type"; node reparses them as modules and says so. Not news here.
process.removeAllListeners('warning');
const plan = await import(new URL('../src/lib/introDockPlan.ts', import.meta.url).href);
const { SPLASH_MARK, WORDMARK_PATH } = await import(new URL('../src/components/brand/paths.ts', import.meta.url).href);

const fails = [];
const check = (ok, message) => {
  if (!ok) fails.push(message);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const fmt = (r) => `${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.w.toFixed(2)} x ${r.h.toFixed(2)}`;

const PT = plan.filmPt(SPLASH_MARK.width);
const VB = WORDMARK_PATH.viewBox;
const rect = (w, h) => plan.filmWordmarkRect(w, h, PT, VB);

/* 1. The film's own numbers. */
const DATA =
  process.env.SIPPLY_INTRO_DATA ?? join(homedir(), 'Projects/sipply-intro/d-the-tag/tools/data.json');
const SCREENS = [
  [375, 667], // SE: the film stops short of the screen's height
  [390, 844],
  [440, 956], // Pro Max: the film overflows its width
];
if (existsSync(DATA)) {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  check(
    Array.isArray(data.vb) && data.vb.length === 4 && data.vb.every((v, i) => near(v, VB[i], 1e-9)),
    `the film's viewBox ${JSON.stringify(data.vb)} is not the app's ${JSON.stringify(VB)}: the swap would show`,
  );
  const [[x0, y0], [x1, y1]] = data.wordmarkFilmBox;
  check(
    near(x1 - x0, plan.FILM_WORDMARK_PX, 1e-6),
    `the film draws the wordmark ${x1 - x0} px wide, introDockPlan says ${plan.FILM_WORDMARK_PX}`,
  );
  for (const [w, h] of SCREENS) {
    const film = plan.filmRect(w, h, PT);
    const want = { x: film.x + x0 * PT, y: film.y + y0 * PT, w: (x1 - x0) * PT, h: (y1 - y0) * PT };
    const got = rect(w, h);
    const ok = ['x', 'y', 'w', 'h'].every((k) => near(got[k], want[k], 1e-6));
    check(ok, `${w} x ${h}: filmWordmarkRect ${fmt(got)}, the film's end frame ${fmt(want)}`);
    if (ok) console.log(`  ${w} x ${h}  ${fmt(got)}  = data.json`);
  }
} else {
  console.log(`  (no ${DATA}: the generator half is skipped; the spec's table still runs)`);
}

/* 2. The spec's table, B.1. */
const TABLE = [
  [375, 667, 37.19, 240.8],
  [390, 844, 44.69, 329.3],
  [393, 852, 46.19, 333.3],
  [402, 874, 50.69, 344.3],
  [440, 956, 69.69, 385.3],
];
for (const [w, h, x, y] of TABLE) {
  const r = rect(w, h);
  check(
    near(r.x, x, 0.005) && near(r.y, y, 0.005) && near(r.w, 300.62, 0.005) && near(r.h, 185.4, 0.005),
    `${w} x ${h}: ${fmt(r)}, the spec's table says ${x}, ${y}, 300.62 x 185.40`,
  );
}
/* Home's target, 42pt at the default text size, is a scale of 0.22654. */
const homeW = 42 * (VB[2] / VB[3]);
check(near(homeW, 68.1, 0.005), `Home's wordmark is ${homeW.toFixed(2)} wide, the spec says 68.10`);
check(near(homeW / rect(390, 844).w, 0.22654, 0.00001), `Home's scale is ${(homeW / rect(390, 844).w).toFixed(5)}`);

/* 3. The timeline. */
const { DOCK_MS, HANDOFF_MS, RULE_FROM, RULE_MS, SM_FADE_FROM, RISE_GROUPS, TARGET_WAIT_MS, SKIP_MS, EXIT_MS } = plan;
for (const [name, g] of Object.entries(RISE_GROUPS)) {
  check(g.start >= 0 && g.start + g.dur <= DOCK_MS, `${name} runs ${g.start} to ${g.start + g.dur}, outside the ${DOCK_MS} ms clock`);
  check(g.opMs > 0 && g.opMs <= g.dur, `${name}'s opacity runs ${g.opMs} ms of a ${g.dur} ms rise`);
}
check(RISE_GROUPS.chrome.opMs <= 80 && RISE_GROUPS.chrome.opLinear, 'the chrome must fade in under 80 ms, straight: the Tournaments key and the dot go pink otherwise');
check(RISE_GROUPS.stories.start >= 360, 'the stories may not start before 360 ms: the red script still lies on "Your story"');
check(RISE_GROUPS.feed.start >= RISE_GROUPS.chrome.start, 'the feed rises after the chrome: bottom first, one direction');
check(RULE_FROM + RULE_MS === DOCK_MS, `the rule draws ${RULE_FROM} to ${RULE_FROM + RULE_MS}, not to the end of the clock (${DOCK_MS})`);
/* RISE, as lib/introDock builds it (Easing.bezierFn(0.22, 1, 0.36, 1)), solved for x by bisection. */
const bezier = (x1, y1, x2, y2) => (x) => {
  const at = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2, y1, y2);
};
const RISE = bezier(0.22, 1, 0.36, 1);
const st = RISE_GROUPS.stories;
const left = (1 - RISE(Math.min(1, (RULE_FROM - st.start) / st.dur))) * st.dy;
check(left < 1.5, `the stories still have ${left.toFixed(2)}pt to rise when the rule starts drawing (spec: under 1.5)`);
console.log(`  stories left to rise at ${RULE_FROM} ms: ${left.toFixed(2)}pt`);
check(SM_FADE_FROM < HANDOFF_MS && HANDOFF_MS < DOCK_MS, 'the cross-fade must end at the hand-off, inside the clock');
check(TARGET_WAIT_MS <= 150 && SKIP_MS <= 200 && EXIT_MS === 280, 'the waits and the dissolve have drifted from the spec (150, 160, 280)');
check(near(DOCK_MS, 880, 0) && near(HANDOFF_MS, 600, 0), 'the Dock is 880 ms with its hand-off at 600');

if (fails.length) {
  console.error(`\n  check-intro-dock: ${fails.length} failure(s)\n`);
  for (const f of fails) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log('  check-intro-dock: the film-end rect and the timeline agree with the film and the spec.');
