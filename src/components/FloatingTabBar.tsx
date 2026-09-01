import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass';
import { Icon, TabIcon, type TabName } from '@/components/icons';
import { haptic } from '@/components/ui';
import { colors, fonts, motion, radius, space } from '@/constants/theme';

/* ==================================================================== */
/* Floating tab bar                                                     */
/*                                                                      */
/* Replaces the stock expo-router bar, which was an opaque slab welded  */
/* to the bottom edge with a 1px top border. Two problems with that:    */
/* it cut the page off rather than floating over it, and switching tabs */
/* was a hard cut — two icons toggling color, nothing in between.       */
/*                                                                      */
/* Here a single wine-wash pill SLIDES between tabs on a spring. One    */
/* object moving is what makes the bar feel continuous instead of       */
/* switched; two things blinking on and off never will.                 */
/*                                                                      */
/* The pill also stretches along its direction of travel and settles    */
/* back — squash-and-stretch, borrowed straight from character          */
/* animation. It is why the movement reads as weight rather than as a   */
/* value being interpolated.                                            */
/* ==================================================================== */

/**
 * Vertical space the floating bar occupies above the bottom edge.
 *
 * Tab screens must add `insets.bottom + TAB_BAR_CLEARANCE` to their
 * bottom padding — the bar floats OVER content now, so the last list row
 * would otherwise sit under frosted glass.
 */
export const TAB_BAR_CLEARANCE = 84;

/** Inner horizontal padding of the bar; the pill's track starts here. */
const BAR_PAD = 6;

/** How far the pill stretches at full travel. 18% reads; 30% is a cartoon. */
const STRETCH = 0.18;

/*
 * The centre action sits BETWEEN the tabs rather than being one of them.
 *
 * It is not a route: logging a pour is a thing you do, not a place you
 * are, and making it a fifth tab would put a permanently-unselectable
 * item in a bar whose whole job is showing where you are. So the row
 * lays out five slots for four tabs and leaves the middle one empty for
 * the button to sit in.
 *
 * Everything positional has to count SLOTS, not tabs. The travelling pill
 * skips the gap — without that, moving from Dex to Stats parks the pill
 * under the button instead of under the icon it belongs to.
 */
const FAB_SLOT = 2;

/** Slot a tab occupies once the centre gap is accounted for. */
const slotOf = (tabIndex: number) => (tabIndex < FAB_SLOT ? tabIndex : tabIndex + 1);


type TabBarIconProps = { focused: boolean; color: string; size: number };

/*
 * Structural typing on purpose: expo-router SDK 57 vendors bottom-tabs
 * with no public subpath for BottomTabBarProps, so we declare only the
 * shape we consume. Compatible with what <Tabs tabBar={…}> passes.
 */
type FloatingTabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarAccessibilityLabel?: string;
        tabBarIcon?: (props: TabBarIconProps) => React.ReactNode;
      };
    }
  >;
  navigation: {
    // Method syntax, not a property: bivariant, so it accepts the real emit.
    emit(event: {
      type: 'tabPress';
      target?: string;
      canPreventDefault: true;
    }): { defaultPrevented: boolean };
    navigate(name: string): void;
  };
};

/** One tab. The active icon scales up and lifts a hair off the baseline. */
function TabItem({
  focused,
  reduced,
  children,
}: {
  focused: boolean;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { transform: [{ scale: 1 }, { translateY: 0 }] };
    return {
      transform: [
        // Same spring as the pill, not the shared token: the icon and the
        // pill are one gesture. A pill arriving 1.7x ahead of the icon it
        // carries splits the selection into two visible beats.
        { scale: withSpring(focused ? 1.07 : 1, motion.selection) },
        { translateY: withSpring(focused ? -1.5 : 0, motion.selection) },
      ],
    };
  });
  return <Animated.View style={[styles.itemInner, style]}>{children}</Animated.View>;
}

/**
 * The centre action — a filled wine disc that breaks the top edge of the
 * bar.
 *
 * It overhangs deliberately. A button contained inside the bar reads as a
 * fifth tab drawn slightly differently; one that crosses the edge reads as
 * a different KIND of control, which is what it is. The overhang is why
 * this cannot be `overflow: hidden` anywhere up the tree.
 *
 * No label under it, unlike the tabs. The tabs are labelled because they
 * are destinations you need to recognise; a plus needs no gloss, and a
 * fifth word would rebuild the visual rhythm the overhang just broke.
 */
