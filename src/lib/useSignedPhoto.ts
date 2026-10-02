import { useEffect, useState } from 'react';

import { peekSignedPhoto, signedPhotoUrl, type Bucket } from '@/lib/social';

/**
 * Turns a private-bucket object key into a displayable URL.
 *
 * Three answers, because "not yet" and "never" look different on screen: a
 * string once signed, `undefined` while signing is in flight, and `null`
 * when there is no path or it would not sign. A caller that waits on
 * `undefined` keeps the photo's frame in place; only `null` should fall
 * back to artwork. Treating the two alike is what made every photo post
 * open as an illustration and then jump taller when its URL arrived.
 *
 * An already-signed path is answered on the first render, from the cache,
 * so a card remounting in the feed or a gallery paging back paints at once.
 *
 * `retryKey` re-asks when it changes — pass something that changes on
 * refresh (the post object does). A success is memoised, so on the happy
 * path that costs nothing; after a failed signing, which the cache no longer
 * keeps, it is what lets a pull-to-refresh bring a mounted photo back.
 *
 * `bucket` is `pours` (pour photos and avatars) unless the path names a
 * reel's poster, which lives in the private `reels` bucket. The same path
 * string in two buckets is two different objects, so the cache keys on both.
 *
 * Its own module rather than PostCard's, because the feed, the profile
 * grids, Activity, Today's pours and the reel tiles all render these photos
 * in different frames, and none of them should depend on another screen's
 * component file for the signing round trip. PostCard re-exports it.
 */
export function useSignedPhoto(
  path: string | null | undefined,
  retryKey?: unknown,
  bucket: Bucket = 'pours',
): string | null | undefined {
  // Keyed by what it was signed for, so a changed path or bucket reads as
  // "not resolved yet" without a synchronous reset that would cascade renders.
  const [signed, setSigned] = useState<{ path: string; bucket: Bucket; url: string | null } | null>(
    null,
  );
  const cached = peekSignedPhoto(path, bucket);

  useEffect(() => {
    /*
     * Skipped only when THIS render already had the URL. Asking the cache
     * again here would race: a signing that settles between the render and
     * the effect would make the effect bail while the render still showed
     * the empty frame, and nothing would ever fill it.
     */
    if (!path || cached !== undefined) return;
    let alive = true;
    // signedPhotoUrl never rejects; a photo that won't sign resolves null
    // and falls back to the drink's artwork.
    void signedPhotoUrl(path, bucket).then((url) => {
      if (alive) setSigned({ path, bucket, url });
    });
    return () => {
      alive = false;
    };
  }, [path, bucket, retryKey, cached]);

  if (!path) return null;
  if (cached !== undefined) return cached;
  return signed && signed.path === path && signed.bucket === bucket ? signed.url : undefined;
}
