import React, { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors, radius, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { MILESTONES, rankTitle } from '@/lib/milestones';

/* ==================================================================== */
/* The ruler, and the Dex panel                                         */
/*                                                                      */
/* Brass's gauge as a measuring rule (white spec 5.12): a 1pt baseline, */
/* a 3pt ink fill from 0 to count/total, a needle at the fill's end,    */
/* ticks every 5% with longer ones every 25%. One small static SVG; the */
/* figures under it are RN Text placed by percent, so they take Dynamic */
/* Type. It lives on Dex progress (app/stats.tsx), reached from the     */
/* Dex's "38 / 2,089" and Profile's "38 drinks in your Dex ›": the      */
/* less-stuff layout took it off both tab screens.                      */
/*                                                                      */
/* `ladder` (the Dex panel) labels the rank rungs instead of the        */
/* hundreds, with a notch over the baseline at each rung.               */
/* ==================================================================== */

const H = 20;
/** The baseline sits here; the fill is drawn on it. */
const BASE = 14;
const FILL = 3;
const NEEDLE = 13;
const MINOR = 4;
const MAJOR = 7;
const NOTCH_W = 7;
const NOTCH_H = 4.5;
/** Figures under the rule are fixed to it, so they cap. */
const FIGURE_CAP = 1.3;
/** A centred figure's box: "1,567" at 13pt x 1.3 is about 48pt, with room either side. */
const FIGURE_W = 64;

/** The counts that reach each rung above the first: ceil(total x pct / 100), as rankTitle requires. */
export function rungCounts(total: number): { pct: number; title: string; count: number }[] {
  return MILESTONES.filter((m) => m.pct > 0).map((m) => ({
    ...m,
    count: Math.ceil((total * m.pct) / 100),
  }));
}

/** "1.8%", and "under 0.1%" rather than a "0.0%" that reads as nothing. */
export function dexPercent(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '0%';
  const p = (count / total) * 100;
  return p < 0.1 ? 'under 0.1%' : `${p.toFixed(1)}%`;
}

export const Ruler = React.memo(function Ruler({
  count,
  total,
  mode = 'scale',
}: {
  count: number;
  total: number;
  /** `scale`: 0 · 500 · 1,000 · 1,500 · total. `ladder`: the rank rungs, notched. */
  mode?: 'scale' | 'ladder';
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setW((prev) => (prev === next ? prev : next));
  };
  const ladder = mode === 'ladder';
  const rungs = useMemo(() => rungCounts(total), [total]);

  const drawn = useMemo(() => {
    if (w <= 0) return null;
    let minor = '';
    let major = '';
    for (let k = 0; k <= 20; k++) {
      const x = (Math.round((k / 20) * (w - 1)) + 0.5).toFixed(1);
      if (k % 5 === 0) major += `M${x} ${BASE}v${-MAJOR}`;
      else minor += `M${x} ${BASE}v${-MINOR}`;
    }
    const notches = ladder
      ? rungs
          .filter((r) => r.pct < 100)
          .map((r) => {
            const x = (r.pct / 100) * w;
            return `M${(x - NOTCH_W / 2).toFixed(1)} ${BASE - FILL - NOTCH_H}h${NOTCH_W}l${-NOTCH_W / 2} ${NOTCH_H}Z`;
          })
          .join('')
      : '';
    // At least 3pt, so 0.1% still shows.
    const fillW = total > 0 && count > 0 ? Math.max(FILL, (count / total) * w) : 0;
    return { minor, major, notches, fillW };
  }, [w, ladder, rungs, count, total]);

  const figures = ladder
    ? rungs.map((r) => ({ at: r.pct / 100, text: formatCount(r.count) }))
    : [0, 500, 1000, 1500]
        .filter((v) => v < total - 250)
        .map((v) => ({ at: v / total, text: formatCount(v) }))
        .concat({ at: 1, text: formatCount(total) });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${formatCount(count)} of ${formatCount(total)} in your Dex`}
      accessibilityValue={{ min: 0, max: total, now: count }}>
      <View onLayout={onLayout} style={styles.rule}>
        {drawn ? (
          <Svg width={w} height={H}>
            <Rect x={0} y={BASE} width={w} height={stroke.edge} fill={colors.rule} />
            <Path d={drawn.minor} stroke={colors.rule} strokeWidth={stroke.edge} />
            <Path d={drawn.major} stroke={colors.lineControl} strokeWidth={stroke.edge} />
            {drawn.fillW > 0 ? (
              <>
                <Rect x={0} y={BASE - FILL + 1} width={drawn.fillW} height={FILL} fill={colors.text} />
                <Rect x={Math.min(w - 1, drawn.fillW - 1)} y={BASE + 1 - NEEDLE} width={1} height={NEEDLE} fill={colors.text} />
              </>
            ) : null}
            {ladder ? <Path d={drawn.notches} fill={colors.text} /> : null}
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
              // Placed by percentage; the two ends hug their edges, the rest centre on their tick.
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

/**
 * The Dex panel (white spec 5.14, Brass's walnut plaque made flat): a wash
 * panel with the figure, "of 2,089 in the Dex · 1.8%", the rank word and
 * the ladder ruler, then "171 more to Barfly in Training, at 209" under it.
 * Dex progress's head. One VoiceOver element for the figure and the rank.
 */
export const DexPanel = React.memo(function DexPanel({
  count,
  total,
  style,
}: {
  count: number;
  total: number;
  style?: ViewStyle;
}) {
  const rank = rankTitle(count, total);
  const caption = `of ${formatCount(total)} in the Dex · ${dexPercent(count, total)}`;
  // The next rung up, if there is one: the first whose count is still ahead.
  const next = count > 0 ? rungCounts(total).find((r) => r.count > count) : undefined;

  return (
    <View style={style}>
      <View style={styles.panel}>
        <View
          accessible
          accessibilityLabel={`${formatCount(count)} ${caption}. Rank: ${rank}`}
          style={styles.head}>
          <View style={styles.figureCol}>
            <Text maxFontSizeMultiplier={FIGURE_CAP} style={[textRole.heroFigure, styles.ink]}>
              {formatCount(count)}
            </Text>
            <Text maxFontSizeMultiplier={FIGURE_CAP} style={[textRole.small, styles.muted]}>
              {caption}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={FIGURE_CAP} style={[textRole.bodyStrong, styles.ink]}>
            {rank}
          </Text>
        </View>
        <Ruler count={count} total={total} mode="ladder" />
      </View>
      {next ? (
        <Text style={[textRole.small, styles.next]}>
          <Text style={styles.strong}>{formatCount(next.count - count)}</Text> more to{' '}
          <Text style={styles.strong}>{next.title}</Text>, at {formatCount(next.count)}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rule: { height: H },
  // Tall enough for one capped line; the figures are absolute inside it.
  figures: { height: Math.ceil(textRole.small.lineHeight * FIGURE_CAP) + 2, marginTop: space.xs },
  figure: { ...textRole.small, color: colors.textMuted, position: 'absolute', top: 0 },
  figureStart: { left: 0 },
  figureEnd: { right: 0, textAlign: 'right' },

  panel: {
    backgroundColor: colors.bgSunk,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.lg,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  figureCol: { flexShrink: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  next: { color: colors.textMuted, marginTop: space.md },
  strong: { fontFamily: textRole.bodyStrong.fontFamily, color: colors.text },
});
