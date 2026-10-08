import { useNavigation, useRoute, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, type ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarPicker } from '@/components/bar/BarPicker';
import { OneIngredientAway, type PourNote, STRIP_MAX, YouCanMake } from '@/components/bar/Counter';
import {
  basicsExamples,
  groupsOf,
  rankDrinks,
  shortGroups,
  type Snapshot,
  stripOf,
  takeSnapshot,
} from '@/components/bar/model';
import { PourTonightSheet } from '@/components/bar/PourTonightSheet';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { announce, haptic } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { BASICS, basicsResult, diffMakeable, INGREDIENTS_BY_ID, matchOwned } from '@/lib/bar';
import { useBar } from '@/store/bar';
import { useCollection } from '@/store/collection';
import type { Drink } from '@/types';

/* ==================================================================== */
/* My Bar: pick what you have, see what you can make                    */
/*                                                                      */
/* One page, one scroll, on paper (v3.3). The back bar of vector        */
/* bottles on lit shelves is gone: Jan asked for it off ("the shelf     */
/* section for my bar, I want removed. and just let them choose what    */
/* they have"), and its SVG bottles were the heaviest screen in the     */
/* app, the one My Bar's first open stuttered on. Top to bottom:        */
/*                                                                      */
/*   PICKER   "What's in your bar?": a search field, the category       */
/*            chips and a checklist, most useful first (BarPicker). An  */
/*            empty bar offers the fourteen basics in one tap.          */
/*   MAKE     "You can make N": the strip of lit mounts (just unlocked, */
/*            then new to your Dex), "See all" for every one A to Z.    */
/*   AWAY     "One ingredient away N", grouped by the one ingredient.   */
/*            Add there expands in place with what it unlocked.         */
/*                                                                      */
/* STILLNESS. The checklist's order and the groups' order are a         */
/* SNAPSHOT, taken when another tab takes the front (and when the bar   */
/* first loads, and after Clear; a drink page pushed over it is not     */
/* leaving), so nothing moves under the finger while you tick: a box    */
/* you tick flips where it stands, and the same tap unticks it. No      */
/* layout animation and no timed animation run here (v3.3 section 0):   */
/* the motion is the native kind that rests fully drawn, a row's press  */
/* fill, expo-image's crossfade from a ghost to a lit photo, the "See   */
/* all" sheet's UIKit slide, the scroll that lifts the search field     */
/* above the keyboard and the tab pager under the finger.               */
/* ==================================================================== */

/** What changed on this visit, for the line under "You can make". */
interface Change {
  id: string;
  label: string;
  on: boolean;
  /** Unlocked (on) or lost (off). */
  drinks: readonly Drink[];
}

/** Groups under One ingredient away, then this many more a tap at a time. */
const GROUP_PAGE = 6;

