import { CameraView, type CameraType } from 'expo-camera';
import { File } from 'expo-file-system';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { RECORD_HIT, RecordButton } from '@/components/reels/RecordButton';
import { useAppActive } from '@/components/reels/ReelVideo';
import { announce, Button, haptic, MediaIconButton } from '@/components/ui';
import { colors, fonts, layout, radius, space, stroke, tabular, textRole, type as typeScale } from '@/constants/theme';
import { pickCodec, type ReelCodec } from '@/lib/reelMedia';
import { REEL_MAX_BYTES, REEL_MAX_SECONDS, REEL_MIN_MS, REEL_VIDEO_BITRATE, reelSeconds } from '@/lib/reels';

/** What the camera hands to the review step. */
export type RecordedClip = { uri: string; durationMs: number };

/**
 * Deletes local files, quietly: a recording that was discarded or retaken,
 * a poster that is no longer wanted, both once a reel is posted. A file
 * that will not go is left for the next /record, which empties the
 * camera's folder before anything is filmed (pruneCameraCache).
 */
export function discardLocalFiles(...uris: (string | null | undefined)[]): void {
  for (const uri of uris) {
    if (!uri) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone, or the cache sweep will take it.
    }
  }
}

/** A press held this long and released is a hold; anything shorter is a tap that keeps recording. */
const HOLD_MS = 350;
/** When "10 seconds left" is said. */
const WARN_AT_MS = (REEL_MAX_SECONDS - 10) * 1000;
const TOAST_MS = 2500;
const TICK_MS = 250;

const secondsWord = (n: number) => `${n} ${n === 1 ? 'second' : 'seconds'}`;

/** `0:12` for the timer chip. */
function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The camera step of /record: a full-screen preview, the shutter, and
 * close, flip and light over it.
 *
 * ONE SHUTTER, TWO WAYS TO USE IT. Press and hold films until you let go;
 * a quick tap starts a recording that the next tap stops. Which one it was
 * is only known on release, so the recording starts on the press itself
 * and the release decides: held past 350 ms, it stops; shorter, it keeps
 * going until the next press. VoiceOver's double-tap is a quick tap, so a
 * VoiceOver user records in tap mode with nothing special to learn.
 *
 * A recording ends at the shutter, at 30 seconds or 5 MB (the camera stops
 * itself), or when the app leaves the foreground, and what was captured is
 * kept. Under one second is a mis-tap: the file is deleted and the
 * camera stays.
 *
 * Flip is hidden while recording, because the camera API ends a recording
 * when the camera flips; close is hidden so it cannot be hit by a thumb
 * mid-take.
 */
