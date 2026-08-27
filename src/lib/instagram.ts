import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

/* ==================================================================== */
/* Instagram connections                                                */
/*                                                                      */
/* THE HONEST VERSION OF "CONNECT INSTAGRAM"                            */
/*                                                                      */
/* There is no API that returns an Instagram follower or following list */
/* to a third-party app. The Graph API exposes followers_COUNT and       */
/* nothing more; the Basic Display API — the only one that ever covered  */
/* personal accounts — was switched off on 4 December 2024, and every    */
/* surviving Instagram login requires a Business or Creator account.     */
/* An OAuth "Connect Instagram" button is therefore not a thing we have  */
/* not built yet; it is a thing that cannot be built.                    */
/*                                                                      */
/* Scraping the private web endpoints (as the "export your followers"    */
/* tools do) would work and is not on the table: it breaks Instagram's   */
/* terms, it gets the USER's account restricted rather than ours, and it */
/* would put us one selector change away from a dead feature.            */
/*                                                                      */
/* What is left is the one copy of the list that legitimately exists:    */
/* the user's own. Instagram's "Download your information" hands any     */
/* account its followers and following as JSON, usually within half an   */
/* hour. We parse that file on the device, hash the handles, and match   */
/* them the same way contacts are matched.                              */
/* ==================================================================== */

/*
 * Deliberately different from the contacts salt: the two hash spaces must
 * not collide, or a known phone number would confirm a handle and vice
 * versa. Like that one, it is a shipped constant rather than a secret —
 * it stops a table dump from reading as a Sipply-to-Instagram identity
 * map, and does not pretend to defeat someone brute-forcing a handle they
 * already suspect.
 */
const SALT = 'clink.v1.instagram-salt';

/* ==================================================================== */
/* Handles                                                              */
/* ==================================================================== */

/*
 * Path segments that look like handles in an instagram.com URL but are
 * not. Without this, a pasted post or reel link imports "p" or "reel" as
 * a person and it silently never matches anyone.
 */
const RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'direct',
  'about',
  'legal',
  'privacy',
  'developer',
  'challenge',
  'session',
  'emails',
  /*
   * Belt to the regex's braces. `_u` can only reach here if a URL form
   * slips past the match above, and a real account named `_u` is a price
   * worth paying: the failure it prevents is silent — a whole following
   * list collapsing to one handle that matches nobody, which reads as
   * "none of your friends are here" rather than as a bug.
   */
  '_u',
]);

/**
 * Reduces anything that identifies an Instagram account to a bare handle.
 *
 * Accepts `@name`, `name`, `instagram.com/name`, a full profile URL with
 * query and trailing slash, and the same with capitals. Returns null for
 * anything that is not a possible handle, so callers can filter rather
 * than hash garbage.
 *
 * Both sides of a comparison run this before hashing — the account making
 * itself findable and the person importing a list — so normalization
 * drift here breaks matching everywhere. Change it and old hashes stop
 * lining up with new ones.
 */
