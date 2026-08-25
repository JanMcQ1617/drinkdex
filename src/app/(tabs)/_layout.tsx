import { Tabs } from 'expo-router';
import React from 'react';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { TabIcon } from '@/components/icons';
import { colors, motion } from '@/constants/theme';

/**
 * Five top-level destinations, Profile last.
 *
 * Beers sits between Dex and Stats because it is the other half of the
 * catalogue: the Dex holds beer STYLES, this holds the real brands that
 * pour them, keyed by country. The bar sizes itself from
 * `state.routes.length`, so adding a fifth simply narrows every item.
 *
 * The bar itself is ours (components/FloatingTabBar.tsx) — frosted glass
 * floating clear of the bottom edge, with a pill that springs between
 * tabs. Screens must reserve `TAB_BAR_CLEARANCE` at the bottom since it
 * now floats over content instead of pushing it up.
 *
 * Icons are vector (components/icons.tsx) and change between outline and
 * solid, so the active tab reads without relying on color alone.
 */
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        /*
         * Tab screens cross-shift instead of hard-cutting. The default is
         * 'none', which swaps the scene in a single frame — the pill in
         * the bar animates and the page it points at does not, so the bar
         * reads as decoration rather than as a control.
         *
         * 'shift' slides the outgoing and incoming scenes slightly in the
         * direction of travel. It is subtle by design: this fires on
         * every tab press, and anything larger becomes tiring by the
         * twentieth switch.
         */
        animation: 'shift',
        transitionSpec: {
          animation: 'spring',
          // Matches the tab pill's spring so the bar and the page settle
          // together rather than one trailing the other.
          config: { ...motion.spring, overshootClamping: true },
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dex"
        options={{
          title: 'Dex',
          tabBarAccessibilityLabel: 'Dex, your collection',
          tabBarIcon: ({ focused }) => <TabIcon name="dex" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="beers"
        options={{
          title: 'Beers',
          tabBarAccessibilityLabel: 'Beers of the world',
          tabBarIcon: ({ focused }) => <TabIcon name="atlas" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarAccessibilityLabel: 'Stats',
          tabBarIcon: ({ focused }) => <TabIcon name="stats" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
