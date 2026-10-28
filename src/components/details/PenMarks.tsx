import React, { useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors, stroke } from '@/constants/theme';

import { DOUBLE, doubleRule } from './framePath';
import { PEN, PEN_SEED, penRule, penSwash, penVRule, plateDrip, type PenShape } from './penPath';

/* ==================================================================== */
/* The detail marks: the logo's paint pen at hairline weight            */
/*                                                                      */
/* v4.6 (Jan, 23 Oct 2026; specs/v4.6-details/spec.md). Jan said the    */
/* app looked "too bland" and asked for "delicate details … simple yet */
/* complex", and his standing rule is less stuff. So these are          */
/* ORNAMENT, NOT INFORMATION: no mark adds a word, a count, an icon or  */
/* a state, none turns an existing state red, and at a glance a screen  */
/* reads as it did before. On a second look the hand that wrote         */
/* "sipply" has ruled the page.                                         */
/*                                                                      */
/*   PenRule    a horizontal rule: under Home's stories (the one that   */
/*              draws itself in after the intro), under a Dex section   */
/*              head, and the 24pt rule that closes each feed post      */
/*   PenMargin  a vertical rule that measures its own height: the       */
/*              drink page's margin and column rules, Profile's margin  */
/*   PenSwash   under a tab root's title (Dex, Saved, your username)    */
/*   PlateDrip  the one drip, off the caught Nº plate, drink page only  */
/*                                                                      */
/* v4.9 (specs/v4.9/details/spec.md A.3) adds one mark and one motion:  */
/*                                                                      */
/*   PenDoubleRule  two pen rules 3.2pt apart, the lower its own stroke */
/*              (framePath's doubleRule): Home's stories rule doubled,  */
/*              the Tournaments board rule, the spec card's head, the   */
/*              Dex's "Everything else" head                            */
/*   PenSwash's `draw`  the swash signing each tab as it opens (B):     */
/*              ScreenTopBar's TitleSwash passes details/tabArrival's   */
/*              value, through the same transform-only DrawOn           */
/*                                                                      */
/* The doodles, the frames and the press have modules of their own      */
/* (DoodleMarks, FrameMarks, PressMarks, Paper), each fenced by rule 17 */
/* the way this one is.                                                 */
/*                                                                      */
/* THE DETAIL TIER OF THE ACCENT. Campari, at 100%, and nothing else:   */
/* no tint, no second hue, never accentPressed. It is not a seventh     */
/* place (theme.ts): the six places say "post", "caught", "new" and the */
/* name; these say nothing. check-design rule 17 lets the token sit in  */
/* this folder only, and lets only the files that hold a placement      */
/* import these marks (DETAIL_SITES), so a mark cannot wander onto a    */
/* key, a chip, a photo or the tab bar by an import.                    */
/*                                                                      */
/* CHEAP BY CONSTRUCTION. The geometry is penPath's, cached by its      */
/* arguments, so a mark in a list cell (the feed's closing rule) is one */
/* Map lookup and one static <Path> per render, and nothing here runs   */
/* on a frame clock except the draw-ons (Home's stories rule, and since */
/* v4.9 a tab root's swash as the tab opens), on the UI thread. No      */
/* shadows, no images, no strokeWidth.                                  */
/*                                                                      */
/* INVISIBLE TO EVERYTHING BUT THE EYE. Each mark is pointerEvents none */
/* and hidden from VoiceOver and TalkBack: it carries no meaning, so it */
/* has no label, and a touch passes straight through it.                */
/*                                                                      */
/* HOW TO PLACE ONE. Each mark is a View of its NOMINAL box (a rule is  */
/* length x 6, its centreline 3.4 down; a margin rule is 6 wide, its    */
/* centreline 3 in; the swash is its length x 6), so a caller lines up  */
/* the box and never the ink. The ink's few tenths of a point of spill  */
/* past the box (the round ends, the flick) are drawn by an Svg set     */
/* out from it, so nothing about the ink changes the caller's layout.   */
/* PlateDrip places itself inside the plate.                            */
/* ==================================================================== */

