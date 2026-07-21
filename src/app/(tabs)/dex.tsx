import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { Divider, EmptyState, haptic, PressableScale, ProgressBar } from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  elevation,
  fonts,
  radius,
  RARITY_META,
  space,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, DRINKS, formatDexNumber, TOTAL } from '@/data';
import { useCollection, useIsUnlocked } from '@/store/collection';
import type { Drink, DrinkCategory } from '@/types';

/* ------------------------------------------------------------------ */
/* Grid geometry                                                       */
/* ------------------------------------------------------------------ */

const COLUMNS = 3;
const GRID_PAD = space.lg;
const GRID_GAP = space.sm;

/** DrinkArt's viewBox is 100×112, so height follows width by this factor. */
const ART_ASPECT = 112 / 100;

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

type RegionFilter = DrinkCategory | 'all';
type StatusFilter = 'all' | 'unlocked' | 'locked';

const STATUS_OPTIONS: { key: StatusFilter; label: string; a11y: string }[] = [
  { key: 'all', label: 'All', a11y: 'Show every entry' },
  { key: 'unlocked', label: 'Collected', a11y: 'Show only entries you have collected' },
  { key: 'locked', label: 'Not yet', a11y: 'Show only entries you have not collected' },
];

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function FilterChip({
  label,
  detail,
  selected,
  accent,
  wash,
  dot,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  /** Text and border once selected. Defaults to wine ink. */
  accent?: string;
  /** Fill once selected. Defaults to the wine wash. */
  wash?: string;
  /** Category swatch — carries the color the old chips got from an emoji. */
  dot?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const fg = selected ? (accent ?? colors.wine) : colors.textMuted;

  return (
    <PressableScale
      onPress={onPress}
      // PressableScale's own tap tick would stack with the selection tick below.
      noHaptic
      hitSlop={{ top: space.xs, bottom: space.xs }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, selected && { backgroundColor: wash ?? colors.wineWash, borderColor: fg }]}>
      {dot ? <View style={[styles.chipDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.chipLabel, { color: fg }]}>{label}</Text>
      {detail ? <Text style={styles.chipDetail}>{detail}</Text> : null}
    </PressableScale>
  );
}

interface DrinkCardProps {
  drink: Drink;
  /** Width of the artwork in points — derived from the live column width. */
  artSize: number;
  onPress: (id: string) => void;
}

const DrinkCard = React.memo(function DrinkCard({ drink, artSize, onPress }: DrinkCardProps) {
  // Per-card subscription: collecting one drink must not re-render the other 459.
  const unlocked = useIsUnlocked(drink.id);
  const accent = CATEGORY_META[drink.category].color;

  return (
    <PressableScale
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${formatDexNumber(drink.dexNumber)}, ${
        unlocked ? 'collected' : 'not collected yet'
      }`}
      style={[
        styles.card,
        unlocked ? styles.cardUnlocked : styles.cardLocked,
        unlocked && { borderColor: accent + '55' },
        unlocked && elevation.card,
      ]}>
      <View style={[styles.artZone, { height: Math.round(artSize * ART_ASPECT) }]}>
        <DrinkArt drink={drink} size={artSize} locked={!unlocked} flat />
      </View>

      <View style={styles.footer}>
        <Text style={styles.dexNumber}>{formatDexNumber(drink.dexNumber)}</Text>
        <Text numberOfLines={2} style={[styles.name, !unlocked && styles.nameLocked]}>
          {drink.name}
        </Text>
      </View>

      {/* Corner slot — rarity once collected, a lock until then. */}
      <View style={styles.cornerSlot} pointerEvents="none">
        {unlocked ? (
          <View style={[styles.rarityDot, { backgroundColor: RARITY_META[drink.rarity].color }]} />
        ) : (
          <View style={styles.lockBadge}>
            <Icon name="lock" size={11} color={colors.textFaint} filled />
          </View>
        )}
      </View>
    </PressableScale>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  /*
   * Membership size, not the map itself. Subscribing to `unlocks` here would
   * re-render the screen every time a photo is swapped on an entry already
   * collected; the count moves only when something is added or removed, which
   * is the only change the grid's filtering and progress care about.
   */
  const collected = useCollection((s) => Object.keys(s.unlocks).length);

  const [region, setRegion] = useState<RegionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const artSize = useMemo(() => {
    const column = (width - GRID_PAD * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
    return Math.round(column * 0.66);
  }, [width]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Read-not-subscribe: `collected` above is what invalidates this memo.
    const unlocks = useCollection.getState().unlocks;

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
    // `collected` looks unused — it is the invalidation key for the getState() read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collected, query, region, status]);

  const openDrink = useCallback(
    (id: string) => {
      router.push({ pathname: '/drink/[id]', params: { id } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Drink }) => (
      <DrinkCard drink={item} artSize={artSize} onPress={openDrink} />
    ),
    [artSize, openDrink],
  );

  const selectRegion = useCallback((next: RegionFilter) => {
    haptic.select();
    setRegion(next);
  }, []);

  const selectStatus = useCallback((next: StatusFilter) => {
    haptic.select();
    setStatus(next);
  }, []);

  const resetFilters = useCallback(() => {
    haptic.select();
    setRegion('all');
    setStatus('all');
    setQuery('');
  }, []);

  const filtered = region !== 'all' || status !== 'all' || query.length > 0;

  const header = (
    <View>
      <Text style={styles.title}>The Dex</Text>
      <Text style={styles.subtitle}>Every pour you have met, kept in one place.</Text>

      <View style={styles.progressBlock}>
        <View style={styles.progressRow}>
          <Text style={styles.progressCount}>
            {collected} of {TOTAL}
          </Text>
          <Text style={styles.progressLabel}>collected</Text>
        </View>
        <ProgressBar value={collected} max={TOTAL} />
      </View>

      {/* Region */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}>
        <FilterChip
          label="All"
          detail={String(TOTAL)}
          selected={region === 'all'}
          accessibilityLabel={`All regions, ${TOTAL} entries`}
          onPress={() => selectRegion('all')}
        />
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const total = COUNT_BY_CATEGORY[category];
          return (
            <FilterChip
              key={category}
              label={meta.plural}
              detail={String(total)}
              selected={region === category}
              accent={meta.color}
              wash={meta.wash}
              dot={meta.color}
              accessibilityLabel={`${meta.plural}, ${total} entries`}
              onPress={() => selectRegion(category)}
            />
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchIcon}>
          <Icon name="search" size={17} color={colors.textFaint} />
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the index"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search drinks by name or style"
        />
        {query.length > 0 ? (
          <PressableScale
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clearBtn}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        {STATUS_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            label={option.label}
            selected={status === option.key}
            accessibilityLabel={option.a11y}
            onPress={() => selectStatus(option.key)}
          />
        ))}
      </View>

      <Divider style={styles.headerRule} />
    </View>
  );

  return (
    <FlatList
      data={rows}
      renderItem={renderItem}
      keyExtractor={(drink) => drink.id}
      numColumns={COLUMNS}
      style={styles.screen}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={[styles.listContent, { paddingTop: insets.top + space.md }]}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          icon="search"
          title="Nothing on this shelf"
          body="No entry matches that combination yet. Widen the search and the board fills back in."
          action={filtered ? { label: 'Clear filters', onPress: resetFilters } : undefined}
        />
      }
      /* 460 rows of SVG artwork — keep the mounted window tight. */
      initialNumToRender={18}
      maxToRenderPerBatch={12}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
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
    paddingHorizontal: GRID_PAD,
    paddingBottom: space.xxxl,
    gap: GRID_GAP,
  },
  gridRow: {
    gap: GRID_GAP,
  },

  /* Header */
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  progressBlock: {
    marginTop: space.lg,
    gap: space.sm,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
  },
  progressCount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  progressLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: typeScale.caption.letterSpacing,
    color: colors.textFaint,
  },

  /* Chips */
  chipScroll: {
    // Bleeds past the list padding so the row can scroll edge to edge.
    marginHorizontal: -GRID_PAD,
    marginTop: space.lg,
  },
  chipScrollContent: {
    paddingHorizontal: GRID_PAD,
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
  },
  chipDetail: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },

  /* Search */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  searchIcon: {
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    paddingRight: space.sm,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  clearBtn: {
    width: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  headerRule: {
    marginTop: space.xl,
    marginBottom: space.xs,
  },

  /* Grid cards */
  card: {
    flex: 1,
    aspectRatio: 0.78,
    paddingTop: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardUnlocked: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
  },
  cardLocked: {
    // Sits back into the page rather than lifting off it.
    backgroundColor: colors.cardAlt,
    borderColor: colors.cardBorder,
  },
  artZone: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flex: 1,
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    gap: 1,
  },
  dexNumber: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.4,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 12,
    lineHeight: 15,
    color: colors.text,
  },
  nameLocked: {
    // Readable, but clearly not yours yet.
    color: colors.textFaint,
  },
  cornerSlot: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
  },
  rarityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  lockBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSunk,
  },
});
