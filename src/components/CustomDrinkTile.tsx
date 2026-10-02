import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DrinkArt } from '@/components/artwork';
import { PressableScale } from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  fonts,
  radius,
  space,
  stroke,
  type as typeScale,
} from '@/constants/theme';
import { toDrink } from '@/lib/customDrinks';
import { customPhotoUri } from '@/lib/pour';
import type { CustomDrink } from '@/types';

/** The shelf's tile width, and the photo's side. */
export const CUSTOM_TILE_WIDTH = 112;

/**
 * One drink someone added, on the Dex's "Added by you" shelf.
 *
 * A media tile, so it keeps PressableScale's give under the finger, as the
 * Dex cards below it do; a picture has no fill to change. It is NOT a Dex
 * card: no number, no rarity frame, no silhouette while unlogged. Those
 * all mean "the catalogue", and dressing a custom entry in them would say
 * it had joined the Dex when it has only been suggested.
 *
 * The photo is the pour's when there is one, else the one sent with the
 * suggestion, else the drawn glass. The square has the control corner and
 * a drawn edge, on the category's wash while the image decodes.
 *
 * The name may take two lines and the style one: the tile sits in a
 * fixed-width scroller, so text that grew without limit would push every
 * tile in the row down with it.
 *
 * "Collected" is said when a pour is logged, whether or not its photo
 * survived: the Dex's Collected filter counts the same thing, so the tile
 * and the filter above it never disagree. Without `collected`, a pour
 * photo is taken as the sign of one.
 */
export function CustomDrinkTile({
  drink,
  pourPhotoUri,
  collected,
  width = CUSTOM_TILE_WIDTH,
  onPress,
}: {
  drink: CustomDrink;
  pourPhotoUri: string | null;
  /** A pour is logged against it. */
  collected?: boolean;
  width?: number;
  onPress: (id: string) => void;
}) {
  const photo = pourPhotoUri || customPhotoUri(drink.photoFile);
  const meta = CATEGORY_META[drink.category];
  const poured = collected ?? Boolean(pourPhotoUri);
  return (
    <PressableScale
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${meta.label.toLowerCase()} you added${poured ? ', collected' : ''}`}
      accessibilityHint="Opens your entry"
      style={{ width }}>
      <View style={[styles.box, { width, height: width, backgroundColor: meta.wash }]}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={styles.photo}
            contentFit="cover"
            transition={120}
            accessible={false}
          />
        ) : (
          <DrinkArt drink={toDrink(drink)} size={Math.round(width * 0.57)} flat />
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {drink.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {drink.subcategory}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  name: {
    marginTop: space.xs,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.text,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    color: colors.textMuted,
  },
});
