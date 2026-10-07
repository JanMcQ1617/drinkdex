/*
 * apple-music: song search for music on stories (spec v3.1 §13.2).
 *
 * The app never holds a MusicKit key. It calls this function with the
 * user's session (supabase.functions.invoke sends it); the function signs
 * a MusicKit developer token with Sipply's key, charges the search to the
 * account (public.charge_music_search, migration 020: 120 an hour), asks
 * Apple Music's catalog, and returns only songs that migration 020's
 * post_photos_music_shape would store: a preview on audio-ssl.itunes.apple.com,
 * a link on music.apple.com, artwork (when there is any) on an
 * isN-ssl.mzstatic.com host, and never an explicit song.
 *
 * DEPLOY (Supabase Dashboard, not the CLI): Edge Functions -> Deploy a new
 * function -> Via editor, name it `apple-music`, paste this file, and turn
 * OFF "Verify JWT with legacy secret" (function Settings tab). This project
 * signs sessions with an ECC (P-256) key, so that switch, which accepts only
 * the legacy HS256 secret, refuses every real user with a 401. The handler
 * checks the session itself (auth.getUser below), which is what keeps
 * strangers out.
 * Secrets (Edge Functions -> Secrets): MUSICKIT_KEY_P8 (the
 * whole .p8 text, BEGIN/END lines included), MUSICKIT_KEY_ID, APPLE_TEAM_ID.
 * Supabase supplies SUPABASE_URL and the project's client key itself. The
 * .p8 never goes in the repo (*.p8 is gitignored).
 *
 * Deno code: excluded from the app's tsc and lint. Its one import is an
 * npm: specifier Deno resolves at deploy; nothing is added to package.json.
 *
 * Logs nothing about the user or the search term.
 *
 * Request:  POST { "action": "search", "term": "golden hour", "storefront": "us", "limit": 20 }
 * Answers:  200 { songs, storefront } | 400 bad_request | 401 signed_out |
 *           429 rate_limited | 502 upstream | 503 not_configured
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

/* -------------------------------------------------------------------- */
/* The song, as the app's Song type (src/types.ts) has it                */
/* -------------------------------------------------------------------- */

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string;
  appleMusicUrl: string;
  durationMs: number | null;
  storefront: string;
}

/* The same rules as post_photos_music_shape (migration 020). */
const SONG_ID = /^[0-9]{1,20}$/;
const PREVIEW_URL = /^https:\/\/audio-ssl\.itunes\.apple\.com\//;
const SONG_URL = /^https:\/\/music\.apple\.com\//;
const ARTWORK_URL = /^https:\/\/is[0-9]+-ssl\.mzstatic\.com\//;
const STOREFRONT = /^[a-z]{2}$/;
const URL_MAX = 500;
const TEXT_MAX = 200;
/** Square artwork in pixels: the app draws it at 48pt at most (144px at 3x). */
const ARTWORK_PX = 300;

const TERM_MIN = 2;
const TERM_MAX = 80;
const LIMIT_MAX = 25;
const LIMIT_DEFAULT = 20;

/* -------------------------------------------------------------------- */
/* The MusicKit developer token                                         */
/*                                                                      */
/* An ES256 JWT: header { alg, kid, typ }, claims { iss, iat, exp }.    */
/* WebCrypto's ECDSA signature is the 64-byte r||s (IEEE P1363) that    */
/* JWS ES256 wants, so no DER unwrapping is needed.                      */
/* -------------------------------------------------------------------- */

const TOKEN_TTL_S = 12 * 60 * 60;
/** A cached token is replaced this long before it expires. */
const TOKEN_EARLY_S = 5 * 60;

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/*
 * The .p8 as pasted into the secret: PEM, possibly with its line breaks
 * escaped as "\n" (a common accident when a multi-line value goes through
 * a single-line field). Returns the PKCS#8 DER bytes. (No return type
 * written: TypeScript infers the ArrayBuffer-backed array importKey wants.)
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

/**
 * Signs a MusicKit developer token. Pure: same inputs, a token of the
 * same header and claims (ECDSA signatures are randomised, so the bytes
 * differ). `nowS` is Unix seconds. Throws when the key is not a P-256
 * PKCS#8 key.
 */
export async function signDeveloperToken(
  keyP8: string,
  keyId: string,
  teamId: string,
  nowS: number,
): Promise<{ token: string; expiresAt: number }> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8FromPem(keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const expiresAt = nowS + TOKEN_TTL_S;
  const header = base64url(utf8(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })));
  const claims = base64url(utf8(JSON.stringify({ iss: teamId, iat: nowS, exp: expiresAt })));
  const input = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(input)),
  );
  return { token: `${input}.${base64url(signature)}`, expiresAt };
}

