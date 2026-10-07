import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons';
import { colors, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { lookOf } from '@/data/barShelf';
import type { Ingredient } from '@/lib/bar';

import { BottleArt, fitArt } from './BottleArt';

/* ==================================================================== */
/* Controls the counter and the add sheet share                         */
/* ==================================================================== */

/**
 * Put a thing on the shelf, or take it off: the row's own control.
 *
 * Off: the secondary button (white, espresso edge, a plus, "Add"). On:
 * wine on its wash with a wine edge and a check ("Added", "On shelf"), the
 * Chip's selected skin, so the state never rests on colour alone and
 * VoiceOver hears it as selected. Tapping it again takes the thing off.
 * 36pt with 4pt of slop above and below, like Button size="sm".
 */
export function ShelfToggle({
  on,
  onLabel,
  onPress,
  accessibilityLabel,
}: {
  on: boolean;
  /** "Added" under One thing short, "On shelf" in the sheet. */
  onLabel: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const ink = on ? colors.wine : colors.text;
  return (
    <Pressable
      // No tick here: the screen's toggle ticks once for every way onto the shelf.
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: on }}
      accessibilityHint={on ? 'Double-tap to take it off the shelf' : 'Double-tap to put it on the shelf'}
      style={({ pressed }) => [
        styles.toggle,
        on ? styles.toggleOn : styles.toggleOff,
        pressed && (on ? styles.toggleOnPressed : styles.toggleOffPressed),
      ]}>
      <Icon name={on ? 'check' : 'plus'} size={16} color={ink} />
      <Text style={[textRole.buttonSm, { color: ink }]}>{on ? onLabel : 'Add'}</Text>
    </Pressable>
  );
}

/**
 * A small window onto the lining with one bottle standing in it: lit when
 * it is yours, stamped when it is not. Decorative.
 */
export const BottleWindow = React.memo(function BottleWindow({
  ingredient,
  lit,
  width,
  height,
}: {
  ingredient: Ingredient;
  lit: boolean;
  width: number;
  height: number;
}) {
  const look = lookOf(ingredient);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.window, { width, height }]}>
      <BottleArt look={look} lit={lit} scale={fitArt(look, width, height)} />
    </View>
  );
});

/**
 * A row with a bottle: its window, a title and a line under it, and the
 * toggle at the end. Static, with its own control, so VoiceOver reaches
 * the toggle (a pressable row would swallow it); the toggle's label says
 * everything the row does, so the text is not read a second time, unless
 * `reveal` makes the text its own button.
 * `children` hangs under the row's text (the drinks an Add just lit, or
 * the ones it would pour once revealed).
 */
export function BottleRow({
  ingredient,
  lit,
  title,
  subtitle,
  toggle,
  first,
  window = SMALL_WINDOW,
  reveal,
  children,
  style,
}: {
  ingredient: Ingredient;
  lit: boolean;
  title: string;
  subtitle: React.ReactNode;
  toggle: React.ReactNode;
  /** The first row of its group draws no rule above it. */
  first: boolean;
  window?: { width: number; height: number };
  /**
   * The text as a second control that shows or hides the row's drinks
   * (`children`). The toggle keeps its own button, so VoiceOver reaches both.
   */
  reveal?: { open: boolean; onPress: () => void; accessibilityLabel: string };
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const text = (
    <>
      <Text style={[textRole.rowTitle, styles.title]}>{title}</Text>
      {typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle}
    </>
  );
  return (
    <View style={[styles.row, style]}>
      {first ? null : <View style={[styles.rule, { left: ROW_LEFT + window.width + space.md }]} />}
      <View style={styles.rowMain}>
        <BottleWindow ingredient={ingredient} lit={lit} width={window.width} height={window.height} />
        {reveal ? (
          <Pressable
            onPress={reveal.onPress}
            accessibilityRole="button"
            accessibilityLabel={reveal.accessibilityLabel}
            accessibilityState={{ expanded: reveal.open }}
            style={({ pressed }) => [styles.rowText, pressed && styles.textPressed]}>
            {text}
          </Pressable>
        ) : (
          <View style={styles.rowText} accessible={false} importantForAccessibility="no-hide-descendants">
            {text}
          </View>
        )}
        {toggle}
      </View>
      {children ? <View style={{ paddingLeft: window.width + space.md }}>{children}</View> : null}
    </View>
  );
}

/** A row's window onto the lining. */
export const SMALL_WINDOW = { width: 40, height: 52 } as const;
/** The first group's, a step larger. */
export const LARGE_WINDOW = { width: 44, height: 56 } as const;
const ROW_LEFT = 14;

export const rowStyles = StyleSheet.create({
  subtitle: { ...textRole.rowSubtitle, color: colors.textMuted, marginTop: 1 },
  subtitleOn: { ...textRole.rowSubtitle, color: colors.wine, marginTop: 1 },
  name: { ...textRole.nameInline, color: colors.text },
});

const styles = StyleSheet.create({
  toggle: {
    minHeight: layout.controlSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
  },
  toggleOff: { backgroundColor: colors.surface, borderColor: colors.lineInk },
  toggleOffPressed: { backgroundColor: colors.bgSunk },
  toggleOn: { backgroundColor: colors.wineWash, borderColor: colors.wine },
  toggleOnPressed: { opacity: 0.8 },

  window: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
    overflow: 'hidden',
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.matEdge,
    backgroundColor: colors.lining,
  },

  row: { paddingLeft: ROW_LEFT, paddingRight: space.md, paddingVertical: 10 },
  rule: { position: 'absolute', top: 0, right: 0, height: stroke.hair, backgroundColor: colors.line },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 },
  rowText: { flex: 1 },
  textPressed: { opacity: 0.6 },
  title: { color: colors.text },
  subtitle: { ...textRole.rowSubtitle, color: colors.textMuted, marginTop: 1 },
});
