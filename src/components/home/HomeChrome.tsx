import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VerticalFade } from '@/components/cabinet';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { useHideOnScroll } from '@/components/ScrollChrome';
import { colors, layout, textRole } from '@/constants/theme';

/* ==================================================================== */
/* Home's top bar, floating                                             */
/*                                                                      */
/* Laid over the feed rather than above it (specs/v3.1-changes.md 4.1). */
/* At rest it is build 14's band exactly: the bar has no ground of its  */
/* own and sits on the head band's lining, which Home's list header     */
/* draws under it, so the wine runs unbroken from the status bar down   */
/* through the stories.                                                 */
/*                                                                      */
/* Scroll down and the bar slides up under the status strip within      */
/* 68pt (its 44 and its 24pt tail). Scroll up anywhere and it slides    */
/* back, now over the feed, with no slab: the lining at 94% at its top, */
/* 72% at its foot and to nothing 24pt below, so the feed shows through */
/* its lower half while its glyphs hold AA over a white photo (5.60:1). */
/* The status strip stays lining always, so the light status bar is     */
/* always right, and a thin soft edge under it lets the feed run under. */
/*                                                                      */
/* MOVED BY THE FINGER. Every motion here is a native-driven            */
/* interpolation of the list's own scroll (ScrollChrome): translateY    */
/* and opacity only, no timer, no Reanimated, so nothing can stall      */
/* half way. At offset 0 every value is the identity, so a stall, if    */
/* one ever happened, would leave the bar fully drawn. While VoiceOver  */
/* runs the bar never hides (useHideOnScroll is constant 0 then): a bar */
/* slid under the strip would still be focusable.                       */
/* ==================================================================== */

/** How far the bar travels to hide: its own height and the tail under it. */
const HIDE = layout.topBar + layout.homeBarTail;
/** Scroll over which the bar's ground and the tails fade in from nothing. */
const FADE_IN = 24;

export interface HomeChromeProps {
  /** Home's list offset, from useTabScroll('index'). */
  scrollY: Animated.Value;
  /** The heart's dot: a like or a follow since Activity was last opened. */
  unread: boolean;
  /** The trophy shows only while the server has tournaments (migration 020). */
  showTournaments: boolean;
  /** Open invitations, for the trophy's dot. */
  pendingInvites: number;
  onPost: () => void;
  onTournaments: () => void;
  onActivity: () => void;
}

/**
 * The bar and the status strip, absolute over Home's list. The root
 * passes every touch that misses them to the feed underneath.
 */
export function HomeChrome({
  scrollY,
  unread,
  showTournaments,
  pendingInvites,
  onPost,
  onTournaments,
  onActivity,
}: HomeChromeProps) {
  const insets = useSafeAreaInsets();
  // 0 shown, HIDE hidden. Rebuilt each time Home regains focus, so coming back always shows the bar.
  const hide = useHideOnScroll('index', HIDE);
  const translateY = hide.interpolate({ inputRange: [0, HIDE], outputRange: [0, -HIDE] });
  /*
   * At rest the bar's ground and both tails are off: the bar sits on the
   * band's own lining (which looks identical), and the tails would tint the
   * top of the story circles.
   */
  const fadeIn = scrollY.interpolate({ inputRange: [0, FADE_IN], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { height: insets.top + layout.topBar + layout.homeBarTail }]}>
      {/* The bar: under the strip, so it slides away beneath it. */}
      <Animated.View pointerEvents="box-none" style={[styles.bar, { top: insets.top, transform: [{ translateY }] }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fadeIn }]}>
          <VerticalFade from={colors.homeBarTop} to={colors.homeBarFoot} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.barTail, { opacity: fadeIn }]}>
          <VerticalFade
            from={colors.homeBarFoot}
            to={colors.homeBarFoot}
            toOpacity={0}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {/*
          The wordmark is the one place the brand name is set, so it is set
          as the brand sets it: Playfair, here in bone on the lining. The
          bar's own buttons take the lining's ink from the bar. Two glyphs
          on the right reserve their width on both sides (rightSlots), so
          the wordmark stays centred whether or not the trophy shows.
        */}
        <ScreenTopBar
          title="Sipply"
          tone="lining"
          ground="clear"
          inset="none"
          rightSlots={2}
          showRule={false}
          titleNode={
            <Text style={[textRole.wordmark, styles.wordmark]} maxFontSizeMultiplier={1.2}>
              Sipply
            </Text>
          }
          left={<TopBarButton icon="plus" label="Post a drink" onPress={onPost} />}
          right={
            <>
              {showTournaments ? (
                <TopBarButton
                  icon="trophy"
                  label="Tournaments"
                  badge={pendingInvites > 0}
                  onPress={onTournaments}
                />
              ) : null}
              <TopBarButton icon="heart" label="Activity" badge={unread} onPress={onActivity} />
            </>
          }
        />
      </Animated.View>

      {/*
        The status strip: always lining, over the bar, and it takes the
        touches in its band so a bar hidden beneath it takes none. Its soft
        edge fades in with the scroll, like the bar's.
      */}
      <View pointerEvents="auto" style={[styles.strip, { height: insets.top }]}>
        <Grain tone="lining" />
        <Animated.View pointerEvents="none" style={[styles.stripTail, { top: insets.top, opacity: fadeIn }]}>
          <VerticalFade from={colors.lining} to={colors.lining} toOpacity={0} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { position: 'absolute', left: 0, right: 0, height: layout.topBar },
  barTail: { position: 'absolute', left: 0, right: 0, top: layout.topBar, height: layout.homeBarTail },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.lining },
  stripTail: { position: 'absolute', left: 0, right: 0, height: layout.homeStripTail },
  wordmark: { color: colors.onLining },
});
