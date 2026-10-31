#!/usr/bin/env node
/* ==================================================================== */
/* Join codes, v4.12 (specs/v4.12/join-codes.md): a pure check, no      */
/* device, no React, no network, no database                            */
/*                                                                      */
/* Four things the change rests on, each read out of the tree:          */
/*                                                                      */
/*   1. The code is one code on both sides. lib/tournamentCode runs as  */
/*      it is: its alphabet is 31 characters with nothing that can be    */
/*      misread (no 0, O, 1, I or L) and is the migration's, character  */
/*      for character; every shape check in 028 and schema.sql takes     */
/*      exactly those 31; the generator draws without bias; what a      */
/*      typed or pasted code becomes matches the server's own           */
/*      tournament_code_norm (a model of it, fuzzed), and a paste of     */
/*      the whole share message or its link gives its code.            */
/*   2. The answers are read, not trusted, and 028 missing reads as     */
/*      "no codes": the probe, the lookup and the join say              */
/*      'unsupported' or false, the host sheet then needs an invite as  */
/*      before (inviteRequired), a create with nobody refused by 020 is */
/*      read as the same (createSaysNoCodes), and the screens draw what */
/*      they should for each: no boxes without 028, no code card       */
/*      without a code, the old create path without one.               */
/*   3. Migration 028's contract: every function pins search_path, the  */
/*      RPCs are definers granted to authenticated alone, the helpers   */
/*      to nobody; create_tournament keeps 020's signature and uuid;    */
/*      joining inserts only 'accepted', which 027's invite push never  */
/*      fires for; the twenty misses are counted before the lookup;     */
/*      blocks are read for the host and for everyone in it or asked;   */
/*      the seat cap is 020's 50; the last statement is the record;     */
/*      schema.sql and database.types carry all of it.                  */
/*   4. The notes: build 38's review notes keep every v4.11 promise and */
/*      say people can join with a code, and What to Test leads with    */
/*      Join with code and keeps the Current place line, each inside    */
/*      App Store Connect's 4,000 characters.                           */
/*                                                                      */
/*   node specs/v4.12/join-codes.test.mjs                               */
/*                                                                      */
/* lib/tournamentCode is transpiled with the project's own `typescript`, */
/* as tournaments.test loads tournamentWindow: what runs is the app's    */
/* code, not a copy.                                                    */
/* ==================================================================== */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/* ---- Load the app's pure half ---- */

const codeRel = 'src/lib/tournamentCode.ts';
const codeSrc = read(codeRel);
if (/^\s*import\s/m.test(codeSrc)) {
  console.error(`join-codes.test: ${codeRel} imports something; it must stay pure for this check`);
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), 'sipply-join-codes-'));
let app;
try {
  const js = ts.transpileModule(codeSrc, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: codeRel,
  }).outputText;
  const mod = join(dir, 'tournamentCode.mjs');
  writeFileSync(mod, js);
  app = await import(pathToFileURL(mod).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const MIG_PATH = 'supabase/migrations/028_tournament_join_codes.sql';
const mig = read(MIG_PATH);
/** The migration without its comment lines: what Postgres runs. */
const sql = mig
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const schema = read('supabase/schema.sql');

/* ==================================================================== */
/* 1. One code on both sides                                            */
/* ==================================================================== */

console.log('1. The code\n');

const ALL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Every character a person could type that is a figure or a letter, each once. */
const TYPABLE = `${ALL}abcdefghijklmnopqrstuvwxyz`;
const MISREAD = ['0', 'O', '1', 'I', 'L'];
const expected = [...ALL].filter((c) => !MISREAD.includes(c)).join('');
ok(app.CODE_ALPHABET === expected, `the alphabet is 2-9 and A-Z without I, L and O: ${app.CODE_ALPHABET.length} characters`);
ok(new Set(app.CODE_ALPHABET).size === 31 && app.CODE_LENGTH === 6, 'six of 31, each once');
ok(31 ** 6 === 887_503_681, `31^6 = ${(31 ** 6).toLocaleString('en-US')} codes`);

const abc = /abc\s+constant text := '([^']+)'/.exec(sql)?.[1];
ok(abc === app.CODE_ALPHABET, `028's generator draws from the app's alphabet (${abc})`);

