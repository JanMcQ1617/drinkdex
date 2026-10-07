/*
 * apple-revoke: takes Sipply off a person's Apple Account when they delete
 * their Sipply account. App Review guideline 5.1.1(v): an app that offers
 * Sign in with Apple must revoke the person's Apple tokens on deletion.
 *
 * Supabase holds no Apple token to revoke: signInWithIdToken checks Apple's
 * identity token and keeps nothing else. So the app (src/lib/appleRevoke.ts)
 * asks the person to confirm with Apple once more, which hands it a fresh
 * authorization code (single use, good for five minutes), and sends the
 * code here with the session. This function then:
 *
 *   1. checks the session (auth.getUser) and reads the account's Apple ID;
 *   2. signs a client secret, an ES256 JWT, with Sipply's Sign in with
 *      Apple key;
 *   3. trades the code at appleid.apple.com/auth/token for tokens;
 *   4. if the identity token in Apple's answer names the account's own
 *      Apple ID, revokes the refresh token at appleid.apple.com/auth/revoke.
 *
 * The app deletes the account only after a 200, or after a 404 (not
 * deployed) or 503 (not configured), which it logs and lets through so a
 * build without this set up can still delete accounts. Every 503 here is
 * logged with console.error, so a key that is set but wrong shows in the
 * function's logs rather than passing silently.
 *
 * Nothing is stored. Apple's tokens live for the length of one request,
 * and nothing about the person (no id, no email, no token) is logged.
 *
 * DEPLOY (Supabase Dashboard, not the CLI): Edge Functions -> Deploy a new
 * function -> Via editor, name it `apple-revoke`, paste this file, keep
 * Verify JWT ON. Secrets (Edge Functions -> Secrets):
 *   APPLE_SIWA_KEY_P8  the whole .p8 text of a key with Sign in with Apple
 *                      enabled for the primary App ID com.janmcqueeny.drinkdex,
 *                      BEGIN/END lines included
 *   APPLE_SIWA_KEY_ID  that key's 10-character Key ID
 *   APPLE_TEAM_ID      the Team ID (already set for apple-music)
 * Supabase supplies SUPABASE_URL and the project's client key itself. The
 * .p8 never goes in the repo (*.p8 is gitignored).
 *
 * Deno code: excluded from the app's tsc and lint. Its one import is an
 * npm: specifier Deno resolves at deploy; nothing is added to package.json.
 * The JWT helpers are copied from apple-music rather than shared, because a
 * Dashboard-deployed function is one file.
 *
 * Request:  POST { "authorizationCode": "c0ffee..." }
 * Answers:  200 { result: 'revoked' }            the account's Apple tokens are revoked
 *           200 { result: 'no_apple_identity' }  the account has no Apple ID; nothing to do
 *           400 bad_request | 401 signed_out |
 *           409 other_apple_account              the code is for a different Apple ID; nothing revoked
 *           422 code_refused                     Apple refused the code (used, expired, other app)
 *           502 upstream | 503 not_configured
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

/** Sign in with Apple's client_id for a native app is its bundle id. */
const CLIENT_ID = 'com.janmcqueeny.drinkdex';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_TIMEOUT_MS = 8000;

/** Apple's codes are short; anything longer, or with spaces, is not one. */
const CODE_SHAPE = /^[\x21-\x7e]{1,2048}$/;

/* -------------------------------------------------------------------- */
/* The client secret                                                    */
/*                                                                      */
/* An ES256 JWT: header { alg, kid }, claims { iss: team, iat, exp,     */
/* aud: https://appleid.apple.com, sub: client_id }. Apple allows six   */
/* months; an hour is plenty for one request, so it is signed fresh     */
/* each time and a rotated key takes effect at once. WebCrypto's ECDSA  */
/* signature is the 64-byte r||s (IEEE P1363) that JWS ES256 wants.     */
/* -------------------------------------------------------------------- */

const SECRET_TTL_S = 60 * 60;

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/*
 * The .p8 as pasted into the secret: PEM, possibly with its line breaks
 * escaped as "\n" (a common accident when a multi-line value goes through
 * a single-line field). Returns the PKCS#8 DER bytes.
 */
function pkcs8FromPem(pem: string) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

