#!/usr/bin/env node
/* ==================================================================== */
/* Tournaments, v4.11 (specs/v4.11/tournaments.md): a pure check, no    */
/* device, no React, no network                                         */
/*                                                                      */
/* Three things the change rests on, each read out of the tree:         */
/*                                                                      */
/*   1. The calendar stays inside the server. lib/tournamentWindow is   */
/*      run as it is, in seven time zones (one with no clock change,    */
/*      Jan's; the US's, the UK's, a half-hour one; India's half hour   */
/*      off UTC; New Zealand's; UTC), from moments that matter (now,    */
/*      just after and just before midnight, beside each clock          */
/*      change, across a year's end). Every first and last day the      */
/*      calendar ENABLES is turned into the two instants Create sends,  */
/*      Create pressed up to nine minutes after the sheet opened (past  */
/*      midnight or not) and a server clock two minutes either side of  */
/*      the phone's, and must                                           */
/*      pass a model of create_tournament's checks (migration 020): a   */
/*      start from now - 5 minutes to now + 30 days, a window of 1 to   */
/*      31 days, a goal of 2 to 100 and at most 3 x ceil(days). So must */
/*      the stepper's ceiling, and the ceiling must be tight (one more  */
/*      is out of reach or refused). The pages reach every enabled day. */
/*      And what Create sends is what the sheet showed (toSend): the    */
/*      goal on screen, from the first day on screen. A press that      */
/*      would send anything else sends nothing (never one pressed at    */
/*      once), and the sheet, caught up (caughtUp), sends as it shows.  */
/*   2. The taps: first, then last; before the first starts again; a    */
/*      whole range's next tap starts again; the default is today to    */
/*      today + 6. And the two presses review found: a week opened at   */
/*      23:50 and pressed at 00:05, and (New York) one opened beside    */
/*      the March change and pressed after its lost hour, each of which */
/*      sent a smaller goal than the "max" on screen.                   */
/*   3. The rules survive the cut. The sentence every tournament screen */
/*      showed is kept word for word in the "i" key's sheet; the one    */
/*      line on screen still says no prizes, that Apple is not a        */
/*      sponsor, and to drink responsibly; every tournament screen      */
/*      draws them; and the build's review notes say what the screens   */
/*      show, inside App Store Connect's 4,000 characters.              */
/*                                                                      */
/*   node specs/v4.11/tournaments.test.mjs                              */
/*                                                                      */
/* lib/tournamentWindow is transpiled with the project's own            */
/* `typescript`, as shop.test loads shopCore: what runs is the app's    */
/* code, not a copy. Each zone is its own child process (TZ is read     */
/* once, when Node starts).                                             */
/* ==================================================================== */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(import.meta.url);
const root = join(dirname(here), '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/* ==================================================================== */
/* The child: one zone                                                  */
/* ==================================================================== */

if (process.argv[2] === '--zone') {
  const win = await import(pathToFileURL(process.argv[3]).href);
  const MIN = 60_000;
  const DAY = 86_400_000;

  /** create_tournament's checks (020), on the instants it is sent and the server's own now. */
  const server = (startsAt, endsAt, target, now) => {
    if (startsAt < now - 5 * MIN || startsAt > now + 30 * DAY) return 'invalid_dates';
    const span = endsAt - startsAt;
    if (span < DAY || span > 31 * DAY) return 'invalid_dates';
    if (target !== null && (target < 2 || target > 100 || target > 3 * Math.ceil(span / DAY))) return 'invalid_goal';
    return 'ok';
  };

  /** Local moments, in this zone: the sheet opening. */
  const moments = [
    [2026, 9, 30, 14, 0], // the day this was written; the US clock change is 1 Nov
    [2026, 9, 30, 0, 1],
    [2026, 9, 30, 0, 20],
    [2026, 9, 30, 23, 40],
    [2026, 9, 30, 23, 55], // Create pressed after midnight
    [2026, 9, 2, 12, 0], // Lord Howe's change, 4 Oct
    [2026, 11, 15, 8, 0], // across the year's end
    [2027, 1, 20, 10, 0], // the US's March change, 14 Mar
    [2027, 2, 1, 23, 30],
    [2027, 2, 25, 9, 0], // the UK's, 28 Mar
  ].map(([y, m, d, h, mi]) => new Date(y, m, d, h, mi));

  const out = {
    enabled: 0,
    refused: [],
    differs: [],
    held: 0,
    heldAtOnce: [],
    stuck: [],
    tight: 0,
    loose: [],
    acceptedButOff: 0,
    unreachable: [],
    months: 0,
    pages: moments.length * 3,
  };
  for (const opened of moments) {
    const today = win.dayOf(opened);
    const limit = win.lastReachableDay(opened).getTime();
    for (let a = 0; a <= 32; a++) {
      const first = win.addDays(today, a);
      for (let b = 0; b <= 33; b++) {
        const last = win.addDays(first, b);
        const on = win.canEndOn(first, last, opened);
        // What the server would take from a sheet that waited for nothing.
        const bare = win.windowFor(first, last, opened);
        const wouldTake = server(bare.startsAt.getTime(), bare.endsAt.getTime(), null, opened.getTime()) === 'ok';
        if (!on) {
          if (wouldTake) out.acceptedButOff++;
          continue;
        }
        out.enabled++;
        if (last.getTime() > limit) out.unreachable.push(`${first.toDateString()} to ${last.toDateString()}`);
        const shownMax = win.maxGoal(first, last, opened);
        const label = `${opened.toString()} | ${first.toDateString()} to ${last.toDateString()}`;
        for (const wait of [0, 4 * MIN, 9 * MIN]) {
          const at = new Date(opened.getTime() + wait);
          for (const ask of [null, 2, 10, 100, shownMax]) {
            // The goal the sheet shows (GoalPicker's figure), and what Create sends for it.
            const shown = ask === null ? null : (win.clampGoal(ask, shownMax) ?? 2);
            const sent = win.toSend({ first, last }, shown, at);
            if (sent === null) {
              /*
               * Held: nothing sent, the sheet catches up with the press.
               * Never on a press at once; and what it then shows, pressed
               * at once, is sent as shown and accepted.
               */
              out.held++;
              if (wait === 0) out.heldAtOnce.push(`${label} | goal ${shown}`);
              const next = win.caughtUp({ first, last }, at);
              if (next.last) {
                const reshown = ask === null ? null : (win.clampGoal(ask, win.maxGoal(next.first, next.last, at)) ?? 2);
                const again = win.toSend({ first: next.first, last: next.last }, reshown, at);
                if (!again || server(again.startsAt.getTime(), again.endsAt.getTime(), again.target, at.getTime()) !== 'ok') {
                  out.stuck.push(`${label} | wait ${wait / MIN}m goal ${shown}`);
                }
              }
              continue;
            }
            // What is sent is what was shown: the goal on screen, from the first day on screen.
            if (sent.target !== shown || !win.sameDay(sent.startsAt, first)) {
              out.differs.push(`${label} | wait ${wait / MIN}m | shown ${shown} sent ${sent.target} from ${sent.startsAt.toString()}`);
            }
            for (const skew of [-2 * MIN, 0, 2 * MIN]) {
              const answer = server(sent.startsAt.getTime(), sent.endsAt.getTime(), sent.target, at.getTime() + skew);
              if (answer !== 'ok') out.refused.push(`${label} | wait ${wait / MIN}m skew ${skew / MIN}m goal ${sent.target}: ${answer}`);
            }
          }
        }
        // Tight: one over the ceiling is past 3 a day for the days picked, or refused.
        const over = shownMax + 1;
        const days = win.rangeDays(first, last);
        if (over > 100 || over > 3 * days || server(bare.startsAt.getTime(), bare.endsAt.getTime(), over, opened.getTime()) !== 'ok') out.tight++;
        else out.loose.push(`${first.toDateString()} to ${last.toDateString()}: ceiling ${shownMax}`);
      }
    }
    // Every month the pages show is whole: weeks of 7, every day once.
    for (let m = 0; m < 3; m++) {
      const page = new Date(today.getFullYear(), today.getMonth() + m, 1);
      const weeks = win.monthWeeks(page.getFullYear(), page.getMonth());
      const days = weeks.flat().filter(Boolean);
      const count = new Date(page.getFullYear(), page.getMonth() + 1, 0).getDate();
      if (weeks.every((w) => w.length === 7) && days.length === count && days.every((d, i) => d.getDate() === i + 1)) out.months++;
    }
  }

  /* 2. The taps (in this zone, from the first moment). */
  const opened = moments[0];
  const today = win.dayOf(opened);
  const taps = [];
  const def = win.defaultRange(opened);
  taps.push(['opens on today to today + 6', win.sameDay(def.first, today) && win.rangeDays(def.first, def.last) === 7]);
  let r = win.pickDay(def, win.addDays(today, 3), opened);
  taps.push(['a tap on a whole range starts again from that day', win.sameDay(r.first, win.addDays(today, 3)) && r.last === null]);
  r = win.pickDay(r, win.addDays(today, 9), opened);
  taps.push(['the next tap is the last day', r.last !== null && win.sameDay(r.last, win.addDays(today, 9))]);
  r = win.pickDay({ first: win.addDays(today, 5), last: null }, win.addDays(today, 2), opened);
  taps.push(['a tap before the first starts again from it', win.sameDay(r.first, win.addDays(today, 2)) && r.last === null]);
  r = win.pickDay({ first: today, last: null }, win.addDays(today, -1), opened);
  taps.push(['yesterday does nothing', win.sameDay(r.first, today) && r.last === null && !win.canPick({ first: today, last: null }, win.addDays(today, -1), opened)]);
  r = win.pickDay({ first: today, last: null }, today, opened);
  taps.push(['today as its own last day does not end the range (under a day from now)', r.last === null]);
  r = win.pickDay({ first: win.addDays(today, 3), last: null }, win.addDays(today, 3), opened);
  taps.push(['a later single day is a whole range (24 hours)', r.last !== null && win.rangeDays(r.first, r.last) === 1]);
  taps.push(['no start past the server\'s 30 days', !win.canStartOn(win.addDays(today, 31), opened)]);
  out.taps = taps;

  /*
   * 3. The two presses review found (each zone runs the first; New York
   *    the second): a week opened at 23:50 and pressed at 00:05, and a
   *    week opened beside the March change and pressed after its hour.
   *    Both used to send a smaller goal than the "max" on screen.
   */
  const sends = [];
  {
    const late = new Date(2026, 9, 30, 23, 50);
    const week = win.defaultRange(late);
    const whole = { first: week.first, last: week.last };
    const shown = win.maxGoal(whole.first, whole.last, late);
    const at = new Date(2026, 9, 31, 0, 5);
    const next = win.caughtUp(week, at);
    sends.push([
      'past midnight: Create sends nothing, and the sheet catches up to start today, same last day',
      win.toSend(whole, shown, at) === null &&
        win.toSend(whole, null, at) === null &&
        win.sameDay(next.first, win.dayOf(at)) &&
        next.last !== null &&
        win.sameDay(next.last, whole.last),
    ]);
  }
  if (process.env.TZ === 'America/New_York') {
    const opened = new Date(2027, 2, 13, 22, 50);
    const week = win.defaultRange(opened);
    const whole = { first: week.first, last: week.last };
    const shown = win.maxGoal(whole.first, whole.last, opened);
    const soon = win.toSend(whole, shown, new Date(2027, 2, 13, 22, 55));
    const late = win.toSend(whole, shown, new Date(2027, 2, 13, 23, 1));
    sends.push([
      `the March change: "max ${shown}" is sent as ${soon?.target} at 22:55, and nothing is sent at 23:01`,
      shown === 21 && soon?.target === 21 && late === null && win.toSend(whole, null, new Date(2027, 2, 13, 23, 1)) !== null,
    ]);
  }
  out.sends = sends;

  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

/* ==================================================================== */
/* The parent                                                           */
/* ==================================================================== */

const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

let failed = 0;
const ok = (pass, line) => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${line}`);
};

/* ---- 1. The calendar against the server, zone by zone ---- */

console.log('1. The calendar stays inside create_tournament (migration 020)\n');

const winRel = 'src/lib/tournamentWindow.ts';
const winSrc = read(winRel);
if (/^\s*import\s/m.test(winSrc)) {
  console.error(`tournaments.test: ${winRel} imports something; it must stay pure for this check`);
  process.exit(2);
}
const js = ts.transpileModule(winSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: winRel,
}).outputText;
const dir = mkdtempSync(join(tmpdir(), 'sipply-tournaments-'));
const mod = join(dir, 'tournamentWindow.mjs');
writeFileSync(mod, js);

const ZONES = [
  'America/Puerto_Rico',
  'America/New_York',
  'Europe/London',
  'Australia/Lord_Howe',
  'Asia/Kolkata',
  'Pacific/Auckland',
  'UTC',
];
try {
  for (const zone of ZONES) {
    const out = JSON.parse(
      execFileSync(process.execPath, [here, '--zone', mod], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }),
    );
    ok(
      out.refused.length === 0,
      `${zone}: ${out.enabled} enabled ranges, each accepted with its goals${out.refused.length ? `; refused: ${out.refused.slice(0, 3).join('; ')}` : ''}`,
    );
    ok(
      out.differs.length === 0,
      `${zone}: Create sends the goal shown, from the first day shown${out.differs.length ? ` (differs: ${out.differs.slice(0, 2).join('; ')})` : ''}`,
    );
    ok(
      out.heldAtOnce.length === 0 && out.stuck.length === 0,
      `${zone}: ${out.held} presses held back for the sheet to catch up, none pressed at once, each sent as shown once caught up${out.heldAtOnce.length || out.stuck.length ? ` (at once: ${out.heldAtOnce.slice(0, 2).join('; ')}; stuck: ${out.stuck.slice(0, 2).join('; ')})` : ''}`,
    );
    ok(out.loose.length === 0, `${zone}: the goal ceiling is tight on every one${out.loose.length ? ` (loose: ${out.loose.slice(0, 2).join('; ')})` : ''}`);
    ok(out.unreachable.length === 0, `${zone}: the month pages reach every enabled last day`);
    ok(out.months === out.pages, `${zone}: every month drawn is whole, weeks of seven (${out.months} of ${out.pages})`);
    console.log(`      (${out.acceptedButOff} ranges the server would take are held back by the slack: a start in the last hour of its 30 days, or one within ten minutes that runs under a day and ten minutes)`);
    for (const [what, pass] of out.taps) if (zone === ZONES[0] || !pass) ok(pass, `${zone}: ${what}`);
    for (const [what, pass] of out.sends) ok(pass, `${zone}: ${what}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

/* ---- 2. The words that must survive the cut ---- */

console.log('\n2. The rules survive the cut\n');

const rowSrc = read('src/components/tournaments/TournamentRow.tsx');
const SENTENCE =
  'Each different drink you post while it runs adds one entry, up to ${cap} a day. ' +
  'Entries are counted, never amounts. No prizes, and Apple is not a sponsor. Please drink responsibly.';
const built = rowSrc.match(/export function tournamentRulesText[\s\S]*?return \(\s*`([^`]*)` \+\s*'([^']*)'\s*\);/);
ok(built !== null && built[1] + built[2] === SENTENCE, "the full rules are the sentence every screen showed, word for word (tournamentRulesText)");
ok(
  /export const RULES_LINE = 'No prizes · Apple is not a sponsor · Drink responsibly';/.test(rowSrc),
  'the one line on screen says no prizes, that Apple is not a sponsor, and to drink responsibly (RULES_LINE)',
);
const rulesFn = rowSrc.match(/export function TournamentRules\([\s\S]*?\n\}\n/)?.[0] ?? '';
ok(
  /\{RULES_LINE\}/.test(rulesFn) &&
    /accessibilityLabel="Tournament rules"/.test(rulesFn) &&
    /<Icon name="info"/.test(rulesFn) &&
    /<BottomSheet[\s\S]*\{tournamentRulesText\(cap\)\}[\s\S]*<\/BottomSheet>/.test(rulesFn),
  'TournamentRules draws the line, the "i" key, and the sheet with the full rules',
);
for (const rel of [
  'src/app/tournaments/index.tsx',
  'src/app/tournaments/[id].tsx',
  'src/app/tournaments/new.tsx',
  'src/components/tournaments/FriendsBoard.tsx',
]) {
  ok(/<TournamentRules\b/.test(read(rel)), `${rel} draws the rules`);
}
ok(
  /<TournamentRules cap=\{board\.dailyCap\}/.test(read('src/app/tournaments/[id].tsx')),
  "a tournament's page states the cap its server returned",
);

/* ---- 3. The notes say what the screens show ---- */

console.log('\n3. Review notes and What to Test\n');

for (const rel of ['specs/v4.11/review-notes-37.txt', 'specs/v4.11/wtt-37.txt']) {
  const n = [...read(rel)].length;
  ok(n <= 4000, `${rel}: ${n.toLocaleString('en-US')} characters, App Store Connect's 4,000 at most`);
}
const notes = read('specs/v4.11/review-notes-37.txt');
const para = notes.split('\n').find((l) => l.startsWith('Tournaments.')) ?? '';
ok(para.includes('"No prizes · Apple is not a sponsor · Drink responsibly"'), 'the notes quote the line on screen exactly');
ok(/"i"/.test(para) && para.includes('Apple is not a sponsor. Please drink responsibly.'), 'the notes say where the full rules are, and quote them');
ok(/3 entries a day/.test(para) && /amounts are never counted/.test(para), 'the notes keep the 3-a-day cap and that amounts are never counted');
ok(/calendar/i.test(para) && /First to/.test(para), 'the notes describe the calendar and the custom goal');

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nThe calendar and the stepper stay inside the server in every zone, and the rules and their notes survive the cut.');