// Every shape check, in 028 and in schema.sql, takes exactly the 31 (case-sensitive: stored upper).
const shapes = [...new Set([...sql.matchAll(/'\^\[([^\]]+)\]\{6\}\$'/g), ...schema.matchAll(/'\^\[([^\]]+)\]\{6\}\$'/g)].map((m) => m[1]))];
const classOk = (cls) => {
  const re = new RegExp(`^[${cls}]$`);
  const takes = [...TYPABLE].filter((c) => re.test(c)).join('');
  return takes === app.CODE_ALPHABET;
};
ok(shapes.length === 1 && classOk(shapes[0]), `every shape check is one class, [${shapes.join('], [')}], and takes the 31 and nothing else`);
ok(
  [...TYPABLE].every((c) => app.isJoinCode(c.repeat(6)) === app.CODE_ALPHABET.includes(c)),
  'the app takes a code of exactly those characters (upper case)',
);
ok(!app.isJoinCode('ABC23') && !app.isJoinCode('ABC2345') && !app.isJoinCode(''), 'and exactly six of them');

// The generator: one byte per character, bytes of 248 and over drawn again.
ok(256 - (256 % 31) === 248 && /if b < 248 then/.test(sql) && /substr\(abc, b % 31 \+ 1, 1\)/.test(sql), 'the generator keeps bytes under 248 (31 x 8), so every character is equally likely');
{
  // Run the generator's arithmetic over every byte: each character exactly 8 times.
  const counts = new Map();
  for (let b = 0; b < 248; b++) {
    const ch = app.CODE_ALPHABET[b % 31];
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  ok([...counts.values()].every((n) => n === 8) && counts.size === 31, 'over the 248 bytes kept, each of the 31 comes 8 times');
}
ok(/gen_random_uuid\(\)/.test(sql) && !/\brandom\(\)/.test(sql), 'drawn from gen_random_uuid (pg_strong_random), never random()');
ok(/public\.is_objectionable\(code, true\)/.test(sql), 'a code the content filter would refuse is drawn again');

// What a typed code becomes, against a model of 028's tournament_code_norm.
const serverNorm = (s) => {
  const c = String(s ?? '').replace(/[\s-]+/g, '').toUpperCase();
  return /^[2-9A-HJKMNP-Z]{6}$/.test(c) ? c : null;
};
ok(/upper\(regexp_replace\(coalesce\(p_code, ''\), '\[\[:space:\]-\]\+', '', 'g'\)\)/.test(sql), "028 upper-cases and drops spaces and dashes (the model's rule)");
const typed = [
  ['abc234', 'ABC234'],
  ['abc 234', 'ABC234'],
  ['ABC-234', 'ABC234'],
  [' a b c 2 3 4 ', 'ABC234'],
  ['abc2345', 'ABC234'],
  ['O0I1L', ''],
  ['zz', 'ZZ'],
  ['Join my Sipply tournament "Negroni week": code K7MPQ2\nWith the app, this link opens it: drinkdex://join/K7MPQ2', 'K7MPQ2'],
  ['Join our Sipply tournament "Dress code": code HX4R9T\nWith the app, this link opens it: exp://192.168.1.4:8081/--/join/HX4R9T', 'HX4R9T'],
  ['drinkdex://join/hx4r9t', 'HX4R9T'],
  ['code: w2w2w2', 'W2W2W2'],
  ['STREAM night: code ABC234', 'ABC234'],
];
for (const [raw, want] of typed) {
  const got = app.typedCode(raw);
  ok(got === want, `typed ${JSON.stringify(raw.length > 40 ? `${raw.slice(0, 40)}…` : raw)} → ${JSON.stringify(got)}`);
}
ok(app.typedCode('ABC234XYZ789', 'ABC234') === 'XYZ789', 'a paste into full boxes replaces them');
ok(app.typedCode('ABC2345', 'ABC234') === 'ABC234', 'a seventh character typed into full boxes does not land');
{
  // Fuzz: anything made of the 31 (either case), spaces and dashes reads the same on both sides.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pool = `${app.CODE_ALPHABET}${app.CODE_ALPHABET.toLowerCase()}  --`;
  let agree = 0;
  let disagree = [];
  for (let i = 0; i < 5000; i++) {
    let s = '';
    const n = 6 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) s += pool[Math.floor(rnd() * pool.length)];
    const server = serverNorm(s);
    if (server === null) continue;
    if (app.typedCode(s) === server) agree++;
    else disagree.push(s);
  }
  ok(disagree.length === 0 && agree > 500, `${agree} codes typed in either case with spaces and dashes read as the server reads them${disagree.length ? ` (differ: ${disagree.slice(0, 3).join(' | ')})` : ''}`);
}
ok(
  app.codeFromLink('hx4r9t') === 'HX4R9T' && app.codeFromLink('HX4%20R9T') === 'HX4R9T' && app.codeFromLink('') === null &&
    app.codeFromLink('HX4R9') === null && app.codeFromLink('%E0%A4%A') === null,
  "a join link's code: any case, an escaped space, and nothing (or a stray %) without throwing",
);
ok(app.spokenCode('K7MPQ2') === 'K 7 M P Q 2', 'VoiceOver hears it one character at a time');
{
  const host = app.joinCodeMessage({ name: 'Negroni week', code: 'K7MPQ2', url: 'drinkdex://join/K7MPQ2', hosting: true });
  const member = app.joinCodeMessage({ name: 'Negroni week', code: 'K7MPQ2', url: 'drinkdex://join/K7MPQ2', hosting: false });
  ok(
    host.startsWith('Join my Sipply tournament "Negroni week": code K7MPQ2') && member.startsWith('Join our ') && host.includes('drinkdex://join/K7MPQ2'),
    `the shared text: ${JSON.stringify(host)}`,
  );
  ok(app.typedCode(host) === 'K7MPQ2', 'and pasted back whole, it gives its code');
  ok(!/!|\bdrink(s|ing)?\b|\bshots?\b/i.test(host.replace('Sipply', '')), 'it says nothing about drinking (App Review 1.4.3)');
}

