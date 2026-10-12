import { Image } from 'expo-image';
import React from 'react';
import {
  Image as RNImage,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { FACE_FILL, VectorFace } from '@/components/artwork/VectorFace';
import { DrinkName, Print } from '@/components/cabinet';
import { haptic, PressableScale } from '@/components/ui';
import { colors, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { photoFor, proofFor } from '@/data/drinkPhotos';
import type { Drink } from '@/types';

/* ==================================================================== */
/* DexCard                                                              */
/*                                                                      */
/* One cell of the Dex (layout spec 5.2): a square print and the        */
/* drink's name under it, and nothing else. Caught or not is said by    */
/* the photo itself, the idea Daylight is built on: a caught drink is a */
/* colour print with its name in ink, one you have not caught is the    */
/* grey proof of the same photo with its name in muted ink. The plate,  */
/* the tag and the lock moved to the drink page (layout principle 9).   */
/*                                                                      */
/* The name never truncates: DrinkName shrinks only a word too wide for */
/* the column, and wraps at word boundaries.                            */
/* ==================================================================== */

/** Dynamic Type cap for the card's name (spec §6.5). */
const CAP = 1.3;
/** Photo to name (layout spec 5.2: 8). */
const NAME_GAP = 8;
/** The outline a number jump draws round its tile for a moment (the judges: "outlines the tile"). */
const OUTLINE = 2;

/**
 * About how tall a card is at this width and text size with `nameLines`
 * lines of name: the square print, the gap and the lines. An estimate for a
 * list that must lay rows out before it measures them (the Dex's jump by
 * number); the card itself is laid out, never sized by this.
 */
export function dexCardHeight(cardWidth: number, fontScale: number, nameLines = 1): number {
  return Math.floor(cardWidth) + NAME_GAP + nameLines * textRole.name.lineHeight * Math.min(fontScale, CAP);
}

/*
 * Re-exported for DrinkFace callers with a frame that can grow.
 */
export { FACE_FILL };

/** Each bundled photo's file, resolved once: the stem of its per-size cache key. */
const assetUris = new Map<number, string | null>();
function assetUri(asset: number): string | null {
  let uri = assetUris.get(asset);
  if (uri === undefined) {
    uri = RNImage.resolveAssetSource(asset)?.uri ?? null;
    assetUris.set(asset, uri);
  }
  return uri;
}

/* ==================================================================== */
/* DrinkFace                                                            */
/* ==================================================================== */

export interface DrinkFaceProps {
  drink: Drink;
  /** `photo` for a drink you have (or are identifying); `proof` for one you have not. */
  mode: 'photo' | 'proof';
  /** Your pour. Photo only: a proof never shows a person's picture. */
  photoUri?: string | null;
  /**
   * The pour's storage path, when `photoUri` is a signed URL. Signed URLs
   * carry a fresh token each time they are minted, so keyed on the URL a
   * profile downloaded every photo again each session.
   */
  photoCacheKey?: string | null;
  /** The frame in points; sizes the decode and the no-photo glass. */
  width: number;
  height: number;
  /** Passed to VectorFace (the glass's size as a share of the height). */
  artScale?: number;
  /**
   * For a frame that can grow past `height`: pass FACE_FILL (exported
   * here). StyleSheet.absoluteFill keeps `width` x `height` and does not grow.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * The native crossfade from the proof to the colour print when this face
   * changes from `proof` to `photo` (white spec 5.21, "the catch"). Off
   * under Reduce Motion is the caller's: pass 0 there for a cut.
   */
  transition?: number;
}

/**
 * The picture of a drink, wherever one is framed.
 *
 *   photo  your pour, else the daylight colour print, else the no-photo face
 *   proof  the 256px grey proof, else the no-photo face
 *
 * A null `photoUri` (a logged photo that went missing) falls through to
 * the catalogue rather than leaving an empty frame.
 *
 * Disk, not memory-disk, and enforceEarlyResizing: expo-image's memory tier
 * holds the decoded bitmap, so a decode at the file's size (4 MB for a
 * 1024px print) in a 184pt tile is what filled the pool in build 12.
 * Every key carries the frame's size: SDWebImage files an early-resized
 * decode under the key it was asked for and hands it to the next view that
 * misses its own, so a bare-file key let a Dex tile's small decode become
 * the drink page's hero, soft.
 */
export const DrinkFace = React.memo(function DrinkFace({
  drink,
  mode,
  photoUri,
  photoCacheKey,
  width,
  height,
  artScale,
  style,
  transition = 140,
}: DrinkFaceProps) {
  const sizeKey = `#${Math.round(width)}x${Math.round(height)}`;
  let source: { uri: string; cacheKey: string } | number | undefined;
  if (mode === 'photo' && photoUri) {
    source = { uri: photoUri, cacheKey: `${photoCacheKey ?? photoUri}${sizeKey}` };
  } else {
    const asset = mode === 'photo' ? photoFor(drink.id) : proofFor(drink.id);
    const uri = asset === undefined ? null : assetUri(asset);
    source = uri ? { uri, cacheKey: `${uri}${sizeKey}` } : asset;
  }

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.face, { width, height }, style]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={transition}
          accessible={false}
          accessibilityIgnoresInvertColors
          cachePolicy="disk"
          enforceEarlyResizing
        />
      ) : (
        <VectorFace drink={drink} width={width} height={height} artScale={artScale} style={FACE_FILL} />
      )}
    </View>
  );
});

