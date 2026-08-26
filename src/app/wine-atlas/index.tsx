import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { Divider, EmptyState, PressableScale, SectionLabel } from '@/components/ui';
import {
  colors,
  fonts,
  label as labelType,
  radius,
  space,
  tabular,
  type as typeScale,
} from '@/constants/theme';
import {
  ALPHABETICAL,
  ATLAS_COUNTRIES,
  ATLAS_COUNTS,
  ATLAS_GRAPES,
  ATLAS_WINES,
  fold,
  groupByCountry,
  queryGrapes,
  queryWines,
  STYLE_FAMILY_ORDER,
} from '@/data/wineAtlas';
import type { AtlasGrape, AtlasWine, GrapeColor } from '@/types';

/* ------------------------------------------------------------------ */
/* The WINE atlas — reference, not collection                          */
/*                                                                     */
/* Nothing on this screen can be collected and nothing carries a dex    */
/* number. It exists so a wine card has a world behind it: 1,558 named  */
/* wines and the 408 varieties they are made from. The Dex stays 460    */
/* authored cards.                                                     */
/* ------------------------------------------------------------------ */

type Mode = 'countries' | 'az' | 'grapes';

const MODES: { key: Mode; label: string; a11y: string }[] = [
  { key: 'countries', label: 'Countries', a11y: 'Browse wines by country' },
  { key: 'az', label: 'A–Z', a11y: 'Browse every wine alphabetically' },
  { key: 'grapes', label: 'Grapes', a11y: 'Browse grape varieties' },
];

const GRAPE_COLORS: GrapeColor[] = ['Red', 'White', 'Pink'];

/** Style ink, so a row reads as red/white/rosé before the label is read. */
const STYLE_INK: Record<string, string> = {
  Red: colors.wine,
  'Sweet Red': colors.merlot,
  'Sparkling Red': colors.merlot,
  White: colors.giltInk,
  'Sweet White': colors.giltInk,
  'Vin Jaune': colors.giltInk,
  Rosé: colors.wineSoft,
  'Sparkling Rosé': colors.wineSoft,
  'Sweet Rosé': colors.wineSoft,
  Sparkling: colors.taupeInk,
  Fortified: colors.wineDeep,
  Orange: colors.amber,
  Various: colors.textFaint,
};

const inkFor = (s: string) => STYLE_INK[s] ?? colors.textMuted;

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

type Row =
  | { kind: 'country'; key: string; name: string; note: string; count: number }
  | { kind: 'letter'; key: string; letter: string }
  | { kind: 'wine'; key: string; wine: AtlasWine }
  | { kind: 'grape'; key: string; index: number; grape: AtlasGrape };

function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </PressableScale>
  );
}

function WineRow({ wine }: { wine: AtlasWine }) {
  const grapes = wine.g.map((i) => ATLAS_GRAPES[i].name).join(', ');
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{wine.n}</Text>
        <Text style={styles.rowRegion} numberOfLines={1}>
          {wine.r}
        </Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={[styles.styleTag, { color: inkFor(wine.s) }]}>{wine.s}</Text>
        <Text style={styles.tierText} numberOfLines={1}>
          {wine.t}
        </Text>
      </View>
      {grapes ? (
        <Text style={styles.rowGrapes} numberOfLines={2}>
          {grapes}
        </Text>
      ) : null}
    </View>
  );
}

