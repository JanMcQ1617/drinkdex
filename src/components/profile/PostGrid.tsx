import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { MediaMarker, MediaNumberPlate } from '@/components/media';
import { timeAgoSpoken } from '@/components/PostCard';
import { haptic, PressableScale } from '@/components/ui';
import { CATEGORY_META, layout, motion, radius } from '@/constants/theme';
import { getDrink } from '@/data';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import type { Post } from '@/types';

/* ==================================================================== */
/* The posts grid: a profile's Posts tab, and Saved                     */
/*                                                                      */
/* Three square tiles to a row, full bleed, 2pt apart: the shape every   */
/* photo grid has. A tile is the middle of the photo; the whole frame is */
/* one tap away, on the post's own screen. Media is square-cornered;     */
/* only controls are rounded.                                            */
/*                                                                      */
/* Over the photo: the drink's brass number plate, bottom left (v3.3     */
/* Brass D1), and the stack marker top right on a post with more than    */
/* one photo. Both come from media.tsx, the one file whose inks are      */
/* measured over a blown-out white frame: the plate is solid brass, read */
/* against itself (6.79:1), so it holds over any picture. No shadow on   */
/* either: the grid scrolls.                                             */
/*                                                                      */
/* Rows, not a three-column FlatList. The profile's list shows posts,    */
/* reels and Dex cards (2-up) in one FlatList, and React Native throws  */
/* if numColumns changes on a mounted list; so each tab hands the list  */
/* pre-chunked rows and the list stays one column.                       */
/* ==================================================================== */

/** Splits a list into rows of `size`. The last row may be shorter. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** The tile's side for a three-up row on this screen width. */
export function useGridTile(): number {
  const { width } = useWindowDimensions();
  /*
   * Unrounded, for the reason DexCard gives for its cardWidth: rounded
   * down, three tiles and two gaps fall short of the screen by up to two
   * points and the right edge shows a sliver of page; rounded up, the
   * third tile wraps.
   */
  return (width - 2 * layout.gridGap) / 3;
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
 * One post as a square tile: its newest photo, or the drink's lit face
 * (the tungsten catalogue photo, else the lit vector glass) when there is
 * none or it will not sign.
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
   * "still signing": the tile holds its category wash, and only a photo
   * that will not sign (`null`) falls back to the drink's lit face. Drawing
   * the face while waiting flashed a picture that the photo replaced.
   */
  const photoUrl = useSignedPhoto(post.photoPath, post);
  const drink = getDrink(post.drinkId);
  // Callers filter with isRenderablePost; this only keeps a stray one from crashing.
  if (!drink) return null;

  const photos = post.photoPaths?.length ?? (post.photoPath ? 1 : 0);
  // Every catalogue drink has a number; a drink without one gets no plate rather than "Nº 0000".
  const numbered = drink.dexNumber > 0;
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
      // Spoken, not the visual "3h": that reads as "3 h". The plate is said as "number 127".
      accessibilityLabel={`${drink.name}${
        numbered ? `, number ${drink.dexNumber}` : ''
      }, posted ${timeAgoSpoken(post.createdAt)}${photos > 1 ? `, ${photos} photos` : ''}`}
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: CATEGORY_META[drink.category].wash },
      ]}>
      {photoUrl !== null ? (
        <Image
          source={
            photoUrl
              ? {
                  uri: photoUrl,
                  cacheKey: post.photoPath ? `${post.photoPath}#${Math.round(size)}` : undefined,
                }
              : undefined
          }
          /*
           * Keyed on the storage path, as PostCard's photo is: a signed URL
           * carries a fresh token each time it is minted, so keyed on the URL
           * the disk cache never hit and every visit downloaded the grid again.
           *
           * And on the tile's size. expo-image's SDWebImage (5.21.6 and later)
           * files an early-resized decode under the path's original key in
           * memory and hands it to the next size that misses its own entry,
           * so a tile's 440px decode could become the post page's photo (as
           * the tab bar's face became the profile header's in build 15).
           * A key per size keeps every decode with the frame it was made for.
           */
          cachePolicy="memory-disk"
          /*
           * Decoded at the tile's size, not the upload's. Pours are stored at
           * up to 2048px (lib/pour, stripMetadata), and without this expo-image
           * on iOS decodes the WHOLE file (a 3:4 pour is 1536x2048, 12.6 MB of
           * pixels) into SDWebImage's memory cache, which has no cost limit,
           * then redraws a tile-sized copy on the main thread every time the
           * tile mounts. A grid mounts dozens of tiles at once, so each profile
           * opened could add hundreds of MB and a burst of main-thread work:
           * lag that grows with use, and in the end a memory kill. Early
           * resizing asks ImageIO for a thumbnail at the frame's pixel size
           * instead (about 0.8 MB here), and nothing is redrawn on the main
           * thread.
           *
           * The thumbnail is fitted inside the frame, so a photo of another
           * shape is scaled up to fill the crop: by a third for a 3:4 pour in
           * this square, which at tile size the eye does not pick out.
           */
          enforceEarlyResizing
          style={styles.image}
          contentFit="cover"
          transition={motion.fast}
        />
      ) : (
        <DrinkFace drink={drink} mode="lit" width={size} height={size} style={FACE_FILL} />
      )}
      {photos > 1 ? (
        /*
         * The stack in the top corner when the post has more than one
         * photo. Dark marker fill with a 1pt edge, so it holds over a white
         * tablecloth as well as a dark bar.
         */
        <View style={styles.markers} pointerEvents="none">
          <MediaMarker icon="stack" />
        </View>
      ) : null}
      {numbered ? (
        // 6pt in from the corner, as the stack marker is; decorative, the tile's label says the number.
        <View style={styles.plate} pointerEvents="none">
          <MediaNumberPlate n={drink.dexNumber} size="sm" />
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: layout.gridGap, marginTop: layout.gridGap },
  tile: {
    borderRadius: radius.none,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  markers: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 },
  plate: { position: 'absolute', left: 6, bottom: 6 },
});
