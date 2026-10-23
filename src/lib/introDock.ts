import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import { Easing, makeMutable, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WORDMARK_ASPECT, WORDMARK_LEAD, WORDMARK_SM_BELOW } from '@/components/brand/Wordmark';
import { introHasPlayed } from '@/lib/intro';
import {
  DOCK_MS,
  HANDOFF_MS,
  type Rect,
  RISE_GROUPS,
  type RiseGroup,
  type RiseGroupName,
  SM_FADE_FROM,
} from '@/lib/introDockPlan';

/* ==================================================================== */
/* The Dock: the clock, the destination registry, the rising groups     */
/*                                                                      */
/* v4.6 (Jan, 23 Oct 2026; specs/v4.6-details/spec.md, B). The film     */
/* ends on its finished wordmark centred on white; instead of           */
/* dissolving, that wordmark glides and shrinks into exactly where the  */
/* first screen draws its own (Home's bar; the onboarding welcome;      */
/* sign-in's first step; the password reset), while the app rises into  */
/* place underneath. About 0.9s after the film.                         */
/*                                                                      */
/* ONE CLOCK. Everything that moves is a pure function of `dockClock`,  */
/* which rests at 1 and is run 0 to 1, linear, over DOCK_MS by the film */
/* alone (VideoIntro). Every group's style is the identity at 1, so a   */
/* resume, Reduce Motion (the drawn intro, which never touches it), a   */
/* stall, or any screen mounted later than the launch is fully drawn:   */
/* nothing can be left hidden or half-risen. And a tap that runs the    */
/* clock home early carries every value home together, the pen's beat   */
/* included.                                                            */
/*                                                                      */
/* WHY MODULE VALUES. The film sits beside the Stack at the root, and   */
/* the screens it lands on are deep inside it; neither can hand the     */
/* other a prop. So the clock, the phase and the measured destination   */
/* are runtime-wide shared values, as details/handoff's HOME_RULE_DRAW  */
/* is, and a screen opts in by wrapping a group in <Rise> or its        */
/* wordmark in <DockSlot> (components/DockRise). A screen that opts in  */
/* to nothing is simply there, as it was before the Dock.               */
/*                                                                      */
/* NO LAYOUT ANIMATION. Transforms and opacity on wrappers, through     */
/* useAnimatedStyle; no `entering`, `exiting` or `layout` prop, which   */
/* stall in Release builds (check-design rule 3). One wrapper per group,*/
/* never per row: the feed's whole list rises as one view, so a scroll  */
/* or a new cell costs nothing, and at rest the clock never changes, so */
/* the styles never re-run.                                             */
/* ==================================================================== */

export type DockTargetId = 'home' | 'welcome' | 'signin' | 'reset';
export type DockCut = 'full' | 'sm';
/** A destination wordmark's box, in window points, and which cut it draws. */
export interface DockTarget extends Rect {
  id: DockTargetId;
  cut: DockCut;
}

/*
 * The phases. The ground, the film and the flying wordmark read this;
 * the rising groups read only the clock.
 *
 *   FILM      the film plays (and the app at rest, before and after)
 *   DOCK      the flight: the film's ground is gone, the flying wordmark
 *             is up until the hand-off, the destination's wordmark waits
 *   DISSOLVE  a skip before the wordmark is finished: the film fades as
 *             today, the groups rise on the clock, no flight
 *   SETTLE    no destination measured: the flying wordmark lifts and
 *             shrinks a little while the white fades, as today's dissolve
 */
export const PHASE_FILM = 0;
export const PHASE_DOCK = 1;
export const PHASE_DISSOLVE = 2;
export const PHASE_SETTLE = 3;
export type DockPhase = typeof PHASE_FILM | typeof PHASE_DOCK | typeof PHASE_DISSOLVE | typeof PHASE_SETTLE;

/** 1 at rest: every value is the identity. The film runs it 0 to 1 over DOCK_MS. */
export const dockClock = makeMutable(1);
export const dockPhase = makeMutable<DockPhase>(PHASE_FILM);
/** The live destination: the highest-priority measured slot, or null. Read every frame by the flight. */
export const dockTarget = makeMutable<DockTarget | null>(null);

/** The flight's curve: eases off the still frame, peaks around 117 ms, long settle, no overshoot. */
export const DOCK = Easing.bezierFn(0.3, 0, 0, 1);
/** The groups' curve. */
export const RISE = Easing.bezierFn(0.22, 1, 0.36, 1);

