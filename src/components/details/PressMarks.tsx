import React, { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, radius, space } from '@/constants/theme';

import { LEADER, leader, perforation, TICKET, ticket } from './framePath';
import { numeral } from './numeralPath';
import type { PenShape } from './penPath';

/* ==================================================================== */
/* The press: printed matter, in greys                                  */
/*                                                                      */
/* v4.9 (Jan, 28 Oct 2026; specs/v4.9/details/spec.md A.3, A.4). Of the */
/* three directions Jan picked, "editorial frames" (big outlined        */
/* numbers, menu-style dotted leaders) and "a torn-ticket edge on       */
/* cards" are the PRINTER's, not the hand's: the page set in type and   */
/* die-cut, beside the pen that signs it.                               */
/*                                                                      */
/*   PressNumeral  a big outlined figure, Anton as hairline rings:      */
/*                 the drink page's Nº 0100, the Dex's 01, 02, …        */
/*                 (colors.rule, 1.74:1: seen, never read)              */
/*   PressLeader   the dots between an ingredient and its amount, as a  */
/*                 menu sets them (colors.lineControl, 3.45:1)          */
/*   TicketCard    a tournament card as a cinema stub: its own fill     */
/*                 with two die-cut notches, and the perforation it     */
/*                 would tear along (colors.rule on the wash)           */
/*                                                                      */
/* THE PRESS IS NEVER RED. This file names no accent token and imports  */
/* no pen module (check-design rule 17's ACCENT_TIER_EXCEPT): a grey    */
/* mark is printed, and printing is never the hand's colour. Its greys  */
/* go to <Path fill>, never to a `color=`, so the edge greys never      */
/* become text (rule 16). Ornament, not information: none adds a word,  */
/* a count or a state, and a figure is the same grey caught or not.     */
/*                                                                      */
/* Drawn the pen's way all the same: filled polygons from framePath and */
/* numeralPath, M/L/Z, one path a mark, cached. The figures and the     */
/* leaders are hidden from VoiceOver (the plate and the row's label say */
/* the words); the ticket is the card itself, so it stays whatever      */
/* button its caller makes it, and only its Svg is hidden.              */
/*                                                                      */
/* MEASURING costs one extra render, and only two marks here do it: the */
/* leader (its width) and the ticket (itself and its head), neither in  */
/* a recycled cell.                                                     */
/* ==================================================================== */

/** Never a VoiceOver element, never a touch target. */
const HIDDEN = {
  pointerEvents: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** Lengths are measured to the quarter point, which also bounds the geometry's cache. */
const quarter = (v: number) => Math.round(v * 4) / 4;

/** The ink in its own box, set out from the nominal box by the box's origin, in a grey of the press. */
function Ink({ shape, fill }: { shape: PenShape; fill: string }) {
  const { x, y, w, h } = shape.box;
  return (
    <Svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} style={{ position: 'absolute', left: x, top: y }}>
      {shape.d.map((d, i) => (
        <Path key={i} d={d} fill={fill} />
      ))}
    </Svg>
  );
}

export interface PressNumeralProps {
  /** The figures to set: digits, N, º and the space ("01", "Nº 0100"). Anything else is skipped. */
  text: string;
  /** The cap height, pt: the box's height, its top on the caps and its foot on the baseline. Never scaled with Larger Text. */
  cap: number;
  style?: StyleProp<ViewStyle>;
}

/** A big outlined figure in its nominal box (the set's advance width x cap). */
export const PressNumeral = React.memo(function PressNumeral({ text, cap, style }: PressNumeralProps) {
  const shape = numeral(text, cap);
  return (
    <View {...HIDDEN} style={[{ width: shape.width, height: cap, overflow: 'visible' }, style]}>
      <Ink shape={shape} fill={colors.rule} />
    </View>
  );
});

/** A leader shorter than this has no room for its dots (the run keeps 2pt clear at each end). */
const MIN_LEADER = 6;

export interface PressLeaderProps {
  /** False lays the leader out and paints nothing: an item that wraps, or a row with no amount. */
  dots?: boolean;
}

