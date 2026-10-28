import React from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { inkRoom } from '@/components/details/lineMarks';
import { Icon } from '@/components/icons';
import { colors, radius, space, stroke, textRole } from '@/constants/theme';
import { faceOf, fitScale } from '@/lib/textFit';

/* ==================================================================== */
/* Shared drawing pieces                                                */
/*                                                                      */
/* DrinkName (the only way a drink's name is drawn), Print (a photo     */
/* hung like a print), the in-Dex tag and the SVG stop helper. The v3   */
/* cabinet's materials are gone (white spec section 4): a photo is      */
/* framed by Print, and groups are separated by space.                  */
/*                                                                      */
/* Nothing here loads an image or animates.                             */
/* ==================================================================== */

/**
 * A colour token as an SVG gradient stop: `rgba(14, 11, 11, 0.62)` becomes
 * `rgb(14, 11, 11)` at stopOpacity 0.62 (times `opacity`).
 *
 * Every <Stop> with a translucent token must go through this.
 * react-native-svg's native gradients throw away the alpha of an rgba (or
 * 8-digit hex) stopColor and take stopOpacity alone, which defaults to 1:
 * handed straight in, a 0.62 scrim paints solid black on iOS and a clear
 * stop paints opaque. The web passes the string to the browser and draws
 * it right, so a web render never shows the difference.
 */
export function svgStop(color: string, opacity = 1): { stopColor: string; stopOpacity: number } {
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color);
  if (rgba) {
    const alpha = rgba[4] == null ? 1 : Number(rgba[4]);
    return { stopColor: `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`, stopOpacity: alpha * opacity };
  }
  const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(color);
  if (hex8) return { stopColor: `#${hex8[1]}`, stopOpacity: (parseInt(hex8[2]!, 16) / 255) * opacity };
  if (color === 'transparent') return { stopColor: 'rgb(0, 0, 0)', stopOpacity: 0 };
  return { stopColor: color, stopOpacity: opacity };
}

/* ==================================================================== */
/* DrinkName                                                            */
/* ==================================================================== */

/** The smallest a name is shrunk to, in the marker and in a text role (points, as drawn). */
const DISPLAY_FLOOR = 15;
const TEXT_FLOOR = 11;

/**
 * DrinkName's own fit: the scale it draws `role` at for `name` in
 * `measure` at this text size, so a caller that places something on the
 * name's lines (the drink page's margin rule) meets the size it draws.
 */
export function nameFit(name: string, role: TextStyle, measure: number, cap: number, fontScale: number): number {
  const face = faceOf(role.fontFamily);
  const size = (role.fontSize ?? textRole.name.fontSize) * Math.min(fontScale, cap);
  return fitScale(name, face, size, measure, face === 'display' ? DISPLAY_FLOOR : TEXT_FLOOR);
}

/**
 * A drink's name, and the ONLY way one is drawn (specs/v3-cabinet.md 6.4).
 * Since v4.10 it is written in the marker, Sedgwick Ave, the nearest hand
 * to the logo's paint pen (specs/v4.10/spec.md T.4): catalogue names and a
 * custom drink's alike, since a second face in one grid would read as a
 * bug.
 *
 * Names never truncate: no `numberOfLines`, no `adjustsFontSizeToFit`. They
 * wrap at word boundaries and their containers grow. What a line limit
 * used to hide is a word wider than its column, which iOS would break
 * mid-word ("Holunderbeergei / st"), so the role is shrunk until the
 * name's widest unbreakable run fits `measure`: never below 15pt in the
 * marker, whose thin hand stops reading as a name under it, and never
 * below 11pt in a text role. Short names are untouched; a name with a long
 * word shrinks only as far as it must. No catalogue name needs it at the
 * grid's 22; a custom drink can.
 *
 * The size is worked out, not measured (lib/textFit.ts): at this Dynamic
 * Type size the role would draw at `role.fontSize × min(fontScale, cap)`,
 * the fit scale is taken against that, and the Text is given the scaled
 * role with `maxFontSizeMultiplier={cap}`, so iOS's own multiplier lands
 * it on the fitted size. Pure layout: no state and no onLayout, so the
 * first frame is the final one.
 *
 * INK ROOM. The marker's tails and accents reach past its line box, and
 * iOS clips a Text to its bounds, so the Text takes lineMarks' inkRoom at
 * the size it is drawn: padding past the line box above and below, taken
 * back as negative margin from the caller's own margins, so the layout is
 * still the line box and the q of "Daiquiri" and the dot of "Żubrówka"
 * are whole. A text role (a locked Dex card's) takes none.
 *
 * `measure` is the column's width in points, which every call site knows
 * from the window width (the table in 6.4). `role` is one of theme.ts's
 * name roles (a locked Dex card passes its Archivo 500 15/20 instead).
 * `cap` is at most 1.3 at every site, so no marker line draws above 1.3
 * times its role.
 */
