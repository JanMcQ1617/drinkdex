/**
 * The push sender's guard (specs/v4.9/push.md; supabase/functions/push;
 * migration 027). The app has no Jest and the machine has no Deno, so this
 * is the function's test, run beside check-ideas. Offline: nothing here
 * reaches Apple, Supabase or the network.
 *
 *   1. THE KEY. supabase/functions/push/index.ts, transpiled with the
 *      project's own typescript, its one npm: import and the Deno global
 *      stubbed. A real P-256 key made here, pasted every way a one-line
 *      Dashboard field can mangle it (spaces, escaped \n, no breaks at
 *      all, CRLF, other dashes, quotes, no BEGIN/END lines, spaces gone
 *      from them), must come back as the very same PKCS#8 bytes; nonsense
 *      must be refused, never signed.
 *   2. THE PROVIDER TOKEN. Three base64url parts; a header of exactly
 *      { alg: ES256, kid } and claims of exactly { iss, iat }, as Apple
 *      wants and nothing more; a 64-byte r||s signature that node's own
 *      crypto verifies against the key's public half. Reused for 50
 *      minutes, signed again after, after forgetProviderToken, and for
 *      another key id.
 *   3. THE WORDS. Each kind's line with the longest username (24) and
 *      the longest tournament name (40): at most 120 characters, the
 *      payload under Apple's 4 KB, body only (no title, no badge), one
 *      thread per kind, the data under `body` where expo-notifications
 *      reads it; App Store 1.4.3's list (scripts/check-ideas.mjs's), no
 *      digit (no amounts), no "!", no dash, a full stop last. A name with
 *      a digit or a listed word is left out ("a tournament"). Every url
 *      passes the app's own allowlist, read from src/lib/notifications.ts,
 *      and routeNotification has a case for it.
 *   4. THE HANDLER, with Supabase and fetch stubbed. No header: 401 with
 *      no database call. A wrong secret: 401 after push_caller_ok alone.
 *      A missing or broken key: 503 and push_claim never called, so no
 *      event is spent. A claim that is not 'send': 200 and nothing sent.
 *      'send' to three phones: one POST each to the right host and path
 *      with the topic, alert type, priority 10, collapse id, an expiry
 *      and a provider token that verifies; 410 and 400 BadDeviceToken
 *      delete their tokens, a 200 does not. 403 ExpiredProviderToken signs
 *      a fresh token next time. No phone taking it is a 502: given back
 *      (push_release, with the event's own ids) when Apple refused every
 *      phone, kept spent when one went unanswered.
 *   5. THE CONTRACT between the three pieces. The RPC names and argument
 *      names src/lib/push.ts and the function call are the ones 027
 *      defines, with the same three switch names and three kinds; the
 *      pair's hour is the same in the trigger's check and the claim; 027's
 *      last statement is its schema_migrations row; every function it
 *      defines is SECURITY DEFINER with an empty search_path and has its
 *      EXECUTE revoked; and supabase/schema.sql carries all of it.
 *
 * Run: node scripts/check-push.mjs
 * Exits 1 on any failure.
 */

import { Buffer } from 'node:buffer';
import { createPrivateKey, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8');

const failures = [];
const fail = (msg) => failures.push(msg);
const check = (ok, msg) => {
  if (!ok) fail(msg);
};

const toEsm = (source, fileName) =>
  ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  }).outputText;
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

/* ------------------------------------------------------------------ */
/* The function, loaded with Deno and supabase-js stubbed              */
/* ------------------------------------------------------------------ */

const harness = {
  env: {},
  client: null,
  serve: 0,
};
globalThis.Deno = {
  env: { get: (k) => harness.env[k] },
  serve: () => {
    harness.serve += 1;
  },
};
globalThis.__pushHarness = harness;

const SUPABASE_STUB = `export function createClient(url, key, opts) { return globalThis.__pushHarness.client(url, key, opts); }`;
const FN_PATH = 'supabase/functions/push/index.ts';
const fnSource = read(FN_PATH);
const IMPORT = "'npm:@supabase/supabase-js@2'";
check(fnSource.includes(`from ${IMPORT}`), `${FN_PATH}: its one import is no longer ${IMPORT}; update this check`);
const fnCode = toEsm(fnSource, 'index.ts').replace(IMPORT, `'${dataUrl(SUPABASE_STUB)}'`);
const fn = await import(dataUrl(fnCode));
check(harness.serve === 1, 'the function does not call Deno.serve exactly once');

