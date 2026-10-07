import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { DrinkName, Mount, MountWindow } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { PressableScale } from '@/components/ui';
import { CATEGORY_META, colors, stroke, textRole } from '@/constants/theme';
import { toDrink } from '@/lib/customDrinks';
import { customPhotoUri } from '@/lib/pour';
import type { CustomDrink } from '@/types';

/** The shelf's tile width. */
export const CUSTOM_TILE_WIDTH = 112;

/**
 * The mount's padding inside its 1pt edge. Not the shelf mount's own 12:
 * a 112pt tile keeps 90pt for the photo and the name (CUSTOM_TILE_WIDTH −
 * 22, spec §9.7.2), which a 12pt mat would cut to 86.
 */
const PAD = 10;
const INSET = 2 * (stroke.edge + PAD);
const CAP = 1.3;

/**
 * One drink someone added, on the Dex's "Added by you" shelf.
 *
 * Card stock lying on the cabinet front's paper: a shelf mount (mat and a
 * 1pt `line` edge) with no seat, because it is not in the lining. It is
 * NOT a Dex card: no number. A number means "the catalogue", and stamping
 * one on a custom entry would say it had joined the Dex when it has only
 * been suggested; where a card has its number plate, this one says "Added
 * by you".
 *
 * The photo is the pour's when there is one, else the one sent with the
 * suggestion, else the lit vector face, through DexCard's DrinkFace, so it
 * decodes at the window's size (enforceEarlyResizing) and not at the
 * 2048px it was taken at.
 *
 * The name never truncates (DrinkName, no line limit): the shelf row
 * aligns its tiles to the top, so one long name makes its own tile taller
 * and leaves the others as they are.
 *
 * "Collected" is said once it is in your Dex, whether or not its photo
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
  /** It is in your Dex (a photo was saved against it). */
  collected?: boolean;
  width?: number;
  onPress: (id: string) => void;
}) {
  const photo = pourPhotoUri || customPhotoUri(drink.photoFile);
  const meta = CATEGORY_META[drink.category];
  const poured = collected ?? Boolean(pourPhotoUri);
  const column = width - INSET;

  return (
    <PressableScale
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${meta.label.toLowerCase()} you added${poured ? ', collected' : ''}`}
      accessibilityHint="Opens your entry"
      style={{ width }}>
      <Mount state="mounted" size="shelf" onLining={false} style={styles.mount}>
        <MountWindow height={column} state="mounted">
          {/* toDrink returns the same object for the same record, so the face stays memoised. */}
          <DrinkFace
            drink={toDrink(drink)}
            mode="lit"
            photoUri={photo}
            width={column}
            height={column}
            style={FACE_FILL}
          />
        </MountWindow>
        <Text maxFontSizeMultiplier={CAP} style={[textRole.statusWord, styles.added]}>
          Added by you
        </Text>
        <DrinkName
          name={drink.name}
          role={textRole.miniName}
          measure={column}
          cap={CAP}
          color={colors.text}
          style={styles.name}
        />
      </Mount>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  mount: { padding: PAD },
  added: { marginTop: 7, color: colors.taupeInk },
  name: { marginTop: 2 },
});
