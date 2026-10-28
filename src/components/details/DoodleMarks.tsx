import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

import {
  ARROW,
  arrow,
  crown,
  DOODLE_BOX,
  type DoodleName,
  DOODLES,
  emptyCluster,
  SIGN_ROT,
  signature,
} from './doodlePath';
import type { PenShape } from './penPath';

/* ==================================================================== */
/* The doodles: the logo's paint pen drawing a garnish                  */
/*                                                                      */
/* v4.9 (Jan, 28 Oct 2026; specs/v4.9/details/spec.md A.3). "I like the */
/* line under the text, but it still feels too empty", and the first of */
/* the three directions he picked: red paint-pen doodles on empty       */
/* screens and at the ends of lists, and a pen crown on the Tournaments */
/* leader. The geometry is doodlePath's; this file only fills it.       */
/*                                                                      */
/*   Doodle      one garnish at a scale and a turn (no placement uses   */
/*               it bare today: every one sits in a cluster or a sign)  */
/*   EndMark     a list's end, SIGNED: the screen's doodle and the      */
/*               swash under it, right-aligned on the content edge      */
/*   EmptyMarks  an empty state's whole composition, the print's crop   */
/*               corners and its doodles, or two doodles over a glyph   */
/*   PenCrown    the crown on the Tournaments leader's face             */
/*   PenArrow    the hook from beside an empty state's body round to    */
/*               its key: Home's "Find friends" and the Dex's "Show     */
/*               every drink", never a key that posts or logs a drink   */
/*                                                                      */
/* ORNAMENT, NOT INFORMATION, as every detail mark (PenMarks): no mark  */
/* adds a word, a count or a state, none turns a state red, and the one */
/* that follows data, the crown, only repeats a place that is shown and */
/* spoken. Campari at 100%, `colors.accent` alone, never accentPressed  */
/* (check-design rule 17's detail tier), and placed only from the files */
/* DETAIL_SITES lists, so a doodle cannot wander onto a sheet, a dead   */
/* end or a key by an import. EmptyState draws EmptyMarks and PenArrow  */
/* only for a caller that opts in (DETAIL_PROPS).                       */
/*                                                                      */
/* ONE PATH A MARK. Each is one <Path> in one <Svg> (on Fabric a Path   */
/* is a native view), cached by its arguments, measured never: these    */
/* sit in or beside list cells, so each costs a Map lookup a render.    */
/*                                                                      */
/* INVISIBLE TO EVERYTHING BUT THE EYE, and placed by BOXES, exactly as */
/* PenMarks' marks: a View of the mark's nominal box (or a zero-size    */
/* anchor), pointerEvents none and hidden from VoiceOver and TalkBack,  */
/* the ink in an Svg set out from it with overflow visible.             */
/* ==================================================================== */

/** Never a VoiceOver element, never a touch target. */
const HIDDEN = {
  pointerEvents: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** The ink in its own box, set out from the nominal box by the box's origin (PenMarks' Ink, the same way). */
function Ink({ shape }: { shape: PenShape }) {
  const { x, y, w, h } = shape.box;
  return (
    <Svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} style={{ position: 'absolute', left: x, top: y }}>
      {shape.d.map((d, i) => (
        <Path key={i} d={d} fill={colors.accent} />
      ))}
    </Svg>
  );
}

/** A zero-size anchor: the frame a composition or the arrow is drawn in. */
const ANCHOR = { position: 'absolute', width: 0, height: 0, overflow: 'visible' } as const;

export interface DoodleProps {
  name: DoodleName;
  /** Moves the drawing, never the pen: its centrelines grow, its widths stay the logo's. */
  scale?: number;
  /** Degrees, baked into the path about the box's centre, never a transform. */
  rot?: number;
  style?: StyleProp<ViewStyle>;
}

