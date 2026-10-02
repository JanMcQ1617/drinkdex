import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { timeAgoSpoken } from '@/components/PostCard';
import { haptic, PressableScale } from '@/components/ui';
import { CATEGORY_META, colors, layout, motion, radius } from '@/constants/theme';
import { getDrink } from '@/data';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import type { Post } from '@/types';

/* ==================================================================== */
/* The posts grid: a profile's Posts tab, and Saved                     */
/*                                                                      */
/* Three square tiles to a row, full bleed, 2pt apart: the shape every   */
/* photo grid has. A tile is the middle of the photo; the whole 3:4      */
/* frame is one tap away, on the post's own screen. Media is square-     */
/* cornered; only controls are rounded.                                  */
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
 * One post as a square tile: its newest photo, or its drink's artwork on
 * the category wash when there is none.
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
   * that will not sign (`null`) falls back to the artwork. Drawing the
   * artwork while waiting flashed an illustration that the photo replaced.
   */
  const photoUrl = useSignedPhoto(post.photoPath, post);
  const drink = getDrink(post.drinkId);
  // Callers filter with isRenderablePost; this only keeps a stray one from crashing.
  if (!drink) return null;

  const photos = post.photoPaths?.length ?? (post.photoPath ? 1 : 0);
  const open = () => {
    haptic.tap();
    if (onOpen) onOpen(post);
    else router.push({ pathname: '/post/[id]', params: { id: post.id } });
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
      }`}
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: CATEGORY_META[drink.category].wash },
      ]}>
      {photoUrl !== null ? (
        <Image
          source={photoUrl ? { uri: photoUrl, cacheKey: post.photoPath ?? undefined } : undefined}
          /*
           * Keyed on the storage path, as PostCard's photo is: a signed URL
           * carries a fresh token each time it is minted, so keyed on the URL
           * the disk cache never hit and every visit downloaded the grid again.
           */
          cachePolicy="memory-disk"
          style={styles.image}
          contentFit="cover"
          transition={motion.fast}
        />
      ) : (
        <DrinkArt drink={drink} size={size * 0.6} flat />
      )}
      {photos > 1 ? (
        /*
         * More than one photo on this post. A dark marker with bone ink,
         * no edge: it has to hold over a white tablecloth as well as a
         * dark bar (the pair is audited in check-contrast).
         */
        <View style={styles.stack} pointerEvents="none">
          <Icon name="stack" size={14} color={colors.reelInk} />
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
  stack: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: radius.badge,
    backgroundColor: colors.reelScrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