/** Never a VoiceOver element, never a touch target. */
const HIDDEN = {
  pointerEvents: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** A margin rule shorter than this is a tick, not a rule, and is not drawn. */
const MIN_VERTICAL = 8;

/** The ink in its own box, set out from the nominal box by the box's origin. */
function Ink({ shape, placed = true }: { shape: PenShape; placed?: boolean }) {
  const { x, y, w, h } = shape.box;
  return (
    <Svg
      width={w}
      height={h}
      viewBox={`${x} ${y} ${w} ${h}`}
      style={placed ? { position: 'absolute', left: x, top: y } : undefined}>
      {shape.d.map((d, i) => (
        <Path key={i} d={d} fill={colors.accent} />
      ))}
    </Svg>
  );
}

/**
 * The draw-on, with transforms only: a clipping window slides in from
 * the left while the ink inside slides the other way by the same amount,
 * so the ink stands still and the visible part grows from its left end.
 * No width animates and nothing lays out per frame. `draw` is the eased
 * progress (0 undrawn, 1 drawn); at 1 both transforms are the identity.
 */
function DrawOn({ shape, draw }: { shape: PenShape; draw: SharedValue<number> }) {
  const { x, y, w, h } = shape.box;
  const windowStyle = useAnimatedStyle(() => {
    const d = Math.min(1, Math.max(0, draw.value));
    return { transform: [{ translateX: -(1 - d) * w }] };
  });
  const inkStyle = useAnimatedStyle(() => {
    const d = Math.min(1, Math.max(0, draw.value));
    return { transform: [{ translateX: (1 - d) * w }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: w, height: h, overflow: 'hidden' }, windowStyle]}>
      <Animated.View style={[{ width: w, height: h }, inkStyle]}>
        <Ink shape={shape} placed={false} />
      </Animated.View>
    </Animated.View>
  );
}

export interface PenRuleProps {
  /** The rule's length, in points: its nominal box is length x 6, the centreline 3.4 down. */
  length: number;
  /** Which stroke of the pen (PEN_SEED): each placement has its own, so no two read as one stamp. */
  seed?: number;
  /** Home's stories rule only: its draw-on (details/handoff, HOME_RULE_DRAW). */
  draw?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}

/** A horizontal pen rule, drawn left to right. */
export const PenRule = React.memo(function PenRule({ length, seed = PEN_SEED.stories, draw, style }: PenRuleProps) {
  const shape = penRule(length, seed);
  return (
    <View {...HIDDEN} style={[{ width: length, height: PEN.rule.height, overflow: 'visible' }, style]}>
      {draw ? <DrawOn shape={shape} draw={draw} /> : <Ink shape={shape} />}
    </View>
  );
});

export interface PenSwashProps {
  /** min(fontScale, the bar's text cap): the swash grows in length with the title, never in weight. */
  scale?: number;
  /** A tab root's arrival (details/tabArrival, v4.9 B): the swash draws itself in each time the tab opens. Without it, it stands drawn. */
  draw?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}

/** The swash under a tab root's title. Its box is (56 x scale) x 6; its origin goes 1pt right of the title and 2pt above the line box's foot. */
export const PenSwash = React.memo(function PenSwash({ scale = 1, draw, style }: PenSwashProps) {
  const length = PEN.swash.length * scale;
  const shape = penSwash(length);
  return (
    <View {...HIDDEN} style={[{ width: length, height: PEN.swash.height, overflow: 'visible' }, style]}>
      {draw ? <DrawOn shape={shape} draw={draw} /> : <Ink shape={shape} />}
    </View>
  );
});

export interface PenDoubleRuleProps {
  /** The rules' length, in points: the nominal box is length x 10, the upper centreline 3.4 down, the lower 6.6. */
  length: number;
  /** Which stroke of the pen (PEN_SEED) draws the upper rule; the lower is seed + 3, its own stroke. */
  seed: number;
  /**
   * Home's stories rule only (v4.9 C.1): its draw-on. The window is the
   * ink's whole box, so both strokes draw in the one pass, the upper
   * leading by its own 1.5% of length.
   */
  draw?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}

/** Two pen rules, ruled twice by hand, never one thick line: the lower 1.5% shorter and its own stroke. */
export const PenDoubleRule = React.memo(function PenDoubleRule({ length, seed, draw, style }: PenDoubleRuleProps) {
  const shape = doubleRule(length, seed);
  return (
    <View {...HIDDEN} style={[{ width: length, height: DOUBLE.height, overflow: 'visible' }, style]}>
      {draw ? <DrawOn shape={shape} draw={draw} /> : <Ink shape={shape} />}
    </View>
  );
});

export interface PenMarginProps {
  /** 'margin' beside a record, 'column' between two columns: the same rule, its own stroke. */
  kind?: 'margin' | 'column';
  /**
   * Its place, absolute in the block it rules: `left` (the centreline is
   * 3 in from it), `top` (the first line's cap height) and `bottom` (the
   * last line's foot below its baseline). It measures its own height, so
   * the caller never computes a length.
   */
  style: StyleProp<ViewStyle>;
}

/**
 * A vertical pen rule, top to bottom, as long as the space it is given.
 * It draws once it has been laid out (one extra render, on a page, never
 * in a cell), and redraws only when its length changes by a quarter point.
 */
export const PenMargin = React.memo(function PenMargin({ kind = 'margin', style }: PenMarginProps) {
  const [length, setLength] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height * 4) / 4;
    if (h !== length) setLength(h);
  };
  return (
    <View {...HIDDEN} onLayout={onLayout} style={[{ width: PEN.vrule.width, overflow: 'visible' }, style]}>
      {length >= MIN_VERTICAL ? (
        <Ink shape={penVRule(length, kind === 'column' ? PEN_SEED.column : PEN_SEED.margin)} />
      ) : null}
    </View>
  );
});

/**
 * The drip off the caught plate: a child of the plate's own View, which
 * must not clip (overflow visible). It places itself: the run leaves the
 * bottom edge 6pt in from the right corner, starting 1.5pt inside the
 * fill. `border` is the plate's border width, which absolute offsets are
 * measured inside of (the plate's is stroke.edge).
 */
export const PlateDrip = React.memo(function PlateDrip({ border = stroke.edge }: { border?: number }) {
  return (
    <View
      {...HIDDEN}
      style={{
        position: 'absolute',
        right: PEN.drip.inset - border,
        bottom: PEN.drip.overlap - border,
        width: 0,
        height: 0,
        overflow: 'visible',
      }}>
      <Ink shape={plateDrip()} />
    </View>
  );
});
