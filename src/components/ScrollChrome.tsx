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
/* answers scrolling reads it: Home's top bar slides away               */
/* (useHideOnScroll, specs/v3.1-changes.md §4.1). The tab bar no longer */
/* compacts: v4 docked it with no labels, so there is nothing to give   */
/* up (layout spec 4).                                                  */
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
/*                                                                      */
/* PINNED AND HELD (v4.2 §3.1). The Dex's header, the field and its     */
/* chip row, hides the same way, and some moments must not move it: a   */
/* focused field or an open sheet PIN it shown (the constant 0), and a  */
/* finger on the Nº rail HOLDS it where it is (a constant at its        */
/* current value), because the rail rides the same graph and a header   */
/* popping back would slide the rail out from under that finger. The    */
/* native diffClamp cannot be read synchronously, so each tab keeps a   */
/* JS twin of it, stepped by the same scroll events in the listener     */
/* that is already there. When the pin or the hold lets go, the next    */
/* graph starts from the twin's value: the next finger scroll moves     */
/* the header from where it is, never from a jump.                      */
/* ==================================================================== */

/** The tabs whose list drives the chrome. Reels has no list of this kind. */
export type ChromeTab = 'index' | 'dex' | 'saved' | 'bar' | 'profile';

const CHROME_TABS: readonly ChromeTab[] = ['index', 'dex', 'saved', 'bar', 'profile'];

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
  /**
   * The JS twin of the tab's hide graph: 0 (shown) to `range` (hidden),
   * the value the native diffClamp holds now. Stepped by every scroll
   * event the JS side receives while `live` (the moving graph is the one
   * drawn); frozen while the chrome is pinned (at 0) or held (where it
   * was). It can only drift from the native value at a clamp, and only
   * when a busy JS thread coalesced events the native side saw one by one.
   */
  twin: { range: number; value: number; live: boolean };
  /** The constant a hold draws, kept per value so a re-render reuses the node. */
  holdNode: { value: number; node: Chrome } | null;
  /** Whether the last hide() was for a focused tab: a false-to-true step is an arrival, which starts shown. */
  wasFocused: boolean;
}

