import React from 'react';
import { StyleSheet, View } from 'react-native';

import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace } from '@/components/DexCard';
import { PressableScale } from '@/components/ui';
import { CATEGORY_META, colors, textRole } from '@/constants/theme';
import { toDrink } from '@/lib/customDrinks';
import { customPhotoUri } from '@/lib/pour';
import type { CustomDrink } from '@/types';

/** The row's tile width. */
const CUSTOM_TILE_WIDTH = 112;
/** Print to name, as on a Dex card. */
const NAME_GAP = 8;
const CAP = 1.3;

/**
 * One drink someone added: a square print and its name under it, as a Dex
 * card is drawn, on Dex progress's "Added by you" row and above the Dex
 * grid when a search finds one.
 *
 * NOT a Dex card, and it carries no number: a number means "the
 * catalogue", and stamping one on a custom entry would say it had joined
 * the Dex when it has only been suggested. The row's heading says whose
 * they are, so the tile does not repeat it.
 *
 * The photo is the pour's when there is one, else the one sent with the
 * suggestion, else the no-photo face, through DrinkFace, so it decodes at
 * the tile's size and not at the 2048px it was taken at. Always the colour
 * print: these have no proof.
 *
 * The name never truncates (DrinkName, no line limit); the row aligns its
 * tiles to the top, so one long name makes its own tile taller.
 *
 * "Collected" is said once it is in your Dex, whether or not its photo
 * survived: the Dex's Logged filter counts the same thing. Without
 * `collected`, a pour photo is taken as the sign of one.
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
  /** It is in your Dex (a photo was saved against it). */
  collected?: boolean;
  width?: number;
  onPress: (id: string) => void;
}) {
  const photo = pourPhotoUri || customPhotoUri(drink.photoFile);
  const meta = CATEGORY_META[drink.category];
  const poured = collected ?? Boolean(pourPhotoUri);
  const side = Math.round(width);

  return (
    <PressableScale
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${meta.label.toLowerCase()} you added${poured ? ', collected' : ''}`}
      accessibilityHint="Opens your entry"
      style={{ width }}>
      <Print width={side} height={side}>
        {/* toDrink returns the same object for the same record, so the face stays memoised. */}
        <DrinkFace drink={toDrink(drink)} mode="photo" photoUri={photo} width={side} height={side} />
      </Print>
      <View style={styles.name}>
        <DrinkName name={drink.name} role={textRole.name} measure={width} cap={CAP} color={colors.text} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  name: { marginTop: NAME_GAP },
});