/* ------------------------------------------------------------------ */
/* 1. The key                                                          */
/* ------------------------------------------------------------------ */

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const DER = privateKey.export({ type: 'pkcs8', format: 'der' });
const body = PEM.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');

const mangled = {
  'as downloaded': PEM,
  'line breaks as spaces': PEM.replace(/\n/g, ' '),
  'line breaks as \\n': PEM.replace(/\n/g, '\\n'),
  'line breaks as \\r\\n': PEM.replace(/\n/g, '\\r\\n'),
  'no line breaks': PEM.replace(/\n/g, ''),
  CRLF: PEM.replace(/\n/g, '\r\n'),
  'en dashes': PEM.replace(/-----/g, '–––––'),
  'in quotes': `"${PEM.trim()}"`,
  'padded with blanks': `   ${PEM}   \n\n`,
  'body only': body,
  'body in 64-char lines': body.replace(/(.{64})/g, '$1\n'),
  'header words run together': PEM.replace(/BEGIN PRIVATE KEY/, 'BEGINPRIVATEKEY').replace(/END PRIVATE KEY/, 'ENDPRIVATEKEY'),
  'EC header': PEM.replace(/PRIVATE KEY/g, 'EC PRIVATE KEY'),
};
for (const [how, text] of Object.entries(mangled)) {
  let der = null;
  try {
    der = Buffer.from(fn.pkcs8FromP8(text));
  } catch (e) {
    fail(`key pasted ${how}: refused (${e.message})`);
    continue;
  }
  check(der.equals(DER), `key pasted ${how}: did not come back as the same PKCS#8 bytes`);
}
for (const [how, text] of Object.entries({ empty: '', blank: '   \n ', 'not a key': 'hello world', 'a key id': 'ABC123DEFG' })) {
  let threw = false;
  try {
    fn.pkcs8FromP8(text);
  } catch {
    threw = true;
  }
  check(threw, `"${how}" was taken as a key`);
}

/* ------------------------------------------------------------------ */
/* 2. The provider token                                               */
/* ------------------------------------------------------------------ */

const KEY_ID = 'ABC123DEFG';
const TEAM_ID = 'TEAM123456';
const NOW = 1_793_000_000;

const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** The JWT's parts, or a failure for each way it is not Apple's shape. */
function checkJwt(jwt, where, iat) {
  const parts = typeof jwt === 'string' ? jwt.split('.') : [];
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) {
    fail(`${where}: not three base64url parts`);
    return;
  }
  const header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
  const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  check(
    JSON.stringify(header) === JSON.stringify({ alg: 'ES256', kid: KEY_ID }),
    `${where}: header is ${JSON.stringify(header)}, not exactly { alg: ES256, kid }`,
  );
  check(
    JSON.stringify(claims) === JSON.stringify({ iss: TEAM_ID, iat }),
    `${where}: claims are ${JSON.stringify(claims)}, not exactly { iss, iat }`,
  );
  const sig = fromB64url(parts[2]);
  check(sig.length === 64, `${where}: the signature is ${sig.length} bytes, not 64 (r||s)`);
  const ok = verify(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    sig,
  );
  check(ok, `${where}: the signature does not verify with the key's public half`);
}

for (const how of ['as downloaded', 'line breaks as \\n', 'body only']) {
  try {
    checkJwt(await fn.signProviderToken(mangled[how], KEY_ID, TEAM_ID, NOW), `token from a key pasted ${how}`, NOW);
  } catch (e) {
    fail(`token from a key pasted ${how}: not signed (${e.message})`);
  }
}
{
  let threw = false;
  try {
    const other = generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    await fn.signProviderToken(other, KEY_ID, TEAM_ID, NOW);
  } catch {
    threw = true;
  }
  check(threw, 'a P-384 key was used to sign an ES256 token');
}

const KEY = { keyP8: mangled['line breaks as spaces'], keyId: KEY_ID, teamId: TEAM_ID };
fn.forgetProviderToken();
const t1 = await fn.providerToken(KEY, NOW);
check((await fn.providerToken(KEY, NOW + 60)) === t1, 'the provider token was signed again within a minute');
check(
  (await fn.providerToken(KEY, NOW + fn.TOKEN_REUSE_S - 1)) === t1,
  'the provider token was not reused for its whole 50 minutes',
);
check(fn.TOKEN_REUSE_S >= 20 * 60 && fn.TOKEN_REUSE_S <= 55 * 60, 'TOKEN_REUSE_S is outside Apple\'s 20 to 60 minutes');
const t2 = await fn.providerToken(KEY, NOW + fn.TOKEN_REUSE_S);
check(t2 !== t1, 'the provider token was reused past 50 minutes');
checkJwt(t2, 'the re-signed token', NOW + fn.TOKEN_REUSE_S);
fn.forgetProviderToken();
check((await fn.providerToken(KEY, NOW + fn.TOKEN_REUSE_S + 1)) !== t2, 'forgetProviderToken did not force a new token');
const t3 = await fn.providerToken({ ...KEY, keyId: 'ZZZ999YYYX' }, NOW + fn.TOKEN_REUSE_S + 2);
check(JSON.parse(fromB64url(t3.split('.')[0])).kid === 'ZZZ999YYYX', 'a new key id kept the old token');

