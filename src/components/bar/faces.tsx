import { Image } from 'expo-image';
import React from 'react';
import { Pressable, Image as RNImage, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FACE_FILL, VectorFace } from '@/components/artwork/VectorFace';
import { BrassPlate } from '@/components/brass';
import { DexStatusTag, DrinkName, Mount, MountWindow } from '@/components/cabinet';
import { colors, space, stroke, textRole } from '@/constants/theme';
import { drinkPhoto, drinkPhotoGhost } from '@/data/drinkPhotos';
import { textWidth } from '@/lib/textFit';
import { useIsUnlocked } from '@/store/collection';
import type { Drink } from '@/types';

/* ==================================================================== */
/* Drink faces on My Bar                                                */
/*                                                                      */
/* A drink you can make shows its lit catalogue photo, else the lit     */
/* vector face; one ingredient away shows its ghost (the 256px unlit    */
/* photo, else the debossed vector glass). Adding the missing thing     */
/* swaps the source and expo-image's own native crossfade lights it:    */
/* the "light up" moment is an image transition, never a layout         */
/* animation. If the transition never runs the new picture simply       */
/* appears, and a vector face flips at once.                            */
/* ==================================================================== */

/** Each bundled photo's resolved file, looked up once. */
const resolved = new Map<number, string | null>();

function assetUri(asset: number): string | null {
  let uri = resolved.get(asset);
  if (uri === undefined) {
    uri = RNImage.resolveAssetSource(asset)?.uri ?? null;
    resolved.set(asset, uri);
  }
  return uri;
}

/**
 * The picture of a drink in a small frame.
 *
 * Keyed per size (`<file>#<w>x<h>`): SDWebImage 5.21.6 files an early-
 * resized decode under the file's own key and hands it to any larger
 * frame that misses its own, so a 68pt thumb's decode would have become
 * the 100pt strip's picture, soft. With a key per size no frame can be
 * given a picture made for another (see Avatar in ui.tsx).
 */
export const BarFace = React.memo(function BarFace({
  drink,
  mode,
  width,
  height,
}: {
  drink: Drink;
  mode: 'lit' | 'ghost';
  width: number;
  height: number;
}) {
  const reduced = useReducedMotion();
  const asset = mode === 'lit' ? drinkPhoto(drink.id) : drinkPhotoGhost(drink.id);
  const uri = asset == null ? null : assetUri(asset);
  const source =
    asset == null ? null : uri ? { uri, cacheKey: `${uri}#${Math.round(width)}x${Math.round(height)}` } : asset;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.face, { width, height }]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={reduced ? 0 : 140}
          accessible={false}
          cachePolicy="disk"
          enforceEarlyResizing
        />
      ) : (
        <VectorFace drink={drink} mode={mode === 'lit' ? 'lit' : 'deboss'} width={width} height={height} style={FACE_FILL} />
      )}
    </View>
  );
});

/* ==================================================================== */
/* Names that keep a row's height still                                 */
/* ==================================================================== */

/**
 * How many lines a name wraps to in `measure` at `size`, greedily by word,
 * with textFit's conservative widths (it errs long, so a row reserves at
 * least what it draws).
 */
export function nameLines(name: string, size: number, measure: number): number {
  let lines = 1;
  let line = '';
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, 'playfair', size) > measure) {
      lines++;
      line = word;
    } else {
      line = next;
    }
  }
  return lines;
}

/* ==================================================================== */
/* The strip's mount                                                    */
/* ==================================================================== */

/**
 * The strip's mount, as the Brass mock draws it on the walnut counter: a
 * 94pt square window in 8pt of mat (112 across), the cabinet's 8pt card
 * corner (Mount size="feature"), its padding taken down from 12 to the
 * mock's 8 through `style`, as MOUNT allows a caller with its own measure.
 */
export const POUR = { window: 94, padding: 8, cap: 1.3 } as const;
export const POUR_WIDTH = POUR.window + 2 * (POUR.padding + stroke.edge);

/**
 * A drink you can make now: a mount standing on the counter, lit, with
 * its brass plate, its name in Playfair, and whether it is in your Dex
 * yet. `nameHeight` is the name block every mount in the strip reserves
 * (the tallest name's lines at this text size), so a two-line name
 * scrolling in never changes the row's height mid-swipe.
 *
 * No seat shadow (onLining={false}): it stands on wood, and v3.3 casts
 * no shadow from a scrolling strip.
 */
export const PourMount = React.memo(function PourMount({
  drink,
  nameHeight,
  onOpen,
}: {
  drink: Drink;
  nameHeight: number;
  onOpen: (id: string) => void;
}) {
  const inDex = useIsUnlocked(drink.id);
  return (
    <Pressable
      onPress={() => onOpen(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, number ${drink.dexNumber}, ${inDex ? 'in your Dex' : 'not in your Dex yet'}`}
      style={({ pressed }) => [styles.pour, pressed && styles.pressed]}>
      <Mount state="mounted" size="feature" onLining={false} style={styles.pourMount}>
        <MountWindow height={POUR.window} state="mounted">
          <BarFace drink={drink} mode="lit" width={POUR.window} height={POUR.window} />
        </MountWindow>
        <View style={styles.pourPlate}>
          <BrassPlate n={drink.dexNumber} />
        </View>
        <View style={[styles.pourName, { minHeight: nameHeight }]}>
          <DrinkName
            name={drink.name}
            role={textRole.printName}
            measure={POUR.window}
            cap={POUR.cap}
            color={colors.text}
          />
        </View>
        <View style={styles.pourTag}>
          <DexStatusTag inDex={inDex} />
        </View>
      </Mount>
    </Pressable>
  );
});

/** The name block every strip mount reserves at this text size. */
export function useStripNameHeight(drinks: readonly Drink[]): number {
  const { fontScale } = useWindowDimensions();
  const s = Math.min(fontScale, POUR.cap);
  const size = (textRole.printName.fontSize ?? 16) * s;
  const lines = drinks.reduce((n, d) => Math.max(n, nameLines(d.name, size, POUR.window)), 1);
  return Math.ceil(lines * (textRole.printName.lineHeight ?? 20) * s);
}

const styles = StyleSheet.create({
  /* The picture's ground while it decodes: the colour a lit photo settles to. */
  face: { overflow: 'hidden', backgroundColor: colors.liningDeep },
  pressed: { opacity: 0.85 },

  pour: { width: POUR_WIDTH },
  pourMount: { flexGrow: 1, padding: POUR.padding },
  pourPlate: { marginTop: space.sm },
  pourName: { marginTop: 5 },
  pourTag: { marginTop: 'auto', paddingTop: space.sm, alignItems: 'flex-start' },
});