export function normalizeHandle(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;

  /*
   * Strip a profile URL down to the handle.
   *
   * The optional `_u/` is not cosmetic. Instagram's real export writes
   * following.json entries as `instagram.com/_u/<handle>` — its
   * open-in-app link form — and with no `value` field to fall back on.
   * Without this, every followed account parsed as the literal handle
   * "_u", the whole list deduped to one junk entry, and it matched
   * nobody. Found only by running an actual export through this: the
   * reconstructed fixtures all used the plain `instagram.com/<handle>`
   * form that followers_1.json still uses.
   */
  const url = s.match(/(?:^|\/\/)(?:www\.)?instagram\.com\/(?:_u\/)?([^/?#\s]+)/i);
  if (url) s = url[1];

  s = s.replace(/^@+/, '').replace(/\/+$/, '').split(/[?#]/)[0].trim().toLowerCase();

  // Instagram's own rule: 1–30 of letter, digit, period, underscore.
  if (!/^[a-z0-9._]{1,30}$/.test(s)) return null;
  // A handle of only dots and underscores is not a real account, and "..."
  // shows up in export files as a placeholder.
  if (!/[a-z0-9]/.test(s)) return null;
  if (RESERVED.has(s)) return null;

  return s;
}

export async function hashHandle(raw: string): Promise<string | null> {
  const normalized = normalizeHandle(raw);
  if (!normalized) return null;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${SALT}:${normalized}`);
}

/* ==================================================================== */
/* Reading an export                                                    */
/* ==================================================================== */

export type ConnectionKind = 'followers' | 'following';

export interface ImportedConnection {
  handle: string;
  hash: string;
  /** They follow you on Instagram. */
  follower: boolean;
  /** You follow them on Instagram. */
  followed: boolean;
}

/*
 * Files inside connections/followers_and_following/ that are NOT friends.
 * Importing blocked_accounts would suggest following someone the user
 * deliberately blocked — the single worst thing this feature could do —
 * so the skip list is matched before anything else and errs wide. Pending
 * follow requests are excluded on the same principle: in one direction they
 * are people who have not accepted you, in the other they are strangers
 * asking in, and neither belongs in a list the user is about to bulk-follow.
 */
const SKIP_FILE = /blocked|restricted|unfollowed|dismissed|hide|removed|permanent|request/i;

/*
 * Top-level keys Instagram uses. followers_1.json is a BARE ARRAY with no
 * key at all, which is why kind falls back to the filename; the rest are
 * objects keyed like this. Meta renames these without notice, so the
 * parser treats an unknown key as "some list of people" rather than
 * failing — a wrong `kind` only affects the mutual badge, while refusing
 * to parse would lose the whole import.
 */
const KEY_KIND: { pattern: RegExp; kind: ConnectionKind }[] = [
  { pattern: /follower/i, kind: 'followers' },
  { pattern: /following|close_friend/i, kind: 'following' },
];

/*
 * Matched against the JSON's own top-level key, because a merged export can
 * carry several relationship lists in one file and the filename then says
 * nothing. `request` covers both directions — follow_requests_sent is people
 * who have not accepted you, follow_requests_received is strangers asking in;
 * neither is a friend, and both are keyed without the word "pending".
 */
const SKIP_KEY = /blocked|restricted|unfollowed|dismissed|hide_story|pending|request/i;

/** Pulls handles out of one `string_list_data` entry. */
function handlesFromEntry(entry: unknown): string[] {
  if (typeof entry !== 'object' || entry === null) return [];
  const list = (entry as { string_list_data?: unknown }).string_list_data;
  if (!Array.isArray(list)) return [];

  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { value, href } = item as { value?: unknown; href?: unknown };
    // `value` is the handle; `href` is the profile URL. Prefer value, but
    // some older exports leave it empty and only fill href.
    const candidate =
      (typeof value === 'string' && value) || (typeof href === 'string' && href) || '';
    const handle = normalizeHandle(candidate);
    if (handle) out.push(handle);
  }
  return out;
}

/**
 * Extracts handles from any blob of text.
 *
 * The fallback path, and the reason the HTML flavour of the export works
 * too: it scans for profile URLs and @mentions rather than assuming a
 * structure. Also what makes "paste your list" viable for anyone who does
 * not want to deal with a download at all.
 */
export function extractHandles(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const h = normalizeHandle(raw);
    if (h && !seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  };

  for (const m of text.matchAll(/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})/gi)) push(m[1]);
  for (const m of text.matchAll(/@([A-Za-z0-9._]{1,30})/g)) push(m[1]);
  // Bare handles, one per line — what you get pasting a plain list.
  for (const line of text.split(/[\r\n,;\t]+/)) {
    const t = line.trim();
    if (t && /^[A-Za-z0-9._]{1,30}$/.test(t)) push(t);
  }

  return out;
}

/**
 * Parses one file from an Instagram export into handles plus which list
 * they came from.
 *
 * Returns an empty result rather than throwing for a file that is not part
 * of the export — picking the wrong thing out of a folder of forty JSON
 * files is the expected case, not an error worth a red screen.
 */
export function parseExportFile(
  fileName: string,
  text: string,
): { handles: string[]; kind: ConnectionKind } {
  const empty = { handles: [] as string[], kind: 'following' as ConnectionKind };

  if (SKIP_FILE.test(fileName)) return empty;

  // Filename is the fallback for kind because followers_1.json carries no
  // key of its own. "following" is the default: it is the list that
  // actually describes who the user chose to know.
  const kind: ConnectionKind = /follower/i.test(fileName) ? 'followers' : 'following';

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON — the HTML export, or a pasted list. Scan it as text.
    return { handles: extractHandles(text), kind };
  }

  const handles: string[] = [];
  const seen = new Set<string>();
  const collect = (entries: unknown) => {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      for (const h of handlesFromEntry(e)) {
        if (seen.has(h)) continue;
        seen.add(h);
        handles.push(h);
      }
    }
  };

  if (Array.isArray(parsed)) {
    // followers_1.json — bare array, kind comes from the filename.
    collect(parsed);
    return { handles, kind };
  }

  if (typeof parsed === 'object' && parsed !== null) {
    let resolved = kind;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (SKIP_KEY.test(key)) continue;
      const hit = KEY_KIND.find((k) => k.pattern.test(key));
      if (hit) resolved = hit.kind;
      collect(value);
    }
    return { handles, kind: resolved };
  }

  return empty;
}

/* ==================================================================== */
/* Picking files                                                        */
/* ==================================================================== */

/**
 * Where to send someone to get the file. Deep-links into the Instagram
 * app's download page when it is installed, and to the same page on the
 * web when it is not.
 */
export const DYI_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/';

/*
 * The export arrives as a .zip. iOS unpacks one in place when you tap it
 * in Files, so the realistic flow is: download, tap the zip, open Sipply,
 * pick the JSON. Android's Files app does the same from the Downloads
 * entry. We cannot unzip in-app without pulling in a zip library, and the
 * OS already does it in one tap, so we do not.
 */
const PICK_TYPES = ['application/json', 'text/html', 'text/plain', 'application/octet-stream'];

export interface PickedExport {
  connections: ImportedConnection[];
  /** Names of the files that actually yielded handles, for the receipt. */
  files: string[];
  /** True when the picked files parsed but held nothing we recognised. */
  empty: boolean;
}

/**
 * Opens the system file picker and turns the chosen export files into
 * hashed connections.
 *
 * Multi-select on purpose: followers and following are separate files, and
 * having both is what lets the UI put mutuals first — the people you
 * actually know, rather than every brand you follow.
 */
export async function pickExportFiles(
  onProgress?: (done: number, total: number) => void,
): Promise<PickedExport | null> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: PICK_TYPES });
  if (picked.canceled || !picked.result?.length) return null;

  const files: string[] = [];
  // handle -> which lists it appeared in, merged across every picked file.
  const found = new Map<string, { follower: boolean; followed: boolean }>();

  for (const file of picked.result) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      continue; // Unreadable file shouldn't lose the ones that did read.
    }

    const { handles, kind } = parseExportFile(file.name, text);
    if (handles.length === 0) continue;
    files.push(file.name);

    for (const h of handles) {
      const entry = found.get(h) ?? { follower: false, followed: false };
      if (kind === 'followers') entry.follower = true;
      else entry.followed = true;
      found.set(h, entry);
    }
  }

  if (found.size === 0) return { connections: [], files, empty: true };

  const connections = await hashHandles(found, onProgress);
  return { connections, files, empty: false };
}

/**
 * Hashes an imported handle set, yielding to the UI thread as it goes.
 *
 * Each digest is a separate call into native crypto, so a large export is
 * thousands of round trips — without the yield the app looks frozen for
 * several seconds, and without the cap a 100k-follower account never
 * finishes. Anyone past the cap has an audience, not a friend list, and
 * matching stays useful long before it.
 */
export const MAX_HANDLES = 10_000;

async function hashHandles(
  found: Map<string, { follower: boolean; followed: boolean }>,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportedConnection[]> {
  const entries = [...found.entries()].slice(0, MAX_HANDLES);
  const out: ImportedConnection[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const [handle, flags] = entries[i];
    const hash = await hashHandle(handle);
    if (hash) out.push({ handle, hash, follower: flags.follower, followed: flags.followed });

    if (i % 200 === 199) {
      onProgress?.(i + 1, entries.length);
      // Let React paint the progress before the next batch.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(entries.length, entries.length);
  return out;
}

/** The paste-a-list path, for people who would rather not download a file. */
export async function connectionsFromText(text: string): Promise<ImportedConnection[]> {
  const handles = extractHandles(text).slice(0, MAX_HANDLES);
  const map = new Map(handles.map((h) => [h, { follower: false, followed: true }]));
  return hashHandles(map);
}

/** Mutuals first, then everyone else — the order people expect to act on. */
export function sortByCloseness(connections: ImportedConnection[]): ImportedConnection[] {
  const rank = (c: ImportedConnection) => (c.follower && c.followed ? 0 : c.followed ? 1 : 2);
  return [...connections].sort((a, b) => rank(a) - rank(b) || a.handle.localeCompare(b.handle));
}


/* ==================================================================== */
/* Remembering the user's own handle                                    */
/*                                                                      */
/* The server stores only a hash, and the column privilege is revoked,   */
/* so the app cannot read back which handle it claimed. That is the      */
/* point — but it means the device has to remember the plaintext itself  */
/* or the Accounts screen would ask "add your Instagram" to someone who  */
/* already did.                                                         */
/* ==================================================================== */

const HANDLE_KEY = 'clink-ig-handle';

export async function rememberHandle(handle: string): Promise<void> {
  await AsyncStorage.setItem(HANDLE_KEY, handle);
}

export async function getRememberedHandle(): Promise<string | null> {
  return AsyncStorage.getItem(HANDLE_KEY);
}

export async function forgetRememberedHandle(): Promise<void> {
  await AsyncStorage.removeItem(HANDLE_KEY);
}

/* ==================================================================== */
/* The handle given at signup                                           */
/*                                                                      */
/* Same problem the invite links have (src/lib/invite.ts): when the      */
/* project requires email confirmation, supabase.auth.signUp returns no  */
/* session, so there is no authenticated user to write the hash as. And  */
/* even when a session does come back, profiles.instagram_hash cannot be */
/* written until the on_auth_user_created trigger has inserted the row,  */
/* which lands slightly after the session does — an update before then   */
/* matches zero rows and loses the handle silently.                      */
/*                                                                      */
/* So it is parked here and drained once the profile row is confirmed    */
/* (see refreshProfile in src/store/auth.ts).                            */
/*                                                                      */
/* NOT passed through auth user_metadata, which would be the shorter     */
/* route: metadata is a second copy living outside the column-level      */
/* lockdown, and "stop being findable" clears profiles.instagram_hash    */
/* without touching it. An opt-out that leaves a copy behind is not one. */
/* ==================================================================== */

const PENDING_KEY = 'clink-pending-ig-handle';

/**
 * The email is stored alongside the handle and checked before the hash is
 * written. Without it, a signup that is started but never confirmed leaves
 * a handle parked on the device that would attach itself to whatever
 * account signs in next — including someone else's.
 */
interface PendingHandle {
  handle: string;
  email: string;
}

export async function setPendingHandle(handle: string, email: string): Promise<void> {
  const normalized = normalizeHandle(handle);
  if (!normalized) return;
  await AsyncStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ handle: normalized, email: email.trim().toLowerCase() } satisfies PendingHandle),
  );
}

export async function getPendingHandle(): Promise<PendingHandle | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingHandle;
    return typeof parsed?.handle === 'string' && typeof parsed?.email === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingHandle(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}
