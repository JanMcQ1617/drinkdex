import { Redirect, useNavigation, useRoute, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddResults } from '@/components/bar/AddResults';
import { BasicsSheet } from '@/components/bar/BasicsSheet';
import { type IngredientInfo, IngredientSheet } from '@/components/bar/IngredientSheet';
import { MakeSheet } from '@/components/bar/MakeSheet';
import { things } from '@/components/bar/model';
import { NextBottleSheet } from '@/components/bar/NextBottleSheet';
import { NextLine, PayoffKey } from '@/components/bar/Payoff';
import { PickerSheet } from '@/components/bar/PickerSheet';
import { Shelves, type Struck } from '@/components/bar/Shelves';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { ScreenTopBar, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { announce, Button, haptic, SearchField } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  type BarResult,
  bestBottle,
  type Ingredient,
  INGREDIENTS_BY_ID,
  inventory,
  makeList,
  matchOwned,
  type Shelf,
  usedIn,
} from '@/lib/bar';
import { MY_BAR_ENABLED } from '@/lib/myBar';
import { useBar } from '@/store/bar';

/* ==================================================================== */
/* My Bar: what you have, and what it makes                             */
/*                                                                      */
/* v4 shelves (specs/v4-changes.md 6; specs/v4-mockups/mybar/shelves).  */
/* Jan: "make my bar section way more organized … more easy to use",    */
/* and of the options, the one "that makes the user go through less     */
/* steps to add things to his shelf". Top to bottom:                    */
/*                                                                      */
/*   HEAD     does not scroll: the payoff key, "You can make 31" with   */
/*            this visit's last change ("+10", "−5"), which opens the   */
/*            Make list; under it the add field. Type, tap +, done.     */
/*   NEXT     one line naming the bottle that would pour the most, and  */
/*            an Add that puts it in at once.                           */
/*   SHELVES  seven, always in one order, A to Z inside each, every one */
/*            with its own "+ Add" (that shelf's picker). "Clear my     */
/*            bar" at the foot.                                         */
/*                                                                      */
/* NOTHING MOVES UNDER A FINGER. Nothing here is ranked by what you     */
/* own: shelves are A to Z, pickers keep a fixed order from the data,   */
/* the add field's rows come from the words alone. A bottle taken out   */
/* stays on its shelf, struck, with its Undo in place, and the next     */
/* line holds what it just added, until another tab takes the front;    */
/* the one ranked list, Next bottle, freezes while its sheet is up. No  */
/* toast, no layout animation and no timed animation: the motion is the */
/* native kind that rests fully drawn (a press's fill, UIKit's sheets,  */
/* the Modal's own fade).                                               */
/* ==================================================================== */

/** The head's air: 8 under the top bar, 12 between the key and the field, 12 under it. */
const HEAD_GAP = space.md;

/*
 * Hidden while EXPO_PUBLIC_MY_BAR is off (lib/myBar.ts). (tabs)/_layout.tsx
 * keeps the tab out of the navigator, so nothing should render this; the
 * Redirect is the backstop for a stale link, kept outside BarScreen so the
 * screen's hooks still run in the same order every time.
 */
export default function BarTab() {
  if (!MY_BAR_ENABLED) return <Redirect href="/" />;
  return <BarScreen />;
}

function BarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scrolled, onScrolledPast] = useScrolledPast();
  /*
   * The tab's scroll for ScrollChrome, with the rule signal riding along
   * as its listener. Tapping My Bar again while here returns to the top.
   */
  const { onScroll } = useTabScroll('bar', onScrolledPast);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const fieldRef = useRef<TextInput>(null);

  const owned = useBar((s) => s.owned);
  const hydrated = useBar((s) => s.hydrated);

  /*
   * matchOwned remembers its answer for the store's `owned` object, so a
   * re-render (a keystroke in the add field), or coming back to this tab,
   * re-runs nothing.
   */
  const result = matchOwned(owned);
  const total = result.makeable.length;
  const ownedCount = Object.keys(owned).filter((id) => INGREDIENTS_BY_ID[id]).length;
  const empty = ownedCount === 0;

  /* ---- This visit: what goes when another tab takes the front ---- */

  /** Bottles taken out on this visit, still drawn where they stood. */
  const [struck, setStruck] = useState<Record<string, Struck>>({});
  /** What Clear my bar took out, for its one Undo. */
  const [cleared, setCleared] = useState<string[] | null>(null);
  /** The payoff key's last change ("+10", "−5"). */
  const [change, setChange] = useState<number | null>(null);
  /** The bottle the next line's Add put in, held there with its Undo. */
  const [held, setHeld] = useState<string | null>(null);
  /*
   * The page's shape holds for the visit. Once the bar has held something,
   * it keeps the stocked layout (the payoff key, the next line's slot)
   * even if it empties: Clear my bar, or the last bottle out, then a tap
   * on a struck tile to put one back, would otherwise swap the empty
   * intro for the payoff key and the next line under that finger. And
   * once the next line has shown, its slot stays when nothing is one
   * bottle away, so the shelves never lift under a tap. Both let go when
   * another tab takes the front; adjusted during render.
   */
  const [stocked, setStocked] = useState(!empty);
  if (!empty && !stocked) setStocked(true);
  const [lineSeen, setLineSeen] = useState(false);
  const [lineFloor, setLineFloor] = useState<number>(layout.hit);
  /** Bumped when another tab takes the front: the shelves remount, and a put-back tile's held width lets go. */
  const [visit, setVisit] = useState(0);

  /* ---- The add field ---- */

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const searching = focused || query.length > 0;
  /*
   * Whether the head showed the payoff key when the search began, held
   * while it lasts: the first + on an empty bar would otherwise bring the
   * key in above the field and push the field and its rows down under the
   * finger. Adjusted during render (React's pattern for state that follows
   * a value).
   */
  const [headFrozen, setHeadFrozen] = useState<boolean | null>(null);
  if (searching && headFrozen === null) setHeadFrozen(stocked);
  if (!searching && headFrozen !== null) setHeadFrozen(null);
  const showPayoff = headFrozen ?? stocked;
  /*
   * The head's rule, while the add field's rows are up: only once they
   * scroll under it (the shelves' own offset says nothing about them).
   * Let go with the search. It flips on crossing, never per frame.
   */
  const [resultsRuled, setResultsRuled] = useState(false);
  if (!searching && resultsRuled) setResultsRuled(false);
  const onResultsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y >= 1;
    if (past !== resultsRuled) setResultsRuled(past);
  };

  /* ---- Sheets ---- */

  const [picker, setPicker] = useState<Shelf | null>(null);
  const [info, setInfo] = useState<IngredientInfo | null>(null);
  const [nextOpen, setNextOpen] = useState(false);
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [makeOpen, setMakeOpen] = useState(false);

  const putFieldAway = useCallback(() => {
    fieldRef.current?.blur();
    Keyboard.dismiss();
    setQuery('');
  }, []);

  /*
   * Another tab taking the front ends the visit: struck tiles go, the
   * next line lets go, the last change is forgotten. Read from the tab
   * navigator's own state, not useFocusEffect: a blur also fires when a
   * drink page is pushed over the tabs, and swiping back from a drink
   * opened from the Make list must find the struck Lime still there. This
   * also catches a tab changed from a pushed page, which blurs nothing
   * here. The swipe pager (v3.3) keeps the TabRouter, so its state still
   * says which tab is in front.
   */
  const navigation = useNavigation();
  const { key: routeKey } = useRoute();
  useEffect(() => {
    let away = false;
    return navigation.addListener('state', () => {
      const tabs = navigation.getState();
      const front = tabs?.routes[tabs.index]?.key === routeKey;
      if (front) {
        away = false;
        return;
      }
      if (away) return;
      away = true;
      setStruck({});
      setCleared(null);
      setChange(null);
      setHeld(null);
      setStocked(Object.keys(useBar.getState().owned).some((id) => INGREDIENTS_BY_ID[id]));
      setLineSeen(false);
      setLineFloor(layout.hit);
      setVisit((v) => v + 1);
      putFieldAway();
    });
  }, [navigation, routeKey, putFieldAway]);

  /**
   * Says what a change did: the payoff key's last change and VoiceOver's
   * sentence both read this one diff.
   */
  const report = useCallback((before: BarResult, lead: string) => {
    const after = matchOwned(useBar.getState().owned);
    const delta = after.makeable.length - before.makeable.length;
    setChange(delta);
    haptic.select();
    const what =
      delta > 0
        ? `${formatCount(delta)} more ${delta === 1 ? 'recipe' : 'recipes'}`
        : delta < 0
          ? `${formatCount(-delta)} fewer`
          : 'No change';
    const now = after.makeable.length;
    announce(`${lead}. ${what}. ${now ? `You can make ${formatCount(now)}` : 'Nothing to make yet'}.`);
  }, []);

  /**
   * Adds a bottle or takes it out, from wherever: a picker's row, the add
   * field's +, Next bottle's key, a struck tile's Undo. Any change lets go
   * of the next line's held Add.
   */
  const apply = useCallback(
    (id: string) => {
      const state = useBar.getState();
      const before = matchOwned(state.owned);
      const wasOn = !!state.owned[id];
      state.toggle(id);
      if (!wasOn) {
        // Back in the bar: no longer struck, wherever it came back from.
        setStruck((s) => {
          if (!s[id]) return s;
          const next = { ...s };
          delete next[id];
          return next;
        });
      }
      setHeld(null);
      const label = INGREDIENTS_BY_ID[id]?.label ?? 'That';
      report(before, wasOn ? `${label} out of your bar` : `${label} in your bar`);
    },
    [report],
  );

  /** The next line's Add: in at once, and the line holds it with its Undo. */
  const addNext = useCallback(
    (id: string) => {
      apply(id);
      setHeld(id);
    },
    [apply],
  );

  /** The ingredient sheet's Remove: out, and its tile stays where it stood, struck. */
  const removeTile = useCallback(
    (id: string) => {
      setInfo(null);
      apply(id);
      setStruck((s) => ({ ...s, [id]: 'one' }));
    },
    [apply],
  );

  const addBasics = useCallback(
    (ids: string[]) => {
      setBasicsOpen(false);
      const before = matchOwned(useBar.getState().owned);
      useBar.getState().add(ids);
      setStruck((s) => Object.fromEntries(Object.entries(s).filter(([id]) => !ids.includes(id))));
      setHeld(null);
      report(before, 'The basics are in your bar');
    },
    [report],
  );

  const clearBar = useCallback(() => {
    const state = useBar.getState();
    const ids = Object.keys(state.owned).filter((id) => INGREDIENTS_BY_ID[id]);
    const before = matchOwned(state.owned);
    state.clear();
    setStruck(Object.fromEntries(ids.map((id) => [id, 'clear' as const])));
    setCleared(ids);
    setHeld(null);
    report(before, 'Your bar is clear. Undo, under the shelves, puts it back');
  }, [report]);

  const confirmClear = () =>
    Alert.alert('Clear your bar?', `${things(ownedCount)} come off. Undo puts them back until you leave My Bar.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearBar },
    ]);

  const undoClear = useCallback(() => {
    const state = useBar.getState();
    const ids = (cleared ?? []).filter((id) => !state.owned[id]);
    const before = matchOwned(state.owned);
    state.add(ids);
    setStruck({});
    setCleared(null);
    report(before, 'Your bar is back');
  }, [cleared, report]);

  const openDrink = useCallback(
    (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  const openTile = useCallback(
    (i: Ingredient) =>
      setInfo({
        ingredient: i,
        used: usedIn(result, i.id).length,
        total: result.makeable.length,
        sections: makeList(result, i.id),
      }),
    [result],
  );

  // The keyboard goes first: a sheet presented over a focused field keeps the keyboard up over the sheet.
  const openMake = useCallback(() => {
    putFieldAway();
    setMakeOpen(true);
  }, [putFieldAway]);
  const makeSections = useMemo(() => makeList(result), [result]);

  const openShelf = useCallback(
    (shelf: Shelf) => {
      putFieldAway();
      setPicker(shelf);
    },
    [putFieldAway],
  );

  /* ---- What the page shows ---- */

  // Struck tiles are only those still out of the bar; a bottle back in by any way is a plain tile.
  const struckNow: Record<string, Struck> = Object.fromEntries(Object.entries(struck).filter(([id]) => !owned[id]));
  const skip = new Set(Object.keys(struckNow));
  const shelves = inventory({ ...owned, ...struckNow });
  const heldIngredient = held && owned[held] ? (INGREDIENTS_BY_ID[held] ?? null) : null;
  const best = heldIngredient ? null : bestBottle(result, skip);
  if ((best || heldIngredient) && !lineSeen) setLineSeen(true);
  const lineSlot = !!best || !!heldIngredient || lineSeen;
  const clearUndo = cleared?.some((id) => !owned[id]) ?? false;

  return (
    <View style={styles.screen}>
      {/* A root's own name, and nothing beside it: the add field is on the page. */}
      <ScreenTopBar size="lg" title="My Bar" showRule={false} />

      {/* Before the bar loads from disk: the top bar and nothing else, so a stocked bar never flashes empty. */}
      {hydrated ? (
        <>
          <View style={[styles.head, (searching ? resultsRuled : scrolled) && styles.headRuled]}>
            {showPayoff ? <PayoffKey total={total} change={change} onPress={openMake} /> : null}
            <SearchField
              ref={fieldRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Add an ingredient"
              accessibilityLabel="Add an ingredient"
              accessibilityHint="Type a bottle, a kind or a brand, then tap plus on a result"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </View>

          <View style={styles.flex}>
            <Animated.ScrollView
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md }}
              onScroll={onScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              // Under the add field's rows, the shelves are out of VoiceOver's reach too.
              accessibilityElementsHidden={searching}
              importantForAccessibility={searching ? 'no-hide-descendants' : 'auto'}>
              {!stocked ? (
                <View style={styles.intro}>
                  <Text style={[textRole.bodyStrong, styles.ink]}>Nothing in your bar yet</Text>
                  <Text style={[textRole.body, styles.muted]}>
                    Add what you have at home, and see every drink you can make with it.
                  </Text>
                  <Button
                    label="Start with the basics"
                    block
                    onPress={() => setBasicsOpen(true)}
                    accessibilityHint="Fourteen bottles most bars keep, all ticked. Untick what you don't have, then add"
                    style={styles.basics}
                  />
                </View>
              ) : lineSlot ? (
                // Its tallest this visit, kept as a floor: a line that goes, or wraps less, lifts nothing.
                <View
                  style={[styles.next, { minHeight: lineFloor }]}
                  onLayout={(e) => {
                    const h = Math.ceil(e.nativeEvent.layout.height);
                    setLineFloor((f) => (h > f ? h : f));
                  }}>
                  <NextLine
                    best={best}
                    held={heldIngredient}
                    onOpen={() => setNextOpen(true)}
                    onAdd={addNext}
                    onUndo={apply}
                  />
                </View>
              ) : null}

              <View style={!stocked || lineSlot ? styles.shelvesAfterLine : styles.shelvesAlone}>
                <Shelves
                  key={visit}
                  shelves={shelves}
                  struck={struckNow}
                  onOpen={openTile}
                  onRestore={apply}
                  onAdd={setPicker}
                />
              </View>

              {clearUndo ? (
                <Button
                  label="Undo"
                  variant="text"
                  onPress={undoClear}
                  accessibilityLabel={`Undo clear, puts ${things(cleared?.length ?? 0)} back`}
                  style={styles.foot}
                />
              ) : ownedCount ? (
                <Button
                  label="Clear my bar"
                  variant="dangerText"
                  onPress={confirmClear}
                  accessibilityHint="Asks first"
                  style={styles.foot}
                />
              ) : null}
            </Animated.ScrollView>

            {searching ? (
              <AddResults
                query={query}
                owned={owned}
                result={result}
                bottomInset={insets.bottom + TAB_BAR_CLEARANCE}
                onToggle={apply}
                onOpenShelf={openShelf}
                onCancel={putFieldAway}
                onScroll={onResultsScroll}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <MakeSheet
        visible={makeOpen}
        title={`You can make ${formatCount(total)}`}
        sections={makeSections}
        onClose={() => setMakeOpen(false)}
        onOpen={openDrink}
      />
      <PickerSheet shelf={picker} owned={owned} result={result} onToggle={apply} onClose={() => setPicker(null)} />
      <IngredientSheet
        info={info}
        onClose={() => setInfo(null)}
        onRemove={removeTile}
        onOpenDrink={(id) => {
          setInfo(null);
          openDrink(id);
        }}
      />
      <NextBottleSheet
        visible={nextOpen}
        result={result}
        owned={owned}
        skip={skip}
        onToggle={apply}
        onClose={() => setNextOpen(false)}
      />
      <BasicsSheet visible={basicsOpen} onAdd={addBasics} onClose={() => setBasicsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  /* The head never scrolls; its 1pt rule shows only once the shelves (or the add field's rows) run under it. */
  head: {
    gap: HEAD_GAP,
    paddingHorizontal: layout.gutter,
    paddingTop: space.sm,
    paddingBottom: HEAD_GAP,
    backgroundColor: colors.bg,
    borderBottomWidth: stroke.edge,
    borderBottomColor: 'transparent',
  },
  headRuled: { borderBottomColor: colors.line },
  next: { paddingHorizontal: layout.gutter },
  intro: { paddingHorizontal: layout.gutter, paddingTop: space.sm, gap: space.xs },
  basics: { marginTop: space.xl },
  shelvesAfterLine: { marginTop: layout.section },
  shelvesAlone: { marginTop: space.lg },
  // A text key's own 12pt side padding, taken back so the word sits on the gutter.
  foot: { alignSelf: 'flex-start', marginTop: layout.section, marginLeft: layout.gutter - space.md },
});
