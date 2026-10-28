/*
 * push: tells someone, through Apple's Push Notification service, that
 * another person tagged them in a post, invited them to a tournament or
 * started following them (specs/v4.9/push.md; migration 027).
 *
 * WHO CALLS IT. Only the database: 027's AFTER INSERT triggers on
 * post_tags, tournament_members and follows queue one POST here through
 * pg_net, with ids only, { kind, subject, recipient }, and the header
 * x-sipply-push carrying a secret 027 made in Vault. The "Verify JWT"
 * switch is OFF (pg_net's call carries no user's session), so anyone can
 * reach this URL, and this function authenticates the caller itself:
 *
 *   1. push_caller_ok(secret), an RPC only service_role may execute, says
 *      whether the header is the Vault secret. Nothing else happens, and
 *      nothing about the configuration is said, until it does.
 *   2. The APNs key is read and the provider token signed, so a missing
 *      or broken key answers 503 BEFORE the event is used up.
 *   3. push_claim(secret, kind, subject, recipient) re-reads the event
 *      with the service role: the tag, the invite or the follow must
 *      still exist, be under an hour old, involve nobody blocked either
 *      way, have the recipient's switch on, never have been pushed, and
 *      (a tag or an invite) be the first from that person to that person
 *      in the hour. It writes the ledger in the same step, so a retry, a
 *      re-insert or a forged call never pushes one event twice, and
 *      nothing that did not happen is ever pushed. It answers the actor's
 *      username, the tournament's name for an invite, and the
 *      recipient's tokens.
 *   4. One POST per token to api.push.apple.com (or the sandbox, for a
 *      development build's token), HTTP/2 through fetch's ALPN. A token
 *      Apple calls dead (410; 400 BadDeviceToken or
 *      DeviceTokenNotForTopic) is deleted.
 *   5. When no phone took it and Apple answered for every one (refusing
 *      the provider token, for a wrong Key ID, Team ID or key; calling
 *      the token dead; any other refusal), nothing can have been shown,
 *      so push_release gives the claim back: the fault, once fixed, does
 *      not leave that event (for a follow, that pair of people, ever)
 *      silenced. Nothing retries it; the next such event simply pushes.
 *
 * A phone Apple never answered (a timeout, a dropped connection) may
 * still have been shown it, so then the claim stays spent: never twice
 * beats at least once for a "someone followed you". Whenever no phone
 * took it the answer is a 502, so pg_net's log (net._http_response)
 * shows it as a failure.
 *
 * THE WORDS (App Store 1.4.3: nothing that encourages drinking; no
 * amounts). Body only, as the daily ideas are: iOS puts the app's name on
 * the first line. "ana tagged you in a post.", "ana invited you to Negroni
 * week.", "ana started following you." A tournament's name is the host's
 * own words and already passed the content filter (020), but this is
 * Sipply speaking on a lock screen, so a name with a digit or a word from
 * the 1.4.3 list becomes "invited you to a tournament." No badge. One
 * thread per kind. data { kind, url } opens the post, the tournament or
 * the person (src/lib/notifications routeNotification): expo-notifications
 * reads a remote notification's data from the payload's top-level `body`
 * dictionary, which is why it is called that.
 *
 * Nothing about a person is logged: no id, no username, no token. Apple's
 * reason codes and the claim's one-word results are.
 *
 * DEPLOY (Supabase Dashboard, not the CLI): Edge Functions -> Deploy a new
 * function -> Via editor, name it `push`, paste this file, and turn OFF
 * "Verify JWT with legacy secret" (function Settings tab). The caller
 * check above is what keeps strangers out.
 * Secrets (Edge Functions -> Secrets):
 *   APNS_KEY       the .p8 of a key with Apple Push Notifications service
 *                  enabled (Team scoped, Sandbox & Production). Pasted as
 *                  is into a one-line field: the BEGIN/END lines, line
 *                  breaks, escaped "\n"s and anything else that is not
 *                  base64 are stripped here (normaliseP8)
 *   APNS_KEY_ID    that key's 10-character Key ID
 *   APPLE_TEAM_ID  the Team ID (set already, for Sign in with Apple)
 * Supabase supplies SUPABASE_URL and the service role key itself. The .p8
 * never goes in the repo (*.p8 is gitignored).
 *
 * Deno code: excluded from the app's tsc and lint. Its one import is an
 * npm: specifier Deno resolves at deploy; nothing is added to package.json.
 * One file, so it can be pasted into the Dashboard editor; the JWT signer
 * follows apple-revoke's rather than sharing it. scripts/check-push.mjs
 * tests it offline, Deno and the import stubbed.
 *
 * Request:  POST { "kind": "tag" | "invite" | "follow", "subject": uuid, "recipient": uuid }
 *           header x-sipply-push: <the Vault secret>
 * Answers:  200 { result: 'sent', sent, dropped, failed }  claimed; at least one phone took it
 *           200 { result: 'gone' | 'stale' | 'blocked' | 'off' |
 *                 'no_device' | 'duplicate' | 'limited' }  claimed nothing; nothing sent
 *           502 { result: 'not_delivered', sent: 0, dropped, failed, released }
 *                                     claimed; no phone took it; released when given back
 *           400 bad_request | 401 forbidden | 502 upstream | 503 not_configured
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

/** The APNs topic is the bundle id. */
export const TOPIC = 'com.janmcqueeny.drinkdex';

