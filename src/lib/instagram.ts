import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';

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
/* account its followers and following as a .zip of JSON or HTML,        */
/* usually within half an hour. We unzip and parse it on the device,     */
/* hash the handles, and match them the same way contacts are matched.   */
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
 *
 * Hashtags are skipped because they are not people at all. Choosing the
 * files by hand, nobody picked following_hashtags.json; reading the whole
 * folder out of the zip, every followed tag would arrive as a "handle",
 * and a tag like "cocktails" is also somebody's username.
 */
const SKIP_FILE = /blocked|restricted|unfollowed|dismissed|hide|removed|permanent|request|hashtag/i;

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
 * Followed hashtags are skipped for SKIP_FILE's reason.
 */
const SKIP_KEY = /blocked|restricted|unfollowed|dismissed|hide_story|pending|request|hashtag/i;

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

/*
 * A profile link anywhere in a blob of text. Three things it has to get
 * right, each of which it once got wrong:
 *
 * The optional `_u/` is the open-in-app form following lists use (see
 * normalizeHandle). Without it this captured "_u" itself, which is
 * reserved, so an HTML following list yielded nobody.
 *
 * The character before the domain may not be a dot or a word character,
 * so help.instagram.com/<article id> and the like are not read as a
 * person called "12345".
 *
 * `www.` is optional, for pasted links typed by hand.
 */
const PROFILE_LINK = /(?:^|[^.\w])(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})/gi;

function collector(): { out: string[]; push: (raw: string) => void } {
  const out: string[] = [];
  const seen = new Set<string>();
  return {
    out,
    push: (raw) => {
      const h = normalizeHandle(raw);
      if (h && !seen.has(h)) {
        seen.add(h);
        out.push(h);
      }
    },
  };
}

/**
 * Extracts handles from any blob of text a person pasted.
 *
 * Scans for profile links and @mentions rather than assuming a structure,
 * and takes bare words one per line — what you get pasting a plain list.
 * It is what makes "paste your list" viable for anyone who does not want
 * to deal with a download at all.
 */
export function extractHandles(text: string): string[] {
  const { out, push } = collector();
  for (const m of text.matchAll(PROFILE_LINK)) push(m[1]);
  for (const m of text.matchAll(/@([A-Za-z0-9._]{1,30})/g)) push(m[1]);
  for (const line of text.split(/[\r\n,;\t]+/)) {
    const t = line.trim();
    if (t && /^[A-Za-z0-9._]{1,30}$/.test(t)) push(t);
  }
  return out;
}

/**
 * Handles from the HTML flavour of the export: profile links only.
 *
 * Not extractHandles. Every person in Instagram's HTML files is a link to
 * their profile, so the links are the whole list — and extractHandles'
 * bare-word pass, which a pasted list needs, would also read the page's
 * own words and stylesheet ("Followers", "auto") as handles, each one
 * somebody's account.
 */
function handlesFromHtml(text: string): string[] {
  const { out, push } = collector();
  for (const m of text.matchAll(PROFILE_LINK)) push(m[1]);
  return out;
}

const looksLikeHtml = (text: string) => /<(?:!doctype|html|head|body|div|table|a)\b/i.test(text.slice(0, 4096));

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
    // Not JSON: the HTML flavour of the export, or some other text file.
    return { handles: looksLikeHtml(text) ? handlesFromHtml(text) : extractHandles(text), kind };
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
/* Your own username                                                     */
/* ==================================================================== */

/*
 * The label Instagram gives the username row in personal_information,
 * in the languages this app's users are likeliest to export in. The
 * export's labels follow the account's language setting, which is not
 * the phone's; a label missed here only costs the one-tap offer, and the
 * card falls back to typing the name.
 */
const USERNAME_LABEL =
  /^(?:user ?name|nombre de usuario|nome (?:de|do) usu[aá]rio|nome utente|nom d.utilisateur|benutzername)$/i;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The `value` of a username row in a `string_map_data` object, if it has one. */
function usernameFromStringMap(map: unknown): string | null {
  if (!isRecord(map)) return null;
  for (const [label, row] of Object.entries(map)) {
    if (!USERNAME_LABEL.test(label.trim()) || !isRecord(row)) continue;
    const handle = typeof row.value === 'string' ? normalizeHandle(row.value) : null;
    if (handle) return handle;
  }
  return null;
}

/**
 * Walks any shape looking for a string_map_data with a username row. Meta
 * renames and re-nests these files without notice, so the documented path
 * is tried first and this is what survives the next reshuffle. Depth-
 * capped: the file is a handful of levels deep, and a pathological one
 * should cost nothing.
 */
