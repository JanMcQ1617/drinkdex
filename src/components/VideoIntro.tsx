import { useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SipplyIntro } from '@/components/SipplyIntro';
import { colors } from '@/constants/theme';

/* ==================================================================== */
/* Launch intro — the film                                              */
/*                                                                      */
/* A 5s 1080x1920 H.264 clip generated from the app icon: the wax seal   */
/* on tan paper (colors.filmPaper, a step darker than the splash's      */
/* bone), merlot flooding up and settling.                              */
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
/* sits under the video is the film's own paper (colors.filmPaper), so  */
/* if the splash does go first it still lands on the film's colour, not */
/* on the cream page. A short timer is the guarantee here as well: a    */
/* clip that never draws a frame must not be able to hold the splash    */
/* up. The seal still jumps from the splash's size to the film's; only  */
/* a re-cut of the clip's opening can remove that.                      */
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
/* IT DISSOLVES OUT, it does not cut. The clip ends on merlot and the   */
/* app's page is cream, so unmounting on the last frame flashed from    */
/* one to the other in a single frame. A short fade to what is          */
/* underneath is the film's version of SipplyIntro's flood.             */
/*                                                                      */
/* NEVER TRUST PLAYBACK ALONE TO END IT — SipplyIntro's rule 2, which   */
/* the film had dropped. expo-video pauses the player when the app goes */
/* to the background and never resumes it, and a clip that fails to     */
/* load never reaches its end; either way the overlay sat on a frozen   */
/* frame. So the film resumes on return, leaves on an error, and a      */
/* plain timer well past its length is the guarantee.                   */
/*                                                                      */
/* H.264 rather than the HEVC Higgsfield returns: a bundled asset       */
/* should not depend on hardware HEVC, and it keeps Android open.       */
/* ==================================================================== */

/** Past the 5.04s clip with room for a slow start; only a stalled film is still up by now. */
const CEILING_MS = 9000;
/** The dissolve to the page. */
const EXIT_MS = 280;
/**
 * How long the splash waits for the film's first frame. A bundled clip
 * decodes well inside this; past it the splash lifts onto the film's
 * paper and the frame arrives under the dissolve or just after it.
 */
const FIRST_FRAME_WAIT_MS = 800;

/**
 * `onVisible` fires once the intro has something on screen for the native
 * splash to dissolve onto — the film's first frame (or, if that frame is
 * slow, the film's paper after FIRST_FRAME_WAIT_MS), or at once for the
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
      p.muted = true;
      p.play();
    },
  );

  /*
   * `playToEnd` rather than polling currentTime: the clip is 5.04s and a
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
        No status bar over the film: its second half is merlot, and the
        app's dark glyphs sit on it at about 3:1 — a smudge across the top
        of a full-bleed frame. It comes back as the dissolve STARTS, not
        after it, because on a home-button iPhone a hidden bar hands the
        page its 20pt back; the page re-lays out under the fading film
        instead of jumping once it is already showing.
      */}
      <StatusBar style="dark" hidden={!leaving} animated />
      <VideoView
        style={styles.fill}
        player={player}
        /* Chrome of any kind on a launch intro reads as a video embed. */
        nativeControls={false}
        /*
         * cover, not contain: the clip is 9:16 and phones are not, so
         * `contain` would letterbox the launch screen in black — on an
         * app whose whole ground is warm bone.
         */
        contentFit="cover"
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
   * The ground shows before the first video frame lands, and is what the
   * splash dissolves onto if its fallback lifts it first. The film's own
   * paper rather than the page's cream: cream there was a bright flash
   * between the bone splash and the tan film, a third ground in half a
   * second. On the dissolve out it fades with the film, so the page is
   * all that is left.
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
