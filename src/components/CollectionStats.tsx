import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import {
  Card,
  Divider,
  PressableScale,
  ProgressBar,
  RarityBadge,
  SectionLabel,
} from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  fonts,
  motion,
  radius,
  RARITY_META,
  RARITY_ORDER,
  space,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, COUNT_BY_RARITY, DRINKS_BY_ID, formatDexNumber, TOTAL } from '@/data';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory, Rarity, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Collection stats                                                     */
/*                                                                      */
/* The four blocks — Collection, Rarity, Milestones, Rarest entry —     */
/* extracted from the profile so the Stats tab and any future surface   */
/* render the identical thing. Reads the LOCAL collection; a peer's     */
/* stats are a different, post-derived view (see profile.tsx).          */
/* ==================================================================== */

/** The rank ladder, ascending. Also drives the milestones list. */
export const MILESTONES: { pct: number; title: string }[] = [
  { pct: 0, title: 'First Sips' },
  { pct: 10, title: 'Barfly in Training' },
  { pct: 25, title: 'The Regular' },
  { pct: 50, title: 'Connoisseur' },
  { pct: 75, title: 'Master of the Index' },
  { pct: 100, title: 'Living Legend' },
];

export function rankTitle(unlocked: number, total: number): string {
  if (unlocked === 0) return 'Empty Shelf';
  const pct = total > 0 ? (unlocked / total) * 100 : 0;
  let title = MILESTONES[0]!.title;
  for (const m of MILESTONES) {
    if (pct >= m.pct) title = m.title;
  }
  return title;
}

interface UnlockedEntry {
  drink: Drink;
  record: UnlockRecord;
}

export function deriveStats(unlocks: Record<string, UnlockRecord>) {
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, beer: 0, wine: 0, spirit: 0 };
  const byRarity: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };

  const entries: UnlockedEntry[] = [];
  for (const record of Object.values(unlocks)) {
    const drink = DRINKS_BY_ID[record.drinkId];
    if (!drink) continue; // orphaned record — skip defensively
    entries.push({ drink, record });
    byCategory[drink.category] += 1;
    byRarity[drink.rarity] += 1;
  }

  // Highest rarity wins; ties go to the most recent log.
  let prize: UnlockedEntry | null = null;
  for (const entry of entries) {
    if (!prize) {
      prize = entry;
      continue;
    }
    const w = RARITY_META[entry.drink.rarity].weight;
    const pw = RARITY_META[prize.drink.rarity].weight;
    if (w > pw || (w === pw && Date.parse(entry.record.date) > Date.parse(prize.record.date))) {
      prize = entry;
    }
  }

  return { unlockedCount: entries.length, byCategory, byRarity, prize };
}

/* ==================================================================== */
/* Component                                                            */
/* ==================================================================== */

