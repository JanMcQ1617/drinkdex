import { useRouter } from 'expo-router';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import {
  Button,
  Card,
  EmptyState,
  PressableScale,
  SearchField,
  SectionLabel,
  SegmentedControl,
  haptic,
} from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  COMMON_INGREDIENTS,
  INGREDIENTS,
  INGREDIENTS_BY_ID,
  matchOwned,
  searchIngredients,
  type Ingredient,
} from '@/lib/bar';
import { useBar } from '@/store/bar';
import { confirmDestructive } from '@/utils/alerts';

/* ==================================================================== */
/* My Bar                                                               */
/*                                                                      */
/* Two panes behind a segmented control, because owning things and       */
/* making things are separate errands. You stock the shelf once, in a    */
/* burst; you come back to Drinks repeatedly and want it uncluttered by  */
/* a picker of every ingredient in the index.                            */
/*                                                                      */
/* The counts live in the segmented control itself so the payoff is      */
/* visible while you are still on the Shelf pane — ticking a bottle and  */
/* watching "Drinks 48" tick up is the whole loop, and hiding it behind  */
/* a tap would break it. The control is SegmentedControl from            */
/* components/ui, so it draws and moves like every other one in the app. */
/* ==================================================================== */

const STARTER = [
  'gin', 'vodka', 'white-rum', 'bourbon', 'sweet-vermouth', 'dry-vermouth',
  'lemon', 'lime', 'sugar-syrup', 'angostura-bitters', 'soda-water', 'orange',
  'triple-sec', 'mint',
];

/*
 * ONE SIGNAL, AND THE SAME WIDTH IN BOTH STATES. Selection is the wine
 * fill — white to wine is a large luminance step, not a hue alone, and
 * VoiceOver hears the selected state. It used to add a check and switch to
 * SemiBold as well, so a chip grew by some 17pt when tapped and every chip
 * after it in the wrapped grid shifted, often onto another line, under the
 * thumb that was about to tap the next one. One weight, no conditional
 * glyph, and the grid holds still.
 *
 * Memoised, with the id and a stable toggle passed rather than a fresh
 * closure per chip: one tap used to re-render all ~160 browse chips, each
 * an animated pressable. Now only the chip that changed does.
 *
 * The vertical slop brings the 36pt chip to the 44pt floor, as the Dex's
 * filter chips do. It is exactly the 8pt row gap, split, so neighbouring
 * rows' targets meet without overlapping.
 */