/* Module scope: one token per warm instance, until shortly before it expires. */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function developerToken(config: Config): Promise<string> {
  const nowS = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - TOKEN_EARLY_S > nowS) return cachedToken.token;
  cachedToken = await signDeveloperToken(config.keyP8, config.keyId, config.teamId, nowS);
  return cachedToken.token;
}

/* -------------------------------------------------------------------- */
/* Apple's answer -> songs the app can store                            */
/* -------------------------------------------------------------------- */

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const textOk = (t: string | null): t is string => t !== null && t.length >= 1 && t.length <= TEXT_MAX;
const urlOk = (u: string | null, host: RegExp): u is string => u !== null && u.length <= URL_MAX && host.test(u);

/** Apple's artwork URL template, sized; null when it does not resolve to an Apple image host. */
function artworkOf(attributes: Record<string, unknown>): string | null | undefined {
  const art = attributes.artwork as Record<string, unknown> | undefined;
  const template = str(art?.url);
  if (template === null) return null;
  const url = template
    .replace('{w}', String(ARTWORK_PX))
    .replace('{h}', String(ARTWORK_PX))
    .replace('{f}', 'jpg');
  // A template Apple has changed, or a host the shape check would refuse:
  // undefined drops the song (the spec's rule), rather than store a guess.
  return !url.includes('{') && urlOk(url, ARTWORK_URL) ? url : undefined;
}

/**
 * The songs in a catalog search answer (`results.songs.data`), in Apple's
 * order, minus any that are explicit, have no preview, or would fail
 * post_photos_music_shape. Pure; exported for the token-and-mapping test.
 */
export function songsFromSearch(body: unknown, storefront: string): Song[] {
  const results = (body as { results?: { songs?: { data?: unknown } } } | null)?.results;
  const data = results?.songs?.data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const songs: Song[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const id = str((item as Record<string, unknown>).id);
    const a = (item as Record<string, unknown>).attributes as Record<string, unknown> | undefined;
    if (!a || id === null || !SONG_ID.test(id) || seen.has(id)) continue;
    if (a.contentRating === 'explicit') continue;
    const title = str(a.name);
    const artist = str(a.artistName);
    const previews = Array.isArray(a.previews) ? a.previews : [];
    const previewUrl = str((previews[0] as Record<string, unknown> | undefined)?.url);
    const appleMusicUrl = str(a.url);
    const artworkUrl = artworkOf(a);
    if (!textOk(title) || !textOk(artist)) continue;
    if (!urlOk(previewUrl, PREVIEW_URL) || !urlOk(appleMusicUrl, SONG_URL)) continue;
    if (artworkUrl === undefined) continue;
    const duration = a.durationInMillis;
    seen.add(id);
    songs.push({
      id,
      title,
      artist,
      album: str(a.albumName),
      artworkUrl,
      previewUrl,
      appleMusicUrl,
      durationMs: typeof duration === 'number' && Number.isFinite(duration) ? Math.round(duration) : null,
      storefront,
    });
  }
  return songs;
}

/* -------------------------------------------------------------------- */
/* The request                                                          */
/* -------------------------------------------------------------------- */

interface Search {
  term: string;
  storefront: string;
  limit: number;
}

const ALLOWED_KEYS = new Set(['action', 'term', 'storefront', 'limit']);

/** The search asked for, or null for anything else (400). Nothing but the four keys is accepted. */
export function parseSearch(body: unknown): Search | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => !ALLOWED_KEYS.has(k))) return null;
  if (b.action !== 'search' || typeof b.term !== 'string') return null;
  const term = b.term.trim();
  if (term.length < TERM_MIN || term.length > TERM_MAX) return null;
  const storefront = b.storefront === undefined ? 'us' : b.storefront;
  if (typeof storefront !== 'string' || !STOREFRONT.test(storefront)) return null;
  const limit = b.limit === undefined ? LIMIT_DEFAULT : b.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) return null;
  return { term, storefront, limit };
}

/* -------------------------------------------------------------------- */
/* Answers cached per instance                                          */
/*                                                                      */
/* Ten minutes, 200 at most, by storefront, lower-cased term and limit: */
/* the picker searches as you type, and two people typing the same      */
/* song should cost Apple one request. The account is still charged.    */
/* -------------------------------------------------------------------- */

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const answers = new Map<string, { at: number; songs: Song[]; storefront: string }>();

function cached(key: string): { songs: Song[]; storefront: string } | null {
  const hit = answers.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    answers.delete(key);
    return null;
  }
  return hit;
}

