import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Print } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { haptic, PressableScale } from '@/components/ui';
import { layout, motion } from '@/constants/theme';
import { getDrink } from '@/data';
import { timeAgoSpoken } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import type { Post } from '@/types';

/* ==================================================================== */
/* The posts grid: a profile's posts, and Saved                         */
/*                                                                      */
/* v4 (layout spec 5.5): three square prints to a row INSIDE the 24pt   */
/* gutters, 8pt apart, square corners, and nothing on them. The Nº      */
/* plate and the stack marker are gone: the post's own screen and the   */
/* drink page carry both (layout principle 1, "nothing is lost, it just */
/* isn't on screen at rest"). The tile's spoken label still says how    */
/* many photos the post holds.                                          */
/*                                                                      */
/* Each tile is a Print: the wash until the photo decodes, and the 1pt  */
/* photoEdge over it, so a blown-out white pour still has an edge on    */
/* the white page.                                                      */
/*                                                                      */
/* Rows, not a three-column FlatList. The profile's list can also show  */
/* reels in the same FlatList (while that flag is on), and React Native */
/* throws if numColumns changes on a mounted list; so each section hands */
/* the list pre-chunked rows and the list stays one column.             */
/* ==================================================================== */

/** Splits a list into rows of `size`. The last row may be shorter. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** The tile's side for a three-up row on this screen width: 125.3 at 440, 109 at 393. */
export function useGridTile(): number {
  const { width } = useWindowDimensions();
  /*
   * Unrounded, for the reason DexCard gives for its cardWidth: rounded
   * down, three tiles and two gaps fall short of the far gutter by up to
   * two points; rounded up, the third tile wraps.
   */
  return (width - 2 * layout.gutter - 2 * layout.gridGap) / 3;
}

/**
 * One row of up to three posts. A short last row stays left-aligned, so a
 * single post is a tile, not a banner.
 */
export function PostGridRow({
  posts,
  onOpen,
}: {
  posts: Post[];
  /** Where a tile opens. Left off, the single-post screen. */
  onOpen?: (post: Post) => void;
}) {
  const size = useGridTile();
  return (
    <View style={styles.row}>
      {posts.map((post) => (
        <PostGridTile key={post.id} post={post} size={size} onOpen={onOpen} />
      ))}
    </View>
  );
}

/**
 * One post as a square print: its newest photo, or the drink's own face
 * (the catalogue print, else the no-photo face) when there is none or it
 * will not sign.
 */
export function PostGridTile({
  post,
  size,
  onOpen,
}: {
  post: Post;
  size: number;
  onOpen?: (post: Post) => void;
}) {
  const router = useRouter();
  /*
   * The post is the retry key, so a pull to refresh (which fetches fresh
   * post objects) re-asks for a photo that failed to sign. `undefined` is
   * "still signing": the tile holds its wash, and only a photo that will
   * not sign (`null`) falls back to the drink's face. Drawing the face
   * while waiting flashed a picture that the photo replaced.
   */
  const photoUrl = useSignedPhoto(post.photoPath, post);
  const drink = getDrink(post.drinkId);
  // Callers filter with isRenderablePost; this only keeps a stray one from crashing.
  if (!drink) return null;

  const photos = post.photoPaths?.length ?? (post.photoPath ? 1 : 0);
  const px = Math.round(size);
  const open = () => {
    haptic.tap();
    if (onOpen) onOpen(post);
    else router.navigate({ pathname: '/post/[id]', params: { id: post.id } });
  };

  return (
    <PressableScale
      /*
       * A media tile: no tick on touch-down and a short delay before the
       * press state, because the grid is wall-to-wall tiles and nearly
       * every flick starts on one (DexCard's reasoning). A flick leaves
       * the slop inside 120ms and cancels before either fires; a tap
       * still lands, and ticks on release.
       */
      noHaptic
      unstable_pressDelay={120}
      onPress={open}
      accessibilityRole="button"
      // Spoken, not the visual "3h": that reads as "3 h".
      accessibilityLabel={`${drink.name}, posted ${timeAgoSpoken(post.createdAt)}${
        photos > 1 ? `, ${photos} photos` : ''
      }`}>
      <Print width={size} height={size}>
        {photoUrl !== null ? (
          <Image
            accessibilityIgnoresInvertColors
            source={
              photoUrl
                ? {
                    uri: photoUrl,
                    cacheKey: post.photoPath ? `${post.photoPath}#${px}x${px}` : undefined,
                  }
                : undefined
            }
            /*
             * Keyed on the storage path, as the post's own photo is: a
             * signed URL carries a fresh token each time it is minted, so
             * keyed on the URL the disk cache never hit and every visit
             * downloaded the grid again.
             *
             * And on the tile's size. expo-image's SDWebImage (5.21.6 and
             * later) files an early-resized decode under the path's original
             * key in memory and hands it to the next size that misses its
             * own entry, so a tile's decode could become the post page's
             * photo (as the tab bar's face became the profile header's in
             * build 15). A key per size keeps every decode with its frame.
             */
            cachePolicy="memory-disk"
            /*
             * Decoded at the tile's size, not the upload's. Pours are stored
             * at up to 2048px, and without this expo-image on iOS decodes
             * the WHOLE file (12.6 MB of pixels for a 3:4 pour) into
             * SDWebImage's memory cache, which has no cost limit, then
             * redraws a tile-sized copy on the main thread each time the
             * tile mounts. A grid mounts dozens at once: the lag that grew
             * with use until a memory kill (build 13). Early resizing asks
             * ImageIO for a thumbnail at the frame's pixel size instead.
             *
             * The thumbnail is fitted inside the frame, so a 3:4 pour is
             * scaled up by a third to fill this square, which at tile size
             * the eye does not pick out.
             */
            enforceEarlyResizing
            style={styles.image}
            contentFit="cover"
            transition={motion.fast}
          />
        ) : (
          <DrinkFace drink={drink} mode="photo" width={size} height={size} style={FACE_FILL} />
        )}
      </Print>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: layout.gridGap,
    marginTop: layout.gridGap,
    paddingHorizontal: layout.gutter,
  },
  image: { width: '100%', height: '100%' },
});
