import { PermissionStatus, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { Button, Hold, MediaIconButton } from '@/components/ui';
import { colors, fonts, layout, space, textRole, type as typeScale } from '@/constants/theme';
import { pruneCameraCache } from '@/lib/reelMedia';
import { COPY, fetchMyReelQuota, sweepOrphanReelFiles, type ReelQuotaRow } from '@/lib/reels';

/*
 * How long the gate waits for the quota before letting the camera open
 * anyway. The answer is only a courtesy (the server refuses a reel past
 * the limit whatever this says), so a slow network must not hold the
 * recorder shut.
 */
const QUOTA_WAIT_MS = 3000;

const HOLD_MESSAGE = 'Still checking camera access.';

/**
 * The first step of /record: permission, and the daily and live limits,
 * before anyone films anything. Renders `children` (the camera and the
 * review) once everything allows it, with whether the microphone may be
 * used.
 *
 * It stays mounted underneath them, so a Retake goes straight back to the
 * camera without asking the server again or emptying the camera's folder
 * a second time. Both of those happen once, when /record opens:
 * `pruneCameraCache` deletes every abandoned recording (nothing has been
 * filmed yet, so every file there is one), and the quota is read.
 *
 * In order:
 *   - the limits: posted today at the day limit, or live at the live limit,
 *     is a stop screen with "Done", in the server's own numbers;
 *   - a folder with more files than its reels account for is swept, quietly
 *     (left by posts that failed after uploading; they count against the
 *     bucket's file rule);
 *   - camera or microphone never asked: the primer, which asks for both;
 *   - camera refused for good: a way to Settings, and the gate re-checks
 *     when the app comes back;
 *   - otherwise the camera. A refused microphone is not a stop: the reel is
 *     filmed silently and the camera says so.
 * A quota call that fails (offline, or migration 019 missing) lets the
 * camera open; the server still enforces.
 */
export function CameraGate({
  myId,
  onClose,
  children,
}: {
  myId: string;
  onClose: () => void;
  children: (micGranted: boolean) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [cam, requestCam, getCam] = useCameraPermissions();
  const [mic, requestMic, getMic] = useMicrophonePermissions();
  /** undefined while asking; null when the call failed. */
  const [quota, setQuota] = useState<ReelQuotaRow | null | undefined>(undefined);
  const [quotaWaitOver, setQuotaWaitOver] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let alive = true;
    /*
     * An answer that arrives after the wait is not used for the decision:
     * by then the camera may be open, and a stop screen replacing it
     * mid-take would be worse than the server's refusal at Post.
     */
    let late = false;
    pruneCameraCache();
    void fetchMyReelQuota().then((q) => {
      // Two files a reel, plus a little slack for an upload under way.
      if (q && q.files > 2 * q.live + 2) void sweepOrphanReelFiles(myId);
      if (alive && !late) setQuota(q);
    });
    const wait = setTimeout(() => {
      late = true;
      if (alive) setQuotaWaitOver(true);
    }, QUOTA_WAIT_MS);
    return () => {
      alive = false;
      clearTimeout(wait);
    };
  }, [myId]);

  // Back from Settings: read both again, so a switch turned on there opens the camera.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getCam();
      void getMic();
    });
    return () => sub.remove();
  }, [getCam, getMic]);

  if (!cam || !mic || (quota === undefined && !quotaWaitOver)) {
    return (
      <View style={styles.fill}>
        <Hold tone="dark" slowMessage={HOLD_MESSAGE} />
        {/*
          The only screen of the gate without a way out of its own, and
          /record is a full-screen modal that cannot be swiped away.
        */}
        <MediaIconButton
          icon="close"
          label="Close"
          onPress={onClose}
          style={[styles.close, { top: insets.top + space.sm }]}
        />
      </View>
    );
  }

  if (quota && quota.posted_today >= quota.day_limit) {
    return (
      <GateScreen
        icon="reels"
        title={COPY.quotaDayTitle(quota.day_limit)}
        body={COPY.quotaDayBody}
        primary={{ label: 'Done', onPress: onClose }}
      />
    );
  }

  if (quota && quota.live >= quota.live_limit) {
    return (
      <GateScreen
        icon="reels"
        title={COPY.quotaLiveTitle(quota.live_limit)}
        body={COPY.quotaLiveBody}
        primary={{ label: 'Done', onPress: onClose }}
      />
    );
  }

  if (cam.granted && mic.status !== PermissionStatus.UNDETERMINED) return <>{children(mic.granted)}</>;

  if (!cam.granted && !cam.canAskAgain) {
    return (
      <GateScreen
        icon="camera"
        title={COPY.primerTitle}
        body="Camera access is off for Sipply."
        primary={{ label: 'Open Settings', onPress: () => void Linking.openSettings() }}
        secondary={{ label: 'Not now', onPress: onClose }}
      />
    );
  }

  /*
   * The camera first, then the microphone, each only if it has not been
   * answered. The microphone is asked even when the camera was granted
   * long ago (for logging a photo): otherwise it would never be asked, the
   * reel would be silent, and Settings would have no switch to turn on.
   */
  const proceed = async () => {
    setAsking(true);
    try {
      const camNow = cam.granted ? cam : await requestCam();
      if (camNow.granted && mic.status === PermissionStatus.UNDETERMINED) await requestMic();
    } finally {
      setAsking(false);
    }
  };

  return (
    <GateScreen
      icon="camera"
      title={COPY.primerTitle}
      body={COPY.primerBody}
      primary={{ label: 'Continue', onPress: () => void proceed(), loading: asking }}
      secondary={{ label: 'Not now', onPress: onClose }}
    />
  );
}

/**
 * One of the gate's stops: a glyph, a title, a sentence, and the way on.
 * Bone on the reels ground, as the camera that follows it is dark; Inter,
 * because a primer is chrome, not the brand's voice.
 */
function GateScreen({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: IconName;
  title: string;
  body: string;
  primary: { label: string; onPress: () => void; loading?: boolean };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.fill, styles.screen]}>
      <Icon name={icon} size={40} color={colors.reelInk} />
      <Text style={[textRole.emptyTitle, styles.title]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        <Button
          label={primary.label}
          variant="onDark"
          block
          loading={primary.loading}
          onPress={primary.onPress}
        />
        {secondary ? <Button label={secondary.label} variant="onDarkText" onPress={secondary.onPress} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.reelGround },
  close: { position: 'absolute', left: space.lg },
  screen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.gutter },
  title: { color: colors.reelInk, textAlign: 'center', marginTop: space.lg },
  body: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.reelInkMuted,
    textAlign: 'center',
    marginTop: space.sm,
  },
  actions: { alignSelf: 'stretch', gap: space.md, marginTop: space.xxl },
});