/* ------------------------------------------------------------------ */
/* 3. The words                                                        */
/* ------------------------------------------------------------------ */

/* scripts/check-ideas.mjs's list, which the daily ideas are held to. */
const BANNED = [
  [/\bhave an?\b/i, 'an invitation to have one'],
  [/\b(grab|pour (yourself|one|a))\b/i, 'an invitation to have one'],
  [/\bdrink(ing)? up\b|\bdrinking\b/i, 'drinking as the verb'],
  [/\bsip(s|ping)?\b|\bcheers\b|\bbottoms up\b/i, 'drinking as the verb'],
  [/\bshots?\b|\brounds?\b|\bnightcap\b/i, 'rounds and shots'],
  [/\bhappy hour\b|\btonight\b|\bthis (evening|afternoon|morning)\b|\bafter work\b|o'clock/i, 'a time to drink'],
  [/\bweekend\b|\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/i, 'a day to drink'],
  [/\bthirst(y)?\b|\bbuzz(ed)?\b|\btipsy\b|\bdrunk\b|\bhangover\b|\bwasted\b|\bparty\b|\bbooz(e|y)\b/i, 'the effect'],
  [/\btreat yourself\b|\bdeserve\b|\btime for\b|\bneed a\b/i, 'drinking as a reward'],
  [/\bstreak\b|\bin a row\b|\bevery (day|night)\b|\bdaily\b/i, 'a habit or a streak'],
  [/\bcatch (them )?all\b|\bchallenge\b|\bbeat\b|\brace\b|\bgoal\b|\btarget\b|\bmore drinks\b/i, 'a count to raise'],
  [/\banother (round|one|drink|glass)\b|\bnext (drink|one|round|glass)\b/i, 'one more'],
  [/\btry(ing)?\b/i, 'trying a drink'],
  [/\border\b|\bbars?\b/i, 'going out to drink'],
  [/\bstrong(er|est)?\b/i, 'strength as a draw'],
];
const BODY_MAX = 120;
const PAYLOAD_MAX = 4096;
const SUBJECT = '0f8fad5b-d9cb-469f-a165-70867728950e';
const LONG_NAME = 'abcdefghijklmnopqrstuvwx'; // 24, profiles_username_shape's longest
const LONG_TITLE = 'Negroni week with the people from the co'.slice(0, 40);
check(LONG_NAME.length === 24 && LONG_TITLE.length === 40, 'the longest stand-ins are not 24 and 40');

// The allowlist and the router, from the app's own file.
const notif = read('src/lib/notifications.ts');
const uuidSrc = /const UUID = '([^']+)';/.exec(notif)?.[1];
const allowedSrc = /const ALLOWED = new RegExp\(([\s\S]*?)\);\n/.exec(notif)?.[1];
let ALLOWED = null;
if (!uuidSrc || !allowedSrc) fail('src/lib/notifications.ts: UUID or ALLOWED is not where this check reads it');
else ALLOWED = new RegExp(new Function('UUID', `return ${allowedSrc.trim().replace(/,$/, '')};`)(uuidSrc));