const Chip = memo(function Chip({
  id,
  label,
  selected,
  onToggle,
  detail,
  a11yDetail,
}: {
  id: string;
  label: string;
  selected?: boolean;
  onToggle: (id: string) => void;
  /** Shown after the label, e.g. "+12". */
  detail?: string;
  /** What `detail` means, spoken — "+12" alone never says twelve of what. */
  a11yDetail?: string;
}) {
  return (
    <PressableScale
      onPress={() => onToggle(id)}
      noHaptic
      hitSlop={{ top: space.xs, bottom: space.xs }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={detail ? `${label}, ${a11yDetail ?? detail}` : label}
      style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {detail ? <Text style={styles.chipDetail}>{detail}</Text> : null}
    </PressableScale>
  );
});

type Pane = 'shelf' | 'drinks';

/*
 * Both drink lists stop at forty rows until asked. "One thing short" used
 * to stop there for good — the rest was a sentence, "…and 152 more", with
 * nothing to tap, on the list lib/bar.ts calls the useful half of the
 * feature — while "Pour tonight" had no limit and mounted every row, six
 * hundred on a well-stocked shelf. One rule for both, and a way through.
 */
const LIST_PREVIEW = 40;

export default function BarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const owned = useBar((s) => s.owned);
  const toggle = useBar((s) => s.toggle);
  const add = useBar((s) => s.add);
  const clear = useBar((s) => s.clear);

  const [pane, setPane] = useState<Pane>('shelf');
  const [query, setQuery] = useState('');
  const [allMakeable, setAllMakeable] = useState(false);
  const [allNearly, setAllNearly] = useState(false);

  /*
   * matchOwned remembers its answer for the store's `owned` object, so a
   * keystroke in the search field re-runs nothing, and the Dex's count row
   * underneath reuses this result instead of walking the index again.
   */
  const result = matchOwned(owned);

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

  /*
   * A shelf is built a tap at a time, dozens of them, and this took it all
   * in one — a 13pt word right above the first row of chips, in wine, the
   * colour this palette keeps for affirmative actions. It confirms now, like
   * every other destructive action in the app, and wears danger.
   */
  const confirmClear = useCallback(
    (count: number) => {
      confirmDestructive(
        'Clear your shelf?',
        `${formatCount(count)} ${count === 1 ? 'item comes' : 'items come'} off the shelf. This cannot be undone.`,
        'Clear shelf',
        clear,
      );
    },
    [clear],
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
        <Text style={styles.title} accessibilityRole="header">My Bar</Text>
      </View>

      <SegmentedControl
        items={[
          { key: 'shelf', label: 'Shelf', count: shelf.length },
          { key: 'drinks', label: 'Drinks', count: result.makeable.length },
        ]}
        value={pane}
        onChange={setPane}
        style={styles.segments}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl * 2 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {pane === 'shelf' ? (
          <>
            {/* The app's one search field, as on the Dex and Log. */}
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${formatCount(INGREDIENTS.length)} ingredients`}
              accessibilityLabel="Search ingredients"
              style={styles.search}
            />

            {query ? (
              results.length ? (
                <View style={styles.chipWrap}>
                  {results.map((i) => (
                    <Chip
                      key={i.id}
                      id={i.id}
                      label={i.label}
                      selected={!!owned[i.id]}
                      onToggle={onToggle}
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
                        onPress={() => confirmClear(shelf.length)}
                        noHaptic
                        hitSlop={14}
                        accessibilityRole="button"
                        accessibilityLabel="Clear shelf"
                        accessibilityHint="Asks first, then removes everything on the shelf">
                        <Text style={styles.clear}>Clear shelf</Text>
                      </PressableScale>
                    </View>
                    <View style={styles.chipWrap}>
                      {shelf.map((i) => (
                        <Chip key={i.id} id={i.id} label={i.label} selected onToggle={onToggle} />
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
                      onPress={() => add(STARTER)}
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
                          id={i.id}
                          label={i.label}
                          selected={!!owned[i.id]}
                          onToggle={onToggle}
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
              /*
                The bottle, which is what this screen holds. The sparkle it
                once had is the legendary mark on every Dex card, and the
                coupe after it is the Dex's own tab.
              */
              <EmptyState
                icon="bottle"
                title="Nothing on the shelf yet"
                body="Tick what you actually have and this fills with drinks you can pour tonight."
                action={{ label: 'Stock the shelf', onPress: () => setPane('shelf') }}
              />
            ) : (
              <>
                <View style={styles.tally}>
                  <View style={styles.tallyHalf}>
                    <Text style={styles.tallyNumber}>{formatCount(result.makeable.length)}</Text>
                    <Text style={styles.tallyLabel}>you can make</Text>
                  </View>
                  <View style={styles.tallyRule} />
                  {/*
                    The same name as the list below. The missing thing is as
                    often lime, mint or egg white as a bottle.
                  */}
                  <View style={styles.tallyHalf}>
                    <Text style={styles.tallyNumber}>{formatCount(result.nearly.length)}</Text>
                    <Text style={styles.tallyLabel}>one thing short</Text>
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
                          id={ingredient.id}
                          label={ingredient.label}
                          detail={`+${unlocks}`}
                          a11yDetail={`makes ${unlocks} more ${unlocks === 1 ? 'drink' : 'drinks'}`}
                          onToggle={onToggle}
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
                      {(allMakeable
                        ? result.makeable
                        : result.makeable.slice(0, LIST_PREVIEW)
                      ).map((m, i) => (
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
                    {!allMakeable && result.makeable.length > LIST_PREVIEW ? (
                      <Button
                        label={`Show all ${formatCount(result.makeable.length)}`}
                        variant="secondary"
                        block
                        onPress={() => setAllMakeable(true)}
                        style={styles.showAll}
                      />
                    ) : null}
                  </>
                ) : (
                  /*
                    "Above" only when there is something above: a shelf of
                    rarities can leave nothing one short either, and then the
                    next step is the shelf itself.
                  */
                  <Text style={styles.hint}>
                    {result.nextBest.length
                      ? 'Nothing is fully in reach yet — the ingredients above are the shortest way there.'
                      : 'Nothing is in reach yet. Add a few more common ingredients to your shelf.'}
                  </Text>
                )}

                {result.nearly.length ? (
                  <>
                    <SectionLabel style={styles.sectionLabel}>One thing short</SectionLabel>
                    <Card style={styles.list}>
                      {(allNearly ? result.nearly : result.nearly.slice(0, LIST_PREVIEW)).map((m, i) => (
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
                    {!allNearly && result.nearly.length > LIST_PREVIEW ? (
                      <Button
                        label={`Show all ${formatCount(result.nearly.length)}`}
                        variant="secondary"
                        block
                        onPress={() => setAllNearly(true)}
                        style={styles.showAll}
                      />
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

  /* The control carries no margin of its own; see SegmentedControl. */
  segments: { marginHorizontal: space.xl, marginBottom: space.lg },

  search: { marginBottom: space.lg },
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
    color: colors.danger,
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
  chipTextOn: { color: colors.textOnWine },
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
  showAll: { marginTop: space.md },
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
