import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { EmptyState, haptic, PressableScale, SectionLabel } from '@/components/ui';
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
  BEER_BRAND_COUNT,
  BEER_COUNTRIES,
  BEER_REGIONS,
  BREWERY_COUNT,
  fold,
} from '@/data/breweries';
import type { BeerCountry } from '@/types';

/* ------------------------------------------------------------------ */
/* Beers of the world — reference, not collection                      */
/*                                                                     */
/* The Dex catalogues beer STYLES: "American IPA", "Gose", 100 of them  */
/* with serve guides and compositions written out. Nobody orders a      */
/* style, though — they order Ocean IPA. This is the other axis: real   */
/* products, by the brewery that makes them, by the country it stands   */
/* in. It answers "what do they drink in Peru?", which is the question  */
/* you ask in front of a fridge abroad.                                 */
/*                                                                     */
/* Nothing here is collectible and nothing carries a dex number. Each   */
/* beer links through to its style, and THAT is the collectible card.   */
/* The Dex stays 460 authored entries.                                  */
/*                                                                     */
/* Route note: this is `/beers`, not `/atlas`, because a peer session   */
/* owns the wine atlas at `/wine-atlas`. Two sibling reference screens, */
/* two namespaces, no collision.                                        */
/* ------------------------------------------------------------------ */

const REGION_ALL = 'All';

