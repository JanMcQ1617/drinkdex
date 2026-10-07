import type { PostPhotoInsert, RecentPourRow } from '@/lib/database.types';
import { containsObjectionable } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { Song } from '@/types';

export type { Song } from '@/types';

/* ==================================================================== */
/* Music on a story (spec v3.1 §5.2, §10.2, §13.2)                       */
/*                                                                      */
/* A song is an Apple Music catalog song, found through the apple-music  */
/* Edge Function (which holds the MusicKit key, so none ships in the     */
/* app) and stored on the photo row it was posted with. Its 30-second    */
/* preview plays from Apple's servers, always beside a link to the song  */
/* in Apple Music (App Review 5.2.5).                                    */
/*                                                                      */
/* Nothing here plays anything: the player is components/songs.tsx.     */
/* ==================================================================== */

/**
 * 'tap': the story shows a song tag and the preview plays only when the
 * viewer taps it (recommended: a preview of that song, with its link).
 * 'autoplay': the preview plays while the story is shown, with a mute
 * control; do not ship it without written permission (App Review 5.2.5,
 * 4.5.2). 'off': nothing music-related is shown or sent.
 */
export type StoryMusicMode = 'off' | 'tap' | 'autoplay';

/*
 * Read with a direct, static process.env access: Expo inlines
 * EXPO_PUBLIC_ variables only in that form, so a computed key would read
 * undefined in a Release build and leave the feature off for good.
 */
const MODE_FLAG = process.env.EXPO_PUBLIC_STORY_MUSIC;

/** EXPO_PUBLIC_STORY_MUSIC: 'tap' or 'autoplay'; anything else (the default) is 'off'. */
export const STORY_MUSIC: StoryMusicMode =
  MODE_FLAG === 'tap' || MODE_FLAG === 'autoplay' ? MODE_FLAG : 'off';

/* -------------------------------------------------------------------- */
/* The shape a stored song must have                                    */
/*                                                                      */
/* The same rules as migration 020's post_photos_music_shape, so a song */
/* this file lets through is one the server will store, and a song read */
/* back from someone else's row is one the app can safely open: the     */
/* preview, the link and the artwork are only ever Apple's own hosts.   */
/* -------------------------------------------------------------------- */

const SONG_ID = /^[0-9]{1,20}$/;
const PREVIEW_URL = /^https:\/\/audio-ssl\.itunes\.apple\.com\//;
const SONG_URL = /^https:\/\/music\.apple\.com\//;
const ARTWORK_URL = /^https:\/\/is[0-9]+-ssl\.mzstatic\.com\//;
const STOREFRONT = /^[a-z]{2}$/;
const URL_MAX = 500;
const TEXT_MAX = 200;

const textOk = (t: unknown): t is string => typeof t === 'string' && t.length >= 1 && t.length <= TEXT_MAX;
const urlOk = (u: unknown, host: RegExp): u is string =>
  typeof u === 'string' && u.length <= URL_MAX && host.test(u);

/** True when the server would store this song as it is (post_photos_music_shape). */
export function isStorableSong(song: Song): boolean {
  return (
    SONG_ID.test(song.id) &&
    textOk(song.title) &&
    textOk(song.artist) &&
    urlOk(song.previewUrl, PREVIEW_URL) &&
    urlOk(song.appleMusicUrl, SONG_URL) &&
    (song.artworkUrl === null || urlOk(song.artworkUrl, ARTWORK_URL)) &&
    STOREFRONT.test(song.storefront)
  );
}

/** "https://music.apple.com/us/album/..." -> "us". */
function storefrontOfLink(url: string): string | null {
  return /^https:\/\/music\.apple\.com\/([a-z]{2})\//.exec(url)?.[1] ?? null;
}

/* -------------------------------------------------------------------- */
/* Storefront                                                           */
/* -------------------------------------------------------------------- */

/*
 * US territories have no Apple Music storefront of their own and are
 * served by the US one. Puerto Rico is Sipply's home market: without this,
 * a phone set to "es-PR" would ask for a storefront that does not exist and
 * every search would fail (the function also retries a refused storefront
 * as "us", but that costs Apple a second request every time).
 */
const SERVED_BY_US = new Set(['pr', 'vi', 'gu', 'as', 'mp']);

/** The region subtag of a locale ("en-US", "zh-Hant-TW", "en_PR"), lower-cased, or null. */
function regionOf(locale: string): string | null {
  for (const part of locale.split(/[-_@]/).slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toLowerCase();
    // A singleton opens an extension ("-u-ca-..."): no region after it.
    if (part.length === 1) break;
  }
  return null;
}

/**
 * The phone's Apple Music storefront: the region of
 * Intl.DateTimeFormat().resolvedOptions().locale ("en-US" -> "us"), else
 * "us". US territories (pr, vi, gu, as, mp) map to "us".
 */
export function storefront(): string {
  let locale = '';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  } catch {
    // An engine without Intl: the US storefront is the safe default.
  }
  const region = regionOf(locale);
  if (!region) return 'us';
  return SERVED_BY_US.has(region) ? 'us' : region;
}