/* ==================================================================== */
/* 2. Reading the answers, and the screens while 028 is missing         */
/* ==================================================================== */

console.log('\n2. The answers, and 028 missing\n');

const T = 'A1B2C3D4-0000-4000-8000-00000000000A';
const H = '00000000-0000-4000-8000-0000000000BB';
const preview = {
  id: T,
  name: 'Negroni week',
  starts_at: '2026-11-02T04:00:00+00:00',
  ends_at: '2026-11-09T04:00:00+00:00',
  target: 10,
  state: 'upcoming',
  members: 3,
  host: { id: H, username: 'ana', display_name: 'Ana', accent: 'amber', avatar_path: null },
};
{
  const open = app.readLookup({ result: 'ok', ...preview });
  ok(
    open.kind === 'open' && open.preview.id === T.toLowerCase() && open.preview.host.username === 'ana' && open.preview.target === 10 && open.preview.members === 3,
    "tournament_by_code's 'ok' is a joinable preview, ids lower-cased",
  );
  ok(app.readLookup({ result: 'member', ...preview }).kind === 'member' && app.readLookup({ result: 'full', ...preview }).kind === 'full', "'member' and 'full' keep their preview");
  ok(['not_found', 'finished', 'not_allowed', 'limited'].every((w) => app.readLookup({ result: w }).kind === w), 'the four bare words are read as they are');
  ok(
    app.readLookup({ result: 'ok', ...preview, state: 'finished' }).kind === 'failed' &&
      app.readLookup({ result: 'ok', ...preview, id: 'nope' }).kind === 'failed' &&
      app.readLookup({ result: 'ok', ...preview, host: null }).kind === 'failed' &&
      app.readLookup({ result: 'surprise' }).kind === 'failed' &&
      app.readLookup(null).kind === 'failed' &&
      app.readLookup([]).kind === 'failed',
    'anything else is failed, never a half preview',
  );
  ok(
    app.readJoin({ result: 'joined', id: T }).kind === 'joined' &&
      app.readJoin({ result: 'member', id: T }).id === T.toLowerCase() &&
      app.readJoin({ result: 'joined' }).kind === 'failed' &&
      ['not_found', 'finished', 'full', 'not_allowed', 'limited'].every((w) => app.readJoin({ result: w }).kind === w),
    "join_tournament_with_code's answers, an id required for joined and member",
  );
}
ok(
  app.troubleOf({ code: 'PGRST202', message: 'Could not find the function' }) === 'unsupported' &&
    app.troubleOf({ code: '42883' }) === 'unsupported' &&
    app.troubleOf({ message: 'TypeError: Network request failed' }) === 'offline' &&
    app.troubleOf(new Error('Network request timed out')) === 'offline' &&
    app.troubleOf({ code: '28000', message: 'not signed in' }) === 'failed',
  'no function (PGRST202, 42883) is unsupported; no connection is offline; the rest failed',
);
ok(
  app.probeAnswer({ code: 'PGRST202' }, null) === false &&
    app.probeAnswer({ message: 'Network request failed' }, null) === null &&
    app.probeAnswer(null, { result: 'not_found' }) === true &&
    app.probeAnswer(null, null) === null,
  'the probe: no function is false, an answer true, no answer unknown',
);
ok(
  app.inviteRequired(false) === true && app.inviteRequired(true) === false && app.inviteRequired(null) === false,
  'an invite is required only once the server has said it has no codes',
);
ok(
  app.createSaysNoCodes('no_invitees', 0) && !app.createSaysNoCodes('no_invitees', 2) && !app.createSaysNoCodes('too_many', 0),
  "020's no_invitees for nobody invited means no codes; with people named it is still 'none of them can be invited'",
);
{
  const kinds = ['not_found', 'finished', 'full', 'not_allowed', 'limited', 'unsupported', 'offline', 'failed'];
  const texts = kinds.map((k) => app.codeTroubleText(k));
  ok(
    texts.every((t) => t.length > 0 && t.length <= 50 && /[.]$/.test(t) && !/!/.test(t)) && new Set(texts).size === kinds.length,
    `every refusal in few words (${Math.max(...texts.map((t) => t.length))} characters at most), each its own`,
  );
}