const KIND_ROUTE = { tag: 'post', invite: 'tournaments', follow: 'user' };
for (const kind of ['tag', 'invite', 'follow']) {
  for (const [actor, title] of [
    ['ana', 'Negroni week'],
    [LONG_NAME, LONG_TITLE],
  ]) {
    const line = fn.bodyFor(kind, actor, title);
    const where = `${kind} (${actor}, ${title})`;
    check(line.length <= BODY_MAX, `${where}: ${line.length} characters, over ${BODY_MAX}: "${line}"`);
    check(line.startsWith(actor), `${where}: does not start with who did it`);
    check(/[a-z]\.$/.test(line), `${where}: does not end with a full stop: "${line}"`);
    check(!/[!–—]|\p{Extended_Pictographic}/u.test(line), `${where}: a "!", a dash or an emoji: "${line}"`);
    const words = line.slice(actor.length);
    check(!/\d/.test(words), `${where}: names a number: "${line}"`);
    for (const [re, why] of BANNED) if (re.test(words)) fail(`${where}: banned (${why}): "${line}"`);

    const payload = fn.payloadFor(kind, SUBJECT, actor, title);
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    check(bytes <= PAYLOAD_MAX, `${where}: payload is ${bytes} bytes, over Apple's ${PAYLOAD_MAX}`);
    check(bytes <= 512, `${where}: payload is ${bytes} bytes; it should be a few hundred`);
    const aps = payload.aps ?? {};
    check(JSON.stringify(Object.keys(aps).sort()) === JSON.stringify(['alert', 'sound', 'thread-id']), `${where}: aps carries ${Object.keys(aps)}`);
    check(JSON.stringify(aps.alert) === JSON.stringify({ body: line }), `${where}: the alert is not body only`);
    check(!('badge' in aps), `${where}: sets a badge`);
    check(aps['thread-id'] === fn.THREADS[kind], `${where}: thread ${aps['thread-id']}`);
    check(payload.body?.kind === kind, `${where}: data.kind is ${payload.body?.kind}`);
    const url = payload.body?.url;
    check(url === `/${KIND_ROUTE[kind]}/${SUBJECT}`, `${where}: url is ${url}`);
    if (ALLOWED) check(ALLOWED.test(url), `${where}: ${url} is not on the app's allowlist, so a tap would open Home`);
  }
  check(notif.includes(`case '${KIND_ROUTE[kind]}':`), `routeNotification has no case for /${KIND_ROUTE[kind]}/<id>`);
}
check(new Set(Object.values(fn.THREADS)).size === 3, 'two kinds share a thread');

