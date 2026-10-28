import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { lineMarks } from '@/components/details/lineMarks';
import { PenDoubleRule, PenRule } from '@/components/details/PenMarks';
import { PEN_SEED } from '@/components/details/penPath';
import { PressNumeral } from '@/components/details/PressMarks';
import { Icon } from '@/components/icons';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';

/* ==================================================================== */
/* A For-you section's head (v4.2 §2.6, §2.7)                           */
/*                                                                      */
/* "Sour and citrusy" at the gutter, in the poster (Anton 16/26, its    */
/* capitals a transform, v4.10, specs/v4.10/spec.md T.7), and at the    */
/* right "See all 445 ›" (Archivo small 500, ink, a 16pt chevron),      */
/* which turns that flavour's chip on alone: the grid goes flat in the  */
/* For-you order, all 445. Everything else says "by number" there       */
/* instead, muted, and does nothing. 26 tall (HEAD_LINE), 12 to the     */
/* first row; a head after a section has 8 more over it, so 32 of air   */
/* follow the last row's 24 ledge.                                      */
/*                                                                      */
/* ONE BASELINE. The aside sits on the head's baseline, not centred on  */
/* its line: the poster's capitals and Archivo's small line have their  */
/* baselines at different depths in their boxes, so the row aligns its  */
/* tops and drops the aside by the difference (lineMarks), at the       */
/* reader's text size. The name is written in sentence case and spoken  */
/* so (its accessibilityLabel): only the drawing is in capitals.        */
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
/*                                                                      */
/* THE FIGURE AND THE REST HEAD (v4.9, specs/v4.9/details C.4). Jan     */
/* picked "big outlined numbers on drink pages and Dex sections". A     */
/* For-you head is numbered in the person's order, "01", "02", with the */
/* press's outlined figure (details/PressMarks: Anton as 1pt rings in   */
/* colors.rule, the head's own poster face, since v4.10) at cap 48 on   */
/* the gutter, 10 over the line                                         */
/* (NUMERAL_BAND, which the Dex grid's jump estimate counts). Printed,  */
/* never the pen's red, and never spoken: the name is the header, and   */
/* the figure says nothing the order does not. It is the "See all"      */
/* target's sibling, before it, as the rule is: the press dims the row, */
/* and a dimmed figure would say it was part of the button. The 8 over  */
/* a head after a section moves onto the figure, so a numbered head has */
/* the air over it that any head has. Above 1.3x text it is not drawn:  */
/* it never grows with the text, and beside words that have grown it    */
/* would read as a stray grey shape.                                    */
/*                                                                      */
/* Everything else draws no figure. Its head rule is the pen's double   */
/* rule (PenDoubleRule) in the same 7pt spacer, the upper stroke where  */
/* the single one runs and the lower falling into the 12 under it, 8.8  */
/* clear of the first prints: For you ends here, and the catalogue      */
/* begins.                                                              */
/* ==================================================================== */

/** The head's line: the poster's 26 (textRole.sub). Exported for the Dex grid's jump estimate. */
export const HEAD_LINE = textRole.sub.lineHeight;
/** Slop over the head, so the line and its 12 below reach 44 and more. */
const SLOP = layout.hit - HEAD_LINE - space.md;
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

/** The section figure's cap height, pt: its box's height, never scaled with Larger Text. 48 since v4.10, the board's poster figure. */
const FIGURE_CAP = 48;
/** From the figure's baseline (its box's foot) to the head's line. */
const FIGURE_GAP = 10;
/**
 * What a numbered head adds to a head's height: the figure's cap and the
 * 10 under it. The 8 over a head after a section is not in it (it moves
 * onto the figure). Exported for the Dex grid's jump estimate.
 */
export const NUMERAL_BAND = FIGURE_CAP + FIGURE_GAP;
/** Above this text size a head draws no figure, and adds no NUMERAL_BAND. */
export const NUMERAL_TEXT_CAP = 1.3;

/**
 * "01", "02": padded, since an unpadded 1 in outline is a thin stick, and
 * two figures with no Nº never read as a drink's number (v4.9 J, taste 7).
 */
const pad2 = (n: number) => String(n).padStart(2, '0');

/** The see-all chevron's size, which the aside's row centres its words against. */
const CHEVRON = 16;