function findUsername(node: unknown, depth: number): string | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findUsername(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  const direct = usernameFromStringMap(node.string_map_data);
  if (direct) return direct;
  for (const value of Object.values(node)) {
    const hit = findUsername(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * The account's own username, from personal_information.json (or .html).
 *
 * The documented place is profile_user[0].string_map_data.Username.value.
 * Only the username is taken; the rest of the file (email, phone, date of
 * birth) is read into memory with it and dropped with it, never kept and
 * never sent.
 */
export function ownHandleFromPersonalInfo(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The HTML flavour: a table row, the label in one cell and the value
    // in the next, with any amount of markup between the two.
    const row = text.match(
      />\s*(?:user ?name|nombre de usuario|nome (?:de|do) usu[aá]rio|nome utente|nom d.utilisateur|benutzername)\s*<(?:[^>]*>\s*<)*?[^>]*>\s*@?([A-Za-z0-9._]{1,30})\s*</i,
    );
    return row ? normalizeHandle(row[1]) : null;
  }
  if (isRecord(parsed) && Array.isArray(parsed.profile_user)) {
    const first: unknown = parsed.profile_user[0];
    const documented = isRecord(first) ? usernameFromStringMap(first.string_map_data) : null;
    if (documented) return documented;
  }
  return findUsername(parsed, 0);
}

/**
 * The username in the download's own file name, when it carries one.
 *
 * Instagram names the archive instagram-<username>-<date>-<id>.zip (older
 * exports: <username>_<yyyymmdd>.zip), and a download of "Followers and
 * following" only, which is what the card asks for, has no
 * personal_information file to read it from. A handle cannot contain a
 * hyphen, so the first hyphen after the prefix ends it. Only a guess, and
 * treated as one: the card shows it and asks before anything is saved,
 * and the file's own personal information wins when both exist.
 */
export function ownHandleFromArchiveName(name: string): string | null {
  const m =
    name.match(/^instagram[-_]([A-Za-z0-9._]{1,30})-\d{4}-?\d{2}-?\d{2}/i) ??
    name.match(/^([A-Za-z0-9._]{1,30})_\d{8}(?:_part_\d+)?\.zip$/i);
  return m ? normalizeHandle(m[1]) : null;
}

/* ==================================================================== */
/* Picking the download                                                  */
/* ==================================================================== */

/**
 * Where to send someone to ask for the file: the Accounts Center's
 * "Download your information" page.
 *
 * Opened with Linking.openURL, which hands it to Safari, or to the
 * Instagram app if the app claims the address. Either is somewhere the
 * user is usually already signed in. It used to open in the in-app
 * browser, whose comment here said it deep-linked into the Instagram app;
 * it never did. SFSafariViewController keeps its own cookies, apart from
 * Safari's, so every visit began at a fresh Instagram login.
 */
export const DYI_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/';

/*
 * The download itself is what gets picked: the .zip, as Instagram sends
 * it. It used to be the JSON inside, which meant tapping the zip in Files
 * to unpack it, finding connections/followers_and_following among dozens
 * of folders, and choosing two files by name. fflate unzips it here
 * instead. Loose .json and .html still work, for anyone who has already
 * unpacked it; octet-stream is how some providers label all three.
 */
const PICK_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
  'text/html',
  'text/plain',
  'application/octet-stream',
];

/*
 * A "Followers and following" download is a few MB even for a large
 * account. Past this it is almost certainly the full export, every photo
 * and video included, which is a lot to hold in memory to read two text
 * files out of — so it is refused, and the card says to request the
 * smaller one.
 */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

/*
 * Per inflated entry, and for everything inflated from one zip. A real
 * followers file is well under the first; an entry past it is not one,
 * and these keep a hostile or broken archive from inflating without end.
 */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_INFLATED_BYTES = 60 * 1024 * 1024;

/*
 * The only entries inflated. Matched anywhere in the path, not from its
 * root: exports have moved these folders before (followers_and_following
 * used to sit at the top level, personal_information.json is now one
 * folder deeper), and some unzip-and-rezip tools add a folder above it all.
 */
const CONNECTIONS_ENTRY = /(?:^|\/)followers_and_following\/[^/]+\.(?:json|html?)$/i;
const PERSONAL_ENTRY = /(?:^|\/)personal_information\.(?:json|html?)$/i;

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/* A zip starts "PK". Sniffed rather than trusted to a name or a type. */
const isZip = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;

/* Decoded as UTF-8, with a byte-order mark taken off so JSON.parse accepts it. */
const toText = (bytes: Uint8Array) => strFromU8(bytes).replace(/^\uFEFF/, '');

/**
 * The entries worth reading from one archive, as [path, text] pairs.
 *
 * The filter runs before anything is inflated, so the photos, messages
 * and everything else in a larger export are never decompressed. The skip
 * list applies here too: a blocked list is not even inflated.
 */
function readArchive(bytes: Uint8Array): [string, string][] {
  let inflated = 0;
  const filter = (entry: UnzipFileInfo) => {
    if (entry.name.includes('__MACOSX/')) return false;
    if (!CONNECTIONS_ENTRY.test(entry.name) && !PERSONAL_ENTRY.test(entry.name)) return false;
    if (SKIP_FILE.test(baseName(entry.name))) return false;
    if (entry.originalSize > MAX_ENTRY_BYTES) return false;
    if (inflated + entry.originalSize > MAX_INFLATED_BYTES) return false;
    inflated += entry.originalSize;
    return true;
  };
  return Object.entries(unzipSync(bytes, { filter })).map(([path, data]) => [path, toText(data)]);
}

export interface PickedExport {
  connections: ImportedConnection[];
  /** Names of the files that actually yielded handles, for the receipt. */
  files: string[];
  /** True when the picked files parsed but held nothing we recognised. */
  empty: boolean;
  /** True when a picked file was refused for size (MAX_EXPORT_BYTES). */
  tooLarge: boolean;
  /**
   * The account's own username, when the download says whose it is: its
   * personal_information file, or failing that the archive's name.
   */
  ownHandle: string | null;
}

/**
 * Opens the system file picker and turns the chosen download into hashed
 * connections.
 *
 * Takes the .zip Instagram sends, or loose files from inside it. Multi-
 * select stays for the loose files: followers and following are separate,
 * and having both is what lets the UI put mutuals first — the people you
 * actually know, rather than every brand you follow. The zip holds both.
 *
 * Everything happens on the device. Only the hashes built from the result
 * ever leave it, and only when the caller matches them.
 */
export async function pickExportFiles(
  onProgress?: (done: number, total: number) => void,
): Promise<PickedExport | null> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: PICK_TYPES });
  if (picked.canceled || !picked.result?.length) return null;

  const files: string[] = [];
  // handle -> which lists it appeared in, merged across every picked file.
  const found = new Map<string, { follower: boolean; followed: boolean }>();
  let tooLarge = false;
  // Whose download it is, by the two sources ownHandle ranks.
  const owner: { info: string | null; name: string | null } = { info: null, name: null };

  /* One file's text: the owner's details, or a list of people. */
  const take = (path: string, text: string) => {
    const name = baseName(path);
    if (PERSONAL_ENTRY.test(name)) {
      owner.info = owner.info ?? ownHandleFromPersonalInfo(text);
      return;
    }
    const { handles, kind } = parseExportFile(name, text);
    if (handles.length === 0) return;
    files.push(name);
    for (const h of handles) {
      const entry = found.get(h) ?? { follower: false, followed: false };
      if (kind === 'followers') entry.follower = true;
      else entry.followed = true;
      found.set(h, entry);
    }
  };

  for (const file of picked.result) {
    if (file.size > MAX_EXPORT_BYTES) {
      tooLarge = true;
      continue;
    }
    // An unreadable or corrupt file shouldn't lose the ones that did read.
    try {
      const bytes = await file.bytes();
      if (isZip(bytes)) {
        for (const [path, text] of readArchive(bytes)) take(path, text);
        owner.name = owner.name ?? ownHandleFromArchiveName(file.name);
      } else {
        take(file.name, toText(bytes));
      }
    } catch {
      continue;
    }
  }

  const ownHandle = owner.info ?? owner.name;
  if (found.size === 0) return { connections: [], files, empty: true, tooLarge, ownHandle };

  const connections = await hashHandles(found, onProgress);
  return { connections, files, empty: false, tooLarge, ownHandle };
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

/**
 * Mutuals first, then accounts you follow, then accounts that follow you.
 *
 * A comparator rather than a sort, because two orders need it and sort
 * different things: the results list people act on, and the order hashes
 * are sent in — the daily match quota can run out part way through a
 * large list, and it should run out on strangers rather than on friends.
 */
export function compareCloseness(a: ImportedConnection, b: ImportedConnection): number {
  const rank = (c: ImportedConnection) => (c.follower && c.followed ? 0 : c.followed ? 1 : 2);
  return rank(a) - rank(b) || a.handle.localeCompare(b.handle);
}