function GrapeRow({
  grape,
  index,
  onPress,
}: {
  grape: AtlasGrape;
  index: number;
  onPress: (i: number) => void;
}) {
  const where = grape.countries.map((c) => ATLAS_COUNTRIES[c].name);
  return (
    <PressableScale
      onPress={() => onPress(index)}
      accessibilityRole="button"
      accessibilityLabel={`${grape.name}, ${grape.wines.length} wines. Show them.`}
      style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{grape.name}</Text>
        <Text style={[styles.styleTag, { color: inkFor(grape.color) }]}>{grape.color}</Text>
      </View>
      {grape.synonyms.length ? (
        <Text style={styles.rowGrapes} numberOfLines={1}>
          Also called {grape.synonyms.join(', ')}
        </Text>
      ) : null}
      {grape.note ? <Text style={styles.grapeNote}>{grape.note}</Text> : null}
      <Text style={styles.grapeMeta}>
        <Text style={tabular}>{grape.wines.length}</Text>
        {grape.wines.length === 1 ? ' wine' : ' wines'}
        {where.length ? ` · ${where.slice(0, 4).join(', ')}` : ''}
        {where.length > 4 ? ` +${where.length - 4}` : ''}
      </Text>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function AtlasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; country?: string; grape?: string }>();

  const [mode, setMode] = useState<Mode>('countries');
  const [term, setTerm] = useState(params.q ?? '');
  const [family, setFamily] = useState<string | null>(null);
  const [color, setColor] = useState<GrapeColor | null>(null);
  const [grape, setGrape] = useState<number | null>(
    params.grape != null ? Number(params.grape) : null
  );
  const [country, setCountry] = useState<string | null>(params.country ?? null);

  const activeGrape = grape != null ? ATLAS_GRAPES[grape] : null;

  const rows = useMemo<Row[]>(() => {
    if (mode === 'grapes') {
      return queryGrapes(term, color).map((i) => ({
        kind: 'grape' as const,
        key: `g${i}`,
        index: i,
        grape: ATLAS_GRAPES[i],
      }));
    }

    const hits = queryWines({ term, family, country, grape });

    if (mode === 'az') {
      const keep = new Set(hits);
      const out: Row[] = [];
      let letter = '';
      for (const i of ALPHABETICAL) {
        if (!keep.has(i)) continue;
        const L = fold(ATLAS_WINES[i].n)[0].toUpperCase();
        if (L !== letter) {
          letter = L;
          out.push({ kind: 'letter', key: `L${L}`, letter: L });
        }
        out.push({ kind: 'wine', key: `w${i}`, wine: ATLAS_WINES[i] });
      }
      return out;
    }

    const out: Row[] = [];
    for (const group of groupByCountry(hits)) {
      out.push({
        kind: 'country',
        key: `c${group.country.name}`,
        name: group.country.name,
        note: group.country.note,
        count: group.wines.length,
      });
      for (const i of group.wines) out.push({ kind: 'wine', key: `w${i}`, wine: ATLAS_WINES[i] });
    }
    return out;
  }, [mode, term, family, color, country, grape]);

  const wineCount = useMemo(
    () => rows.filter((r) => r.kind === 'wine' || r.kind === 'grape').length,
    [rows]
  );

  const showGrapeWines = useCallback((i: number) => {
    setGrape(i);
    setMode('countries');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.kind) {
        case 'country':
          return (
            <View style={styles.countryHead}>
              <View style={styles.countryTop}>
                <Text style={styles.countryName}>{item.name}</Text>
                <Text style={[styles.countryCount, tabular]}>{item.count}</Text>
              </View>
              {item.note ? <Text style={styles.countryNote}>{item.note}</Text> : null}
            </View>
          );
        case 'letter':
          return <Text style={styles.letter}>{item.letter}</Text>;
        case 'wine':
          return <WineRow wine={item.wine} />;
        case 'grape':
          return <GrapeRow grape={item.grape} index={item.index} onPress={showGrapeWines} />;
      }
    },
    [showGrapeWines]
  );

  const filters = mode === 'grapes' ? GRAPE_COLORS : STYLE_FAMILY_ORDER;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </PressableScale>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>REFERENCE</Text>
          <Text style={styles.title}>Wine Atlas</Text>
        </View>
      </View>

      <Text style={styles.lede}>
        Every wine that carries a name of its own — {ATLAS_COUNTS.wines.toLocaleString()}{' '}
        appellations and styles across {ATLAS_COUNTS.countries} countries, and the{' '}
        {ATLAS_COUNTS.grapes} grape varieties behind them. Nothing here is collectible.
      </Text>

      <View style={styles.searchWrap}>
        <Icon name="search" size={16} color={colors.textFaint} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Wine, country, region or grape"
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel="Search the atlas"
        />
      </View>

      <View style={styles.segment}>
        {MODES.map((m) => (
          <PressableScale
            key={m.key}
            onPress={() => {
              setMode(m.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m.key }}
            accessibilityLabel={m.a11y}
            style={[styles.segItem, mode === m.key && styles.segItemOn]}>
            <Text style={[styles.segText, mode === m.key && styles.segTextOn]}>{m.label}</Text>
          </PressableScale>
        ))}
      </View>

      <FlatList
        data={filters}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(f) => f}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item }) => (
          <Chip
            label={item}
            selected={mode === 'grapes' ? color === item : family === item}
            onPress={() => {
              if (mode === 'grapes') setColor(color === item ? null : (item as GrapeColor));
              else setFamily(family === item ? null : item);
            }}
          />
        )}
      />

      {activeGrape || country ? (
        <PressableScale
          onPress={() => {
            setGrape(null);
            setCountry(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear this filter"
          style={styles.activeFilter}>
          <Text style={styles.activeFilterText}>
            {activeGrape ? `Made from ${activeGrape.name}` : `${country}`}
          </Text>
          <Icon name="close" size={14} color={colors.wine} />
        </PressableScale>
      ) : null}

      <Divider style={styles.divider} />

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={9}
        removeClippedSubviews
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxxl }]}
        ListHeaderComponent={
          <SectionLabel style={styles.tally}>
            {wineCount.toLocaleString()} {mode === 'grapes' ? 'varieties' : 'wines'}
          </SectionLabel>
        }
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="Nothing matches that"
            body={
              mode === 'grapes'
                ? 'Synonyms are searchable too — try Shiraz, Tinta Roriz or Primitivo.'
                : 'Try a grape, a region, or clear the style filter.'
            }
          />
        }
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  headerText: { flex: 1 },
  eyebrow: {
    ...labelType.ui,
    fontFamily: fonts.label,
    color: colors.taupeInk,
  },
  title: {
    fontFamily: fonts.display,
    ...typeScale.headline,
    color: colors.text,
    marginTop: 2,
  },
  lede: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    color: colors.textMuted,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
  search: {
    flex: 1,
    fontFamily: fonts.body,
    ...typeScale.body,
    color: colors.text,
    padding: 0,
  },

  segment: {
    flexDirection: 'row',
    gap: space.xs,
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
  },
  segItem: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segItemOn: { backgroundColor: colors.wine },
  segText: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.caption,
    color: colors.textMuted,
  },
  segTextOn: { color: colors.textOnWine },

  /*
   * Explicit height, not just flexGrow: 0.
   *
   * A horizontal FlatList in a flex column has no intrinsic height, so when
   * the results list below it is long the chips get squeezed and render
   * sliced in half. The height is the chip's own box: 12pt line + 6pt
   * padding top and bottom + hairline borders, rounded up.
   */
  filterRow: { flexGrow: 0, flexShrink: 0, height: 34, marginTop: space.md },
  filterContent: { paddingHorizontal: space.lg, gap: space.xs, alignItems: 'center' },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.taupe,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.wineWash, borderColor: colors.wine },
  chipText: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.micro,
    color: colors.textMuted,
  },
  chipTextOn: { color: colors.wine },

  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.wineWash,
  },
  activeFilterText: {
    fontFamily: fonts.bodySemiBold,
    ...typeScale.caption,
    color: colors.wine,
  },

  divider: { marginTop: space.lg, marginHorizontal: space.lg },
  list: { paddingHorizontal: space.lg },
  tally: { paddingTop: space.md, paddingBottom: space.xs },

  countryHead: { paddingTop: space.xl, paddingBottom: space.sm },
  countryTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  countryName: {
    flex: 1,
    fontFamily: fonts.display,
    ...typeScale.title,
    color: colors.text,
  },
  countryCount: {
    fontFamily: fonts.numeral,
    ...typeScale.caption,
    color: colors.textFaint,
  },
  countryNote: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    color: colors.textMuted,
    marginTop: space.xs,
  },

  letter: {
    fontFamily: fonts.display,
    ...typeScale.title,
    color: colors.wine,
    paddingTop: space.xl,
    paddingBottom: space.xs,
  },

  row: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
    gap: 3,
  },
  rowMain: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  rowName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    ...typeScale.body,
    color: colors.text,
  },
  rowRegion: {
    fontFamily: fonts.body,
    ...typeScale.micro,
    color: colors.textFaint,
    maxWidth: '45%',
    textAlign: 'right',
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  styleTag: {
    fontFamily: fonts.label,
    ...typeScale.micro,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tierText: {
    flex: 1,
    fontFamily: fonts.body,
    ...typeScale.micro,
    color: colors.textFaint,
  },
  rowGrapes: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    color: colors.textMuted,
  },
  grapeNote: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  grapeMeta: {
    fontFamily: fonts.body,
    ...typeScale.micro,
    color: colors.textFaint,
    marginTop: 2,
  },
});