for (const [name, want] of [
  ['Negroni week', 'Negroni week'],
  ['  Negroni   week  ', 'Negroni week'],
  ['Negroni week!', 'Negroni week'],
  ['Negroni week.', 'Negroni week'],
  ['First to 10', null],
  ['12 cocktails', null],
  ['Shots and more', null],
  ['Bar crawl', null],
  ['Friday fun', null],
  ['Drinking club', null],
  ['Beer pong league', null],
  ['', null],
  ['x'.repeat(41), null],
  [null, null],
]) {
  const got = fn.lockScreenTitle(name);
  check(got === want, `lockScreenTitle(${JSON.stringify(name)}) is ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
}
check(
  fn.bodyFor('invite', 'ana', 'Shots week') === 'ana invited you to a tournament.',
  'an invite to a listed name does not fall back to "a tournament"',
);
check(fn.bodyFor('invite', 'ana', null) === 'ana invited you to a tournament.', 'an invite with no name does not say "a tournament"');

/* parseEvent and parseClaim: what crosses from the database. */
const RECIPIENT = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';
const goodEvent = { kind: 'follow', subject: SUBJECT, recipient: RECIPIENT };
check(JSON.stringify(fn.parseEvent(goodEvent)) === JSON.stringify(goodEvent), 'a good event was not read');
for (const [how, bad] of [
  ['an extra key', { ...goodEvent, url: '/x' }],
  ['an unknown kind', { ...goodEvent, kind: 'like' }],
  ['a subject that is not a uuid', { ...goodEvent, subject: 'x' }],
  ['an upper-case uuid', { ...goodEvent, recipient: RECIPIENT.toUpperCase() }],
  ['an array', [goodEvent]],
  ['null', null],
]) {
  check(fn.parseEvent(bad) === null, `parseEvent took ${how}`);
}
const T_PROD = 'a1'.repeat(32);
const T_SAND = 'b2'.repeat(32);
const T_BAD = 'c3'.repeat(32);
const sendClaim = {
  result: 'send',
  kind: 'invite',
  subject: SUBJECT,
  actor: 'ana',
  title: 'Negroni week',
  tokens: [
    { token: T_PROD, env: 'production' },
    { token: T_SAND, env: 'sandbox' },
    { token: T_BAD, env: 'production' },
    { token: 'not-hex', env: 'production' },
    { token: 'd4'.repeat(32), env: 'staging' },
  ],
};
const parsed = fn.parseClaim(sendClaim);
check(parsed?.devices?.length === 3, `parseClaim kept ${parsed?.devices?.length} devices, not the 3 well-formed ones`);
check(fn.parseClaim({ ...sendClaim, actor: 'Ana Smith' }) === null, 'parseClaim took an actor that is not a username');
check(fn.parseClaim({ result: 'duplicate' })?.result === 'duplicate', 'parseClaim lost a one-word result');
check(fn.parseClaim({ result: 'drop table' }) === null, 'parseClaim took a result that is not one word');

for (const [status, reason, want] of [
  [200, null, 'sent'],
  [410, 'Unregistered', 'gone'],
  [400, 'BadDeviceToken', 'gone'],
  [400, 'DeviceTokenNotForTopic', 'gone'],
  [400, 'BadCollapseId', 'failed'],
  [403, 'ExpiredProviderToken', 'auth'],
  [403, 'InvalidProviderToken', 'auth'],
  [429, 'TooManyRequests', 'failed'],
  [500, 'InternalServerError', 'failed'],
]) {
  check(fn.outcomeOf(status, reason) === want, `APNs ${status} ${reason} reads as ${fn.outcomeOf(status, reason)}, not ${want}`);
}

/* ------------------------------------------------------------------ */
/* 4. The handler                                                      */
/* ------------------------------------------------------------------ */

const SECRET = 'f'.repeat(64);
/* What the function logs, kept rather than printed: it must never name a person or a token. */
const logged = [];
const consoleError = console.error;
console.error = (...args) => logged.push(args.join(' '));
let calls = [];
let deleted = [];
let claimAnswer = { data: sendClaim, error: null };
harness.client = () => ({
  rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'push_caller_ok') return { data: args.p_secret === SECRET, error: null };
    if (name === 'push_claim') return claimAnswer;
    if (name === 'push_release') return { data: true, error: null };
    return { data: null, error: { code: 'PGRST202' } };
  },
  from: (table) => ({
    delete: () => ({
      eq: async (col, value) => {
        deleted.push({ table, col, value });
        return { error: null };
      },
    }),
  }),
});

let sent = [];
let apnsAnswer = () => new Response(null, { status: 200 });
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), init });
  return apnsAnswer(String(url));
};

const ENV_OK = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  APNS_KEY: mangled['line breaks as \\n'],
  APNS_KEY_ID: ` "${KEY_ID}" `,
  APPLE_TEAM_ID: TEAM_ID,
};

async function call(env, { method = 'POST', secret = SECRET, json = goodEvent } = {}) {
  harness.env = env;
  calls = [];
  deleted = [];
  sent = [];
  const headers = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['x-sipply-push'] = secret;
  const req = new Request('https://example.supabase.co/functions/v1/push', {
    method,
    headers,
    body: method === 'GET' ? undefined : typeof json === 'string' ? json : JSON.stringify(json),
  });
  const res = await fn.handle(req);
  return { status: res.status, body: await res.json().catch(() => null) };
}

{
  const r = await call(ENV_OK, { method: 'GET' });
  check(r.status === 400, `a GET answered ${r.status}`);
}
{
  const r = await call(ENV_OK, { secret: null });
  check(r.status === 401 && calls.length === 0, `no header: ${r.status}, ${calls.length} database call(s)`);
}
{
  const r = await call(ENV_OK, { secret: 'wrong' });
  check(r.status === 401, `a wrong secret answered ${r.status}`);
  check(calls.map((c) => c.name).join() === 'push_caller_ok', `a wrong secret reached ${calls.map((c) => c.name)}`);
  check(sent.length === 0, 'a wrong secret reached Apple');
}
{
  const r = await call(ENV_OK, { json: { ...goodEvent, extra: 1 } });
  check(r.status === 400 && calls.length === 0, `a bad body: ${r.status}, ${calls.length} database call(s)`);
}
{
  const r = await call(ENV_OK, { json: 'not json' });
  check(r.status === 400, `a body that is not JSON answered ${r.status}`);
}
for (const [how, env] of [
  ['no APNS_KEY', { ...ENV_OK, APNS_KEY: undefined }],
  ['no APNS_KEY_ID', { ...ENV_OK, APNS_KEY_ID: undefined }],
  ['a misshapen APNS_KEY_ID', { ...ENV_OK, APNS_KEY_ID: 'short' }],
  ['no APPLE_TEAM_ID', { ...ENV_OK, APPLE_TEAM_ID: undefined }],
  ['an APNS_KEY that is not a key', { ...ENV_OK, APNS_KEY: 'paste the key here' }],
]) {
  fn.forgetProviderToken();
  const r = await call(env);
  check(r.status === 503 && r.body?.error === 'not_configured', `${how}: answered ${r.status} ${JSON.stringify(r.body)}`);
  check(!calls.some((c) => c.name === 'push_claim'), `${how}: the event was claimed (spent) anyway`);
  check(sent.length === 0, `${how}: something reached Apple`);
}
{
  const r = await call({ ...ENV_OK, SUPABASE_SERVICE_ROLE_KEY: undefined });
  check(r.status === 503 && calls.length === 0, `no service role key: ${r.status}, ${calls.length} database call(s)`);
}
for (const result of ['duplicate', 'gone', 'stale', 'blocked', 'off', 'no_device', 'limited', 'forbidden']) {
  claimAnswer = { data: { result }, error: null };
  const r = await call(ENV_OK);
  check(r.status === 200 && r.body?.result === result, `claim ${result}: answered ${r.status} ${JSON.stringify(r.body)}`);
  check(sent.length === 0, `claim ${result}: something reached Apple`);
}
{
  claimAnswer = { data: null, error: { code: 'PGRST202' } };
  const r = await call(ENV_OK);
  check(r.status === 502 && sent.length === 0, `a failed claim: ${r.status}, ${sent.length} sent`);
}
{
  claimAnswer = { data: sendClaim, error: null };
  apnsAnswer = (url) =>
    url.endsWith(T_SAND)
      ? new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 })
      : url.endsWith(T_BAD)
        ? new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 })
        : new Response(null, { status: 200 });
  fn.forgetProviderToken();
  const before = Math.floor(Date.now() / 1000);
  const r = await call(ENV_OK);
  check(r.status === 200, `a send answered ${r.status}`);
  check(
    JSON.stringify(r.body) === JSON.stringify({ result: 'sent', sent: 1, dropped: 2, failed: 0 }),
    `a send answered ${JSON.stringify(r.body)}`,
  );
  const claimCall = calls.find((c) => c.name === 'push_claim');
  check(
    JSON.stringify(claimCall?.args) ===
      JSON.stringify({ p_secret: SECRET, p_kind: 'follow', p_subject: SUBJECT, p_recipient: RECIPIENT }),
    `push_claim was called with ${JSON.stringify(claimCall?.args)}`,
  );
  const urls = sent.map((s) => s.url).sort();
  const want = [
    `https://api.push.apple.com/3/device/${T_PROD}`,
    `https://api.push.apple.com/3/device/${T_BAD}`,
    `https://api.sandbox.push.apple.com/3/device/${T_SAND}`,
  ].sort();
  check(JSON.stringify(urls) === JSON.stringify(want), `APNs was called at ${urls.join(', ')}`);
  for (const s of sent) {
    const h = Object.fromEntries(Object.entries(s.init.headers).map(([k, v]) => [k.toLowerCase(), v]));
    check(s.init.method === 'POST', `${s.url}: ${s.init.method}`);
    check(h['apns-topic'] === 'com.janmcqueeny.drinkdex', `${s.url}: apns-topic ${h['apns-topic']}`);
    check(h['apns-push-type'] === 'alert', `${s.url}: apns-push-type ${h['apns-push-type']}`);
    check(h['apns-priority'] === '10', `${s.url}: apns-priority ${h['apns-priority']}`);
    check(h['apns-collapse-id'] === `invite:${SUBJECT}`, `${s.url}: apns-collapse-id ${h['apns-collapse-id']}`);
    check(Buffer.byteLength(h['apns-collapse-id']) <= 64, `${s.url}: the collapse id is over Apple's 64 bytes`);
    const exp = Number(h['apns-expiration']);
    check(exp >= before + 3600 && exp <= before + 2 * 86400, `${s.url}: apns-expiration ${h['apns-expiration']}`);
    const jwt = /^bearer (.+)$/.exec(h.authorization ?? '')?.[1];
    if (!jwt) fail(`${s.url}: no bearer provider token`);
    else checkJwt(jwt, `${s.url}'s provider token`, JSON.parse(fromB64url(jwt.split('.')[1])).iat);
    check(
      s.init.body === JSON.stringify(fn.payloadFor('invite', SUBJECT, 'ana', 'Negroni week')),
      `${s.url}: the body is not payloadFor's`,
    );
  }
  const gone = deleted.map((d) => `${d.table}.${d.col}=${d.value}`).sort();
  check(
    JSON.stringify(gone) === JSON.stringify([`push_tokens.token=${T_BAD}`, `push_tokens.token=${T_SAND}`].sort()),
    `the dead tokens deleted were ${gone.join(', ') || 'none'}`,
  );
  check(!calls.some((c) => c.name === 'push_release'), 'a send that reached one phone was given back');
}
{
  claimAnswer = { data: { ...sendClaim, tokens: [{ token: T_PROD, env: 'production' }] }, error: null };
  apnsAnswer = () => new Response(JSON.stringify({ reason: 'ExpiredProviderToken' }), { status: 403 });
  fn.forgetProviderToken();
  const first = await call(ENV_OK);
  const jwtA = sent[0]?.init.headers.authorization;
  check(
    first.status === 502 &&
      JSON.stringify(first.body) === JSON.stringify({ result: 'not_delivered', sent: 0, dropped: 0, failed: 1, released: true }) &&
      deleted.length === 0,
    `a refused provider token: ${first.status} ${JSON.stringify(first.body)}, ${deleted.length} deleted`,
  );
  const releaseCall = calls.find((c) => c.name === 'push_release');
  check(
    JSON.stringify(releaseCall?.args) ===
      JSON.stringify({ p_secret: SECRET, p_kind: 'follow', p_subject: SUBJECT, p_recipient: RECIPIENT }),
    `a refused provider token: push_release was called with ${JSON.stringify(releaseCall?.args)}`,
  );
  apnsAnswer = () => new Response(null, { status: 200 });
  await call(ENV_OK);
  const jwtB = sent[0]?.init.headers.authorization;
  check(jwtA && jwtB && jwtA !== jwtB, 'after ExpiredProviderToken the next push reused the refused token');
}
{
  // Every phone's token dead (a development build's token sent as production): nothing shown, given back.
  claimAnswer = { data: { ...sendClaim, tokens: [{ token: T_BAD, env: 'production' }] }, error: null };
  apnsAnswer = () => new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 });
  const r = await call(ENV_OK);
  check(
    r.status === 502 && r.body?.result === 'not_delivered' && r.body?.dropped === 1 && r.body?.released === true,
    `every token dead: ${r.status} ${JSON.stringify(r.body)}`,
  );
  check(calls.some((c) => c.name === 'push_release'), 'every token dead: the claim was not given back');
}
{
  // Apple never answered one phone and refused the other: it may have been shown, so it stays spent.
  claimAnswer = { data: { ...sendClaim, tokens: [{ token: T_PROD, env: 'production' }, { token: T_SAND, env: 'sandbox' }] }, error: null };
  apnsAnswer = (url) => {
    if (url.endsWith(T_PROD)) throw new Error('timed out');
    return new Response(JSON.stringify({ reason: 'InternalServerError' }), { status: 500 });
  };
  const r = await call(ENV_OK);
  check(
    r.status === 502 && JSON.stringify(r.body) === JSON.stringify({ result: 'not_delivered', sent: 0, dropped: 0, failed: 2, released: false }),
    `one phone unanswered: ${r.status} ${JSON.stringify(r.body)}`,
  );
  check(!calls.some((c) => c.name === 'push_release'), 'a claim with an unanswered phone was given back');
  apnsAnswer = () => new Response(null, { status: 200 });
}