function remember(key: string, songs: Song[], storefront: string): void {
  answers.delete(key);
  // A Map iterates in insertion order: the first key is the oldest.
  while (answers.size >= CACHE_MAX) {
    const oldest = answers.keys().next().value;
    if (oldest === undefined) break;
    answers.delete(oldest);
  }
  answers.set(key, { at: Date.now(), songs, storefront });
}

/* -------------------------------------------------------------------- */
/* Apple Music                                                          */
/* -------------------------------------------------------------------- */

const APPLE_TIMEOUT_MS = 8000;

type AppleOutcome =
  | { kind: 'ok'; songs: Song[]; storefront: string }
  | { kind: 'refused' } // the key: Apple answered 401/403, or the .p8 would not import
  | { kind: 'failed' };

async function searchApple(config: Config, search: Search, storefront: string, retried = false): Promise<AppleOutcome> {
  let token: string;
  try {
    token = await developerToken(config);
  } catch {
    // A .p8 that will not import is configuration, not Apple being down.
    return { kind: 'refused' };
  }
  const url =
    `https://api.music.apple.com/v1/catalog/${storefront}/search` +
    `?types=songs&limit=${search.limit}&term=${encodeURIComponent(search.term)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'failed' };
  }
  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    return { kind: 'refused' };
  }
  // A region with no storefront of its own: the US one, once.
  if ((res.status === 400 || res.status === 404) && storefront !== 'us' && !retried) {
    return searchApple(config, search, 'us', true);
  }
  if (!res.ok) {
    console.error(`apple-music: Apple answered ${res.status}`);
    return { kind: 'failed' };
  }
  try {
    return { kind: 'ok', songs: songsFromSearch(await res.json(), storefront), storefront };
  } catch {
    return { kind: 'failed' };
  }
}

/* -------------------------------------------------------------------- */
/* Configuration                                                        */
/* -------------------------------------------------------------------- */

interface Config {
  url: string;
  clientKey: string;
  keyP8: string;
  keyId: string;
  teamId: string;
}

/*
 * The project's client key. This project uses the new sb_publishable_
 * keys (SUPABASE_PUBLISHABLE_KEY); legacy projects have SUPABASE_ANON_KEY.
 * Some runtimes expose the new keys only as SUPABASE_PUBLISHABLE_KEYS, a
 * JSON map of named keys, so that is read too, and BEFORE the legacy key:
 * a project on the new keys may have its legacy keys switched off, and a
 * dead anon key would answer every search signed_out. Any live one works
 * here: the user's own token is what getUser checks and what the budget is
 * charged to.
 */
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

function readConfig(): Config | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = clientKey();
  const keyP8 = Deno.env.get('MUSICKIT_KEY_P8');
  const keyId = Deno.env.get('MUSICKIT_KEY_ID');
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  if (!url || !key || !keyP8 || !keyId || !teamId) return null;
  return { url, clientKey: key, keyP8, keyId: keyId.trim(), teamId: teamId.trim() };
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

export async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(400, 'bad_request');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const search = parseSearch(body);
  if (!search) return fail(400, 'bad_request');

  const config = readConfig();
  if (!config) return fail(503, 'not_configured');

  // The gateway does not check the session (see DEPLOY above), so this is
  // the check: a missing or bad session stops here, before any budget.
  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!jwt) return fail(401, 'signed_out');
  const supabase = createClient(config.url, config.clientKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: who, error: whoError } = await supabase.auth.getUser(jwt);
  if (whoError || !who?.user) return fail(401, 'signed_out');

  // Charged as the user (the same client carries their token), so the
  // count is per account.
  const { data: allowed, error: chargeError } = await supabase.rpc('charge_music_search');
  if (chargeError) {
    // Migration 020 not applied: the feature is not set up yet.
    if (chargeError.code === 'PGRST202' || chargeError.code === '42883') return fail(503, 'not_configured');
    return fail(502, 'upstream');
  }
  if (allowed !== true) return fail(429, 'rate_limited');

  const key = `${search.storefront}|${search.term.toLowerCase()}|${search.limit}`;
  const hit = cached(key);
  if (hit) return answer(200, { songs: hit.songs, storefront: hit.storefront });

  const outcome = await searchApple(config, search, search.storefront);
  if (outcome.kind === 'refused') return fail(503, 'not_configured');
  if (outcome.kind === 'failed') return fail(502, 'upstream');
  remember(key, outcome.songs, outcome.storefront);
  return answer(200, { songs: outcome.songs, storefront: outcome.storefront });
}

Deno.serve(handle);
