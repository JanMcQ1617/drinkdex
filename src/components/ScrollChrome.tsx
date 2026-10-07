import { useIsFocused } from 'expo-router';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
} from 'react-native';

/* ==================================================================== */
/* Scroll-linked chrome                                                 */
/*                                                                      */
/* ONE SCROLL SOURCE PER TAB. Each tab's main list reports its offset   */
/* into one native Animated.Value (useTabScroll), and the chrome that   */
/* answers scrolling reads it: the floating tab bar compacts            */
/* (useTabBarCollapse) and Home's top bar slides away                   */
/* (useHideOnScroll), specs/v3.1-changes.md §3.3 to §4.1.               */
/*                                                                      */
/* MOVED BY THE FINGER, NEVER BY A CLOCK. Everything here is an         */
/* Animated.event with the native driver feeding diffClamp and          */
/* interpolate nodes: scroll events move it on the native side, and no  */
/* timer or frame loop is involved, so the Reanimated stall of specs/06 */
/* cannot reach it. There is no Animated.timing anywhere in this file   */
/* (check-design rule 15).                                              */
/*                                                                      */
/* AT REST, FULL CHROME. Offset 0 maps to the identity everywhere, and  */
/* each tab's chrome is rebuilt when the tab gains focus so that        */
/* arriving always shows it whole. While VoiceOver runs nothing moves:  */
/* a bar slid under the status strip would still be focusable.          */
/* ==================================================================== */

/** The tabs whose list drives the chrome. Reels has no list of this kind. */
export type ChromeTab = 'index' | 'dex' | 'bar' | 'profile';

const CHROME_TABS: readonly ChromeTab[] = ['index', 'dex', 'bar', 'profile'];

export const CHROME = {
  /** Points of downward scroll that take the tab bar from full to compact. */
  collapse: 48,
} as const;

type ScrollListener = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
type Chrome = Animated.AnimatedInterpolation<number>;

interface TabEntry {
  /*
   * Native from birth (`useNativeDriver: true`), so every node built on it
   * is native from the first render. A graph that started on the JS side
   * and was swapped for a native one later could leave the bar as the last
   * native graph drew it: Fabric does not restore a view's props when its
   * animated node is disconnected (RCTPropsAnimatedNode).
   */
  scrollY: Animated.Value;
  /** The list's last offset, recorded on the JS side by the event's listener. */
  lastY: number;
  /** Home's hide node per distance, kept while the tab is out of focus. */
  hide: Map<number, Chrome>;
  /** The screen's own scroll handler, read at event time. */
  listener: ScrollListener | undefined;
}

/*
 * The provider's mutable side. A class behind one stable instance, so the
 * hooks reach it only through methods. Render builds nodes and writes one
 * thing, Home's hide cache (an idempotent set); every other write happens
 * in scroll listeners and effects.
 */
class ChromeStore {
  private entries = new Map<ChromeTab, TabEntry>();
  /** A native constant 0, for every place the chrome must not move. */
  readonly rest: Chrome = new Animated.Value(0, { useNativeDriver: true }).interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  /** Never moves; setting it makes the native side draw a swapped graph (wake). */
  private readonly pulse = new Animated.Value(0, { useNativeDriver: true });

  /*
   * Holds every tab's scrollY in the native graph for the provider's whole
   * life (drawn on a 0 x 0 view, every translation 0), and the pulse with
   * them. A native value whose last child detaches is DROPPED and later
   * recreated under a new tag, but a list's native scroll event keeps
   * writing to the tag it was attached with: without this, the first tab
   * switch (the bar's graph moving to another tab) would cut that tab's
   * list off from its chrome for good.
   */
  readonly keeper: { transform: { translateX: Chrome }[] };

