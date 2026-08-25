import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { EmptyState, haptic, PressableScale } from '@/components/ui';
import {
  colors,
  fonts,
  label as labelType,
  radius,
  space,
  tabular,
  type as typeScale,
} from '@/constants/theme';
import { BEER_COUNTRIES_BY_CODE } from '@/data/breweries';
import { DRINKS_BY_ID } from '@/data';
import type { BeerBrand, Brewery } from '@/types';

/**
 * One country's breweries, and what each of them pours.
 *
 * Every beer that resolved to a Dex style is tappable and opens that style's
 * card — which is where the serve guide, glassware and composition live. A
 * beer that matched nothing is still listed, just flat: better an honest
 * name with no link than a wrong link.
 *
 * Breweries whose catalogue has not been researched yet say so outright.
 * Inventing a plausible lineup would be the one genuinely unrecoverable
 * mistake here, because nobody downstream could tell it from real data.
 */
export default function BeerCountryScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const country = code ? BEER_COUNTRIES_BY_CODE[code] : undefined;

  const sections = useMemo(
    () =>
      (country?.breweries ?? []).map((b) => ({
        brewery: b,
        title: b.name,
        data: b.beers,
      })),
    [country]
  );

  const totals = useMemo(() => {
    const breweries = country?.breweries.length ?? 0;
    const beers = country?.breweries.reduce((n, b) => n + b.beers.length, 0) ?? 0;
    return { breweries, beers };
  }, [country]);

  if (!country) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.xxl }]}>
        <EmptyState icon="search" title="Unknown country" body="That country is not in the atlas." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <Icon name="chevronLeft" size={19} color={colors.text} />
        </PressableScale>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{country.region.toUpperCase()}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {country.country}
          </Text>
        </View>
        <Text style={[styles.headerCount, tabular]}>{totals.beers}</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + space.xxl,
        }}
        ListHeaderComponent={
          <Text style={styles.lede}>
            {totals.breweries} {totals.breweries === 1 ? 'brewery' : 'breweries'} ·{' '}
            {totals.beers} {totals.beers === 1 ? 'beer' : 'beers'} catalogued
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <BreweryHeader brewery={(section as unknown as { brewery: Brewery }).brewery} />
        )}
        renderItem={({ item }) => (
          <BeerRow
            beer={item}
            onPress={
              item.styleRef && DRINKS_BY_ID[item.styleRef]
                ? () => {
                    haptic.select();
                    router.push(`/drink/${item.styleRef}`);
                  }
                : undefined
            }
          />
        )}
      />
    </View>
  );
}

function BreweryHeader({ brewery }: { brewery: Brewery }) {
  const meta = [brewery.city, brewery.founded ? `est. ${brewery.founded}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.breweryHead}>
      <View style={styles.breweryTitleRow}>
        <Text style={styles.breweryName}>{brewery.name}</Text>
        {brewery.researched ? (
          <View style={styles.verified}>
            <Icon name="check" size={11} color={colors.wine} />
            <Text style={styles.verifiedText}>VERIFIED</Text>
          </View>
        ) : null}
      </View>
      {meta ? <Text style={styles.breweryMeta}>{meta}</Text> : null}
      {brewery.note ? <Text style={styles.breweryNote}>{brewery.note}</Text> : null}
      {brewery.needsLineup ? (
        <Text style={styles.pending}>Lineup not yet catalogued.</Text>
      ) : null}
    </View>
  );
}

function BeerRow({ beer, onPress }: { beer: BeerBrand; onPress?: () => void }) {
  const style = beer.styleRef ? DRINKS_BY_ID[beer.styleRef] : undefined;

  const body = (
    <>
      <View style={styles.beerBody}>
        <Text style={styles.beerName}>{beer.shortName}</Text>
        {beer.note ? (
          <Text style={styles.beerNote} numberOfLines={2}>
            {beer.note}
          </Text>
        ) : null}
      </View>
      {beer.abv ? <Text style={[styles.abv, tabular]}>{beer.abv}</Text> : null}
      {style ? (
        <View style={styles.styleChip}>
          <Text style={styles.styleChipText} numberOfLines={1}>
            {style.name}
          </Text>
          <Icon name="chevronRight" size={13} color={colors.taupeInk} />
        </View>
      ) : beer.style ? (
        <Text style={styles.styleFlat} numberOfLines={1}>
          {beer.style}
        </Text>
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.beerRow}>{body}</View>;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${beer.name}${style ? `, a ${style.name}` : ''}`}
      style={styles.beerRow}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
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
  eyebrow: { ...labelType.ui, fontFamily: fonts.label, color: colors.taupeInk },
  title: {
    fontFamily: fonts.display,
    ...typeScale.headline,
    color: colors.text,
    marginTop: 2,
  },
  headerCount: { fontFamily: fonts.numeral, ...typeScale.title, color: colors.wine },

  lede: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    color: colors.textMuted,
    marginBottom: space.md,
  },

  breweryHead: { paddingTop: space.lg, paddingBottom: space.xs },
  breweryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  breweryName: {
    fontFamily: fonts.display,
    ...typeScale.title,
    color: colors.text,
    flexShrink: 1,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.wineWash,
  },
  verifiedText: { ...labelType.ui, fontFamily: fonts.label, fontSize: 9, color: colors.wine },
  breweryMeta: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.micro,
    color: colors.taupeInk,
    marginTop: 2,
  },
  breweryNote: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  pending: {
    fontFamily: fonts.body,
    ...typeScale.micro,
    color: colors.textFaint,
    marginTop: space.xs,
    fontStyle: 'italic',
  },

  beerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  beerBody: { flex: 1 },
  beerName: { fontFamily: fonts.bodySemiBold, ...typeScale.body, color: colors.text },
  beerNote: {
    fontFamily: fonts.body,
    ...typeScale.micro,
    color: colors.textFaint,
    marginTop: 1,
  },
  abv: { fontFamily: fonts.numeral, ...typeScale.micro, color: colors.textMuted },
  styleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: 132,
    paddingLeft: space.sm,
  },
  styleChipText: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.micro,
    color: colors.taupeInk,
    flexShrink: 1,
  },
  styleFlat: {
    fontFamily: fonts.body,
    ...typeScale.micro,
    color: colors.textFaint,
    maxWidth: 120,
    textAlign: 'right',
  },
});
