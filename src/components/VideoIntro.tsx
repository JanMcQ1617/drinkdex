import AsyncStorage from '@react-native-async-storage/async-storage';
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
/* on bone paper, merlot flooding up and settling.                      */
/*                                                                      */
/* ONCE PER INSTALL, not once per cold start. iOS kills a backgrounded  */
/* app freely, so "every cold start" meant most launches, and the drawn */
/* intro had already cut its own tail to 3.35s because a launch screen  */
/* that outstays 3s is felt every single time. The film is a first      */
/* impression: it plays on the first launch and is then remembered.     */
/* The key is versioned by the FILM, not by the app — bump it when the  */
/* clip changes and everyone sees the new one once; an ordinary update  */
/* does not replay it. It is not sped up to fit 3.35s instead: a clip   */
/* that plays once can keep the pacing it was cut with.                 */
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
/* TAP ANYWHERE SKIPS, same as the drawn one. Playing once does not     */
/* make five seconds short: it is still a long time to hold someone at  */
/* the door who opened the app to do something, and a film with no way  */
/* past it turns a first impression into a wait.                        */
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

const SEEN_KEY = 'sipply.intro.v1';

/**
 * Has this install already been shown the intro?
 *
 * An unreadable store answers TRUE, which skips it — the same way round as
 * lib/onboarding.ts. Answering false would turn a one-time film into a
 * five-second toll on every launch, because the write that records it
 * goes through the same broken storage.
 */
export async function hasSeenIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
  } catch {
    return true;
  }
}

/** Failing to record is not fatal: the intro plays once more. */
async function markIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* Worst case it plays again next launch. */
  }
}

/** Past the 5.04s clip with room for a slow start; only a stalled film is still up by now. */
const CEILING_MS = 9000;
/** The dissolve to the page. */
const EXIT_MS = 280;

export function VideoIntro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();

  /*
   * Recorded when the intro ENDS, however it ends, rather than when it
   * starts: a launch killed halfway through the film has not seen it.
   */
  const done = () => {
    void markIntroSeen();
    onDone();
  };

  return reduced ? <SipplyIntro onDone={done} /> : <Film onDone={done} />;
}

function Film({ onDone }: { onDone: () => void }) {
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
  /* The ground shows for the frame before the first video frame lands. */
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
});
