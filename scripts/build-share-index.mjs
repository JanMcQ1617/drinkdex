#!/usr/bin/env node
/**
 * Builds docs/c/drinks.json, the name index the shared-collection web page
 * reads (specs/v4.2/spec.md §4.8, "On the web").
 *
 * WHY THE PAGE NEEDS ITS OWN INDEX. A shared link answers with catalogue
 * ids and nothing else: get_shared_collection (migration 023) returns
 * `drink_id`s, because the app ships the catalogue and the server never
 * held drink names. The page at janmcq1617.github.io/drinkdex/c/ has no
 * app behind it, so it needs the three facts a row shows, per id:
 *
 *   { "<id>": [dexNumber, name, style] }
 *
 * and nothing more: no description, no photo, no recipe. The whole of
 * drinks.json is 4 MB; this is about 100 KB, which a phone on a bar's
 * wifi fetches as fast as the RPC itself.
 *
 * WHY THE STYLE IS THE APP'S WORDING. The catalogue stores styles in Title
 * Case ("Modern Classic", "Spirit-Forward"); the app never shows them that
 * way (check-design rule 8), it says them through lib/drinkLabels'
 * styleLabel ("Modern classic"). So the index carries the subcategory as
 * styleLabel says it, worked out here by transpiling that file with the
 * project's own `typescript`, as check-recommend does for lib/bar. The
 * page then prints what it is given, and a friend on the web reads the
 * same words as the person who shared the link. If drinkLabels' wording
 * changes, --check fails until this is re-run.
 *
 * ONE ENTRY PER LINE, in Dex order, so a catalogue edit shows in a diff as
 * the lines it changed rather than one 100 KB line.
 *
 * THE PAGE'S TWO CONSTANTS. docs/c/index.html carries the project URL and
 * the publishable key the app ships (.env, EXPO_PUBLIC_SUPABASE_URL and
 * EXPO_PUBLIC_SUPABASE_KEY), because Pages serves the file as it is and
 * there is no build step to inline them. Every run checks that they match
 * .env, so a rotated key cannot leave the web page calling with the old
 * one, and refuses the page outright if it ever holds anything that is not
 * a publishable key: a secret key (sb_secret_…) or a service_role JWT on a
 * public page would hand anyone the whole database, RLS bypassed. The
 * script never edits the page: a key on a public page is pasted by a
 * person who meant to.
 *
 * Run after any catalogue change (drinks.json is generated):
 *
 *   node scripts/build-share-index.mjs           # write docs/c/drinks.json, check the page
 *   node scripts/build-share-index.mjs --check   # write nothing; exit 1 if either is out of step
 */

import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const at = (p) => `${ROOT}${p}`;
const read = (p) => readFileSync(at(p), 'utf8');

const OUT = 'docs/c/drinks.json';
const PAGE = 'docs/c/index.html';
const CHECK = process.argv.includes('--check');

const failures = [];
const fail = (msg) => failures.push(msg);

/* ------------------------------------------------------------------ */
/* The app's own style wording                                         */
/* ------------------------------------------------------------------ */

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

/*
 * drinkLabels imports one runtime thing, the glass shapes, which styleLabel
 * never touches; it is stubbed so the module loads in Node. Anything else
 * it starts importing stops the script, rather than loading half a module.
 */
