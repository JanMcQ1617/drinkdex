import { TopTabs } from 'expo-router/js-top-tabs';
import React from 'react';
import { type ColorValue, Dimensions, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Rise } from '@/components/DockRise';
import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type IconName } from '@/components/icons';
import { ScrollChromeProvider } from '@/components/ScrollChrome';
import { TabPlaceholder } from '@/components/TabPlaceholder';
import { colors } from '@/constants/theme';
import { MY_BAR_ENABLED } from '@/lib/myBar';
import { COPY, REELS_ENABLED } from '@/lib/reels';

/**
 * The top-level destinations: Home · Tournaments · Dex · Saved · Profile,
 * with Reels straight after Home while it is switched on
 * (EXPO_PUBLIC_REELS), and My Bar after Saved while it is
 * (EXPO_PUBLIC_MY_BAR; off since build 22).
 *
 * THE DEX IN THE MIDDLE, TOURNAMENTS SECOND (v4.7, Jan, 23 Oct 2026;
 * specs/v4.7/spec.md 1 and its dated note). The centre slot was the +
 * until build 29, a key that opened the + window and was not a page.
 * Build 30 made it the Tournaments tab on the red key; the same day Jan
 * asked for "the dex section the middle one and the tournament where the
 * deck is", so the two pages swapped places here and nowhere else: this
 * order IS the bar's order, the pager's swipe order and the line's track
 * (FloatingTabBar draws one slot per route in the state, in order, and
 * the red key on the route named `dex`, wherever it falls). Every link
 * into either page goes by name (/dex, /board, lib/tournaments' hrefs),
 * never by index, so nothing else moved. Home stays first, so it is
 * still the page the app opens on.
 *
 * TOURNAMENTS IS A PAGE: the Friends board, which the bar draws as an
 * ordinary tab with the trophy glyph. Its route is `board`, URL /board,
 * and never /tournaments: that path is the pushed full list
 * (app/tournaments/index.tsx) and its children, which a tab at the same
 * path would collide with. No Protected guard: the page count
 * must be fixed for a build, and the tab must exist whether or not the
 * server has migrations 020 and 025 (the board says what it shows then).
 * Posting is Home's create key, and every Post key, as before.
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
 * "38 / 2,089" and Profile's "38 entries in your Dex ›".
 * Saved is one, in My Bar's old slot (Jan, 13 Oct 2026): the drinks you
 * bookmarked, kept a tap away rather than behind Settings. My Bar is one
 * too, while it is on: what you own and what you can make with it is
 * somewhere you come back to.
 *
 * THE BAR RISES ONCE, under the film's docking wordmark on a cold start
 * (v4.6, the Dock; specs/v4.6-details/spec.md, B): 8pt in the chrome
 * group with Home's keys, 160 to 520 ms after the film, its opacity
 * over 64 ms. The wrapper is here, in the `tabBar` render prop, so
 * FloatingTabBar itself stays free of Reanimated (its header): it is a
 * full-screen, touch-through layer, because the bar places itself
 * absolutely at the TabView's foot and must keep doing so inside it. On
 * the Dock's clock, which rests at 1, so at rest it is the identity.
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
        tabBar={(props: React.ComponentProps<typeof FloatingTabBar>) => (
          <Rise group="chrome" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <FloatingTabBar {...props} />
          </Rise>
        )}
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
          name="board"
          options={{
            title: 'Tournaments',
            tabBarAccessibilityLabel: 'Tournaments',
            tabBarIcon: tabIcon('trophy'),
            lazyPlaceholder: () => <TabPlaceholder title="Tournaments" />,
          }}
        />
        <TopTabs.Screen
          name="dex"
          options={{
            title: 'Dex',
            tabBarAccessibilityLabel: 'Dex, your collection',
            // The bar draws it on the red key (FloatingTabBar's DexKey); this is its fallback.
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
            // Your handle takes this place once it loads, typed by you, so the placeholder draws as that bar will (userTitle).
            lazyPlaceholder: () => <TabPlaceholder title="Profile" userTitle />,
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