/** One garnish in its nominal box (DOODLE_BOX x scale). */
export const Doodle = React.memo(function Doodle({ name, scale = 1, rot = 0, style }: DoodleProps) {
  const [bw, bh] = DOODLE_BOX[name];
  return (
    <View {...HIDDEN} style={[{ width: bw * scale, height: bh * scale, overflow: 'visible' }, style]}>
      <Ink shape={DOODLES[name](scale, rot)} />
    </View>
  );
});

export interface EndMarkProps {
  /** The screen's doodle (spec C.10's table): Home's coupe, the Dex's lime, and on. */
  name: DoodleName;
  /** Its margins in the footer: the mark sets its own size and its alignSelf. */
  style?: StyleProp<ViewStyle>;
}

/**
 * A list's end, signed: the doodle at 1.2, turned as the table turns it,
 * and the swash under it, in a box of its own nominal size (56 x 64.8
 * for most; the olive's 71.2 x 79.2 overhangs the swash's start, as a
 * signature's initial does). Right-aligned on its parent's content edge,
 * never centred like an icon. One static node in a footer, never a cell.
 */
export const EndMark = React.memo(function EndMark({ name, style }: EndMarkProps) {
  const shape = signature(name, SIGN_ROT[name]);
  const [w, h] = shape.nominal;
  return (
    <View {...HIDDEN} style={[{ width: w, height: h, alignSelf: 'flex-end', overflow: 'visible' }, style]}>
      <Ink shape={shape} />
    </View>
  );
});

export interface EmptyMarksProps {
  /** The empty state's subject: its row in doodlePath's ART_CLUSTER or ICON_CLUSTER. */
  name: DoodleName;
  /** 'art' round the 120 x 150 EmptyArt print (its crop corners too), 'icon' over the 36pt glyph. */
  kind: 'icon' | 'art';
}

/**
 * An empty state's composition, ONE path, at the picture's (0, 0): a
 * zero-size anchor that EmptyState sets in the picture's own wrapper,
 * so the print or the glyph's box is the frame the cluster was composed
 * in. It never lays anything out.
 */
export const EmptyMarks = React.memo(function EmptyMarks({ name, kind }: EmptyMarksProps) {
  return (
    <View {...HIDDEN} style={[ANCHOR, { left: 0, top: 0 }]}>
      <Ink shape={emptyCluster(name, kind)} />
    </View>
  );
});

export interface PenCrownProps {
  /** The face it perches on: a Friends row's 40, or a live Leaderboard's 32 (the crown at 0.8). */
  face: 40 | 32;
}

/**
 * The crown on the leader's face. It places itself, as PlateDrip does,
 * as an absolute child of the Avatar's own wrapper (a plain View round
 * it), so the rank column's growth with Larger Text never moves it: off
 * the face's top right, 0.5pt above it, tilted 8 degrees (baked).
 */
export const PenCrown = React.memo(function PenCrown({ face }: PenCrownProps) {
  const s = face / 40;
  const [bw, bh] = DOODLE_BOX.crown;
  return (
    <View
      {...HIDDEN}
      style={{ position: 'absolute', left: 22.5 * s, top: -13.5 * s, width: bw * s, height: bh * s, overflow: 'visible' }}>
      <Ink shape={crown(s, 8)} />
    </View>
  );
});

/**
 * The arrow to an empty state's key, from beside the body round to the
 * key's middle, ending 14pt clear of it. A zero-size anchor at the top
 * right of the action's wrapper (`left: '100%'`), so it follows the key
 * wherever the words push it. EmptyState draws it only on the two
 * art-led keys that lead somewhere to look, and only where it fits
 * (text size 1.15 and under, a phone 372pt wide and up; spec C.9).
 */
export const PenArrow = React.memo(function PenArrow() {
  return (
    <View {...HIDDEN} style={[ANCHOR, { top: 0, left: '100%' }]}>
      <Ink shape={arrow(ARROW.from, ARROW.to, ARROW.bend)} />
    </View>
  );
});
