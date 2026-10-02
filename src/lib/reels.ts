import * as Crypto from 'expo-crypto';
import { File, UploadType, type UploadResult } from 'expo-file-system';

import type { ReelQuotaRow } from '@/lib/database.types';
import { containsObjectionable, isObjectionableError } from '@/lib/moderation';
import { forgetSignedPhoto, primeSignedUrls } from '@/lib/social';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';

export type { ReelQuotaRow };

/*
 * Reels: short videos filmed in the app, stored in the private `reels`
 * bucket and the public.reels table (migration 019).
 *
 * This file is imported at app start (the tab bar reads REELS_ENABLED, the
 * profile reads COPY), so it must never import expo-camera, expo-video or
 * any other media module. The viewer imports expo-video itself, and the
 * recorder's helpers live in lib/reelMedia, which only the /record screen
 * and its recorder components import.
 */

/*
 * 'on' shows the Reels tab, the Reels tab on profiles and the recorder;
 * anything else hides all three. Static dot access so Expo inlines it at
 * build time, like the sign-in flags. It ships 'off': the native build with
 * expo-camera can go out before the migration and the on-device check, and
 * turning it on later is a JS-only update. When is Jan's call (1 Oct 2026:
 * not until the app has a few members), made together with the Supabase
 * Pro upgrade.
 */
export const REELS_ENABLED = process.env.EXPO_PUBLIC_REELS === 'on';

/** The recorder's hard stop, in seconds (recordAsync maxDuration). */
export const REEL_MAX_SECONDS = 30;
/** Shorter than this is a mis-tap, not a reel: the file is discarded. Matches reels_duration's floor. */
export const REEL_MIN_MS = 1000;
/** recordAsync maxFileSize. A backstop: 30 s at the bitrate below is about 4.6 MB. */
export const REEL_MAX_BYTES = 5_000_000;
/**
 * The bucket's per-file ceiling (6 MiB, migration 019). A file over it is
 * refused before any upload starts, instead of after 6 MB of somebody's
 * data plan.
 */
export const REEL_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
/** CameraView videoBitrate, b/s. iOS ignores it unless recordAsync is given a codec. */
export const REEL_VIDEO_BITRATE = 1_100_000;
/** = the reels_caption_len CHECK. */
export const REEL_CAPTION_MAX = 300;
/** Reels per page of the feed. */
export const REEL_PAGE = 8;
/** A feed older than this reloads when the tab regains focus at the first reel. */
export const REEL_STALE_MS = 10 * 60 * 1000;

/*
 * The server's limits as of migration 019, while the project is on
 * Supabase's free tier: 3 reels per rolling 24 hours, 20 live reels per
 * account. The server is what enforces them (private.reel_day_limit and
 * reel_live_limit) and the recorder's copy reads the live numbers back from
 * my_reel_quota; these two are only what the copy falls back to when that
 * call has not answered. Change them together with section 1 of the
 * migration.
 */
export const REEL_DAY_LIMIT = 3;
export const REEL_LIVE_LIMIT = 20;

/*
 * The most reels one profile fetch asks for. Above the live limit on
 * purpose, so raising that limit on the server (the Pro upgrade) never
 * silently truncates a profile; at 100 the request is still one small page.
 */
const AUTHOR_REELS_MAX = 100;

/** Whole seconds for a duration, never 0 (the shortest reel is one second). */
export function reelSeconds(durationMs: number): number {
  return Math.max(1, Math.round(durationMs / 1000));
}

