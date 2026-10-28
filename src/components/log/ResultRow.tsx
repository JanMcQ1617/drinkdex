import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DrinkName } from '@/components/cabinet';
import { DexThumb } from '@/components/DexCard';
import { Icon } from '@/components/icons';
import { colors, layout, space, textRole } from '@/constants/theme';
import type { Drink } from '@/types';

/* ==================================================================== */
/* The + window's result rows (layout spec 5.6)                         */
/*                                                                      */
/* A 52pt print and the drink's name, and nothing else. The plates,     */
/* the style and glass line and the "In your Dex" tag that v3.3 stamped */
/* on every row went to the drink page: this list exists to recognise a */
/* drink, and the picture and the name are what you recognise it by.    */
/* The one exception is a name two rows share, where a small muted line */
/* (its origin) is the only way to tell them apart.                     */
/*                                                                      */
/* Rows sit on the page at a 68pt pitch with no rules between them:     */
/* the space and the thumbs make the rhythm (layout principle 3). A     */
/* press fills the row edge to edge, a fill and not a scale, because a  */
/* row is a control and not a picture.                                  */
/* ==================================================================== */

/** The thumb's side (DexThumb `row`), and the space to the name: thumb at x 24, name at x 92. */
const THUMB = 52;
const THUMB_GAP = space.lg;
/** 8 above and below the 52pt thumb: the 68pt pitch. */
const ROW_PAD_V = space.sm;
/** The chosen drink's check, at the row's end, when the search is reopened to change it. */
const CHECK = 20;
/**
 * Dynamic Type cap on a result's name (specs/v3-cabinet.md 6.5): 1.4 from
 * v3.3, 1.3 since v4.10, so no marker line draws above 1.3 times its role
 * (specs/v4.10/spec.md T.4, which missed this third site). The row only
 * has a minimum height, so a shorter cap only ever shrinks it.
 */
const RESULT_NAME_CAP = 1.3;

/** The name's column: the window less the gutters, the thumb and its gap, and the check when shown. */
function resultNameMeasure(windowWidth: number, chosen: boolean): number {
  return windowWidth - 2 * layout.gutter - THUMB - THUMB_GAP - (chosen ? CHECK + space.md : 0);
}

export function ResultRow({
  drink,
  photoUri,
  subtitle,
  chosen,
  width,
  spoken,
  onPress,
}: {
  drink: Drink;
  /** A drink someone added draws its own photo; catalogue drinks draw their print (DexThumb). */
  photoUri?: string | null;
  /** Only where two rows share a name: the origin that tells them apart. */
  subtitle?: string | null;
  /** The drink already chosen, when the search was reopened from compose to change it. */
  chosen: boolean;
  /** The window's width, for the name's measure (DrinkName fits a long word rather than breaking it). */
  width: number;
  /** The whole row's spoken name: the drink, its number and what it is to you. */
  spoken: string;
  onPress: (d: Drink) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(drink)}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={spoken}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <DexThumb drink={drink} photoUri={photoUri} />
      <View style={styles.text}>
        <DrinkName
          name={drink.name}
          role={textRole.name}
          measure={resultNameMeasure(width, chosen)}
          cap={RESULT_NAME_CAP}
          color={colors.text}
        />
        {subtitle ? <Text style={[textRole.small, styles.muted]}>{subtitle}</Text> : null}
      </View>
      {chosen ? <Icon name="check" size={CHECK} color={colors.text} /> : null}
    </Pressable>
  );
}

/**
 * The last row of a search whose name the Dex does not have: "Add “neg”
 * as a new drink". In the results' own shape (a wash tile where the thumb
 * sits, the words where the name sits), so it reads as one more answer to
 * the question rather than a footnote, and it is reached by scrolling to
 * the end of the results, never pinned over them.
 */
export function AddNewRow({ label, query, onPress }: { label: string; query: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${query} as a new drink`}
      accessibilityHint="Opens a form to add it to your Dex"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.addTile}>
        <Icon name="plus" size={22} color={colors.text} />
      </View>
      <Text style={[textRole.body, styles.ink, styles.text]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: THUMB + 2 * ROW_PAD_V,
    flexDirection: 'row',
    alignItems: 'center',
    gap: THUMB_GAP,
    paddingVertical: ROW_PAD_V,
    paddingHorizontal: layout.gutter,
  },
  pressed: { backgroundColor: colors.press },
  text: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  /* The no-photo face's wash, so the add row's tile sits in the thumbs' column. */
  addTile: {
    width: THUMB,
    height: THUMB,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSunk,
  },
});
