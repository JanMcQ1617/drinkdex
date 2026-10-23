import { useIsFocused } from 'expo-router';
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/Wordmark';
import { DockSlot, Rise } from '@/components/DockRise';
import { TopBarButton } from '@/components/ScreenTopBar';
import { useHideOnScroll } from '@/components/ScrollChrome';
import { colors, layout, stroke } from '@/constants/theme';

/* ==================================================================== */
/* Home's top bar, floating                                             */
/*                                                                      */
/* Instagram's bar (v4.1, home-ig 2.2): the wordmark set left, in       */
/* Campari (v4.5, the logo; brand/Wordmark), then create (+, the +      */
/* window) and the Activity heart with its unread dot (the accent since */
/* v4.4; TopBarButton's badge) on the right. The two reds are the bar's */
/* only colour. 44pt tall, as Instagram's is, where every other tab's   */
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
/*                                                                      */
/* THE DOCK LANDS HERE (v4.6; specs/v4.6-details/spec.md, B). On a cold */
/* start the film's wordmark flies into this bar's: the wordmark sits   */
/* in a DockSlot, which registers where it is drawn and keeps it hidden */
/* until the flying one lands on it (600 ms), and the two keys rise 8pt */
/* in the chrome group (160 to 520 ms; their opacity over 64 ms, so the */
/* + and the Activity dot are never a pink wash). The slot is here, not */
/* inside HomeWordmark, because the tab's placeholder draws HomeWordmark*/
/* too and must not be a destination. Both are Reanimated wrappers on   */
/* the Dock's clock, which rests at 1, so at rest they are the identity */
/* and the scroll's native-driven motion above them is unchanged.       */
/* ==================================================================== */

/** Home's row under the status bar (home-ig 2.1): 62 to 106 at 440 x 956. */
export const HOME_ROW = 44;
const ROW = HOME_ROW;
/** How far the bar travels to hide: its row and the 1pt foot under it (45). */
const HIDE = ROW + stroke.edge;
/** The right end: the heart's 44pt box ends 7 in, so its 26pt glyph ends on the column's edge (424). */
const ROW_END = layout.feedGutter - (layout.hit - 26) / 2;
/** Scroll over which the bar's foot rule fades in. */
const RULE_IN = 8;
/*
 * The wordmark: 42pt tall, which puts its x-height at 14.7, Playfair 28's,
 * so the tagged name has the presence the set one had (specs/v4.5-logo/
 * scribble/notes.md, App size). The box holds the l's loop above and the
 * swash and its drip below, so it is nearly the row: it sits on the row's
 * foot (64 to 106 at rest), which centres its x-height on the keys'
 * glyphs (83.4 against 84) and keeps the drip's bead (105.8) inside the
 * bar, clear of the 1pt rule that shows under it on scroll and 9 above
 * the story rings (115). Nothing of it hangs into the feed.
 *
 * So it grows with Larger Text only until it fills the row, 44/42 (the
 * other wordmarks cap at 1.2): any taller and its loop would slide under
 * the status strip or its drip over the rule. The row is a fixed 44,
 * because the list's spacer (HOME_BAR_HEIGHT) is.
 */
export const HOME_WORDMARK = 42;
const HOME_WORDMARK_CAP = ROW / HOME_WORDMARK;

/**
 * Home's wordmark as the bar sets it, for the bar and for the tab's
 * placeholder (TabPlaceholder), which must draw it to the point.
 */
export function HomeWordmark() {
  return <Wordmark height={HOME_WORDMARK} cap={HOME_WORDMARK_CAP} header lead style={styles.wordmark} />;
}

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
  /*
   * A Dock destination only while Home is the tab on screen. A cold-start
   * notification tap routes during the film (a drink page pushed over the
   * tabs, Activity, the Dex), and Home stays mounted under it: the film's
   * wordmark must not fly into a covered bar (lib/introDock, PRIORITY).
   */
  const focused = useIsFocused();

  return (
    <View pointerEvents="box-none" style={[styles.root, { height: insets.top + HIDE }]}>
      {/* The bar: under the strip, so it slides away beneath it. */}
      <Animated.View pointerEvents="box-none" style={[styles.bar, { top: insets.top, transform: [{ translateY }] }]}>
        <View style={styles.row}>
          {/* `lead`: HomeWordmark is set with Wordmark's lead, which the measure takes back out. */}
          <DockSlot id="home" lead enabled={focused} style={styles.wordmark}>
            <HomeWordmark />
          </DockSlot>
          <View style={styles.spacer} />
          <Rise group="chrome" style={styles.keys}>
            <TopBarButton icon="create" label="Post a drink" onPress={onPost} />
            <TopBarButton icon="heart" label="Activity" badge={unread} onPress={onActivity} />
          </Rise>
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
  /* The wordmark's letters at 16 (its box at 13.7, y 64 at rest), the two keys' boxes abutting at the right: 345 · 389 · 433. */
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.feedGutter,
    paddingRight: ROW_END,
  },
  /* On the row's foot. `lead` moves it out by the s's tail so the s's body is what stands on the 16 column. */
  wordmark: { alignSelf: 'flex-end' },
  spacer: { flex: 1 },
  /* The two keys as one group for the Dock's rise, abutting as they did in the row. */
  keys: { flexDirection: 'row' },
  /* Over the bar's 1pt foot, under the row, so it moves nothing. */
  rule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: stroke.edge, backgroundColor: colors.line },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
});