export const APNS_HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

const SECRET_HEADER = 'x-sipply-push';
const APNS_TIMEOUT_MS = 8000;
/** Apple drops a push it could not deliver after this: a day-old "someone followed you" says nothing. */
const EXPIRES_S = 24 * 60 * 60;

export type Kind = 'tag' | 'invite' | 'follow';
const KINDS: readonly Kind[] = ['tag', 'invite', 'follow'];
type Env = keyof typeof APNS_HOSTS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[0-9a-f]{64,200}$/;
/** profiles_username_shape (002). */
const USERNAME = /^[a-z0-9._]{3,24}$/;

/* -------------------------------------------------------------------- */
/* The provider token                                                   */
/*                                                                      */
/* An ES256 JWT: header { alg, kid }, claims { iss: team, iat }, and    */
/* nothing else (Apple refuses one with more). Apple accepts it for an  */
/* hour and wants it refreshed no more often than every 20 minutes, so  */
/* each isolate keeps one for 50 minutes. WebCrypto's ECDSA signature   */
/* is the 64-byte r||s (IEEE P1363) that JWS ES256 wants.               */
/* -------------------------------------------------------------------- */

export const TOKEN_REUSE_S = 50 * 60;

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/*
 * The base64 inside the .p8, however it was pasted. A multi-line PEM in
 * a one-line Dashboard field arrives with its line breaks as spaces, as
 * literal "\n"s, as nothing at all, or with its dashes turned into other
 * dashes by an editor. So: the BEGIN and END lines go (dashes or not),
 * then every escaped \n, \r or \t, then every character that is not
 * base64. Padding is kept only at the end. Throws when nothing is left.
 */