  constructor() {
    for (const tab of CHROME_TABS) {
      this.entries.set(tab, {
        scrollY: new Animated.Value(0, { useNativeDriver: true }),
        lastY: 0,
        hide: new Map(),
        listener: undefined,
      });
    }
    const held = [...CHROME_TABS.map((tab) => this.entry(tab).scrollY), this.pulse];
    this.keeper = {
      transform: held.map((value) => ({
        translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, 0] }),
      })),
    };
  }

  /*
   * iOS draws a native graph only when something steps it: an animation
   * frame, a scroll event, or a value set (RCTNativeAnimatedTurboModule
   * flushes and updates after setAnimatedNodeValue; a plain connect does
   * not). A swapped-in graph can arrive with nothing moving: VoiceOver
   * starting or stopping, or Home's bar rebuilt on the focus event, which
   * comes a commit after the tab change and can miss a Reduce Motion
   * transition's single frame. Each would leave the chrome as the old graph
   * drew it (compacted, or hidden) until the next scroll. Setting the
   * pulse, queued after the swap's connects, makes it draw at once.
   */
  wake() {
    this.pulse.setValue(0);
  }

  entry(tab: ChromeTab): TabEntry {
    const e = this.entries.get(tab);
    if (!e) throw new Error(`No scroll chrome for tab ${tab}`);
    return e;
  }

  /** The JS side of a scroll event: the offset, then the screen's handler. */
  scrolled(tab: ChromeTab, e: NativeSyntheticEvent<NativeScrollEvent>) {
    const entry = this.entry(tab);
    entry.lastY = e.nativeEvent.contentOffset.y;
    entry.listener?.(e);
  }

  /** Sets the screen's handler; the returned function clears it if it is still that one. */
  listen(tab: ChromeTab, listener: ScrollListener | undefined) {
    const entry = this.entry(tab);
    entry.listener = listener;
    return () => {
      if (entry.listener === listener) entry.listener = undefined;
    };
  }

  /** A list that has just mounted is at the top, whatever the last one reported. */
  reset(tab: ChromeTab) {
    const e = this.entry(tab);
    e.lastY = 0;
    e.scrollY.setValue(0);
  }

  /*
   * Distance scrolled down since this moment, held between 0 and `range`.
   * A native diffclamp node takes its first input unclamped, so the input
   * is the offset LESS the offset now: it starts at 0, and the chrome
   * starts whole, however far down the list already is. clampTop keeps a
   * rubber-band pull past the top from counting as an upward scroll.
   *
   * The offset now is clamped the same way. A list can rest at a negative
   * offset (iOS holds a refreshing list at about −60 while its spinner
   * shows), and subtracting that would start the input at +60: a bar
   * arriving hidden at the top of the list, where there is no upward
   * scroll to bring it back.
   */
  private travel(tab: ChromeTab, range: number) {
    const e = this.entry(tab);
    const clampTop = e.scrollY.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolateLeft: 'clamp',
      extrapolateRight: 'extend',
    });
    return Animated.diffClamp(Animated.subtract(clampTop, Math.max(0, e.lastY)), 0, range);
  }

  /** The tab bar's 0..1, from the moment `tab` gained focus. */
  collapse(tab: ChromeTab): Chrome {
    // Clamped here too: iOS's diffclamp node starts from its first input
    // unclamped (RCTDiffClampAnimatedNode's onAttachedToNode).
    return this.travel(tab, CHROME.collapse).interpolate({
      inputRange: [0, CHROME.collapse],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }

  /*
   * Home's bar: 0..distance. Rebuilt each time the tab is focused; kept
   * as it was while the tab is out of focus, so the bar does not jump
   * under the outgoing page's nudge.
   */
  hide(tab: ChromeTab, distance: number, focused: boolean): Chrome {
    const e = this.entry(tab);
    const kept = e.hide.get(distance);
    if (kept && !focused) return kept;
    const next = this.travel(tab, distance).interpolate({
      inputRange: [0, distance],
      outputRange: [0, distance],
      extrapolate: 'clamp',
    });
    e.hide.set(distance, next);
    return next;
  }
}

interface ChromeContext {
  store: ChromeStore;
  screenReader: boolean;
}

const Ctx = createContext<ChromeContext | null>(null);

function useChrome(): ChromeContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('ScrollChrome hooks need a ScrollChromeProvider above them');
  return ctx;
}