export default function BeersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /* A style card can hand us its Dex id ("american-ipa") to land
   * pre-filtered. Matching on `styleRef` rather than on the search text is
   * the point: the atlas writes styles loosely ("pils", "hazy IPA"), so a
   * text search for "german pilsner" would miss most of what qualifies. */
  const { style: styleFilter } = useLocalSearchParams<{ style?: string }>();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string>(REGION_ALL);

  const q = fold(query.trim());

  const countries = useMemo(() => {
    let list = BEER_COUNTRIES;

    if (styleFilter) {
      list = list
        .map((c) => {
          const breweries = c.breweries
            .map((b) => ({ ...b, beers: b.beers.filter((x) => x.styleRef === styleFilter) }))
            .filter((b) => b.beers.length > 0);
          return breweries.length ? { ...c, breweries } : null;
        })
        .filter((c): c is (typeof BEER_COUNTRIES)[number] => c !== null);
    }

    if (region !== REGION_ALL) list = list.filter((c) => c.region === region);
    if (!q) return list;

    /* A country matches on its own name, or on anything inside it —
     * searching "stout" should surface the countries that pour one. */
    return list.filter((c) => {
      if (fold(c.country).includes(q) || fold(c.code).includes(q)) return true;
      return c.breweries.some(
        (b) =>
          fold(b.name).includes(q) ||
          b.beers.some((x) => fold(x.name).includes(q) || fold(x.style ?? '').includes(q))
      );
    });
  }, [q, region, styleFilter]);

  const shown = useMemo(
    () => ({
      breweries: countries.reduce((n, c) => n + c.breweries.length, 0),
      beers: countries.reduce((n, c) => n + c.breweries.reduce((m, b) => m + b.beers.length, 0), 0),
    }),
    [countries]
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={countries}
        keyExtractor={(c) => `${c.code}-${c.country}`}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.lg,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top + space.md }}>
            <Text style={styles.eyebrow}>BREWING NATIONS</Text>
            <Text style={styles.title}>Beers of the World</Text>
            <Text style={styles.lede}>
              The beers that belong to a place — national lagers, regional institutions and the
              breweries that now speak for their countries abroad.
            </Text>

            <View style={styles.tallies}>
              <Tally n={BEER_COUNTRIES.length} caption="COUNTRIES" />
              <Tally n={BREWERY_COUNT} caption="BREWERIES" />
              <Tally n={BEER_BRAND_COUNT} caption="BEERS" />
            </View>

            <View style={styles.searchRow}>
              <Icon name="search" size={17} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search a beer, brewery or country"
                placeholderTextColor={colors.textFaint}
                style={styles.search}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.regionRow}>
              {[REGION_ALL, ...BEER_REGIONS].map((r) => {
                const on = r === region;
                return (
                  <PressableScale
                    key={r}
                    onPress={() => {
                      haptic.select();
                      setRegion(r);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {r.toUpperCase()}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>

            {styleFilter ? (
              <PressableScale
                onPress={() => {
                  haptic.select();
                  router.setParams({ style: undefined });
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear the style filter"
                style={[styles.chip, styles.chipOn, styles.styleFilter]}>
                <Text style={[styles.chipText, styles.chipTextOn]}>
                  {`ONLY ${styleFilter.replace(/-/g, ' ').toUpperCase()}`}
                </Text>
                <Icon name="close" size={12} color={colors.wine} />
              </PressableScale>
            ) : null}

            <SectionLabel>{`${shown.beers} BEERS · ${shown.breweries} BREWERIES`}</SectionLabel>
          </View>
        }
        renderItem={({ item }) => (
          <CountryRow
            country={item}
            onPress={() => {
              haptic.select();
              router.push({ pathname: '/beer-country/[code]', params: { code: item.code } });
            }}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="Nothing here"
            body={`No country, brewery or beer matches “${query.trim()}”.`}
          />
        }
      />
    </View>
  );
}

function Tally({ n, caption }: { n: number; caption: string }) {
  return (
    <View style={styles.tally}>
      <Text style={[styles.tallyN, tabular]}>{n.toLocaleString()}</Text>
      <Text style={styles.tallyCaption}>{caption}</Text>
    </View>
  );
}

function CountryRow({ country, onPress }: { country: BeerCountry; onPress: () => void }) {
  const beers = country.breweries.reduce((n, b) => n + b.beers.length, 0);

  /* Name the biggest houses rather than just counting rows — it tells you
   * something about the country before you tap into it. */
  const preview =
    country.breweries
      .filter((b) => b.beers.length > 0)
      .slice(0, 3)
      .map((b) => b.name)
      .join(' · ') || `${country.breweries.length} breweries`;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${country.country}, ${beers} beers`}
      style={styles.row}>
      <View style={styles.code}>
        <Text style={styles.codeText}>{country.code}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {country.country}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <Text style={[styles.rowCount, tabular]}>{beers}</Text>
      <Icon name="chevronRight" size={16} color={colors.textFaint} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  eyebrow: { ...labelType.ui, fontFamily: fonts.label, color: colors.taupeInk },
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
    marginTop: space.xs,
    marginBottom: space.lg,
  },

  tallies: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.md,
  },
  tally: {
    flex: 1,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.cardBorder,
  },
  tallyN: { fontFamily: fonts.numeral, ...typeScale.title, color: colors.wine },
  tallyCaption: {
    ...labelType.ui,
    fontFamily: fonts.label,
    color: colors.textFaint,
    marginTop: 2,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  search: {
    flex: 1,
    fontFamily: fonts.body,
    ...typeScale.body,
    color: colors.text,
    paddingVertical: space.sm,
  },

  regionRow: { gap: 6, paddingVertical: space.xs, paddingRight: space.lg },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipOn: { backgroundColor: colors.wineWash, borderColor: colors.wine },
  styleFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: space.xs,
  },
  chipText: { ...labelType.ui, fontFamily: fonts.label, color: colors.textMuted },
  chipTextOn: { color: colors.wine },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  code: {
    minWidth: 36,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
  },
  codeText: { ...labelType.ui, fontFamily: fonts.label, color: colors.taupeInk },
  rowBody: { flex: 1 },
  rowTitle: { fontFamily: fonts.bodySemiBold, ...typeScale.body, color: colors.text },
  rowSub: {
    fontFamily: fonts.body,
    ...typeScale.micro,
    color: colors.textFaint,
    marginTop: 1,
  },
  rowCount: { fontFamily: fonts.numeral, ...typeScale.caption, color: colors.wine },
});