/**
 * The dots between an item and its amount. A childless View in the row
 * (flex 1, at least 16 wide, 6 either side, 4 tall), so its Yoga
 * baseline is its foot and it sits on the item's first baseline in a
 * row aligned on baselines. It measures its own width (one extra render,
 * as PenMargin does, quarter points), and it is ALWAYS laid out: only
 * the dots come and go, so a wrap can never unwrap the item and loop.
 */
export const PressLeader = React.memo(function PressLeader({ dots = true }: PressLeaderProps) {
  const [length, setLength] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = quarter(e.nativeEvent.layout.width);
    if (w !== length) setLength(w);
  };
  return (
    <View {...HIDDEN} onLayout={onLayout} style={styles.leader}>
      {dots && length >= MIN_LEADER ? <Ink shape={leader(length)} fill={colors.lineControl} /> : null}
    </View>
  );
});

/** Where the perforation runs: from the left notch's bite plus 2 to the right's less 2 (notch to notch). */
const PERF_INSET = TICKET.notch + 2;
/** The gap between the head and the standings, where the notches are centred. */
const TICKET_GAP = 10;

export interface TicketCardProps {
  /** The card's own pressed fill (`press`), when its caller is held. */
  pressed: boolean;
  /** Above the tear line: the name row and the meta line. TicketCard measures it, so the notches follow Larger Text. */
  head: ReactNode;
  /** Below it: the standings. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A card drawn as a ticket stub: its head, a 10pt gap, its children,
 * inside 16 of padding (12 at the foot), corners 8. The fill is the
 * card's own (the wash, `press` while held) drawn as one silhouette
 * with a half-round notch in each side, centred in the gap, and a
 * perforation from notch to notch in `rule`. Until it has measured
 * itself and its head (quarter points) it is a plain wash card, so no
 * frame is ever unfilled. The Svg lies under the children and is
 * hidden; the card stays the one button its caller made it, and nothing
 * red sits on it.
 */
export const TicketCard = React.memo(function TicketCard({ pressed, head, children, style }: TicketCardProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [headHeight, setHeadHeight] = useState(0);
  const onCard = (e: LayoutChangeEvent) => {
    const w = quarter(e.nativeEvent.layout.width);
    const h = quarter(e.nativeEvent.layout.height);
    if (!size || size.w !== w || size.h !== h) setSize({ w, h });
  };
  const onHead = (e: LayoutChangeEvent) => {
    const h = quarter(e.nativeEvent.layout.height);
    if (h !== headHeight) setHeadHeight(h);
  };
  const fill = pressed ? colors.press : colors.bgSunk;
  const cut = size && size.w > 2 * PERF_INSET && headHeight > 0 ? size : null;
  // The notches' centre: the top padding, the head, and half the gap.
  const at = space.lg + headHeight + TICKET_GAP / 2;
  return (
    <View onLayout={onCard} style={[styles.ticket, !cut && { backgroundColor: fill }, style]}>
      {cut ? (
        <Svg
          {...HIDDEN}
          width={cut.w}
          height={cut.h}
          viewBox={`0 0 ${cut.w} ${cut.h}`}
          style={StyleSheet.absoluteFill}>
          <Path d={ticket(cut.w, cut.h, at).d[0]} fill={fill} />
          <Path d={perforation(PERF_INSET, cut.w - PERF_INSET, at).d[0]} fill={colors.rule} />
        </Svg>
      ) : null}
      <View onLayout={onHead}>{head}</View>
      <View style={styles.ticketBody}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  /* The row gives it its width; the dots' box is 4 tall, its foot the baseline. */
  leader: { flex: 1, minWidth: 16, marginHorizontal: 6, height: LEADER.height },
  /* 16 round the content, 12 under it, the card's 8pt corners (ui.Card's). */
  ticket: { padding: space.lg, paddingBottom: space.md, borderRadius: radius.card },
  ticketBody: { marginTop: TICKET_GAP },
});
