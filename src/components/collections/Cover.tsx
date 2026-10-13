import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Print } from '@/components/cabinet';
import { DrinkFace } from '@/components/DexCard';
import { colors, motion } from '@/constants/theme';
import { getDrink } from '@/data';
import { useSignedPhoto } from '@/lib/useSignedPhoto';

/* ==================================================================== */
/* A collection's cover, and one thing's print                          */
/*                                                                      */
/* Spec §4.5. A cover is a picture of the collection, not of your       */
/* progress, so a drink is always its COLOUR print here, caught or not  */
/* (inside the collection the grid shows caught or not as the Dex       */
/* does). A post is its newest photo, signed as PostGrid signs it, and  */
/* the drink's own face while it has none or it will not sign.          */
/*                                                                      */
/*   four or more   a 2 x 2 mosaic of the first four, 2pt page gaps     */
/*   one to three   the first one, whole                                */
/*   none           the wash                                            */
/*                                                                      */
/* Decorative everywhere: the tile, the row or the bar that holds a     */
/* cover says what is in it.                                            */
/* ==================================================================== */

/** What a cover cell needs: the drink it shows, and a post's photo. */
export type CoverPiece = { kind: 'drink' | 'post'; drinkId: string; photoPath: string | null };

/** The mosaic's gap, in the page's white. */
const GAP = 2;

/** One thing's print, square, at `size`. */
export function ThingPrint({ piece, size }: { piece: CoverPiece; size: number }) {
  const drink = getDrink(piece.drinkId);
  const path = piece.kind === 'post' ? piece.photoPath : null;
  // undefined while signing: the frame holds the wash, and only a photo that will not sign falls back to the face.
  const url = useSignedPhoto(path);
  const px = Math.round(size);
  return (
    <Print width={size} height={size}>
      {path && url !== null ? (
        <Image
          accessibilityIgnoresInvertColors
          source={url ? { uri: url, cacheKey: `${path}#${px}x${px}` } : undefined}
          // Keyed on the path and the frame's size, as PostGridTile's: a signed URL changes, a path never does.
          cachePolicy="memory-disk"
          // Pours are stored at up to 2048px; decode at the cell's size.
          enforceEarlyResizing
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={motion.fast}
        />
      ) : drink ? (
        <DrinkFace drink={drink} mode="photo" width={size} height={size} />
      ) : null}
    </Print>
  );
}

export function Cover({ pieces, size }: { pieces: readonly CoverPiece[]; size: number }) {
  if (pieces.length === 0) {
    return <View style={[styles.empty, { width: size, height: size }]} />;
  }
  if (pieces.length < 4) return <ThingPrint piece={pieces[0]!} size={size} />;
  const cell = (size - GAP) / 2;
  const four = pieces.slice(0, 4);
  // Two rows rather than a wrap: a wrap can drop the second cell to a new line on a rounding hair.
  return (
    <View style={[styles.mosaic, { width: size, height: size }]}>
      {[four.slice(0, 2), four.slice(2, 4)].map((row, r) => (
        <View key={r} style={styles.mosaicRow}>
          {row.map((p, i) => (
            <ThingPrint key={`${p.kind}:${p.drinkId}:${p.photoPath ?? ''}:${r * 2 + i}`} piece={p} size={cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { backgroundColor: colors.bgSunk },
  mosaic: { gap: GAP, backgroundColor: colors.bg },
  mosaicRow: { flexDirection: 'row', gap: GAP },
});
