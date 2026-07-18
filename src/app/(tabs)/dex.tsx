import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORY_META, CATEGORY_ORDER, RARITY_META, colors, drinkGlyph, fonts } from '@/constants/theme';
import { COUNT_BY_CATEGORY, DRINKS, DRINKS_BY_ID, formatDexNumber, TOTAL } from '@/data';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory } from '@/types';

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

type RegionFilter = DrinkCategory | 'all';
type StatusFilter = 'all' | 'unlocked' | 'locked';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unlocked', label: 'Unlocked' },
  { key: 'locked', label: 'Locked' },
];

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function RegionChip({
  label,
  count,
  selected,
  accent,
  emoji,
  onPress,
}: {
  label: string;
  count: string;
  selected: boolean;
  accent?: string;
  emoji?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} region, ${count} logged`}
      style={({ pressed }) => [
        styles.chip,
        selected &&
          (accent
            ? { borderColor: accent, backgroundColor: accent + '1F' }
            : styles.chipSelectedNeutral),
        pressed && styles.pressed,
      ]}
    >
      {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      <Text style={styles.chipCount}>{count}</Text>
    </Pressable>
  );
}

interface DrinkCardProps {
  drink: Drink;
  onPress: (id: string) => void;
}

const DrinkCard = React.memo(function DrinkCard({ drink, onPress }: DrinkCardProps) {
  // Fine-grained subscription: this card only re-renders when its own record changes.
  const record = useCollection((s) => s.unlocks[drink.id]);
  const isUnlocked = Boolean(record);
  const photoUri = record?.photoUri ?? null;
  const accent = CATEGORY_META[drink.category].color;
  return (
    <Pressable
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${formatDexNumber(drink.dexNumber)}, ${
        isUnlocked ? 'logged' : 'not logged yet'
      }`}
      style={({ pressed }) => [
        styles.card,
        isUnlocked ? [styles.cardUnlocked, { borderColor: accent }] : styles.cardLocked,
        pressed && styles.pressed,
      ]}
    >
      {isUnlocked && photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.cardPhoto} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.cardGlyphZone}>
          <Text style={[styles.cardGlyph, !isUnlocked && styles.cardGlyphLocked]}>
            {drinkGlyph(drink)}
          </Text>
        </View>
      )}
      <View style={styles.cardFooter}>
        <Text style={[styles.cardDex, isUnlocked && styles.cardDexUnlocked]}>
          {formatDexNumber(drink.dexNumber)}
        </Text>
        <Text numberOfLines={2} style={[styles.cardName, isUnlocked && styles.cardNameUnlocked]}>
          {drink.name}
        </Text>
      </View>
      <View
        style={[
          styles.rarityDot,
          { backgroundColor: RARITY_META[drink.rarity].color },
          !isUnlocked && styles.rarityDotLocked,
        ]}
      />
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unlocks = useCollection((s) => s.unlocks);

  const [region, setRegion] = useState<RegionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const byCategory: Record<DrinkCategory, number> = { cocktail: 0, beer: 0, wine: 0, spirit: 0 };
    let total = 0;
    for (const id of Object.keys(unlocks)) {
      const drink = DRINKS_BY_ID[id];
      if (!drink) continue; // orphaned record — skip defensively
      byCategory[drink.category] += 1;
      total += 1;
    }
    return { byCategory, total };
  }, [unlocks]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DRINKS.filter((drink) => {
      if (region !== 'all' && drink.category !== region) return false;
      if (status !== 'all') {
        const has = Boolean(unlocks[drink.id]);
        if (status === 'unlocked' ? !has : has) return false;
      }
      if (
        q.length > 0 &&
        !drink.name.toLowerCase().includes(q) &&
        !drink.subcategory.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [query, region, status, unlocks]);

  const openDrink = useCallback(
    (id: string) => {
      router.push({ pathname: '/drink/[id]', params: { id } });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Drink }) => <DrinkCard drink={item} onPress={openDrink} />,
    [openDrink]
  );

  const header = (
    <View>
      {/* Wordmark + counter */}
      <View style={styles.titleRow}>
        <Text style={styles.wordmark}>The Dex</Text>
        <Text style={styles.counter}>
          <Text style={styles.counterNum}>{counts.total}</Text> / {TOTAL}
        </Text>
      </View>

      {/* Region chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}
      >
        <RegionChip
          label="All"
          count={`${counts.total} / ${TOTAL}`}
          selected={region === 'all'}
          onPress={() => setRegion('all')}
        />
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          return (
            <RegionChip
              key={category}
              label={meta.plural}
              emoji={meta.emoji}
              count={`${counts.byCategory[category]} / ${COUNT_BY_CATEGORY[category]}`}
              selected={region === category}
              accent={meta.color}
              onPress={() => setRegion(category)}
            />
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the index…"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search drinks by name or style"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Status filter */}
      <View style={styles.segmentRow}>
        {STATUS_OPTIONS.map((option) => {
          const selected = status === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setStatus(option.key)}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${option.label.toLowerCase()} entries`}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.segmentSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <FlatList
      data={rows}
      renderItem={renderItem}
      keyExtractor={(drink) => drink.id}
      numColumns={3}
      style={styles.screen}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 12 }]}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Nothing on the shelf</Text>
          <Text style={styles.emptyBody}>Try a different search or region.</Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 10,
  },
  gridRow: {
    gap: 10,
  },
  pressed: {
    opacity: 0.72,
  },

  /* Header */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  wordmark: {
    fontFamily: fonts.displayBold,
    fontSize: 28,
    color: colors.gold,
  },
  counter: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  counterNum: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },

  /* Region chips */
  chipScroll: {
    marginHorizontal: -20,
    marginBottom: 12,
  },
  chipScrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  chipEmoji: {
    fontSize: 13,
  },
  chipLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  chipLabelSelected: {
    color: colors.text,
  },
  chipCount: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  chipSelectedNeutral: {
    borderColor: colors.cardBorderLit,
    backgroundColor: colors.card,
  },

  /* Search */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    marginBottom: 10,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
  },
  clearBtn: {
    width: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textFaint,
  },

  /* Status segments */
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  segment: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorderLit,
  },
  segmentText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  segmentTextSelected: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
  },

  /* Grid cards */
  card: {
    flex: 1,
    maxWidth: '32%',
    aspectRatio: 0.82,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardLocked: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardUnlocked: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
  },
  cardPhoto: {
    width: '100%',
    height: '58%',
    backgroundColor: colors.surface,
  },
  cardGlyphZone: {
    height: '58%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGlyph: {
    fontSize: 34,
  },
  cardGlyphLocked: {
    opacity: 0.16,
  },
  cardFooter: {
    flex: 1,
    paddingHorizontal: 9,
    paddingTop: 6,
    gap: 2,
  },
  cardDex: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  cardDexUnlocked: {
    color: colors.textMuted,
  },
  cardName: {
    fontFamily: fonts.display,
    fontSize: 13,
    lineHeight: 16,
    color: colors.textMuted,
  },
  cardNameUnlocked: {
    color: colors.text,
  },
  rarityDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  rarityDotLocked: {
    opacity: 0.4,
  },

  /* Empty state */
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
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
});
