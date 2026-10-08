import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons';
import { colors, layout, radius, space, stroke, textRole } from '@/constants/theme';

/* ==================================================================== */
/* Controls My Bar's rows share                                         */
/* ==================================================================== */

/**
 * Add a thing to your bar, or take it out: a One ingredient away row's
 * own control.
 *
 * Off: the secondary button (white, espresso edge, a plus, "Add"). On:
 * wine on its wash with a wine edge and a check ("Added"), the Chip's
 * selected skin, so the state never rests on colour alone and VoiceOver
 * hears it as selected. Tapping it again takes the thing out. 36pt with
 * 4pt of slop above and below, like Button size="sm".
 */
export function ShelfToggle({
  on,
  onPress,
  accessibilityLabel,
}: {
  on: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const ink = on ? colors.wine : colors.text;
  return (
    <Pressable
      // No tick here: the screen's apply() ticks once for every way into the bar.
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: on }}
      accessibilityHint={on ? 'Double-tap to take it out of your bar' : 'Double-tap to add it to your bar'}
      style={({ pressed }) => [
        styles.toggle,
        on ? styles.toggleOn : styles.toggleOff,
        pressed && (on ? styles.toggleOnPressed : styles.toggleOffPressed),
      ]}>
      <Icon name={on ? 'check' : 'plus'} size={16} color={ink} />
      <Text style={[textRole.buttonSm, { color: ink }]}>{on ? 'Added' : 'Add'}</Text>
    </Pressable>
  );
}

/**
 * A row for one ingredient: a title and a line under it, and the toggle
 * at the end. Static, with its own control, so VoiceOver reaches the
 * toggle (a pressable row would swallow it); the toggle's label says
 * everything the row does, so the text is not read a second time, unless
 * `reveal` makes the text its own button.
 * `children` hangs under the row's text (the drinks an Add just unlocked,
 * or the ones it would unlock once revealed).
 *
 * No bottle in a window any more (v3.3): the SVG bottles were the
 * heaviest thing on My Bar, and the rule now starts at the text.
 */
export function IngredientRow({
  title,
  subtitle,
  toggle,
  first,
  reveal,
  children,
  style,
}: {
  title: string;
  subtitle: React.ReactNode;
  toggle: React.ReactNode;
  /** The first row of its group draws no rule above it. */
  first: boolean;
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
      {typeof subtitle === 'string' ? <Text style={rowStyles.subtitle}>{subtitle}</Text> : subtitle}
    </>
  );
  return (
    <View style={[styles.row, style]}>
      {first ? null : <View style={[rowStyles.rule, { left: ROW_LEFT }]} />}
      <View style={styles.rowMain}>
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
      {children}
    </View>
  );
}

/** A row's inset from its card's left edge, where its text (and its rule) starts. */
export const ROW_LEFT = 14;

export const rowStyles = StyleSheet.create({
  subtitle: { ...textRole.rowSubtitle, color: colors.textMuted, marginTop: 1 },
  subtitleOn: { ...textRole.rowSubtitle, color: colors.wine, marginTop: 1 },
  name: { ...textRole.nameInline, color: colors.text },
  /** The hairline between rows in a card; each row sets its own `left`. */
  rule: { position: 'absolute', top: 0, right: 0, height: stroke.hair, backgroundColor: colors.line },
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

  row: { paddingLeft: ROW_LEFT, paddingRight: space.md, paddingVertical: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 },
  rowText: { flex: 1 },
  textPressed: { opacity: 0.6 },
  title: { color: colors.text },
});
