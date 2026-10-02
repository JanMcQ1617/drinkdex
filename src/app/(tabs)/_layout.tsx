import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type TabName } from '@/components/icons';
import { colors } from '@/constants/theme';
import { COPY } from '@/lib/reels';

/**
 * The top-level destinations: Home · Reels · Dex · Profile, with the log
 * action seated between them in the bar. While Reels is switched off
 * (EXPO_PUBLIC_REELS) its route still exists here and the bar skips it, so
 * the row is Home · Dex · + · Profile.
 *
 * Stats is not a tab. It is a report on the Dex rather than a place visited
 * every day, so it pushes from the Dex's top bar (app/stats.tsx); a sixth
 * slot would have left 57pt each under an 11pt label at 375pt.
 *
 * The bar itself is ours (components/FloatingTabBar.tsx): an opaque,
 * bordered rectangle floating clear of the bottom edge. Screens must
 * reserve `TAB_BAR_CLEARANCE` at the bottom since it floats over content
 * instead of pushing it up.
 *
 * Icons are vector (components/icons.tsx) and change between outline and
 * solid, so the active tab reads without relying on colour alone. They are
 * drawn at the size and in the colour the bar hands them, so a tab's glyph
 * and its label are always one ink: espresso when active, textMuted at
 * rest (6.13:1 on the bar's white), and their dark-bar twins on Reels.
 */
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        /*
         * An instant cut, the way UITabBarController and Instagram switch
         * tabs. The 'shift' and 'fade' presets draw each page at an opacity
         * computed from a natively driven progress value, 1 only at exactly
         * 0; a page that came to rest anywhere else was a blank cream screen
         * (specs/06-tab-switch-bug.md, cause 2). If motion ever comes back,
         * it must be translate-only: never opacity.
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
          // The scene's own ground is dark, so the instant tab cut (specs/06)
          // never shows a cream frame before the first video frame.
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
  );
}

/*
 * One renderer for every tab, called by the bar as a plain function.
 * `color as string` because the navigator types it as any ColorValue,
 * which the stock bar may pass; the only bar here is FloatingTabBar, and
 * it always passes a theme hex.
 */
function tabIcon(name: TabName) {
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
