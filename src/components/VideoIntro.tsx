import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { SipplyIntro } from '@/components/SipplyIntro';
import { colors } from '@/constants/theme';

/* ==================================================================== */
/* Launch intro — the film                                              */
/*                                                                      */
/* A 5s 1080x1920 H.264 clip generated from the app icon: the wax seal   */
/* on bone paper, merlot flooding up and settling.                      */
/*                                                                      */
/* REDUCED MOTION FALLS BACK TO THE DRAWN INTRO, it does not skip.      */
/* A video has one timeline and cannot soften itself, so honouring the  */
/* setting means not playing it — but launching straight into the Dex   */
/* with no transition is its own jolt. SipplyIntro already reads the    */
/* flag and degrades properly, so the old intro stays in the tree as    */
/* the accessible path rather than being deleted. That is also why this */
/* file did not replace it.                                             */
/*                                                                      */
/* TAP ANYWHERE SKIPS, same as the drawn one. Five seconds is a long    */
/* time to hold someone at the door, and a launch animation with no way */
/* past it is the kind of thing that is charming once and irritating    */
/* the twentieth time.                                                  */
/*                                                                      */
/* H.264 rather than the HEVC Higgsfield returns: a bundled asset       */
/* should not depend on hardware HEVC, and it keeps Android open.       */
/* ==================================================================== */

export function VideoIntro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();

  /* Fires once however it ends — playback finishing, or a tap. */
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

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
   * frame after them.
   */
  useEventListener(player, 'playToEnd', finish);

  if (reduced) return <SipplyIntro onDone={onDone} />;

  return (
    <View style={styles.fill}>
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
    </View>
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