export default function BarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scrolled, onScrolledPast] = useScrolledPast();
  /*
   * The scroll that compacts the tab bar (ScrollChrome), with the rule
   * signal riding along as its listener. Tapping My Bar again while here
   * returns to the top.
   */
  const { onScroll } = useTabScroll('bar', onScrolledPast);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  /** A drink to open once the See all sheet has finished leaving. */
  const pendingDrink = useRef<string | null>(null);

  const owned = useBar((s) => s.owned);
  const barLoaded = useBar((s) => s.hydrated);
  const unlocks = useCollection((s) => s.unlocks);
  const dexReady = useCollection((s) => s.hydrated);

  const [snap, setSnap] = useState<Snapshot>(() => takeSnapshot(useBar.getState().owned));
  /** Whether `snap` was taken from the bar as loaded from disk, or the empty one before it. */
  const [snapLoaded, setSnapLoaded] = useState(() => useBar.getState().hydrated);
  /*
   * The bar loads from disk after the first render: take the order again
   * once it has. Adjusted during render (React's pattern for state that
   * follows a value), not from a store subscription, which missed a load
   * landing between this screen's first render and its effect.
   */
  if (barLoaded && !snapLoaded) {
    setSnapLoaded(true);
    setSnap(takeSnapshot(owned));
  }
  const [change, setChange] = useState<Change | null>(null);
  /** What each thing added this visit unlocked, for its Added row. */
  const [litBy, setLitBy] = useState<Record<string, readonly Drink[]>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, true>>({});
  const [groupsShown, setGroupsShown] = useState(GROUP_PAGE);
  const [allOpen, setAllOpen] = useState(false);

  /*
   * matchOwned remembers its answer for the store's `owned` object, so a
   * re-render (a keystroke in the picker's search), or coming back to this
   * tab, re-runs nothing.
   */
  const result = matchOwned(owned);

  /*
   * Another tab taking the front re-sorts the page for next time and
   * forgets this visit's changes. Read from the tab navigator's own state,
   * not useFocusEffect: a blur also fires when a drink page (or Log) is
   * pushed over the tabs, and swiping back from a drink opened here found
   * the rows re-sorted, "Campari unlocked 9" gone and the open groups
   * shut. This also catches a tab changed from a pushed page, which blurs
   * nothing here. The swipe pager (v3.3) keeps the TabRouter, so its
   * state still says which tab is in front.
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
      setSnap(takeSnapshot(useBar.getState().owned));
      setChange(null);
      setLitBy({});
      setOpenGroups({});
      setGroupsShown(GROUP_PAGE);
    });
  }, [navigation, routeKey]);

  /**
   * Adds a thing to your bar or takes it out, and says what that changed:
   * the line under "You can make" ("Campari unlocked 9"), the Added row's
   * drinks and VoiceOver all read this one diff.
   */
  const apply = useCallback((id: string) => {
    const state = useBar.getState();
    const before = matchOwned(state.owned);
    const wasOn = !!state.owned[id];
    state.toggle(id);
    const after = matchOwned(useBar.getState().owned);
    const { lit, lost } = diffMakeable(before, after);
    const label = INGREDIENTS_BY_ID[id]?.label ?? 'That';
    const total = after.makeable.length;
    haptic.select();
    if (wasOn) {
      setChange({ id, label, on: false, drinks: lost });
      announce(`${label} out of your bar. ${lost.length ? `${lost.length} fewer` : 'Nothing lost'}, ${total} in all.`);
      return;
    }
    setChange({ id, label, on: true, drinks: lit });
    setLitBy((m) => ({ ...m, [id]: lit }));
    announce(
      `${label} in your bar. ${lit.length ? `${lit.length} more ${lit.length === 1 ? 'drink' : 'drinks'}` : 'Nothing new yet'}, ${total} in all.`,
    );
  }, []);

  /** Add on a One ingredient away row: first freeze the rows' order, so none moves under the finger. */
  const applyFromRow = useCallback(
    (id: string) => {
      const before = matchOwned(useBar.getState().owned);
      setSnap((s) => (s.groups.length ? s : { ...s, ...groupsOf(before) }));
      apply(id);
    },
    [apply],
  );

  const addBasics = useCallback(() => {
    const before = matchOwned(useBar.getState().owned);
    useBar.getState().add([...BASICS]);
    const after = matchOwned(useBar.getState().owned);
    const { lit } = diffMakeable(before, after);
    haptic.select();
    setChange({ id: 'basics', label: 'The basics', on: true, drinks: lit });
    announce(`The basics are in your bar. ${lit.length} more drinks, ${after.makeable.length} in all.`);
  }, []);

  const clearBar = useCallback(() => {
    useBar.getState().clear();
    setSnap(takeSnapshot({}));
    setChange(null);
    setLitBy({});
    setOpenGroups({});
    setGroupsShown(GROUP_PAGE);
    announce('Your bar is clear.');
  }, []);

  const openDrink = useCallback(
    (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  /*
   * The picker's search took focus: lift the field to just under the top
   * bar, so what it finds lies between the field and the keyboard instead
   * of under the keyboard (Jan, build 17: "people cant see the drink
   * options available unless they close the keyboard"). UIScrollView's
   * own animated offset, or a cut under Reduce Motion; the picker is the
   * page's first child, so its y is the page's.
   */
  const reducedMotion = useReducedMotion();
  const liftSearch = useCallback(
    (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - space.sm), animated: !reducedMotion }),
    [reducedMotion],
  );

  const toggleGroupOpen = useCallback(
    (id: string) =>
      setOpenGroups((m) => {
        if (!m[id]) return { ...m, [id]: true };
        const next = { ...m };
        delete next[id];
        return next;
      }),
    [],
  );

  /* ---- What the page shows ---- */

  const inDex = (d: Drink) => dexReady && Object.prototype.hasOwnProperty.call(unlocks, d.id);
  const empty = !Object.keys(owned).some((id) => INGREDIENTS_BY_ID[id]);

  const makeable = result.makeable.map((m) => m.drink);
  const strip = makeable.length
    ? stripOf({ result, justLit: change?.on ? change.drinks : [], inDex, dexReady, max: STRIP_MAX })
    : empty
      ? basicsExamples()
      : [];

  const note: PourNote = change
    ? change.on
      ? { kind: 'lit', label: change.label, drinks: rankDrinks(change.drinks, inDex) }
      : { kind: 'off', label: change.label, lost: change.drinks.length, onUndo: () => apply(change.id) }
    : empty
      ? { kind: 'basics', pour: basicsResult().makeable.length }
      : makeable.length
        ? { kind: 'default' }
        : { kind: 'none', short: result.nearly.length > 0 };

  const short = shortGroups({ snap, result, owned, litBy, shown: groupsShown, inDex });

  /* ---- See all ---- */

  const openFromSheet = (id: string) => {
    pendingDrink.current = id;
    setAllOpen(false);
    // Only iOS reports the sheet's dismissal; elsewhere open the drink straight away.
    if (Platform.OS !== 'ios') {
      pendingDrink.current = null;
      openDrink(id);
    }
  };
  const afterSheet = () => {
    const id = pendingDrink.current;
    pendingDrink.current = null;
    if (id) openDrink(id);
  };

  return (
    <View style={styles.screen}>
      {/* The page's own grain, under everything: there is no global grain any more. */}
      <Grain />
      {/*
        A root screen's own name on paper, with no control on either side:
        the search is on the page, and the tab bar already has the +.
      */}
      <ScreenTopBar size="lg" title="My Bar" showRule={scrolled} />

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // A tick while the search keyboard is up lands first time; a drag puts the keyboard away.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <BarPicker
          owned={owned}
          result={result}
          taken={snap.taken}
          onToggle={apply}
          onAddBasics={addBasics}
          onClear={clearBar}
          onSearchFocus={liftSearch}
        />
        <YouCanMake
          total={empty ? null : makeable.length}
          strip={strip}
          note={note}
          onSeeAll={makeable.length ? () => setAllOpen(true) : undefined}
          onOpen={openDrink}
        />
        <OneIngredientAway
          total={result.nearly.length}
          groups={short.groups}
          more={short.more}
          open={openGroups}
          onToggle={applyFromRow}
          onToggleOpen={toggleGroupOpen}
          onShowMore={() => setGroupsShown((n) => n + GROUP_PAGE)}
          onOpen={openDrink}
        />
      </Animated.ScrollView>

      <PourTonightSheet
        visible={allOpen}
        drinks={makeable}
        onClose={() => setAllOpen(false)}
        onOpen={openFromSheet}
        onDismissed={afterSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
});
