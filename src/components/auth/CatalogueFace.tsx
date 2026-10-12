import { Image } from 'expo-image';
import React from 'react';
import { Image as RNImage, type StyleProp, View, type ViewStyle } from 'react-native';

import { DrinkFace } from '@/components/DexCard';
import { colors } from '@/constants/theme';
import { photoFor } from '@/data/drinkPhotos';
import type { Drink } from '@/types';

/* ==================================================================== */
/* A catalogue photograph at one size, under a key of its own           */
/*                                                                      */
/* The sign-in screens draw the same bundled photos at three sizes: the */
/* picker's prints, the tray's, and a begun Dex's picks on the sign-in  */
/* page. SDWebImage (5.21.6) files an early-resized decode              */
/* under its source's key and hands it to the next size that misses its */
/* own entry, so a 44pt tray print decoded first would be the picture   */
/* in a 184pt print, or in the Dex grid, soft (ui.tsx Avatar tells the  */
/* same story). DrinkFace now adds its own size suffix too; this one    */
/* keeps `${id}#<w>x<h>`, keyed by drink, not file: every size          */
/* decodes for itself, and nothing here can reach another screen's      */
/* frames.                                                              */
/*                                                                      */
/* A drink with no photograph falls back to DrinkFace's no-photo face,  */
/* which decodes nothing.                                               */
/* ==================================================================== */

export const CatalogueFace = React.memo(function CatalogueFace({
  drink,
  width,
  height,
  style,
}: {
  drink: Drink;
  /** The decode size in points: the frame the picture is drawn at. */
  width: number;
  height: number;
  /** Placement only; the size is width x height. */
  style?: StyleProp<ViewStyle>;
}) {
  const asset = photoFor(drink.id);
  if (asset === undefined) {
    return <DrinkFace drink={drink} mode="photo" width={width} height={height} style={style} />;
  }
  const resolved = RNImage.resolveAssetSource(asset);
  const key = `${drink.id}#${Math.round(width)}x${Math.round(height)}`;
  const source = resolved?.uri ? { uri: resolved.uri, cacheKey: key } : asset;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, backgroundColor: colors.bgSunk }, style]}>
      <Image
        accessibilityIgnoresInvertColors
        source={source}
        style={{ width, height }}
        contentFit="cover"
        // A cut, never a fade: a pick swaps the frame in the same frame (TastePicker).
        transition={0}
        cachePolicy="disk"
        enforceEarlyResizing
        recyclingKey={key}
        accessible={false}
      />
    </View>
  );
});
