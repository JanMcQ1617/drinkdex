import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Grain } from '@/components/Grain';
import { colors, layout, textRole } from '@/constants/theme';

/* ==================================================================== */
/* A tab's page before it has mounted                                   */
/*                                                                      */
/* The tabs are pages of one pager ((tabs)/_layout.tsx), mounted the    */
/* first time each is reached, so launch costs Home alone (the build 13 */
/* lag fix). A page swiped or paged to before then shows this for a     */
/* moment: a tap from Home to Profile slides past the Dex and My Bar on */
/* the way. So it must be cheap and never blank: the page's own ground  */
/* and grain, and the title where its top bar will be, which is enough  */
/* to read as the page arriving rather than a white flash.              */
/*                                                                      */
/* STATIC. No timer, spinner or animation: it shows only while a page   */
/* slides past or mounts, and anything that moved would be cut off      */
/* mid-move.                                                            */
/*                                                                      */
/* NO NAVIGATION HOOKS. TabView draws it outside the route's own        */
/* context, where useIsFocused and useNavigation answer for the whole   */
/* tab navigator, not for this page. So it draws its own title row      */
/* rather than a ScreenTopBar, whose lining tone asks useIsFocused for  */
/* the status bar and would turn it light behind another tab.           */
/* ==================================================================== */

/** The title's inset from each edge: a glyph-only top bar's (ScreenTopBar: a 52pt side and 4 spare). */
const TITLE_INSET = 56;

export interface TabPlaceholderProps {
  /** The tab's name, drawn where its top bar's title will be. */
  title: string;
  /**
   * 'paper' (default): the Dex, My Bar and Profile. 'lining': Home's head
   * band, with the wordmark where its bar draws it. 'reel': the Reels
   * ground, which has no grain (nothing is grained under a video).
   */
  ground?: 'paper' | 'lining' | 'reel';
}

export function TabPlaceholder({ title, ground = 'paper' }: TabPlaceholderProps) {
  const insets = useSafeAreaInsets();
  const lining = ground === 'lining';
  const reel = ground === 'reel';
  return (
    <View
      accessible
      accessibilityLabel={`${title}, loading`}
      style={[styles.root, lining && styles.rootLining, reel && styles.rootReel]}>
      {reel ? null : <Grain tone={lining ? 'lining' : 'paper'} />}
      <View style={[styles.row, { paddingTop: insets.top, height: insets.top + layout.topBar }]}>
        {lining ? (
          // As Home's bar sets it (HomeChrome): Playfair, bone on the lining.
          <Text style={[textRole.wordmark, styles.wordmark]} maxFontSizeMultiplier={1.2}>
            Sipply
          </Text>
        ) : (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            maxFontSizeMultiplier={1.3}
            style={[textRole.barTitleLg, styles.title, reel && styles.titleReel]}>
            {title}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootLining: { backgroundColor: colors.lining },
  rootReel: { backgroundColor: colors.reelGround },
  /* The real bars' title row: under the status bar, 44pt, its title centred on the screen. */
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: TITLE_INSET,
  },
  title: { color: colors.text, textAlign: 'center' },
  titleReel: { color: colors.reelInk },
  wordmark: { color: colors.onLining },
});