/* ==================================================================== */
/* DexCard                                                              */
/* ==================================================================== */

export interface DexCardProps {
  drink: Drink;
  /**
   * Width of the card itself, the exact column width, unrounded. Explicit
   * rather than `flex: 1`, so a card alone in the last row stays a cell.
   */
  cardWidth: number;
  collected: boolean;
  /** The user's own pour photo, once they have logged one. */
  userPhotoUri?: string | null;
  /** Its storage path when userPhotoUri is a signed URL (see DrinkFace). */
  userPhotoCacheKey?: string | null;
  /** Lines of name the card reserves, so the cards in a row start their names level. Default 1. */
  nameLines?: number;
  /** A 2pt ink outline round the print: the tile a typed number jumped to. */
  outlined?: boolean;
  onPress: (id: string) => void;
}

export const DexCard = React.memo(function DexCard({
  drink,
  cardWidth,
  collected,
  userPhotoUri,
  userPhotoCacheKey,
  nameLines = 1,
  outlined,
  onPress,
}: DexCardProps) {
  const { fontScale } = useWindowDimensions();
  // Floored, so two prints and the gap never outgrow the column (160.5 at 393 would round to 161).
  const side = Math.floor(cardWidth);
  const nameMin = nameLines * textRole.name.lineHeight * Math.min(fontScale, CAP);

  return (
    <PressableScale
      /*
       * No tick on touch-down, and a short delay before the press state.
       * The grid is wall-to-wall cards, so nearly every flick starts on
       * one: a flick leaves the slop inside 120ms and cancels the touch
       * before either fires; a tap still lands, and ticks on release.
       */
      noHaptic
      unstable_pressDelay={120}
      onPress={() => {
        haptic.tap();
        onPress(drink.id);
      }}
      accessibilityRole="button"
      // The spoken number is unpadded: "#0042" is read digit by digit.
      accessibilityLabel={`${drink.name}, number ${drink.dexNumber}, ${
        collected ? 'caught' : 'not caught yet'
      }`}
      style={[styles.card, { width: cardWidth }]}>
      <View>
        <Print width={side} height={side}>
          <DrinkFace
            drink={drink}
            mode={collected ? 'photo' : 'proof'}
            photoUri={collected ? userPhotoUri : null}
            photoCacheKey={collected ? userPhotoCacheKey : null}
            width={side}
            height={side}
          />
        </Print>
        {outlined ? <View pointerEvents="none" style={styles.outline} /> : null}
      </View>
      <View style={[styles.name, { minHeight: nameMin }]}>
        <DrinkName
          name={drink.name}
          role={textRole.name}
          measure={cardWidth}
          cap={CAP}
          color={collected ? colors.text : colors.textMuted}
        />
      </View>
    </PressableScale>
  );
});

/* ==================================================================== */
/* DexThumb                                                             */
/* ==================================================================== */

/** `row` is a list's thumb (the + window's 52), `mini` a smaller one (44). */
const THUMB = { row: 52, mini: 44 } as const;

/**
 * A square print for a row of drinks (the + window, My Bar's lists,
 * Activity, Stats). Always the colour print: a row of drinks is somewhere
 * you identify one, caught or not. Hidden from VoiceOver: the row it sits
 * in says the drink's name.
 */
export const DexThumb = React.memo(function DexThumb({
  drink,
  photoUri,
  size = 'row',
}: {
  drink: Drink;
  photoUri?: string | null;
  size?: 'row' | 'mini';
}) {
  const side = THUMB[size];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Print width={side} height={side}>
        <DrinkFace drink={drink} mode="photo" photoUri={photoUri} width={side} height={side} />
      </Print>
    </View>
  );
});

/* ==================================================================== */
/* EmptyArt                                                             */
/* ==================================================================== */

const FEATURE = { width: 120, height: 150 } as const;

/**
 * The picture an EmptyState draws above its title: one real catalogue
 * drink as a 120 x 150 print, `photo` or `proof`, so an empty screen shows
 * what filling it looks like. A plain node the caller passes as `art`
 * (ui.tsx must not import this file, which imports ui.tsx). Null for an
 * unknown id. Decorative: the EmptyState's own text says everything.
 */
export function EmptyArt({ drinkId, mode = 'photo' }: { drinkId: string; mode?: 'photo' | 'proof' }) {
  const drink = getDrink(drinkId);
  if (!drink) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Print width={FEATURE.width} height={FEATURE.height}>
        <DrinkFace drink={drink} mode={mode} width={FEATURE.width} height={FEATURE.height} />
      </Print>
    </View>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  /* Width comes from the `cardWidth` prop (see DexCardProps); height from the content. */
  card: {},
  name: { marginTop: NAME_GAP },
  /* The picture's ground while it decodes. */
  face: { overflow: 'hidden', backgroundColor: colors.bgSunk },
  /* Drawn over the print's own edge, so the jump's outline moves nothing. */
  outline: {
    position: 'absolute',
    top: -OUTLINE,
    left: -OUTLINE,
    right: -OUTLINE,
    bottom: -OUTLINE,
    borderWidth: stroke.ring,
    borderColor: colors.text,
  },
});

export default DexCard;