function asChromeTab(name: string | undefined): ChromeTab | null {
  return CHROME_TABS.find((tab) => tab === name) ?? null;
}

/*
 * Draws each graph the moment it is swapped in (ChromeStore.wake). In the
 * hook's caller, which renders the Animated views that take the graph: a
 * component's effects run after its children's, so the pulse is queued
 * after their connects.
 */
function useWakeOnSwap(store: ChromeStore, graph: Chrome) {
  useEffect(() => {
    store.wake();
  }, [store, graph]);
}

/** In (tabs)/_layout.tsx, around <Tabs>, so both the tab bar and every tab screen are inside it. */
export function ScrollChromeProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => new ChromeStore());
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then(
      (on) => {
        if (live) setScreenReader(on);
      },
      () => {},
    );
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const value = useMemo(() => ({ store, screenReader }), [store, screenReader]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Animated.View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.keeper, store.keeper]}
      />
    </Ctx.Provider>
  );
}

/**
 * For a tab's main list. Pass `onScroll` to an Animated.FlatList /
 * Animated.SectionList / Animated.ScrollView from react-native, with
 * scrollEventThrottle={16}.
 *
 * The event is made once per mounted list and never rebuilt (a new one
 * would detach and reattach the native event): the screen's own
 * `listener` (e.g. useScrolledPast's handler) is kept beside it and read
 * at event time instead.
 */
export function useTabScroll(
  tab: ChromeTab,
  listener?: ScrollListener,
): { onScroll: (...args: unknown[]) => void; scrollY: Animated.Value } {
  const { store } = useChrome();
  useEffect(() => store.listen(tab, listener), [store, tab, listener]);

  // A list mounts at the top: forget the offset the previous one reported.
  useEffect(() => {
    store.reset(tab);
  }, [store, tab]);

  return useMemo(() => {
    const { scrollY } = store.entry(tab);
    const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => store.scrolled(tab, e),
    });
    return { onScroll, scrollY };
  }, [store, tab]);
}

/**
 * FloatingTabBar only: 0 (full) to 1 (compact). Rebuilt whenever the
 * focused tab changes, so arriving at a tab always shows the full bar.
 * The constant 0 for a tab with no chrome list (Reels) and while
 * VoiceOver runs.
 */
export function useTabBarCollapse(focusedRouteName: string | undefined): Chrome {
  const { store, screenReader } = useChrome();
  const tab = asChromeTab(focusedRouteName);
  const graph = useMemo(
    () => (tab && !screenReader ? store.collapse(tab) : store.rest),
    [store, tab, screenReader],
  );
  useWakeOnSwap(store, graph);
  return graph;
}

/**
 * Home's bar (§4.1): 0 (shown) to `distance` (hidden). Rebuilt each time
 * `tab` regains focus, so coming back always shows the bar (a bar hidden
 * when you left would otherwise still be hidden over a scrolled feed).
 * The constant 0 while VoiceOver runs. Call it from inside the tab's own
 * screen (focus is that screen's), in the component that renders the bar
 * or one above it, so the swap is drawn at once (useWakeOnSwap).
 */
export function useHideOnScroll(tab: ChromeTab, distance: number): Chrome {
  const { store, screenReader } = useChrome();
  const focused = useIsFocused();
  const graph = useMemo(
    () => (screenReader ? store.rest : store.hide(tab, distance, focused)),
    [store, tab, distance, focused, screenReader],
  );
  useWakeOnSwap(store, graph);
  return graph;
}

const styles = StyleSheet.create({
  keeper: { position: 'absolute', top: 0, left: 0, width: 0, height: 0 },
});
