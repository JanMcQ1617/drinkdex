import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { BrassGauge, rungCounts } from '@/components/brass/BrassGauge';
import { MountKeyline } from '@/components/brass/frames';
import { WalnutFill } from '@/components/brass/walnut';
import { colors, radius, space, stroke, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { rankTitle } from '@/lib/milestones';

/* ==================================================================== */
/* The walnut Dex plaque (Brass D13, with graft 1 and fix 10)           */
/*                                                                      */
/* Profile's Dex progress at a glance, own and a peer's, between the    */
/* buttons and the tab strip: a walnut plaque with an inner brass       */
/* keyline, the Dex count large, "of 2,089 in the Dex · 1.8%", the rank */
/* word in brassOnDark, and the brass-mark gauge notched at the rank    */
/* ladder. Under it, on paper: "171 more to Barfly in Training, at 209".*/
/*                                                                      */
/* THE FIGURE IS THE DEX COUNT. The Brass mock printed the posts count  */
/* (64) here while the Dex header said 38 (the judges' fix 10). The     */
/* plaque takes the caught Dex numbers and counts THEM, so it cannot be */
/* handed a posts count by mistake: the figure, the percentage, the     */
/* rank and the gauge all come from one array.                          */
/*                                                                      */
/* Inks on walnut are measured against the tile's brightest decoded     */
/* pixel: onLining 7.18:1, onWalnutMuted 4.61, brassOnDark 4.64.        */
/* ==================================================================== */

const CAP = 1.3;

/** "1.8%", and "under 0.1%" rather than a "0.0%" that reads as nothing. */
function percent(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '0%';
  const p = (count / total) * 100;
  return p < 0.1 ? 'under 0.1%' : `${p.toFixed(1)}%`;
}

export const DexPlaque = React.memo(function DexPlaque({
  caught,
  total,
  style,
}: {
  /** The Dex numbers this person has caught. Their length IS the figure. */
  caught: readonly number[];
  total: number;
  style?: ViewStyle;
}) {
  const count = caught.length;
  const rank = rankTitle(count, total);
  const pct = percent(count, total);
  const caption = `of ${formatCount(total)} in the Dex · ${pct}`;
  // The next rung up, if there is one: the first whose count is still ahead.
  const next = count > 0 ? rungCounts(total).find((r) => r.count > count) : undefined;

  return (
    <View style={style}>
      <View style={styles.plaque}>
        <WalnutFill seed={7} />
        <MountKeyline outerRadius={radius.control} />
        <View
          accessible
          accessibilityLabel={`${formatCount(count)} ${caption}. Rank: ${rank}`}
          style={styles.head}>
          <View style={styles.figureRow}>
            <Text maxFontSizeMultiplier={CAP} style={[textRole.heroFigure, styles.figure]}>
              {formatCount(count)}
            </Text>
            <Text maxFontSizeMultiplier={CAP} style={[textRole.helper, styles.caption]}>
              {caption}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={CAP} style={[textRole.labelValue, styles.rank]}>
            {rank}
          </Text>
        </View>
        <BrassGauge caught={caught} total={total} well="walnut" />
      </View>
      {next ? (
        <Text maxFontSizeMultiplier={CAP} style={[textRole.helper, styles.next]}>
          {formatCount(next.count - count)} more to <Text style={styles.nextRank}>{next.title}</Text>, at{' '}
          {formatCount(next.count)}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  plaque: {
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.walnutDeep,
    overflow: 'hidden',
    backgroundColor: colors.walnut,
    paddingHorizontal: space.lg + 2,
    paddingTop: space.md + 2,
    paddingBottom: space.md,
    gap: space.sm,
  },
  // Wraps: at large text the rank word drops under the figure instead of squeezing it.
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.md,
  },
  figureRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.sm, flexShrink: 1 },
  figure: { color: colors.onLining },
  caption: { color: colors.onWalnutMuted, flexShrink: 1 },
  rank: { color: colors.brassOnDark },
  next: { color: colors.textMuted, marginTop: space.sm },
  nextRank: { fontFamily: textRole.labelValue.fontFamily, color: colors.text },
});
