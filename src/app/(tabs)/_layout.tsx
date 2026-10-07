import { Tabs } from 'expo-router';
import React from 'react';
import { type ColorValue } from 'react-native';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type IconName } from '@/components/icons';
import { ScrollChromeProvider } from '@/components/ScrollChrome';
import { colors } from '@/constants/theme';
import { COPY } from '@/lib/reels';

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
  return (
    <ScrollChromeProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          /*
           * Instant, on purpose. Build 15 tried a 24pt translate-only slide
           * (transitionSpec + sceneStyleInterpolator) and on Jan's phone it
           * stalled: the bar moved to My Bar while Dex stayed on screen for
           * seconds, stuck a few points off to the side, and the new tab
           * never came in. Any configured transition also makes BottomTabView
           * keep the tabs left of the focused one attached (specs/06 §2).
           * Instagram and iOS cut between tabs, and a cut cannot stall.
           */
          animation: 'none',
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
