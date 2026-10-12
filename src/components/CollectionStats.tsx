import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CustomDrinkTile } from '@/components/CustomDrinkTile';
import { LatestCatch } from '@/components/dex/LatestCatch';
import { DexPanel } from '@/components/Ruler';
import { Button, ProgressBar } from '@/components/ui';
import { CATEGORY_META, CATEGORY_ORDER, colors, layout, space, tabular, textRole } from '@/constants/theme';
import { COUNT_BY_CATEGORY, formatCount, getDrink, TOTAL } from '@/data';
import { latestCatch } from '@/lib/cabinet';
import { useCollection } from '@/store/collection';
import { useCustomDrinks } from '@/store/customDrinks';
import type { DrinkCategory, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Dex progress                                                         */
/*                                                                      */
/* Everything the less-stuff layout took off the Dex and Profile (spec  */
/* 5.2 and 5.5), one tap from the Dex's "38 / 2,089" and Profile's "38  */
/* drinks in your Dex ›", top to bottom:                                */
/*                                                                      */
/*   the Dex panel   the figure, "of 2,089 in the Dex · 1.8%", the rank */
/*                   and the ladder ruler (Ruler.tsx), then "171 more   */
/*                   to Barfly in Training, at 209"                     */
/*   latest catch    its print and name; opens the drink                */
/*   See your 38     the Dex, filtered to Caught                        */
/*   by kind         cocktails and spirits, each counted with its bar   */
/*   added by you    the drinks you added yourself, which have no Dex   */
/*                   number and so no place in the grid                 */
/*                                                                      */
/* Groups are set apart by space, never by rules or cards; the panel is */
/* the one wash surface (white spec 5.14).                              */
/*                                                                      */
/* SAME NUMBERS AS THE DEX. The figure counts catalogue drinks in the   */
/* collection, as the Dex's count and Profile's line do, so all three   */
/* say 38. A drink you added has no number and is not one of them.      */
/*                                                                      */
/* Reads the local collection only: it works signed out. Static: no     */
/* entrance animation, so nothing here waits on a frame loop to show.   */
/* ==================================================================== */

/**
 * The collection's figures: catalogue drinks only (an orphaned or
 * custom id is skipped), and how many of each kind.
 */
function deriveStats(unlocks: Record<string, UnlockRecord>) {
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, spirit: 0 };
  let unlockedCount = 0;
  for (const id of Object.keys(unlocks)) {
    const drink = getDrink(id);
    if (!drink) continue;
    unlockedCount += 1;
    byCategory[drink.category] += 1;
  }
  return { unlockedCount, byCategory };
}

const has = (map: Record<string, unknown>, id: string) => Object.prototype.hasOwnProperty.call(map, id);

export function CollectionStats({
  onOpenDrink,
  onOpenCustom,
  onSeeCaught,
  onPost,
  onAddDrink,
}: {
  onOpenDrink: (id: string) => void;
  onOpenCustom: (id: string) => void;
  /** The Dex, filtered to Caught. */
  onSeeCaught: () => void;
  /** An empty collection's way in: the + window. */
  onPost: () => void;
  onAddDrink: () => void;
}) {
  const unlocks = useCollection((s) => s.unlocks);
  const { unlockedCount, byCategory } = useMemo(() => deriveStats(unlocks), [unlocks]);
  const latest = useMemo(() => latestCatch(unlocks), [unlocks]);

  /*
   * The drinks you added: the stable records, sorted here (zustand v5
   * throws on a selector that builds a new array each call). Newest first:
   * the one just added is the one being looked for.
   */
  const customDrinks = useCustomDrinks((s) => s.drinks);
  const customPours = useCustomDrinks((s) => s.pours);
  const customReady = useCustomDrinks((s) => s.hydrated);
  const added = useMemo(
    () =>
      customReady ? Object.values(customDrinks).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [],
    [customReady, customDrinks],
  );

  return (
    <View>
      <DexPanel count={unlockedCount} total={TOTAL} />

      {/*
        With nothing caught, every figure here is a zero and none of them
        says how to change it, so the page's one key is the way in.
      */}
      {unlockedCount === 0 ? (
        <View style={styles.section}>
          <Text style={[textRole.body, styles.muted]}>Post your first drink to start your Dex.</Text>
          <Button label="Post a drink" icon="plus" block onPress={onPost} style={styles.key} />
        </View>
      ) : null}

      {latest ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.head]}>
            Latest catch
          </Text>
          <LatestCatch drink={latest.drink} record={latest.record} onOpen={onOpenDrink} />
          <Button
            label={`See your ${formatCount(unlockedCount)}`}
            variant="secondary"
            block
            onPress={onSeeCaught}
            accessibilityLabel={`See the ${formatCount(unlockedCount)} drinks in your Dex`}
            accessibilityHint="Opens the Dex showing only what you have caught"
            style={styles.key}
          />
        </View>
      ) : null}

      {/* Each kind with its own bar. One VoiceOver element a kind: the words say what the bar draws. */}
      <View style={[styles.section, styles.kinds]}>
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const total = COUNT_BY_CATEGORY[category];
          const count = byCategory[category];
          return (
            <View
              key={category}
              accessible
              accessibilityLabel={`${meta.plural}: ${formatCount(count)} of ${formatCount(total)} in your Dex`}>
              <View style={styles.kindHead}>
                <Text style={[textRole.body, styles.ink, styles.kindName]}>{meta.plural}</Text>
                <Text style={[textRole.small, styles.muted, tabular]}>
                  {formatCount(count)} of {formatCount(total)}
                </Text>
              </View>
              <ProgressBar value={count} max={total} />
            </View>
          );
        })}
      </View>

      {added.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.addedHead}>
            {/* One heading with its count, read together ("Added by you 3"). */}
            <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.addedTitle]}>
              Added by you<Text style={[textRole.small, styles.muted, tabular]}>{`  ${formatCount(added.length)}`}</Text>
            </Text>
            <Button
              label="Add a drink"
              variant="text"
              size="sm"
              icon="plus"
              onPress={onAddDrink}
              accessibilityHint="Opens a form to add a drink that is not in the Dex"
              style={styles.addedAdd}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // A status-bar tap scrolls the page home, not this row.
            scrollsToTop={false}
            style={styles.addedScroll}
            contentContainerStyle={styles.addedRow}>
            {added.map((c) => (
              <CustomDrinkTile
                key={c.id}
                drink={c}
                pourPhotoUri={has(customPours, c.id) ? (customPours[c.id].photoUri ?? null) : null}
                collected={has(customPours, c.id)}
                onPress={onOpenCustom}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  /* Groups are set apart by air (layout spec principle 3). */
  section: { marginTop: layout.section },
  head: { marginBottom: space.md },
  key: { marginTop: space.lg },

  kinds: { gap: space.xl },
  kindHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.md,
    marginBottom: space.sm,
  },
  kindName: { flexShrink: 1 },

  addedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  addedTitle: { flexShrink: 1 },
  /* The text key's own inset, taken back so its words end on the gutter. */
  addedAdd: { marginRight: -space.sm },
  /* The row scrolls edge to edge; its first tile starts on the gutter. */
  addedScroll: { marginHorizontal: -layout.gutter, marginTop: space.md },
  addedRow: { paddingHorizontal: layout.gutter, gap: space.lg, alignItems: 'flex-start' },
});
