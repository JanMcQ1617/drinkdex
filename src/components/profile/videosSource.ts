import {
  COPY,
  REELS_ENABLED,
  fetchReelsByAuthor,
  formatReelDuration,
  type Reel,
} from '@/lib/reels';
import { primeSignedUrls, signedPhotoUrl } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useReels } from '@/store/reels';

/* ==================================================================== */
/* The seam between a profile and Reels                                 */
/*                                                                      */
/* The ONLY file in components/profile/ that knows reels exist. The      */
/* profile draws a Reels tab from what this file hands it: a flag, a     */
/* fetch, a poster, two routes, a version to refetch on, and the copy.  */
/* Everything else about reels (the table, the bucket, the player) stays */
/* in lib/reels, store/reels and the reels screens, so turning the      */
/* feature off, renaming it or changing its storage touches this file   */
/* and not the profile.                                                 */
/*                                                                      */
/* lib/reels is safe to import here: it is loaded at app start anyway   */
/* (the tab bar reads its flag) and imports no camera or video module.  */
/* ==================================================================== */

/** One reel as a profile tile needs it. */
export interface ProfileVideo {
  id: string;
  authorId: string;
  /** `<authorId>/<id>.jpg` in the private reels bucket. */
  posterPath: string;
  durationMs: number;
  createdAt: string;
  /** A Dex id, or null. May name a drink this build no longer has. */
  drinkId: string | null;
}

/**
 * Whether profiles show a Reels tab at all. The feature's one flag
 * (EXPO_PUBLIC_REELS): while it is off, the app's Reels tab, the recorder
 * and this profile tab are all hidden, and nothing here fetches.
 */
export const SHOW_PROFILE_VIDEOS = REELS_ENABLED;

const toProfileVideo = (r: Reel): ProfileVideo => ({
  id: r.id,
  authorId: r.authorId,
  posterPath: r.posterPath,
  durationMs: r.durationMs,
  createdAt: r.createdAt,
  drinkId: r.drinkId,
});

/**
 * Someone's reels, newest first: at most one page, since the live limit
 * keeps every account well under it. The posters are signed as ONE batch
 * here, before the tiles mount, rather than one request per tile; a tile
 * that mounts while the batch is out shares it (primeSignedUrls). Not
 * awaited: the list can draw its frames while the posters sign.
 */
export async function fetchProfileVideos(authorId: string, myId: string): Promise<ProfileVideo[]> {
  const reels = await fetchReelsByAuthor(authorId, myId);
  void primeSignedUrls(
    'reels',
    reels.map((r) => r.posterPath),
  );
  return reels.map(toProfileVideo);
}

/** A poster's signed URL, or null when it will not sign. Never rejects. */
export function signedPosterUrl(path: string): Promise<string | null> {
  return signedPhotoUrl(path, 'reels');
}

/**
 * The poster for a tile: a URL once signed, `undefined` while signing,
 * `null` when it will not sign (useSignedPhoto's three answers), read
 * from the reels bucket. The same path in the pours bucket is a different
 * object, which is why the bucket is named here and nowhere in the grid.
 */
export function usePosterUrl(path: string): string | null | undefined {
  return useSignedPhoto(path, undefined, 'reels');
}

/** A tile opens the author's reels at this one: push with `{ id, author: authorId }`. */
export const VIDEO_ROUTE = '/reel/[id]' as const;
/** Where "Record a reel" goes, from your own empty Reels tab. */
export const RECORD_VIDEO_ROUTE = '/record' as const;

/** The reels store bumps this after a post, a delete, a report or a block; pass it as the refetch key. */
export const useVideosVersion = () => useReels((s) => s.reelsVersion);

/** Every visible string for the tab, so the feature has one name in one file. */
export const VIDEO_COPY = COPY;

/** `0:14`: a reel's length as its tile draws it (never 0:00; the shortest reel is a second). */
export const formatVideoDuration = formatReelDuration;
