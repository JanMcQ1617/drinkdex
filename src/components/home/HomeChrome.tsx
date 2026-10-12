import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { useHideOnScroll } from '@/components/ScrollChrome';
import { colors, layout, stroke, textRole } from '@/constants/theme';

/* ==================================================================== */
/* Home's top bar, floating                                             */
/*                                                                      */
/* Two elements (layout spec 5.1): the wordmark set left and the        */
/* Activity bell. The + lives in the tab bar only, and the trophy went  */
/* to Profile's •••: the bar has a title and at most one icon.          */
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

/** How far the bar travels to hide: its own height and the 1pt foot under it. */
const HIDE = layout.topBar + stroke.edge;
/** Scroll over which the bar's foot rule fades in. */
const RULE_IN = 8;

export interface HomeChromeProps {
  /** Home's list offset, from useTabScroll('index'). */
  scrollY: Animated.Value;
  /** The bell's dot: a like or a follow since Activity was last opened. */
  unread: boolean;
  onActivity: () => void;
}

/**
 * The bar and the status strip, absolute over Home's list. The root
 * passes every touch that misses them to the feed underneath. Home's list
 * starts its content `insets.top + HOME_BAR_HEIGHT` down.
 */
export function HomeChrome({ scrollY, unread, onActivity }: HomeChromeProps) {
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
        <ScreenTopBar
          title="Sipply"
          size="lg"
          inset="none"
          showRule={false}
          titleNode={
            <Text style={[textRole.wordmark, styles.wordmark]} maxFontSizeMultiplier={1.2}>
              Sipply
            </Text>
          }
          right={<TopBarButton icon="bell" label="Activity" badge={unread} onPress={onActivity} />}
        />
        <Animated.View pointerEvents="none" style={[styles.rule, { opacity: rule }]} />
      </Animated.View>

      {/* The status strip: always the page, over the bar, and it takes the touches in its band. */}
      <View pointerEvents="auto" style={[styles.strip, { height: insets.top }]} />
    </View>
  );
}

/** The bar's height under the status bar: Home's list starts its content this far below insets.top. */
export const HOME_BAR_HEIGHT = HIDE;

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  /* The row and the 1pt foot under it; ScreenTopBar's bar is solid page. */
  bar: { position: 'absolute', left: 0, right: 0, height: HIDE, backgroundColor: colors.bg },
  /* Over the bar's own transparent 1pt foot, so it moves nothing. */
  rule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: stroke.edge, backgroundColor: colors.line },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
  wordmark: { color: colors.text },
});
