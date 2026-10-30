import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Print } from '@/components/cabinet';
import { Icon } from '@/components/icons';
import { ActionSheet } from '@/components/Sheet';
import { colors } from '@/constants/theme';

/* ==================================================================== */
/* The compose photo and where it comes from (layout spec 5.6)          */
/*                                                                      */
/* After picking a drink, the photo is the screen: a 4:5 print across   */
/* the column, 392 x 490 at 440. Empty, it is the wash with a camera    */
/* glyph and nothing else; one tap opens the post camera (v4.11,        */
/* components/PostCamera), whose library key keeps the two ways in as   */
/* peers, because half the time the drink was photographed before       */
/* anyone opened Sipply. The sheet below, "camera or library", is what  */
/* the tap opens when the camera is refused, so posting still works.    */
/*                                                                      */
/* The choice is the kit's ActionSheet, which runs a row only once the  */
/* sheet has gone: the camera and the library are UIKit controllers,    */
/* and iOS refuses to present one over a modal still being dismissed.   */
/* ==================================================================== */

export type PhotoSource = 'camera' | 'library';

/**
 * The 4:5 photo, or the place for it. Tapping either opens the source
 * sheet (the caller's `onPress`). The photo is decoded at its frame's
 * size, keyed by that size, since the same file may be drawn elsewhere at
 * another (check-design rule 9).
 */
export function PhotoSlot({
  uri,
  width,
  onPress,
}: {
  uri: string | null;
  width: number;
  onPress: () => void;
}) {
  const w = Math.round(width);
  const h = Math.round((width * 5) / 4);
  if (!uri) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Add a photo"
        accessibilityHint="Take one, or choose one from your library"
        style={({ pressed }) => [styles.empty, { width: w, height: h }, pressed && styles.emptyPressed]}>
        <Icon name="camera" size={32} color={colors.text} />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Your photo"
      accessibilityHint="Take another, or choose one from your library"
      style={({ pressed }) => pressed && styles.photoPressed}>
      <Print width={w} height={h}>
        <Image
          source={{ uri, cacheKey: `${uri}#${w}x${h}` }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
          accessibilityIgnoresInvertColors
          enforceEarlyResizing
        />
      </Print>
    </Pressable>
  );
}

/**
 * "Take photo" or "Choose from library", in a short sheet. `onChoose` runs
 * after the sheet has gone (see the header), so the picker it opens is
 * never refused by a sheet still on its way out.
 */
export function PhotoSourceSheet({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (source: PhotoSource) => void;
}) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      actions={[
        { label: 'Take photo', icon: 'camera', onPress: () => onChoose('camera') },
        { label: 'Choose from library', icon: 'grid', onPress: () => onChoose('library') },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  /*
   * The wash and a camera, no words (layout spec 5.6: the glyph says it, and
   * VoiceOver hears "Add a photo"): the frame the photo will fill, at its
   * size, so nothing moves when it lands.
   */
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSunk },
  emptyPressed: { backgroundColor: colors.press },
  photoPressed: { opacity: 0.85 },
});
