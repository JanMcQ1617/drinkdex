import React, { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors, radius, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { nextRung, rankTitle, rungCounts } from '@/lib/milestones';

/* ==================================================================== */
/* The ruler, and the Dex panel                                         */
/*                                                                      */
/* Brass's gauge as a measuring rule (white spec 5.12): a 1pt baseline, */
/* a 3pt ink fill from 0 to count/total, a needle at the fill's end,    */
/* ticks every 5% with longer ones every 25%. One small static SVG; the */
/* figures under it are RN Text placed by percent, so they take Dynamic */
/* Type. It lives on Dex progress (app/stats.tsx), reached from the     */
/* Dex's "38 / 2,089" and Profile's "38 entries in your Dex ›": the     */
/* less-stuff layout took it off both tab screens.                      */
/*                                                                      */
/* `ladder` (the Dex panel) labels the title rungs instead of the       */
/* hundreds, with a notch over the baseline at each rung. It is drawn   */
/* over the ladder's own scope, the cocktails and spirits (v4.15,       */
/* lib/milestones), so its fill, its notches and its figures say the    */
/* same thing as the title beside them.                                 */
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
  label,
}: {
  count: number;
  total: number;
  /** `scale`: 0 · 500 · 1,000 · 1,500 · total. `ladder`: the rank rungs, notched. */
  mode?: 'scale' | 'ladder';
  /** What VoiceOver says; "38 of 2,089 in your Dex" unless the rule measures something else. */
  label?: string;
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
      accessibilityLabel={label ?? `${formatCount(count)} of ${formatCount(total)} in your Dex`}
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
 * panel with the figure, "of 4,671 in the Dex · 1.8%", the title word and
 * the ladder ruler, then under it "Titles count cocktails and spirits: 38
 * of 2,327" and "Next: Cataloguer, at 233". Dex progress's head. One
 * VoiceOver element for the figure and the title.
 *
 * TWO SCOPES, SAID AS TWO (v4.15). The figure is the Dex's count, every
 * kind, the number the Dex and Profile show. The title, the ruler and the
 * lines under the panel read the ladder: cocktails and spirits, out of the
 * cocktails and spirits in the Dex (lib/milestones). Wine moves the first
 * and never the second, and the first line under the panel says so, since
 * the ruler's fill no longer matches the percentage over it.
 *
 * The Next line names the next rung and where it starts, never how many
 * more it takes: a countdown is a target to post toward (App Review
 * 1.4.3). Which rung is next is worked out exactly as before
 * (lib/milestones' nextRung), on the ladder's count.
 */
export const DexPanel = React.memo(function DexPanel({
  count,
  total,
  ladder,
  ladderTotal,
  style,
}: {
  /** Catalogue entries logged, every kind. */
  count: number;
  /** The whole Dex. */
  total: number;
  /** Of `count`, the ones a title counts (lib/milestones' ladderCount). */
  ladder: number;
  /** What a title is a share of (lib/milestones' LADDER_TOTAL). */
  ladderTotal: number;
  style?: ViewStyle;
}) {
  const rank = rankTitle(ladder, ladderTotal);
  const caption = `of ${formatCount(total)} in the Dex · ${dexPercent(count, total)}`;
  const reads = `Titles count cocktails and spirits: ${formatCount(ladder)} of ${formatCount(ladderTotal)}`;
  const next = nextRung(ladder, ladderTotal);

  return (
    <View style={style}>
      <View style={styles.panel}>
        <View
          accessible
          accessibilityLabel={`${formatCount(count)} ${caption}. Dex title: ${rank}`}
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
        <Ruler count={ladder} total={ladderTotal} mode="ladder" label={reads} />
      </View>
      {/* Read by the ruler's own label, so VoiceOver hears it once. */}
      <Text
        style={[textRole.small, styles.next, tabular]}
        importantForAccessibility="no"
        accessibilityElementsHidden>
        {reads}
      </Text>
      {next ? (
        <Text style={[textRole.small, styles.next, styles.nextAfter]}>
          Next: <Text style={styles.strong}>{next.title}</Text>, at {formatCount(next.count)}
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
  /* The second line under the panel sits with the first, not a group apart. */
  nextAfter: { marginTop: space.xs },
  strong: { fontFamily: textRole.bodyStrong.fontFamily, color: colors.text },
});
