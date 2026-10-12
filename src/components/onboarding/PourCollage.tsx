import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Seal } from './Guide';
import { BODY_PAD, BODY_TOP, POUR_TOP, SEAL, type Geometry } from './metrics';
import { EASE_IO, EASE_OUT, T, useSettled } from './motion';
import { DrinkPrint } from './Photo';

/* ==================================================================== */
/* "Let me pour your first picks…"                                      */
/*                                                                      */
/* Imprint's plan building (study 3.6) with the drinks the recommender  */
/* is weighing: the photographed top of the scored pool (collage()),    */
/* round the seal (m19, spec 7.1):                                      */
/*                                                                      */
/*      0  the seal leaves the narration slot for the centre, 96pt      */
/*   +200  the best of them pops at the centre-top, 0.6 to 1, a spring   */
/*   +700  eleven more pop round the seal, 70ms apart, while the group   */
/*         pulls back from 1.12 to 1 (to +1800)                          */
/*  +2000  the burst: the group to 1.14 in 270ms (frame t3)              */
/*  +2600  the step resolves into the picks (m20, the flow's clock)      */
/*                                                                      */
/* The seal keeps an 8pt page collar, so no print crosses it. Each pop   */
/* and the group's scale are redrawn plain when they should be done;     */
/* pops are mounted on their turn, never hidden until it. Under Reduce   */
/* Motion the collage is all there at once, at rest.                    */
/*                                                                      */
/* LEAVING (m20). The picks' prints are flown to their rows by copies   */
/* the results step draws; here those cells fade (120ms) under the       */
/* copies, every other print flies outward x1.5 and fades (240ms), and   */
/* the seal goes, because the results' seal flies back from where it    */
/* sat. The flow removes this layer 420ms in, whatever has finished.    */
/* ==================================================================== */

/** The twelve cells (index.html's COLLAGE), as offsets of their centres from the collage's centre, and sizes. */
export const CELLS: readonly { dx: number; dy: number; w: number }[] = [
  { dx: -120, dy: -160, w: 120 },
  { dx: 0, dy: -204, w: 96 },
  { dx: 120, dy: -160, w: 120 },
  { dx: -156, dy: -36, w: 104 },
  { dx: 152, dy: -32, w: 112 },
  { dx: -120, dy: 88, w: 120 },
  { dx: 0, dy: 140, w: 96 },
  { dx: 122, dy: 98, w: 124 },
  { dx: -44, dy: 244, w: 88 },
  { dx: 68, dy: 248, w: 104 },
  { dx: -148, dy: 208, w: 96 },
  { dx: 166, dy: 214, w: 84 },
];
/** Which cell each of collage()'s ids takes, best first: the centre-top, then round the seal. */
export const POP_ORDER: readonly number[] = [1, 2, 4, 7, 11, 9, 6, 8, 10, 5, 3, 0];
export const COLLAGE_SIZE = POP_ORDER.length;

/** The collage's extent round its centre: 416 wide, 252 above it and 300 below. */
const SPAN_W = 416;
const SPAN_UP = 252;
const SPAN_H = 552;
/** The group's scale at the end of the burst, which the reveal's copies start from. */
export const BURST = 1.14;
const PULLED = 1.12;
const COLLAR = 8;

const FIRST_POP_AT = 200;
const POPS_AT = 700;
const POP_EVERY = 70;
const PULL_MS = 1100;
const BURST_AT = 2000;
const BURST_MS = 270;
const POP_MS = 300;
/** When the flow resolves the step (m20). */
export const POUR_MS = 2600;

export interface PourGeometry {
  /** The collage scaled to fit this phone (1 at 440 x 956). */
  scale: number;
  cx: number;
  cy: number;
  seal: number;
  /** The narration slot's centre, where the seal starts and the results' seal returns. */
  slotCy: number;
}

export function pourGeometry(geo: Geometry): PourGeometry {
  const top = geo.top + POUR_TOP;
  const room = geo.height - top - geo.base - 8;
  const scale = Math.max(0.5, Math.min(1, (geo.width - 24) / SPAN_W, room / SPAN_H));
  return {
    scale,
    cx: geo.width / 2,
    cy: top + SPAN_UP * scale,
    seal: Math.round(SEAL.pour * scale),
    slotCy: geo.top + BODY_TOP + BODY_PAD + SEAL.B / 2,
  };
}

/** A cell's print in the step's coordinates at group scale `g`: its centre and drawn size. */
export function cellRect(pg: PourGeometry, cell: number, g: number): { cx: number; cy: number; size: number } {
  const c = CELLS[cell]!;
  return { cx: pg.cx + c.dx * pg.scale * g, cy: pg.cy + c.dy * pg.scale * g, size: c.w * pg.scale * g };
}

/** The decode size of a cell: its layout size, before the group's scale. */
export function cellDecode(pg: PourGeometry, cell: number): number {
  return Math.round(CELLS[cell]!.w * pg.scale);
}

