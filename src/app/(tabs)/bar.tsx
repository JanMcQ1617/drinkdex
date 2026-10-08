import { useNavigation, useRoute, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, type ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarPicker } from '@/components/bar/BarPicker';
import { AWAY_PAGE, OneIngredientAway, type PourNote, STRIP_MAX, YouCanMake } from '@/components/bar/Counter';
import {
  awayOf,
  awayRows,
  basicsExamples,
  rankDrinks,
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
/* One page, one scroll (v3.3). The back bar of vector bottles on lit   */
/* shelves is gone: Jan asked for it off ("the shelf section for my     */
/* bar, I want removed. and just let them choose what they have"), and  */
/* its SVG bottles were the heaviest screen in the app, the one My      */
/* Bar's first open stuttered on. Top to bottom:                        */
/*                                                                      */
/*   PICKER   "What's in your bar?" on a lining band under the lining   */
/*            top bar, its tally on a brass plate, then on paper a      */
/*            search field, the category chips and the checklist as     */
/*            bottle labels, most useful first (BarPicker). An empty    */
/*            bar offers the fourteen basics in one tap.                */
/*   MAKE     "You can make N": lit mounts standing on a walnut counter */
/*            (just unlocked, then new to your Dex), "See all" for      */
/*            every one A to Z, set as a menu.                          */
/*   AWAY     "One ingredient away N": the best single bottle to add,   */
/*            then a row per drink with a "+ Orange" of its own.        */
/*                                                                      */
/* BRASS (specs/v3-3-mockups/brass, screen 3): the head band ends in a  */
/* brass rail, not a shade, and the top bar's own rail shows only once  */
/* the band scrolls under it. No gradient at the top, anywhere.         */
/*                                                                      */
/* STILLNESS. The checklist's order and One ingredient away (its rows   */
/* and its best bottle) are a SNAPSHOT, taken when another tab takes    */
/* the front (and when the bar first loads, and after Clear; a drink    */
/* page pushed over it is not leaving), so nothing moves under the      */
/* finger while you tick: a label you tick flips where it stands, an    */
/* Add flips its toggle where it stands, and the same tap undoes it.    */
/* No layout animation and no timed animation run here (v3.3 section    */
/* 0): the motion is the native kind that rests fully drawn, a press's  */
/* fill or fade, expo-image's crossfade from a ghost to a lit photo,    */
/* the "See all" sheet's UIKit slide, the scroll that lifts the search  */
/* field above the keyboard and the tab pager under the finger.         */
/* ==================================================================== */

/** What changed on this visit, for the line under "You can make". */
interface Change {
  id: string;
  label: string;
  on: boolean;
  /** Unlocked (on) or lost (off). */
  drinks: readonly Drink[];
}

/**
 * Whether a drink is in your Dex, read from the store as it is now, for
 * a snapshot taken outside a render (the tab listener, an Add). It says
 * no for every drink until the Dex has loaded, like the render's own
 * test, so the order a snapshot takes at launch is the one it keeps.
 */
function dexTestNow(): (d: Drink) => boolean {
  const { hydrated, unlocks } = useCollection.getState();
  return (d) => hydrated && Object.prototype.hasOwnProperty.call(unlocks, d.id);
}

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

  const inDex = (d: Drink) => dexReady && Object.prototype.hasOwnProperty.call(unlocks, d.id);

  const [snap, setSnap] = useState<Snapshot>(() => takeSnapshot(useBar.getState().owned, dexTestNow()));
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
    setSnap(takeSnapshot(owned, inDex));
  }
  const [change, setChange] = useState<Change | null>(null);
  const [awayShown, setAwayShown] = useState(AWAY_PAGE);
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
   * the rows re-sorted and "Campari unlocked 9" gone. This also catches
   * a tab changed from a pushed page, which blurs nothing here. The swipe
   * pager (v3.3) keeps the TabRouter, so its state still says which tab
   * is in front.
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
      setSnap(takeSnapshot(useBar.getState().owned, dexTestNow()));
      setChange(null);
      setAwayShown(AWAY_PAGE);
    });
  }, [navigation, routeKey]);

  /**
   * Adds a thing to your bar or takes it out, and says what that changed:
   * the line under "You can make" ("Campari unlocked 9") and VoiceOver
   * both read this one diff.
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
    announce(
      `${label} in your bar. ${lit.length ? `${lit.length} more ${lit.length === 1 ? 'drink' : 'drinks'}` : 'Nothing new yet'}, ${total} in all.`,
    );
  }, []);

  /**
   * Add on a One ingredient away row or on its best bottle: first freeze
   * the rows and the card as they stand, so none moves under the finger
   * and the card does not swap to the next best bottle under it.
   */
  const applyFromRow = useCallback(
    (id: string) => {
      const before = matchOwned(useBar.getState().owned);
      const test = dexTestNow();
      setSnap((s) => (s.frozen ? s : { ...s, frozen: true, ...awayOf(before, test) }));
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
    setSnap(takeSnapshot({}, dexTestNow()));
    setChange(null);
    setAwayShown(AWAY_PAGE);
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

  /* ---- What the page shows ---- */

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

  const oneAway = awayRows({ snap, result, owned, shown: awayShown, inDex });

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
        A root screen's own name on the lining, with no control on either
        side: the search is on the page, and the tab bar already has the
        +. At rest it runs straight into the picker's lining band; once the
        band scrolls under it, its brass rail says so (Brass D10).
      */}
      <ScreenTopBar size="lg" title="My Bar" tone="lining" showRule={scrolled} />

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
          best={oneAway.best}
          rows={oneAway.rows}
          more={oneAway.more}
          onAdd={applyFromRow}
          onShowMore={() => setAwayShown((n) => n + AWAY_PAGE)}
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
