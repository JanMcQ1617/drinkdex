import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BrassGauge } from '@/components/brass';
import { DrinkName } from '@/components/cabinet';
import { Button, haptic } from '@/components/ui';
import { colors, fonts, layout, space, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink, TOTAL } from '@/data';
import { latestCatch } from '@/lib/cabinet';
import { catchDay } from '@/lib/drinkLabels';
import { textWidth } from '@/lib/textFit';
import { useCollection } from '@/store/collection';

/* ==================================================================== */
/* The Dex head                                                         */
/*                                                                      */
/* The top of the Dex, on the lining (v3.3 Brass, screen 2): the one    */
/* figure the screen exists for, "38 in your Dex, of 2,089 · 1.8%", at  */
/* the left; at the right a brass kicker, "latest catch", over the name */
/* of the drink most recently brought in; under both, the brass gauge   */
/* with a mark for every caught drink AT ITS DEX NUMBER (graft 1).      */
/*                                                                      */
/* It replaces the Latest catch panel (a cellar card with the photo),   */
/* which put a second box and a second photograph above a grid that is  */
/* nothing but boxes and photographs. The catch is a line of type now,  */
/* and the gauge says what the panel could not: where in the book the   */
/* catches are.                                                         */
/*                                                                      */
/* Its own subscription to the unlocks, not the screen's: the Dex       */
/* subscribes to the count alone so a photo swapped on an entry does    */
/* not re-render 2,089 cells; the gauge's marks need the whole set, and */
/* this is one component.                                               */
/*                                                                      */
/* Lining inks only: onLining figures and name, onLiningMuted caption,  */
/* brassOnDark kicker (8.60:1). Static: no entrance, nothing hidden.    */
/* ==================================================================== */

const CAP = 1.3;
/** "in your Dex" beside the figure: the mock's Inter Medium 15/19, a step above the 13pt caption under it. */
const IN_DEX = { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 19 } as const;
const IN_DEX_WORDS = 'in your Dex';
/** Figure to its caption, and the hero to the latest catch: the mock's 12. */
const HERO_GAP = 12;
/**
 * Lifts the two caption lines (and the catch beside them) so their last
 * baseline sits near the figure's: the figure's 40pt line carries about
 * 9pt under its baseline, a 13/18 line about 4.
 */
const BASELINE_LIFT = 4;
/** Below this the catch's name is too squeezed beside the figure, so it goes under it, full width. */
const MIN_SIDE = 120;
/** The empty head's "Post a drink" needs about this much beside the figure. */
const MIN_SIDE_EMPTY = 150;
/** From the head to the gauge: the mock's 14. */
const GAUGE_GAP = 14;

/**
 * "1.8%", and "under 0.1%" rather than a "0.0%" that reads as nothing.
 * The Profile plaque's rule (brass/DexPlaque), so the two never disagree
 * about the same collection.
 */
function percent(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '0%';
  const p = (count / total) * 100;
  return p < 0.1 ? 'under 0.1%' : `${p.toFixed(1)}%`;
}