/*
 * The provider's mutable side. A class behind one stable instance, so the
 * hooks reach it only through methods. Render builds nodes and writes
 * only the graph's own bookkeeping, in useHideOnScroll's memo: the hide
 * cache, the twin's start and freeze, the hold's constant. Every other
 * write happens in scroll listeners and effects.
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
   * switch (a graph moving to another tab) would cut that tab's
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
        twin: { range: 0, value: 0, live: false },
        holdNode: null,
        wasFocused: false,
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
   * comes a commit after the tab change, often once the pager has already
   * settled (and always after a Reduce Motion cut). Each would leave the
   * chrome as the old graph drew it (compacted, or hidden) until the next
   * scroll. Setting the pulse, queued after the swap's connects, makes it
   * draw at once.
   */
  wake() {
    this.pulse.setValue(0);
  }

  entry(tab: ChromeTab): TabEntry {
    const e = this.entries.get(tab);
    if (!e) throw new Error(`No scroll chrome for tab ${tab}`);
    return e;
  }

  /*
   * The JS side of a scroll event: the twin, the offset, then the
   * screen's handler. The twin steps as the native node does: by the
   * change in the offset clamped at the top (travel's clampTop), held
   * between 0 and its range.
   */
  scrolled(tab: ChromeTab, e: NativeSyntheticEvent<NativeScrollEvent>) {
    const entry = this.entry(tab);
    const y = e.nativeEvent.contentOffset.y;
    const t = entry.twin;
    if (t.live) {
      t.value = Math.min(t.range, Math.max(0, t.value + Math.max(0, y) - Math.max(0, entry.lastY)));
    }
    entry.lastY = y;
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
   *
   * `start` is where the chrome already is (a held header let go), so
   * the first input is that and not 0. hide() never passes more than the
   * offset now: a hold can end at the top (the rail dragged to 0001), and
   * a header resumed half hidden there would have no upward scroll left
   * to bring it back.
   */
  private travel(tab: ChromeTab, range: number, start: number) {
    const e = this.entry(tab);
    const clampTop = e.scrollY.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolateLeft: 'clamp',
      extrapolateRight: 'extend',
    });
    const moved = Animated.subtract(clampTop, Math.max(0, e.lastY));
    return Animated.diffClamp(start > 0 ? Animated.add(moved, start) : moved, 0, range);
  }

  /*
   * The hide graph: 0..distance. Rebuilt each time the tab is focused;
   * kept as it was while the tab is out of focus, so Home's bar does not
   * jump while Home is still sliding out of the pager. A focus rebuild
   * starts shown; one that follows a pin starts shown too (the twin was
   * frozen at 0), and one that follows a hold starts where the hold was,
   * unless the tab left focus in between: arriving is always shown, even
   * when a hold was let go while the tab was away.
   */
  hide(tab: ChromeTab, distance: number, focused: boolean): Chrome {
    const e = this.entry(tab);
    const arriving = focused && !e.wasFocused;
    e.wasFocused = focused;
    const kept = e.hide.get(distance);
    if (kept && !focused) return kept;
    const start = e.twin.live || arriving ? 0 : Math.min(distance, e.twin.value, Math.max(0, e.lastY));
    const next = this.travel(tab, distance, start).interpolate({
      inputRange: [0, distance],
      outputRange: [0, distance],
      extrapolate: 'clamp',
    });
    e.hide.set(distance, next);
    e.twin = { range: distance, value: start, live: true };
    return next;
  }

  /** Pinned shown: the constant 0, and the twin frozen there, so letting go starts shown. */
  pin(tab: ChromeTab): Chrome {
    const t = this.entry(tab).twin;
    t.live = false;
    t.value = 0;
    return this.rest;
  }

  /*
   * Held where it is: a native constant at the twin's value, which stops
   * stepping until the hold lets go. Native from birth, as every node
   * here is, and one node per value, so the re-renders a hold causes
   * reuse it rather than swap the graph.
   */
  hold(tab: ChromeTab): Chrome {
    const e = this.entry(tab);
    e.twin.live = false;
    const value = e.twin.value;
    if (e.holdNode && e.holdNode.value === value) return e.holdNode.node;
    const node = new Animated.Value(value, { useNativeDriver: true }).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    e.holdNode = { value, node };
    return node;
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

/** In (tabs)/_layout.tsx, around <TopTabs>, so both the tab bar and every tab screen are inside it. */
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

export interface HideOptions {
  /**
   * Always shown, nothing moves (v4.2 §3.1): the Dex's field has focus,
   * or its filter or order sheet is open. The constant 0; letting go
   * rebuilds the graph shown, from the offset of that moment.
   */
  pinned?: boolean;
  /**
   * Held where it is, nothing moves: a finger on the Dex's Nº rail, which
   * rides this graph, so the rail stays under the finger while the grid
   * jumps beneath it. Letting go resumes from the held value.
   */
  held?: boolean;
}

/**
 * Chrome that hides as the list scrolls down and returns from the first
 * upward movement: Home's bar (§4.1), the Dex's header (v4.2 §3). 0
 * (shown) to `distance` (hidden). Rebuilt each time `tab` regains focus,
 * so coming back always shows it (a bar hidden when you left would
 * otherwise still be hidden over a scrolled feed). The constant 0 while
 * VoiceOver runs, and while `pinned`; a constant where it is while
 * `held` (HideOptions). Call it from inside the tab's own screen (focus
 * is that screen's), in the component that renders the chrome or one
 * above it, so the swap is drawn at once (useWakeOnSwap). `distance`
 * must be more than 0.
 */
export function useHideOnScroll(tab: ChromeTab, distance: number, options?: HideOptions): Chrome {
  const { store, screenReader } = useChrome();
  const focused = useIsFocused();
  const pinned = screenReader || !!options?.pinned;
  const held = !!options?.held;
  const graph = useMemo(() => {
    if (pinned) return store.pin(tab);
    if (held) return store.hold(tab);
    return store.hide(tab, distance, focused);
  }, [store, tab, distance, focused, pinned, held]);
  useWakeOnSwap(store, graph);
  return graph;
}

const styles = StyleSheet.create({
  keeper: { position: 'absolute', top: 0, left: 0, width: 0, height: 0 },
});