// The screens, read from the source.
const newSrc = read('src/app/tournaments/new.tsx');
const joinSrc = read('src/app/tournaments/join.tsx');
const pageSrc = read('src/app/tournaments/[id].tsx');
const libSrc = read('src/lib/tournaments.ts');
const storeSrc = read('src/store/tournaments.ts');
const intentSrc = read('src/app/+native-intent.tsx');
const layoutSrc = read('src/app/_layout.tsx');
const boardSrc = read('src/components/tournaments/FriendsBoard.tsx');

ok(
  /const needInvite = inviteRequired\(codes\);/.test(newSrc) &&
    /const canCreate = named && dated && \(!needInvite \|\| invitees\.length > 0\);/.test(newSrc) &&
    /void probeCodes\(\);/.test(newSrc),
  'the host sheet asks once, and needs an invite only when told there are no codes',
);
ok(
  /if \(createSaysNoCodes\(r\.reason, invitees\.length\)\) \{\s*setCodes\(false\);/.test(newSrc) &&
    /if \(r\.value\.joinCode\) \{[\s\S]*?setMade\([\s\S]*?\}\s*\/\/[^\n]*\n\s*setCreatedId\(r\.value\.id\);/.test(newSrc),
  "a refused empty create switches codes off; with no code to show, the page opens as before",
);
ok(
  !/invitees\.length === 0\) return \{ ok: false, reason: 'no_invitees' \}/.test(libSrc) &&
    /joinCode: await fetchJoinCode\(made\.value\)/.test(libSrc),
  'createTournament sends an empty list to the server and reads the code back',
);
ok(
  /export async function fetchJoinCode[\s\S]*?if \(error \|\| !data\) return null;[\s\S]*?catch \{\s*return null;/.test(libSrc),
  'fetchJoinCode is null on any error: no column before 028, no code shown',
);
{
  const unsupportedBranch = /\{unsupported \? \(([\s\S]*?)\) : \(/.exec(joinSrc)?.[1] ?? '';
  ok(
    /<EmptyState/.test(unsupportedBranch) && !/<TextInput/.test(unsupportedBranch) && /const unsupported = codes === false \|\| trouble === 'unsupported';/.test(joinSrc),
    'Join with code without 028: "Not here yet" and no boxes',
  );
  ok(
    /const codes = useTournaments\(\(s\) => s\.codes\);/.test(joinSrc) && /void probeCodes\(\);/.test(joinSrc),
    'and it asks as it opens, so the boxes never show on a server the store already knows has no codes',
  );
}
ok(/if \(lookup\.kind === 'unsupported'\) setCodes\(false\);/.test(joinSrc), 'and it tells the store, so the host sheet needs an invite');
ok(/\{joinCode && member && !finished \? \(/.test(pageSrc) && /JoinCodeCard code=\{joinCode\}/.test(pageSrc), "a tournament's page shows the code only with one, to someone in it, before it finishes");
ok(/codes: null,/.test(storeSrc) && /if \(get\(\)\.codes !== null \|\| !useAuth\.getState\(\)\.session\) return;/.test(storeSrc), 'the store starts unknown, and asks once per account and launch');
for (const rel of ['src/app/tournaments/join.tsx', 'src/app/tournaments/new.tsx', 'src/app/tournaments/[id].tsx']) {
  ok(/<TournamentRules\b/.test(read(rel)), `${rel} draws the rules (5.3)`);
}
ok(/<TournamentRules style=\{styles\.rules\} \/>\s*<\/View>\s*\) : \(/.test(newSrc), 'the host sheet keeps the rules on its code step too');
ok(
  /if \(first === JOIN_PATH\) \{\s*const code = codeFromLink\(second\);\s*return code \? `\/tournaments\/join\?code=\$\{code\}` : '\/tournaments\/join';/.test(intentSrc),
  'drinkdex://join/<code> opens Join with code with the code in, and never joins by itself',
);
ok(/name="tournaments\/join"\s*options=\{\{ presentation: 'modal', gestureDirection: 'vertical' \}\}/.test(layoutSrc), 'Join with code is a modal sheet, as hosting is');
ok(/label="Join with code"[\s\S]*?router\.push\(joinCodeHref\(\)\)/.test(boardSrc), 'the Tournaments tab has the Join with code key');
ok(/'tournament_by_code', \{ p_code:/.test(libSrc) && /'join_tournament_with_code', \{ p_code:/.test(libSrc), 'lib/tournaments calls both RPCs with p_code');

/* ==================================================================== */
/* 3. Migration 028's contract                                          */
/* ==================================================================== */

console.log('\n3. Migration 028\n');

/** `name(args)` and its head (up to the body) for each function 028 defines. */
const defined = [...sql.matchAll(/create or replace function ([a-z_.]+)\(([\s\S]*?)\)\s*\nreturns ([^\n]+)\n([\s\S]*?)as \$\$/g)].map((m) => ({
  name: m[1],
  args: m[2].replace(/\s+/g, ' ').trim(),
  returns: m[3].trim(),
  head: m[4],
}));
const names = defined.map((d) => d.name).sort();
ok(
  JSON.stringify(names) ===
    JSON.stringify([
      'private.code_join_state',
      'private.find_tournament_by_code',
      'private.new_tournament_code',
      'private.tournament_code_norm',
      'public.create_tournament',
      'public.join_tournament_with_code',
      'public.tournament_by_code',
    ]),
  `028 defines seven functions: ${names.join(', ')}`,
);
for (const d of defined) {
  ok(/set search_path = ''/.test(d.head), `${d.name} pins search_path to empty`);
  ok(new RegExp(`revoke all on function ${d.name.replace('.', '\\.')}\\(`).test(sql), `${d.name}'s EXECUTE is revoked first`);
  if (d.name.startsWith('public.') || d.name !== 'private.tournament_code_norm') {
    ok(/security definer/.test(d.head), `${d.name} is SECURITY DEFINER`);
  }
}
for (const rpc of ['tournament_by_code', 'join_tournament_with_code']) {
  ok(
    new RegExp(`revoke all on function public\\.${rpc}\\(text\\)\\s+from public, anon;`).test(sql) &&
      new RegExp(`grant execute on function public\\.${rpc}\\(text\\)\\s+to authenticated;`).test(sql),
    `${rpc}(text): revoked from public and anon, granted to authenticated`,
  );
  ok(new RegExp(`function public\\.${rpc}\\(p_code text\\)`).test(sql), `${rpc} takes p_code, as lib/tournaments sends it`);
}
for (const helper of ['tournament_code_norm(text)', 'new_tournament_code()', 'find_tournament_by_code(text)', 'code_join_state(uuid, uuid)']) {
  ok(
    new RegExp(`revoke all on function private\\.${helper.replace(/[()]/g, '\\$&')}\\s+from public, anon, authenticated;`).test(sql) &&
      !new RegExp(`grant execute on function private\\.${helper.split('(')[0]}`).test(sql),
    `private.${helper} is nobody's to call`,
  );
}
ok(
  [...sql.matchAll(/grant [^;]*;/g)].every((g) => !/\bto [^;]*\b(anon|public)\b/.test(g[0])),
  'nothing in 028 is granted to anon or public',
);
ok(
  /if me is null or coalesce\(\(auth\.jwt\(\) ->> 'is_anonymous'\)::boolean, false\) then\s*raise exception 'not signed in: tournament_by_code/.test(sql) &&
    /if me is null or coalesce\(\(auth\.jwt\(\) ->> 'is_anonymous'\)::boolean, false\) then\s*raise exception 'not signed in: join_tournament_with_code/.test(sql),
  'both RPCs refuse no session and an anonymous one (28000)',
);

// create_tournament: 020's signature and return, nobody invited allowed.
{
  const ct = defined.find((d) => d.name === 'public.create_tournament');
  const old = /create or replace function public\.create_tournament\(([\s\S]*?)\)\s*\nreturns (\w+)/.exec(read('supabase/migrations/020_tournaments_and_story_music.sql'));
  ok(
    ct && old && ct.args === old[1].replace(/\s+/g, ' ').trim() && ct.returns === 'uuid' && old[2] === 'uuid',
    `create_tournament keeps 020's arguments and uuid (build 37 calls it as it always did)`,
  );
  ok(
    /if private\.add_invitees\(tid, me, p_invitees\) = 0 and asked > 0 then\s*raise exception 'no_invitees'/.test(sql) &&
      /asked integer := coalesce\(cardinality\(array_remove\(p_invitees, null\)\), 0\);/.test(sql),
    'no_invitees only when people were named and none could be invited',
  );
  ok(/when unique_violation then\s*tries := tries \+ 1;\s*if tries >= 3 then\s*raise;/.test(sql), 'a code drawn twice at once is drawn again, three tries at most');
}

// The column.
ok(
  /alter table public\.tournaments add column if not exists join_code text;/.test(sql) &&
    /create unique index if not exists tournaments_join_code_open\s+on public\.tournaments \(join_code\) where finalized_at is null;/.test(sql) &&
    /alter table public\.tournaments alter column join_code set default private\.new_tournament_code\(\);/.test(sql),
  'join_code: added, unique among unfinished tournaments, made by default',
);
{
  const backfill = sql.indexOf("update public.tournaments x set join_code = private.new_tournament_code()");
  const def = sql.indexOf('alter column join_code set default');
  ok(backfill > 0 && def > backfill && /where x\.finalized_at is null and x\.join_code is null/.test(sql), 'every unfinished tournament gets a code, one statement at a time, before the default is set');
}

// Joining tells nobody.
{
  const join = defined.find((d) => d.name === 'public.join_tournament_with_code');
  const body = /create or replace function public\.join_tournament_with_code[\s\S]*?\n\$\$;/.exec(sql)?.[0] ?? '';
  ok(join && /values \(t, me, 'accepted', now\(\)\)/.test(body) && !/'invited'\)/.test(body.replace(/m\.status = 'invited'/g, '')), "joining inserts 'accepted' only (an open invitation is updated to it)");
  const trig = /create trigger tournament_members_push\s+after insert on public\.tournament_members\s+for each row when \(new\.status = 'invited'\)/.test(read('supabase/migrations/027_push.sql'));
  ok(trig, "027's push fires only for an inserted 'invited' row, so a code join pushes nothing");
  ok(!/net\.http_post|queue_push/.test(sql), '028 queues nothing itself');
}

// Guessing.
{
  const find = /create or replace function private\.find_tournament_by_code[\s\S]*?\n\$\$;/.exec(sql)?.[0] ?? '';
  const norm = find.indexOf('code is null');
  const lock = find.indexOf("pg_advisory_xact_lock(hashtextextended('tournament_code:' || me::text, 0))");
  const limited = find.indexOf("'limited'");
  const lookup = find.indexOf('x.join_code = code');
  ok(norm > 0 && lock > norm && limited > lock && lookup > limited, 'a non-code is answered before the lock, the lock before the count, the count before the lookup');
  ok(/if missed >= 20 then/.test(find) && /u\.hour >= date_trunc\('hour', now\(\)\) - interval '1 hour'/.test(find), 'twenty misses in this clock hour and the last stop the next guess');
  ok(/if not found or r\.host_id = any \(private\.my_block_set\(\)\) then\s*insert into private\.tournament_code_misses/.test(find), 'a wrong code, or a blocked host, is one miss and the same answer');
  ok(!/raise exception/.test(find), 'nothing in the lookup raises: a raise would roll the miss back');
  ok(
    /if not found and exists \(select 1 from public\.tournaments x\s*where x\.join_code = code and x\.finalized_at is not null\s*and not \(x\.host_id = any \(private\.my_block_set\(\)\)\)\) then\s*return jsonb_build_object\('result', 'finished'\);\s*end if;\s*if not found or r\.host_id/.test(find),
    "a finished tournament's code answers finished, uncharged, unless its host is blocked either way",
  );
  ok(
    ['tournament_by_code', 'join_tournament_with_code'].every((f) => {
      const body = new RegExp(`create or replace function public\\.${f}[\\s\\S]*?\\n\\$\\$;`).exec(sql)?.[0] ?? '';
      const gone = body.search(/if not exists \(select 1 from public\.profiles p where p\.id = me\) then\s*raise exception 'not signed in: (?:[^']|'')*' using errcode = '28000';/);
      return gone > 0 && gone < body.indexOf('private.find_tournament_by_code(p_code)');
    }),
    "a deleted account's live token (no profile, so no miss could be counted) is signed out before any lookup",
  );
  ok(
    /create table if not exists private\.tournament_code_misses/.test(sql) &&
      /alter table private\.tournament_code_misses enable row level security;/.test(sql) &&
      /revoke all on private\.tournament_code_misses from public, anon, authenticated;/.test(sql),
    'the misses are private: RLS on, no policy, every grant revoked',
  );
}

// Blocks and seats.
{
  const st = /create or replace function private\.code_join_state[\s\S]*?\n\$\$;/.exec(sql)?.[0] ?? '';
  ok(/blocked uuid\[\] := private\.my_block_set\(\);/.test(st) && /m\.status in \('invited', 'accepted'\)\s*and m\.user_id = any \(blocked\)/.test(st), 'blocked either way with anyone in it or asked: not_allowed');
  ok(/if mine = 'declined' then\s*return 'not_allowed';/.test(st), "declined, left or taken out by a block stays out (020's rule)");
  const cap = /\(select count\(\*\) from public\.tournament_members m\s*where m\.tournament_id = t and m\.status in \('invited', 'accepted'\)\) >= (\d+)/.exec(st)?.[1];
  const addInvitees = /room := (\d+) -/.exec(read('supabase/migrations/020_tournaments_and_story_music.sql'))?.[1];
  const appCap = /maxMembers: (\d+),/.exec(libSrc)?.[1];
  ok(cap === '50' && addInvitees === '50' && appCap === '50', `the seat cap is ${cap}, add_invitees' ${addInvitees}, the app's ${appCap}`);
  ok(
    /perform pg_advisory_xact_lock\(hashtextextended\('tournament:' \|\| t::text, 0\)\);\s*if not exists \(select 1 from public\.tournaments x where x\.id = t\) then/.test(sql),
    "joining takes the tournament's own lock (finalize_tournament's) before checking again",
  );
}

// Shape of the file.
{
  const statements = sql.trim().split(/;\s*\n/).filter((s) => s.trim());
  ok(
    /insert into public\.schema_migrations \(version\)\s+values \('028_tournament_join_codes'\) on conflict \(version\) do nothing;?$/.test(statements.at(-1).trim()),
    'the last statement is the 028 record',
  );
  ok(/raise exception '028 needs/.test(sql.slice(0, sql.indexOf('create or replace function'))), 'section 0 stops the file before anything is made');
  ok(/-- VERIFY AFTERWARDS/.test(mig) && /rollback;/.test(mig), 'a VERIFY block, its smoke test rolled back');
}

// schema.sql and database.types.
for (const d of defined) ok(schema.includes(`create or replace function ${d.name}(`), `supabase/schema.sql carries ${d.name}`);
for (const obj of [
  "  join_code    text,",
  "constraint tournaments_join_code_shape check (join_code is null or join_code ~ '^[2-9A-HJKMNP-Z]{6}$')",
  'create unique index if not exists tournaments_join_code_open',
  'create table if not exists private.tournament_code_misses',
  'alter table public.tournaments alter column join_code set default private.new_tournament_code();',
  'alter table private.tournament_code_misses enable row level security;',
  'grant execute on function public.tournament_by_code(text)         to authenticated;',
  'grant execute on function public.join_tournament_with_code(text)  to authenticated;',
  "('028_tournament_join_codes', 'contained in schema.sql')",
  '-- Sipply — the whole schema, as of migration 028',
]) {
  ok(schema.includes(obj), `supabase/schema.sql has ${obj.trim().slice(0, 70)}`);
}
{
  const ctSchema = /create or replace function public\.create_tournament[\s\S]*?\n\$\$;/.exec(schema)?.[0];
  const ctMig = /create or replace function public\.create_tournament[\s\S]*?\n\$\$;/.exec(mig)?.[0];
  ok(ctSchema && ctSchema === ctMig, "schema.sql's create_tournament is 028's, byte for byte");
  for (const f of ['private\\.find_tournament_by_code', 'public\\.tournament_by_code', 'public\\.join_tournament_with_code']) {
    const re = new RegExp(`create or replace function ${f}\\([\\s\\S]*?\\n\\$\\$;`);
    const inSchema = re.exec(schema)?.[0];
    ok(inSchema && inSchema === re.exec(mig)?.[0], `schema.sql's ${f.replace('\\', '')} is 028's, byte for byte`);
  }
}
{
  const types = read('src/lib/database.types.ts');
  ok(
    /join_code: string \| null;/.test(types) &&
      /tournament_by_code: \{\s*Args: \{ p_code: string \};\s*Returns: Json;/.test(types) &&
      /join_tournament_with_code: \{\s*Args: \{ p_code: string \};\s*Returns: Json;/.test(types),
    'src/lib/database.types.ts has the column and both RPCs',
  );
}

/* ==================================================================== */
/* 4. The notes                                                         */
/* ==================================================================== */

console.log('\n4. Review notes and What to Test\n');

for (const rel of ['specs/v4.12/review-notes-38.txt', 'specs/v4.12/wtt-38.txt']) {
  const n = [...read(rel)].length;
  ok(n <= 4000, `${rel}: ${n.toLocaleString('en-US')} characters, App Store Connect's 4,000 at most`);
}
{
  const notes = read('specs/v4.12/review-notes-38.txt');
  const para = notes.split('\n').find((l) => l.startsWith('Tournaments.')) ?? '';
  ok(para.includes('"No prizes · Apple is not a sponsor · Drink responsibly"'), 'the notes quote the line on screen exactly');
  ok(/"i"/.test(para) && para.includes('Apple is not a sponsor. Please drink responsibly.'), 'the notes say where the full rules are, and quote them');
  ok(/3 entries a day/.test(para) && /amounts are never counted/.test(para), 'the notes keep the 3-a-day cap and that amounts are never counted');
  ok(/calendar/i.test(para) && /First to/.test(para), 'the notes keep the calendar and the custom goal');
  ok(/a code the host shares/.test(para) && /Join with code/.test(para), 'the notes say people can join with a code the host shares, and where');
  const old = read('specs/v4.11/review-notes-37.txt').split('\n');
  const now = notes.split('\n');
  ok(old.length === now.length && old.every((l, i) => l === now[i] || l.startsWith('Tournaments.')), "only the Tournaments paragraph differs from build 37's");
}
{
  const wtt = read('specs/v4.12/wtt-38.txt');
  const news = wtt.split('New in this build:')[1]?.split('Worth poking at:')[0] ?? '';
  const bullets = news.split('\n').filter((l) => l.startsWith('- '));
  ok(bullets[0]?.startsWith('- Join with code.') ?? false, 'What to Test leads with Join with code');
  ok(bullets.some((b) => /Current place/.test(b)), 'and keeps the Current place line');
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nThe code is one code on both sides, 028 missing is handled on every screen, the migration keeps its promises, and the notes fit.');
