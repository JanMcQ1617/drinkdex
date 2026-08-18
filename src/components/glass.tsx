import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { elevation, glass, radius } from '@/constants/theme';

/* ==================================================================== */
/* Glass surfaces                                                       */
/*                                                                      */
/* One material, two implementations:                                   */
/*                                                                      */
/*   iOS 26+  real Liquid Glass via expo-glass-effect. It samples and   */
/*            refracts what is actually behind it, so it reacts to      */
/*            scrolling content the way the system tab bar does.        */
/*   else     a hand-built stand-in. There is no blur primitive in the  */
/*            dependency set, so instead of a bad blur we build a       */
/*            convincing SLAB: translucent fill, a specular sheen down  */
/*            the top third, and a rim that is bright on top and dim    */
/*            around the rest. That asymmetry is what reads as "a lit   */
/*            piece of glass" rather than "a gray box".                 */
/*                                                                      */
/* Why not just use opacity: a flat translucent rectangle looks like a  */
/* mistake. Glass needs an edge and a highlight or the eye files it as  */
/* a rendering bug.                                                     */
/* ==================================================================== */

/**
 * True only where the OS can render the real material.
 *
 * Exported because a few callers need to *compensate*: native glass
 * already carries its own shadow and rim, so drawing ours on top of it
 * double-draws the edge.
 */
export const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

export type GlassTone = 'plain' | 'wine';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  /** Corner radius. Drives the sheen clip, so pass the real value. */
  cornerRadius?: number;
  /** `wine` tints the material with the brand color — selected states. */
  tone?: GlassTone;
  /** Opaque enough to sit over artwork rather than over the page. */
  strong?: boolean;
  /** Native glass only: the material bends toward touches. */
  interactive?: boolean;
  /** Drop the lift. Surfaces flush against an edge don't cast. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The sheen. An SVG gradient rather than a stack of opacity layers,
 * because banding across a 40pt band is visible on OLED and a real
 * gradient costs one static draw.
 */
function Sheen({ cornerRadius }: { cornerRadius: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="glassSheen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={glass.sheenFrom} />
          <Stop offset="1" stopColor={glass.sheenTo} />
        </LinearGradient>
      </Defs>
      {/*
       * Height 62% — the highlight has to die out well before the bottom
       * edge or the surface reads as a gradient fill instead of a
       * reflection. rx keeps the top corners honest.
       */}
      <Rect x="0" y="0" width="100%" height="62%" rx={cornerRadius} fill="url(#glassSheen)" />
    </Svg>
  );
}

/**
 * A pane of glass.
 *
 * Renders children above the material. Clips them to the corner radius,
 * so callers don't have to remember `overflow: 'hidden'`.
 */
export function GlassSurface({
  children,
  cornerRadius = radius.xl,
  tone = 'plain',
  strong = false,
  interactive = false,
  flat = false,
  style,
}: GlassSurfaceProps) {
  const lift = flat ? null : elevation.raised;

  if (LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        tintColor={tone === 'wine' ? glass.fillWine : glass.nativeTint}
        // Our palette is light-first and does not follow the system
        // appearance; 'auto' would darken the material in dark mode and
        // strand the wine ink on top of it.
        colorScheme="light"
        style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, lift, style]}>
        {/*
          * Native Liquid Glass draws NO border of its own — the hairline and
          * lit edge below belong to the fallback branch only. On the old
          * porcelain page the material had enough tint difference to find its
          * own edge; against the white page it resolves to near-white and the
          * surface loses its silhouette. This is that branch's only contour.
          */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: cornerRadius,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: glass.rimContour,
            },
          ]}
        />
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: cornerRadius,
          backgroundColor: strong ? glass.fillStrong : glass.fill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: glass.rim,
          overflow: 'hidden',
        },
        lift,
        style,
      ]}>
      <Sheen cornerRadius={cornerRadius} />
      {tone === 'wine' ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: glass.fillWine }]}
        />
      ) : null}
      {/* The lit edge. A full border can't be brighter on one side. */}
      <View pointerEvents="none" style={styles.rimTop} />
      {children}
    </View>
  );
}

/**
 * Circular glass button — floating back buttons, close affordances, and
 * anything that has to sit legibly on top of artwork.
 *
 * Sizing note: 44 is the floor, not a default to shave. It is the iOS
 * minimum touch target and these land on photographs where a miss is
 * common.
 */
export function GlassCircle({
  size = 44,
  children,
  strong = true,
  style,
}: {
  size?: number;
  children?: React.ReactNode;
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <GlassSurface
      cornerRadius={size / 2}
      strong={strong}
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  rimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.rimTop,
  },
});