/** Signs the client secret. Throws when the key is not a P-256 PKCS#8 key. */
export async function signClientSecret(
  keyP8: string,
  keyId: string,
  teamId: string,
  clientId: string,
  nowS: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8FromPem(keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = base64url(utf8(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const claims = base64url(
    utf8(
      JSON.stringify({
        iss: teamId,
        iat: nowS,
        exp: nowS + SECRET_TTL_S,
        aud: 'https://appleid.apple.com',
        sub: clientId,
      }),
    ),
  );
  const input = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(input)),
  );
  return `${input}.${base64url(signature)}`;
}

/*
 * The `sub` of the identity token in Apple's token answer: the Apple ID the
 * code was for. Read without checking the signature, which is safe here and
 * only here: the token came straight from appleid.apple.com over TLS, in
 * answer to a request this function authenticated, not from the app.
 */
export function subjectOf(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- */
/* The account's Apple ID                                               */
/* -------------------------------------------------------------------- */

interface Identity {
  id?: unknown;
  provider?: unknown;
  identity_data?: { sub?: unknown; provider_id?: unknown } | null;
}

/*
 * Every value GoTrue may keep Apple's `sub` under. An Apple identity's
 * provider_id is the sub; responses carry it as `id` (with the row's own
 * uuid in identity_id) and inside identity_data. All three are read, so a
 * GoTrue version that drops one does not make every Apple ID look foreign.
 */
export function appleSubjects(identities: unknown): Set<string> {
  const subs = new Set<string>();
  if (!Array.isArray(identities)) return subs;
  for (const raw of identities as Identity[]) {
    if (raw?.provider !== 'apple') continue;
    for (const v of [raw.id, raw.identity_data?.sub, raw.identity_data?.provider_id]) {
      if (typeof v === 'string' && v.length > 0) subs.add(v);
    }
  }
  return subs;
}

/* -------------------------------------------------------------------- */
/* Apple                                                                */
/* -------------------------------------------------------------------- */

type AppleCall =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'refused'; error: string } // a 400 with Apple's error code
  | { kind: 'failed' };

/** One form POST to Apple. Apple's error codes are logged; nothing else is. */
async function postApple(url: string, form: Record<string, string>): Promise<AppleCall> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'failed' };
  }
  // revoke answers 200 with no body.
  const text = await res.text().catch(() => '');
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    /* Not JSON: judged by the status alone. */
  }
  if (res.ok) return { kind: 'ok', body };
  // Apple documents 400, but OAuth (RFC 6749 §5.2) lets invalid_client come
  // as 401; any 4xx naming an error is read, so a bad key is never taken
  // for Apple being down.
  if (res.status >= 400 && res.status < 500 && typeof body.error === 'string') {
    return { kind: 'refused', error: body.error };
  }
  console.error(`apple-revoke: ${new URL(url).pathname} answered ${res.status}`);
  return { kind: 'failed' };
}

/* -------------------------------------------------------------------- */
/* Configuration                                                        */
/* -------------------------------------------------------------------- */

interface Project {
  url: string;
  clientKey: string;
}

interface AppleKey {
  keyP8: string;
  keyId: string;
  teamId: string;
}

/* The project's client key, read as apple-music reads it (see there for why this order). */
function publishableFromMap(): string | null {
  const many = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (!many) return null;
  try {
    const map = JSON.parse(many) as Record<string, unknown>;
    const pick = map.default ?? Object.values(map).find((v) => typeof v === 'string');
    return typeof pick === 'string' && pick ? pick : null;
  } catch {
    return null;
  }
}

function clientKey(): string | null {
  return (
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
    publishableFromMap() ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    null
  );
}

/* Supabase supplies these itself; they are needed to check the caller. */
function readProject(): Project | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = clientKey();
  return url && key ? { url, clientKey: key } : null;
}

