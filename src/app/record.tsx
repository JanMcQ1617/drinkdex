import { setStatusBarStyle } from 'expo-status-bar';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthGate } from '@/components/AuthGate';
import { CameraGate } from '@/components/reels/CameraGate';
import { Recorder, type RecordedClip } from '@/components/reels/Recorder';
import { ReelReview } from '@/components/reels/ReelReview';
import { colors } from '@/constants/theme';
import { REELS_ENABLED } from '@/lib/reels';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* Record a reel                                                        */
/*                                                                      */
/* A full-screen modal (presented from the Reels header's camera and a   */
/* profile's empty Reels tab), in three steps on one screen:            */
/*                                                                      */
/*   gate    permission and the daily limit (CameraGate), once;         */
/*   camera  film it (Recorder);                                        */
/*   review  caption, tag and post (ReelReview).                        */
/*                                                                      */
/* One screen rather than three routes, so the recording stays a local   */
/* file in this screen's state instead of a path in route params. The    */
/* step is the take itself: no take is the camera, a take is its review. */
/* The gate wraps both and stays mounted, so Retake goes straight back   */
/* to the camera.                                                       */
/*                                                                      */
/* Full-screen, not a sheet: a sheet's swipe-down would fight a press    */
/* held to record. Every step has its own way out instead.              */
/* ==================================================================== */

export default function RecordScreen() {
  return REELS_ENABLED ? <GatedRecord /> : <Redirect href="/" />;
}

function GatedRecord() {
  const router = useRouter();
  // Out of this modal, or to the Dex when a link opened it cold, the way a gated push closes.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  };
  return (
    <AuthGate onClose={leave}>
      <RecordFlow onClose={leave} />
    </AuthGate>
  );
}

function RecordFlow({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const [clip, setClip] = useState<RecordedClip | null>(null);

  // Light glyphs on the dark camera, only once signed in (the sign-in screen is paper).
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  /*
   * Posted: back to the Reels tab, where the new reel is first. dismissTo
   * is the one action that does both, popping this modal and selecting the
   * tab; a navigate queued behind a dismiss could be computed before the
   * pop lands and push a second set of tabs over this screen.
   */
  const posted = () => router.dismissTo('/reels');

  if (!myId) return null;

  return (
    <View style={styles.screen}>
      <CameraGate myId={myId} onClose={onClose}>
        {(micGranted) =>
          clip ? (
            <ReelReview
              clip={clip}
              myId={myId}
              onRetake={() => setClip(null)}
              onClose={onClose}
              onPosted={posted}
            />
          ) : (
            <Recorder micGranted={micGranted} onRecorded={setClip} onClose={onClose} />
          )
        }
      </CameraGate>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.reelGround },
});
