import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HOME_ROW, HomeWordmark } from '@/components/home/HomeChrome';
import { colors, layout, textRole } from '@/constants/theme';

/*
 * What a lazy tab shows for the moment before its screen mounts: the page
 * and its top bar's title, set where the real bar sets it (left, in
 * `title`), so the tab arrives as it will draw rather than as a blank
 * page. Never featureless: a plain white page reads as a screen that
 * failed to load.
 *
 * Home's is its wordmark, and it is HomeChrome's own (HomeWordmark, in
 * HomeChrome's 44pt row at the feed's 16 column), not a title row's: the
 * title row's 52pt height and 24 gutter would set it 3 lower and 8 in,
 * and the logo would visibly jump as the real bar replaced it.
 */

export interface TabPlaceholderProps {
  /** The tab's name, drawn where its top bar's title will be. */
  title: string;
  /** 'page' (default), or 'reel': the Reels ground, dark for video. */
  ground?: 'page' | 'reel';
  /** Home's bar sets the wordmark, not the tab's name. */
  wordmark?: boolean;
}

export function TabPlaceholder({ title, ground = 'page', wordmark = false }: TabPlaceholderProps) {
  const insets = useSafeAreaInsets();
  const reel = ground === 'reel';
  if (wordmark) {
    return (
      <View accessible accessibilityLabel={`${title}, loading`} style={styles.root}>
        <View style={[styles.homeRow, { marginTop: insets.top }]}>
          <HomeWordmark />
        </View>
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel={`${title}, loading`} style={[styles.root, reel && styles.rootReel]}>
      <View style={[styles.row, { paddingTop: insets.top, height: insets.top + layout.topBar }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.3}
          style={[textRole.title, reel ? styles.titleReel : styles.title]}>
          {title}
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
  /* HomeChrome's row: 44 under the status bar, the column at 16, the wordmark on its foot. */
  homeRow: { height: HOME_ROW, flexDirection: 'row', alignItems: 'center', paddingLeft: layout.feedGutter },
  title: { color: colors.text },
  titleReel: { color: colors.reelInk },
});
