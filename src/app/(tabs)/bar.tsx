import { useNavigation, useRoute, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Platform,
  type ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddBottleSheet, type SheetChange } from '@/components/bar/AddBottleSheet';
import { BackBar } from '@/components/bar/BackBar';
import { OneThingShort, PourTonight, type PourNote, STRIP_MAX } from '@/components/bar/Counter';
import { layoutShelves } from '@/components/bar/layout';
import {
  basicsExamples,
  groupsOf,
  rankDrinks,
  shortGroups,
  type Snapshot,
  stripOf,
  takeSnapshot,
  withExtras,
} from '@/components/bar/model';
import { PourTonightSheet } from '@/components/bar/PourTonightSheet';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { useTabScroll } from '@/components/ScrollChrome';
import { announce, haptic } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { BASICS, basicsResult, diffMakeable, gainOf, INGREDIENTS_BY_ID, matchOwned } from '@/lib/bar';
import { useBar } from '@/store/bar';
import { useCollection } from '@/store/collection';
import type { Drink } from '@/types';

/* ==================================================================== */
/* My Bar: the back bar                                                 */
/*                                                                      */
/* One screen, one scroll (v3.2, "Back bar", with the judges' grafts    */
/* from "Tonight"). Your bottles stand on lit shelves in the cabinet's  */
/* lining; under them, on paper, the counter shows what they pour. The  */
/* payoff is always right under the bottle you just tapped, so there is */
/* no Shelf/Drinks switch any more.                                     */
/*                                                                      */
/*   EMPTY    the lights are off and the fourteen basics stand stamped  */
/*            into the lining; tap what you have, or add them all. The  */
/*            counter leads with the payoff: three lit drinks the       */
/*            basics alone pour.                                        */
/*   STOCKED  what you own stands lit with its label; at each shelf's   */
/*            end the best next buy stands unlit with "+N drinks".      */
/*   COUNTER  "Pour tonight N" (just lit, then new to your Dex, then A  */
/*            to Z, all of it in "See all") and "One thing short N",    */
/*            grouped by the one thing. Add there expands in place.     */
/*   SHEET    the search glyph's "Add a bottle": every ingredient,      */
/*            ranked by what it would pour, with a live tally.          */
/*                                                                      */
/* STILLNESS. The bottles' order and the groups' order are a SNAPSHOT,  */
/* taken when another tab takes the front (and when the shelf first     */
/* loads; a drink page pushed over it is not leaving), so               */
/* nothing moves under the finger while you tap: a bottle you take off  */
/* goes ghost where it stands, and the same tap puts it back. No layout */
/* animation and no timed animation run here (build 15's tab slide      */
/* stalled halfway on Jan's phone): the only motion is the 2pt press    */
/* lift and expo-image's native crossfade from a ghost to a lit photo,  */
/* and both rest fully visible.                                         */
/* ==================================================================== */

/** What changed on this visit, for the line under "Pour tonight". */
interface Change {
  id: string;
  label: string;
  on: boolean;
  /** Lit (on) or lost (off). */
  drinks: readonly Drink[];
}

/** Groups on the counter, then this many more a tap at a time. */
const GROUP_PAGE = 6;