/** Milliseconds into the transition, from the clock. */
export function dockT(): number {
  'worklet';
  return dockClock.value * DOCK_MS;
}

export function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** One group's opacity and rise at `t` ms. At t >= start + dur (the clock at rest) it is the identity. */
export function riseStyle(t: number, g: RiseGroup) {
  'worklet';
  const e = RISE(clamp01((t - g.start) / g.dur));
  const o = clamp01((t - g.start) / g.opMs);
  return { opacity: g.opLinear ? o : RISE(o), transform: [{ translateY: (1 - e) * g.dy }] };
}

/** A wrapper's animated style for one group. One per group per screen, never per row. */
export function useRise(group: RiseGroupName) {
  const g = RISE_GROUPS[group];
  return useAnimatedStyle(() => riseStyle(dockClock.value * DOCK_MS, g));
}

/**
 * The destination wordmark's wrapper. While the flight runs to THIS
 * slot it is hidden, and shown in the frame the flying one lands (the
 * hand-off, 600 ms): the two are the same pixels there, so the swap is
 * invisible. A drip-less destination (Smaller Text) cross-fades with the
 * flying full cut over 450 to 600 instead, so the drip fades out rather
 * than vanishing at the hand-off. Any other time (the dissolve, the
 * settle, a slot the flight is not heading to) it rides with the chrome
 * group, which at rest is the identity.
 */
export function useDockSlotStyle(id: DockTargetId) {
  const chrome = RISE_GROUPS.chrome;
  return useAnimatedStyle(() => {
    const t = dockClock.value * DOCK_MS;
    const target = dockTarget.value;
    if (dockPhase.value === PHASE_DOCK && target !== null && target.id === id) {
      const shown =
        target.cut === 'sm' ? clamp01((t - SM_FADE_FROM) / (HANDOFF_MS - SM_FADE_FROM)) : t >= HANDOFF_MS ? 1 : 0;
      return { opacity: shown, transform: [{ translateY: 0 }] };
    }
    return riseStyle(t, chrome);
  });
}

/* -------------------------------------------------------------------- */
/* The registry                                                         */
/* -------------------------------------------------------------------- */

/*
 * Who wins when more than one destination is mounted: an overlay sits
 * above the screen under it, so the order is the root's stacking order.
 *   reset    PasswordResetOverlay draws above everything but the film (a
 *            cold-start reset link plays the film over it).
 *   welcome  FirstRun's onboarding is drawn over the whole Stack (root
 *            _layout, straight after it), so it is above Home's tab, and
 *            on a signed-out first run that tab's AuthGate is already
 *            mounted under it on sign-in's first step, which is a
 *            destination too. The welcome is the one on screen.
 *   signin   Home's (or Profile's) gate, signed out, once the first run
 *            is done or skipped.
 *   home     the feed: the last resort.
 * Order alone is not enough: a covered slot must not register at all,
 * or with the welcome resumed past (no welcome slot) the covered sign-in
 * would win. So every slot is also gated on being visible (useDockTarget's
 * `enabled`): sign-in's while FirstRun is down and its tab is focused,
 * Home's while its tab is focused (a cold-start notification tap pushes
 * a drink page over Home during the film). With nothing visible, the
 * film settles (spec B.6).
 */
const PRIORITY: readonly DockTargetId[] = ['reset', 'welcome', 'signin', 'home'];

// One slot per id. `owner` lets a second instance of the same screen (two gates mounted at once) clear only its own.
const slots = new Map<DockTargetId, { owner: object; target: DockTarget }>();
const waiters = new Set<(target: DockTarget | null) => void>();
const starters = new Set<() => void>();

function top(): DockTarget | null {
  for (const id of PRIORITY) {
    const slot = slots.get(id);
    if (slot) return slot.target;
  }
  return null;
}

function publish() {
  const live = top();
  dockTarget.set(live);
  if (live) for (const resolve of [...waiters]) resolve(live);
}

/** Records (or re-records) a destination's measured box. A box that is not finite or has no size is ignored. */
export function registerDockTarget(target: DockTarget, owner: object = target): void {
  const { x, y, w, h } = target;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
  slots.set(target.id, { owner, target });
  publish();
}