/** `0:14`, for the profile tile and anywhere a reel's length is drawn. */
export function formatReelDuration(durationMs: number): string {
  const s = reelSeconds(durationMs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const secondsPhrase = (s: number) => `${s} ${s === 1 ? 'second' : 'seconds'}`;
const reelsPhrase = (n: number) => `${n} ${n === 1 ? 'reel' : 'reels'}`;

/** A caption read aloud as its own sentence, without doubling its end mark. */
function asSentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/*
 * Every visible string that names the feature, in one place, so the name
 * is a one-file change. The section is "Reels" (Jan's call, 1 Oct 2026,
 * made knowing it is also Instagram's name for the format); one video is
 * "a reel". Strings that never name the feature stay with the screen that
 * shows them.
 */
export const COPY = {
  /** The section: the tab, the feed's title and the profile tab. */
  label: 'Reels',
  /** The feed header's camera button (accessibility label) and every "film one" action. */
  record: 'Record a reel',

  // The feed.
  loadingSlow: 'Still loading reels.',
  emptyTitle: 'No reels yet',
  emptyBody: 'Film the first one. Up to 30 seconds, with sound.',
  endTitle: "You're all caught up",
  endBody: 'New reels show up here first.',
  errorTitle: "Reels didn't load",
  errorBody: 'Check your connection and try again.',
  cellError: "This reel didn't load",
  unavailable: "This reel isn't available.",

  // The recorder's gate. n is the server's limit, read from my_reel_quota.
  quotaDayTitle: (n: number) => `You've posted ${reelsPhrase(n)} today`,
  quotaDayBody: 'You can post again tomorrow.',
  quotaLiveTitle: (n: number) => `You have ${reelsPhrase(n)}`,
  quotaLiveBody: 'Delete one from your profile to post another.',
  primerTitle: 'Film a reel',
  primerBody:
    'Sipply needs the camera to film your reel and the microphone for its sound. Nothing is recorded until you press the button.',

  // Review and posting.
  reviewLabel: (durationMs: number) => `Your reel, ${secondsPhrase(reelSeconds(durationMs))}`,
  discardTitle: 'Discard this reel?',
  posterFailed: "Couldn't prepare this reel. Retake it.",
  tooLarge: 'This reel is too large to post. Record a shorter one.',
  postFailed: "Couldn't post your reel. Check your connection and try again.",

  // The viewer and its menu.
  cellLabel: (p: { username: string; durationMs: number; caption?: string | null; drink?: string | null }) =>
    [
      `Reel by @${p.username}, ${secondsPhrase(reelSeconds(p.durationMs))}.`,
      p.caption?.trim() ? asSentence(p.caption) : '',
      p.drink ? `Tagged ${p.drink}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  cellHint: 'Swipe up with three fingers for the next reel.',
  report: 'Report reel',
  reportedTitle: 'Thanks',
  reportedBody:
    "This reel has been reported and you won't see it again. You can also block this person from the reel menu.",
  delete: 'Delete reel',
  deleteTitle: 'Delete this reel?',
  deleteBody: "It's removed for everyone and can't be undone.",

  // The Reels tab on a profile.
  profileEmptyOwnBody: 'Film one and it shows up here.',
  profileEmptyPeerBody: 'Nothing filmed yet.',
  profileErrorTitle: 'Could not load reels',
  /** `ago` is already spoken form ("2 days ago"); `drink` is the tagged drink's name. */
  tileLabel: (p: { durationMs: number; ago: string; drink?: string | null }) =>
    `Reel, ${secondsPhrase(reelSeconds(p.durationMs))}, posted ${p.ago}${p.drink ? `, tagged ${p.drink}` : ''}`,
} as const;

/* ==================================================================== */
/* Types and mapping                                                    */
/* ==================================================================== */

export type Reel = {
  id: string;
  authorId: string;
  /** `<authorId>/<id>.mov` in the private `reels` bucket. */
  videoPath: string;
  /** `<authorId>/<id>.jpg` in the private `reels` bucket. */
  posterPath: string;
  caption: string;
  /** A bundled Dex id, or null. May name a drink this build no longer has; render no chip then. */
  drinkId: string | null;
  durationMs: number;
  /** Filmed sideways: letterbox it (contentFit contain) instead of cropping. */
  landscape: boolean;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  mine: boolean;
};

/** Where the next feed page starts: the last reel of the page before. Null = no more pages. */
export type ReelCursor = { createdAt: string; id: string } | null;

const REEL_SELECT =
  'id, author_id, video_path, poster_path, caption, drink_id, duration_ms, landscape, created_at, reel_likes(count)';

interface ReelQueryRow {
  id: string;
  author_id: string;
  video_path: string;
  poster_path: string;
  caption: string;
  drink_id: string | null;
  duration_ms: number;
  landscape: boolean;
  created_at: string;
  reel_likes: unknown;
}

/**
 * PostgREST returns an embedded aggregate as either `[{count: n}]` or a
 * bare number depending on version; both mean the same count. The same
 * normaliser lib/social uses for a post's likes.
 */
function countOf(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw) && raw.length > 0) return (raw[0] as { count?: number })?.count ?? 0;
  return 0;
}

function toReel(row: ReelQueryRow, myId: string, myLikes: Set<string>): Reel {
  return {
    id: row.id,
    authorId: row.author_id,
    videoPath: row.video_path,
    posterPath: row.poster_path,
    caption: row.caption ?? '',
    drinkId: row.drink_id,
    durationMs: row.duration_ms,
    landscape: row.landscape,
    createdAt: row.created_at,
    likes: countOf(row.reel_likes),
    likedByMe: myLikes.has(row.id),
    mine: row.author_id === myId,
  };
}

/**
 * Which of THESE reels you have liked. Scoped to the rows being shown for
 * the same reason lib/social's fetchMyLikes is: an unscoped read grows
 * without limit and past the API's row cap comes back as an arbitrary
 * subset, which draws liked reels unliked. Throws, like that one: a heart
 * drawn empty on a reel you liked invites a second like that changes
 * nothing while the count moves.
 */
async function fetchMyReelLikes(myId: string, reelIds: string[]): Promise<Set<string>> {
  if (reelIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('reel_likes')
    .select('reel_id')
    .eq('user_id', myId)
    .in('reel_id', reelIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.reel_id));
}

async function toReels(rows: ReelQueryRow[], myId: string): Promise<Reel[]> {
  const myLikes = await fetchMyReelLikes(myId, rows.map((r) => r.id));
  return rows.map((r) => toReel(r, myId, myLikes));
}

/**
 * A uuid in either case. Callers lowercase it before querying: Postgres
 * prints uuid::text lowercase, and the paths and policies compare against
 * that.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ==================================================================== */
/* Reads                                                                */
/* ==================================================================== */

/**
 * The global feed, newest first. `next` is null when this was the last
 * page.
 *
 * Keyset-paged on (created_at, id) rather than by offset: a reel posted
 * while someone scrolls would shift every offset by one and show them the
 * same reel twice. The cursor's timestamp is double-quoted because its ':'
 * and '+' are PostgREST grammar otherwise.
 *
 * Each page's posters AND videos are signed in one request before the page
 * is handed over, so the first reel paints its poster and starts its player
 * on the first frame instead of a round trip later. Signing a video that is
 * never watched costs nothing but a line in that request; the URL still
 * lives one hour, in memory, like every other signed URL.
 */
export async function fetchReels(myId: string, cursor: ReelCursor): Promise<{ reels: Reel[]; next: ReelCursor }> {
  let query = supabase
    .from('reels')
    .select(REEL_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(REEL_PAGE);
  if (cursor) {
    query = query.or(
      `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as ReelQueryRow[];

  const [reels] = await Promise.all([
    toReels(rows, myId),
    primeSignedUrls('reels', rows.flatMap((r) => [r.poster_path, r.video_path])),
  ]);

  const last = rows[rows.length - 1];
  const next: ReelCursor = rows.length === REEL_PAGE && last ? { createdAt: last.created_at, id: last.id } : null;
  return { reels, next };
}

/**
 * All of one author's reels, newest first. The live limit keeps this to
 * one page. Posters are not signed here: the profile grid signs them as
 * one batch itself, and the author pager signs what it shows.
 *
 * A malformed author id (a hand-typed /reel link) has no reels rather than
 * an error, for the same reason as fetchReel: "Try again" could never help.
 */
export async function fetchReelsByAuthor(authorId: string, myId: string): Promise<Reel[]> {
  if (!UUID.test(authorId)) return [];
  const { data, error } = await supabase
    .from('reels')
    .select(REEL_SELECT)
    .eq('author_id', authorId.toLowerCase())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(AUTHOR_REELS_MAX);
  if (error) throw error;
  return toReels((data ?? []) as unknown as ReelQueryRow[], myId);
}

/**
 * One reel, or null when it does not exist or is hidden from you (deleted,
 * blocked either way, or reported by you: the read policy leaves all of
 * those out). A malformed id is null too, not an error: Postgres would
 * refuse it as invalid input, and "Try again" would never help.
 */
export async function fetchReel(id: string, myId: string): Promise<Reel | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase
    .from('reels')
    .select(REEL_SELECT)
    .eq('id', id.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [reel] = await toReels([data as unknown as ReelQueryRow], myId);
  return reel ?? null;
}

/**
 * Your counts and the server's limits, so the recorder can say "come back
 * tomorrow" before anyone films anything. Null on any failure (offline, or
 * migration 019 not applied): the recorder then lets you film, and the
 * server still refuses past the limit.
 */
export async function fetchMyReelQuota(): Promise<ReelQuotaRow | null> {
  try {
    const { data, error } = await supabase.rpc('my_reel_quota');
    if (error) return null;
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

/* ==================================================================== */
/* Orphan files                                                         */
/* ==================================================================== */

/** A file younger than this may belong to an upload still under way, so the sweep keeps it. */
const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000;

/**
 * Removes files in reels/<myId>/ that no reel of yours points at and that
 * are older than ten minutes. Resolves to how many went; never rejects.
 *
 * Why this exists: the bucket's insert policy refuses an upload once your
 * folder holds 2 x live + 4 files, or once 2 x the day limit + 4 of them
 * were added in the last 24 hours (migration 019,
 * private.reel_upload_allowed). Files left behind by posts that failed
 * after uploading (a crash, a cut connection before the cleanup ran) count
 * against both, so they would eventually stop you posting at all. Storage
 * has no foreign key to the table and SQL may not delete objects, so the
 * client is the only thing that can tidy them.
 *
 * Nothing is removed unless your rows were read successfully. Deleting on
 * a failed read would treat every live reel's files as orphans.
 */
export async function sweepOrphanReelFiles(myId: string): Promise<number> {
  try {
    const [listed, owned] = await Promise.all([
      supabase.storage.from('reels').list(myId, { limit: 1000, offset: 0 }),
      supabase.from('reels').select('video_path, poster_path').eq('author_id', myId),
    ]);
    if (listed.error || owned.error || !listed.data || !owned.data) return 0;

    const kept = new Set(owned.data.flatMap((r) => [r.video_path, r.poster_path]));
    const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
    const doomed = listed.data
      .filter((f) => {
        // Folder placeholders come back with a null id; they are not files.
        if (!f.id) return false;
        const path = `${myId}/${f.name}`;
        if (kept.has(path)) return false;
        const at = Date.parse(f.created_at ?? '');
        return Number.isFinite(at) && at < cutoff;
      })
      .map((f) => `${myId}/${f.name}`);
    if (doomed.length === 0) return 0;

    const { data, error } = await supabase.storage.from('reels').remove(doomed);
    if (error) return 0;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

/* ==================================================================== */
/* Posting                                                              */
/* ==================================================================== */

export type PostReelInput = {
  myId: string;
  /** The recording, in the camera's cache folder. */
  videoUri: string;
  /** The JPEG lib/reelMedia's makePoster wrote. */
  posterUri: string;
  caption: string;
  /** A bundled Dex id, or null. */
  drinkId: string | null;
  durationMs: number;
  landscape: boolean;
  /** Abort to cancel; the outcome is then 'cancelled' and nothing is left on the server. */
  signal?: AbortSignal;
  /** 0..1 of the video's bytes; the poster is too small to show. */
  onProgress?: (fraction: number) => void;
};

/**
 * What became of a post. Every outcome leaves the local files where they
 * were, so a retry needs no new recording. Every outcome other than 'ok'
 * leaves no reel on the server, with one exception: a 'failed' whose
 * insert lost its answer and whose follow-up read failed too may have
 * posted after all (see postReel). Uploaded files are removed on a best
 * effort basis; sweepOrphanReelFiles catches the rest.
 *
 *   'objectionable' — the caption was refused; show OBJECTIONABLE_MESSAGE.
 *   'quota_day'     — the rolling 24-hour limit is reached.
 *   'quota_total'   — the live limit is reached; delete one to post another.
 *   'too_large'     — the file is over the bucket's ceiling.
 *   'cancelled'     — the signal was aborted.
 *   'failed'        — anything else; worth trying again.
 */
export type PostReelOutcome =
  | { status: 'ok'; reel: Reel }
  | { status: 'objectionable' }
  | { status: 'quota_day' }
  | { status: 'quota_total' }
  | { status: 'too_large' }
  | { status: 'cancelled' }
  | { status: 'failed' };

type FailedOutcome = Exclude<PostReelOutcome, { status: 'ok' }>;

/** A token this close to expiry is refreshed before a multi-megabyte upload starts. */
const TOKEN_MARGIN_MS = 120 * 1000;

/**
 * The access token for the upload's Authorization header. The upload goes
 * around supabase-js, so its automatic refresh does not cover it: a token
 * that expires during a slow cellular upload would fail the whole file.
 * Null when nobody, or somebody other than `myId`, is signed in: an upload
 * must never go into one account's folder under another's session.
 */
async function accessToken(myId: string, forceRefresh: boolean): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const current = data.session;
  if (!current || current.user.id !== myId) return null;
  const expiresAt = (current.expires_at ?? 0) * 1000;
  if (!forceRefresh && expiresAt - Date.now() > TOKEN_MARGIN_MS) return current.access_token;

  const refreshed = await supabase.auth.refreshSession().catch(() => null);
  const session = refreshed?.data.session;
  if (session && session.user.id === myId) return session.access_token;
  // A failed refresh still leaves a token that may have seconds to run.
  return !forceRefresh && expiresAt > Date.now() ? current.access_token : null;
}

type PutResult = 'ok' | 'too_large' | 'auth' | 'refused' | 'failed' | 'cancelled';

const isAbort = (e: unknown, signal?: AbortSignal) =>
  signal?.aborted === true || (e instanceof Error && e.name === 'AbortError');

/**
 * Reads Storage's error body. Storage has answered both with the real HTTP
 * status and with a 400 whose body carries the real code as a string
 * (`{"statusCode":"413",...}`), depending on its version, so the body's
 * code wins when it has one.
 */
function classify(result: UploadResult): PutResult {
  if (result.status >= 200 && result.status < 300) return 'ok';
  let body: { statusCode?: string | number; error?: string; message?: string } = {};
  try {
    body = JSON.parse(result.body) ?? {};
  } catch {
    // Not JSON: a gateway page. The HTTP status is all there is.
  }
  const code = Number(body.statusCode) || result.status;
  const text = `${body.error ?? ''} ${body.message ?? ''}`;
  if (code === 413 || result.status === 413) return 'too_large';
  /*
   * An expired or unreadable token comes back as 401, or as 400/403 naming
   * it ("InvalidJWT", "Invalid Compact JWS", '"exp" claim timestamp check
   * failed'). Checked before the 403 below, which those share with a
   * policy refusal. A false match costs one refresh and one resend.
   */
  if (code === 401 || result.status === 401 || /jw[st]|exp.{0,3}claim/i.test(text)) return 'auth';
  // The insert policy said no: the folder's file count, or a quota.
  if (code === 403 || result.status === 403) return 'refused';
  return 'failed';
}

/**
 * One file, straight from disk to the Storage REST endpoint.
 *
 * expo-file-system's native upload rather than supabase-js: it streams the
 * file through URLSession, so a 5 MB video never sits in the JS heap,
 * progress events arrive, and a quick switch to another app does not kill
 * it. The user's own token rides along, so the bucket's insert policy
 * (your folder, a uuid name, the file-count rule) applies exactly as it
 * would through the client. x-upsert is false: nothing is ever overwritten,
 * and a fresh uuid per attempt means it never needs to be.
 */
async function putFile(
  uri: string,
  path: string,
  mimeType: string,
  token: string,
  signal: AbortSignal | undefined,
  onProgress: ((fraction: number) => void) | undefined,
): Promise<PutResult> {
  if (signal?.aborted) return 'cancelled';
  try {
    const result = await new File(uri).upload(`${SUPABASE_URL}/storage/v1/object/reels/${path}`, {
      httpMethod: 'POST',
      uploadType: UploadType.BINARY_CONTENT,
      mimeType,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        'Content-Type': mimeType,
        'x-upsert': 'false',
        // The object never changes: a new reel is a new name.
        'cache-control': 'max-age=31536000',
      },
      sessionType: 'background',
      signal,
      onProgress: onProgress
        ? ({ bytesSent, totalBytes }) => onProgress(totalBytes > 0 ? Math.min(1, bytesSent / totalBytes) : 0)
        : undefined,
    });
    return classify(result);
  } catch (e) {
    return isAbort(e, signal) ? 'cancelled' : 'failed';
  }
}

/** Best effort: a file the cleanup misses is caught by sweepOrphanReelFiles. */
async function removeReelFiles(paths: string[]): Promise<void> {
  try {
    await supabase.storage.from('reels').remove(paths);
  } catch {
    // An orphan in the bucket; the outcome the user sees matters more.
  }
}

/**
 * Uploads the poster and the video, then writes the row.
 *
 * The id is made here, before anything is uploaded, so both files can be
 * named after the row they belong to; the table's CHECKs then refuse a row
 * whose paths are not `<myId>/<id>.mov` and `<myId>/<id>.jpg`. A retry is a
 * new call and therefore a new id, so no attempt can collide with the
 * leftovers of another.
 *
 * Poster first: it is small, so a refusal (quota, file count, expired
 * session) shows up before megabytes of video have gone. Row last: it is
 * what makes the reel visible, and it must never point at a file that is
 * not there.
 *
 * Never rejects. Every request below reports its error rather than
 * throwing, but a file the native module cannot open does throw, and a
 * review screen left on "Posting" with no outcome is worse than a retry.
 * Anything uploaded before such a throw is left for sweepOrphanReelFiles.
 */
export async function postReel(input: PostReelInput): Promise<PostReelOutcome> {
  try {
    return await attemptPost(input);
  } catch {
    return { status: input.signal?.aborted ? 'cancelled' : 'failed' };
  }
}

async function attemptPost(input: PostReelInput): Promise<PostReelOutcome> {
  const { myId, videoUri, posterUri, durationMs, landscape, signal, onProgress } = input;
  const caption = input.caption.trim();

  // Refused here without a round trip; the server's trigger holds the same line.
  if (containsObjectionable(caption)) return { status: 'objectionable' };
  if (signal?.aborted) return { status: 'cancelled' };

  const video = new File(videoUri);
  const poster = new File(posterUri);
  if (!video.exists || !poster.exists) return { status: 'failed' };
  if (video.size > REEL_UPLOAD_MAX_BYTES) return { status: 'too_large' };

  const id = Crypto.randomUUID().toLowerCase();
  const isMp4 = video.extension.toLowerCase() === '.mp4';
  const videoPath = `${myId}/${id}.${isMp4 ? 'mp4' : 'mov'}`;
  const posterPath = `${myId}/${id}.jpg`;

  const firstToken = await accessToken(myId, false);
  if (!firstToken) return { status: 'failed' };
  let token: string = firstToken;
  let swept = false;

  /*
   * One file, with the two retries worth making: a token that expired on
   * the way (refresh once, send again), and a refusal from the file-count
   * rule caused by leftovers (sweep them, send again). A refusal at a
   * quota is final and says which one.
   */
  const send = async (
    uri: string,
    path: string,
    mimeType: string,
    progress?: (fraction: number) => void,
  ): Promise<FailedOutcome | null> => {
    let result = await putFile(uri, path, mimeType, token, signal, progress);

    if (result === 'auth') {
      const fresh = await accessToken(myId, true);
      if (!fresh) return { status: 'failed' };
      token = fresh;
      result = await putFile(uri, path, mimeType, token, signal, progress);
    }

    if (result === 'refused' && !swept) {
      const quota = await fetchMyReelQuota();
      if (quota && quota.posted_today >= quota.day_limit) return { status: 'quota_day' };
      if (quota && quota.live >= quota.live_limit) return { status: 'quota_total' };
      swept = true;
      await sweepOrphanReelFiles(myId);
      result = await putFile(uri, path, mimeType, token, signal, progress);
    }

    switch (result) {
      case 'ok':
        return null;
      case 'too_large':
        return { status: 'too_large' };
      case 'cancelled':
        return { status: 'cancelled' };
      default:
        return { status: signal?.aborted ? 'cancelled' : 'failed' };
    }
  };

  const fail = async (outcome: FailedOutcome): Promise<PostReelOutcome> => {
    await removeReelFiles([posterPath, videoPath]);
    return outcome;
  };

  const posterStopped = await send(posterUri, posterPath, 'image/jpeg');
  if (posterStopped) return fail(posterStopped);

  const videoStopped = await send(videoUri, videoPath, isMp4 ? 'video/mp4' : 'video/quicktime', onProgress);
  if (videoStopped) return fail(videoStopped);

  /*
   * The last moment a cancel can still be honoured. Once the insert is
   * sent the reel is posted or it is not, and a cancel that arrives after
   * that is ignored rather than raced against it.
   */
  if (signal?.aborted) return fail({ status: 'cancelled' });

  const { data, error } = await supabase
    .from('reels')
    .insert({
      id,
      author_id: myId,
      video_path: videoPath,
      poster_path: posterPath,
      caption,
      // An empty id would fail reels_drink_id_len, and retrying could never fix that. No tag is null.
      drink_id: input.drinkId || null,
      /*
       * Clamped to the recorder's 1 to 30 s, inside what the reels_duration
       * CHECK accepts (1 to 31 s). The recorder already stops at 30 s and
       * discards anything under one, but a CHECK failure would read as
       * 'failed', and retrying could never fix it.
       */
      duration_ms: Math.min(REEL_MAX_SECONDS * 1000, Math.max(REEL_MIN_MS, Math.round(durationMs))),
      landscape,
    })
    .select(REEL_SELECT)
    .single();

  if (error || !data) {
    const message = error?.message ?? '';
    if (error && isObjectionableError(error)) return fail({ status: 'objectionable' });
    if (message.includes('reel_quota_day')) return fail({ status: 'quota_day' });
    if (message.includes('reel_quota_total')) return fail({ status: 'quota_total' });
    /*
     * An error with a Postgres code means the insert was refused and no row
     * points at the files. One without a code (the connection dropped
     * after the request left, or a gateway page came back) leaves it open
     * whether the row went in, and removing the files under a row that did
     * would publish a reel with nothing to play. So look first. When even
     * that read fails, keep the files: an orphan costs a slot until the
     * sweep takes it, a broken reel would sit in everyone's feed.
     */
    if (!error?.code) {
      const landed = await fetchReel(id, myId).catch(() => undefined);
      if (landed) return { status: 'ok', reel: landed };
      if (landed === undefined) return { status: 'failed' };
    }
    return fail({ status: 'failed' });
  }

  // Yours and brand new: nobody has liked it yet, so no likes read.
  return { status: 'ok', reel: toReel(data as unknown as ReelQueryRow, myId, new Set()) };
}

/* ==================================================================== */
/* Deleting and likes                                                   */
/* ==================================================================== */

/**
 * Deletes one of your reels: the row first, so it vanishes for everyone at
 * once, then its two files. A file that will not go is swallowed (the
 * orphan sweep and the account-deletion sweep catch it); a throw there
 * would leave a reel the user cannot remove. Throws when the row delete
 * fails, so the reel stays on screen.
 */
export async function deleteReel(myId: string, reel: Reel): Promise<void> {
  if (reel.authorId !== myId) throw new Error('Only your own reels can be deleted.');
  const { error } = await supabase.from('reels').delete().eq('id', reel.id).eq('author_id', myId);
  if (error) throw error;
  await removeReelFiles([reel.videoPath, reel.posterPath]);
  forgetSignedPhoto(reel.videoPath, 'reels');
  forgetSignedPhoto(reel.posterPath, 'reels');
}

/** Likes a reel. Liking one you already like is the state you wanted, so it counts as success. */
export async function likeReel(myId: string, reelId: string): Promise<void> {
  const { error } = await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: myId });
  if (!error || error.code === '23505' || error.message.includes('duplicate')) return;
  throw error;
}

export async function unlikeReel(myId: string, reelId: string): Promise<void> {
  const { error } = await supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', myId);
  if (error) throw error;
}
