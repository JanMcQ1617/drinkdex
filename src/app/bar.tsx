import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { Button, Card, EmptyState, PressableScale, SectionLabel, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  COMMON_INGREDIENTS,
  INGREDIENTS_BY_ID,
  matchBar,
  searchIngredients,
  type Ingredient,
} from '@/lib/bar';
import { useBar } from '@/store/bar';

/* ==================================================================== */
/* My Bar                                                               */
/*                                                                      */
/* Two panes behind a segmented control, because owning things and       */
/* making things are separate errands. You stock the shelf once, in a    */
/* burst; you come back to Drinks repeatedly and want it uncluttered by  */
/* a 488-row picker.                                                     */
/*                                                                      */
/* The counts live in the segmented control itself so the payoff is      */
/* visible while you are still on the Shelf pane — ticking a bottle and  */
/* watching "Drinks 48" tick up is the whole loop, and hiding it behind  */
/* a tap would break it.                                                 */
/* ==================================================================== */

const STARTER = [
  'gin', 'vodka', 'white-rum', 'bourbon', 'sweet-vermouth', 'dry-vermouth',
  'lemon', 'lime', 'sugar-syrup', 'angostura-bitters', 'soda-water', 'orange',
  'triple-sec', 'mint',
];

function Chip({
  label,
  selected,
  onPress,
  detail,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  detail?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      noHaptic
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      style={[styles.chip, selected && styles.chipOn]}>
      {selected ? <Icon name="check" size={13} color={colors.bg} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {detail ? <Text style={styles.chipDetail}>{detail}</Text> : null}
    </PressableScale>
  );
}

export default function BarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const owned = useBar((s) => s.owned);
  const toggle = useBar((s) => s.toggle);
  const add = useBar((s) => s.add);
  const clear = useBar((s) => s.clear);

  const [pane, setPane] = useState<'shelf' | 'drinks'>('shelf');
  const [query, setQuery] = useState('');

  /*
   * `owned` is a Record so it survives JSON persistence; matching wants a Set.
   * Both this and the match below are memoised on the same identity, so a
   * keystroke in the search field re-runs neither.
   */
  const ownedSet = useMemo(() => new Set(Object.keys(owned)), [owned]);
  const result = useMemo(() => matchBar(ownedSet), [ownedSet]);

  const results = useMemo(() => searchIngredients(query), [query]);

  const sections = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: COMMON_INGREDIENTS.filter((i) => i.category === cat),
      })).filter((s) => s.items.length),
    [],
  );

  const onToggle = useCallback(
    (id: string) => {
      haptic.tap();
      toggle(id);
    },
    [toggle],
  );

  const shelf: Ingredient[] = useMemo(
    () =>
      Object.keys(owned)
        .map((id) => INGREDIENTS_BY_ID[id])
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [owned],
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <PressableScale
          onPress={() => router.back()}
          noHaptic
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </PressableScale>
        <Text style={styles.title}>My Bar</Text>
      </View>

      <View style={styles.segment}>
        <PressableScale
          onPress={() => setPane('shelf')}
          noHaptic
          accessibilityRole="button"
          accessibilityState={{ selected: pane === 'shelf' }}
          style={[styles.segmentItem, pane === 'shelf' && styles.segmentItemOn]}>
          <Text style={[styles.segmentText, pane === 'shelf' && styles.segmentTextOn]}>
            Shelf {shelf.length ? shelf.length : ''}
          </Text>
        </PressableScale>
        <PressableScale
          onPress={() => setPane('drinks')}
          noHaptic
          accessibilityRole="button"
          accessibilityState={{ selected: pane === 'drinks' }}
          style={[styles.segmentItem, pane === 'drinks' && styles.segmentItemOn]}>
          <Text style={[styles.segmentText, pane === 'drinks' && styles.segmentTextOn]}>
            Drinks {result.makeable.length ? result.makeable.length : ''}
          </Text>
        </PressableScale>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl * 2 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {pane === 'shelf' ? (
          <>
            <View style={styles.searchRow}>
              <Icon name="search" size={17} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search 488 ingredients"
                placeholderTextColor={colors.textFaint}
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.searchInput}
                accessibilityLabel="Search ingredients"
              />
              {query ? (
                <PressableScale
                  onPress={() => setQuery('')}
                  noHaptic
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search">
                  <Icon name="close" size={16} color={colors.textMuted} />
                </PressableScale>
              ) : null}
            </View>

            {query ? (
              results.length ? (
                <View style={styles.chipWrap}>
                  {results.map((i) => (
                    <Chip
                      key={i.id}
                      label={i.label}
                      selected={!!owned[i.id]}
                      onPress={() => onToggle(i.id)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.noHits}>Nothing called “{query.trim()}”.</Text>
              )
            ) : (
              <>
                {shelf.length ? (
                  <>
                    <View style={styles.shelfHead}>
                      <SectionLabel>On your shelf</SectionLabel>
                      <PressableScale
                        onPress={clear}
                        noHaptic
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Clear the shelf">
                        <Text style={styles.clear}>Clear</Text>
                      </PressableScale>
                    </View>
                    <View style={styles.chipWrap}>
                      {shelf.map((i) => (
                        <Chip key={i.id} label={i.label} selected onPress={() => onToggle(i.id)} />
                      ))}
                    </View>
                  </>
                ) : (
                  <Card style={styles.starter}>
                    <Text style={styles.starterTitle}>Start from a standard bar</Text>
                    <Text style={styles.starterBody}>
                      Gin, vodka, white rum, bourbon, both vermouths, citrus, syrup, bitters and a
                      few mixers. Fourteen things, and a good chunk of the classics.
                    </Text>
                    <Button
                      label="Add the basics"
                      variant="secondary"
                      onPress={() => {
                        haptic.tap();
                        add(STARTER);
                      }}
                      style={styles.starterButton}
                    />
                  </Card>
                )}

                {sections.map((s) => (
                  <View key={s.cat}>
                    <SectionLabel style={styles.sectionLabel}>
                      {CATEGORY_LABEL[s.cat]}
                    </SectionLabel>
                    <View style={styles.chipWrap}>
                      {s.items.map((i) => (
                        <Chip
                          key={i.id}
                          label={i.label}
                          selected={!!owned[i.id]}
                          onPress={() => onToggle(i.id)}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {shelf.length === 0 ? (
              <EmptyState
                icon="sparkle"
                title="Nothing on the shelf yet"
                body="Tick what you actually have and this fills with drinks you can pour tonight."
                action={{ label: 'Stock the shelf', onPress: () => setPane('shelf') }}
              />
            ) : (
              <>
                <View style={styles.tally}>
                  <View style={styles.tallyHalf}>
                    <Text style={styles.tallyNumber}>{result.makeable.length}</Text>
                    <Text style={styles.tallyLabel}>you can make</Text>
                  </View>
                  <View style={styles.tallyRule} />
                  <View style={styles.tallyHalf}>
                    <Text style={styles.tallyNumber}>{result.nearly.length}</Text>
                    <Text style={styles.tallyLabel}>one bottle away</Text>
                  </View>
                </View>

                {result.nextBest.length ? (
                  <>
                    <SectionLabel style={styles.sectionLabel}>Worth buying next</SectionLabel>
                    <Text style={styles.hint}>
                      Tap to put it on the shelf and watch the count move.
                    </Text>
                    <View style={styles.chipWrap}>
                      {result.nextBest.map(({ ingredient, unlocks }) => (
                        <Chip
                          key={ingredient.id}
                          label={ingredient.label}
                          detail={`+${unlocks}`}
                          onPress={() => onToggle(ingredient.id)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}

                {result.makeable.length ? (
                  <>
                    <SectionLabel style={styles.sectionLabel}>
                      Pour tonight
                    </SectionLabel>
                    <Card style={styles.list}>
                      {result.makeable.map((m, i) => (
                        <React.Fragment key={m.drink.id}>
                          {i > 0 ? <View style={styles.rowRule} /> : null}
                          <PressableScale
                            onPress={() =>
                              router.push({ pathname: '/drink/[id]', params: { id: m.drink.id } })
                            }
                            noHaptic
                            accessibilityRole="button"
                            accessibilityLabel={m.drink.name}
                            style={styles.row}>
                            <Text style={styles.rowName} numberOfLines={1}>
                              {m.drink.name}
                            </Text>
                            <Icon name="chevronRight" size={15} color={colors.textFaint} />
                          </PressableScale>
                        </React.Fragment>
                      ))}
                    </Card>
                  </>
                ) : (
                  <Text style={styles.hint}>
                    Nothing is fully in reach yet — the bottles above are the shortest way there.
                  </Text>
                )}

                {result.nearly.length ? (
                  <>
                    <SectionLabel style={styles.sectionLabel}>One thing short</SectionLabel>
                    <Card style={styles.list}>
                      {result.nearly.slice(0, 40).map((m, i) => (
                        <React.Fragment key={m.drink.id}>
                          {i > 0 ? <View style={styles.rowRule} /> : null}
                          <PressableScale
                            onPress={() =>
                              router.push({ pathname: '/drink/[id]', params: { id: m.drink.id } })
                            }
                            noHaptic
                            accessibilityRole="button"
                            accessibilityLabel={`${m.drink.name}, needs ${
                              INGREDIENTS_BY_ID[m.missing[0]]?.label ?? 'one more thing'
                            }`}
                            style={styles.row}>
                            <Text style={styles.rowName} numberOfLines={1}>
                              {m.drink.name}
                            </Text>
                            <Text style={styles.rowNeed} numberOfLines={1}>
                              {INGREDIENTS_BY_ID[m.missing[0]]?.label ?? '—'}
                            </Text>
                          </PressableScale>
                        </React.Fragment>
                      ))}
                    </Card>
                    {result.nearly.length > 40 ? (
                      <Text style={styles.hint}>
                        …and {result.nearly.length - 40} more.
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.xl },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  back: { padding: space.xs },
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
  },

  segment: {
    flexDirection: 'row',
    gap: space.xs,
    marginHorizontal: space.xl,
    marginBottom: space.lg,
    padding: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    borderRadius: radius.pill,
  },
  segmentItemOn: { backgroundColor: colors.wine },
  segmentText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  segmentTextOn: { color: colors.bg },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    minHeight: 46,
    marginBottom: space.lg,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
    paddingVertical: space.sm,
  },
  noHits: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    paddingVertical: space.lg,
  },

  shelfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
  },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.wine, borderColor: colors.wine },
  chipText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  chipTextOn: { color: colors.bg, fontFamily: fonts.bodySemiBold },
  chipDetail: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.micro.fontSize,
    color: colors.wine,
  },

  sectionLabel: { marginTop: space.xl },
  hint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },

  starter: { marginTop: space.sm },
  starterTitle: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.bodyLg.fontSize,
    color: colors.text,
  },
  starterBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  starterButton: { marginTop: space.lg },

  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
  },
  tallyHalf: { flex: 1, alignItems: 'center' },
  tallyRule: { width: 1, alignSelf: 'stretch', backgroundColor: colors.cardBorder },
  tallyNumber: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.wine,
  },
  tallyLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  list: { padding: 0, marginTop: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 48,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  rowNeed: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    maxWidth: '45%',
    textAlign: 'right',
  },
  rowRule: { height: 1, backgroundColor: colors.cardBorder, marginHorizontal: space.lg },
});