export function DrinkName({
  name,
  role,
  measure,
  cap,
  color,
  align = 'left',
  accessibilityRole,
  style,
}: {
  name: string;
  role: TextStyle;
  measure: number;
  /** maxFontSizeMultiplier (specs/v3-cabinet.md 6.5). */
  cap: number;
  color: string;
  align?: 'left' | 'center';
  accessibilityRole?: 'header' | 'text';
  /** Placement and shadows. Size and line height are DrinkName's. */
  style?: StyleProp<TextStyle>;
}) {
  const { fontScale } = useWindowDimensions();
  const fontSize = role.fontSize ?? textRole.name.fontSize;
  const lineHeight = role.lineHeight ?? Math.round(fontSize * 1.25);
  const face = faceOf(role.fontFamily);
  const grown = Math.min(fontScale, cap);
  const scale = nameFit(name, role, measure, cap, fontScale);
  return (
    <Text
      maxFontSizeMultiplier={cap}
      accessibilityRole={accessibilityRole}
      style={[
        role,
        { color, textAlign: align },
        style,
        { fontSize: fontSize * scale, lineHeight: lineHeight * scale },
        role.letterSpacing != null && { letterSpacing: role.letterSpacing * scale },
        face === 'display' && inkRoom('display', fontSize * scale * grown, style),
      ]}>
      {name}
    </Text>
  );
}

/* ==================================================================== */
/* Print                                                                */
/* ==================================================================== */

/**
 * A photograph hung like a print (white spec D5): square corners, the wash
 * ground until it decodes, and a 1pt `photoEdge` drawn over the picture, so
 * a blown-out user photo still has an edge on white. Clips its child (a
 * DrinkFace or a signed photo); draws no image itself, so it decides no
 * decode size. Decorative: the row or post that holds it speaks.
 */
export function Print({
  width,
  height,
  children,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.print, { width, height }, style]}>
      {children}
      <View pointerEvents="none" style={styles.printEdge} />
    </View>
  );
}

/**
 * "In your Dex": a check and the words, muted on a 1pt hair edge (the drink
 * page, beside the plate). The not-yet state has its own quieter tag where
 * it is drawn (DrinkPanels' NotYetTag); v4 lists carry no tags at all.
 */
export function DexStatusTag() {
  return (
    <View style={styles.statusTag}>
      <Icon name="check" size={TAG_ICON} color={colors.textMuted} />
      <Text maxFontSizeMultiplier={TAG_CAP} style={[styles.statusTagText, { color: colors.textMuted }]}>
        In your Dex
      </Text>
    </View>
  );
}

const TAG_ICON = 12;
const TAG_CAP = 1.3;

const styles = StyleSheet.create({
  /* Print */
  print: { overflow: 'hidden', backgroundColor: colors.bgSunk, borderRadius: radius.none },
  printEdge: { ...StyleSheet.absoluteFill, borderWidth: stroke.edge, borderColor: colors.photoEdge },

  /* DexStatusTag */
  statusTag: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.hair,
  },
  statusTagText: textRole.statusWord,
});
