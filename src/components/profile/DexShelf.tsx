import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { deriveStats } from '@/components/CollectionStats';
import { DexCard } from '@/components/DexCard';
import { Button, Card } from '@/components/ui';
import {
  colors,
  fonts,
  layout,
  RARITY_META,
  RARITY_ORDER,
  space,
  stroke,
  tabular,
  textRole,
} from '@/constants/theme';
import { formatCount, getDrink, TOTAL } from '@/data';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory, Post, Rarity } from '@/types';

/* ==================================================================== */
/* A profile's Dex tab                                                  */
/*                                                                      */
/* The drinks this person has shared, in Dex order, as Dex cards: the    */
/* binder view is what makes a profile Sipply's rather than any photo    */
/* app's. It is built from their PUBLIC POSTS only. A collection lives   */
/* on its owner's phone and never reaches the server, so this is the     */
/* honest substitute, and the summary says "shared", never "collected". */
/* On your own profile, one button leads to the real thing, your Dex.   */
/* ==================================================================== */

/**
 * Stats for a profile, derived from its PUBLIC POSTS only.
 *
 * A peer's real collection lives on their device and never reaches the
 * server, so this is the honest substitute: the category and rarity spread
 * of the pours they've actually shared. `counted` skips posts whose drink
 * isn't in this build, so the figures sum to the drinks we can classify.
 */
export function derivePostStats(posts: Post[]) {
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, spirit: 0 };
  const byRarity: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };

  let counted = 0;
  for (const post of posts) {
    const drink = getDrink(post.drinkId);
    if (!drink) continue;
    counted += 1;
    byCategory[drink.category] += 1;
    byRarity[drink.rarity] += 1;
  }

  return { counted, byCategory, byRarity };
}

/**
 * The shared drinks, lowest Dex number first. A post is one drink (one
 * post per drink, migration 007), so there is nothing to de-duplicate.
 */
export function drinksByDexNumber(posts: Post[]): Drink[] {
  return posts
    .map((p) => getDrink(p.drinkId))
    .filter((d): d is Drink => !!d)
    .sort((a, b) => a.dexNumber - b.dexNumber);
}

/**
 * The head of the Dex tab: how many drinks are shared, the rarity spread
 * as a four-cell strip, and on your own profile the way into your Dex.
 */
export function DexSummary({
  posts,
  isOwn,
  pageOnly,
}: {
  posts: Post[];
  isOwn: boolean;
  /** The posts are one page of more, so every figure here covers that page. */
  pageOnly: boolean;
}) {
  const router = useRouter();
  const { counted, byRarity } = useMemo(() => derivePostStats(posts), [posts]);
  const unlocks = useCollection((s) => s.unlocks);
  const { unlockedCount } = useMemo(() => deriveStats(unlocks), [unlocks]);

  return (
    <View style={styles.summary}>
      <Text style={styles.headline}>
        {formatCount(counted)} of {formatCount(TOTAL)} shared
      </Text>
      {/*
        Past one page, "shared" is the latest page's spread, not everything,
        and the line says so rather than pass a hundred off as the total.
      */}
      {pageOnly ? (
        <Text style={styles.note}>
          Based on {isOwn ? 'your' : 'their'} latest {formatCount(posts.length)} posts
        </Text>
      ) : null}

      {isOwn ? (
        /*
         * What other people see is above; what you have actually collected
         * (most of it never posted) is one tap away, in the Dex tab, rather
         * than a second figure in the header that only your profile could
         * show.
         */
        <Button
          label={`${formatCount(unlockedCount)} in your Dex`}
          variant="text"
          size="sm"
          onPress={() => router.navigate('/dex')}
          accessibilityHint="Opens your Dex"
          style={styles.dexLink}
        />
      ) : null}

      <Card style={styles.strip}>
        {RARITY_ORDER.map((rarity, i) => (
          <View
            key={rarity}
            accessible
            accessibilityLabel={`${RARITY_META[rarity].label}, ${byRarity[rarity]}`}
            style={[styles.cell, i > 0 && styles.cellRuled]}>
            <Text style={styles.figure} maxFontSizeMultiplier={1.4}>
              {formatCount(byRarity[rarity])}
            </Text>
            {/* The tier's text colour, audited on white; the name says it too. */}
            <Text
              style={[styles.tier, { color: RARITY_META[rarity].color }]}
              maxFontSizeMultiplier={1.4}>
              {RARITY_META[rarity].label}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

/**
 * Two Dex cards to a row, the Dex tab's own geometry: 2-up because three
 * cards on a 375pt screen leave the drink's name a word or two wide (the
 * Dex tab's note), and the same card so a drink looks the same wherever
 * it is shown. Each is drawn collected, with the stock photograph: the
 * person's own pour photos are on the Posts tab.
 */
export function DexShelfRow({ drinks }: { drinks: Drink[] }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Unrounded, like the Dex grid's: a rounded width leaves a sliver or wraps.
  const cardWidth = (width - layout.gutter * 2 - space.sm) / 2;
  const artSize = Math.round(cardWidth * 0.66);

  return (
    <View style={styles.shelfRow}>
      {drinks.map((drink) => (
        <DexCard
          key={drink.id}
          drink={drink}
          collected
          userPhotoUri={null}
          cardWidth={cardWidth}
          artSize={artSize}
          onPress={(id) => router.push({ pathname: '/drink/[id]', params: { id } })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  headline: { ...textRole.sectionTitle, color: colors.text },
  note: { ...textRole.helper, color: colors.textMuted, marginTop: 2 },
  // A text button sits on its own 44pt hit line; this keeps its label on the gutter.
  dexLink: { alignSelf: 'flex-start', marginLeft: -space.sm },
  strip: {
    marginTop: space.md,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cell: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  cellRuled: { borderLeftWidth: stroke.hair, borderLeftColor: colors.line },
  figure: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    ...tabular,
  },
  tier: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14 },
  shelfRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    marginBottom: space.sm,
  },
});
