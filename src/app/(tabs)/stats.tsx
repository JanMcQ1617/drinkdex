import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoldButton, ProgressBar, RarityBadge, SectionLabel } from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  RARITY_META,
  RARITY_ORDER,
  colors,
  drinkGlyph,
  fonts,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, COUNT_BY_RARITY, DRINKS_BY_ID, formatDexNumber, TOTAL } from '@/data';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory, Rarity, UnlockRecord } from '@/types';
import { confirmDestructive } from '@/utils/alerts';

/* ------------------------------------------------------------------ */
/* Derivations                                                         */
/* ------------------------------------------------------------------ */

interface UnlockedEntry {
  drink: Drink;
  record: UnlockRecord;
}

interface CollectionStats {
  unlockedCount: number;
  byCategory: Record<DrinkCategory, number>;
  byRarity: Record<Rarity, number>;
  prize: UnlockedEntry | null;
  recent: UnlockedEntry[];
}

function rankTitle(unlocked: number, total: number): string {
  if (unlocked === 0) return 'Empty Shelf';
  const pct = total > 0 ? (unlocked / total) * 100 : 0;
  if (pct >= 100) return 'Living Legend';
  if (pct >= 75) return 'Master of the Index';
  if (pct >= 50) return 'Connoisseur';
  if (pct >= 25) return 'The Regular';
  if (pct >= 10) return 'Barfly in Training';
  return 'First Sips';
}

