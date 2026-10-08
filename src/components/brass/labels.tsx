import React, { useState } from 'react';
import {
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/icons';
import { colors, onMedia, space, stroke, textRole } from '@/constants/theme';
import { textWidth } from '@/lib/textFit';

/* ==================================================================== */
/* Bottle labels (Brass D6)                                             */
/*                                                                      */
/* The things you tick, and the things that say "this is yours", are    */
/* bottle labels: chamfered label stock (corners cut at 45 degrees, not */
/* rounded, so no pill) with a brassShade edge. The shape is one SVG    */
/* path behind ordinary Views and Text, from the pure chamferPath       */
/* below, rebuilt only when the size changes.                           */
/*                                                                      */
/* The skin is onMedia.plaque.label, the plate check-contrast audits    */
/* over a photo (text 12.73:1, the wine check 11.38:1, against the      */
/* label itself), so the same tag is right on paper and over a picture. */
/* ==================================================================== */

/**
 * A rectangle with its four corners cut at 45 degrees by `c`, inset by
 * `inset` (an inner rule), its edges on half points so a 1pt stroke lands
 * crisp. Pure: the same numbers give the same string.
 */
export function chamferPath(w: number, h: number, c: number, inset = 0): string {
  const a = inset + 0.5;
  const r = w - inset - 0.5;
  const b = h - inset - 0.5;
  const k = Math.max(0, Math.min(c - inset * 0.4, (r - a) / 2, (b - a) / 2));
  const n = (v: number) => v.toFixed(2);
  return (
    `M${n(a + k)} ${n(a)}H${n(r - k)}L${n(r)} ${n(a + k)}V${n(b - k)}` +
    `L${n(r - k)} ${n(b)}H${n(a + k)}L${n(a)} ${n(b - k)}V${n(a + k)}Z`
  );
}

/* -------------------------------------------------------------------- */
/* LabelTag: "In your Dex", "In their Dex"                              */
/* -------------------------------------------------------------------- */

const TAG = {
  /** The likers sheet's mini tag. */
  sm: { height: 20, pad: 6, icon: 11, gap: 4, chamfer: 4 },
  /** Over a feed photo, one row with the lg plate. */
  md: { height: 24, pad: 8, icon: 13, gap: 5, chamfer: 4 },
} as const;
export type LabelTagSize = keyof typeof TAG;
/** A tag sits on a fixed row, so its word grows only so far. */
const TAG_CAP = 1.3;

/** The tag's box at this text size, worked out (textFit errs wide), so a row can place it with no layout pass. */
export function labelTagSize(text: string, size: LabelTagSize, fontScale: number): { width: number; height: number } {
  const t = TAG[size];
  const s = Math.min(fontScale, TAG_CAP);
  const word = textWidth(text, 'inter', textRole.statusWord.fontSize * s);
  return {
    width: Math.ceil(2 * t.pad + t.icon + t.gap + word + 2 * stroke.edge),
    height: Math.max(t.height, Math.ceil(textRole.statusWord.lineHeight * s) + 6),
  };
}

/**
 * A small bottle-label tag with a wine check: "In your Dex" on a feed
 * photo or the post page, "In their Dex" beside a liker who has caught
 * the drink. A statement, not a button; it is spoken through the row or
 * nameplate that holds it, so it is hidden from VoiceOver here.
 */
export const LabelTag = React.memo(function LabelTag({
  text,
  size = 'sm',
}: {
  text: string;
  size?: LabelTagSize;
}) {
  const { fontScale } = useWindowDimensions();
  const t = TAG[size];
  const box = labelTagSize(text, size, fontScale);
  const skin = onMedia.plaque.label;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tag, { width: box.width, height: box.height, paddingHorizontal: t.pad, gap: t.gap }]}>
      <Svg width={box.width} height={box.height} style={StyleSheet.absoluteFill}>
        <Path d={chamferPath(box.width, box.height, t.chamfer)} fill={skin.fill} stroke={skin.edge} strokeWidth={stroke.edge} />
      </Svg>
      <Icon name="check" size={t.icon} color={skin.mark} />
      <Text maxFontSizeMultiplier={TAG_CAP} numberOfLines={1} style={[textRole.statusWord, { color: skin.ink }]}>
        {text}
      </Text>
    </View>
  );
});

/* -------------------------------------------------------------------- */
/* BottleLabel: the frame of a checklist row                            */
/* -------------------------------------------------------------------- */

/** The checklist label's corner cut and its inner rule's inset. */
const LABEL_CHAMFER = 7;
const INNER_INSET = 2.5;

/**
 * The frame of one My Bar checklist label. Ticked: label stock, a
 * brassShade edge and an inner brass rule (the printed border of a real
 * bottle label). Unticked: plain white with a `line` edge. A frame only;
 * the caller puts the checkbox, words, glyph and rank inside and owns the
 * press, the state and what VoiceOver says.
 *
 * Sized by layout, measured once (and again only if the text size moves
 * it): the label grows with Dynamic Type and never truncates. Before the
 * first measure it draws no frame for one frame, words on the page.
 */
export const BottleLabel = React.memo(function BottleLabel({
  ticked,
  children,
  style,
}: {
  ticked: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  };
  return (
    <View onLayout={onLayout} style={[styles.label, style]}>
      {size ? (
        <Svg
          width={size.w}
          height={size.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Path
            d={chamferPath(size.w, size.h, LABEL_CHAMFER)}
            fill={ticked ? colors.label : colors.surface}
            stroke={ticked ? colors.brassShade : colors.line}
            strokeWidth={stroke.edge}
          />
          {ticked ? (
            <Path
              d={chamferPath(size.w, size.h, LABEL_CHAMFER, INNER_INSET)}
              fill="none"
              stroke={colors.brass}
              strokeOpacity={0.85}
              strokeWidth={0.8}
            />
          ) : null}
        </Svg>
      ) : null}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  label: { minHeight: 50, paddingHorizontal: space.md, paddingVertical: space.sm },
});