const labelsJs = ts
  .transpileModule(read('src/lib/drinkLabels.ts'), {
    fileName: 'drinkLabels.ts',
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  })
  .outputText.replace(
    /from ['"]@\/components\/artwork\/glasses['"]/,
    `from '${dataUrl('export function resolveShape() { return null; }')}'`,
  );
if (/from ['"]@\//.test(labelsJs) || /\brequire\(/.test(labelsJs)) {
  console.error('  FAIL  src/lib/drinkLabels.ts imports something this script does not stub');
  process.exit(1);
}
const { styleLabel } = await import(dataUrl(labelsJs));
if (typeof styleLabel !== 'function') {
  console.error('  FAIL  src/lib/drinkLabels.ts no longer exports styleLabel');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

const DRINKS = JSON.parse(read('src/data/drinks.json'))
  .slice()
  .sort((a, b) => a.dexNumber - b.dexNumber);

const seenIds = new Set();
const seenNumbers = new Set();
for (const d of DRINKS) {
  if (typeof d.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(d.id)) fail(`a drink has an id the page cannot key on: ${JSON.stringify(d.id)}`);
  if (seenIds.has(d.id)) fail(`id ${d.id} appears twice`);
  if (!Number.isInteger(d.dexNumber) || d.dexNumber < 1) fail(`${d.id} has no whole Dex number`);
  if (seenNumbers.has(d.dexNumber)) fail(`Dex number ${d.dexNumber} appears twice`);
  if (typeof d.name !== 'string' || !d.name.trim()) fail(`${d.id} has no name`);
  if (typeof d.subcategory !== 'string') fail(`${d.id} has no subcategory`);
  seenIds.add(d.id);
  seenNumbers.add(d.dexNumber);
}

function indexText() {
  const lines = DRINKS.map((d) => `${JSON.stringify(d.id)}:${JSON.stringify([d.dexNumber, d.name, styleLabel(d.subcategory)])}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

const text = indexText();
const before = existsSync(at(OUT)) ? read(OUT) : null;

if (CHECK) {
  if (before === null) fail(`${OUT} is missing: run node scripts/build-share-index.mjs`);
  else if (before !== text) fail(`${OUT} is out of step with drinks.json (or with lib/drinkLabels): run node scripts/build-share-index.mjs`);
} else if (failures.length) {
  // A drink the checks above refused would go out as a row of nulls (or two rows on one id): leave the published index as it is.
  console.error(`  ${OUT} not written: the catalogue has the problems below`);
} else if (before !== text) {
  mkdirSync(at('docs/c'), { recursive: true });
  writeFileSync(at(OUT), text);
  console.log(`  wrote ${OUT}`);
}

/* ------------------------------------------------------------------ */
/* The page's URL and key                                              */
/* ------------------------------------------------------------------ */

function envValue(src, name) {
  const m = src.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : null;
}

/** True for a value that is safe on a public page: a publishable key, or a legacy JWT whose role is anon. */
function isPublishable(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch {
    return false;
  }
}

if (!existsSync(at(PAGE))) {
  fail(`${PAGE} is missing`);
} else {
  const page = read(PAGE);
  const env = existsSync(at('.env')) ? read('.env') : '';
  const envUrl = envValue(env, 'EXPO_PUBLIC_SUPABASE_URL');
  const envKey = envValue(env, 'EXPO_PUBLIC_SUPABASE_KEY');
  const pageUrl = page.match(/const SUPABASE_URL = '([^']*)';/)?.[1] ?? null;
  const pageKey = page.match(/const SUPABASE_KEY = '([^']*)';/)?.[1] ?? null;

  // Before anything else: nothing secret on a public page, wherever it sits.
  if (/sb_secret_/.test(page)) fail(`${PAGE} contains a secret key (sb_secret_…): remove it now, and rotate it in Supabase`);
  for (const jwt of page.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    if (!isPublishable(jwt)) fail(`${PAGE} contains a JWT that is not the anon key: remove it now, and rotate it in Supabase`);
  }

  if (!envUrl || !envKey) fail('.env has no EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY to check the page against');
  if (pageUrl === null || pageKey === null) {
    fail(`${PAGE} has no "const SUPABASE_URL = '…';" and "const SUPABASE_KEY = '…';" lines`);
  } else {
    if (!isPublishable(pageKey)) fail(`${PAGE}'s SUPABASE_KEY is not a publishable key`);
    if (envUrl && pageUrl !== envUrl) fail(`${PAGE}'s SUPABASE_URL is not .env's EXPO_PUBLIC_SUPABASE_URL: paste it in`);
    if (envKey && pageKey !== envKey) fail(`${PAGE}'s SUPABASE_KEY is not .env's EXPO_PUBLIC_SUPABASE_KEY: paste it in`);
    // The page's Content-Security-Policy lets it connect to one origin besides its own; a new URL needs it there too.
    const connect = page.match(/connect-src ([^;"]*)/)?.[1].split(/\s+/) ?? [];
    const origin = URL.canParse(pageUrl) ? new URL(pageUrl).origin : null;
    if (!origin) fail(`${PAGE}'s SUPABASE_URL is not a URL: ${JSON.stringify(pageUrl)}`);
    else if (!connect.includes(origin)) fail(`${PAGE}'s Content-Security-Policy connect-src does not allow ${pageUrl}: the page could not reach it`);
  }
}

/* ------------------------------------------------------------------ */

if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log(
  `  PASS  ${OUT}: ${DRINKS.length.toLocaleString('en-US')} drinks, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB, in step; ${PAGE} calls the app's project with its publishable key`,
);
