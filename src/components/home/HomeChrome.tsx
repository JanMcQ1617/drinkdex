import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBarButton } from '@/components/ScreenTopBar';
import { useHideOnScroll } from '@/components/ScrollChrome';
import { colors, layout, stroke, textRole } from '@/constants/theme';

/* ==================================================================== */
/* Home's top bar, floating                                             */
/*                                                                      */
/* Instagram's bar (v4.1, home-ig 2.2): the wordmark set left, then     */
/* create (+, the + window) and the Activity heart with its unread dot  */
/* on the right. 44pt tall, as Instagram's is, where every other tab's  */
/* bar is 52: Home draws its own row rather than ScreenTopBar's lg row, */
/* which is fixed at 52 with a 24 gutter. Home's column is 16 in.       */
/*                                                                      */
/* Laid over the feed rather than above it (specs/v3.1-changes.md 4.1), */
/* on the page's own white. Scroll down and the bar slides up under the */
/* status strip; scroll up anywhere and it slides back, with the 1pt    */
/* `line` rule along its foot that every other bar shows once content   */
/* runs under it. No fade of the ground: Jan removed the gradient in    */
/* build 17, and Daylight's bars are solid.                             */
/*                                                                      */
/* MOVED BY THE FINGER. Every motion here is a native-driven            */
/* interpolation of the list's own scroll (ScrollChrome): translateY    */
/* and opacity only, no timer, no Reanimated. At offset 0 every value   */
/* is the identity, so a stall would leave the bar fully drawn. While   */
/* VoiceOver runs the bar never hides (useHideOnScroll is constant 0).  */
/* ==================================================================== */

/** Home's row under the status bar (home-ig 2.1): 62 to 106 at 440 x 956. */
const ROW = 44;
/** How far the bar travels to hide: its row and the 1pt foot under it (45). */
const HIDE = ROW + stroke.edge;
/** The right end: the heart's 44pt box ends 7 in, so its 26pt glyph ends on the column's edge (424). */
const ROW_END = layout.feedGutter - (layout.hit - 26) / 2;
/** Scroll over which the bar's foot rule fades in. */
const RULE_IN = 8;
/** The wordmark grows with Larger Text only so far (specs/v3-cabinet.md 6.5). */
const WORDMARK_CAP = 1.2;

export interface HomeChromeProps {
  /** Home's list offset, from useTabScroll('index'). */
  scrollY: Animated.Value;
  /** The heart's dot: a like or a follow since Activity was last opened. */
  unread: boolean;
  onActivity: () => void;
  /** The create key: opens the + window, as the tab bar's + does. */
  onPost: () => void;
}

/**
 * The bar and the status strip, absolute over Home's list. The root
 * passes every touch that misses them to the feed underneath. Home's list
 * starts its content `insets.top + HOME_BAR_HEIGHT` down.
 */
export function HomeChrome({ scrollY, unread, onActivity, onPost }: HomeChromeProps) {
  const insets = useSafeAreaInsets();
  // 0 shown, HIDE hidden. Rebuilt each time Home regains focus, so coming back always shows the bar.
  const hide = useHideOnScroll('index', HIDE);
  const translateY = hide.interpolate({ inputRange: [0, HIDE], outputRange: [0, -HIDE] });
  // At rest there is no rule: one across the top of the stories would say the page had scrolled.
  const rule = scrollY.interpolate({ inputRange: [0, RULE_IN], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View pointerEvents="box-none" style={[styles.root, { height: insets.top + HIDE }]}>
      {/* The bar: under the strip, so it slides away beneath it. */}
      <Animated.View pointerEvents="box-none" style={[styles.bar, { top: insets.top, transform: [{ translateY }] }]}>
        <View style={styles.row}>
          <Text
            accessibilityRole="header"
            accessibilityLabel="Sipply"
            numberOfLines={1}
            maxFontSizeMultiplier={WORDMARK_CAP}
            style={[textRole.wordmark, styles.wordmark]}>
            Sipply
          </Text>
          <View style={styles.spacer} />
          <TopBarButton icon="create" label="Post a drink" onPress={onPost} />
          <TopBarButton icon="heart" label="Activity" badge={unread} onPress={onActivity} />
        </View>
        <Animated.View pointerEvents="none" style={[styles.rule, { opacity: rule }]} />
      </Animated.View>

      {/* The status strip: always the page, over the bar, and it takes the touches in its band. */}
      <View pointerEvents="auto" style={[styles.strip, { height: insets.top }]} />
    </View>
  );
}

/** The bar's height under the status bar (45): Home's list starts its content this far below insets.top. */
export const HOME_BAR_HEIGHT = HIDE;

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  /* The row and the 1pt foot under it, on the page. */
  bar: { position: 'absolute', left: 0, right: 0, height: HIDE, backgroundColor: colors.bg },
  /* The wordmark at 16 (x 16, y 67 at rest), the two keys' boxes abutting at the right: 345 · 389 · 433. */
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.feedGutter,
    paddingRight: ROW_END,
  },
  wordmark: { color: colors.text, flexShrink: 1 },
  spacer: { flex: 1 },
  /* Over the bar's 1pt foot, under the row, so it moves nothing. */
  rule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: stroke.edge, backgroundColor: colors.line },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
});
