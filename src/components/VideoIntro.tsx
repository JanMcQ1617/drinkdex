import { useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SPLASH_MARK } from '@/components/brand/paths';
import { SipplyIntro } from '@/components/SipplyIntro';
import { colors } from '@/constants/theme';
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
/*   3.50-5.00  the finished wordmark, still, centred, 780 px wide      */
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
/* IT DISSOLVES OUT, it does not cut. The clip ends on the red wordmark */
/* on the white page, the same white as the app's, so the fade-out has  */
/* no ground to flash: only the wordmark dissolves into the screen      */
/* underneath, the film's version of SipplyIntro's closing fade.        */
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
/** The dissolve to the page. */
const EXIT_MS = 280;
/**
 * How long the splash waits for the film's first frame. A bundled clip
 * decodes well inside this; past it the splash lifts onto the film's
 * white ground and the frame arrives under the dissolve or just after it.
 */
const FIRST_FRAME_WAIT_MS = 800;
/** The clip's frame, in film px. */
const FILM_W = 1080;
const FILM_H = 1920;
/** How wide the film draws the splash's 1024 canvas, in film px (centred at 540, 960). */
const FILM_SPLASH_PX = 483;
/** Points per film px: the native splash's width over the film's. */
const FILM_PT = SPLASH_MARK.width / FILM_SPLASH_PX;

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
   */
  return reduced ? (
    <SipplyIntro onDone={onDone} />
  ) : (
    <Film onDone={onDone} onVisible={onVisible} />
  );
}

function Film({ onDone, onVisible }: { onDone: () => void; onVisible: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const screen = useWindowDimensions();
  const filmW = FILM_W * FILM_PT;
  const filmH = FILM_H * FILM_PT;
  const opacity = useSharedValue(1);

  /* Unmounts once, whichever of the dissolve's callback or its timer lands first. */
  const doneRef = useRef(false);
  const done = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  /* Starts the exit once however it ends — the clip finishing, a tap, an error or the ceiling. */
  const leavingRef = useRef(false);
  const finish = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    opacity.set(
      withTiming(0, { duration: EXIT_MS, easing: Easing.out(Easing.quad) }, (ok) => {
        if (ok) runOnJS(done)();
      }),
    );
    setTimeout(done, EXIT_MS + 120);
  }, [done, opacity]);

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

  /*
   * `playToEnd` rather than polling currentTime: the clip is 5.00s and a
   * timer racing that would either cut the last frames or hold a black
   * frame after them. The ceiling below does not race it — it sits well
   * past the clip's length and only matters when playback never finishes.
   */
  useEventListener(player, 'playToEnd', finish);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') finish();
  });

  /*
   * The guarantee. It counts from when the film mounted, not from playback,
   * and an overdue JS timer fires as soon as the app is back in the
   * foreground: a film still paused in the background when it comes due
   * leaves the moment the user returns rather than resuming, and one that
   * resumed late is dissolved away at the ceiling rather than held open.
   */
  useEffect(() => {
    const ceiling = setTimeout(finish, CEILING_MS);
    return () => clearTimeout(ceiling);
  }, [finish]);

  /* The splash's guarantee: the first frame lifts it, or this timer does. */
  useEffect(() => {
    const fallback = setTimeout(onVisible, FIRST_FRAME_WAIT_MS);
    return () => clearTimeout(fallback);
  }, [onVisible]);

  /* A short interruption — a notification, a quick app switch — picks the film up where it paused. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !leavingRef.current) player.play();
    });
    return () => sub.remove();
  }, [player]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  /*
   * accessibilityViewIsModal, so VoiceOver cannot walk past the film into
   * the Stack underneath and read out a screen nobody can see yet; while
   * it plays, the skip button is the only thing it reaches. The flag scopes
   * to this view's native siblings, which is why the film must stay a
   * direct child of RootLayout's fragment, beside the Stack, rather than
   * being wrapped in anything of its own.
   */
  return (
    <Animated.View
      style={[styles.fill, fadeStyle]}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityViewIsModal>
      {/*
        No status bar over the film: the film is a title, one red mark on
        a white field, and a clock and battery over it make it read as a
        screen of the app before the app is there. It comes back as the
        dissolve STARTS, not after it, because on a home-button iPhone a
        hidden bar hands the
        page its 20pt back; the page re-lays out under the fading film
        instead of jumping once it is already showing.
      */}
      <StatusBar style="dark" hidden={!leaving} animated />
      <VideoView
        /*
         * At the splash's scale and centred on the screen, as the splash
         * is (header: FRAME 0 IS THE SPLASH). It may overflow the screen
         * or stop short of it; the white fill around it is the film's
         * own ground either way.
         */
        style={{
          position: 'absolute',
          width: filmW,
          height: filmH,
          left: (screen.width - filmW) / 2,
          top: (screen.height - filmH) / 2,
        }}
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
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel="Skip the intro"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /*
   * The ground shows before the first video frame lands, around the video
   * wherever it stops short of the screen, and is what the splash
   * dissolves onto if its fallback lifts it first. It is the film's own
   * ground, sampled from its frames (colors.filmPaper, exact white), so
   * there is never a second ground. On the dissolve out it fades with the
   * film, onto the page's same white.
   */
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.filmPaper,
  },
});
