import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, textRole } from '@/constants/theme';

/*
 * What a lazy tab shows for the moment before its screen mounts: the page
 * and its top bar's title, set where the real bar sets it (left, in
 * `title`; Home's wordmark in Playfair), so the tab arrives as it will
 * draw rather than as a blank page. Never featureless: a plain white page
 * reads as a screen that failed to load.
 */

export interface TabPlaceholderProps {
  /** The tab's name, drawn where its top bar's title will be. */
  title: string;
  /** 'page' (default), or 'reel': the Reels ground, dark for video. */
  ground?: 'page' | 'reel';
  /** Home's bar sets the Playfair wordmark, not the tab's name. */
  wordmark?: boolean;
}

export function TabPlaceholder({ title, ground = 'page', wordmark = false }: TabPlaceholderProps) {
  const insets = useSafeAreaInsets();
  const reel = ground === 'reel';
  return (
    <View accessible accessibilityLabel={`${title}, loading`} style={[styles.root, reel && styles.rootReel]}>
      <View style={[styles.row, { paddingTop: insets.top, height: insets.top + layout.topBar }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={wordmark ? 1.2 : 1.3}
          style={[wordmark ? textRole.wordmark : textRole.title, reel ? styles.titleReel : styles.title]}>
          {wordmark ? 'Sipply' : title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootReel: { backgroundColor: colors.reelGround },
  /* The real bars' title row: under the status bar, the title at the gutter. */
  row: { justifyContent: 'center', paddingHorizontal: layout.gutter },
  title: { color: colors.text },
  titleReel: { color: colors.reelInk },
});
