import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Chip, EmptyState, SearchField, SegmentedControl, type SegmentItem } from '@/components/ui';
import { colors, layout, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import {
  ALPHABETICAL,
  ATLAS_COUNTRIES,
  ATLAS_COUNTS,
  ATLAS_GRAPES,
  ATLAS_WINES,
  fold,
  GRAPES_IN_WINES,
  groupByCountry,
  queryGrapes,
  queryWines,
  STYLE_FAMILY_ORDER,
} from '@/data/wineAtlas';
import { cardOfAtlasWine } from '@/data/wineAtlasLinks';
import { styleLabel } from '@/lib/drinkLabels';
import type { AtlasGrape, AtlasWine, GrapeColor } from '@/types';

/* ==================================================================== */
/* The Wine Atlas                                                       */
/*                                                                      */
/* Every wine with a name of its own, 2,315 appellations and styles in  */
/* 91 countries, and the 465 grape varieties behind them: the map the  */
/* Dex's wine cards sit on. Opened from a wine card's "On the map"      */
/* (components/DrinkPanels' OnTheMap), on that wine or on its grape.    */
/*                                                                      */
/* BACK FROM 20 SEP 2026 (v4.14, specs/v4.14/wine-restore.md). The      */
/* screen left with wine and came back with it, rebuilt in Daylight's   */
/* kit: the old one inked every row in its wine's colour (merlot for a  */
/* red, gilt for a white) and filled its keys in wine, and Daylight has */
/* no hue but the accent's seven places. A row says its style in words  */
/* now ("Sweet white"), which is what the colour was standing in for.   */
/*                                                                      */
/* One thing is new: a wine row opens its Dex card. Every atlas wine is */
/* a card since wine came back (scripts/merge-wine-atlas.mjs), so the   */
/* atlas is a way into the Dex rather than a reference beside it; the   */
/* card is found by the atlas links (data/wineAtlasLinks'               */
/* cardOfAtlasWine). A grape row filters the wines to that grape.       */
/*                                                                      */
/* The field, the switch and the chips stand still over the list; only */
/* the list scrolls, under the bar's rule. Nothing here animates but    */
/* the switch's own thumb.                                              */
/* ==================================================================== */

type Mode = 'countries' | 'az' | 'grapes';

const MODES: readonly SegmentItem<Mode>[] = [
  { key: 'countries', label: 'Countries', a11yLabel: 'Wines by country' },
  { key: 'az', label: 'A–Z', a11yLabel: 'Every wine, A to Z' },
  { key: 'grapes', label: 'Grapes', a11yLabel: 'Grape varieties' },
];

const GRAPE_COLORS: readonly GrapeColor[] = ['Red', 'White', 'Pink'];

type Row =
  | { kind: 'country'; key: string; name: string; note: string; count: number }
  | { kind: 'letter'; key: string; letter: string }
  | { kind: 'wine'; key: string; wine: AtlasWine; withCountry: boolean }
  | { kind: 'grape'; key: string; index: number; grape: AtlasGrape };

/** A route param as one string, or null: expo-router hands over an array for a repeated key. */
const one = (v: string | string[] | undefined) => (typeof v === 'string' && v !== '' ? v : null);

/** A grape index from the route, or null for anything that is not one. */
function grapeParam(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < ATLAS_GRAPES.length ? n : null;
}

/** A country from the route, only when the atlas has it. */
const countryParam = (v: string | null) => (v !== null && ATLAS_COUNTRIES.some((c) => c.name === v) ? v : null);

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/**
 * One wine: its name, then where and what ("Piedmont · Red · DOCG"), then
 * its grapes. A row opens the wine's Dex card; a wine with none (there is
 * none today) is a plain row, so nothing pretends to be a key.
 */
const WineRow = React.memo(function WineRow({
  wine,
  withCountry,
  onOpen,
}: {
  wine: AtlasWine;
  withCountry: boolean;
  onOpen: (id: string) => void;
}) {
  const grapes = wine.g.map((i) => ATLAS_GRAPES[i].name).join(', ');
  const where = withCountry ? `${wine.r}, ${ATLAS_COUNTRIES[wine.c].name}` : wine.r;
  const meta = [where, styleLabel(wine.s), wine.t].filter(Boolean).join(' · ');
  const card = cardOfAtlasWine(wine.n);
  const id = card && getDrink(card) ? card : null;
  const body = (
    <View style={styles.rowText}>
      <Text style={[textRole.rowTitle, styles.ink]}>{wine.n}</Text>
      <Text style={[textRole.rowSubtitle, styles.muted]}>{meta}</Text>
      {grapes ? (
        <Text style={[textRole.rowSubtitle, styles.muted]} numberOfLines={2}>
          {grapes}
        </Text>
      ) : null}
    </View>
  );
  if (!id) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={() => onOpen(id)}
      accessibilityRole="button"
      accessibilityLabel={`${wine.n}, ${meta}${grapes ? `. ${grapes}` : ''}`}
      accessibilityHint="Opens its card in the Dex"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
      <Icon name="chevronRight" size={18} color={colors.textMuted} />
    </Pressable>
  );
});