export default function BarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const [scrolled, onScrolledPast] = useScrolledPast();
  /*
   * The scroll that compacts the tab bar (ScrollChrome), with the rule
   * signal riding along as its listener. Tapping My Bar again while here
   * returns to the top.
   */
  const { onScroll } = useTabScroll('bar', onScrolledPast);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const counterY = useRef(0);
  /** A drink to open once the See all sheet has finished leaving. */
  const pendingDrink = useRef<string | null>(null);

  const owned = useBar((s) => s.owned);
  const shelfLoaded = useBar((s) => s.hydrated);
  const unlocks = useCollection((s) => s.unlocks);
  const dexReady = useCollection((s) => s.hydrated);

  const [snap, setSnap] = useState<Snapshot>(() => takeSnapshot(useBar.getState().owned));
  /** Whether `snap` was taken from the shelf as loaded from disk, or the empty one before it. */
  const [snapLoaded, setSnapLoaded] = useState(() => useBar.getState().hydrated);
  /*
   * The shelf loads from disk after the first render: take the order again
   * once it has. Adjusted during render (React's pattern for state that
   * follows a value), not from a store subscription, which missed a load
   * landing between this screen's first render and its effect.
   */
  if (shelfLoaded && !snapLoaded) {
    setSnapLoaded(true);
    setSnap(takeSnapshot(owned));
  }
  const [change, setChange] = useState<Change | null>(null);
  /** What each thing put on the shelf this visit lit, for its Added row. */
  const [litBy, setLitBy] = useState<Record<string, readonly Drink[]>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, true>>({});
  const [groupsShown, setGroupsShown] = useState(GROUP_PAGE);
  const [barOpen, setBarOpen] = useState(false);
  const [sheet, setSheet] = useState<'add' | 'all' | null>(null);

  /*
   * matchOwned remembers its answer for the store's `owned` object, so a
   * re-render, or coming back to this tab, re-runs nothing.
   */
  const result = matchOwned(owned);

  /*
   * Another tab taking the front re-sorts the bar for next time and forgets
   * this visit's changes. Read from the tab navigator's own state, not
   * useFocusEffect: a blur also fires when a drink page (or Log) is pushed
   * over the tabs, and swiping back from a drink opened on the counter
   * found the shelves re-sorted, "Campari lit 9" gone and the open groups
   * shut. This also catches a tab changed from a pushed page, which blurs
   * nothing here.
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
   * Puts a thing on the shelf or takes it off, and says what that changed:
   * the line under the shelves ("Campari lit 9"), the Added row's drinks,
   * the sheet's footer and VoiceOver all read this one diff.
   */
  const apply = useCallback((id: string): SheetChange => {
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
      announce(`${label} off the shelf. ${lost.length ? `${lost.length} fewer` : 'Nothing lost'}, ${total} in all.`);
      return { label, on: false, count: lost.length };
    }
    setChange({ id, label, on: true, drinks: lit });
    setLitBy((m) => ({ ...m, [id]: lit }));
    announce(
      `${label} on the shelf. ${lit.length ? `${lit.length} more ${lit.length === 1 ? 'drink' : 'drinks'}` : 'Nothing new pours yet'}, ${total} in all.`,
    );
    return { label, on: true, count: lit.length };
  }, []);

  /** Add on a One thing short row: first freeze the rows' order, so none moves under the finger. */
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
    announce(`The basics are on the shelf. ${lit.length} more drinks, ${after.makeable.length} in all.`);
  }, []);

  const clearShelf = useCallback(() => {
    useBar.getState().clear();
    setSnap(takeSnapshot({}));
    setChange(null);
    setLitBy({});
    setOpenGroups({});
    setGroupsShown(GROUP_PAGE);
    announce('Your shelf is clear.');
  }, []);

  const openDrink = useCallback(
    (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } }),
    [router],
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

  /* ---- What the shelf shows ---- */

  const inDex = (d: Drink) => dexReady && Object.prototype.hasOwnProperty.call(unlocks, d.id);
  const ownedIds = Object.keys(owned).filter((id) => INGREDIENTS_BY_ID[id]);
  const empty = ownedIds.length === 0;

  const bar = layoutShelves({
    order: withExtras(snap, owned),
    suggestion: snap.suggestion,
    owned,
    pours: (id) => gainOf(result, id),
    width,
    fontScale,
    // The fourteen basics always stand in full: the first open is the one place to see them all.
    open: barOpen || snap.mode === 'empty',
  });
  const basicsLeft = BASICS.filter((id) => !owned[id]).length;

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

  /* ---- Sheets ---- */

  const showCounter = () => {
    setSheet(null);
    scrollRef.current?.scrollTo({ y: counterY.current, animated: true });
  };
  const openFromSheet = (id: string) => {
    pendingDrink.current = id;
    setSheet(null);
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
        A root screen's own name on the cabinet's lining, so the bar runs
        on into the back bar beneath it. Search opens "Add a bottle"; no
        second "+", since the tab bar already has one.
      */}
      <ScreenTopBar
        size="lg"
        title="My Bar"
        tone="lining"
        showRule={scrolled}
        right={<TopBarButton icon="search" label="Add a bottle" onPress={() => setSheet('add')} />}
      />

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {/* Lining above the top, so a pull past it shows the cabinet, not a strip of paper. */}
        <View pointerEvents="none" style={styles.overscroll} />

        <BackBar
          mode={snap.mode}
          shelves={bar.shelves}
          ownedCount={ownedIds.length}
          makeable={makeable.length}
          basicsPour={basicsResult().makeable.length}
          basicsLeft={basicsLeft}
          hidden={bar.hidden}
          folds={bar.folds}
          open={barOpen}
          onToggle={apply}
          onAddBasics={addBasics}
          onSearch={() => setSheet('add')}
          onFold={() => setBarOpen((o) => !o)}
        />

        <View
          onLayout={(e: LayoutChangeEvent) => {
            counterY.current = e.nativeEvent.layout.y;
          }}>
          <PourTonight
            total={empty ? null : makeable.length}
            strip={strip}
            note={note}
            onSeeAll={makeable.length ? () => setSheet('all') : undefined}
            onOpen={openDrink}
          />
          <OneThingShort
            total={result.nearly.length}
            groups={short.groups}
            more={short.more}
            open={openGroups}
            onToggle={applyFromRow}
            onToggleOpen={toggleGroupOpen}
            onShowMore={() => setGroupsShown((n) => n + GROUP_PAGE)}
            onOpen={openDrink}
          />
        </View>
      </Animated.ScrollView>

      <AddBottleSheet
        visible={sheet === 'add'}
        owned={owned}
        result={result}
        onToggle={apply}
        onClear={clearShelf}
        onClose={() => setSheet(null)}
        onShowMe={showCounter}
      />
      <PourTonightSheet
        visible={sheet === 'all'}
        drinks={makeable}
        onClose={() => setSheet(null)}
        onOpen={openFromSheet}
        onDismissed={afterSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  overscroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -1000,
    height: 1000,
    backgroundColor: colors.lining,
  },
});
