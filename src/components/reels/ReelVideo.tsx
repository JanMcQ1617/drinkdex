import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { colors } from '@/constants/theme';

/*
 * One reel's player. The pager mounts it only for the reel on screen and
 * its two neighbours, and unmounts it everywhere when the screen loses
 * focus, so at most three AVPlayers exist and nothing decodes behind
 * another tab. Unmounting is what releases the player: useVideoPlayer owns
 * it.
 *
 * The player's properties are written through the helpers below rather
 * than inline. React Compiler treats what a hook returns as immutable and
 * its lint refuses `player.muted = …` inside a component; a plain function
 * that takes the player is the same write without the false alarm (the
 * same move PressableScale made to `.set()`).
 */

function applyMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

/** Off screen: stopped at the start, and no progress events. */
function rest(player: VideoPlayer) {
  player.pause();
  player.currentTime = 0;
  player.timeUpdateEventInterval = 0;
}

/** On screen but held (a long press, VoiceOver's magic tap, the app in the background): stopped where it is. */
function hold(player: VideoPlayer) {
  player.pause();
}

/** On screen and playing, with progress events for the line under the caption. */
function run(player: VideoPlayer) {
  player.timeUpdateEventInterval = 0.25;
  player.play();
}

/**
 * True while the app is in the foreground. 'inactive' counts as away: it
 * is the app switcher and Control Center, where a reel playing on with
 * sound reads as a bug, and where a recording should stop (the recorder
 * reads this too).
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** How long the reel on screen may show only its poster before a spinner says it is still coming. */
const FIRST_FRAME_WAIT_MS = 600;

export function ReelVideo({
  uri,
  landscape,
  durationMs,
  muted,
  current,
  paused,
  progress,
  onError,
}: {
  /** A signed URL for the reel's video. */
  uri: string;
  /** Letterboxed (contain) instead of cropped (cover). */
  landscape: boolean;
  /** The row's length, for the progress line until the player knows its own. */
  durationMs: number;
  muted: boolean;
  /** The reel on screen. Off screen it waits at its first frame, already buffered: the preload. */
  current: boolean;
  /** On screen but not to play right now. Keeps its place, unlike leaving the screen. */
  paused: boolean;
  /** 0..1 of the way through, for the cell's progress line. Written here, read on the UI thread. */
  progress: SharedValue<number>;
  /** The player gave up. The cell keeps the poster and offers "Try again". */
  onError: () => void;
}) {
  const player = useVideoPlayer({ uri, useCaching: true }, (p) => {
    p.loop = true;
    p.muted = muted;
    // Another app's audio keeps playing while a reel is muted, and ducks while it is not.
    p.audioMixingMode = 'auto';
    // Only the reel on screen reports its time; the two preloads stay quiet.
    p.timeUpdateEventInterval = 0;
  });

  const [status, setStatus] = useState<VideoPlayerStatus>(player.status);
  /*
   * Until the first frame is drawn the view stays transparent over the
   * poster, so a reel never flashes black between its still and its first
   * moving frame. A state flip, not an animation: nothing about seeing the
   * video waits on Reanimated.
   */
  const [framed, setFramed] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    applyMuted(player, muted);
  }, [player, muted]);

  useEffect(() => {
    if (!current) {
      rest(player);
      progress.set(0);
    } else if (paused) {
      hold(player);
    } else {
      run(player);
    }
  }, [player, current, paused, progress]);

  useEffect(() => {
    if (!current || framed) return;
    const t = setTimeout(() => setWaited(true), FIRST_FRAME_WAIT_MS);
    return () => clearTimeout(t);
  }, [current, framed]);

  useEventListener(player, 'statusChange', ({ status: next }) => {
    setStatus(next);
    if (next === 'error') onError();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const total = player.duration > 0 ? player.duration : durationMs / 1000;
    progress.set(total > 0 ? Math.min(1, Math.max(0, currentTime / total)) : 0);
  });

  /*
   * A spinner only for the reel on screen: while its first frame is late,
   * or when it stalls mid-play. The preloads buffer silently.
   */
  const buffering =
    current && !paused && status !== 'error' && ((!framed && waited) || (framed && status === 'loading'));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, !framed && styles.unframed]}
        contentFit={landscape ? 'contain' : 'cover'}
        nativeControls={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => setFramed(true)}
      />
      {buffering ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.reelInk} accessibilityLabel="Loading" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  unframed: { opacity: 0 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
