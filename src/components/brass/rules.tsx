import React, { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { colors, radius, stroke } from '@/constants/theme';

/* ==================================================================== */
/* Brass rules: the rail, the bar spoon, the leader, the separator      */
/*                                                                      */
/* Every one is decorative (hidden from VoiceOver, untouchable) and     */
/* static: Views, or one small memoised SVG whose path is worked out    */
/* once per width. Nothing animates.                                    */
/* ==================================================================== */

/** The rail's height: 1pt lit, 1pt brass, 1pt shade. */
export const RAIL = 3;

/**
 * D10 · the brass rail under a solid top bar, where content runs under
 * it. It replaces the scroll fade (Jan, build 17: "remove the gradient at
 * the top"): 1pt railLit, 1pt brass, 1pt railShade, drawn as ONE View,
 * a brass fill between two borders. Absolute along the foot of whatever
 * holds it unless `inFlow`.
 */
export const BrassRail = React.memo(function BrassRail({
  inFlow,
  style,
}: {
  /** Laid out in the column instead of hung along the parent's foot. */
  inFlow?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.rail, !inFlow && styles.railFoot, style]}
    />
  );
});

/** The shaft's twist: one diagonal stroke every 3.2pt (the mock's period). */
const TWIST = 3.2;
const SPOON_H = 8;

/** The twisted shaft as one path: short diagonals from x0 to x1. Pure, so it is memoised by width. */
function twistPath(x0: number, x1: number): string {
  let d = '';
  for (let x = x0; x <= x1 - TWIST; x += TWIST) {
    d += `M${x.toFixed(1)} ${SPOON_H / 2 + 2}L${(x + TWIST).toFixed(1)} ${SPOON_H / 2 - 2}`;
  }
  return d;
}

/**
 * D7 · the bar-spoon twist rule beside a section head ("You can make
 * 30 ~~~~o"). Fills the rest of its row (`flex: 1`), so its width comes
 * from layout, measured once: a faint baseline, the twisted shaft, a
 * small disc at the left end and the muddler disc with a lit centre at
 * the right. At most one per section head.
 */
export const SpoonRule = React.memo(function SpoonRule({ style }: { style?: ViewStyle }) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setW((prev) => (prev === next ? prev : next));
  };
  const mid = SPOON_H / 2;
  // Ends: a 2.6pt disc at the left, a 3.6pt one at the right, the shaft between.
  const shaft = w > 20 ? twistPath(6, w - 8) : '';
  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.spoon, style]}>
      {w > 20 ? (
        <Svg width={w} height={SPOON_H}>
          <Path d={`M2 ${mid}H${w - 4}`} stroke={colors.brass} strokeOpacity={0.55} strokeWidth={stroke.edge} />
          <Path d={shaft} stroke={colors.brass} strokeWidth={1.1} strokeLinecap="round" />
          <Circle cx={2.6} cy={mid} r={1.3} fill={colors.brass} />
          <Circle cx={w - 3.6} cy={mid} r={1.8} fill={colors.brass} />
          <Circle cx={w - 3.6} cy={mid} r={0.7} fill={colors.brassLit} />
        </Svg>
      ) : null}
    </View>
  );
});

/**
 * Graft 8 · the dotted leader of a menu line ("Daiquiri ........ Nº
 * 0100"). One SVG line dashed into round dots, stretched to the row by
 * percentage, so it needs no measuring: `flex: 1` between the name and
 * the number, aligned to the name's last baseline by the caller.
 */
export const DotLeader = React.memo(function DotLeader({ style }: { style?: ViewStyle }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.leader, style]}>
      <Svg width="100%" height={3}>
        <Line
          x1={1.5}
          y1={1.5}
          x2="100%"
          y2={1.5}
          stroke={colors.brass}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeDasharray="0.01 4"
        />
      </Svg>
    </View>
  );
});

/** D15 · the 1pt brass hairline between Profile's counts, inset 6pt top and bottom. */
export const CountSeparator = React.memo(function CountSeparator() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={styles.separator}
    />
  );
});

/**
 * D18 · a sheet's brass grabber: 36 x 4, radius 1 (a cut bar, not a
 * pill), brass with a 1pt lit top. Decorative: the sheet's own gesture
 * and its Done button do the work.
 */
export const BrassGrabber = React.memo(function BrassGrabber() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={styles.grabber}
    />
  );
});

const styles = StyleSheet.create({
  rail: {
    height: RAIL,
    backgroundColor: colors.brass,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.railLit,
    borderBottomWidth: stroke.edge,
    borderBottomColor: colors.railShade,
  },
  railFoot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  spoon: { flex: 1, height: SPOON_H, justifyContent: 'center' },
  leader: { flex: 1, height: 3, marginHorizontal: 4 },
  separator: {
    width: stroke.edge,
    alignSelf: 'stretch',
    marginVertical: 6,
    backgroundColor: colors.brass,
    opacity: 0.6,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.none + 1,
    backgroundColor: colors.brass,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.brassLit,
  },
});
