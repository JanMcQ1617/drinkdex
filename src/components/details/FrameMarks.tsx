import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

import { CORNER_RULE, CROP, cornerL, cornerRule } from './framePath';
import type { PenShape } from './penPath';

/* ==================================================================== */
/* The photo frame: a feed post drawn as a print                        */
/*                                                                      */
/* v4.9 (Jan, 28 Oct 2026; specs/v4.9/details/spec.md C.1). Jan picked  */
/* "pen crop-corner marks around post photos". A feed photo bleeds to   */
/* the screen's edges, so a crop mark outside the photo could only be a */
/* dash at the edge, which read as a rendering fault; so the POST is    */
/* the print, and the pen marks its corners: the anti-diagonal pair, 8  */
/* in from the screen's edges, 15pt arms at the logo's weight (1.45).   */
/*                                                                      */
/*   top right    an L at { top: 3, right: 8 }, 13pt clear of the •••   */
/*                and 34pt above the photo; not on the first post,      */
/*                which sits under the stories rule's lower stroke      */
/*   bottom left  on Home, the corner and the 24pt closing rule as ONE  */
/*                stroke (cornerRule: no seam between them), at         */
/*                { left: 8, bottom: 3 }; on the post page, which has   */
/*                no closing rule, the plain L there                    */
/*                                                                      */
/* NEVER ON THE PHOTO (rule 11): the nearest ink is 34pt above it, with */
/* the header between. Four brackets would be a camera's viewfinder,    */
/* which beside the post key reads as "take a photo", so it is never    */
/* four.                                                                */
/*                                                                      */
/* CHEAP IN A CELL. Two cached constant paths placed by the card's own  */
/* edges: no layout, no state, no measuring. Hidden and untouchable, as */
/* every detail mark, and in `colors.accent` alone (rule 17's tier).    */
/* An empty state's corners are part of its one-path composition        */
/* (DoodleMarks' EmptyMarks), so there is no corners component here.    */
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

/** In from the screen's edges, and in from the card's top and foot. */
const INSET = 8;
const EDGE = 3;

export interface PostCornersProps {
  /** The top-right corner: off on Home's first post, which sits under the stories rule. */
  top?: boolean;
  /** 'rule' on Home (the corner turns into the closing rule), 'corner' on the post page (the L alone). */
  foot: 'rule' | 'corner';
}

/**
 * A post's corners, as absolute children of the card's root: they place
 * themselves by the card's edges, so the card's height is never needed.
 */
export const PostCorners = React.memo(function PostCorners({ top = true, foot }: PostCornersProps) {
  const arm = CROP.arm;
  return (
    <>
      {top ? (
        <View {...HIDDEN} style={{ position: 'absolute', top: EDGE, right: INSET, width: arm, height: arm, overflow: 'visible' }}>
          <Ink shape={cornerL(arm, 'tr')} />
        </View>
      ) : null}
      {foot === 'rule' ? (
        <View
          {...HIDDEN}
          style={{
            position: 'absolute',
            left: INSET,
            bottom: EDGE,
            width: CORNER_RULE.run,
            height: CORNER_RULE.arm,
            overflow: 'visible',
          }}>
          <Ink shape={cornerRule()} />
        </View>
      ) : (
        <View {...HIDDEN} style={{ position: 'absolute', left: INSET, bottom: EDGE, width: arm, height: arm, overflow: 'visible' }}>
          <Ink shape={cornerL(arm, 'bl')} />
        </View>
      )}
    </>
  );
});