export function normaliseP8(raw: string): string {
  const body = raw
    .replace(/[-‐-―−]*\s*(BEGIN|END)\s*(EC\s*)?PRIVATE\s*KEY\s*[-‐-―−]*/gi, '')
    .replace(/\\[nrt]/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  const bare = body.replace(/=+$/, '').replace(/=/g, '');
  if (bare.length === 0) throw new Error('empty key');
  return bare + '='.repeat((4 - (bare.length % 4)) % 4);
}

/** The PKCS#8 DER bytes of the .p8. Throws when it is not base64 of a DER sequence. */
export function pkcs8FromP8(raw: string): Uint8Array {
  const bin = atob(normaliseP8(raw));
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  if (der.length < 32 || der[0] !== 0x30) throw new Error('not a DER sequence');
  return der;
}

/** Signs a provider token. Throws when the key is not a P-256 PKCS#8 key. */
export async function signProviderToken(keyP8: string, keyId: string, teamId: string, nowS: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8FromP8(keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = base64url(utf8(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const claims = base64url(utf8(JSON.stringify({ iss: teamId, iat: nowS })));
  const input = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(input)));
  return `${input}.${base64url(signature)}`;
}

interface ApnsKey {
  keyP8: string;
  keyId: string;
  teamId: string;
}

let cached: { jwt: string; keyId: string; teamId: string; at: number } | null = null;

/** This isolate's provider token, signed again after TOKEN_REUSE_S or when the key changed. */
export async function providerToken(key: ApnsKey, nowS: number): Promise<string> {
  if (cached && cached.keyId === key.keyId && cached.teamId === key.teamId && nowS - cached.at < TOKEN_REUSE_S) {
    return cached.jwt;
  }
  const jwt = await signProviderToken(key.keyP8, key.keyId, key.teamId, nowS);
  cached = { jwt, keyId: key.keyId, teamId: key.teamId, at: nowS };
  return jwt;
}

/** After Apple refuses the token: the next push signs a fresh one. */
export function forgetProviderToken(): void {
  cached = null;
}

/* -------------------------------------------------------------------- */
/* The words                                                            */
/* -------------------------------------------------------------------- */

/*
 * The 1.4.3 list the daily ideas are held to (scripts/check-ideas.mjs),
 * for the one thing here someone else wrote: a tournament's name. A match
 * is not refused, only left out: the push says "a tournament" instead.
 */
const NOT_ON_A_LOCK_SCREEN: RegExp[] = [
  /\bhave an?\b/i,
  /\b(grab|pour (yourself|one|a))\b/i,
  /\bdrink(ing)? up\b|\bdrinking\b/i,
  /\bsip(s|ping)?\b|\bcheers\b|\bbottoms up\b/i,
  /\bshots?\b|\brounds?\b|\bnightcap\b/i,
  /\bhappy hour\b|\btonight\b|\bthis (evening|afternoon|morning)\b|\bafter work\b|o'clock/i,
  /\bweekend\b|\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
  /\bthirst(y)?\b|\bbuzz(ed)?\b|\btipsy\b|\bdrunk\b|\bhangover\b|\bwasted\b|\bparty\b|\bbooz(e|y)\b/i,
  /\btreat yourself\b|\bdeserve\b|\btime for\b|\bneed a\b/i,
  /\bstreak\b|\bin a row\b|\bevery (day|night)\b|\bdaily\b/i,
  /\bcatch (them )?all\b|\bchallenge\b|\bbeat\b|\brace\b|\bgoal\b|\btarget\b|\bmore drinks\b/i,
  /\banother (round|one|drink|glass)\b|\bnext (drink|one|round|glass)\b/i,
  /\btry(ing)?\b/i,
  /\border\b|\bbars?\b/i,
  /\bstrong(er|est)?\b/i,
  // Names only: the games and the nights that are about amounts.
  /\bchug|\bkegs?\b|\bpong\b|\bcrawl\b|\bbinge\b|\bblackout\b|\bhammered\b|\bsmashed\b|\blit\b/i,
];

/** The tournament's name as the push may say it, or null for "a tournament". */
export function lockScreenTitle(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const t = name.replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/, '').trim();
  if (t.length === 0 || t.length > 40) return null;
  // No amounts: "First to 10", "12 cocktails week".
  if (/\d/.test(t)) return null;
  if (NOT_ON_A_LOCK_SCREEN.some((re) => re.test(t))) return null;
  return t;
}

/** The notification's one line. */
export function bodyFor(kind: Kind, actor: string, title: string | null): string {
  switch (kind) {
    case 'tag':
      return `${actor} tagged you in a post.`;
    case 'invite': {
      const t = lockScreenTitle(title);
      return t ? `${actor} invited you to ${t}.` : `${actor} invited you to a tournament.`;
    }
    case 'follow':
      return `${actor} started following you.`;
  }
}

/** What a tap opens: a path on routeNotification's allowlist. */
export function urlFor(kind: Kind, subject: string): string {
  switch (kind) {
    case 'tag':
      return `/post/${subject}`;
    case 'invite':
      return `/tournaments/${subject}`;
    case 'follow':
      return `/user/${subject}`;
  }
}

/** Notification Centre groups each kind on its own. */
export const THREADS: Record<Kind, string> = { tag: 'tags', invite: 'invites', follow: 'follows' };

/** The APNs payload. No badge; the default sound; the data under `body` for expo-notifications. */
export function payloadFor(kind: Kind, subject: string, actor: string, title: string | null) {
  return {
    aps: {
      alert: { body: bodyFor(kind, actor, title) },
      sound: 'default',
      'thread-id': THREADS[kind],
    },
    body: { kind, url: urlFor(kind, subject) },
  };
}

/* -------------------------------------------------------------------- */
/* Input                                                                */
/* -------------------------------------------------------------------- */

export interface PushEvent {
  kind: Kind;
  subject: string;
  recipient: string;
}

/** The trigger's body, or null (400). Exactly its three keys. */
export function parseEvent(body: unknown): PushEvent | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => k !== 'kind' && k !== 'subject' && k !== 'recipient')) return null;
  const { kind, subject, recipient } = b;
  if (typeof kind !== 'string' || !KINDS.includes(kind as Kind)) return null;
  if (typeof subject !== 'string' || !UUID.test(subject)) return null;
  if (typeof recipient !== 'string' || !UUID.test(recipient)) return null;
  return { kind: kind as Kind, subject, recipient };
}

