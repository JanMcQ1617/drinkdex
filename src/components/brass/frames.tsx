import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, radius, stroke } from '@/constants/theme';

/* ==================================================================== */
/* Brass frames: brackets, keylines, bevels, the avatar bezel           */
/*                                                                      */
/* What is FRAMED gets brass. One weight and one colour everywhere: it  */
/* means "caught" (a mount) or "framed" (a print), never a tier, so     */
/* nothing here takes a drink or reads anything about it.               */
/*                                                                      */
/* Static and decorative: hidden from VoiceOver, untouchable, never     */
/* animated. The SVGs are memoised on their size, so a feed that        */
/* re-renders a post does not rebuild its brackets.                     */
/*                                                                      */
/* No gradient stop here takes an rgba (rule 13): the bezel's three     */
/* stops are opaque tokens and still spread svgStop's shape by hand.    */
/* ==================================================================== */

/** D4 geometry: the brackets sit 8pt inside the print; each arm 22 long, 3 thick, on an 8pt corner plate. */
export const BRACKET_INSET = 8;
const ARM = 22;
const BAR = 3;
const PLATE = 8;
/** One bracket, drawn at the top-left corner; the other three are this L mirrored. */
const L_PATH = `M0 0H${ARM}V${BAR}H${PLATE}V${PLATE}H${BAR}V${ARM}H0Z`;
/** Its lit outer edge. */
const L_LIT = `M0.4 ${ARM - 0.5}V0.4H${ARM - 0.5}`;

/**
 * D4 · four brass corner brackets on a framed photograph (the feed post,
 * the post page; recommended on the drink page hero and Log's preview).
 * Not on grid tiles or cards: too small and too many.
 *
 * Absolute over the photo at inset 8; draw it AFTER the nameplate's scrim
 * so it stays bright. The bottom-left bracket ends at x 11, 7pt short of a
 * nameplate whose text starts at 18. Each bracket is its drop shadow (the
 * same L 1pt lower in bracketShadow, since react-native-svg has no
 * filter), the brass L with a brassShade edge, its lit edge and a screw.
 * 16 elements in one Svg, rebuilt only when the photo changes size.
 */
export const CornerBrackets = React.memo(function CornerBrackets({
  width,
  height,
}: {
  /** The photo's size in points. */
  width: number;
  height: number;
}) {
  const w = width - 2 * BRACKET_INSET;
  const h = height - 2 * BRACKET_INSET;
  if (w < 2 * ARM || h < 2 * ARM) return null;
  const corners = [
    `translate(0 0)`,
    `translate(${w} 0) scale(-1 1)`,
    `translate(0 ${h}) scale(1 -1)`,
    `translate(${w} ${h}) scale(-1 -1)`,
  ];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.brackets}>
      <Svg width={w} height={h}>
        {corners.map((transform) => (
          <G key={transform} transform={transform}>
            <Path d={L_PATH} fill={colors.bracketShadow} transform="translate(0 1)" />
            <Path d={L_PATH} fill={colors.brass} stroke={colors.brassShade} strokeWidth={0.75} />
            <Path d={L_LIT} fill="none" stroke={colors.brassLit} strokeOpacity={0.9} strokeWidth={0.75} />
            <Circle cx={PLATE / 2} cy={PLATE / 2} r={1.9} fill={colors.brassShade} />
            <Line
              x1={PLATE / 2 - 1.2}
              y1={PLATE / 2 + 1.2}
              x2={PLATE / 2 + 1.2}
              y2={PLATE / 2 - 1.2}
              stroke={colors.brassLit}
              strokeWidth={0.7}
            />
          </G>
        ))}
      </Svg>
    </View>
  );
});

/**
 * D3 · the brass keyline inside a mount: 1pt brass at `inset` (3; 1 on a
 * thumb, whose mat is only 3pt), at the concentric radius. Laid first in
 * the mount, under its content. Uniform on every caught card: it is not
 * the v3 tier rule v3.1 removed, and it takes no drink.
 */
export const MountKeyline = React.memo(function MountKeyline({
  outerRadius,
  inset = 3,
}: {
  /** The mount's own corner radius. */
  outerRadius: number;
  inset?: number;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.keyline,
        { top: inset, left: inset, right: inset, bottom: inset, borderRadius: Math.max(outerRadius - inset, 1) },
      ]}
    />
  );
});

/**
 * D17 · the window bevel: the cut edge of a mat lit from above, a dark
 * 1pt lip over the window and a lit one under it. Two absolute lines
 * hung 1pt outside the box they are laid in, so the window itself is
 * not resized; the parent must not clip (a window clips its photo, so put
 * this beside the window in a wrapper, as cabinet.tsx's MountWindow does).
 * Not on slots: a recess has no mat to cut.
 */
export function WindowBevel() {
  return (
    <>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" style={styles.bevelTop} />
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" style={styles.bevelFoot} />
    </>
  );
}

/**
 * D16 · a post author's brass hairline: a 1pt brass ring around the
 * avatar with a 1pt gap of the ground between. Pass the avatar's own
 * size; the frame is that plus 4. Decorative.
 */
export function BrassHairline({ size, children }: { size: number; children: React.ReactNode }) {
  const outer = size + 4;
  return (
    <View
      style={[
        styles.hairline,
        // round-ok: avatar (its ring)
        { width: outer, height: outer, borderRadius: radius.round },
      ]}>
      {children}
    </View>
  );
}

/** D14 geometry: a 4pt ring and a 2pt gap of paper around the avatar. */
const BEZEL_RING = 4;
const BEZEL_GAP = 2;

/** The bezel's outer size for an avatar of `size`: 80 -> 92. */
export function bezelSize(size: number): number {
  return size + 2 * (BEZEL_RING + BEZEL_GAP);
}

/**
 * D14 · the brass bezel around the Profile header's avatar (own and a
 * peer's; feed and likers avatars stay plain). One Svg: a 4pt ring
 * stroked with a 135-degree gradient, lit top left (brassLit, brass at
 * 45%, brassShade), then the avatar centred with a 2pt gap. A linear
 * gradient because react-native-svg has no conic one. An avatar ring, so
 * round.
 */
export const BrassBezel = React.memo(function BrassBezel({
  size,
  children,
}: {
  /** The avatar's own size (80 on Profile). */
  size: number;
  children: React.ReactNode;
}) {
  const outer = bezelSize(size);
  const r = (outer - BEZEL_RING) / 2;
  // A per-size id is enough: every bezel of one size draws the same gradient.
  const id = `bezel${outer}`;
  return (
    <View style={{ width: outer, height: outer }}>
      <Svg
        width={outer}
        height={outer}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.brassLit} stopOpacity={1} />
            <Stop offset="0.45" stopColor={colors.brass} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.brassShade} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Circle cx={outer / 2} cy={outer / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={BEZEL_RING} />
      </Svg>
      <View style={styles.bezelFace}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  brackets: {
    position: 'absolute',
    top: BRACKET_INSET,
    left: BRACKET_INSET,
    right: BRACKET_INSET,
    bottom: BRACKET_INSET,
  },
  keyline: { position: 'absolute', borderWidth: stroke.edge, borderColor: colors.brass },
  bevelTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -stroke.edge,
    height: stroke.edge,
    backgroundColor: colors.bevelTop,
  },
  bevelFoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -stroke.edge,
    height: stroke.edge,
    backgroundColor: colors.bevelFoot,
  },
  hairline: {
    borderWidth: stroke.edge,
    borderColor: colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bezelFace: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
