import React, { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { MILESTONES } from '@/lib/milestones';

/* ==================================================================== */
/* The brass gauge (Brass D12, with graft 1)                            */
/*                                                                      */
/* The Dex's progress, drawn as the Dex itself: one brass mark in the   */
/* gauge's well for every caught drink, AT ITS DEX NUMBER. A run of     */
/* classics caught near the front reads as a dense block at the left;   */
/* one odd spirit from the back of the book is a lone mark near the     */
/* right. A plain fill would say only "1.8%"; the marks also say WHERE. */
/*                                                                      */
/* CHEAP AT 2,089. The marks are bucketed to whole points of the well   */
/* (about 350 of them on a phone), runs of neighbouring buckets are     */
/* merged, and the lot is ONE Path string, rebuilt only when the caught */
/* set or the width changes. Ticks every 5% (10% longer) are a second   */
/* Path. One Svg, four elements, however many drinks you have caught.   */
/*                                                                      */
/* Two wells: `cellar` (the Dex header, on lining) and `walnut` (the    */
/* Profile plaque). The figures under it are RN Text placed by          */
/* percentage, so they follow Dynamic Type (SVG text would not): every  */
/* 500 on the Dex, the rank ladder's counts on the plaque, where four   */
/* brassOnDark notches mark the rungs (10, 25, 50, 75%).                */
/*                                                                      */
/* One VoiceOver element, a progressbar: "38 of 2,089 in your Dex".     */
/* ==================================================================== */

const WELL_H = 12;
/** The marks stand inside the well's 1pt edge with 2pt to spare above and below. */
const MARK_PAD = 3;
const NOTCH = 5;
/** Figures under the gauge are fixed to it, so they cap. */
const FIGURE_CAP = 1.3;
/** A centred figure's box: "1,567" at 12pt x 1.3 is about 44pt, with room either side. */
const FIGURE_W = 60;

/** The counts that reach each rung above the first: ceil(total x pct / 100), as rankTitle requires. */
export function rungCounts(total: number): { pct: number; title: string; count: number }[] {
  return MILESTONES.filter((m) => m.pct > 0).map((m) => ({
    ...m,
    count: Math.ceil((total * m.pct) / 100),
  }));
}

/** Every caught number as merged runs of whole points across `inner` points: one subpath per run. */
function marksPath(numbers: readonly number[], total: number, inner: number, x0: number): string {
  if (inner <= 0 || total <= 1) return '';
  const lit = new Uint8Array(Math.ceil(inner) + 1);
  for (const n of numbers) {
    if (n < 1 || n > total) continue;
    lit[Math.min(lit.length - 1, Math.floor(((n - 1) / (total - 1)) * (inner - 1)))] = 1;
  }
  let d = '';
  const top = MARK_PAD;
  const h = WELL_H - 2 * MARK_PAD;
  for (let i = 0; i < lit.length; i++) {
    if (!lit[i]) continue;
    let j = i;
    while (j + 1 < lit.length && lit[j + 1]) j++;
    d += `M${x0 + i} ${top}h${j - i + 1}v${h}h${-(j - i + 1)}Z`;
    i = j;
  }
  return d;
}

/** Ticks every 5% along the well's foot, 10% ones longer. */
function ticksPath(w: number): string {
  let d = '';
  for (let k = 1; k < 20; k++) {
    const x = (Math.round((k / 20) * (w - 1)) + 0.5).toFixed(1);
    d += `M${x} ${WELL_H}v${k % 2 === 0 ? 4 : 2.5}`;
  }
  return d;
}

export const BrassGauge = React.memo(function BrassGauge({
  caught,
  total,
  well,
}: {
  /** The Dex numbers you have caught (custom drinks have none and are not passed). */
  caught: readonly number[];
  total: number;
  /** `cellar` on the Dex's lining; `walnut` on the Profile plaque, with the rank notches. */
  well: 'cellar' | 'walnut';
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setW((prev) => (prev === next ? prev : next));
  };
  const plaque = well === 'walnut';
  const marks = useMemo(
    () => marksPath(caught, total, w - 2 * MARK_PAD, MARK_PAD),
    [caught, total, w],
  );
  const ticks = useMemo(() => ticksPath(w), [w]);
  const rungs = useMemo(() => rungCounts(total), [total]);
  const notches = useMemo(() => {
    if (!plaque || w <= 0) return '';
    return rungs
      .filter((r) => r.pct < 100)
      .map((r) => {
        const x = (r.pct / 100) * w;
        return `M${(x - NOTCH / 2).toFixed(1)} 0h${NOTCH}l${-NOTCH / 2} ${NOTCH - 1}Z`;
      })
      .join('');
  }, [plaque, rungs, w]);

  const count = caught.length;
  // The figures: every 500 on the Dex (and the total), the rungs' counts on the plaque.
  const figures = plaque
    ? rungs.map((r) => ({ at: r.pct / 100, text: formatCount(r.count) }))
    : [0, 500, 1000, 1500].filter((v) => v < total - 250).map((v) => ({ at: v / total, text: formatCount(v) })).concat({
        at: 1,
        text: formatCount(total),
      });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${formatCount(count)} of ${formatCount(total)} in your Dex`}
      accessibilityValue={{ min: 0, max: total, now: count }}>
      <View onLayout={onLayout} style={[styles.well, plaque && styles.wellPlaque]}>
        {w > 0 ? (
          <Svg width={w} height={WELL_H + (plaque ? NOTCH : 4)} style={plaque ? styles.svgPlaque : undefined}>
            <Rect
              x={0.5}
              y={(plaque ? NOTCH : 0) + 0.5}
              width={w - 1}
              height={WELL_H - 1}
              rx={2}
              fill={plaque ? colors.walnutDeep : colors.liningDeep}
              stroke={colors.brass}
              strokeWidth={stroke.edge}
            />
            <Path d={marks} fill={colors.brassPlate} transform={plaque ? `translate(0 ${NOTCH})` : undefined} />
            <Path
              d={ticks}
              stroke={colors.brass}
              strokeWidth={stroke.edge}
              transform={plaque ? `translate(0 ${NOTCH})` : undefined}
            />
            {plaque ? <Path d={notches} fill={colors.brassOnDark} /> : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.figures} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {figures.map((f) => (
          <Text
            key={f.text}
            maxFontSizeMultiplier={FIGURE_CAP}
            style={[
              styles.figure,
              tabular,
              { color: plaque ? colors.onWalnutMuted : colors.onLiningMuted },
              // Placed by percentage; the two ends hug their edges, the rest centre on their mark.
              f.at <= 0
                ? styles.figureStart
                : f.at >= 1
                  ? styles.figureEnd
                  : { left: `${f.at * 100}%`, transform: [{ translateX: -FIGURE_W / 2 }], width: FIGURE_W, textAlign: 'center' },
            ]}>
            {f.text}
          </Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  well: { height: WELL_H + 4 },
  wellPlaque: { height: WELL_H + NOTCH + 4 },
  svgPlaque: { marginTop: 0 },
  // Tall enough for one capped line; the figures are absolute inside it.
  figures: { height: Math.ceil(textRole.labelCaption.lineHeight * FIGURE_CAP) + 2, marginTop: 2 },
  figure: { ...textRole.labelCaption, fontFamily: textRole.fieldLabel.fontFamily, position: 'absolute', top: 0 },
  figureStart: { left: 0 },
  figureEnd: { right: 0, textAlign: 'right' },
});
