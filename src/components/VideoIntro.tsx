import { useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { SPLASH_MARK, WORDMARK_PATH } from '@/components/brand/paths';
import { Wordmark } from '@/components/brand/Wordmark';
import { HOME_RULE_DRAW } from '@/components/details/handoff';
import { SipplyIntro } from '@/components/SipplyIntro';
import { colors } from '@/constants/theme';
import {
  clamp01,
  currentDockTarget,
  DOCK,
  dockClock,
  dockPhase,
  type DockPhase,
  type DockTarget,
  dockTarget,
  fireDockStart,
  PHASE_DISSOLVE,
  PHASE_DOCK,
  PHASE_FILM,
  PHASE_SETTLE,
  whenDockTarget,
} from '@/lib/introDock';
import {
  DOCK_MS,
  EXIT_MS,
  FILM_STILL_S,
  filmPt,
  filmRect,
  filmWordmarkRect,
  HANDOFF_MS,
  RULE_FROM,
  RULE_MS,
  SETTLE_LIFT,
  SETTLE_SCALE,
  SKIP_MS,
  SM_FADE_FROM,
  TARGET_WAIT_MS,
} from '@/lib/introDockPlan';
import { applyMuted } from '@/lib/videoAudio';

/* ==================================================================== */
/* Launch intro — the film                                              */
/*                                                                      */
/* v4.5 "the tag" (20 Oct 2026; built in ~/Projects/sipply-intro/      */
/* d-the-tag from the logo's own generator, specs/v4.5-logo/scribble).  */
/* A 5.00s 1080x1920 60 fps H.264 clip, no audio, Campari on exact      */
/* white (#FFFFFF, colors.filmPaper) on every frame:                    */
/*   0.00-0.35  the splash, held still: the icon's clean s, tilted 9    */
/*              degrees, exactly where and how big the native splash    */
/*              draws it                                                */
/*   0.35-0.99  the s turns upright, shrinks and glides left into its   */
/*              slot as the wordmark's first letter                     */
/*   1.05-2.92  "sipply" is written on in pen order, the way the tag    */
/*              was drawn: i into the first p, the p's, the l running   */
/*              on into the y and its swash                             */
/*   2.95-3.48  the i's dot is dabbed, and the one drip runs down off   */
/*              the swash to its bead                                   */
/*   3.50-5.00  the finished wordmark, still, centred, 660 px wide      */
/* No tagline, no call to action.                                       */
/*                                                                      */
/* EVERY COLD START (Jan, 30 Sep 2026; confirmed 1 Oct 2026). It used   */
/* to play once per install, remembered in AsyncStorage, because iOS    */
/* kills a backgrounded app freely: "every cold start" means most       */
/* launches, a return after iOS has reclaimed the app included, and an  */
/* invite or password-reset link that cold-starts the app waits behind  */
/* the film too. Jan wants the film as the door every time the app is   */
/* opened fresh, knowing that. What keeps it tolerable is that it is    */
/* never forced: tap anywhere skips (below), and a resume from the      */
/* background never replays it, because "this runtime has not played    */
/* it" is the whole test (src/lib/intro.ts holds it, and holds nothing  */
/* on disk). The old install key, sipply.intro.v1, is left behind in    */
/* existing installs: one byte, never read again. The clip is not sped  */
/* up to the drawn intro's 3.35s either: skipping is the answer to its  */
/* length, not a faster cut of a film that was paced to be watched.     */
/*                                                                      */
/* THE SPLASH HANDS STRAIGHT TO THE FILM. On every cold start the       */
/* native splash stays up until the film has drawn its first frame      */
/* and then dissolves onto that frame: the film calls `onVisible` and   */
/* RootLayout lifts the splash. Lifted as soon as the app was ready     */
/* instead, it dissolved onto whatever sat under the film before the    */
/* first decoded frame — one more ground between splash and film. What  */
/* sits under the video is the film's own ground (colors.filmPaper,     */
/* which is the page's white), so if the splash does go first it still  */
/* lands on the film's colour. A short timer is the guarantee here as   */
/* well: a clip that never draws a frame must not be able to hold the   */
/* splash up.                                                           */
/*                                                                      */
/* FRAME 0 IS THE SPLASH. The splash is the Campari s on white, drawn   */
/* 220pt wide (app.json; SPLASH_MARK), and the film opens on that same  */
/* image, held still for 0.35s, longer than the splash's 250ms dissolve */
/* (RootLayout), so the fading splash only ever lies over a still s:    */
/* the dissolve is invisible. That only holds if the film is drawn at   */
/* the splash's scale, so it is NOT cover-fitted: the film draws the    */
/* splash's 1024 canvas as a 483 px square, so the video is sized at    */
/* 220/483 pt per film px (491.9 x 874.5pt) and centred, as the splash  */
/* is. Cover would scale it with the screen's height and match only on  */
/* an 874pt-tall iPhone (about 9% too big on a 16 Pro Max, 24% too      */
/* small on an SE). Where the video stops, the white fill carries on:   */
/* the film's ground is exactly #FFFFFF, so the edge is invisible, and  */
/* the 355pt wordmark fits inside a 375pt SE's width.                   */
/*                                                                      */
/* REDUCED MOTION FALLS BACK TO THE DRAWN INTRO, it does not skip.      */
/* A video has one timeline and cannot soften itself, so honouring the  */
/* setting means not playing it — but launching straight into the Dex   */
/* with no transition is its own jolt. SipplyIntro already reads the    */
/* flag and degrades properly, so the old intro stays in the tree as    */
/* the accessible path rather than being deleted. That is also why this */
/* file did not replace it. The film is its own component so the player */
/* only exists on the motion path; created above the branch, it loaded  */
/* and played the clip unseen underneath the drawn intro.               */
/*                                                                      */
/* TAP ANYWHERE SKIPS, same as the drawn one. Five seconds on every     */
/* cold start is a long time to hold someone at the door who opened the */
/* app to do something, and a film with no way past it turns the        */
/* welcome into a toll.                                                 */
/*                                                                      */
/* IT DOCKS (v4.6, Jan, 23 Oct 2026; specs/v4.6-details/spec.md, B).    */
/* The clip ends on the finished wordmark centred on white, the same    */
/* white as the app's. Instead of dissolving, that wordmark glides and  */
/* shrinks into exactly where the first screen draws its own (Home's    */
/* bar; the welcome; sign-in's first step; the reset), while the app    */
/* rises into place underneath, and on Home the pen then draws the      */
/* stories rule in once. 880 ms after the film:                         */
/*      0  the swap: the film and its ground go, the vector wordmark    */
/*         (mounted with the film, hidden) shows on the same pixels,    */
/*         and every rising group is at 0 on the same white: one UI-    */
/*         thread call, so no frame changes. The status bar comes back. */
/*  0-600  the flight, on DOCK, to the destination as measured live     */
/*160-520  chrome: the keys and the tab bar rise 8pt                    */
/*240-680  the feed rises 16pt                                          */
/*360-780  the stories rise 14pt more                                   */
/*560-880  Home only: the stories rule draws itself in (details/handoff)*/
/*    600  the hand-off: the destination's own wordmark shows, the      */
/*         flying one goes, on identical pixels                         */
/*    880  done: the overlay unmounts                                   */
/* The numbers live in lib/introDockPlan; the clock and the registry    */
/* in lib/introDock; the groups wrap themselves in components/DockRise. */
/*                                                                      */
/* AND IT STILL FALLS BACK TO THE DISSOLVE. With no destination         */
/* measured within 150 ms of the end (a cold-started deep link to a     */
/* drink, an invite), the wordmark settles instead: it lifts 12pt and   */
/* shrinks to 0.94 while the white fades over the old 280 ms, never     */
/* slower than the dissolve was. An error, the ceiling or a stall is    */
/* the plain dissolve, with the Dock's clock left at rest. A skip       */
/* before the wordmark is finished (3.50s) dissolves the film the same  */
/* way, with the app rising under it; a skip on the finished, still     */
/* frame docks from that frame; a tap during the Dock runs its clock    */
/* home over 160 ms, so everything arrives together.                    */
/*                                                                      */
/* NEVER TRUST PLAYBACK ALONE TO END IT — SipplyIntro's rule 2, which   */
/* the film had dropped. expo-video pauses the player when the app goes */
/* to the background and never resumes it, and a clip that fails to     */
/* load never reaches its end; either way the overlay sat on a frozen   */
/* frame. So the film resumes on return, leaves on an error, and a      */
/* plain timer well past its length is the guarantee.                   */
/*                                                                      */
/* H.264 (High, yuv420p, BT.709 limited range, tagged) rather than      */
/* HEVC: a bundled asset should not depend on hardware HEVC, and it     */
/* keeps Android open.                                                  */
/* ==================================================================== */

/** Past the 5.00s clip with room for a slow start; only a stalled film is still up by now. */
const CEILING_MS = 9000;
/** How far past an exit's own length its timer waits before ending it anyway. */
const GRACE_MS = 120;
/**
 * How long the splash waits for the film's first frame. A bundled clip
 * decodes well inside this; past it the splash lifts onto the film's
 * white ground and the frame arrives under the dissolve or just after it.
 */
const FIRST_FRAME_WAIT_MS = 800;
/** Points per film px: the native splash's width over the film's (220/483). */
const FILM_PT = filmPt(SPLASH_MARK.width);
/** The dissolve's curve, today's. */
const EXIT_EASE = Easing.out(Easing.quad);
/** The stories rule's draw-on (Pen's hand-off). */
const RULE_EASE = Easing.out(Easing.cubic);

/**
 * How the film is leaving, if it is:
 *   film      playing (or holding its end frame before a tap)
 *   waiting   ended, giving a destination up to 150 ms to measure
 *   dock      the Dock (lib/introDock): a tap fast-forwards it
 *   rise      a skip before the wordmark was finished: the film dissolves, the app rises
 *   settle    no destination: the wordmark settles as the white fades
 *   dissolve  an error, the ceiling or a stall: today's fade, the clock at rest
 */
type Exit = 'film' | 'waiting' | 'dock' | 'rise' | 'settle' | 'dissolve';

/**
 * `onVisible` fires once the intro has something on screen for the native
 * splash to dissolve onto — the film's first frame (or, if that frame is
 * slow, the film's white ground after FIRST_FRAME_WAIT_MS), or at once for the
 * drawn intro. It may fire more than once; the caller must not care.
 */
export function VideoIntro({ onDone, onVisible }: { onDone: () => void; onVisible: () => void }) {
  const reduced = useReducedMotion();

  /*
   * The drawn intro is drawn on its first render — there is nothing to
   * decode — so the splash can go as soon as it has mounted.
   */
  useEffect(() => {
    if (reduced) onVisible();
  }, [reduced, onVisible]);

  /*
   * onDone goes straight through. RootLayout records the intro as played
   * when it ENDS, however it ends (src/lib/intro.ts), so whatever is
   * waiting for the film to leave (an invite's Alert) waits for this.
   * The drawn intro never touches the Dock's clock, so under Reduce
   * Motion every group and the stories rule are simply drawn.
   */
  return reduced ? (
    <SipplyIntro onDone={onDone} />
  ) : (
    <Film onDone={onDone} onVisible={onVisible} />
  );
}

/**
 * Puts the Dock back at rest, in one UI-thread call. The overlay's fade
 * goes to 0 FIRST: back in PHASE_FILM the film and its white ground read
 * as shown again, and between this frame and React unmounting the
 * overlay they would flash white over the app. Hidden, they cannot.
 */
function restDock(fade: SharedValue<number>) {
  scheduleOnUI(() => {
    'worklet';
    fade.set(0);
    dockPhase.value = PHASE_FILM;
    dockClock.value = 1;
    HOME_RULE_DRAW.value = 1;
  });
}

function Film({ onDone, onVisible }: { onDone: () => void; onVisible: () => void }) {
  /* The status bar comes back as the exit starts (header: the status bar). */
  const [leaving, setLeaving] = useState(false);
  /* Touches reach the app. Not during the Dock: its skip key stays on top for the whole 880 ms. */
  const [passThrough, setPassThrough] = useState(false);
  const { width, height, fontScale } = useWindowDimensions();
  const film = useMemo(() => filmRect(width, height, FILM_PT), [width, height]);
  /* Where the film's end frame draws the wordmark: 300.62 x 185.40 at 44.69, 329.30 on a 390 x 844. */
  const src = useMemo(() => filmWordmarkRect(width, height, FILM_PT, WORDMARK_PATH.viewBox), [width, height]);

  /* The whole overlay's opacity: the dissolve, the settle and a skip's fade. The Dock leaves it at 1. */
  const fade = useSharedValue(1);
  /* Whether this exit ends in the pen's beat: Home only. */
  const beat = useSharedValue(false);
  /* The last destination the flight was heading to, should it unmount mid-flight. */
  const landing = useSharedValue<DockTarget | null>(null);

  const exitRef = useRef<Exit>('film');
  const cancelWait = useRef<(() => void) | null>(null);
  const skipping = useRef(false);

  /* Unmounts once, whichever of the exit's callback or its timer lands first. */
  const doneRef = useRef(false);
  const done = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelWait.current?.();
    restDock(fade);
    onDone();
  }, [onDone, fade]);

  /* Unmounted some other way (a fast refresh): never leave the app hidden under a stopped clock. */
  useEffect(
    () => () => {
      cancelWait.current?.();
      if (!doneRef.current) restDock(fade);
    },
    [fade],
  );

  const player = useVideoPlayer(
    require('../../assets/video/intro.mp4'),
    (p) => {
      p.loop = false;
      /*
       * Muted AND mixing, before play(). This is the player that stopped
       * people's Spotify or Apple Music on every cold start: expo-video
       * starts a player at doNotMix, which activates a non-mixable audio
       * session the moment it plays, even for a muted clip with no audio
       * track (this one has none). applyMuted makes it 'mixWithOthers', so
       * the film plays and the music goes on as if Sipply were not there.
       * lib/videoAudio holds the whole of why.
       */
      applyMuted(p, true);
      p.play();
    },
  );

  /* The film is hidden from the swap on; a skip on its still frame would otherwise play on unseen. */
  const stopFilm = useCallback(() => {
    try {
      player.pause();
    } catch {
      // A player already released by an unmount has nothing to stop.
    }
  }, [player]);

  /*
   * Runs the Dock's clock, 0 to 1 over 880 ms, and with it every rising
   * group in the app. ONE UI-thread call: the phase (which swaps the
   * film's ground for the flying wordmark, or not), the clock's drop to
   * 0 (every group hidden, under the still-opaque film) and the rule's
   * reset land in the same frame, so nothing on screen changes in the
   * frame that matters and nothing mounts in it either. The timer is
   * the guarantee: an animation callback alone never unmounts the film
   * (header: NEVER TRUST PLAYBACK ALONE).
   */
  const runClock = useCallback(
    (phase: DockPhase, home: boolean) => {
      scheduleOnUI(
        (p: DockPhase, b: boolean) => {
          'worklet';
          dockPhase.value = p;
          beat.set(b);
          if (b) HOME_RULE_DRAW.value = 0;
          dockClock.value = 0;
          dockClock.value = withTiming(1, { duration: DOCK_MS, easing: Easing.linear }, (ok) => {
            if (ok) scheduleOnRN(done);
          });
        },
        phase,
        home,
      );
      setTimeout(done, DOCK_MS + GRACE_MS);
    },
    [beat, done],
  );

  /* The film's wordmark flies to the destination's. */
  const dock = useCallback(
    (target: DockTarget) => {
      exitRef.current = 'dock';
      setLeaving(true);
      stopFilm();
      runClock(PHASE_DOCK, target.id === 'home');
    },
    [runClock, stopFilm],
  );

  /* No destination: the wordmark settles while the white fades, and whatever opted in rises. */
  const settle = useCallback(() => {
    exitRef.current = 'settle';
    setLeaving(true);
    setPassThrough(true);
    stopFilm();
    fade.set(withTiming(0, { duration: EXIT_MS, easing: EXIT_EASE }));
    runClock(PHASE_SETTLE, false);
  }, [fade, runClock, stopFilm]);

  /*
   * A skip before the wordmark is finished: there is no finished name on
   * screen to fly, so the film dissolves as it always did, and the
   * destination rises under it on the same clock (its wordmark with the
   * chrome group). On Home the pen's beat still runs.
   */
  const rise = useCallback(() => {
    exitRef.current = 'rise';
    setLeaving(true);
    /*
     * Touches reach the app only once the film has gone. Every group
     * starts at 0, and the keys and the tab bar show from 160 + 64 ms: let
     * through at once, a second tap in that window would press the
     * Tournaments key or a tab nobody can see yet. Until then the skip key takes it, and
     * does nothing (the exit is already under way).
     */
    setTimeout(() => setPassThrough(true), EXIT_MS);
    fade.set(withTiming(0, { duration: EXIT_MS, easing: EXIT_EASE }));
    runClock(PHASE_DISSOLVE, currentDockTarget()?.id === 'home');
  }, [fade, runClock]);

  /*
   * Today's dissolve, for an error, the ceiling or a film paused in the
   * background past it. The Dock's clock stays at rest: whatever is
   * underneath is fully drawn and simply shows through.
   */
  const dissolve = useCallback(() => {
    if (exitRef.current !== 'film' && exitRef.current !== 'waiting') return;
    cancelWait.current?.();
    exitRef.current = 'dissolve';
    setLeaving(true);
    setPassThrough(true);
    fade.set(
      withTiming(0, { duration: EXIT_MS, easing: EXIT_EASE }, (ok) => {
        if (ok) scheduleOnRN(done);
      }),
    );
    setTimeout(done, EXIT_MS + GRACE_MS);
  }, [done, fade]);

  /*
   * The film's end, or a tap on its still end frame. Every destination
   * re-measures now (the swap un-hides the status bar, which can move
   * one), and the flight starts at once if one is already known: Home
   * and the welcome have measured long before the film ends. If none
   * is, the still frame holds for up to 150 ms while one arrives, then
   * settles.
   */
  const endOfFilm = useCallback(() => {
    if (exitRef.current !== 'film') return;
    exitRef.current = 'waiting';
    fireDockStart();
    cancelWait.current = whenDockTarget(TARGET_WAIT_MS, (target) => {
      cancelWait.current = null;
      if (exitRef.current !== 'waiting') return;
      if (target) dock(target);
      else settle();
    });
  }, [dock, settle]);

  /*
   * Tap anywhere. During the Dock it runs the clock home over 160 ms,
   * so every value, the pen's beat included, arrives together. During
   * the film it reads where the clip is, synchronously and before
   * anything else moves: on the finished, still wordmark it docks from
   * that frame; before it, or if the player cannot say (NaN, or a throw
   * from a released player), it dissolves.
   */
  const skip = useCallback(() => {
    const exit = exitRef.current;
    if (exit === 'dock') {
      if (skipping.current) return;
      skipping.current = true;
      scheduleOnUI(() => {
        'worklet';
        dockClock.value = withTiming(1, { duration: SKIP_MS, easing: Easing.out(Easing.quad) }, (ok) => {
          if (ok) scheduleOnRN(done);
        });
      });
      return;
    }
    if (exit !== 'film') return;
    let at = Number.NaN;
    try {
      at = player.currentTime;
    } catch {
      at = Number.NaN;
    }
    if (Number.isFinite(at) && at >= FILM_STILL_S) endOfFilm();
    else rise();
  }, [done, endOfFilm, player, rise]);

  /*
   * `playToEnd` rather than polling currentTime: the clip is 5.00s and a
   * timer racing that would either cut the last frames or hold a black
   * frame after them. The ceiling below does not race it — it sits well
   * past the clip's length and only matters when playback never finishes.
   */
  useEventListener(player, 'playToEnd', endOfFilm);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') dissolve();
  });

  /*
   * The guarantee. It counts from when the film mounted, not from playback,
   * and an overdue JS timer fires as soon as the app is back in the
   * foreground: a film still paused in the background when it comes due
   * leaves the moment the user returns rather than resuming, and one that
   * resumed late is dissolved away at the ceiling rather than held open.
   * A Dock already running has its own timer and is left to it.
   */
  useEffect(() => {
    const ceiling = setTimeout(dissolve, CEILING_MS);
    return () => clearTimeout(ceiling);
  }, [dissolve]);

  /* The splash's guarantee: the first frame lifts it, or this timer does. */
  useEffect(() => {
    const fallback = setTimeout(onVisible, FIRST_FRAME_WAIT_MS);
    return () => clearTimeout(fallback);
  }, [onVisible]);

  /* A short interruption — a notification, a quick app switch — picks the film up where it paused. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && exitRef.current === 'film') player.play();
    });
    return () => sub.remove();
  }, [player]);

  /*
   * The pen signs the page: Home's stories rule (details/handoff) as a
   * pure function of the clock, 560 to 880 ms, eased here so the reader
   * applies no curve. Being the clock's, a fast-forward carries it too.
   */
  useAnimatedReaction(
    () => dockClock.value,
    (clock) => {
      if (!beat.value) return;
      HOME_RULE_DRAW.value = RULE_EASE(clamp01((clock * DOCK_MS - RULE_FROM) / RULE_MS));
    },
  );

  /* Keeps the flight's last heading, so a destination that unmounts mid-flight is still landed on. */
  useAnimatedReaction(
    () => dockTarget.value,
    (target) => {
      if (target !== null) landing.set(target);
    },
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  /* The film's white: gone at the swap in the Dock (the app is on the same white), kept for the settle's fade. */
  const groundStyle = useAnimatedStyle(() => ({ opacity: dockPhase.value === PHASE_DOCK ? 0 : 1 }));
  /* The clip: gone at the swap whenever the vector wordmark takes over its ink. */
  const videoStyle = useAnimatedStyle(() => ({
    opacity: dockPhase.value === PHASE_DOCK || dockPhase.value === PHASE_SETTLE ? 0 : 1,
  }));

  /*
   * The flying wordmark. Hidden through the film; at the swap it is on
   * the film's own box. In the Dock it runs to the destination on DOCK
   * over 600 ms, reading the target LIVE every frame (a re-measure
   * mid-flight redirects the rest of the path), scaled about its top
   * left, uniformly because both boxes share the viewBox, so only ever
   * down and never soft. In the settle it lifts and shrinks about its
   * centre as the overlay fades.
   */
  const flyStyle = useAnimatedStyle(() => {
    const phase = dockPhase.value;
    const t = dockClock.value * DOCK_MS;
    if (phase === PHASE_SETTLE) {
      const s = 1 - fade.value;
      const k = 1 - (1 - SETTLE_SCALE) * s;
      return {
        opacity: 1,
        transform: [
          { translateX: ((1 - k) * src.w) / 2 },
          { translateY: ((1 - k) * src.h) / 2 - SETTLE_LIFT * s },
          { scale: k },
        ],
      };
    }
    const to = dockTarget.value ?? landing.value;
    if (phase !== PHASE_DOCK || to === null) {
      return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    }
    const p = DOCK(Math.min(t / HANDOFF_MS, 1));
    const shown =
      to.cut === 'sm' ? 1 - clamp01((t - SM_FADE_FROM) / (HANDOFF_MS - SM_FADE_FROM)) : t < HANDOFF_MS ? 1 : 0;
    return {
      opacity: shown,
      transform: [
        { translateX: (to.x - src.x) * p },
        { translateY: (to.y - src.y) * p },
        { scale: 1 + (to.w / src.w - 1) * p },
      ],
    };
  });

  /*
   * accessibilityViewIsModal, so VoiceOver cannot walk past the film into
   * the Stack underneath and read out a screen nobody can see yet; while
   * it plays, the skip button is the only thing it reaches. It holds
   * until the Dock is done. The flag scopes to this view's native
   * siblings, which is why the film must stay a direct child of
   * RootLayout's fragment, beside the Stack, rather than being wrapped in
   * anything of its own.
   */
  return (
    <Animated.View
      style={[styles.fill, fadeStyle]}
      pointerEvents={passThrough ? 'none' : 'auto'}
      accessibilityViewIsModal>
      {/*
        No status bar over the film: the film is a title, one red mark on
        a white field, and a clock and battery over it make it read as a
        screen of the app before the app is there. It comes back as the
        exit STARTS, not after it, because on a home-button iPhone a
        hidden bar hands the page its 20pt back; the page re-lays out
        under the leaving film instead of jumping once it is already
        showing, and the Dock's destination re-measures and the flight
        follows it (lib/introDock, useDockTarget).
      */}
      <StatusBar style="dark" hidden={!leaving} animated />
      <Animated.View pointerEvents="none" style={[styles.fill, styles.ground, groundStyle]} />
      {/*
        At the splash's scale and centred on the screen, as the splash
        is (header: FRAME 0 IS THE SPLASH). It may overflow the screen
        or stop short of it; the white ground around it is the film's
        own either way.
      */}
      <Animated.View
        pointerEvents="none"
        style={[styles.film, { left: film.x, top: film.y, width: film.w, height: film.h }, videoStyle]}>
        <VideoView
          style={styles.fill}
          player={player}
          /* Chrome of any kind on a launch intro reads as a video embed. */
          nativeControls={false}
          /* The view is the clip's own 9:16, so nothing is cropped or letterboxed. */
          contentFit="fill"
          allowsPictureInPicture={false}
          /*
           * Lifts the splash. It can fire again when the video track
           * changes; lifting an already-lifted splash does nothing.
           */
          onFirstFrameRender={onVisible}
        />
      </Animated.View>
      {/*
        The flying wordmark, mounted with the film and driven only by
        shared values, so the swap mounts nothing. Drawn by <Wordmark>,
        the logo's one painter (check-design rule 17), at the film's box
        exactly: its height is divided by the text size and its cap set
        to it, which cancels Wordmark's Larger Text growth, so it is the
        full cut at 185pt on every phone and at every text size. Hidden
        from VoiceOver, left alone by Smart Invert (Wordmark).
      */}
      <Animated.View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.fly, { left: src.x, top: src.y, width: src.w, height: src.h }, flyStyle]}>
        <Wordmark height={src.h / fontScale} cap={fontScale} accessible={false} />
      </Animated.View>
      <Pressable
        style={styles.fill}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel="Skip the intro"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  /*
   * The ground shows before the first video frame lands, around the video
   * wherever it stops short of the screen, and is what the splash
   * dissolves onto if its fallback lifts it first. It is the film's own
   * ground, sampled from its frames (colors.filmPaper, exact white), so
   * there is never a second ground. In the Dock it goes at the swap,
   * onto the page's same white; in a dissolve it fades with the film.
   */
  ground: { backgroundColor: colors.filmPaper },
  film: { position: 'absolute' },
  /* Scaled about its top left, so the box's corner runs straight to the destination's. */
  fly: { position: 'absolute', transformOrigin: 'top left' },
});
