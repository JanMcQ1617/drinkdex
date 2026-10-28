import { useNavigation, useRoute } from 'expo-router';
import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/* ==================================================================== */
/* The swash signs each tab as it opens                                 */
/*                                                                      */
/* v4.9 (Jan, 28 Oct 2026; specs/v4.9/details/spec.md B). Jan asked for */
/* the line he likes under the tab titles to draw itself in each time a */
/* tab opens. This is that motion's clock, and nothing else: a shared   */
/* value, 0 undrawn to 1 drawn, that a tab root's swash (ScreenTopBar's */
/* TitleSwash) and Home's stories rule (TodaysPours) hand to their      */
/* mark's `draw`, the transform-only draw-on PenMarks already has.      */
/*                                                                      */
/* WHAT "OPENS" MEANS. Front is the tab navigator's own state, read     */
/* from navigation.getState() on mount and on every 'state' event, the  */
/* way (tabs)/bar.tsx tells its visit has ended: a tab is front when    */
/* routes[index] is its own route. Never useIsFocused alone: a drink    */
/* page pushed over the tabs and the pop back are not a tab opening.    */
/*                                                                      */
/*   ARRIVES (front, and it was not, mount in front included): the      */
/*     value is cancelled, set to 0, and drawn to 1 after 140ms over    */
/*     280ms, Easing.out(Easing.cubic). The delay lets the pager land   */
/*     (pager-view changes the index at settle on a swipe and at once   */
/*     on a tap, then glides about 250ms: a device check, spec B).      */
/*   LEAVES (it was front, and is not): reset to 0, 400ms later, in no  */
/*     time. The page has gone by then, so a title never visibly        */
/*     un-draws on its way out.                                         */
/*                                                                      */
/* STARTS UNDRAWN. A lazy tab mounts when a drag toward it starts, so   */
/* it mounts BEHIND: starting at 0, the page slides in undrawn and      */
/* signs when it lands. Starting at 1 would show it drawn, then blank,  */
/* then drawn. A focus that finds it under 1 with no arrival running    */
/* runs one, so the swash can never be left undrawn in front.           */
/*                                                                      */
/* REDUCE MOTION: 1 from the start, never reset, never run. The swash   */
/* is simply there.                                                     */
/*                                                                      */
/* Reanimated only, on the UI thread, read and written with .get() and  */
/* .set() (the React Compiler's convention here); never entering,       */
/* exiting or layout (check-design rule 3) and never a timed React      */
/* Native Animated (rule 15). Paint-free: anything may import it.       */
/* ==================================================================== */

/** The arrival's numbers, ms: the wait for the pager to land, the draw, and the reset after leaving. Easing.out(Easing.cubic). */
export const ARRIVAL = { delay: 140, duration: 280, settle: 400 } as const;

/**
 * This screen's arrival as a tab: 0 undrawn, 1 drawn. Call it from a tab
 * root's own tree (a pushed screen would read the stack, not the tabs).
 */
export function useTabArrival(): SharedValue<number> {
  const reduced = useReducedMotion();
  const draw = useSharedValue(reduced ? 1 : 0);
  const navigation = useNavigation();
  const { key: routeKey } = useRoute();

  useEffect(() => {
    if (reduced) {
      cancelAnimation(draw);
      draw.set(1);
      return;
    }
    let front = false;
    // When the last arrival started, so a focus during it does not start another (no callback off the UI thread).
    let arrivedAt = -Infinity;
    const arrive = () => {
      arrivedAt = Date.now();
      cancelAnimation(draw);
      draw.set(0);
      draw.set(
        withDelay(ARRIVAL.delay, withTiming(1, { duration: ARRIVAL.duration, easing: Easing.out(Easing.cubic) })),
      );
    };
    const leave = () => {
      cancelAnimation(draw);
      draw.set(withDelay(ARRIVAL.settle, withTiming(0, { duration: 0 })));
    };
    const isFront = () => {
      const tabs = navigation.getState();
      return !!tabs && tabs.routes[tabs.index]?.key === routeKey;
    };
    const read = () => {
      const now = isFront();
      if (now && !front) arrive();
      else if (!now && front) leave();
      front = now;
    };
    // The safety: front, under 1, and nothing arriving.
    const focus = () => {
      if (!isFront()) return;
      const arriving = Date.now() - arrivedAt < ARRIVAL.delay + ARRIVAL.duration;
      if (draw.get() < 1 && !arriving) arrive();
      front = true;
    };
    read();
    const offState = navigation.addListener('state', read);
    const offFocus = navigation.addListener('focus', focus);
    return () => {
      offState();
      offFocus();
    };
  }, [navigation, routeKey, reduced, draw]);

  return draw;
}
