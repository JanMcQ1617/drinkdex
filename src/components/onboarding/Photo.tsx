import { Image } from 'expo-image';
import React from 'react';
import { Image as RNImage, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { VectorFace } from '@/components/artwork/VectorFace';
import { colors, radius, stroke } from '@/constants/theme';
import { getDrink } from '@/data';
import { photoFor, proofFor } from '@/data/drinkPhotos';

/* ==================================================================== */
/* A catalogue print at one size                                        */
/*                                                                      */
/* The onboarding draws the same bundled photographs at several sizes   */
/* (the wall's 146, the Dex grid's 112, the collage's cells, the        */
/* results' 72, the card's 56). Each decodes for itself: early-resized, */
/* under a key that carries its size (`<file>#<w>x<h>`, the key          */
/* DrinkFace uses), so a small decode is never handed to a larger frame */
/* and a picture is never decoded at its file's 1024px.                 */
/*                                                                      */
/* MEMORY-DISK, not DrinkFace's disk: a print here is drawn again by     */
/* the next step at the same size (the collage's cell is the reveal's    */
/* flying copy), and from memory it is there in the frame it mounts, so  */
/* a copy never shows a blank square over the print it replaces. The    */
/* root layout caps the memory tier.                                    */
/*                                                                      */
/* `ground: false` draws nothing until the picture decodes, so a colour  */
/* print laid over its proof never blinks the proof away.               */
/*                                                                      */
/* A drink with no photograph gets the no-photo face (VectorFace).      */
/* Decorative: the row or step that holds it speaks.                    */
/* ==================================================================== */

const uris = new Map<number, string | null>();
function assetUri(asset: number): string | null {
  let uri = uris.get(asset);
  if (uri === undefined) {
    uri = RNImage.resolveAssetSource(asset)?.uri ?? null;
    uris.set(asset, uri);
  }
  return uri;
}

export const DrinkPrint = React.memo(function DrinkPrint({
  id,
  size,
  kind = 'photo',
  ground = true,
  style,
}: {
  id: string;
  /** The square frame in points, which is also the decode size. */
  size: number;
  /** `proof` is the grey "not yet" print. */
  kind?: 'photo' | 'proof';
  /** The wash under the picture until it decodes. */
  ground?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const asset = kind === 'photo' ? photoFor(id) : proofFor(id);
  const frame = { width: size, height: size };

  if (asset === undefined) {
    const drink = getDrink(id);
    return (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.print, styles.ground, frame, style]}>
        {drink ? <VectorFace drink={drink} width={size} height={size} /> : null}
        <View style={styles.edge} />
      </View>
    );
  }

  const px = Math.round(size);
  const uri = assetUri(asset);
  const key = `${uri ?? id}#${px}x${px}`;
  const source = uri ? { uri, cacheKey: key } : asset;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.print, ground && styles.ground, frame, style]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        recyclingKey={key}
        enforceEarlyResizing
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <View style={styles.edge} />
    </View>
  );
});

const styles = StyleSheet.create({
  /* Prints are square (white spec D5). */
  print: { overflow: 'hidden', borderRadius: radius.none },
  ground: { backgroundColor: colors.bgSunk },
  edge: { ...StyleSheet.absoluteFill, borderWidth: stroke.edge, borderColor: colors.photoEdge },
});
