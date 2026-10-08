import { TopTabs } from 'expo-router/js-top-tabs';
import React from 'react';
import { type ColorValue, Dimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type IconName } from '@/components/icons';
import { ScrollChromeProvider } from '@/components/ScrollChrome';
import { TabPlaceholder } from '@/components/TabPlaceholder';
import { colors } from '@/constants/theme';
import { COPY, REELS_ENABLED } from '@/lib/reels';

/**
 * The top-level destinations: Home · Dex · + · My Bar · Profile, with
 * Reels between Home and the Dex while it is switched on
 * (EXPO_PUBLIC_REELS). The post action is seated in the bar immediately
 * before My Bar (FloatingTabBar); it opens a window, it is not a page.
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
 * lies over the pages (`tabBarPosition`); it is ours, an opaque, bordered
 * rectangle floating clear of the bottom edge, which compacts while a list
 * scrolls down (components/FloatingTabBar.tsx). Screens must reserve
 * `TAB_BAR_CLEARANCE` at the bottom, for the full bar, since it floats
 * over content instead of pushing it up.
 *
 * LAZY, AS BEFORE. A page mounts the first time it is focused or a drag
 * towards it starts, then stays mounted, so a cold start builds Home
 * alone: preloading the neighbours would mount the Dex grid at launch,
 * the cost the build 13 lag fix took out. Until it mounts, a page shows
 * its TabPlaceholder: its ground, grain and title, never a blank page,
 * since a tap three slots away slides past the pages between.
 *
 * Reels while off is not in the navigator at all (TopTabs.Protected
 * leaves it out of the state), so there is no page to swipe to and no
 * slot in the bar. The flag is fixed for a build, and it must be: the
 * pager rebuilds itself when its page count changes.
 *
 * Stats is not a tab. It is a report on the Dex rather than a place
 * visited every day, so it pushes from the Dex's top bar (app/stats.tsx).
 * My Bar is one: what you own and what you can make with it is somewhere
 * you come back to.
 *
 * ScrollChromeProvider sits around the navigator so the bar and every tab
 * screen share one scroll source per tab: the bar compacts as the focused
 * tab's list scrolls down (components/ScrollChrome.tsx).
 *
 * Icons are vector (components/icons.tsx) and change between outline and
 * solid, so the active tab reads without relying on colour alone. They are
 * drawn at the size and in the colour the bar hands them, so a tab's glyph
 * and its label are always one ink: bone when active, reelInkDim at rest
 * (5.86:1 on the espresso bar).
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
            lazyPlaceholder: () => <TabPlaceholder title="Home" ground="lining" />,
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
              // cream frame before the first video frame.
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
          name="bar"
          options={{
            title: 'My Bar',
            tabBarAccessibilityLabel: 'My Bar, what you can make',
            tabBarIcon: tabIcon('bottle'),
            lazyPlaceholder: () => <TabPlaceholder title="My Bar" />,
          }}
        />
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
