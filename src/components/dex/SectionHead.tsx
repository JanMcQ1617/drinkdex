import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PenRule } from '@/components/details/PenMarks';
import { PEN_SEED } from '@/components/details/penPath';
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
/*                                                                      */
/* THE HEAD RULE (v4.6, specs/v4.6-details A.3 #3). Under the line, the */
/* logo's pen draws a hairline across the column, gutter to gutter, the */
/* way a ledger rules a section's head. A section rule, not an          */
/* underline: its centreline is 6.4 under the line's box, where an      */
/* underline would hug the words 2 under their baseline, so it never    */
/* reads as a link under "See all 445". It sits in a 7pt spacer         */
/* (HEAD_RULE) after the line and the 12 under the head is unchanged,   */
/* so the first row's photos stay 12 clear of the ink. The Dex grid's   */
/* jump estimate counts the 7 (dex.tsx headEstimate). Ornament only:    */
/* both forms draw it, the same stroke on every section. It is the      */
/* "See all" target's sibling, never its child: the press dims the row  */
/* to half, and a half-strength Campari rule is pink, and would say the */
/* rule is part of the button. The target keeps its old reach with slop */
/* under the row (BELOW_ROW).                                           */
/* ==================================================================== */

const LINE = 24;
/** Slop over the head, so the line and its 12 below reach 44 and more. */
const SLOP = layout.hit - LINE - space.md;
/**
 * What the head rule adds to a head's height: a 7pt spacer under the line,
 * the rule's box 3 down it, so its centreline is 6.4 under the line's box.
 * Exported for the Dex grid's jump estimate.
 */
export const HEAD_RULE = 7;
const RULE_TOP = 3;
/**
 * The press target's slop under its row: the rule's 7 and the 12 to the
 * first row, which were inside the target before the rule left it, so
 * the head is as easy to hit as it was.
 */
const BELOW_ROW = HEAD_RULE + space.md;

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
  const { width } = useWindowDimensions();
  // One cached path per screen width, the same for every head, so the grid's scroll pays nothing for it.
  const rule = (
    <View pointerEvents="none" style={styles.ruleSpace}>
      <PenRule length={width - 2 * layout.gutter} seed={PEN_SEED.sectionHead} style={styles.rule} />
    </View>
  );
  if (all === null || !onSeeAll) {
    return (
      <View style={styles.head}>
        <View style={[styles.row, !first && styles.after]}>
          <View style={styles.line}>
            <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.name]}>
              {label}
            </Text>
            <Text style={[textRole.small, styles.muted]}>by number</Text>
          </View>
        </View>
        {rule}
      </View>
    );
  }
  const words = `See all ${formatCount(all)}`;
  return (
    <View style={styles.head}>
      {/* The rule is the Pressable's sibling, not its child: the press dims the row, and a dimmed rule would be pink. */}
      <Pressable
        onPress={onSeeAll}
        accessible={false}
        hitSlop={{ top: SLOP, bottom: BELOW_ROW }}
        style={({ pressed }) => [styles.row, !first && styles.after, pressed && styles.pressed]}>
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
      {rule}
    </View>
  );
});

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.5 },

  /* 24 tall, then the rule's 7, then 12 to the first row; the gutter both sides. */
  head: { paddingBottom: space.md },
  row: { paddingHorizontal: layout.gutter },
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
  /* The head rule's 7, under the line; the head's 12 to the first row follows it. */
  ruleSpace: { height: HEAD_RULE, marginHorizontal: layout.gutter },
  rule: { position: 'absolute', top: RULE_TOP, left: 0 },
  see: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeLabel: {
    fontFamily: textRole.bodyMedium.fontFamily,
    fontSize: textRole.small.fontSize,
    lineHeight: textRole.small.lineHeight,
  },
});
