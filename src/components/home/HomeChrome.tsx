import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrassRail, RAIL } from '@/components/brass/rules';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { useHideOnScroll } from '@/components/ScrollChrome';
import { colors, layout, stroke, textRole } from '@/constants/theme';

/* ==================================================================== */
/* Home's top bar, floating                                             */
/*                                                                      */
/* Laid over the feed rather than above it (specs/v3.1-changes.md 4.1). */
/* At rest it is build 14's band exactly: the bar has no ground of its  */
/* own and sits on the head band's lining, which Home's list header     */
/* draws under it, so the wine runs unbroken from the status bar down   */
/* through the stories.                                                 */
/*                                                                      */
/* Scroll down and the bar slides up under the status strip within 45pt */
/* (its 44 and its 1pt foot). Scroll up anywhere and it slides back,    */
/* now over the feed, on solid grained lining with a 1pt liningLip rule */
/* along its foot: the "content is scrolling under me" signal every     */
/* other top bar gives. It was a fade, the lining at 94% to 72% and on  */
/* to nothing 24pt below, which let the feed show through its lower     */
/* half; Jan liked everything about the scrolled look but that gradient */
/* (build 17), so it is gone, and the strip's tail with it. The status  */
/* strip stays lining always, so the light status bar is always right;  */
/* once the bar is fully under it, the strip wears the same foot.       */
/*                                                                      */
/* THE FOOT IS A BRASS RAIL (v3.3 Brass D10): 3pt of lit brass, brass   */
/* and shade where the 1pt liningLip was, the back bar's own trim. It   */
/* rides with the bar, inside the bar's 45pt (over the row's last 2pt,  */
/* where nothing is drawn), so nothing moves by a point when it shows.  */
/*                                                                      */
/* MOVED BY THE FINGER. Every motion here is a native-driven            */
/* interpolation of the list's own scroll (ScrollChrome): translateY    */
/* and opacity only, no timer, no Reanimated, so nothing can stall half */
/* way. At offset 0 every value is the identity, so a stall, if one     */
/* ever happened, would leave the bar fully drawn. While VoiceOver runs */
/* the bar never hides (useHideOnScroll is constant 0 then): a bar slid */
/* under the strip would still be focusable.                            */
/* ==================================================================== */

/** How far the bar travels to hide: its own height and the 1pt foot under it. */
const HIDE = layout.topBar + stroke.edge;
/** Scroll over which the bar's ground and its foot fade in from nothing. */
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
   * At rest the bar's ground and its foot are off: the bar sits on the
   * band's own lining (which looks identical), and a rule across the band
   * would say the page had scrolled when it has not.
   */
  const fadeIn = scrollY.interpolate({ inputRange: [0, FADE_IN], outputRange: [0, 1], extrapolate: 'clamp' });
  /*
   * The strip's foot shows only once the bar is all the way under it.
   * With the bar out, the strip sits on the bar's own lining, and a rule
   * between them would be a seam across one top bar; as the bar's last
   * point goes under, its foot is exactly where this one appears, so the
   * rule hands over without moving.
   */
  /*
   * The strip's rail hangs just below the strip, exactly where the bar's
   * rail is when the bar has RAIL left to travel; from there on the bar's
   * rail runs under the strip and this one carries on. Faded in over the
   * last point before that handover, so the two never show as a pair.
   */
  const stripFoot = hide.interpolate({
    inputRange: [HIDE - RAIL - stroke.edge, HIDE - RAIL],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { height: insets.top + layout.topBar + stroke.edge }]}>
      {/* The bar: under the strip, so it slides away beneath it. */}
      <Animated.View pointerEvents="box-none" style={[styles.bar, { top: insets.top, transform: [{ translateY }] }]}>
        {/*
          Its scrolled ground: solid lining and the lining's grain, with the
          brass rail along the foot (as ScreenTopBar's lining bar draws once
          content runs under it), so the bar reads as one opaque object over
          a photo or paper alike: onLining on lining is 13.32:1.
        */}
        <Animated.View pointerEvents="none" style={[styles.ground, { opacity: fadeIn }]}>
          <Grain tone="lining" />
          <BrassRail />
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
        touches in its band so a bar hidden beneath it takes none. Its
        rail appears, hung under it, as the bar's goes under it (stripFoot).
      */}
      <View pointerEvents="auto" style={[styles.strip, { height: insets.top }]}>
        <Grain tone="lining" />
        <Animated.View pointerEvents="none" style={[styles.stripRail, { opacity: stripFoot }]}>
          <BrassRail inFlow />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  /* The 44pt row and the 1pt foot under it; ScreenTopBar's clear bar is the row alone. */
  bar: { position: 'absolute', left: 0, right: 0, height: layout.topBar + stroke.edge },
  ground: { ...StyleSheet.absoluteFill, backgroundColor: colors.lining },
  /* Hung just under the strip, over the top of the feed (or of the hidden bar). */
  stripRail: { position: 'absolute', left: 0, right: 0, top: '100%' },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.lining },
  wordmark: { color: colors.onLining },
});
