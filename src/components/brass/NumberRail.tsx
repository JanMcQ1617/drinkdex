import React, { useMemo, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BrassPlate, formatPlateNumber } from '@/components/brass/BrassPlate';
import { haptic } from '@/components/ui';
import { colors, stroke } from '@/constants/theme';

/* ==================================================================== */
/* The number rail (graft 2)                                            */
/*                                                                      */
/* A thin brass rule down the Dex's right edge, 0001 at the top and the */
/* last number at the foot, ticked every 100 (every 500 longer). Touch  */
/* it and drag: the Dex jumps to the number under your finger, and an   */
/* engraved plate beside the finger says which ("Nº 1234"), the way     */
/* Contacts' index does for letters. 2,089 drinks in one grid is a long */
/* scroll; this is the way to the back of the book without one.         */
/*                                                                      */
/* JS responder, no animation: the plate is drawn where the finger is,  */
/* each move is a jump (the caller's scrollToIndex, no animation), and  */
/* lifting the finger leaves the grid where it was put. A tick of the   */
/* selection haptic each time the finger crosses a hundred.             */
/*                                                                      */
/* VoiceOver: one adjustable element, "Jump by number", valued with the */
/* number the grid is at; swipe up or down moves a hundred.             */
/* ==================================================================== */

/** The rule's own width, and the strip that takes the finger (with hitSlop to 44). */
const RAIL_W = 14;
const TOUCH_W = 24;
const STEP = 100;
const LONG = 500;

/** Ticks every 100 down a rail `h` tall, as one path. */
function railPath(h: number, total: number): string {
  if (h <= 0 || total <= 1) return '';
  const x = RAIL_W - 1.5;
  let d = `M${x} 0V${h}`;
  for (let v = STEP; v < total; v += STEP) {
    const y = (((v - 1) / (total - 1)) * (h - 1) + 0.5).toFixed(1);
    d += `M${x - (v % LONG === 0 ? 8 : 4)} ${y}H${x}`;
  }
  return d;
}

export const NumberRail = React.memo(function NumberRail({
  total,
  current = 1,
  onJump,
  style,
}: {
  /** The last Dex number. */
  total: number;
  /** The number the grid is at now, for VoiceOver's value. */
  current?: number;
  /** Jump the grid to this number (no animation: it is called on every move). */
  onJump: (n: number) => void;
  /** Placement: the caller pins it to the list's right edge between its bars. */
  style?: ViewStyle;
}) {
  const [h, setH] = useState(0);
  const [drag, setDrag] = useState<{ n: number; y: number } | null>(null);
  const lastHundred = useRef(-1);
  const lastN = useRef(-1);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    setH((prev) => (prev === next ? prev : next));
  };
  const path = useMemo(() => railPath(h, total), [h, total]);

  const at = (e: GestureResponderEvent) => {
    if (h <= 0) return;
    // locationY is the rail's own: every child is pointerEvents none, so the rail is always the target.
    const y = Math.max(0, Math.min(h, e.nativeEvent.locationY));
    const n = Math.max(1, Math.min(total, 1 + Math.round((y / h) * (total - 1))));
    setDrag({ n, y });
    if (n !== lastN.current) {
      lastN.current = n;
      onJump(n);
    }
    const hundred = Math.floor(n / STEP);
    if (hundred !== lastHundred.current) {
      if (lastHundred.current >= 0) haptic.select();
      lastHundred.current = hundred;
    }
  };
  const end = () => {
    setDrag(null);
    lastHundred.current = -1;
    lastN.current = -1;
  };

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const up = e.nativeEvent.actionName === 'decrement';
    const base = Math.floor((current - 1) / STEP) * STEP + 1;
    onJump(Math.max(1, Math.min(total, up ? (current > base ? base : base - STEP) : base + STEP)));
  };

  return (
    <View
      onLayout={onLayout}
      hitSlop={{ left: 12, right: 8 }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={at}
      onResponderMove={at}
      onResponderRelease={end}
      onResponderTerminate={end}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Jump by number"
      accessibilityValue={{ text: `Number ${current}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={[styles.rail, style]}>
      {h > 0 ? (
        <Svg width={RAIL_W} height={h} pointerEvents="none" style={styles.svg}>
          <Path d={path} stroke={colors.brass} strokeWidth={stroke.edge} fill="none" />
        </Svg>
      ) : null}
      {drag ? (
        <View pointerEvents="none" style={[styles.bubble, { top: drag.y - 12 }]}>
          <BrassPlate label={formatPlateNumber(drag.n)} size="lg" />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rail: { width: TOUCH_W, alignItems: 'flex-end' },
  svg: { position: 'absolute', top: 0, right: 0 },
  bubble: { position: 'absolute', right: TOUCH_W + 6 },
});
