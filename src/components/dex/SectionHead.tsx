import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';

/* ==================================================================== */
/* A For-you section's head (v4.2 §2.6, §2.7)                           */
/*                                                                      */
/* "Sour and citrusy" at the gutter, body 600, and at the right "See    */
/* all 445 ›" (small 500, ink, a 16pt chevron), which turns that        */
/* flavour's chip on alone: the grid goes flat in the For-you order,    */
/* all 445. Everything else says "by number" there instead, muted, and  */
/* does nothing. 24 tall, 12 to the first row; a head after a section   */
/* has 8 more over it, so 32 of air follow the last row's 24 ledge.     */
/*                                                                      */
/* The whole head is the "See all" target, at least 44 tall with its    */
/* slop. For VoiceOver it is not one element: the name is a header (the */
/* rotor's Headings jumps between sections) and "See all" a button of   */
/* its own, "See all 445 sour and citrusy drinks", so the head's press  */
/* target opts out and the button answers VoiceOver's activate itself.  */
/* At the largest text sizes the head wraps and "See all" drops under   */
/* the name.                                                            */
/* ==================================================================== */

const LINE = 24;
/** Slop over the head, so the line and its 12 below reach 44 and more. */
const SLOP = layout.hit - LINE - space.md;

export const SectionHead = React.memo(function SectionHead({
  label,
  all,
  first,
  onSeeAll,
}: {
  label: string;
  /** The "See all" figure: every drink the section's chip holds. Null for Everything else. */
  all: number | null;
  /** The first head on the page: no extra air over it. */
  first: boolean;
  onSeeAll?: () => void;
}) {
  if (all === null || !onSeeAll) {
    return (
      <View style={[styles.head, !first && styles.after]}>
        <View style={styles.line}>
          <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.name]}>
            {label}
          </Text>
          <Text style={[textRole.small, styles.muted]}>by number</Text>
        </View>
      </View>
    );
  }
  const words = `See all ${formatCount(all)}`;
  return (
    <Pressable
      onPress={onSeeAll}
      accessible={false}
      hitSlop={{ top: SLOP }}
      style={({ pressed }) => [styles.head, !first && styles.after, pressed && styles.pressed]}>
      <View style={styles.line}>
        <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.name]}>
          {label}
        </Text>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${words} ${label.toLowerCase()} drinks`}
          onAccessibilityTap={onSeeAll}
          style={styles.see}>
          <Text style={[styles.seeLabel, styles.ink]}>{words}</Text>
          <Icon name="chevronRight" size={16} color={colors.text} />
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.5 },

  /* 24 tall, 12 to the first row; the gutter both sides. */
  head: { paddingHorizontal: layout.gutter, paddingBottom: space.md },
  after: { paddingTop: space.sm },
  line: {
    minHeight: LINE,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.lg,
  },
  name: { flexShrink: 1 },
  see: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeLabel: {
    fontFamily: textRole.bodyMedium.fontFamily,
    fontSize: textRole.small.fontSize,
    lineHeight: textRole.small.lineHeight,
  },
});