interface Device {
  token: string;
  env: Env;
}

type Claim =
  | { result: 'send'; kind: Kind; subject: string; actor: string; title: string | null; devices: Device[] }
  | { result: string };

/** push_claim's answer, shape-checked rather than trusted. Null when it is not one. */
export function parseClaim(data: unknown): Claim | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.result !== 'string' || !/^[a-z_]{1,20}$/.test(d.result)) return null;
  if (d.result !== 'send') return { result: d.result };
  if (typeof d.kind !== 'string' || !KINDS.includes(d.kind as Kind)) return null;
  if (typeof d.subject !== 'string' || !UUID.test(d.subject)) return null;
  if (typeof d.actor !== 'string' || !USERNAME.test(d.actor)) return null;
  const devices = (Array.isArray(d.tokens) ? d.tokens : [])
    .map((t): Device | null => {
      const o = (t ?? {}) as { token?: unknown; env?: unknown };
      return typeof o.token === 'string' && TOKEN.test(o.token) && (o.env === 'production' || o.env === 'sandbox')
        ? { token: o.token, env: o.env }
        : null;
    })
    .filter((t): t is Device => t !== null)
    .slice(0, 10);
  return {
    result: 'send',
    kind: d.kind as Kind,
    subject: d.subject,
    actor: d.actor,
    title: typeof d.title === 'string' ? d.title : null,
    devices,
  };
}

/* -------------------------------------------------------------------- */
/* Apple                                                                */
/* -------------------------------------------------------------------- */

/** `unanswered` is sendOne's alone: no status came back, so Apple may have taken it. */
export type Outcome = 'sent' | 'gone' | 'auth' | 'failed' | 'unanswered';