export function Recorder({
  micGranted,
  onRecorded,
  onClose,
}: {
  /** Off: the camera records silently and a chip says so. */
  micGranted: boolean;
  onRecorded: (clip: RecordedClip) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const appActive = useAppActive();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [ready, setReady] = useState(false);
  const [mountFailed, setMountFailed] = useState(false);
  /** Bumped by "Try again" after a failed start: a new key, a new camera session. */
  const [attempt, setAttempt] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  /*
   * What the press logic needs between events. Refs, not state: two
   * touches can land inside one render, and the second must see what the
   * first did.
   */
  const live = useRef({
    recording: false,
    tapMode: false,
    pressedAt: 0,
    startedAt: 0,
    warned: false,
    mounted: true,
    codec: 'avc1' as ReelCodec,
    tick: null as ReturnType<typeof setInterval> | null,
    toast: null as ReturnType<typeof setTimeout> | null,
  });

  // Asked once camera access is granted, which it is by the time this mounts.
  useEffect(() => {
    const state = live.current;
    let alive = true;
    void pickCodec().then((codec) => {
      if (alive) state.codec = codec;
    });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * Leaving the foreground ends a recording and keeps what was captured.
   * The camera's own session also stops (`active` below), which would end
   * it anyway; stopping first makes that the normal path rather than an
   * interruption that rejects.
   */
  useEffect(() => {
    const state = live.current;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && state.recording) cameraRef.current?.stopRecording();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const state = live.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      if (state.tick) clearInterval(state.tick);
      if (state.toast) clearTimeout(state.toast);
    };
  }, []);

  const showToast = (message: string) => {
    const state = live.current;
    if (state.toast) clearTimeout(state.toast);
    setToast(message);
    announce(message);
    state.toast = setTimeout(() => setToast(null), TOAST_MS);
  };

  const endRecording = () => {
    const state = live.current;
    state.recording = false;
    state.tapMode = false;
    if (state.tick) clearInterval(state.tick);
    state.tick = null;
    if (state.mounted) {
      setRecording(false);
      setElapsedMs(0);
    }
  };

  const finished = (result: { uri: string } | undefined) => {
    const state = live.current;
    const durationMs = Math.min(REEL_MAX_SECONDS * 1000, Date.now() - state.startedAt);
    endRecording();
    // Closed mid-take: nothing is going to review it.
    if (!state.mounted) {
      discardLocalFiles(result?.uri);
      return;
    }
    if (!result?.uri) {
      showToast('Recording stopped.');
      return;
    }
    haptic.select();
    if (durationMs < REEL_MIN_MS) {
      discardLocalFiles(result.uri);
      showToast('Hold a little longer — at least 1 second.');
      return;
    }
    announce(`Recorded ${secondsWord(reelSeconds(durationMs))}`);
    onRecorded({ uri: result.uri, durationMs });
  };

  const failed = () => {
    endRecording();
    if (live.current.mounted) showToast('Recording stopped.');
  };

  const start = () => {
    const state = live.current;
    const camera = cameraRef.current;
    if (!ready || state.recording || !camera) return;
    const now = Date.now();
    state.recording = true;
    state.tapMode = false;
    state.warned = false;
    state.pressedAt = now;
    state.startedAt = now;
    if (state.toast) clearTimeout(state.toast);
    setToast(null);
    setRecording(true);
    setElapsedMs(0);
    haptic.tap();
    announce('Recording');

    state.tick = setInterval(() => {
      const ms = Math.min(REEL_MAX_SECONDS * 1000, Date.now() - state.startedAt);
      setElapsedMs(ms);
      if (ms >= WARN_AT_MS && !state.warned) {
        state.warned = true;
        announce('10 seconds left');
      }
    }, TICK_MS);

    /*
     * The codec is what makes iOS honour videoBitrate at all; without one
     * the bitrate prop is ignored and a 30 s take can pass the cap. The
     * resolve covers every way a take ends: stopRecording, maxDuration,
     * maxFileSize, and the session stopping.
     */
    camera
      .recordAsync({ maxDuration: REEL_MAX_SECONDS, maxFileSize: REEL_MAX_BYTES, codec: state.codec })
      .then(finished, failed);
  };

  const stop = () => {
    if (live.current.recording) cameraRef.current?.stopRecording();
  };

  const pressIn = () => {
    const state = live.current;
    if (!state.recording) start();
    else if (state.tapMode) stop();
  };

  const pressOut = () => {
    const state = live.current;
    if (!state.recording || state.tapMode) return;
    if (Date.now() - state.pressedAt >= HOLD_MS) stop();
    else state.tapMode = true;
  };

  const retryCamera = () => {
    setMountFailed(false);
    setReady(false);
    setAttempt((n) => n + 1);
  };

  const top = insets.top + space.sm;

  if (mountFailed) {
    return (
      <View style={[styles.fill, styles.failed]}>
        <Icon name="camera" size={40} color={colors.reelInk} />
        <Text style={[textRole.emptyTitle, styles.failedTitle]} accessibilityRole="header">
          The camera didn&apos;t start
        </Text>
        <Text style={styles.failedBody}>Close any other app that is using the camera, then try again.</Text>
        <View style={styles.failedActions}>
          <Button label="Try again" variant="onDark" block onPress={retryCamera} />
          <Button label="Close" variant="onDarkText" onPress={onClose} />
        </View>
      </View>
    );
  }

  const backCamera = facing === 'back';

  return (
    <View style={styles.fill}>
      <CameraView
        key={attempt}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        mode="video"
        facing={facing}
        // What you saw in the preview is what you get.
        mirror={facing === 'front'}
        mute={!micGranted}
        videoQuality="720p"
        // Honoured only because recordAsync is given a codec.
        videoBitrate={REEL_VIDEO_BITRATE}
        videoStabilizationMode="auto"
        enableTorch={torch && backCamera}
        // The capture session stops whenever nobody can see it.
        active={focused && appActive}
        onCameraReady={() => setReady(true)}
        onMountError={() => setMountFailed(true)}
      />

      {recording ? null : (
        <MediaIconButton
          icon="close"
          label="Close"
          onPress={onClose}
          style={[styles.topLeft, { top }]}
        />
      )}

      <View style={[styles.topRight, { top }]}>
        {recording ? null : (
          <MediaIconButton
            icon="flip"
            label={backCamera ? 'Switch to front camera' : 'Switch to back camera'}
            onPress={() => {
              haptic.select();
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
          />
        )}
        {backCamera ? (
          <MediaIconButton icon="flash" label="Light" selected={torch} onPress={() => setTorch((t) => !t)} />
        ) : null}
      </View>

      {recording ? (
        <View style={[styles.topCentre, { top }]} pointerEvents="none">
          <View style={styles.chip}>
            <View style={styles.recDot} />
            <Text style={styles.timer} maxFontSizeMultiplier={1.3}>
              {clock(elapsedMs)}
            </Text>
          </View>
        </View>
      ) : null}

      {micGranted ? null : (
        <View style={[styles.topCentre, { top: top + layout.hit + space.md }]} pointerEvents="box-none">
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="No sound, the microphone is off"
            accessibilityHint="Opens Settings"
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
            <Icon name="volumeOff" size={16} color={colors.reelInk} />
            <Text style={[styles.chipText, styles.chipTextWrap]} maxFontSizeMultiplier={1.3}>
              No sound — microphone is off
            </Text>
          </Pressable>
        </View>
      )}

      <View
        style={[styles.bottom, { bottom: insets.bottom + space.xl + 42 - RECORD_HIT / 2 }]}
        pointerEvents="box-none">
        {toast ? (
          <Text
            style={styles.hint}
            maxFontSizeMultiplier={1.3}
            accessibilityLiveRegion="polite">
            {toast}
          </Text>
        ) : recording ? null : (
          <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
            Tap or hold to record
          </Text>
        )}
        <RecordButton
          recording={recording}
          elapsedMs={elapsedMs}
          disabled={!ready && !recording}
          onPressIn={pressIn}
          onPressOut={pressOut}
        />
      </View>
    </View>
  );
}

const shadow = {
  textShadowColor: colors.reelTextShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

/*
 * The centred chips keep clear of the button columns at either side: the
 * microphone chip sits level with Light, and at large text sizes on a
 * small phone it would otherwise run under it and take its taps.
 */
const SIDE_CLEAR = space.lg + layout.hit + space.sm;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.reelGround },

  topLeft: { position: 'absolute', left: space.lg },
  topRight: { position: 'absolute', right: space.lg, gap: space.md },
  topCentre: { position: 'absolute', left: SIDE_CLEAR, right: SIDE_CLEAR, alignItems: 'center' },

  chip: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.reelControlBorder,
    backgroundColor: colors.reelControlFill,
  },
  chipPressed: { opacity: 0.8 },
  // Shadowed like all type over the picture: the chip's translucent fill alone is 4.27:1 over white.
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.reelInk, ...shadow },
  chipTextWrap: { flexShrink: 1, paddingVertical: 5 },
  recDot: { width: 6, height: 6, borderRadius: 1, backgroundColor: colors.record },
  timer: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.reelInk,
    ...tabular,
    ...shadow,
  },

  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: space.md },
  hint: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.reelInk,
    textAlign: 'center',
    paddingHorizontal: layout.gutter,
    ...shadow,
  },

  failed: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.gutter },
  failedTitle: { color: colors.reelInk, textAlign: 'center', marginTop: space.lg },
  failedBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.reelInkMuted,
    textAlign: 'center',
    marginTop: space.sm,
  },
  failedActions: { alignSelf: 'stretch', gap: space.md, marginTop: space.xxl },
});