/* Jan's secrets. Read only after the caller is checked (see handle). */
function readAppleKey(): AppleKey | null {
  const keyP8 = Deno.env.get('APPLE_SIWA_KEY_P8');
  const keyId = Deno.env.get('APPLE_SIWA_KEY_ID');
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  if (!keyP8 || !keyId || !teamId) return null;
  return { keyP8, keyId: keyId.trim(), teamId: teamId.trim() };
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

/** 503, said in the logs too: the app lets deletion through on it, so this is where a bad key shows. */
function notConfigured(why: string): Response {
  console.error(`apple-revoke: not configured (${why}); the app deletes without revoking Apple tokens`);
  return fail(503, 'not_configured');
}

/** The code asked for, or null (400). Nothing but the one key is accepted. */
export function parseCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => k !== 'authorizationCode')) return null;
  const code = b.authorizationCode;
  return typeof code === 'string' && CODE_SHAPE.test(code) ? code : null;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(400, 'bad_request');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const code = parseCode(body);
  if (!code) return fail(400, 'bad_request');

  const project = readProject();
  if (!project) return notConfigured('SUPABASE_URL or the client key is missing');

  // Verify JWT is on, so the gateway has already refused a bad session;
  // checking again here means the account read below is the caller's own.
  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!jwt) return fail(401, 'signed_out');
  const supabase = createClient(project.url, project.clientKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: who, error: whoError } = await supabase.auth.getUser(jwt);
  if (whoError || !who?.user) return fail(401, 'signed_out');

  // No Apple ID on the account: nothing of Apple's to revoke. The code is
  // left unused, and Apple lets it lapse in five minutes.
  const accountSubs = appleSubjects(who.user.identities);
  if (accountSubs.size === 0) return answer(200, { result: 'no_apple_identity' });

  /*
   * After the caller check, not before: every not-configured line in the
   * logs is then a real Apple account being deleted unrevoked, never a
   * probe with the public anon key, and nobody outside an account can ask
   * whether the key is set.
   */
  const appleKey = readAppleKey();
  if (!appleKey) return notConfigured('a Sign in with Apple secret is missing');

  let clientSecret: string;
  try {
    clientSecret = await signClientSecret(
      appleKey.keyP8,
      appleKey.keyId,
      appleKey.teamId,
      CLIENT_ID,
      Math.floor(Date.now() / 1000),
    );
  } catch {
    return notConfigured('APPLE_SIWA_KEY_P8 is not a P-256 .p8 key');
  }

  const traded = await postApple(APPLE_TOKEN_URL, {
    client_id: CLIENT_ID,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  if (traded.kind === 'refused') {
    // invalid_client: the key, its Key ID, the Team ID or the key's Sign in
    // with Apple capability is wrong. Configuration, not the person.
    if (traded.error === 'invalid_client') return notConfigured('Apple answered invalid_client to the token request');
    // invalid_grant: the code was used, expired, or issued to another
    // bundle id (a development build). The app asks again.
    console.error(`apple-revoke: Apple refused the code (${traded.error})`);
    return fail(422, 'code_refused');
  }
  if (traded.kind === 'failed') return fail(502, 'upstream');

  /*
   * Only the account's own Apple ID is revoked. A phone signed in to a
   * different Apple Account hands over a code for that one, and revoking it
   * would end Sipply's access for someone else's Apple ID (or another Sipply
   * account's) while leaving this account's in place. The tokens just
   * received are dropped with the request.
   */
  const sub = subjectOf(traded.body.id_token);
  if (!sub) {
    console.error('apple-revoke: Apple answered without a readable identity token');
    return fail(502, 'upstream');
  }
  if (!accountSubs.has(sub)) return fail(409, 'other_apple_account');

  /*
   * The refresh token, because revoking it ends the authorization itself;
   * the access token only if Apple sent no refresh token (it always should
   * for an authorization code).
   */
  const refresh = typeof traded.body.refresh_token === 'string' ? traded.body.refresh_token : null;
  const access = typeof traded.body.access_token === 'string' ? traded.body.access_token : null;
  const token = refresh ?? access;
  if (!token) {
    console.error('apple-revoke: Apple answered without a token to revoke');
    return fail(502, 'upstream');
  }

  const revoked = await postApple(APPLE_REVOKE_URL, {
    client_id: CLIENT_ID,
    client_secret: clientSecret,
    token,
    token_type_hint: refresh ? 'refresh_token' : 'access_token',
  });
  if (revoked.kind === 'ok') return answer(200, { result: 'revoked' });
  if (revoked.kind === 'refused') {
    if (revoked.error === 'invalid_client') return notConfigured('Apple answered invalid_client to the revoke');
    console.error(`apple-revoke: Apple refused the revoke (${revoked.error})`);
  }
  return fail(502, 'upstream');
}

Deno.serve(handle);