/* -------------------------------------------------------------------- */
/* Search                                                               */
/* -------------------------------------------------------------------- */

export type SearchResult =
  | { ok: true; songs: Song[] }
  | { ok: false; reason: 'not_configured' | 'rate_limited' | 'offline' | 'failed' };

/** Matches the Edge Function's own bounds, so a long paste is cut rather than refused. */
const TERM_MAX = 80;
const RESULTS = 20;
/** A search the network has stalled on gives up and says so, rather than spinning. */
const SEARCH_TIMEOUT_MS = 15_000;

/** One song from the function's answer, or null if any field is off. Never trusted as typed. */
function toSong(raw: unknown): Song | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const song: Song = {
    id: str(r.id) ?? '',
    title: str(r.title) ?? '',
    artist: str(r.artist) ?? '',
    album: str(r.album),
    artworkUrl: str(r.artworkUrl),
    previewUrl: str(r.previewUrl) ?? '',
    appleMusicUrl: str(r.appleMusicUrl) ?? '',
    durationMs: typeof r.durationMs === 'number' && Number.isFinite(r.durationMs) ? r.durationMs : null,
    storefront: str(r.storefront) ?? '',
  };
  return isStorableSong(song) ? song : null;
}

/** The HTTP status of a FunctionsHttpError, whose context is the Response. */
function statusOf(error: unknown): number | null {
  const ctx = (error as { context?: unknown } | null)?.context;
  const status = (ctx as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * Songs on Apple Music matching `term`, through the apple-music Edge
 * Function (which charges the account's 120-an-hour budget). Fewer than two
 * characters returns no songs without a request.
 *
 * Songs whose title or artist the content filter refuses are left out: the
 * server would refuse to store them on a photo anyway.
 *
 * Errors are told apart by class NAME, not instanceof: a second copy of
 * functions-js in the bundle would make every instanceof false and turn an
 * offline search into "failed".
 */
export async function searchSongs(term: string): Promise<SearchResult> {
  const q = term.trim().slice(0, TERM_MAX).trim();
  if (q.length < 2) return { ok: true, songs: [] };

  try {
    const { data, error } = await supabase.functions.invoke('apple-music', {
      body: { action: 'search', term: q, storefront: storefront(), limit: RESULTS },
      timeout: SEARCH_TIMEOUT_MS,
    });
    if (error) {
      const name = (error as { name?: unknown }).name;
      if (name === 'FunctionsFetchError') return { ok: false, reason: 'offline' };
      const status = statusOf(error);
      if (status === 429) return { ok: false, reason: 'rate_limited' };
      // 503: a secret is missing or Apple refused the key. 404: the
      // function has not been deployed yet.
      if (status === 503 || status === 404) return { ok: false, reason: 'not_configured' };
      return { ok: false, reason: 'failed' };
    }
    const list = (data as { songs?: unknown } | null)?.songs;
    if (!Array.isArray(list)) return { ok: false, reason: 'failed' };
    const songs = list
      .map(toSong)
      .filter((s): s is Song => s !== null)
      .filter((s) => !containsObjectionable(s.title) && !containsObjectionable(s.artist));
    return { ok: true, songs };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/* -------------------------------------------------------------------- */
/* Rows                                                                 */
/* -------------------------------------------------------------------- */

/**
 * The post_photos columns for a song, or none. A song the server would
 * refuse is sent as no song: the photo matters more than the song.
 */
export function musicColumns(song: Song | null): Partial<PostPhotoInsert> {
  if (!song || !isStorableSong(song)) return {};
  return {
    music_song_id: song.id,
    music_title: song.title,
    music_artist: song.artist,
    music_artwork_url: song.artworkUrl,
    music_preview_url: song.previewUrl,
    music_url: song.appleMusicUrl,
    music_storefront: song.storefront,
  };
}

/**
 * The song on a recent_pours row, or null: none was added, the server
 * predates migration 020 (the keys are absent), or a field a preview needs
 * is missing or not on Apple's hosts. Someone else wrote this row, so it is
 * checked as strictly as the server checked it. The storefront is read back
 * from the Apple Music link (the function does not return the column).
 */
export function songFromRow(row: Partial<RecentPourRow>): Song | null {
  const id = row.music_song_id;
  const title = row.music_title;
  const artist = row.music_artist;
  const previewUrl = row.music_preview_url;
  const appleMusicUrl = row.music_url;
  if (!id || !title || !artist || !previewUrl || !appleMusicUrl) return null;
  const artwork = row.music_artwork_url;
  const song: Song = {
    id,
    title,
    artist,
    album: null,
    artworkUrl: artwork && urlOk(artwork, ARTWORK_URL) ? artwork : null,
    previewUrl,
    appleMusicUrl,
    durationMs: null,
    storefront: storefrontOfLink(appleMusicUrl) ?? 'us',
  };
  return isStorableSong(song) ? song : null;
}
