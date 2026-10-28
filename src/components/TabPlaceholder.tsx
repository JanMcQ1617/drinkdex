import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inkRoom } from '@/components/details/lineMarks';
import { HOME_ROW, HomeWordmark } from '@/components/home/HomeChrome';
import { colors, layout, textRole } from '@/constants/theme';

/*
 * What a lazy tab shows for the moment before its screen mounts: the page
 * and its top bar's title, set where and as the real bar sets it, so the
 * tab arrives as it will draw rather than as a blank page. Never
 * featureless: a plain white page reads as a screen that failed to load.
 *
 * Since v4.10 (specs/v4.10/spec.md T.6) that is the marker's tag,
 * `tabTitle` at 36/46, never scaled and with its ink room, for
 * Tournaments, the Dex, Saved and My Bar; `title` (Archivo 600 28/34, to
 * the bars' 1.3 cap) for Profile, whose bar will set your handle
 * (`userTitle`), and on the Reels ground.
 *
 * Home's is its wordmark, and it is HomeChrome's own (HomeWordmark, in
 * HomeChrome's 44pt row at the feed's 16 column), not a title row's: the
 * title row's 52pt height and 24 gutter would set it 3 lower and 8 in,
 * and the logo would visibly jump as the real bar replaced it.
 *
 * No swash (v4.9, specs/v4.9/details B). It drew the pen's swash under
 * a page tab's title, so the swash was already there when the real bar
 * mounted. Since v4.9 the real bar's swash draws itself in as the tab
 * arrives, starting undrawn, so a drawn one here would show drawn, then
 * blank, then drawn: the placeholder leaves it to the bar.
 *
 * No paper either, though the real pages lie on it (v4.9 A.5). With
 * `lazy` and a known width, every tab not in front shows this from
 * launch, so a full-screen paper here would be mounted in the Dock's own
 * frames to be seen for the frame or two of a first swipe before the
 * real page replaces it (in v4.9 the paper was some 32 tile views a tab).
 * And it buys nothing: the real page's Paper draws only once it has
 * measured, and the sweep is white over the top 40% of the window, where
 * this title sits. The page's own paper simply arrives with it.
 */

/** A typed title's text cap (ScreenTopBar's BAR_TEXT_SCALE_CAP). */
const TITLE_CAP = 1.3;
/** A tag title never grows (ScreenTopBar's TAB_TITLE_CAP). */
const TAG_CAP = 1;

export interface TabPlaceholderProps {
  /** The tab's name, drawn where its top bar's title will be. */
  title: string;
  /** 'page' (default), or 'reel': the Reels ground, dark for video. */
  ground?: 'page' | 'reel';
  /** Home's bar sets the wordmark, not the tab's name. */
  wordmark?: boolean;
  /** The real bar will set a title a person typed (your handle), in Archivo: so does this (ScreenTopBar's `userTitle`). */
  userTitle?: boolean;
}

export function TabPlaceholder({ title, ground = 'page', wordmark = false, userTitle = false }: TabPlaceholderProps) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const reel = ground === 'reel';
  const tag = !reel && !userTitle;
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
        <View style={styles.titleBox}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={tag ? TAG_CAP : TITLE_CAP}
            style={
              tag
                ? [textRole.tabTitle, styles.title, inkRoom('display', textRole.tabTitle.fontSize * Math.min(fontScale, TAG_CAP))]
                : [textRole.title, reel ? styles.titleReel : styles.title]
            }>
            {title}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootReel: { backgroundColor: colors.reelGround },
  /* The real bars' title row: under the status bar, the title at the gutter. */
  row: { justifyContent: 'center', paddingHorizontal: layout.gutter },
  /* The title's own box, at the gutter, as the lg bar's wrapper is. */
  titleBox: { alignSelf: 'flex-start', flexShrink: 1 },
  /* HomeChrome's row: 44 under the status bar, the column at 16, the wordmark on its foot. */
  homeRow: { height: HOME_ROW, flexDirection: 'row', alignItems: 'center', paddingLeft: layout.feedGutter },
  title: { color: colors.text },
  titleReel: { color: colors.reelInk },
});