function deriveStats(unlocks: Record<string, UnlockRecord>): CollectionStats {
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

  const recent = entries
    .slice()
    .sort((a, b) => Date.parse(b.record.date) - Date.parse(a.record.date))
    .slice(0, 8);

  return { unlockedCount: entries.length, byCategory, byRarity, prize, recent };
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function GlyphPanel({ drink, size, radius }: { drink: Drink; size: number; radius: number }) {
  return (
    <View style={[styles.glyphPanel, { width: size, height: size, borderRadius: radius }]}>
      <Text style={{ fontSize: size * 0.42 }}>{drinkGlyph(drink)}</Text>
    </View>
  );
}

function RegionRow({ category, unlocked }: { category: DrinkCategory; unlocked: number }) {
  const meta = CATEGORY_META[category];
  const total = COUNT_BY_CATEGORY[category];
  const complete = total > 0 && unlocked >= total;
  return (
    <View
      style={[styles.card, styles.regionCard, complete && { borderColor: colors.gold + '55' }]}
      accessibilityLabel={`${meta.plural}: ${unlocked} of ${total} logged${complete ? ', complete' : ''}`}
    >
      <View style={styles.regionTop}>
        <Text style={styles.regionEmoji}>{meta.emoji}</Text>
        <Text style={styles.regionName} numberOfLines={1}>
          {meta.plural}
        </Text>
        {complete && (
          <View style={styles.completeTag}>
            <Text style={styles.completeTagText}>★ Complete</Text>
          </View>
        )}
        <Text style={styles.countText}>
          {unlocked} / {total}
        </Text>
      </View>
      <ProgressBar value={unlocked} max={total} color={meta.color} height={5} />
    </View>
  );
}

const RecentCard = React.memo(function RecentCard({
  entry,
  onPress,
}: {
  entry: UnlockedEntry;
  onPress: (id: string) => void;
}) {
  const { drink, record } = entry;
  const accent = CATEGORY_META[drink.category].color;
  return (
    <Pressable
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${drink.name}`}
      style={({ pressed }) => [styles.recentItem, pressed && styles.pressed]}
    >
      <View style={[styles.recentThumbWrap, { borderColor: accent + '55' }]}>
        {record.photoUri ? (
          <Image
            source={{ uri: record.photoUri }}
            style={styles.recentImage}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <GlyphPanel drink={drink} size={94} radius={13} />
        )}
      </View>
      <Text style={styles.recentName} numberOfLines={2}>
        {drink.name}
      </Text>
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unlocks = useCollection((s) => s.unlocks);
  const resetAll = useCollection((s) => s.resetAll);

  const stats = useMemo(() => deriveStats(unlocks), [unlocks]);
  const { unlockedCount, byCategory, byRarity, prize, recent } = stats;

  const rank = rankTitle(unlockedCount, TOTAL);
  const pctLabel = TOTAL > 0 ? Math.floor((unlockedCount / TOTAL) * 100) : 0;

  const openDrink = useCallback(
    (id: string) => {
      router.push({ pathname: '/drink/[id]', params: { id } });
    },
    [router]
  );

  const renderRecent = useCallback(
    ({ item }: { item: UnlockedEntry }) => <RecentCard entry={item} onPress={openDrink} />,
    [openDrink]
  );

  const confirmReset = useCallback(() => {
    confirmDestructive(
      'Reset collection?',
      'This relocks every entry and deletes your photos from the index.',
      'Reset',
      resetAll
    );
  }, [resetAll]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.header}>Collection</Text>

      {/* ---- Hero ---- */}
      <Animated.View entering={FadeInDown.duration(420)}>
        <View style={[styles.card, styles.heroCard]}>
          <Text style={styles.heroOverline}>Rank</Text>
          <Text style={styles.rankTitle}>{rank}</Text>
          <View style={styles.heroCountRow}>
            <Text style={styles.heroCount}>{unlockedCount}</Text>
            <Text style={styles.heroTotal}>/ {TOTAL} logged</Text>
            <View style={styles.flexSpacer} />
            <Text style={styles.heroPct}>{pctLabel}%</Text>
          </View>
          <ProgressBar value={unlockedCount} max={TOTAL} color={colors.gold} height={8} />
        </View>
      </Animated.View>

      {/* ---- Empty state ---- */}
      {unlockedCount === 0 && (
        <Animated.View entering={FadeInDown.delay(60).duration(400)}>
          <View style={[styles.card, styles.emptyCard]}>
            <Text style={styles.emptyTitle}>Your shelf is empty.</Text>
            <Text style={styles.emptyBody}>Find a drink, snap it, log it.</Text>
            <GoldButton
              label="Open the Dex"
              onPress={() => router.push('/')}
              style={styles.emptyBtnSpacing}
            />
          </View>
        </Animated.View>
      )}

      {/* ---- Regions ---- */}
      <Animated.View entering={FadeInDown.delay(90).duration(400)}>
        <SectionLabel style={styles.sectionLabel}>Regions</SectionLabel>
        {CATEGORY_ORDER.map((category) => (
          <RegionRow key={category} category={category} unlocked={byCategory[category]} />
        ))}
      </Animated.View>

      {/* ---- Rarity ---- */}
      <Animated.View entering={FadeInDown.delay(140).duration(400)}>
        <SectionLabel style={styles.sectionLabel}>Rarity</SectionLabel>
        <View style={[styles.card, styles.rarityCard]}>
          {RARITY_ORDER.map((rarity) => {
            const count = byRarity[rarity];
            const lit = rarity === 'legendary' && count > 0;
            return (
              <View
                key={rarity}
                style={[styles.rarityRow, lit && styles.rarityRowLit]}
                accessibilityLabel={`${RARITY_META[rarity].label}: ${count} of ${COUNT_BY_RARITY[rarity]} logged`}
              >
                <RarityBadge rarity={rarity} />
                <Text style={styles.countText}>
                  {count} / {COUNT_BY_RARITY[rarity]}
                </Text>
              </View>
            );
          })}
        </View>
      </Animated.View>

      {/* ---- Prize catch ---- */}
      {prize && (
        <Animated.View entering={FadeInDown.delay(190).duration(400)}>
          <SectionLabel style={styles.sectionLabel}>Prize catch</SectionLabel>
          <Pressable
            onPress={() => openDrink(prize.drink.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${prize.drink.name}, your rarest catch`}
            style={({ pressed }) => [
              styles.card,
              styles.prizeCard,
              { borderColor: CATEGORY_META[prize.drink.category].color + '3A' },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.prizeThumbWrap}>
              {prize.record.photoUri ? (
                <Image
                  source={{ uri: prize.record.photoUri }}
                  style={styles.prizeImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <GlyphPanel drink={prize.drink} size={56} radius={12} />
              )}
            </View>
            <View style={styles.prizeBody}>
              <View style={styles.prizeNameRow}>
                <Text style={styles.prizeName} numberOfLines={1}>
                  {prize.drink.name}
                </Text>
                <Text style={styles.prizeDex}>{formatDexNumber(prize.drink.dexNumber)}</Text>
              </View>
              <View style={styles.prizeMetaRow}>
                <Text style={styles.prizeSub} numberOfLines={1}>
                  {prize.drink.subcategory}
                </Text>
                <RarityBadge rarity={prize.drink.rarity} />
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ---- Recent pours ---- */}
      {recent.length > 0 && (
        <Animated.View entering={FadeInDown.delay(240).duration(400)}>
          <SectionLabel style={styles.sectionLabel}>Recent pours</SectionLabel>
          <FlatList
            horizontal
            data={recent}
            keyExtractor={(item) => item.record.drinkId}
            renderItem={renderRecent}
            showsHorizontalScrollIndicator={false}
            style={styles.recentList}
            contentContainerStyle={styles.recentListContent}
          />
        </Animated.View>
      )}

      {/* ---- Footer ---- */}
      <View style={styles.footer}>
        <Pressable
          onPress={confirmReset}
          accessibilityRole="button"
          accessibilityLabel="Reset collection"
          style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}
        >
          <Text style={styles.resetText}>Reset collection</Text>
        </Pressable>
        <Text style={styles.version}>DrinkDex v1.0 · codename build</Text>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    fontFamily: fonts.displayBold,
    fontSize: 28,
    color: colors.text,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
  },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 10,
  },
  flexSpacer: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
  glyphPanel: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },

  /* Hero */
  heroCard: {
    borderColor: colors.cardBorderLit,
    padding: 20,
  },
  heroOverline: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: 4,
  },
  rankTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 22,
    color: colors.gold,
  },
  heroCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 14,
  },
  heroCount: {
    fontFamily: fonts.displayBlack,
    fontSize: 56,
    lineHeight: 60,
    color: colors.text,
  },
  heroTotal: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textMuted,
    marginLeft: 8,
  },
  heroPct: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },

  /* Empty state */
  emptyCard: {
    marginTop: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyBtnSpacing: {
    marginTop: 16,
  },

  /* Regions */
  regionCard: {
    padding: 14,
    marginBottom: 10,
  },
  regionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  regionEmoji: {
    fontSize: 22,
    width: 32,
  },
  regionName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  completeTag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.gold + '40',
    backgroundColor: colors.gold + '1A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 10,
  },
  completeTagText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.gold,
  },

  /* Rarity */
  rarityCard: {
    padding: 6,
  },
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 11,
  },
  rarityRowLit: {
    backgroundColor: colors.gold + '14',
  },

  /* Prize catch */
  prizeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  prizeThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  prizeImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  prizeBody: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  prizeNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  prizeName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  prizeDex: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  prizeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  prizeSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  chevron: {
    fontFamily: fonts.body,
    fontSize: 24,
    lineHeight: 26,
    color: colors.textFaint,
    marginLeft: 2,
  },

  /* Recent pours */
  recentList: {
    marginHorizontal: -20,
  },
  recentListContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  recentItem: {
    width: 96,
  },
  recentThumbWrap: {
    width: 96,
    height: 96,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  recentImage: {
    width: '100%',
    height: '100%',
  },
  recentName: {
    fontFamily: fonts.display,
    fontSize: 13,
    lineHeight: 16,
    color: colors.text,
    marginTop: 8,
  },

  /* Footer */
  footer: {
    marginTop: 36,
    alignItems: 'center',
  },
  resetBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.danger,
  },
  version: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 10,
  },
});
