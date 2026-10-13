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
import { colors, radius, space, stroke, textRole } from '@/constants/theme';
import { formatDexNumber } from '@/data';

import { stopOf, stopSpot, type RailSpot } from './dexRows';

/* ==================================================================== */
/* The Nº rail, For you (v4.2 §2.5, frame `hidden`)                     */
/*                                                                      */
/* The For-you grid is not in number order until Everything else, so    */
/* its rail is the Nº rail with the sections on top: one stop per       */
/* section (44pt each, a 1.5pt control tick), a 12pt gap, then the      */
/* hairline for Everything else, 0001 to the last number, ticked every  */
/* 100 (every 500 longer) as components/NumberRail draws it. The ink    */
/* thumb reads the section's name while a section is under the bar      */
/* ("Fruity"; the tag grows left to fit) and "0412" once Everything     */
/* else is. Drag onto a stop and the grid jumps to that section's head; */
/* below the stops it jumps by number within Everything else.           */
/*                                                                      */
/* The same rules as NumberRail: scroll-only (the Dex mounts it while   */
/* the grid moves and cuts it on a JS timer), a JS responder with no    */
/* animation, every move a jump, a selection tick at each stop and each */
/* hundred. A flat For-you result has no rail at all: it is in no order */
/* a rail could name.                                                   */
/*                                                                      */
/* One spot says where the grid is: a stop as -(index + 1), a number as */
/* itself (dexRows' RailSpot, which the Dex's top-of-grid signal        */
/* holds).                                                              */
/*                                                                      */
/* VoiceOver: one adjustable element; its values are the section names, */
/* then the numbers ("Number 412"); swipe up or down moves a section,   */
/* then a hundred.                                                      */
/* ==================================================================== */

/** The strip that takes the finger: NumberRail's 24 at x 412–436. */
const RAIL_W = 24;
const THUMB_H = 44;
const THUMB_MIN_W = 48;
/** The room a section's name may take, right to left from the rail's edge. */
const THUMB_SLOT_W = 280;
/** A section's stop, and the air between the stops and the hairline. */
const STOP = 44;
const STOP_GAP = space.md;
/** The stops' ticks: 1.5pt, as long as a hundred's long tick. */
const STOP_TICK = 1.5;
const STEP = 100;
const LONG = 500;
/** The thumb's words sit in a fixed tag. */
const THUMB_CAP = 1.2;

/** The Everything-else hairline from `top` down to `h`, ticked every hundred, as one path. */
function linePath(top: number, h: number, total: number): string {
  const len = h - top;
  if (len <= 0 || total <= 1) return '';
  const x = RAIL_W - 4.5;
  let d = `M${x} ${top}V${h}`;
  for (let v = STEP; v < total; v += STEP) {
    const y = (top + ((v - 1) / (total - 1)) * (len - 1) + 0.5).toFixed(1);
    d += `M${x - (v % LONG === 0 ? 7 : 4)} ${y}H${x}`;
  }
  return d;
}

/** The stops' ticks, one at the middle of each stop. */
function stopsPath(count: number): string {
  const x = RAIL_W - 4.5;
  let d = '';
  for (let i = 0; i < count; i++) d += `M${x - 7} ${i * STOP + STOP / 2}H${x}`;
  return d;
}