console.error = consoleError;
check(logged.length > 0, 'the handler logged nothing, even for a missing key');
for (const line of logged) {
  if (/[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(line) || line.includes(SECRET) || line.includes('ana')) {
    fail(`the function logged a token, an id, the secret or a name: "${line}"`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. The contract between the migration, the function and the app    */
/* ------------------------------------------------------------------ */

const MIG_PATH = 'supabase/migrations/027_push.sql';
const mig = read(MIG_PATH);
const sql = mig
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const schema = read('supabase/schema.sql');
const push = read('src/lib/push.ts');

/** `name(arg type, ...)` for each function 027 defines. */
const defined = [...sql.matchAll(/create or replace function ([a-z_.]+)\(([^)]*)\)/g)].map((m) => ({
  name: m[1],
  args: m[2]
    .split(',')
    .map((a) => a.trim().split(/\s+/)[0])
    .filter(Boolean),
}));
const fnArgs = (name) => defined.find((d) => d.name === name)?.args ?? null;

for (const [rpc, args] of [
  ['register_push_token', ['p_token', 'p_env']],
  ['unregister_push_token', ['p_token']],
  ['my_push_settings', []],
  ['set_push_setting', ['p_kind', 'p_on']],
]) {
  check(JSON.stringify(fnArgs(`public.${rpc}`)) === JSON.stringify(args), `${MIG_PATH}: public.${rpc} takes ${fnArgs(`public.${rpc}`)}, not ${args}`);
  check(push.includes(`'${rpc}'`), `src/lib/push.ts never calls ${rpc}`);
  for (const a of args) check(push.includes(`${a}:`), `src/lib/push.ts never names ${a} (for ${rpc})`);
}
for (const [rpc, args] of [
  ['push_caller_ok', ['p_secret']],
  ['push_claim', ['p_secret', 'p_kind', 'p_subject', 'p_recipient']],
  ['push_release', ['p_secret', 'p_kind', 'p_subject', 'p_recipient']],
]) {
  check(JSON.stringify(fnArgs(`public.${rpc}`)) === JSON.stringify(args), `${MIG_PATH}: public.${rpc} takes ${fnArgs(`public.${rpc}`)}, not ${args}`);
  check(fnSource.includes(`'${rpc}'`), `${FN_PATH} never calls ${rpc}`);
  for (const a of args) check(fnSource.includes(`${a}:`), `${FN_PATH} never names ${a} (for ${rpc})`);
  check(
    new RegExp(`grant execute on function public\\.${rpc}\\([^)]*\\)\\s+to service_role;`).test(sql),
    `${MIG_PATH}: ${rpc} is not granted to service_role`,
  );
  check(
    new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\)\\s+from public, anon, authenticated;`).test(sql),
    `${MIG_PATH}: ${rpc} is not revoked from every client role`,
  );
}
check(/'tags', 'invites', 'follows'/.test(sql) && /\['tags', 'invites', 'follows'\]/.test(push), 'the three switch names differ between 027 and lib/push');
check(/'tag', 'invite', 'follow'/.test(sql), `${MIG_PATH}: the three kinds are not 'tag', 'invite', 'follow'`);
check(fnSource.includes("['tag', 'invite', 'follow']"), `${FN_PATH}: the three kinds are not 'tag', 'invite', 'follow'`);
check(sql.includes("'x-sipply-push'") && fnSource.includes("'x-sipply-push'"), 'the trigger and the function name the secret header differently');
{
  // The pair's hour: the trigger's cheap check and the claim's take must be the same length.
  const hours = [...sql.matchAll(/q\.last_at (>|<=) now\(\) - interval '([^']+)'/g)].map((m) => m[2]);
  check(hours.length >= 2 && new Set(hours).size === 1, `${MIG_PATH}: the pair's hour differs between queue_push and push_claim (${hours.join(', ')})`);
}

// Every function: definer, empty search_path, EXECUTE revoked.
for (const block of sql.split(/(?=create or replace function )/).slice(1)) {
  const name = /^create or replace function ([a-z_.]+)/.exec(block)[1];
  const head = block.slice(0, block.indexOf('$$'));
  check(/security definer/.test(head), `${MIG_PATH}: ${name} is not SECURITY DEFINER`);
  check(/set search_path = ''/.test(head), `${MIG_PATH}: ${name} does not pin search_path to empty`);
  check(new RegExp(`revoke all on function ${name.replace('.', '\\.')}\\(`).test(sql), `${MIG_PATH}: ${name}'s EXECUTE is never revoked`);
}
// Last statement is the record (009).
const statements = sql.trim().split(/;\s*\n/).filter((s) => s.trim());
check(
  /insert into public\.schema_migrations \(version\)\s+values \('027_push'\) on conflict \(version\) do nothing;?$/.test(
    statements.at(-1).trim(),
  ),
  `${MIG_PATH}: the last statement is not the 027_push record`,
);
check(/raise exception '027 needs/.test(sql.slice(0, sql.indexOf('create table'))), `${MIG_PATH}: no section 0 guard before the first table`);
check(/-- VERIFY AFTERWARDS/.test(mig), `${MIG_PATH}: no VERIFY block`);
check(!/decrypted_secret\s*(,|from)/.test(mig.slice(0, mig.indexOf('-- Smoke test'))), `${MIG_PATH}: the VERIFY block prints a decrypted secret`);

// schema.sql carries every object, and records 027.
for (const d of defined) check(schema.includes(`create or replace function ${d.name}(`), `supabase/schema.sql lacks ${d.name}`);
for (const obj of [
  'create table if not exists public.push_tokens',
  'create table if not exists public.push_settings',
  'create table if not exists private.push_ledger',
  'create table if not exists private.push_pair',
  'create trigger post_tags_push',
  'create trigger tournament_members_push',
  'create trigger follows_push',
  'create policy push_tokens_read_own',
  'create policy push_settings_read_own',
  "('027_push',",
]) {
  check(schema.includes(obj), `supabase/schema.sql lacks ${obj}`);
}

/* ------------------------------------------------------------------ */

if (failures.length) {
  console.error(`\n  check-push: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(
  `\n  check-push: the key in ${Object.keys(mangled).length} pastings, the ES256 token, ${3 * 2} lines and their payloads, ` +
    'the handler with Supabase and Apple stubbed, and the contract between 027, the function and the app all pass.\n',
);
