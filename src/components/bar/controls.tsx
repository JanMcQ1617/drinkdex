import React from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons';
import { colors, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { textWidth } from '@/lib/textFit';

/* ==================================================================== */
/* Controls My Bar's rows share                                         */
/* ==================================================================== */

/** The toggle's mark, and the gap between it and the word. */
const MARK = 16;
const MARK_GAP = 6;

/**
 * Add a thing to your bar, or take it out: One ingredient away's own
 * control, on each drink's row and on the best bottle's card.
 *
 * Off: the secondary button's skin (white, espresso edge), a plus and the
 * thing's name, "+ Orange" (v3.3 Brass, squared, 1pt edge). On: wine on
 * its wash with a wine edge and a check, "✓ Orange", the Chip's selected
 * skin, so the state never rests on colour alone and VoiceOver hears it
 * as selected. The word does not change between the two, only the mark,
 * which is the same size, so a tap never moves the toggle or what sits
 * beside it. Tapping it again takes the thing out. 36pt with 4pt of slop
 * above and below, like Button size="sm". Without `label` it reads
 * "Add" / "Added".
 */
export function ShelfToggle({
  on,
  label,
  onPress,
  accessibilityLabel,
  style,
}: {
  on: boolean;
  /** The thing it adds, drawn after the mark. */
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
  style?: ViewStyle;
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
        style,
      ]}>
      <Icon name={on ? 'check' : 'plus'} size={MARK} color={ink} />
      <Text style={[textRole.buttonSm, styles.toggleText, { color: ink }]}>{label ?? (on ? 'Added' : 'Add')}</Text>
    </Pressable>
  );
}

/**
 * The width a labelled ShelfToggle takes at this text size, worked out
 * (textFit errs wide), so a row can decide before it is drawn whether the
 * toggle fits beside its text or goes under it.
 */
export function shelfToggleWidth(label: string, fontScale: number): number {
  const word = textWidth(label, 'inter', textRole.buttonSm.fontSize * fontScale);
  return Math.ceil(2 * space.md + MARK + MARK_GAP + word + 2 * stroke.edge);
}

export const rowStyles = StyleSheet.create({
  subtitle: { ...textRole.rowSubtitle, color: colors.textMuted, marginTop: 1 },
  name: { ...textRole.nameInline, color: colors.text },
  /** The hairline between rows; each row sets its own `left`. */
  rule: { position: 'absolute', top: 0, right: 0, height: stroke.hair, backgroundColor: colors.line },
});

const styles = StyleSheet.create({
  toggle: {
    minHeight: layout.controlSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: MARK_GAP,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
  },
  toggleOff: { backgroundColor: colors.surface, borderColor: colors.lineInk },
  toggleOffPressed: { backgroundColor: colors.bgSunk },
  toggleOn: { backgroundColor: colors.wineWash, borderColor: colors.wine },
  toggleOnPressed: { opacity: 0.8 },
  /* A long name ("Maraschino liqueur") wraps inside the toggle rather than cutting. */
  toggleText: { flexShrink: 1 },
});
