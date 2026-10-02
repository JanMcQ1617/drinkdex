import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icons';
import { haptic } from '@/components/ui';
import { colors, fonts, layout, motion, stroke, type as typeScale } from '@/constants/theme';

export interface TabStripItem<K extends string> {
  key: K;
  /** Always the spoken name; drawn only without `iconOnly`. */
  label: string;
  icon?: IconName;
  /** The active glyph is drawn solid. Only for glyphs that have a solid form. */
  fillActive?: boolean;
  accessibilityLabel?: string;
}

/** The underline's share of its tab's width. */
const UNDERLINE = 0.6;

/**
 * Sections of one screen, side by side under a 1pt rule: a profile's
 * posts, reels and Dex; followers and following.
 *
 * Tabs, not a segmented control: these switch what the screen below is
 * about, and an underline on a rule is how a page divides into sections.
 * The segmented control is for a setting with two or three values.
 *
 * The active tab is told three ways: an ink underline, ink (not muted)
 * glyph or label, and in icon mode a solid glyph. The underline travels on
 * `motion.selection` (a short timing curve under Reduce Motion), and
 * because the colour and the solid glyph change at once, a spring that
 * stalls after a cold start never hides which tab is on.
 *
 * Ink, not wine: where you are is not a call to action.
 */
export function TabStrip<K extends string>({
  items,
  value,
  onChange,
  iconOnly,
  style,
}: {
  items: readonly TabStripItem<K>[];
  value: K;
  onChange: (key: K) => void;
  iconOnly?: boolean;
  style?: ViewStyle;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));

  return (
    <View
      // 'tabbar' carries iOS's TabBar trait, so VoiceOver says "tab, 1 of 3"
      // for each item; the items are selected buttons, as the app's own tab
      // bar reads.
      accessibilityRole="tabbar"
      style={[styles.strip, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {items.map((item) => {
        const active = item.key === value;
        const ink = active ? colors.text : colors.textMuted;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              // Tapping the tab you are on does nothing, not even the tick.
              if (active) return;
              haptic.select();
              onChange(item.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
            {iconOnly && item.icon ? (
              <Icon name={item.icon} size={24} color={ink} filled={active && !!item.fillActive} />
            ) : (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[styles.label, { color: ink }]}>
                {item.label}
              </Text>
            )}
          </Pressable>
        );
      })}
      {width > 0 ? <Underline index={index} count={items.length} width={width} /> : null}
    </View>
  );
}

/**
 * The active tab's underline, mounted only once the strip has a width.
 *
 * Reanimated resolves an animation in its first pass to its target, so a
 * freshly mounted underline is drawn under the active tab from its first
 * frame and only travels when the selection changes. Driven from the strip
 * itself it started at x 0 before the width was known and slid in from
 * the left edge on every appearance: an entrance, and one that a stalled
 * frame loop after a cold start would leave under the wrong tab.
 */
function Underline({ index, count, width }: { index: number; count: number; width: number }) {
  const reduced = useReducedMotion();
  const tabW = width / count;
  const lineW = tabW * UNDERLINE;

  const x = useDerivedValue(() => {
    const target = index * tabW + (tabW - lineW) / 2;
    return reduced
      ? withTiming(target, { duration: motion.fast })
      : withSpring(target, motion.selection);
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return <Animated.View pointerEvents="none" style={[styles.underline, { width: lineW }, slide]} />;
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    minHeight: layout.tabStrip,
    borderBottomWidth: stroke.edge,
    borderBottomColor: colors.line,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  itemPressed: { opacity: 0.6 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
  },
  // Laid over the rule, so the active tab's 2pt line replaces 1pt of it.
  underline: {
    position: 'absolute',
    left: 0,
    bottom: -stroke.edge,
    height: stroke.indicator,
    backgroundColor: colors.lineInk,
  },
});