function CentreAction({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <View style={[styles.fabSlot, width > 0 ? { width } : null]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Log a pour"
        accessibilityHint="Opens the Dex to pick what you drank"
        hitSlop={8}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Icon name="plus" size={24} color={colors.textOnWine} />
      </Pressable>
    </View>
  );
}

export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [barW, setBarW] = useState(0);

  // One extra slot for the centre action — see FAB_SLOT.
  const slots = Math.max(state.routes.length, 1) + 1;
  const itemW = barW > 0 ? (barW - BAR_PAD * 2) / slots : 0;

  /*
   * A plain number, captured by the worklets below — NOT a shared value.
   * Writing a shared value during render is exactly what Reanimated warns
   * about, and it buys nothing here: the babel plugin picks `targetX` up
   * as a closure dependency, so both worklets re-run the moment the
   * active index changes.
   */
  const targetX = slotOf(state.index) * itemW;

  /*
   * The pill chases the target. useDerivedValue so the spring starts the
   * moment the index changes — no effect, no extra state, no frame of lag.
   */
  const x = useDerivedValue(() =>
    reduced
      ? withTiming(targetX, { duration: motion.fast })
      : withSpring(targetX, motion.selection),
  );

  /*
   * Distance still to travel drives the stretch, so it peaks mid-flight
   * and resolves to exactly 1 when the spring settles. Deriving it from
   * the lag rather than from a parallel timeline means the two can never
   * disagree — no stretched pill left behind by an interrupted gesture.
   */
  const stretch = useDerivedValue(() => {
    if (reduced || itemW === 0) return 1;
    const lag = Math.abs(targetX - x.value) / itemW;
    return 1 + Math.min(lag, 1) * STRETCH;
  });

  const pillStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { scaleX: stretch.value },
      // Conserve area: a pill that only widens looks inflated.
      { scaleY: 2 - stretch.value },
    ],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 2 }]}>
      <GlassSurface cornerRadius={radius.tab} style={styles.bar}>
        <View style={styles.row} onLayout={(e) => setBarW(Math.round(e.nativeEvent.layout.width))}>
          {itemW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.pill, { width: itemW - 6, left: BAR_PAD + 3 }, pillStyle]}
            />
          ) : null}

          {state.routes.map((route, i) => {
            const options = descriptors[route.key]?.options ?? {};
            const focused = state.index === i;
            const color = focused ? colors.wine : colors.textFaint;
            const label = (options.title ?? route.name).toUpperCase();

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                // `select`, not `tap`: changing section is a selection.
                haptic.select();
                navigation.navigate(route.name);
              }
            };

            return (
              <React.Fragment key={route.key}>
                {/*
                  Rendered BEFORE the tab that sits after the gap, so the
                  order is Home · Dex · action · Stats · Profile and the
                  empty slot the pill skips is the one this fills.
                */}
                {i === FAB_SLOT ? (
                  <CentreAction
                    width={itemW}
                    onPress={() => {
                      haptic.tap();
                      /*
                       * The Dex, because a pour is logged against an entry
                       * and this is where you pick one. There is no global
                       * compose screen to send it to yet.
                       */
                      navigation.navigate('dex');
                    }}
                  />
                ) : null}
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
                accessibilityState={{ selected: focused }}
                hitSlop={4}
                style={styles.item}>
                <TabItem focused={focused} reduced={reduced}>
                  {options.tabBarIcon?.({ focused, color, size: 24 }) ?? (
                    <TabIcon name={route.name as TabName} focused={focused} size={24} />
                  )}
                  <Text style={[styles.label, { color }]} numberOfLines={1}>
                    {label}
                  </Text>
                </TabItem>
              </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bar: {
    /*
     * The Sipply handoff specifies this bar outright: a 64pt pill inset
     * 16 from each edge, off-white at 92% over a 10px blur, hairline
     * border, `0 12px 30px rgba(43,35,34,.14)`. The material and the
     * shadow live in `glass.fill` and `elevation.raised`; the geometry is
     * here.
     */
    marginHorizontal: 16,
    minHeight: 64,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: BAR_PAD,
  },
  pill: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    borderRadius: radius.lg,
    backgroundColor: colors.wineWash,
  },
  item: {
    flex: 1,
    paddingVertical: 3,
  },

  /*
   * The slot is the same width as a tab so the five-across rhythm holds;
   * the disc inside it is bigger than the slot is tall and hangs out the
   * top. `justifyContent: center` with a negative margin rather than a
   * transform, so the layout box moves with it and the disc cannot end up
   * overlapping the icons either side at narrow widths.
   */
  fabSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
    /*
     * Its own shadow, heavier than the bar's. The disc sits above the bar
     * in the stack and needs to read as lifted off it, not printed on it.
     */
    shadowColor: colors.lockInk,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPressed: { opacity: 0.88 },
  itemInner: {
    alignItems: 'center',
    gap: space.xs - 1,
  },
  label: {
    /* The brand's letterspaced label, at tab scale. */
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 1.6,
  },
});