/** One grape: its name and colour, what else it is called, its note, and how far it reaches. Opens its wines. */
const GrapeRow = React.memo(function GrapeRow({
  grape,
  index,
  onPress,
}: {
  grape: AtlasGrape;
  index: number;
  onPress: (i: number) => void;
}) {
  const where = grape.countries.map((c) => ATLAS_COUNTRIES[c].name);
  const reach =
    `${formatCount(grape.wines.length)} ${grape.wines.length === 1 ? 'wine' : 'wines'}` +
    (where.length ? ` · ${where.slice(0, 4).join(', ')}${where.length > 4 ? ` and ${where.length - 4} more` : ''}` : '');
  return (
    <Pressable
      onPress={() => onPress(index)}
      accessibilityRole="button"
      accessibilityLabel={`${grape.name}, ${grape.color.toLowerCase()}, ${reach}`}
      accessibilityHint="Shows the wines made from it"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <Text style={[textRole.rowTitle, styles.ink]}>
          {grape.name}
          <Text style={[textRole.rowSubtitle, styles.muted]}>{`  ${grape.color}`}</Text>
        </Text>
        {grape.synonyms.length ? (
          <Text style={[textRole.rowSubtitle, styles.muted]} numberOfLines={2}>
            {`Also called ${grape.synonyms.join(', ')}`}
          </Text>
        ) : null}
        {grape.note ? <Text style={[textRole.rowSubtitle, styles.ink]}>{grape.note}</Text> : null}
        <Text style={[textRole.rowSubtitle, styles.muted, tabular]}>{reach}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textMuted} />
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function WineAtlasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; country?: string; grape?: string }>();
  const [scrolled, onScroll] = useScrolledPast();

  const [mode, setMode] = useState<Mode>('countries');
  const [term, setTerm] = useState(() => one(params.q) ?? '');
  const [family, setFamily] = useState<string | null>(null);
  const [color, setColor] = useState<GrapeColor | null>(null);
  const [grape, setGrape] = useState<number | null>(() => grapeParam(one(params.grape)));
  const [country, setCountry] = useState<string | null>(() => countryParam(one(params.country)));

  /* Back to the card that opened it; with nothing under it (a cold link), to the Dex. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  const openCard = useCallback(
    (id: string) => router.push({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  /* A grape row: that grape's wines, by country, with the filter named over the list. */
  const showGrapeWines = useCallback((i: number) => {
    setGrape(i);
    setMode('countries');
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (mode === 'grapes') {
      return queryGrapes(term, color).map((i) => ({ kind: 'grape' as const, key: `g${i}`, index: i, grape: ATLAS_GRAPES[i] }));
    }
    const hits = queryWines({ term, family, country, grape });
    if (mode === 'az') {
      const keep = new Set(hits);
      const out: Row[] = [];
      let letter = '';
      for (const i of ALPHABETICAL) {
        if (!keep.has(i)) continue;
        const L = fold(ATLAS_WINES[i].n).charAt(0).toUpperCase();
        if (L !== letter) {
          letter = L;
          out.push({ kind: 'letter', key: `L${L}`, letter: L });
        }
        out.push({ kind: 'wine', key: `w${i}`, wine: ATLAS_WINES[i], withCountry: true });
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
      for (const i of group.wines) out.push({ kind: 'wine', key: `w${i}`, wine: ATLAS_WINES[i], withCountry: false });
    }
    return out;
  }, [mode, term, family, color, country, grape]);

  const tally = useMemo(() => rows.filter((r) => r.kind === 'wine' || r.kind === 'grape').length, [rows]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.kind) {
        case 'country':
          return (
            <View accessible accessibilityRole="header" style={styles.countryHead}>
              <View style={styles.countryTop}>
                <Text style={[textRole.sectionTitle, styles.ink, styles.grow]}>{item.name}</Text>
                <Text style={[textRole.small, styles.muted, tabular]}>{formatCount(item.count)}</Text>
              </View>
              {item.note ? <Text style={[textRole.small, styles.muted]}>{item.note}</Text> : null}
            </View>
          );
        case 'letter':
          return (
            <Text accessibilityRole="header" style={[textRole.sectionTitle, styles.ink, styles.letter]}>
              {item.letter}
            </Text>
          );
        case 'wine':
          return <WineRow wine={item.wine} withCountry={item.withCountry} onOpen={openCard} />;
        case 'grape':
          return <GrapeRow grape={item.grape} index={item.index} onPress={showGrapeWines} />;
      }
    },
    [openCard, showGrapeWines],
  );

  const activeGrape = grape !== null ? ATLAS_GRAPES[grape] : null;
  const narrowing = mode !== 'grapes' && (activeGrape || country);

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Wine Atlas"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={leave} />}
      />

      {/*
        The controls, still over the list. This View's style never changes:
        it is the field's ancestor, and a style that changes how a View
        flattens over a TextInput remounts the input (the build 35 lesson).
      */}
      <View style={styles.controls}>
        <Text style={[textRole.small, styles.muted]}>
          {`Every wine with a name of its own: ${formatCount(ATLAS_COUNTS.wines)} appellations and styles in ${formatCount(ATLAS_COUNTS.countries)} countries, and the ${formatCount(GRAPES_IN_WINES)} grapes behind them.`}
        </Text>
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder="Wine, country, region or grape"
          accessibilityLabel="Search the Wine Atlas"
        />
        <SegmentedControl items={MODES} value={mode} onChange={setMode} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollsToTop={false}
        style={styles.chips}
        contentContainerStyle={styles.chipsRow}>
        {mode === 'grapes'
          ? GRAPE_COLORS.map((c) => (
              <Chip key={c} label={c} selected={color === c} onPress={() => setColor(color === c ? null : c)} />
            ))
          : STYLE_FAMILY_ORDER.map((f) => (
              <Chip key={f} label={f} selected={family === f} onPress={() => setFamily(family === f ? null : f)} />
            ))}
        {narrowing ? (
          <Chip
            label={activeGrape ? `Made from ${activeGrape.name}` : (country ?? '')}
            selected
            trailingIcon="close"
            accessibilityLabel={activeGrape ? `Made from ${activeGrape.name}. Clear it` : `${country}. Clear it`}
            onPress={() => {
              setGrape(null);
              setCountry(null);
            }}
          />
        ) : null}
      </ScrollView>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={9}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }]}
        ListHeaderComponent={
          <Text style={[textRole.small, styles.muted, tabular, styles.tally]}>
            {`${formatCount(tally)} ${mode === 'grapes' ? (tally === 1 ? 'grape' : 'grapes') : tally === 1 ? 'wine' : 'wines'}`}
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="Nothing matches that"
            body={
              mode === 'grapes'
                ? 'Other names find a grape too: try Shiraz, Tinta Roriz or Primitivo.'
                : 'Try a grape or a region, or clear the style.'
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  grow: { flex: 1 },
  pressed: { opacity: 0.6 },

  controls: { paddingHorizontal: layout.gutter, paddingTop: space.sm, gap: space.md },
  /* Its own height: a horizontal list in a column has none, and the chips were cut in half without it. */
  chips: { flexGrow: 0, flexShrink: 0, height: layout.chip + space.md * 2 },
  chipsRow: { paddingHorizontal: layout.gutter, gap: space.sm, alignItems: 'center' },

  list: { paddingHorizontal: layout.gutter },
  tally: { paddingBottom: space.xs },

  countryHead: { paddingTop: space.xl, paddingBottom: space.sm, gap: space.xs },
  countryTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  letter: { paddingTop: space.xl, paddingBottom: space.xs },

  row: {
    minHeight: layout.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: stroke.hair,
    borderBottomColor: colors.hair,
  },
  rowText: { flex: 1, gap: 2 },
});
