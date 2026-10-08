import { Image } from 'expo-image';
import React from 'react';
import { Pressable, Image as RNImage, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FACE_FILL, VectorFace } from '@/components/artwork/VectorFace';
import { DexStatusTag, DrinkName, MOUNT, Mount, MountWindow } from '@/components/cabinet';
import { colors, radius, space, stroke, textRole } from '@/constants/theme';
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

/** The strip's window and its mount (Mount size="shelf": 12pt of mat, 1pt edge). */
export const POUR = { window: { width: 100, height: 112 }, cap: 1.3 } as const;
export const POUR_WIDTH = POUR.window.width + 2 * (MOUNT.shelf.padding + stroke.edge);

/**
 * A drink you can make now: a mount in the strip, lit, with its name in
 * Playfair and whether it is in your Dex yet. `nameHeight` is the name
 * block every mount in the strip reserves (the tallest name's lines at
 * this text size), so a two-line name scrolling in never changes the
 * row's height mid-swipe.
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
      accessibilityLabel={`${drink.name}, ${inDex ? 'in your Dex' : 'not in your Dex yet'}`}
      style={({ pressed }) => [styles.pour, pressed && styles.pressed]}>
      <Mount state="mounted" size="shelf" onLining={false} style={styles.pourMount}>
        <MountWindow height={POUR.window.height} state="mounted">
          <BarFace drink={drink} mode="lit" width={POUR.window.width} height={POUR.window.height} />
        </MountWindow>
        <View style={[styles.pourName, { minHeight: nameHeight }]}>
          <DrinkName
            name={drink.name}
            role={textRole.printName}
            measure={POUR.window.width}
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
  const lines = drinks.reduce((n, d) => Math.max(n, nameLines(d.name, size, POUR.window.width)), 1);
  return Math.ceil(lines * (textRole.printName.lineHeight ?? 20) * s);
}

/* ==================================================================== */
/* Thumbs                                                               */
/* ==================================================================== */

/**
 * A drink as a small mount with its name under it: lit (you can make it)
 * or its ghost (one ingredient away). Tapping opens the drink.
 */
export const DrinkThumb = React.memo(function DrinkThumb({
  drink,
  lit,
  size,
  onOpen,
}: {
  drink: Drink;
  lit: boolean;
  /** The mount's side in points (76 in the first group, 68 under a row). */
  size: number;
  onOpen: (id: string) => void;
}) {
  const inner = MOUNT.thumb.padding + stroke.edge;
  const face = size - 2 * inner;
  return (
    <Pressable
      onPress={() => onOpen(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${lit ? 'you can make it' : 'one ingredient away'}`}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}>
      <Mount state="mounted" size="thumb" onLining={false} style={{ width: size, height: size }}>
        <MountWindow height={face} state="mounted">
          <BarFace drink={drink} mode={lit ? 'lit' : 'ghost'} width={face} height={face} />
        </MountWindow>
      </Mount>
      <DrinkName
        name={drink.name}
        role={textRole.tileName}
        measure={size}
        cap={1.3}
        color={colors.text}
        style={styles.thumbName}
      />
    </Pressable>
  );
});

/** The tile after a group's thumbs: "6 more", or "Show fewer" once open. */
export function MoreTile({
  size,
  label,
  onPress,
  accessibilityLabel,
}: {
  size: number;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.more, { width: size, minHeight: size }, pressed && styles.morePressed]}>
      <Text maxFontSizeMultiplier={1.3} style={styles.moreText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* The picture's ground while it decodes: the colour a lit photo settles to. */
  face: { overflow: 'hidden', backgroundColor: colors.liningDeep },
  pressed: { opacity: 0.85 },

  pour: { width: POUR_WIDTH },
  pourMount: { flexGrow: 1 },
  pourName: { marginTop: 9 },
  pourTag: { marginTop: 'auto', paddingTop: space.sm, alignItems: 'flex-start' },

  thumbName: { marginTop: 6 },

  more: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.bgSunk,
  },
  morePressed: { backgroundColor: colors.slot },
  moreText: { ...textRole.helper, color: colors.textMuted, textAlign: 'center' },
});
