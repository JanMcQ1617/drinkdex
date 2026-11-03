import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icons';
import { BottomSheet } from '@/components/Sheet';
import { Button, Chip, haptic, SearchField } from '@/components/ui';
import { colors, layout, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';

import type { FacetKey } from './dexFacets';
import {
  clearFacet,
  dexFilterOn,
  FACET_WORDS,
  INTENT_FACETS,
  NO_DEX_FILTER,
  optionSays,
  seeAllOptions,
  sheetGroups,
  STRENGTH_NOTE,
  toggleDex,
  type DexChip,
  type DexCounts,
  type DexFilter,
  type SheetGroup,
  type SheetOption,
} from './dexFilter';
import { fold } from './dexRows';

/* ==================================================================== */
/* The Dex's filter sheet (v4.14, specs/v4.14/filters.md)               */
/*                                                                      */
/* Behind the sliders key in the field. Jan: "optimize it so people can */
/* choose better and facilitate their choosing process". The sheet asks */
/* in the order people decide, and never lets a choice lead nowhere:    */
/*                                                                      */
/*   FIRST CHOICES  Type (Cocktails, Spirits, Wines), Flavour (the      */
/*                  first run's seven), Strength (Light, Medium,        */
/*                  Strong, by ABV), and I can make it while My Bar is  */
/*                  on. A rule under them.                              */
/*   THE DETAILS    Spirit, Style, Grape, Country, Region, then In your */
/*                  Dex. A group is drawn only when the type that is on */
/*                  holds anything in it: no Grape among cocktails, no  */
/*                  Flavour among wines (a wine holds no taste chip).   */
/*                  Style, Grape and Region wait for a type, so the     */
/*                  first look is six short groups.                     */
/*                                                                      */
/* A long group (countries, grapes, regions, a type's styles) shows its */
/* six most held, fixed for the type, and anything on beyond them; "See */
/* all 151" turns the sheet to that group's page: every option A to Z,  */
/* a search field over them, a row each with its figure and a check.    */
/*                                                                      */
/* EVERY OPTION SAYS WHAT IT WOULD SHOW. Its figure is what the grid    */
/* would hold with it as its group's only choice and the rest as they   */
/* are (dexFacets' one-pass counts, over what a search behind the sheet */
/* finds). One that would show nothing is dimmed with its 0 and cannot  */
/* be tapped; one that is on can always be turned off. A choice applies */
/* at once, so the grid behind the scrim has already changed, and the   */
/* ink key at the foot ("Show 214 drinks") only closes; at 0 it is the  */
/* disabled "No drinks match", never hidden, so the sheet keeps its     */
/* shape. Type and In your Dex have no "All": a second tap on the one   */
/* that is on turns it off.                                             */
/*                                                                      */
/* Large text: the groups scroll inside the sheet and the foot key      */
/* stays. VoiceOver: each group is a list headed by its name; a chip or */
/* a row is a button that says its figure ("Light, under 15% alcohol,   */
/* 2,603 drinks"), selected while on and dimmed at 0; the foot key says */
/* the count.                                                           */
/*                                                                      */
/* THE SEARCH FIELD ON A GROUP'S PAGE. Its wrappers never change style  */
/* while it has focus (the build 35 keyboard, specs/v4.10/email-focus): */
/* the page is the window's height, shrunk by the sheet's 88% cap, so   */
/* the field stays put however many rows the search leaves.             */
/* ==================================================================== */

export function FilterSheet({
  visible,
  onClose,
  filter,
  counts,
  canMake,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  filter: DexFilter;
  /** The faceted counts for `filter`; null only while the sheet is shut. */
  counts: DexCounts | null;
  /** What My Bar makes; null while My Bar is off or empty (no I can make it). */
  canMake: ReadonlySet<string> | null;
  onChange: (f: DexFilter) => void;
}) {
  // The group whose See all page is open; null for the groups.
  const [page, setPage] = useState<FacetKey | null>(null);
  const total = counts?.total ?? 0;
  const close = () => {
    setPage(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close}>
      {page ? (
        <FacetPage facet={page} filter={filter} counts={counts} onChange={onChange} onBack={() => setPage(null)} />
      ) : (
        <Groups filter={filter} counts={counts} canMake={canMake} onChange={onChange} onSeeAll={setPage} />
      )}
      <View style={styles.foot}>
        <Button
          label={total > 0 ? `Show ${formatCount(total)} ${total === 1 ? 'drink' : 'drinks'}` : 'No drinks match'}
          onPress={close}
          disabled={total === 0}
          block
        />
      </View>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* The groups                                                          */
/* ------------------------------------------------------------------ */

function Groups({
  filter,
  counts,
  canMake,
  onChange,
  onSeeAll,
}: {
  filter: DexFilter;
  counts: DexCounts | null;
  canMake: ReadonlySet<string> | null;
  onChange: (f: DexFilter) => void;
  onSeeAll: (facet: FacetKey) => void;
}) {
  const groups = sheetGroups(filter, counts, canMake !== null);
  const toggle = (c: DexChip) => onChange(toggleDex(filter, c, counts));
  return (
    <>
      {/*
        The title's row: "Filter", and Clear while anything is on. The row
        keeps its height either way, so the chips do not move when the
        last one is turned off under the finger.
      */}
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
          Filter
        </Text>
        {dexFilterOn(filter, canMake) ? (
          <TextKey label="Clear" says="Clear filters" onPress={() => onChange(NO_DEX_FILTER)} />
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.groups}
        showsVerticalScrollIndicator={false}
        // A status-bar tap scrolls the Dex home, not this sheet.
        scrollsToTop={false}
        bounces={false}>
        {groups.map((g, i) => (
          <React.Fragment key={g.facet}>
            {/* The rule between the first choices and the details. */}
            {i > 0 && INTENT_FACETS.has(groups[i - 1]!.facet) && !INTENT_FACETS.has(g.facet) ? (
              <View style={styles.rule} />
            ) : null}
            <Group group={g} onToggle={toggle} onSeeAll={() => onSeeAll(g.facet)} />
          </React.Fragment>
        ))}
      </ScrollView>
    </>
  );
}

function Group({ group, onToggle, onSeeAll }: { group: SheetGroup; onToggle: (c: DexChip) => void; onSeeAll: () => void }) {
  const words = FACET_WORDS[group.facet];
  return (
    <View accessibilityRole="list" style={styles.group}>
      <View style={styles.groupHead}>
        <Text accessibilityRole="header" style={[textRole.groupTitle, styles.muted, styles.groupName]}>
          {words.label}
        </Text>
        {group.all > 0 ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={{ top: space.md, bottom: space.md, left: space.sm, right: space.sm }}
            accessibilityRole="button"
            accessibilityLabel={`See all ${formatCount(group.all)} ${words.noun}`}
            style={({ pressed }) => [styles.see, pressed && styles.pressed]}>
            <Text style={[styles.seeLabel, styles.ink]}>{`See all ${formatCount(group.all)}`}</Text>
            <Icon name="chevronRight" size={16} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      {group.facet === 'strength' ? <Text style={[textRole.helper, styles.muted]}>{STRENGTH_NOTE}</Text> : null}
      <View style={styles.chips}>
        {group.options.map((o) => (
          <Chip
            key={o.chip.key}
            label={o.label}
            count={o.count ?? undefined}
            selected={o.on}
            disabled={o.dim}
            accessibilityLabel={optionSays(o.chip, o.count)}
            onPress={() => onToggle(o.chip)}
          />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* A group's See all page                                              */
/* ------------------------------------------------------------------ */

function FacetPage({
  facet,
  filter,
  counts,
  onChange,
  onBack,
}: {
  facet: FacetKey;
  filter: DexFilter;
  counts: DexCounts | null;
  onChange: (f: DexFilter) => void;
  onBack: () => void;
}) {
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const words = FACET_WORDS[facet];
  const all = seeAllOptions(filter, counts, facet);
  const q = fold(query.trim());
  // A region is found by its country too: "italy" lists Piedmont, Tuscany, Veneto…
  const rows = q.length > 0 ? all.filter((o) => fold(o.label).includes(q) || fold(o.detail ?? '').includes(q)) : all;
  const toggle = (c: DexChip) => onChange(toggleDex(filter, c, counts));

  return (
    <View style={[styles.page, { height }]}>
      <View style={styles.titleRow}>
        <View style={styles.backRow}>
          <Pressable
            onPress={onBack}
            hitSlop={space.sm}
            accessibilityRole="button"
            accessibilityLabel="Back to filters"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Icon name="chevronLeft" size={22} color={colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
            {words.label}
          </Text>
        </View>
        {all.some((o) => o.on) ? (
          <TextKey label="Clear" says={`Clear ${words.noun}`} onPress={() => onChange(clearFacet(filter, facet))} />
        ) : null}
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${words.noun}`}
        accessibilityLabel={`Search ${words.noun}`}
      />

      <FlatList
        data={rows}
        keyExtractor={(o) => o.chip.key}
        renderItem={({ item }) => <OptionRow option={item} onToggle={toggle} />}
        style={styles.list}
        contentContainerStyle={styles.listBody}
        accessibilityRole="list"
        ListEmptyComponent={
          <Text style={[textRole.small, styles.muted, styles.none]}>{`No ${words.noun} match “${query.trim()}”.`}</Text>
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // The keyboard covers the sheet's foot: the rows under it scroll up clear of it.
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        scrollsToTop={false}
        initialNumToRender={12}
        windowSize={5}
      />
    </View>
  );
}

/**
 * A See all row: the option, a region's country under it, its figure and
 * a check while on. 52 tall; dimmed at 0 and inert unless on, as a chip.
 */
const OptionRow = React.memo(function OptionRow({
  option,
  onToggle,
}: {
  option: SheetOption & { detail?: string };
  onToggle: (c: DexChip) => void;
}) {
  return (
    <Pressable
      onPress={
        option.dim
          ? undefined
          : () => {
              haptic.select();
              onToggle(option.chip);
            }
      }
      disabled={option.dim}
      accessibilityRole="button"
      accessibilityLabel={optionSays(option.chip, option.count)}
      accessibilityState={{ selected: option.on, disabled: option.dim }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, option.dim && styles.dim]}>
      <View style={styles.rowText}>
        <Text style={[textRole.body, styles.ink]}>{option.label}</Text>
        {option.detail ? <Text style={[textRole.small, styles.muted]}>{option.detail}</Text> : null}
      </View>
      {option.count !== null ? (
        <Text style={[textRole.small, styles.muted, tabular]}>{formatCount(option.count)}</Text>
      ) : null}
      <View style={styles.check}>{option.on ? <Icon name="check" size={20} color={colors.text} /> : null}</View>
    </Pressable>
  );
});

/** Clear, on a title's row: ink, underlined, 44 tall with its slop. */
function TextKey({ label, says, onPress }: { label: string; says: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: space.sm, right: space.sm }}
      accessibilityRole="button"
      accessibilityLabel={says}
      style={({ pressed }) => pressed && styles.pressed}>
      <Text style={[textRole.bodyMedium, styles.ink, styles.underline]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.5 },
  underline: { textDecorationLine: 'underline', textDecorationColor: colors.text },

  /* The title and Clear on one row, 44 tall whether or not Clear is drawn. */
  titleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
  },
  title: { flexShrink: 1 },

  /* The groups scroll inside the sheet at large text sizes; the foot key stays. */
  scroll: { flexGrow: 0, flexShrink: 1 },
  groups: { paddingBottom: space.xs },
  /* 24 between groups, the head 8 over its chips. */
  group: { marginTop: space.xl, gap: space.sm },
  /* The head: the group's name, and See all on its right. It wraps under the name at the largest sizes. */
  groupHead: {
    minHeight: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.lg,
  },
  groupName: { flexShrink: 1 },
  see: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeLabel: {
    fontFamily: textRole.bodyMedium.fontFamily,
    fontSize: textRole.small.fontSize,
    lineHeight: textRole.small.lineHeight,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  /* The rule between the first choices and the details: a sheet head's 1pt line, 24 under the last chip. */
  rule: { height: stroke.edge, backgroundColor: colors.line, marginTop: space.xl },

  /*
   * A See all page: the window's height, shrunk to the sheet's cap, so it
   * is one height however many rows the search leaves.
   */
  page: { flexShrink: 1, gap: space.md },
  backRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  /* The back chevron in a 44 box whose left edge is the gutter's, the glyph optically on it. */
  back: { width: layout.hit, height: layout.hit, marginLeft: -11, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, marginHorizontal: -layout.gutter },
  listBody: { paddingBottom: space.sm },
  row: {
    minHeight: layout.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.press },
  rowText: { flex: 1 },
  /* The check's column, held when there is no check, so the figures stand in one column. */
  check: { width: 20, alignItems: 'center' },
  dim: { opacity: 0.42 },
  none: { paddingHorizontal: layout.gutter, paddingTop: space.md },

  foot: { marginTop: space.xl },
});