/** What Apple's answer means for this token. */
export function outcomeOf(status: number, reason: string | null): Outcome {
  if (status === 200) return 'sent';
  if (status === 410) return 'gone';
  if (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic')) return 'gone';
  if (status === 403 && reason !== null && /ProviderToken$/.test(reason)) return 'auth';
  return 'failed';
}

async function reasonOf(res: Response): Promise<string | null> {
  try {
    const r = ((await res.json()) as { reason?: unknown }).reason;
    return typeof r === 'string' && /^[A-Za-z]{1,64}$/.test(r) ? r : null;
  } catch {
    return null;
  }
}

/** One push to one phone. Apple's reason is logged; never the token. */
async function sendOne(device: Device, jwt: string, payload: string, collapseId: string, nowS: number): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(`${APNS_HOSTS[device.env]}/3/device/${device.token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(nowS + EXPIRES_S),
        // One event, one notification on the phone, should Apple ever see it twice.
        'apns-collapse-id': collapseId,
        'content-type': 'application/json',
      },
      body: payload,
      signal: AbortSignal.timeout(APNS_TIMEOUT_MS),
    });
  } catch {
    console.error(`push: APNs (${device.env}) did not answer`);
    return 'unanswered';
  }
  if (res.status === 200) return 'sent';
  const reason = await reasonOf(res);
  const outcome = outcomeOf(res.status, reason);
  if (outcome !== 'gone') console.error(`push: APNs (${device.env}) answered ${res.status} ${reason ?? ''}`.trim());
  return outcome;
}

/* -------------------------------------------------------------------- */
/* Configuration                                                        */
/* -------------------------------------------------------------------- */

interface Project {
  url: string;
  serviceKey: string;
}

/* The new key system's map of secret keys, as apple-revoke reads the publishable one. */
function secretFromMap(): string | null {
  const many = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!many) return null;
  try {
    const map = JSON.parse(many) as Record<string, unknown>;
    const pick = map.default ?? Object.values(map).find((v) => typeof v === 'string');
    return typeof pick === 'string' && pick ? pick : null;
  } catch {
    return null;
  }
}

/* Supabase supplies these itself. The service role is what push_caller_ok and push_claim need. */
function readProject(): Project | null {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || secretFromMap();
  return url && serviceKey ? { url, serviceKey } : null;
}

/* Jan's secrets. Read only after the caller is checked (see handle). Quotes and spaces pasted round an id go. */
function readApnsKey(): ApnsKey | null {
  const keyP8 = Deno.env.get('APNS_KEY');
  const id = (name: string) => (Deno.env.get(name) ?? '').replace(/["'\s]/g, '').toUpperCase();
  const keyId = id('APNS_KEY_ID');
  const teamId = id('APPLE_TEAM_ID');
  if (!keyP8 || !/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId)) return null;
  return { keyP8, keyId, teamId };
}

/* -------------------------------------------------------------------- */
/* The handler                                                          */
/* -------------------------------------------------------------------- */

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const fail = (status: number, error: string) => answer(status, { error });

/** 503, said in the logs too: pg_net only keeps the answer for hours, the logs keep it longer. */
function notConfigured(why: string): Response {
  console.error(`push: not configured (${why}); nothing was claimed or sent`);
  return fail(503, 'not_configured');
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(400, 'bad_request');
  const secret = req.headers.get(SECRET_HEADER) ?? '';
  if (secret.length === 0 || secret.length > 256) return fail(401, 'forbidden');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const event = parseEvent(body);
  if (!event) return fail(400, 'bad_request');

  const project = readProject();
  if (!project) return notConfigured('SUPABASE_URL or the service role key is missing');
  const db = createClient(project.url, project.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // 1. The caller. 027 missing answers an error here (PGRST202), logged by code only.
  const caller = await db.rpc('push_caller_ok', { p_secret: secret });
  if (caller.error) {
    console.error(`push: push_caller_ok failed (${caller.error.code ?? 'no code'})`);
    return fail(502, 'upstream');
  }
  if (caller.data !== true) return fail(401, 'forbidden');

  // 2. The key, before anything is claimed: a broken key must not use events up.
  const key = readApnsKey();
  if (!key) return notConfigured('APNS_KEY, APNS_KEY_ID or APPLE_TEAM_ID is missing or misshapen');
  const nowS = Math.floor(Date.now() / 1000);
  let jwt: string;
  try {
    jwt = await providerToken(key, nowS);
  } catch {
    return notConfigured('APNS_KEY is not a P-256 .p8 key');
  }

  // 3. The event, re-read and spent.
  const claimed = await db.rpc('push_claim', {
    p_secret: secret,
    p_kind: event.kind,
    p_subject: event.subject,
    p_recipient: event.recipient,
  });
  if (claimed.error) {
    console.error(`push: push_claim failed (${claimed.error.code ?? 'no code'})`);
    return fail(502, 'upstream');
  }
  const claim = parseClaim(claimed.data);
  if (!claim) {
    console.error('push: push_claim answered something unreadable');
    return fail(502, 'upstream');
  }
  if (!('devices' in claim)) return answer(200, { result: claim.result });

  // 4. Apple, every phone at once.
  const payload = JSON.stringify(payloadFor(claim.kind, claim.subject, claim.actor, claim.title));
  const collapseId = `${claim.kind}:${claim.subject}`;
  const outcomes = await Promise.all(claim.devices.map((d) => sendOne(d, jwt, payload, collapseId, nowS)));

  const dead = claim.devices.filter((_, i) => outcomes[i] === 'gone');
  for (const d of dead) {
    const { error } = await db.from('push_tokens').delete().eq('token', d.token);
    if (error) console.error(`push: a dead token was not deleted (${error.code ?? 'no code'})`);
  }
  if (outcomes.includes('auth')) {
    // InvalidProviderToken / ExpiredProviderToken: the key, its Key ID or the Team ID is wrong, or the clock.
    forgetProviderToken();
    console.error('push: APNs refused the provider token; check APNS_KEY, APNS_KEY_ID and APPLE_TEAM_ID');
  }

  const counts = {
    sent: outcomes.filter((o) => o === 'sent').length,
    dropped: dead.length,
    failed: outcomes.filter((o) => o === 'auth' || o === 'failed' || o === 'unanswered').length,
  };
  if (counts.sent > 0) return answer(200, { result: 'sent', ...counts });

  // 5. No phone took it. Given back when Apple answered for every one, so none can have shown it.
  let released = false;
  if (!outcomes.includes('unanswered')) {
    const back = await db.rpc('push_release', {
      p_secret: secret,
      p_kind: event.kind,
      p_subject: event.subject,
      p_recipient: event.recipient,
    });
    if (back.error) console.error(`push: push_release failed (${back.error.code ?? 'no code'})`);
    released = back.data === true;
  }
  console.error(`push: not delivered (${counts.dropped} dead, ${counts.failed} failed)${released ? '; the claim was given back' : ''}`);
  return answer(502, { result: 'not_delivered', ...counts, released });
}

Deno.serve(handle);
