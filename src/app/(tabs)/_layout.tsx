import { Tabs } from 'expo-router';
import React from 'react';
import { type ColorValue, Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type IconName } from '@/components/icons';
import { ScrollChromeProvider } from '@/components/ScrollChrome';
import { colors } from '@/constants/theme';
import { COPY } from '@/lib/reels';

/** How far a page slides as tabs change, in points. Translate only. */
const TAB_NUDGE = 24;

/**
 * The top-level destinations: Home · Dex · + · My Bar · Profile, Reels
 * skipped while off; Stats pushes from the Dex. The post action is seated
 * in the bar immediately before My Bar (FloatingTabBar). While Reels is
 * switched off (EXPO_PUBLIC_REELS) its route still exists here and the bar
 * skips it; switched on, the row is Home · Reels · Dex · + · My Bar ·
 * Profile.
 *
 * Stats is not a tab. It is a report on the Dex rather than a place visited
 * every day, so it pushes from the Dex's top bar (app/stats.tsx). My Bar
 * is one: what you own and what you can make with it is somewhere you
 * come back to.
 *
 * ScrollChromeProvider sits around the navigator so the bar and every tab
 * screen share one scroll source per tab: the bar compacts as the focused
 * tab's list scrolls down (components/ScrollChrome.tsx).
 *
 * The bar itself is ours (components/FloatingTabBar.tsx): an opaque,
 * bordered rectangle floating clear of the bottom edge, which compacts
 * while a list scrolls down. Screens must reserve `TAB_BAR_CLEARANCE` at
 * the bottom, for the full bar, since it floats over content instead of
 * pushing it up.
 *
 * Icons are vector (components/icons.tsx) and change between outline and
 * solid, so the active tab reads without relying on colour alone. They are
 * drawn at the size and in the colour the bar hands them, so a tab's glyph
 * and its label are always one ink: bone when active, reelInkDim at rest
 * (5.86:1 on the espresso bar).
 */
export default function TabLayout() {
  // A settings read, not a worklet: under Reduce Motion the nudge takes 0ms.
  const reduceMotion = useReducedMotion();
  return (
    <ScrollChromeProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          /*
           * A 24pt slide, 180ms, translate ONLY. Opacity is what blanked tabs
           * (specs/06 cause 2: a native progress value that came to rest away
           * from 0 left a page at partial opacity, and the 'shift' and 'fade'
           * presets both fade). Here a progress value that stalls anywhere
           * leaves the page fully drawn, at most 24pt to one side; the
           * clamp holds it to that even if the value overshoots.
           *
           * `animation` must stay unset: BottomTabView's hasAnimation() reads
           * `animation` first and only falls back to `transitionSpec` when it
           * is undefined, so animation: 'none' would switch this off.
           *
           * Both pages move the same way, by their places in the bar (a tab
           * rests at +1 to the right of the focused one, −1 to its left):
           * going right, the incoming page slides in 24pt from the right
           * while the outgoing one slides 24pt off to the left, under it
           * (the focused scene is drawn above the rest, and every scene has
           * an opaque ground). Inline, so TypeScript infers the interpolator's
           * argument: the vendored bottom-tabs has no public subpath for it.
           *
           * Known and accepted: with any transition configured, BottomTabView
           * keeps the tabs to the LEFT of the focused one attached (activity
           * state 1, specs/06 §2). They sit under the focused scene, and
           * nothing reads their focus but useIsFocused, which is unaffected.
           */
          transitionSpec: reduceMotion
            ? { animation: 'timing', config: { duration: 0 } }
            : { animation: 'timing', config: { duration: 180, easing: Easing.out(Easing.cubic) } },
          sceneStyleInterpolator: ({ current }) => ({
            sceneStyle: {
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-TAB_NUDGE, 0, TAB_NUDGE],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          }),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            tabBarIcon: tabIcon('home'),
          }}
        />
        <Tabs.Screen
          name="reels"
          options={{
            title: COPY.label,
            tabBarAccessibilityLabel: COPY.label,
            tabBarIcon: tabIcon('reels'),
            // The scene's own ground is dark, so the tab nudge never shows a
            // cream frame before the first video frame.
            sceneStyle: { backgroundColor: colors.reelGround },
          }}
        />
        <Tabs.Screen
          name="dex"
          options={{
            title: 'Dex',
            tabBarAccessibilityLabel: 'Dex, your collection',
            tabBarIcon: tabIcon('dex'),
          }}
        />
        <Tabs.Screen
          name="bar"
          options={{
            title: 'My Bar',
            tabBarAccessibilityLabel: 'My Bar, what you can make',
            tabBarIcon: tabIcon('bottle'),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarAccessibilityLabel: 'Profile',
            // The bar draws your photo here once you are signed in; this
            // glyph is what it shows signed out.
            tabBarIcon: tabIcon('profile'),
          }}
        />
      </Tabs>
    </ScrollChromeProvider>
  );
}

/*
 * One renderer for every tab, called by the bar as a plain function.
 * `color as string` because the navigator types it as any ColorValue,
 * which the stock bar may pass; the only bar here is FloatingTabBar, and
 * it always passes a theme hex.
 */
function tabIcon(name: IconName) {
  return function renderTabIcon({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: ColorValue;
    size: number;
  }) {
    return <Icon name={name} filled={focused} color={color as string} size={size} />;
  };
}
