import { TopTabs } from 'expo-router/js-top-tabs';
import React from 'react';
import { type ColorValue, Dimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type IconName } from '@/components/icons';
import { ScrollChromeProvider } from '@/components/ScrollChrome';
import { TabPlaceholder } from '@/components/TabPlaceholder';
import { colors } from '@/constants/theme';
import { MY_BAR_ENABLED } from '@/lib/myBar';
import { COPY, REELS_ENABLED } from '@/lib/reels';

/**
 * The top-level destinations: Home · Dex · + · Saved · Profile, with
 * Reels between Home and the Dex while it is switched on
 * (EXPO_PUBLIC_REELS), and My Bar after Saved while it is
 * (EXPO_PUBLIC_MY_BAR; off since build 22). The post action is seated in
 * the bar immediately before Saved (FloatingTabBar); it opens a window,
 * it is not a page.
 *
 * PAGES YOU CAN SWIPE BETWEEN, like Instagram (Jan, build 17). The tabs
 * are expo-router's material top tabs: react-native-tab-view's TabView
 * over react-native-pager-view, which on iOS is UIKit's own paging
 * collection view. A swipe moves the page with the finger and lets go
 * into the next one or back; a tap on the bar pages across natively, or
 * cuts under Reduce Motion (`animationEnabled`). This replaces build 15's
 * rule that tabs cut: that came from a JS slide (transitionSpec on the
 * bottom tabs) that stalled halfway on Jan's phone, with the bar on My
 * Bar and the Dex stuck a few points off to the side for seconds. Here no
 * JS clock moves a page; the finger or UIKit does, and a page at rest is
 * whole.
 *
 * The bar is drawn at the bottom of the TabView, after the pager, so it
 * lies over the pages (`tabBarPosition`); it is ours, an opaque page slab
 * docked to the foot, with no rule and no shadow, and a short ink line
 * under the active tab that rides this pager's own position
 * (components/FloatingTabBar.tsx). It receives the TabView's `position`
 * and `layout` through TopTabs' props, so nothing here passes them on.
 * Screens must reserve `TAB_BAR_CLEARANCE` at the bottom, since the bar
 * lies over content instead of pushing it up.
 *
 * LAZY, AS BEFORE. A page mounts the first time it is focused or a drag
 * towards it starts, then stays mounted, so a cold start builds Home
 * alone: preloading the neighbours would mount the Dex grid at launch,
 * the cost the build 13 lag fix took out. Until it mounts, a page shows
 * its TabPlaceholder: its ground and title, never a blank page,
 * since a tap three slots away slides past the pages between.
 *
 * Reels while off is not in the navigator at all (TopTabs.Protected
 * leaves it out of the state), so there is no page to swipe to and no
 * slot in the bar; My Bar the same. Each flag is fixed for a build, and
 * it must be: the pager rebuilds itself when its page count changes.
 *
 * Dex progress (app/stats.tsx) is not a tab. It is a report on the Dex
 * rather than a place visited every day, so it pushes from the Dex's
 * "38 / 2,089" and Profile's "38 drinks in your Dex ›".
 * Saved is one, in My Bar's old slot (Jan, 13 Oct 2026): the drinks you
 * bookmarked, kept a tap away rather than behind Settings. My Bar is one
 * too, while it is on: what you own and what you can make with it is
 * somewhere you come back to.
 *
 * ScrollChromeProvider sits around the navigator so every tab screen has
 * one scroll source: Home's top bar slides away on it
 * (components/ScrollChrome.tsx).
 *
 * Icons are vector (components/icons.tsx) and change between outline and
 * solid, so the active tab reads without relying on colour alone. They are
 * drawn at the size and in the colour the bar hands them: ink when active,
 * muted at rest. The bar shows no labels; each tab's name is its
 * accessibilityLabel.
 */
export default function TabLayout() {
  const reducedMotion = useReducedMotion();
  return (
    <ScrollChromeProvider>
      <TopTabs
        tabBarPosition="bottom"
        // Typed here because the vendored navigator types its bar's props as `any`.
        tabBar={(props: React.ComponentProps<typeof FloatingTabBar>) => <FloatingTabBar {...props} />}
        // The pages side by side from the first frame, before the TabView has measured itself.
        initialLayout={{ width: Dimensions.get('window').width }}
        style={{ backgroundColor: colors.bg }}
        screenOptions={{
          lazy: true,
          lazyPreloadDistance: 0,
          swipeEnabled: true,
          // A tap pages across natively, or cuts under Reduce Motion. A swipe is the finger either way.
          animationEnabled: !reducedMotion,
          sceneStyle: { backgroundColor: colors.bg },
        }}>
        <TopTabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            tabBarIcon: tabIcon('home'),
            lazyPlaceholder: () => <TabPlaceholder title="Home" wordmark />,
          }}
        />
        <TopTabs.Protected guard={REELS_ENABLED}>
          <TopTabs.Screen
            name="reels"
            options={{
              title: COPY.label,
              tabBarAccessibilityLabel: COPY.label,
              tabBarIcon: tabIcon('reels'),
              // The page's own ground is dark, so a swipe never shows a
              // white frame before the first video frame.
              sceneStyle: { backgroundColor: colors.reelGround },
              lazyPlaceholder: () => <TabPlaceholder title={COPY.label} ground="reel" />,
            }}
          />
        </TopTabs.Protected>
        <TopTabs.Screen
          name="dex"
          options={{
            title: 'Dex',
            tabBarAccessibilityLabel: 'Dex, your collection',
            tabBarIcon: tabIcon('dex'),
            lazyPlaceholder: () => <TabPlaceholder title="Dex" />,
          }}
        />
        <TopTabs.Screen
          name="saved"
          options={{
            title: 'Saved',
            tabBarAccessibilityLabel: 'Saved',
            tabBarIcon: tabIcon('bookmark'),
            lazyPlaceholder: () => <TabPlaceholder title="Saved" />,
          }}
        />
        {/* Hidden while EXPO_PUBLIC_MY_BAR is off (lib/myBar.ts): no page, no slot. */}
        <TopTabs.Protected guard={MY_BAR_ENABLED}>
          <TopTabs.Screen
            name="bar"
            options={{
              title: 'My Bar',
              tabBarAccessibilityLabel: 'My Bar, what you can make',
              tabBarIcon: tabIcon('bottle'),
              lazyPlaceholder: () => <TabPlaceholder title="My Bar" />,
            }}
          />
        </TopTabs.Protected>
        <TopTabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarAccessibilityLabel: 'Profile',
            // The bar draws your photo here once you are signed in; this
            // glyph is what it shows signed out.
            tabBarIcon: tabIcon('profile'),
            lazyPlaceholder: () => <TabPlaceholder title="Profile" />,
          }}
        />
      </TopTabs>
    </ScrollChromeProvider>
  );
}

/*
 * One renderer for every tab, called by the bar as a plain function.
 * `color as string` because the navigator types it as any ColorValue,
 * which a stock bar may pass; the only bar here is FloatingTabBar, and it
 * always passes a theme hex. `size` is optional because material top
 * tabs type tabBarIcon without one; FloatingTabBar always passes it.
 */
function tabIcon(name: IconName) {
  return function renderTabIcon({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: ColorValue;
    size?: number;
  }) {
    return <Icon name={name} filled={focused} color={color as string} size={size} />;
  };
}