export function DexHead({
  width,
  onOpen,
  onPost,
}: {
  /** The window's width: the head sits on the screen's 16pt gutters. */
  width: number;
  onOpen: (id: string) => void;
  /** The empty head's way in: the post window (/log). */
  onPost: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const unlocks = useCollection((s) => s.unlocks);
  const caught = useMemo(() => latestCatch(unlocks), [unlocks]);
  /*
   * The Dex numbers in the collection, catalogue drinks only (a drink
   * someone added has no number): the gauge's marks, and their count is
   * the figure, so the two cannot disagree. Rebuilt only when the unlocks
   * object changes.
   */
  const numbers = useMemo(() => {
    const out: number[] = [];
    for (const id of Object.keys(unlocks)) {
      const drink = getDrink(id);
      if (drink) out.push(drink.dexNumber);
    }
    return out;
  }, [unlocks]);

  const count = numbers.length;
  const figure = formatCount(count);
  const caption = `of ${formatCount(TOTAL)} · ${percent(count, TOTAL)}`;

  /*
   * The catch's measure, worked out rather than measured so DrinkName has
   * it on the first frame: the gutters' inside, less the hero's width at
   * this text size (textFit errs wide, so this errs narrow), less the gap.
   * Too narrow, and the catch goes under the hero at the full width.
   */
  const s = Math.min(fontScale, CAP);
  const inner = width - 2 * layout.gutter;
  const heroW =
    textWidth(figure, 'inter', textRole.heroFigure.fontSize * s) +
    HERO_GAP +
    Math.max(
      textWidth(IN_DEX_WORDS, 'inter', IN_DEX.fontSize * s),
      textWidth(caption, 'inter', textRole.helper.fontSize * s),
    );
  const side = inner - heroW - HERO_GAP;
  const stacked = side < (caught ? MIN_SIDE : MIN_SIDE_EMPTY);
  const measure = stacked ? inner : side;

  const hero = (
    <View
      accessible
      accessibilityLabel={`${figure} ${IN_DEX_WORDS}, ${caption.replace(' · ', ', ')}`}
      style={styles.hero}>
      <Text maxFontSizeMultiplier={CAP} style={[textRole.heroFigure, styles.ink]}>
        {figure}
      </Text>
      <View style={styles.heroCaption}>
        <Text maxFontSizeMultiplier={CAP} style={[IN_DEX, styles.ink]}>
          {IN_DEX_WORDS}
        </Text>
        <Text maxFontSizeMultiplier={CAP} style={[textRole.helper, styles.muted, tabular]}>
          {caption}
        </Text>
      </View>
    </View>
  );

  let catchBlock: React.ReactNode;
  if (caught) {
    const { drink, record } = caught;
    const day = catchDay(record.date);
    catchBlock = (
      <Pressable
        onPress={() => {
          haptic.tap();
          onOpen(drink.id);
        }}
        hitSlop={{ top: 4, bottom: 4 }}
        accessibilityRole="button"
        // The spoken number is unpadded: "#0009" is read digit by digit.
        accessibilityLabel={`Latest catch, ${drink.name}, number ${drink.dexNumber}${day ? `, ${day}` : ''}`}
        accessibilityHint="Opens it in the Dex"
        style={({ pressed }) => [
          styles.catch,
          { width: measure },
          stacked ? styles.catchStacked : styles.catchSide,
          pressed && styles.pressed,
        ]}>
        <Text maxFontSizeMultiplier={CAP} style={[textRole.kicker, styles.kicker, !stacked && styles.right]}>
          latest catch
        </Text>
        {/* No line limit: the head grows with a long name, and DrinkName shrinks only a word too wide for it. */}
        <DrinkName
          name={drink.name}
          role={textRole.cardName}
          measure={measure}
          cap={CAP}
          color={colors.onLining}
          style={stacked ? undefined : styles.right}
        />
      </Pressable>
    );
  } else {
    /*
     * Nothing caught: no name, because a catch that did not happen must not
     * be shown. The kicker says so and the one thing that changes it sits
     * under it. Outline, not the bone primary: the head's figure already
     * reads 0, and this is a way in, not the screen's call to action.
     */
    catchBlock = (
      <View style={[styles.catch, stacked ? styles.catchStacked : styles.catchSide]}>
        <Text maxFontSizeMultiplier={CAP} style={[textRole.kicker, styles.kicker, !stacked && styles.right]}>
          nothing caught yet
        </Text>
        <Button
          label="Post a drink"
          variant="onLiningOutline"
          size="sm"
          icon="plus"
          onPress={onPost}
          style={styles.emptyAction}
        />
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.head, stacked && styles.headStacked]}>
        {hero}
        {catchBlock}
      </View>
      {/*
        The gauge's own progressbar would say the hero's figure a second
        time, one swipe later; the hero is the spoken one, the marks are
        for the eye (they say where the catches are, which a value cannot).
      */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.gauge}>
        <BrassGauge caught={numbers} total={TOTAL} well="cellar" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    columnGap: HERO_GAP,
  },
  headStacked: { flexDirection: 'column', alignItems: 'flex-start', rowGap: space.sm },
  // Wraps: at accessibility sizes the caption drops under the figure instead of squeezing it.
  hero: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: HERO_GAP,
    flexShrink: 1,
  },
  heroCaption: { paddingBottom: BASELINE_LIFT, flexShrink: 1 },
  catch: { paddingBottom: BASELINE_LIFT },
  catchSide: { alignItems: 'flex-end' },
  catchStacked: { alignItems: 'flex-start', alignSelf: 'stretch' },
  right: { textAlign: 'right' },
  // Text dims while held, as the top bar's own words do: a fill behind a line of type would read as a button never drawn.
  pressed: { opacity: 0.6 },

  ink: { color: colors.onLining },
  muted: { color: colors.onLiningMuted },
  kicker: { color: colors.brassOnDark },
  emptyAction: { marginTop: space.xs },
  gauge: { marginTop: GAUGE_GAP },
});