/** On unmount: drops the slot, if it is still this owner's. */
export function clearDockTarget(id: DockTargetId, owner?: object): void {
  const slot = slots.get(id);
  if (!slot || (owner !== undefined && slot.owner !== owner)) return;
  slots.delete(id);
  publish();
}

/** The destination the flight would take now, read on the JS side. */
export function currentDockTarget(): DockTarget | null {
  return top();
}

/**
 * Calls back with the destination as soon as there is one (at once if
 * there is one now), or with null after `ms`. Once only. Returns a cancel.
 */
export function whenDockTarget(ms: number, callback: (target: DockTarget | null) => void): () => void {
  const now = top();
  if (now) {
    callback(now);
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Whichever comes first, a registration or the timer; the other finds it already gone.
  const resolve = (target: DockTarget | null) => {
    if (!waiters.delete(resolve)) return;
    clearTimeout(timer);
    callback(target);
  };
  waiters.add(resolve);
  timer = setTimeout(() => resolve(null), ms);
  return () => {
    if (waiters.delete(resolve)) clearTimeout(timer);
  };
}

/** Subscribes to the film's end: every destination re-measures then. Returns the unsubscribe. */
export function onDockStart(fn: () => void): () => void {
  starters.add(fn);
  return () => {
    starters.delete(fn);
  };
}

/** VideoIntro, at the film's end (or a tap on its still end frame). */
export function fireDockStart(): void {
  for (const fn of [...starters]) fn();
}

/**
 * Measures a destination wordmark and keeps it registered. The ref goes
 * on a plain View that hugs the wordmark (DockSlot's inner view), never
 * on anything that rises: the flight must land on where the wordmark
 * rests, not where a group is passing through.
 *
 * It measures in the window, inside requestAnimationFrame (after the
 * frame's layout), on three triggers:
 *   - onLayout;
 *   - the status bar's inset and the window's size changing. On a
 *     home-button iPhone the film hides the status bar, which hands the
 *     page its 20pt; un-hiding it at the swap moves Home's bar 20pt down
 *     without refiring onLayout (its place in its parent has not
 *     changed). The flight reads the target live every frame, so the
 *     re-measure, a couple of frames into the flight, just redirects the
 *     rest of the path, and by the hand-off the rect is final;
 *   - the film's end (onDockStart).
 * Once the film has gone (lib/intro) nothing can dock again in this
 * runtime, so it stops measuring.
 *
 * `lead`: the wordmark is set left with Wordmark's `lead`, which pulls
 * its box out past its parent's edge by the s's tail. The hugging view
 * then starts at the column, not at the box, and is narrower by the
 * lead, so the box is worked out from the view's height, which is the
 * wordmark's drawn height at every text size: x less the lead, and the
 * width from the aspect.
 *
 * `enabled`: false while the wordmark is mounted but covered (the
 * registry's PRIORITY note). A covered slot is cleared, not just
 * outranked: the flight must never land on a wordmark nobody can see.
 */
export function useDockTarget(
  id: DockTargetId,
  { lead = false, enabled = true }: { lead?: boolean; enabled?: boolean } = {},
) {
  const ref = useRef<View>(null);
  // A stable identity for this instance's slot, made once.
  const [owner] = useState(() => ({}));
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The latest `enabled`, for a measure already queued when the slot was covered.
  const live = useRef(enabled);

  const measure = useCallback(() => {
    if (!enabled || introHasPlayed()) return;
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, _w, h) => {
        if (!live.current) return;
        registerDockTarget(
          {
            id,
            x: lead ? x - WORDMARK_LEAD * h : x,
            y,
            w: h * WORDMARK_ASPECT,
            h,
            cut: h < WORDMARK_SM_BELOW ? 'sm' : 'full',
          },
          owner,
        );
      });
    });
  }, [id, lead, owner, enabled]);

  /*
   * Covered (its tab blurred, FirstRun over it): the slot goes at once,
   * and comes back with a fresh measure when it is uncovered. A measure
   * already queued in its frame when this ran is caught by the check
   * in the measure, which reads the latest `enabled`.
   */
  useEffect(() => {
    live.current = enabled;
    if (!enabled) clearDockTarget(id, owner);
  }, [enabled, id, owner]);

  useEffect(() => {
    measure();
  }, [measure, insets.top, width, height]);
  useEffect(() => onDockStart(measure), [measure]);
  useEffect(() => () => clearDockTarget(id, owner), [id, owner]);

  return { ref, onLayout: measure };
}
