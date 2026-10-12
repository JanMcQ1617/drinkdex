import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { Pick } from '@/lib/recommend';

import { BODY_PAD, BODY_TOP, MARGIN, RESULT_PRINT, RESULT_ROW_GAP, RESULTS_GAP, SEAL, type Geometry } from '../metrics';
import { T } from '../motion';
import { DrinkPrint } from '../Photo';
import { PickRow, type RowPart } from '../PickRow';

import { Shell } from './Shell';

/* ==================================================================== */
/* Your first picks (mode B; results.png, t4-settle.png)                */
/*                                                                      */
/* Six PickRows, photographed first, each with Save to try. The sub     */
/* line counts what the bar makes now, and only when it makes one.      */
/*                                                                      */
/* THE REVEAL (m20). Arriving from the pour, this screen is already the */
/* real list, with its prints held back by state. Over it, copies of     */
/* the picks' collage prints fly from their cells to their rows on a     */
/* spring (~360ms; each copy is drawn at its cell's decode size and      */
/* scaled, so it is the decode the collage already holds). Picks that    */
/* were not in the collage fade in at their rows. A JS timer at 420ms    */
/* removes the copies and shows the list's own prints, so a stalled      */
/* spring leaves the collage up for 420ms, never on top of the list.     */
/* The seal rides back to its slot first (240ms), the bubble's words     */
/* fade up in 120ms, then each row's words and key, 60ms apart.          */
/* ==================================================================== */

export const RESULTS_PROMPT = 'Your first picks.';
const WORDS_AT = 360;
const WORDS_EVERY = 60;
/** The most rows the store keeps (setPicks), so every row gets its turn. */
const MAX_ROWS = 24;

export interface RevealFrom {
  /** Each flying pick's start: its cell's centre and drawn size, and the size the collage decoded it at. */
  prints: Readonly<Record<string, { cx: number; cy: number; size: number; decode: number }>>;
  /** Where the seal sat in the collage: its centre and size. */
  seal: { cx: number; cy: number; size: number };
}

export function resultsSub(picks: readonly Pick[]): string | null {
  const n = picks.filter((p) => p.makeNow).length;
  return n >= 1 ? `You can make ${n} of these now.` : null;
}

function FlyingPrint({
  id,
  from,
  to,
}: {
  id: string;
  from: { cx: number; cy: number; size: number; decode: number };
  to: { cx: number; cy: number; size: number } | null;
}) {
  const p = useSharedValue(0);
  const ready = to !== null;
  useEffect(() => {
    if (ready) p.set(withSpring(1, { damping: 18, stiffness: 160 }));
  }, [ready, p]);

  const d = from.decode;
  const fx = from.cx - d / 2;
  const fy = from.cy - d / 2;
  const fs = from.size / d;
  const tx = to ? to.cx - d / 2 : fx;
  const ty = to ? to.cy - d / 2 : fy;
  const ts = to ? to.size / d : fs;
  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: fx + (tx - fx) * p.value },
      { translateY: fy + (ty - fy) * p.value },
      { scale: fs + (ts - fs) * p.value },
    ],
  }));

  return (
    <Animated.View style={[styles.flying, { width: d, height: d }, anim]}>
      <DrinkPrint id={id} size={d} ground={false} />
    </Animated.View>
  );
}

export function ResultsStep({
  geo,
  picks,
  reveal,
  focus,
}: {
  geo: Geometry;
  picks: readonly Pick[];
  reveal: RevealFrom | null;
  focus: boolean;
}) {
  const [released, setReleased] = useState(reveal === null);
  const [turns, setTurns] = useState(0);
  const [listY, setListY] = useState<number | null>(null);
  const [rowY, setRowY] = useState<Readonly<Record<number, number>>>({});

  useEffect(() => {
    if (!reveal) return;
    const timers = [setTimeout(() => setReleased(true), T.revealGone)];
    for (let i = 0; i < MAX_ROWS; i++) timers.push(setTimeout(() => setTurns(i + 1), WORDS_AT + i * WORDS_EVERY));
    return () => timers.forEach(clearTimeout);
  }, [reveal]);

  const flying = reveal && !released ? reveal.prints : null;
  const slotCx = geo.width / 2;
  const slotCy = geo.top + BODY_TOP + BODY_PAD + SEAL.B / 2;
  const guideFrom = reveal
    ? { dx: reveal.seal.cx - slotCx, dy: reveal.seal.cy - slotCy, scale: reveal.seal.size / SEAL.B }
    : null;
  const scrollTop = geo.top + BODY_TOP;

  const rows = picks.map((pick, i) => {
    // A print a copy flies to is held, then shown; one that fades in at its row stays in its
    // Appear (settled, it is plain), so neither is remounted when the copies go.
    const flies = reveal !== null && reveal.prints[pick.id] !== undefined;
    let print: RowPart = 'shown';
    if (reveal) print = flies ? (released ? 'shown' : 'held') : 'appear';
    const words: RowPart = reveal === null ? 'shown' : i < turns ? 'appear' : 'held';
    return (
      <PickRow
        key={pick.id}
        pick={pick}
        contentW={geo.contentW}
        print={print}
        words={words}
        onLayout={(e) => {
          const y = e.nativeEvent.layout.y;
          setRowY((r) => (r[i] === y ? r : { ...r, [i]: y }));
        }}
      />
    );
  });

  const copies = flying
    ? picks.flatMap((pick, i) => {
        const from = flying[pick.id];
        if (!from) return [];
        const y = rowY[i];
        const to =
          listY !== null && y !== undefined
            ? { cx: MARGIN + RESULT_PRINT / 2, cy: scrollTop + listY + y + RESULT_PRINT / 2, size: RESULT_PRINT }
            : null;
        return [<FlyingPrint key={pick.id} id={pick.id} from={from} to={to} />];
      })
    : null;

  return (
    <Shell
      geo={geo}
      mode="B"
      prompt={RESULTS_PROMPT}
      sub={resultsSub(picks)}
      focus={focus}
      gesture={reveal ? 'none' : 'speak'}
      guideFrom={guideFrom}
      bubbleIn={reveal ? 120 : undefined}
      after={
        copies ? (
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            {copies}
          </View>
        ) : null
      }>
      <View onLayout={(e) => setListY(e.nativeEvent.layout.y)} style={styles.list}>
        {rows}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: RESULTS_GAP, paddingHorizontal: MARGIN, gap: RESULT_ROW_GAP },
  flying: { position: 'absolute', left: 0, top: 0 },
});
