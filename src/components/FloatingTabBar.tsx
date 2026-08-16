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
import { TabIcon, type TabName } from '@/components/icons';
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
        { scale: withSpring(focused ? 1.07 : 1, motion.spring) },
        { translateY: withSpring(focused ? -1.5 : 0, motion.spring) },
      ],
    };
  });
  return <Animated.View style={[styles.itemInner, style]}>{children}</Animated.View>;
}

export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [barW, setBarW] = useState(0);

  const count = Math.max(state.routes.length, 1);
  const itemW = barW > 0 ? (barW - BAR_PAD * 2) / count : 0;

  /*
   * A plain number, captured by the worklets below — NOT a shared value.
   * Writing a shared value during render is exactly what Reanimated warns
   * about, and it buys nothing here: the babel plugin picks `targetX` up
   * as a closure dependency, so both worklets re-run the moment the
   * active index changes.
   */
  const targetX = state.index * itemW;

  /*
   * The pill chases the target. useDerivedValue so the spring starts the
   * moment the index changes — no effect, no extra state, no frame of lag.
   */
  const x = useDerivedValue(() =>
    reduced
      ? withTiming(targetX, { duration: motion.fast })
      : withSpring(targetX, motion.spring),
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
      <GlassSurface cornerRadius={radius.xl} style={styles.bar}>
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
              <Pressable
                key={route.key}
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
    marginHorizontal: 14,
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
  itemInner: {
    alignItems: 'center',
    gap: space.xs - 1,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
});
