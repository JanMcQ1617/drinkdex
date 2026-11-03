#!/usr/bin/env node
/* ==================================================================== */
/* Find friends without Instagram, v4.14 (specs/v4.14/find-friends.md): */
/* a pure check, no device, no React, no network, no database           */
/*                                                                      */
/* Four things the change rests on, each read out of the tree:          */
/*                                                                      */
/*   1. The section is gone from every screen that drew it: Find        */
/*      friends, the signup step (WelcomeConnect) and Settings' hint.   */
/*      None of its keys or lines is left anywhere in the app's code,   */
/*      and nothing imports the two files it was made of.               */
/*   2. What Jan kept is still there: Share invite link, Find by        */
/*      username and Everyone on Sipply, with contacts, Facebook and    */
/*      being findable by number, on both screens that show the column. */
/*   3. Nothing can claim or match a handle any more: no client call to */
/*      match_instagram, set_instagram_hash only ever sent null (and a  */
/*      server that has dropped it counts as done), and the signup      */
/*      drain no longer writes a parked handle.                         */
/*   4. What it left on a phone is forgotten. lib/discovery runs as it  */
/*      is, its one import (AsyncStorage) stood in for by a map:        */
/*      retireInstagram clears the list and the request stamp, takes    */
/*      back a handle only when this phone made one, keeps it to retry  */
/*      when the server cannot be reached, and touches nothing else;    */
/*      sign-out's clear still names the old keys.                      */
/*                                                                      */
/*   node specs/v4.14/find-friends.test.mjs                             */
/*                                                                      */
/* And the daily ideas, which this change first only reported on: none  */
/* may offer the import any more. friends-08 did ("Bring your Instagram */
/* friends") and opened Find friends, where it is gone; it was reworded */
/* in src/data/dailyIdeas.ts and its twin, specs/v4.3/ideas.mjs, in     */
/* build 40's review, and this now fails if a line like it comes back.  */
/* ==================================================================== */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const root = join(dirname(here), '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

let failed = 0;
const ok = (pass, line) => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${line}`);
};

/* Every .ts and .tsx under src, but src/data: the catalogue is another lane's (see the header). */
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) return rel === join('src', 'data') ? [] : walk(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
const app = walk('src').map((rel) => [relative(root, join(root, rel)), read(rel)]);

/* ---- 1. Gone from every screen ---- */

console.log('1. The Instagram section is gone from every screen that drew it\n');

ok(!existsSync(join(root, 'src/components/InstagramImport.tsx')), 'src/components/InstagramImport.tsx is gone');
ok(!existsSync(join(root, 'src/lib/instagram.ts')), 'src/lib/instagram.ts is gone');
{
  const importers = app.filter(([, src]) => /from '@\/(components\/InstagramImport|lib\/instagram)'/.test(src));
  ok(importers.length === 0, `nothing imports either (${importers.map(([f]) => f).join(', ') || 'none'})`);
}

/* Its heading, its keys and its lines, as the screen said them. */
const SECTION_COPY = [
  'Bring your Instagram friends',
  'Request your list',
  'Ask Instagram for your list',
  'Choose the download',
  'Open Instagram’s page',
  'Paste a list of usernames instead',
  'Find these people',
  'Let Instagram friends find you',
  'Let friends find you as @',
  'Your Instagram username',
  'Forget my imported list',
  'Import a newer list',
  'Instagram connections',
];
for (const line of SECTION_COPY) {
  const where = app.filter(([, src]) => src.includes(line)).map(([f]) => f);
  ok(where.length === 0, `"${line}" is said nowhere in the app${where.length ? ` (still in ${where.join(', ')})` : ''}`);
}
{
  const settings = read('src/app/settings.tsx');
  const hint = settings.slice(settings.indexOf('title="Find friends"'), settings.indexOf('</Section>', settings.indexOf('title="Find friends"')));
  ok(hint.includes("'Contacts, invites and search'") && !/Instagram/.test(hint), "Settings' Find friends hint no longer promises Instagram");
}

/* ---- 2. What stays ---- */

console.log('\n2. Share invite link, Find by username and Everyone on Sipply stay\n');

{
  const ff = read('src/components/FindFriends.tsx');
  for (const line of ['Share invite link', 'Find by username', 'Find from contacts', 'Let friends find you', 'Make me findable', 'Stop being findable']) {
    ok(ff.includes(line), `FindFriends still has "${line}"`);
  }
  ok(/<FacebookFriends \/>/.test(ff), 'and still draws Facebook (behind its own flag)');
  const screen = read('src/app/find-friends.tsx');
  ok(/<FindFriends \/>/.test(screen) && screen.includes('title="Everyone on Sipply"'), 'Find friends draws the column and Everyone on Sipply under it');
  ok(/<FindFriends \/>/.test(read('src/components/WelcomeConnect.tsx')), 'the signup step draws the same column');
}

/* ---- 3. No handle in or out ---- */

console.log('\n3. Nothing claims or matches a handle any more\n');

{
  const calls = app.flatMap(([f, src]) => [...src.matchAll(/rpc\('(match_instagram|set_instagram_hash)'[^)]*\)/g)].map((m) => [f, m[1], m[0]]));
  ok(!calls.some(([, fn]) => fn === 'match_instagram'), 'no client call to match_instagram');
  const sets = calls.filter(([, fn]) => fn === 'set_instagram_hash');
  ok(sets.length === 1 && /\{ hash: null \}/.test(sets[0][2]), 'set_instagram_hash is called once, and only ever with null');
  const clear = read('src/lib/social.ts').match(/export async function clearInstagramHash\(\)[\s\S]*?\n\}/)?.[0] ?? '';
  ok(/if \(error && !isMissingFunction\(error\)\) throw error;/.test(clear), 'and a server that has dropped it counts as withdrawn, not as a retry forever');
  const auth = read('src/store/auth.ts');
  ok(!/hashHandle|setInstagramHash|pending\.handle/.test(auth), 'the signup drain no longer writes a parked handle');
  ok(/void retireInstagram\(clearInstagramHash\)/.test(auth), 'the profile load runs retireInstagram with the clear');
}

/* ---- 4. What it left on a phone ---- */

console.log('\n4. What the import left on a phone is forgotten\n');

const discRel = 'src/lib/discovery.ts';
const discSrc = read(discRel);
const imports = [...discSrc.matchAll(/^import .+ from '([^']+)';$/gm)].map((m) => m[1]);
if (imports.join() !== '@react-native-async-storage/async-storage') {
  console.error(`find-friends.test: ${discRel} imports ${imports.join(', ')}; this check stands in for AsyncStorage alone`);
  process.exit(2);
}
const js = ts
  .transpileModule(discSrc, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: discRel,
  })
  .outputText.replace(
    /^import AsyncStorage from '@react-native-async-storage\/async-storage';$/m,
    'const AsyncStorage = globalThis.__asyncStorage;',
  );

/* AsyncStorage as far as discovery uses it: one map, the five calls. */
const store = new Map();
globalThis.__DEV__ = false;
globalThis.__asyncStorage = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => void store.set(k, String(v)),
  removeItem: async (k) => void store.delete(k),
  multiRemove: async (ks) => ks.forEach((k) => store.delete(k)),
};
const disc = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const LIST = 'clink-ig-connections';
const ASKED = 'clink-ig-requested';
const HANDLE = 'clink-ig-handle';
const PHONE = 'clink-my-phone';
const PENDING = 'clink-pending-claims';
const seed = (entries) => {
  store.clear();
  for (const [k, v] of Object.entries(entries)) store.set(k, v);
};
const keys = () => [...store.keys()].sort().join(',');

{
  seed({ [PHONE]: '5551234567' });
  let asked = 0;
  await disc.retireInstagram(async () => void asked++);
  ok(asked === 0 && keys() === PHONE, 'a phone that never used it: no round trip, and its number is left alone');
}
{
  seed({ [PHONE]: '5551234567', [LIST]: '[{"handle":"sarah.g"}]', [ASKED]: '{"userId":"u","at":1}', [HANDLE]: 'nico.pours' });
  let asked = 0;
  await disc.retireInstagram(async () => void asked++);
  ok(asked === 1 && keys() === PHONE, 'a phone that used it: the claim is taken back once, and the list, the stamp and the handle go');
}
{
  seed({ [LIST]: '[]', [ASKED]: '{}', [HANDLE]: 'nico.pours' });
  const offline = await disc.retireInstagram(async () => {
    throw new TypeError('Network request failed');
  }).then(
    () => false,
    () => true,
  );
  ok(offline && keys() === HANDLE, 'offline: the list and stamp still go, the handle stays for the next load');
  let asked = 0;
  await disc.retireInstagram(async () => void asked++);
  ok(asked === 1 && keys() === '', 'and the next load takes it back');
}
{
  seed({ [PHONE]: '5551234567', [PENDING]: '{}', [LIST]: '[]', [ASKED]: '{}', [HANDLE]: 'nico.pours', 'clink-pending-invite': 'x' });
  await disc.clearDiscoveryCache();
  ok(keys() === 'clink-pending-invite', "sign-out's clear still names every key the import wrote, and nothing it does not own");
}
{
  seed({ [PENDING]: JSON.stringify({ email: 'a@b.co', phone: '5551234567', handle: 'nico.pours' }) });
  await disc.dropParkedClaim('phone');
  ok(keys() === '', 'a number settled by hand takes its parked record with it, a legacy handle included');
  seed({ [PENDING]: JSON.stringify({ email: 'a@b.co', handle: 'nico.pours' }) });
  await disc.dropParkedClaim('phone');
  ok(keys() === PENDING, 'a record with no number is left for the drain, which lets it go');
}

/* ---- 5. No daily idea offers it ---- */

console.log('\n5. No daily idea offers the import\n');
{
  for (const rel of ['src/data/dailyIdeas.ts', 'specs/v4.3/ideas.mjs']) {
    const offers = read(rel)
      .split('\n')
      .filter((l) => /id: '/.test(l) && /Instagram/.test(l))
      .map((l) => l.match(/id: '([^']+)'/)[1]);
    ok(offers.length === 0, `no daily idea in ${rel} names Instagram${offers.length ? ` (${offers.join(', ')})` : ''}`);
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nThe Instagram section is gone from every screen, what Jan kept stays, no handle goes in or out, and what it left on a phone is forgotten.');