/**
 * How far below the line's top the aside starts, so its baseline is the
 * poster's: both grow with the reader's text (neither caps), and the
 * see-all row centres its words in the chevron's 16 when they are shorter.
 */
function asideDrop(fontScale: number, chevron: boolean): number {
  const head = lineMarks('sub', textRole.sub.fontSize, textRole.sub.lineHeight, fontScale);
  const aside = lineMarks('text', textRole.small.fontSize, textRole.small.lineHeight, fontScale);
  const inRow = chevron ? Math.max(0, (CHEVRON - aside.lineHeight) / 2) : 0;
  return Math.max(0, head.baseline - aside.baseline - inRow);
}

export const SectionHead = React.memo(function SectionHead({
  label,
  all,
  first,
  ordinal,
  rest = false,
  onSeeAll,
}: {
  label: string;
  /** The "See all" figure: every drink the section's chip holds. Null for Everything else. */
  all: number | null;
  /** The first head on the page: no extra air over it. */
  first: boolean;
  /** A For-you section's place in the order, from 1: the press's figure over the head (v4.9). */
  ordinal?: number;
  /** Everything else's head: the pen's double rule under it (v4.9). */
  rest?: boolean;
  onSeeAll?: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  // One cached path per screen width, the same for every head, so the grid's scroll pays nothing for it.
  const rule = (
    <View pointerEvents="none" style={styles.ruleSpace}>
      {rest ? (
        <PenDoubleRule length={width - 2 * layout.gutter} seed={PEN_SEED.restHead} style={styles.rule} />
      ) : (
        <PenRule length={width - 2 * layout.gutter} seed={PEN_SEED.sectionHead} style={styles.rule} />
      )}
    </View>
  );
  // One cached path per figure ("01" at cap 48), measured never: a head is a list cell.
  const figure =
    ordinal !== undefined && fontScale <= NUMERAL_TEXT_CAP ? (
      <View style={[styles.figure, !first && styles.after]}>
        <PressNumeral text={pad2(ordinal)} cap={FIGURE_CAP} />
      </View>
    ) : null;
  // The 8 over a head after a section: on the figure when there is one, else on the row.
  const air = !first && !figure;
  if (all === null || !onSeeAll) {
    return (
      <View style={styles.head}>
        {figure}
        <View style={[styles.row, air && styles.after]}>
          <View style={styles.line}>
            <Text accessibilityRole="header" accessibilityLabel={label} style={[textRole.sub, styles.ink, styles.name]}>
              {label}
            </Text>
            <Text style={[textRole.small, styles.muted, { marginTop: asideDrop(fontScale, false) }]}>by number</Text>
          </View>
        </View>
        {rule}
      </View>
    );
  }
  const words = `See all ${formatCount(all)}`;
  return (
    <View style={styles.head}>
      {/* The figure and the rule are the Pressable's siblings: the press dims the row, and a dimmed rule is pink. */}
      {figure}
      <Pressable
        onPress={onSeeAll}
        accessible={false}
        hitSlop={{ top: SLOP, bottom: BELOW_ROW }}
        style={({ pressed }) => [styles.row, air && styles.after, pressed && styles.pressed]}>
        <View style={styles.line}>
          <Text accessibilityRole="header" accessibilityLabel={label} style={[textRole.sub, styles.ink, styles.name]}>
            {label}
          </Text>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${words} ${label.toLowerCase()} drinks`}
            onAccessibilityTap={onSeeAll}
            style={[styles.see, { marginTop: asideDrop(fontScale, true) }]}>
            <Text style={[styles.seeLabel, styles.ink]}>{words}</Text>
            <Icon name="chevronRight" size={CHEVRON} color={colors.text} />
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

  /* 26 tall, then the rule's 7, then 12 to the first row; the gutter both sides. */
  head: { paddingBottom: space.md },
  row: { paddingHorizontal: layout.gutter },
  after: { paddingTop: space.sm },
  /* A numbered head's figure on the gutter, its foot 10 over the line (NUMERAL_BAND with its cap). */
  figure: { paddingHorizontal: layout.gutter, paddingBottom: FIGURE_GAP, alignItems: 'flex-start' },
  /* Tops aligned, never centred: the aside drops onto the poster's baseline (asideDrop). */
  line: {
    minHeight: HEAD_LINE,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
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
