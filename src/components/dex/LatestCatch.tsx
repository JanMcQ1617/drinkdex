import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DrinkName, HeroFigure, NumberPlate, svgStop, useSvgId } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { Button, haptic, PressableScale } from '@/components/ui';
import { colors, layout, radius, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount, TOTAL } from '@/data';
import { latestCatch, nextRank } from '@/lib/cabinet';
import { catchDay } from '@/lib/drinkLabels';
import { useCollection } from '@/store/collection';

/* ==================================================================== */
/* Latest catch                                                         */
/*                                                                      */
/* The head of the Dex's cabinet front (spec §9.7.2): the drink most    */
/* recently brought into the collection, lit, beside the one figure the */
/* screen exists for, the number collected. It replaces a 2pt progress  */
/* rule and a 13pt sentence, which made the collection's own count the  */
/* smallest type on the screen.                                         */
/*                                                                      */
/* The panel is the cellar (liningDeep), the ground every lit photo     */
/* settles to at its edges, so the photo on the right meets it with no  */
/* frame; a fade over the photo's left 40% dissolves it into the panel. */
/* The text column is the panel's left 54% and never overlaps the       */
/* picture, so its inks are the cellar pairs, never ink over media.     */
/*                                                                      */
/* Its own subscription to the unlocks, not the screen's: the Dex       */
/* subscribes to the count alone so a photo swapped on an entry does    */
/* not re-render 2,089 cells, but the latest catch's photo IS that      */
/* swap, and this panel is one component.                               */
/*                                                                      */
/* Static: no entrance, nothing that starts hidden.                     */
/* ==================================================================== */

const MIN_HEIGHT = 156;
/** The text column's share of the panel; the photo takes the rest. */
const COLUMN = 0.54;
/** The fade's reach across the photo, from its left edge. */
const FADE = 0.4;
const PAD = space.lg;
const CAP = 1.3;

/**
 * The photo's left edge dissolving into the panel: opaque liningDeep at
 * the seam, clear 40% of the way in. Decorative and untouchable.
 */
function SideFade() {
  const id = useSvgId('catchFade');
  return (
    <View pointerEvents="none" style={styles.fade}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" {...svgStop(colors.liningDeep)} />
            <Stop offset="1" {...svgStop(colors.liningDeep, 0)} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export function LatestCatch({
  width,
  onOpen,
  onPost,
}: {
  /** The window's width: the panel sits on the screen's 16pt gutters. */
  width: number;
  onOpen: (id: string) => void;
  /** The empty panel's way in: the post sheet (/log). */
  onPost: () => void;
}) {
  const unlocks = useCollection((s) => s.unlocks);
  const caught = useMemo(() => latestCatch(unlocks), [unlocks]);
  const collected = Object.keys(unlocks).length;

  /*
   * Worked out from the window rather than measured, so DrinkName has its
   * measure on the first frame (spec §6.4: (width − 32) × 0.54 − 32). The
   * panel's 1pt edges come off first, because percentages of the panel
   * would be of its inside.
   */
  const inner = width - 2 * layout.gutter - 2 * stroke.edge;
  const columnW = Math.floor(inner * COLUMN);
  const photoW = inner - columnW;
  const measure = columnW - 2 * PAD;

  const figure = (
    <View style={styles.figure}>
      <HeroFigure value={collected} caption={`of ${formatCount(TOTAL)} collected`} tone="lining" />
    </View>
  );

  if (!caught) {
    /*
     * Nothing collected: no photo, because a catch that did not happen
     * must not be pictured. The figure still reads 0, and the panel offers
     * the one thing that changes it.
     */
    return (
      <View style={styles.panel}>
        <Grain tone="lining" />
        <View style={styles.emptyColumn}>
          <Text maxFontSizeMultiplier={CAP} accessibilityRole="header" style={[textRole.shelfTitle, styles.ink]}>
            Nothing caught yet
          </Text>
          <Text maxFontSizeMultiplier={CAP} style={[textRole.helper, styles.muted, styles.emptyBody]}>
            Post your first drink and it lands here.
          </Text>
          {figure}
          <Button
            label="Post a drink"
            variant="onLining"
            size="sm"
            icon="plus"
            onPress={onPost}
            style={styles.emptyAction}
          />
        </View>
      </View>
    );
  }

  const { drink, record } = caught;
  const day = catchDay(record.date);
  const next = nextRank(collected);
  const nextLine = next ? `${formatCount(next.toGo)} to ${next.title}` : null;

  return (
    <PressableScale
      // A list's flick starts on this panel as often as not: no tick on
      // touch-down, and a delay so a scroll never pulses it (as DexCard).
      noHaptic
      unstable_pressDelay={120}
      scaleTo={0.98}
      onPress={() => {
        haptic.tap();
        onOpen(drink.id);
      }}
      accessibilityRole="button"
      // The spoken number is unpadded: "#0107" is read digit by digit.
      accessibilityLabel={[
        `Latest catch, ${drink.name}, number ${drink.dexNumber}${day ? `, ${day}` : ''}.`,
        `${formatCount(collected)} of ${formatCount(TOTAL)} collected.`,
        nextLine ? `${nextLine}.` : null,
      ]
        .filter(Boolean)
        .join(' ')}
      accessibilityHint="Opens it in the Dex"
      style={styles.panel}>
      <Grain tone="lining" />

      {/* Under the column, never behind its text: the column ends where the photo starts. */}
      <View style={[styles.photo, { width: photoW }]}>
        <DrinkFace
          drink={drink}
          mode="lit"
          photoUri={record.photoUri}
          width={photoW}
          height={MIN_HEIGHT}
          style={FACE_FILL}
        />
        <SideFade />
      </View>

      <View style={[styles.column, { width: columnW }]}>
        <Text maxFontSizeMultiplier={CAP} style={[textRole.helper, styles.muted]}>
          {day ? `Latest catch · ${day}` : 'Latest catch'}
        </Text>
        {/* No line limit: the panel's minimum height grows with the name. */}
        <DrinkName
          name={drink.name}
          role={textRole.shelfName}
          measure={measure}
          cap={CAP}
          color={colors.onLining}
          style={styles.name}
        />
        <View style={styles.plates}>
          <NumberPlate n={drink.dexNumber} tone="lining" />
        </View>
        {figure}
        {nextLine ? (
          <Text maxFontSizeMultiplier={CAP} style={[textRole.helper, styles.muted, tabular]}>
            {nextLine}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  panel: {
    minHeight: MIN_HEIGHT,
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    borderColor: colors.liningLine,
    backgroundColor: colors.liningDeep,
    overflow: 'hidden',
  },
  photo: { position: 'absolute', top: 0, right: 0, bottom: 0 },
  fade: { position: 'absolute', top: 0, bottom: 0, left: 0, width: `${FADE * 100}%` },
  column: { padding: PAD },
  emptyColumn: { padding: PAD, alignItems: 'flex-start' },

  ink: { color: colors.onLining },
  muted: { color: colors.onLiningMuted },
  name: { marginTop: 2 },
  plates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.sm,
    rowGap: space.xs,
    marginTop: 6,
  },
  figure: { marginTop: 10 },

  emptyBody: { marginTop: space.xs },
  emptyAction: { marginTop: space.md },
});
