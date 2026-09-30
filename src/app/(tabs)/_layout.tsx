import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type TabName } from '@/components/icons';
import { colors, motion } from '@/constants/theme';

/**
 * Four top-level destinations, Profile last.
 *
 * The bar itself is ours (components/FloatingTabBar.tsx) — frosted glass
 * floating clear of the bottom edge, the selected tab a filled icon in
 * wine. Screens must reserve `TAB_BAR_CLEARANCE` at the bottom since it
 * now floats over content instead of pushing it up.
 *
 * Icons are vector (components/icons.tsx) and change between outline and
 * solid, so the active tab reads without relying on color alone. They are
 * drawn at the size and in the colour the bar hands them, so each is one
 * size whichever path renders it and the same grey or wine as its own
 * label. They used to draw a resting icon in a grey lighter than the
 * caption under it: two greys in one control, and that lighter one
 * (textFaint) is 3.82:1 on the bar's own fill, a hair over the 3:1 a
 * glyph needs, with no margin left for a dark photograph showing through
 * the glass. textMuted is 5.98:1 on the same fill.
 */
export default function TabLayout() {
  const reduced = useReducedMotion();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        /*
         * Tab screens cross-shift instead of hard-cutting. The default is
         * 'none', which swaps the scene in a single frame, and a page that
         * blinks from one to the next makes the bar read as decoration
         * rather than as a control.
         *
         * 'shift' slides the outgoing and incoming scenes slightly in the
         * direction of travel. It is subtle by design: this fires on
         * every tab press, and anything larger becomes tiring by the
         * twentieth switch.
         *
         * Under Reduce Motion it is a plain crossfade. The bar's navigator
         * runs this on React Native's own Animated, which never looks at
         * the setting, so it has to be asked here — and a lateral slide on
         * every tab press is exactly what the setting is for.
         */
        animation: reduced ? 'fade' : 'shift',
        transitionSpec: reduced
          ? { animation: 'timing', config: { duration: motion.fast } }
          : {
              animation: 'spring',
              // The selection spring, the one the Dex filter chips answer
              // with: changing tab is a selection too, and the page should
              // settle at the speed the bar's own state changes, not trail
              // it on the slower general-purpose spring.
              config: { ...motion.selection, overshootClamping: true },
            },
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
        name="dex"
        options={{
          title: 'Dex',
          tabBarAccessibilityLabel: 'Dex, your collection',
          tabBarIcon: tabIcon('dex'),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarAccessibilityLabel: 'Stats',
          tabBarIcon: tabIcon('stats'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: tabIcon('profile'),
        }}
      />
    </Tabs>
  );
}

/*
 * One renderer for all four tabs, called by the bar as a plain function.
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
