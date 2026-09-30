import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import {
  colors,
  fonts,
  RARITY_META,
  RARITY_ORDER,
  space,
  tabular,
  type as typeScale,
} from '@/constants/theme';
import { formatCount } from '@/data';
import type { Rarity } from '@/types';

/* ==================================================================== */
/* Rarity donut                                                         */
/*                                                                      */
/* The rarity spread as one ring with the total struck through its      */
/* middle, and a legend beside it.                                      */
/*                                                                      */
/* It replaces four stacked progress rows. Rows answer "how much of the */
/* rare tier have I got" one tier at a time; the ring answers "what is  */
/* this collection MADE of" in a single read. Given `collected`, the    */
/* legend still answers the rows' question — "12/646" per tier — so     */
/* the ring shows the shape of the index and the legend the user's      */
/* progress through it. Without it the legend shows each tier's share.  */
/*                                                                      */
/* The ring does not use RARITY_META.color. That is the badge TEXT      */
/* colour, tuned for contrast against the page rather than against its  */
/* neighbours, and common, uncommon and legendary sit within 1.04:1 of  */
/* each other in it — common and uncommon, adjacent from twelve         */
/* o'clock and over half the index, read as one brown arc. CHART below  */
/* takes each tier's mark as the Dex draws it instead: common's ink     */
/* ring, uncommon's taupe frame, rare's wine, legendary's gilt. Gilt    */
/* stays legendary's alone, and the legend names every tier, so colour  */
/* is never the only thing saying which is which.                       */
/*                                                                      */
/* Drawn with stroke-dasharray on one circle per segment rather than    */
/* with arc paths. Four circles with a dash pattern is far less code    */
/* than four hand-built A-commands, and it cannot produce a malformed   */
/* path — the failure mode of arc maths is a filled blob, which looks   */
/* like a rendering bug rather than a wrong number.                     */
/* ==================================================================== */

const SIZE = 128;
const STROKE = 18;
/** Radius of the stroke's CENTRELINE, which is what dasharray measures. */
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * A hair of space between segments so four tiers read as four things.
 * In points along the centreline, converted to a fraction below.
 */
const GAP = 2;

/** Segment and swatch colours — see the header. */
const CHART: Record<Rarity, string> = {
  common: colors.textMuted,
  uncommon: colors.taupe,
  rare: colors.wine,
  legendary: colors.giltGlyph,
};

export interface RarityDonutProps {
  /** Entries per tier. Usually COUNT_BY_RARITY, or the user's own spread. */
  counts: Record<Rarity, number>;
  /** The user's entries per tier. Turns the legend into progress. */
  collected?: Record<Rarity, number>;
  /** Centre caption under the total. */
  caption?: string;
}

export function RarityDonut({ counts, collected, caption = 'Total' }: RarityDonutProps) {
  const total = RARITY_ORDER.reduce((sum, r) => sum + (counts[r] ?? 0), 0);

  /*
   * Each segment starts where the sum of every earlier one ends, so the
   * offsets are a prefix sum over the fractions.
   *
   * Built by summing a slice per segment rather than by carrying a running
   * total in a `let`. The React Compiler is on for this project and rejects
   * a variable reassigned during render (`react-hooks/immutability`), which
   * is the obvious way to write this and does not compile here. Four tiers
   * makes the repeated summing free.
   */
  const segments = useMemo(() => {
    const fractions = RARITY_ORDER.map((r) =>
      total > 0 ? (counts[r] ?? 0) / total : 0,
    );
    return RARITY_ORDER.map((rarity, i) => {
      const fraction = fractions[i] ?? 0;
      const before = fractions.slice(0, i).reduce((a, b) => a + b, 0);
      return {
        rarity,
        value: counts[rarity] ?? 0,
        // Rounded for display only; the geometry uses the exact fraction.
        pct: Math.round(fraction * 100),
        length: Math.max(fraction * CIRCUMFERENCE - GAP, 0),
        offset: before * CIRCUMFERENCE,
      };
    });
  }, [counts, total]);

  return (
    <View style={styles.wrap}>
      <View style={styles.ringWrap}>
        <Svg width={SIZE} height={SIZE}>
          {/*
            -90° so the ring starts at twelve o'clock. Without it the first
            tier begins at three o'clock and the whole chart reads rotated.

            A plain SVG `transform` string rather than react-native-svg's
            `rotation` + `originX`/`originY` props: on web those get shimmed
            into a `transform-origin` DOM attribute that React rejects
            outright — "Invalid DOM property `transform-origin`" in the
            console on every render. rotate(deg cx cy) carries its own
            centre and needs no origin props at all.
          */}
          <G transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {/* The track, so a tier with no entries still leaves a groove. */}
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={colors.cardBorder}
              strokeWidth={STROKE}
              fill="none"
            />
            {segments.map((seg) =>
              seg.length > 0 ? (
                <Circle
                  key={seg.rarity}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  stroke={CHART[seg.rarity]}
                  strokeWidth={STROKE}
                  strokeLinecap="butt"
                  fill="none"
                  strokeDasharray={`${seg.length} ${CIRCUMFERENCE - seg.length}`}
                  strokeDashoffset={-seg.offset}
                />
              ) : null,
            )}
          </G>
        </Svg>

        {/*
          Absolutely positioned over the ring rather than an SVG <Text>:
          it inherits the app's real font stack that way, and SVG text in
          react-native-svg does not take the same metrics on both platforms.
        */}
        <View style={styles.centre} pointerEvents="none">
          <Text style={styles.total}>{formatCount(total)}</Text>
          <Text style={styles.caption}>{caption}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {segments.map((seg) => {
          const label = RARITY_META[seg.rarity].label;
          const mine = collected ? (collected[seg.rarity] ?? 0) : null;
          return (
            /*
             * `accessible` makes the row one VoiceOver element; without it
             * iOS ignores the label and reads the children one at a time.
             * The label carries the share too, since the ring is invisible
             * to VoiceOver.
             */
            <View
              key={seg.rarity}
              accessible
              style={styles.legendRow}
              accessibilityRole="text"
              accessibilityLabel={
                mine === null
                  ? `${label}: ${formatCount(seg.value)} entries, ${seg.pct} percent`
                  : `${label}: ${formatCount(mine)} of ${formatCount(seg.value)} collected, ${seg.pct} percent of the Dex`
              }>
              <View style={[styles.swatch, { backgroundColor: CHART[seg.rarity] }]} />
              <Text style={styles.legendLabel}>{label}</Text>
              <Text style={styles.legendPct}>
                {mine === null
                  ? `${seg.pct}%`
                  : `${formatCount(mine)}/${formatCount(seg.value)}`}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * space.md between ring and legend, not xl. With progress in it the
   * legend's widest row is "Uncommon" plus "100/595" — about 151pt with its
   * swatch and gaps — and on a 375pt phone the legend gets 141pt at xl, so
   * the label broke mid-word. At md it gets 153. The value is written
   * "12/595", unspaced, as the category rows above it write theirs.
   */
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  ringWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  total: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    ...tabular,
  },
  /*
   * micro and textMuted: this is small text. It was a 10pt one-off below
   * the scale, in textFaint, which is for large type and glyphs only.
   */
  caption: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    letterSpacing: typeScale.micro.letterSpacing,
    color: colors.textMuted,
  },

  legend: { flex: 1, gap: space.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  legendPct: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
    ...tabular,
  },
});