export const ForYouRail = React.memo(function ForYouRail({
  stops,
  total,
  current,
  onStop,
  onJump,
  style,
}: {
  /** The sections' names, in page order. */
  stops: readonly string[];
  /** The last Dex number. */
  total: number;
  /** Where the grid is now: where the thumb rests, and VoiceOver's value. */
  current: RailSpot;
  /** Jump the grid to this section's head. */
  onStop: (index: number) => void;
  /** Jump the grid to this number within Everything else (no animation: it is called on every move). */
  onJump: (n: number) => void;
  style?: ViewStyle;
}) {
  const [h, setH] = useState(0);
  const [drag, setDrag] = useState<RailSpot | null>(null);
  const lastSpot = useRef<RailSpot | null>(null);
  const lastTick = useRef<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    setH((prev) => (prev === next ? prev : next));
  };

  const count = stops.length;
  /** Where the hairline starts: under the stops and their gap. */
  const lineTop = count > 0 ? count * STOP + STOP_GAP : 0;
  const lineLen = Math.max(0, h - lineTop);
  const line = useMemo(() => linePath(lineTop, h, total), [lineTop, h, total]);
  const ticks = useMemo(() => stopsPath(count), [count]);

  const spotAt = (y: number): RailSpot => {
    // The gap belongs half to the last stop and half to the hairline.
    if (count > 0 && y < count * STOP + STOP_GAP / 2) {
      return stopSpot(Math.max(0, Math.min(count - 1, Math.floor(y / STOP))));
    }
    if (lineLen <= 0) return 1;
    const along = Math.max(0, Math.min(lineLen, y - lineTop));
    return Math.max(1, Math.min(total, 1 + Math.round((along / lineLen) * (total - 1))));
  };

  /* A tick at each stop and each hundred, never on the first touch. */
  const tickFor = (spot: RailSpot) => (spot < 0 ? spot : Math.floor(spot / STEP));

  const at = (e: GestureResponderEvent) => {
    if (h <= 0) return;
    // locationY is the rail's own: every child is pointerEvents none, so the rail is always the target.
    const spot = spotAt(Math.max(0, Math.min(h, e.nativeEvent.locationY)));
    setDrag(spot);
    if (spot !== lastSpot.current) {
      lastSpot.current = spot;
      if (spot < 0) onStop(stopOf(spot));
      else onJump(spot);
    }
    const tick = tickFor(spot);
    if (tick !== lastTick.current) {
      if (lastTick.current !== null) haptic.select();
      lastTick.current = tick;
    }
  };
  const end = () => {
    setDrag(null);
    lastSpot.current = null;
    lastTick.current = null;
  };

  /* Swipe down: the next stop, then the hundreds. Swipe up: back the same way. */
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const down = e.nativeEvent.actionName === 'increment';
    if (current < 0) {
      const i = stopOf(current);
      if (down) {
        if (i + 1 < count) onStop(i + 1);
        else onJump(1);
      } else if (i > 0) {
        onStop(i - 1);
      }
      return;
    }
    const base = Math.floor((current - 1) / STEP) * STEP + 1;
    if (down) {
      onJump(Math.min(total, base + STEP));
      return;
    }
    if (current > base) onJump(base);
    else if (base > 1) onJump(base - STEP);
    else if (count > 0) onStop(count - 1);
  };

  const shown = drag ?? current;
  const inStop = shown < 0 && count > 0;
  const thumbTop = inStop
    ? Math.min(count - 1, stopOf(shown)) * STOP
    : h > 0 && total > 1
      ? lineTop + ((Math.max(1, shown) - 1) / (total - 1)) * Math.max(0, lineLen - THUMB_H)
      : 0;
  const thumbWords = inStop ? stops[Math.min(count - 1, stopOf(shown))]! : formatDexNumber(Math.max(1, shown)).slice(1);
  const value = current < 0 && count > 0 ? stops[Math.min(count - 1, stopOf(current))]! : `Number ${Math.max(1, current)}`;

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
      accessibilityLabel="Jump by section or number"
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={[styles.rail, style]}>
      {h > 0 ? (
        <Svg width={RAIL_W} height={h} pointerEvents="none" style={styles.svg}>
          {count > 0 ? <Path d={ticks} stroke={colors.lineControl} strokeWidth={STOP_TICK} fill="none" /> : null}
          <Path d={line} stroke={colors.lineControl} strokeWidth={stroke.edge} fill="none" />
        </Svg>
      ) : null}
      {h > 0 ? (
        <View pointerEvents="none" style={[styles.thumbSlot, { top: thumbTop }]}>
          <View style={styles.thumb}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={THUMB_CAP}
              style={[inStop ? textRole.statusWord : textRole.plate, styles.thumbText]}>
              {thumbWords}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rail: { width: RAIL_W },
  svg: { position: 'absolute', top: 0, right: 0 },
  /*
   * Right-aligned to the rail, so the tag hangs left of the hairline over
   * the grid's edge and grows left to fit a name. The slot is wide on
   * purpose: an absolute child of a 24pt column is measured at most 24
   * wide, which would cut "Fruity" to its first letter.
   */
  thumbSlot: {
    position: 'absolute',
    right: 0,
    width: THUMB_SLOT_W,
    height: THUMB_H,
    alignItems: 'flex-end',
  },
  thumb: {
    minWidth: THUMB_MIN_W,
    height: THUMB_H,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { color: colors.onInk },
});