type Leave = 'out' | 'fade' | null;

const HIDDEN: ViewStyle = { opacity: 0 };
const REST: ViewStyle = { opacity: 1, transform: [{ scale: 1 }] };

function Cell({ id, cell, pg, leave }: { id: string; cell: number; pg: PourGeometry; leave: Leave }) {
  const reduce = useReducedMotion();
  const c = CELLS[cell]!;
  const size = cellDecode(pg, cell);
  const pop = useSharedValue(reduce ? 1 : 0.6);
  const go = useSharedValue(0);
  const popped = useSettled('pop', reduce ? 0 : POP_MS + T.settle);
  const gone = useSettled(leave ?? 'stay', leave ? (leave === 'out' ? 240 : 120) + T.settle : 0);

  useEffect(() => {
    if (!reduce) pop.set(withSpring(1, { damping: 12, stiffness: 200 }));
  }, [reduce, pop]);

  useEffect(() => {
    if (leave) go.set(withTiming(1, { duration: leave === 'out' ? 240 : 120, easing: EASE_OUT }));
  }, [leave, go]);

  const out = leave === 'out' ? 0.5 : 0;
  const ox = c.dx * pg.scale * out;
  const oy = c.dy * pg.scale * out;
  const anim = useAnimatedStyle(() => ({
    opacity: 1 - go.value,
    transform: [{ translateX: ox * go.value }, { translateY: oy * go.value }, { scale: pop.value }],
  }));

  // The JS end states: gone once its leave is over, at rest once its pop is.
  const plain = leave ? (gone || reduce ? HIDDEN : null) : popped || reduce ? REST : null;

  return (
    <Animated.View
      style={[
        styles.cell,
        { left: c.dx * pg.scale - size / 2, top: c.dy * pg.scale - size / 2, width: size, height: size },
        plain ?? anim,
      ]}>
      <DrinkPrint id={id} size={size} />
    </Animated.View>
  );
}

export function PourCollage({
  geo,
  ids,
  leaving,
}: {
  geo: Geometry;
  /** collage(answers, 12): photographed, best first. */
  ids: readonly string[];
  /** Set as the step resolves: the picks whose prints the results' copies take over. */
  leaving: ReadonlySet<string> | null;
}) {
  const reduce = useReducedMotion();
  const pg = pourGeometry(geo);
  const [popped, setPopped] = useState(reduce ? COLLAGE_SIZE : 0);
  const shown = reduce ? COLLAGE_SIZE : popped;

  const g = useSharedValue(reduce ? 1 : PULLED);
  const seal = useSharedValue(reduce ? 1 : 0);
  const burst = useSettled('burst', reduce ? 0 : BURST_AT + BURST_MS + T.settle);
  const landed = useSettled('landed', reduce ? 0 : 360 + T.settle);

  useEffect(() => {
    if (reduce) return;
    const timers = POP_ORDER.map((_, k) =>
      setTimeout(() => setPopped(k + 1), k === 0 ? FIRST_POP_AT : POPS_AT + (k - 1) * POP_EVERY),
    );
    g.set(
      withSequence(
        withDelay(POPS_AT, withTiming(1, { duration: PULL_MS, easing: EASE_IO })),
        withDelay(BURST_AT - POPS_AT - PULL_MS, withTiming(BURST, { duration: BURST_MS, easing: EASE_OUT })),
      ),
    );
    seal.set(withSpring(1, { damping: 18, stiffness: 180 }));
    return () => timers.forEach(clearTimeout);
  }, [reduce, g, seal]);

  const groupAnim = useAnimatedStyle(() => ({ transform: [{ scale: g.value }] }));
  const fromY = pg.slotCy - pg.cy;
  const fromScale = SEAL.B / pg.seal;
  const sealAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: fromY * (1 - seal.value) }, { scale: fromScale + (1 - fromScale) * seal.value }],
  }));

  const sealSide = pg.seal + 2 * COLLAR;

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[styles.group, { left: pg.cx, top: pg.cy }, reduce ? null : burst ? { transform: [{ scale: BURST }] } : groupAnim]}>
        {POP_ORDER.slice(0, Math.min(shown, ids.length)).map((cell, k) => {
          const id = ids[k]!;
          const leave: Leave = leaving ? (leaving.has(id) ? 'fade' : 'out') : null;
          return <Cell key={`${id}-${cell}`} id={id} cell={cell} pg={pg} leave={leave} />;
        })}
      </Animated.View>
      {leaving ? null : (
        <Animated.View
          style={[
            styles.seal,
            { left: pg.cx - sealSide / 2, top: pg.cy - sealSide / 2 },
            reduce || landed ? null : sealAnim,
          ]}>
          <Seal size={pg.seal} collar={COLLAR} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { position: 'absolute', width: 0, height: 0 },
  cell: { position: 'absolute' },
  seal: { position: 'absolute' },
});
