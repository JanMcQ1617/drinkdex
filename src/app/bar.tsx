import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ListGroup,
  ListRow,
  SearchField,
  SectionHeader,
  SegmentedControl,
} from '@/components/ui';
import {
  colors,
  fonts,
  layout,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
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
 * One ingredient on the shelf: the app's Chip, so a toggle here looks and
 * answers like every other toggle in the app.
 *
 * Selected is wine on its wash with a wine edge AND a leading check, so
 * the state does not rest on colour alone, and VoiceOver hears it. The
 * check and the SemiBold label make a selected chip wider, so ticking one
 * can move the chips after it in the wrapped grid. That is the cost of a
 * state that reads without colour; the old wine fill kept one width, but
 * told a colour-blind eye nothing a white chip did not.
 *
 * Memoised, with the id and a stable toggle passed rather than a fresh
 * closure per chip: one tap used to re-render all ~160 browse chips. The
 * closure Chip needs is made in here, so it is new only when this chip's
 * own props are, and only the chip that changed re-renders.
 *
 * `unlocks` is for "Worth buying next": a + for "put it on the shelf", and
 * the number of drinks it would add. The count alone never says what it
 * counts, so the spoken label does.
 */
const ShelfChip = memo(function ShelfChip({
  id,
  label,
  selected,
  onToggle,
  unlocks,
}: {
  id: string;
  label: string;
  selected: boolean;
  onToggle: (id: string) => void;
  unlocks?: number;
}) {
  return (
    <Chip
      label={label}
      selected={selected}
      onPress={() => onToggle(id)}
      icon={unlocks != null ? 'plus' : undefined}
      count={unlocks}
      accessibilityLabel={
        unlocks != null
          ? `${label}, makes ${unlocks} more ${unlocks === 1 ? 'drink' : 'drinks'}`
          : undefined
      }
    />
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
  const [scrolled, onScroll] = useScrolledPast();

  /* Back to the Dex, which opens it; with nothing under it, to the Dex anyway. */
  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

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

  /*
   * The store's own action, which is stable, so the memoised chips hold.
   * No haptic here: Chip answers a change of selection itself.
   */
  const onToggle = toggle;

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
      <ScreenTopBar
        title="My Bar"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />}
      />

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
        onScroll={onScroll}
        scrollEventThrottle={16}
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
                    <ShelfChip
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
                    {/*
                      Clear is a red text button, not the heading's own wine
                      action: it takes the whole shelf, built a tap at a time,
                      so it asks first and wears danger, like every other
                      destructive action in the app.
                    */}
                    <View style={styles.shelfHead}>
                      <SectionHeader title="On your shelf" style={styles.shelfTitle} />
                      <Button
                        label="Clear shelf"
                        variant="dangerText"
                        size="sm"
                        onPress={() => confirmClear(shelf.length)}
                        accessibilityHint="Asks first, then removes everything on the shelf"
                      />
                    </View>
                    <View style={styles.chipWrap}>
                      {shelf.map((i) => (
                        <ShelfChip key={i.id} id={i.id} label={i.label} selected onToggle={onToggle} />
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
                    <SectionHeader title={CATEGORY_LABEL[s.cat]} style={styles.sectionHeader} />
                    <View style={styles.chipWrap}>
                      {s.items.map((i) => (
                        <ShelfChip
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
                {/*
                  The two figures the shelf earns, side by side in one panel.
                  Inter and ink, not the display face and wine: they are
                  readings, and the wine on this screen is kept for what
                  you tap.
                */}
                <Card style={styles.tally}>
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
                </Card>

                {result.nextBest.length ? (
                  <>
                    <SectionHeader title="Worth buying next" style={styles.sectionHeader} />
                    <Text style={styles.hint}>
                      The number is how many more drinks each one makes. Tap to put it on the
                      shelf.
                    </Text>
                    <View style={styles.chipWrap}>
                      {result.nextBest.map(({ ingredient, unlocks }) => (
                        <ShelfChip
                          key={ingredient.id}
                          id={ingredient.id}
                          label={ingredient.label}
                          selected={false}
                          unlocks={unlocks}
                          onToggle={onToggle}
                        />
                      ))}
                    </View>
                  </>
                ) : null}

                {result.makeable.length ? (
                  <>
                    <SectionHeader title="Pour tonight" style={styles.sectionHeader} />
                    <ListGroup style={styles.list}>
                      {(allMakeable
                        ? result.makeable
                        : result.makeable.slice(0, LIST_PREVIEW)
                      ).map((m) => (
                        <ListRow
                          key={m.drink.id}
                          title={m.drink.name}
                          emphasis
                          trailing="chevron"
                          onPress={() =>
                            router.navigate({ pathname: '/drink/[id]', params: { id: m.drink.id } })
                          }
                        />
                      ))}
                    </ListGroup>
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
                  <Text style={[styles.hint, styles.hintAlone]}>
                    {result.nextBest.length
                      ? 'Nothing is fully in reach yet — the ingredients above are the shortest way there.'
                      : 'Nothing is in reach yet. Add a few more common ingredients to your shelf.'}
                  </Text>
                )}

                {result.nearly.length ? (
                  <>
                    <SectionHeader title="One thing short" style={styles.sectionHeader} />
                    <ListGroup style={styles.list}>
                      {(allNearly ? result.nearly : result.nearly.slice(0, LIST_PREVIEW)).map((m) => {
                        const need = INGREDIENTS_BY_ID[m.missing[0]]?.label;
                        return (
                          <ListRow
                            key={m.drink.id}
                            title={m.drink.name}
                            emphasis
                            /*
                              What is missing, at the row's end and held to
                              one line, so a long ingredient never squeezes
                              the drink's name.
                            */
                            trailing={{
                              node: (
                                <Text style={styles.rowNeed} numberOfLines={1}>
                                  {need ?? '—'}
                                </Text>
                              ),
                            }}
                            onPress={() =>
                              router.navigate({ pathname: '/drink/[id]', params: { id: m.drink.id } })
                            }
                            accessibilityLabel={`${m.drink.name}, needs ${need ?? 'one more thing'}`}
                          />
                        );
                      })}
                    </ListGroup>
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
  content: { paddingHorizontal: layout.gutter },

  /* The control carries no margin of its own; see SegmentedControl. */
  segments: { marginHorizontal: layout.gutter, marginTop: space.xs, marginBottom: space.lg },

  search: { marginBottom: space.lg },
  noHits: {
    ...textRole.helper,
    color: colors.textMuted,
    paddingVertical: space.lg,
  },

  shelfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shelfTitle: { flexShrink: 1 },

  /*
   * 12 between rows, not 8: a Chip is 32pt with 6pt of slop above and
   * below, so rows 44pt apart put each chip's touch target edge to edge
   * with the next row's. At 8 the two overlapped by 4pt, and a tap there
   * went to whichever chip was drawn later.
   */
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.sm,
    rowGap: space.md,
    marginTop: space.md,
  },

  sectionHeader: { marginTop: space.xl },
  hint: {
    ...textRole.helper,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  hintAlone: { marginTop: space.lg },

  starter: { marginTop: space.sm, padding: space.lg },
  starterTitle: { ...textRole.sectionTitle, color: colors.text },
  starterBody: {
    ...textRole.helper,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  starterButton: { marginTop: space.lg },

  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.lg,
  },
  tallyHalf: { flex: 1, alignItems: 'center' },
  tallyRule: { width: stroke.edge, alignSelf: 'stretch', backgroundColor: colors.line },
  tallyNumber: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
    ...tabular,
  },
  tallyLabel: { ...textRole.helper, color: colors.textMuted },

  list: { marginTop: space.md },
  showAll: { marginTop: space.md },
  rowNeed: {
    ...textRole.rowSubtitle,
    color: colors.textMuted,
    maxWidth: '45%',
    textAlign: 'right',
  },
});
