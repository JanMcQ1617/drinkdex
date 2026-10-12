import React, { useMemo, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { haptic } from '@/components/ui';
import { colors, radius, stroke, textRole } from '@/constants/theme';
import { formatDexNumber } from '@/data';

/* ==================================================================== */
/* The Nº rail                                                          */
/*                                                                      */
/* A hairline down the Dex's right edge, 0001 at the top and the last   */
/* number at the foot, ticked every 100 (every 500 longer), with an ink */
/* thumb that says where the grid is ("0127"). Drag it and the grid     */
/* jumps under the finger, the way Contacts' index does for letters.    */
/*                                                                      */
/* SCROLL-ONLY (the less-stuff judges). The Dex mounts this only while  */
/* its list is moving, and unmounts it a moment after it stops (a cut,  */
/* on a JS timer: no fade, so nothing can stall half drawn). At rest    */
/* the Dex shows no rail at all; the field's "type a number" is the     */
/* other way to the back of the book.                                   */
/*                                                                      */
/* JS responder, no animation: the thumb is drawn where the finger is,  */
/* each move is a jump (the caller's scrollToIndex, no animation), and  */
/* a tick of the selection haptic each time the finger crosses a        */
/* hundred.                                                             */
/*                                                                      */
/* VoiceOver: one adjustable element, "Jump by number", valued with the */
/* number the grid is at; swipe up or down moves a hundred.             */
/* ==================================================================== */

/** The strip that takes the finger (layout spec: 24 wide at x 412–436). */
const RAIL_W = 24;
/** The thumb: a 44pt-tall ink tag, so it is a finger's target on its own. */
const THUMB_H = 44;
const THUMB_W = 48;
const STEP = 100;
const LONG = 500;
/** The thumb's figures sit in a fixed tag. */
const THUMB_CAP = 1.2;

/** The hairline and its ticks, down a rail `h` tall, as one path. */
function railPath(h: number, total: number): string {
  if (h <= 0 || total <= 1) return '';
  const x = RAIL_W - 4.5;
  let d = `M${x} 0V${h}`;
  for (let v = STEP; v < total; v += STEP) {
    const y = (((v - 1) / (total - 1)) * (h - 1) + 0.5).toFixed(1);
    d += `M${x - (v % LONG === 0 ? 7 : 4)} ${y}H${x}`;
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
  /** The number the grid is at now: where the thumb rests, and VoiceOver's value. */
  current?: number;
  /** Jump the grid to this number (no animation: it is called on every move). */
  onJump: (n: number) => void;
  /** Placement: the caller pins it to the list's right edge between its bars. */
  style?: ViewStyle;
}) {
  const [h, setH] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
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
    setDrag(n);
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

  const shown = drag ?? current;
  const thumbTop = h > 0 && total > 1 ? ((shown - 1) / (total - 1)) * (h - THUMB_H) : 0;

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
          <Path d={path} stroke={colors.lineControl} strokeWidth={stroke.edge} fill="none" />
        </Svg>
      ) : null}
      {h > 0 ? (
        <View pointerEvents="none" style={[styles.thumb, { top: thumbTop }]}>
          <Text maxFontSizeMultiplier={THUMB_CAP} style={[textRole.plate, styles.thumbText]}>
            {formatDexNumber(shown).slice(1)}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rail: { width: RAIL_W },
  svg: { position: 'absolute', top: 0, right: 0 },
  /* Right-aligned to the rail, so it hangs left of the hairline over the grid's edge. */
  thumb: {
    position: 'absolute',
    right: 0,
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: radius.control,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { color: colors.onInk },
});