export function CollectionStats({ onOpenDrink }: { onOpenDrink: (id: string) => void }) {
  const reduced = useReducedMotion();
  const unlocks = useCollection((s) => s.unlocks);

  const { unlockedCount, byCategory, byRarity, prize } = useMemo(
    () => deriveStats(unlocks),
    [unlocks],
  );
  const pct = TOTAL > 0 ? Math.floor((unlockedCount / TOTAL) * 100) : 0;

  const enter = (delay: number) =>
    reduced ? undefined : FadeInDown.duration(motion.base).delay(delay);

  return (
    <>
      {/* ---- Collection ---- */}
      <Animated.View entering={enter(0)}>
        <SectionLabel style={styles.sectionLabel}>Collection</SectionLabel>
        <Card style={styles.block}>
          <Text style={styles.rank}>{rankTitle(unlockedCount, TOTAL)}</Text>
          <View style={styles.rankCountRow}>
            <Text style={styles.rankCount}>{unlockedCount}</Text>
            <Text style={styles.rankTotal}>of {TOTAL} logged</Text>
            <Text style={styles.rankPct}>{pct}%</Text>
          </View>
          <ProgressBar value={unlockedCount} max={TOTAL} color={colors.wine} />

          <Divider style={styles.blockDivider} />

          {CATEGORY_ORDER.map((category) => {
            const meta = CATEGORY_META[category];
            const total = COUNT_BY_CATEGORY[category];
            const count = byCategory[category];
            return (
              <View
                key={category}
                style={styles.categoryRow}
                accessibilityLabel={`${meta.plural}: ${count} of ${total} logged`}>
                <View style={styles.categoryHead}>
                  <View style={[styles.categoryDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.categoryName}>{meta.plural}</Text>
                  <Text style={styles.categoryCount}>
                    {count}/{total}
                  </Text>
                </View>
                <ProgressBar value={count} max={total} color={meta.color} height={5} />
              </View>
            );
          })}
        </Card>
      </Animated.View>

      {/* ---- Rarity ---- */}
      <Animated.View entering={enter(motion.stagger)}>
        <SectionLabel style={styles.sectionLabel}>Rarity</SectionLabel>
        <Card style={styles.blockTight}>
          {RARITY_ORDER.map((rarity) => (
            <View
              key={rarity}
              style={styles.rarityRow}
              accessibilityLabel={`${RARITY_META[rarity].label}: ${byRarity[rarity]} of ${COUNT_BY_RARITY[rarity]} logged`}>
              <RarityBadge rarity={rarity} />
              <Text style={styles.rarityCount}>
                {byRarity[rarity]}/{COUNT_BY_RARITY[rarity]}
              </Text>
            </View>
          ))}
        </Card>
      </Animated.View>

      {/* ---- Milestones ---- */}
      <Animated.View entering={enter(motion.stagger * 2)}>
        <SectionLabel style={styles.sectionLabel}>Milestones</SectionLabel>
        <Card style={styles.blockTight}>
          {MILESTONES.map((m) => {
            const reached = unlockedCount > 0 && pct >= m.pct;
            return (
              <View
                key={m.title}
                style={styles.milestoneRow}
                accessibilityLabel={`${m.title}, ${m.pct} percent, ${reached ? 'reached' : 'not reached'}`}>
                <View
                  style={[
                    styles.milestoneMark,
                    reached && {
                      backgroundColor: colors.wineWash,
                      borderColor: colors.wineSoft,
                    },
                  ]}>
                  <Icon
                    name={reached ? 'check' : 'lock'}
                    size={13}
                    color={reached ? colors.wine : colors.textFaint}
                  />
                </View>
                <Text style={[styles.milestoneName, !reached && styles.milestoneNameDim]}>
                  {m.title}
                </Text>
                <Text style={styles.milestonePct}>{m.pct}%</Text>
              </View>
            );
          })}
        </Card>
      </Animated.View>

      {/* ---- Rarest entry ---- */}
      {prize ? (
        <Animated.View entering={enter(motion.stagger * 3)}>
          <SectionLabel style={styles.sectionLabel}>Rarest entry</SectionLabel>
          <PressableScale
            onPress={() => onOpenDrink(prize.drink.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${prize.drink.name}, your rarest entry`}
            style={styles.prize}>
            <View
              style={[
                styles.prizeThumb,
                { backgroundColor: CATEGORY_META[prize.drink.category].wash },
              ]}>
              {prize.record.photoUri ? (
                <Image
                  source={{ uri: prize.record.photoUri }}
                  style={styles.prizeImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <DrinkArt drink={prize.drink} size={40} flat />
              )}
            </View>
            <View style={styles.prizeBody}>
              <View style={styles.prizeNameRow}>
                <Text style={styles.prizeName} numberOfLines={1}>
                  {prize.drink.name}
                </Text>
                <Text style={styles.prizeDex}>{formatDexNumber(prize.drink.dexNumber)}</Text>
              </View>
              <RarityBadge rarity={prize.drink.rarity} />
            </View>
            <Icon name="chevronRight" size={18} color={colors.textFaint} />
          </PressableScale>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
  block: { padding: space.lg },
  blockTight: { paddingHorizontal: space.lg, paddingVertical: space.xs },

  rank: {
    fontFamily: fonts.display,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.wine,
  },
  rankCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  rankCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.headline.fontSize,
    color: colors.text,
  },
  rankTotal: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  rankPct: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  blockDivider: { marginVertical: space.lg },

  categoryRow: { marginBottom: space.md },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  categoryCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textMuted,
  },

  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rarityCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  milestoneMark: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  milestoneNameDim: { fontFamily: fonts.body, color: colors.textFaint },
  milestonePct: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textFaint,
  },

  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorderLit,
  },
  prizeThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeImage: { width: '100%', height: '100%' },
  prizeBody: { flex: 1, gap: space.sm },
  prizeNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  prizeName: {
    flex: 1,
    fontFamily: fonts.displayBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  prizeDex: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textFaint,
  },
});
