import { useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  type SectionListData,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthTitleBar } from '@/components/auth/AuthTitleBar';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { haptic, SearchField, SectionHeader } from '@/components/ui';
import { colors, fonts, layout, space, stroke, tabular, textRole } from '@/constants/theme';
import { COUNTRIES, COUNTRY_BY_ISO, deviceRegion, SUGGESTED_ISOS } from '@/data/countries';
import type { Country } from '@/lib/phone';

/* ==================================================================== */
/* Country or region                                                    */
/*                                                                      */
/* A native page sheet over the sign-in screen: English names and       */
/* "+dial" as text. No flags: the brief rules them out, and flag emoji  */
/* are pictographs, which check-design blocks everywhere in the app.    */
/*                                                                      */
/* EVERY COUNTRY IS LISTED, including ones Sipply's SMS provider will   */
/* not text. A client-side allowlist would be decoration: anyone can    */
/* call the auth server directly, so SMS fraud is stopped where it can  */
/* be (Twilio Verify's geo permissions and Fraud Guard, Supabase's rate */
/* limit), and an unserved country fails the send with "use another way */
/* to sign in".                                                         */
/*                                                                      */
/* No getItemLayout, though the rows share one metric: rows use         */
/* minHeight and grow with Dynamic Type, so a fixed offset table would  */
/* place them wrongly at the larger sizes. ~250 rows window fine        */
/* without one.                                                         */
/* ==================================================================== */

type Section = { key: string; title: string | null };

/** Case- and accent-insensitive: "Curacao" finds Curaçao. */
function fold(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Folded once, on first search, not on every keystroke. */
let folded: { country: Country; name: string }[] | null = null;
function foldedCountries() {
  folded ??= COUNTRIES.map((country) => ({ country, name: fold(country.name) }));
  return folded;
}

/**
 * A query's matches: a name containing it ("rico", "puer"), an exact ISO
 * code ("pr"), or a dial code with or without its '+' ("44", "+44").
 *
 * Names that start with the query come first, and an exact code counts
 * as one of those: "pr" means Puerto Rico before it means the "pr" inside
 * Cyprus. Everything else follows in the list's own alphabetical order.
 * Names are English, so "España" finds nothing; that is correct.
 */
function search(query: string): Country[] {
  const q = fold(query);
  if (!q) return [];
  const dialQuery = q.startsWith('+') ? q.slice(1) : q;
  const byDial = /^\d+$/.test(dialQuery);
  const first: Country[] = [];
  const rest: Country[] = [];
  for (const { country, name } of foldedCountries()) {
    if (name.startsWith(q) || country.iso.toLowerCase() === q) first.push(country);
    else if (name.includes(q) || (byDial && country.dial.startsWith(dialQuery))) rest.push(country);
  }
  return [...first, ...rest];
}

/** The device's own region, then Puerto Rico, then the US, each once. */
function suggested(): Country[] {
  const isos = [deviceRegion(), ...SUGGESTED_ISOS].filter((iso): iso is string => !!iso);
  return [...new Set(isos)].map((iso) => COUNTRY_BY_ISO[iso]).filter((c): c is Country => !!c);
}

function sectionsFor(query: string): SectionListData<Country, Section>[] {
  if (query.trim()) {
    const matches = search(query);
    // No section at all when nothing matches, so the list's empty line shows.
    return matches.length ? [{ key: 'results', title: null, data: matches }] : [];
  }
  return [
    { key: 'suggested', title: 'Suggested', data: suggested() },
    { key: 'all', title: 'All countries and regions', data: COUNTRIES },
  ];
}

/** A hairline from the name's left edge, as iOS's own lists draw them. */
function RowSeparator() {
  return <View style={styles.separator} />;
}

function CountryRow({
  country,
  selected,
  onPress,
}: {
  country: Country;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${country.name}, plus ${country.dial}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={styles.name}>{country.name}</Text>
      <Text style={[styles.dial, tabular]}>+{country.dial}</Text>
      {/* The tick's slot is always there, so the dial column never moves. */}
      <View style={styles.tick}>
        {selected ? <Icon name="check" size={18} color={colors.wine} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * The searchable list. `onSelect` gets the ISO code; the sign-in screen
 * sets it, closes this, and puts the cursor in the phone field.
 * Swiping the sheet down (or Android's back) is `onClose`.
 */
export function CountryPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  /** The ISO code ticked in the list. */
  selected: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  // Every opening starts from the full list.
  const close = () => {
    setQuery('');
    onClose();
  };
  const choose = (iso: string) => {
    haptic.select();
    setQuery('');
    onSelect(iso);
  };

  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={close}>
      <View style={styles.sheet}>
        {/*
          A native sheet is presented above the React root, so it carries its
          own paper grain: first, under the rows, like every other ground. The
          title bar draws its own (ScreenTopBar), so grain laid over the whole
          sheet would double it there.
        */}
        <Grain />
        <AuthTitleBar
          title="Country or region"
          leading="close"
          leadingLabel="Close"
          onLeading={close}
          insetTop={false}
        />
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Name or code"
          accessibilityLabel="Search countries and regions"
          returnKeyType="search"
          style={styles.search}
        />
        <SectionList
          sections={sectionsFor(query)}
          keyExtractor={(country) => country.iso}
          renderItem={({ item }) => (
            <CountryRow
              country={item}
              selected={item.iso === selected}
              onPress={() => choose(item.iso)}
            />
          )}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <SectionHeader title={section.title} size="group" style={styles.sectionHeader} />
            ) : null
          }
          ItemSeparatorComponent={RowSeparator}
          ListEmptyComponent={
            <Text style={styles.empty}>No country or region matches “{query.trim()}”.</Text>
          }
          // A floating header over the rows would need a fill of its own; these scroll away.
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  search: { marginHorizontal: layout.gutter, marginVertical: space.md },
  sectionHeader: { paddingTop: space.lg, paddingBottom: space.sm },
  row: {
    minHeight: layout.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  /* A fill, not a scale: rows answer a press the way every control does. */
  rowPressed: { backgroundColor: colors.bgSunk },
  name: { ...textRole.rowTitle, flex: 1, color: colors.text },
  dial: { ...textRole.rowTitle, color: colors.textMuted },
  tick: { width: 18, alignItems: 'center' },
  separator: { height: stroke.hair, backgroundColor: colors.line, marginLeft: layout.gutter },
  empty: {
    fontFamily: fonts.body,
    fontSize: textRole.rowTitle.fontSize,
    lineHeight: textRole.rowTitle.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: space.xxl,
    paddingHorizontal: layout.gutter,
  },
});
