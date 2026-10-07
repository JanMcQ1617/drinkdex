import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { Icon } from '@/components/icons';
import { colors, fonts, radius } from '@/constants/theme';

/* ==================================================================== */
/* A song on a story                                                    */
/*                                                                      */
/* The pieces the story viewer and the Log sheet's music picker share   */
/* (specs/v3.1-changes.md section 2.9): one audio-only preview player,  */
/* the session's mute choice, the cover art, and the Apple Music        */
/* credit that must sit beside any preview that can play (App Review    */
/* 5.2.5).                                                              */
/*                                                                      */
/* NO NEW NATIVE MODULE. Previews play through expo-video, already in   */
/* the binary for Reels and the intro. AVPlayer plays audio with no     */
/* layer attached, so no VideoView is mounted. If a Release build ever  */
/* proves silent, the one-line fix is a 1x1 VideoView (accessible       */
/* false, nativeControls false, pointerEvents none) beside the control  */
/* that plays it.                                                       */
/*                                                                      */
/* Cover art and song names are shown only with playback: on the tag   */
/* and the picker rows, never in a share image or a thumbnail (App      */
/* Review 4.5.2). Nothing here sits over a photograph, so nothing here  */
/* needs `onMedia`: on the viewer's dark footer the inks are reelInk    */
/* and reelInkMuted, on paper text and textMuted.                       */
/*                                                                      */
/* This file imports nothing from lib/music: `SongLike` is structural,  */
/* and the `Song` that file defines satisfies it.                       */
/* ==================================================================== */

/** What the song UI needs of a song. `Song` (types.ts, lib/music.ts) satisfies it. */
export interface SongLike {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  previewUrl: string;
  appleMusicUrl: string;
}

/* ==================================================================== */
/* Mute                                                                 */
/* ==================================================================== */

interface StoryAudio {
  muted: boolean;
  setMuted(muted: boolean): void;
}

/**
 * The viewer's mute choice, for this app session: not persisted, so a new
 * launch starts with sound, as a story with a song is meant to be heard.
 * Shared by every preview player, so muting one story mutes the next.
 */
export const useStoryAudio: UseBoundStore<StoreApi<StoryAudio>> = create<StoryAudio>()((set) => ({
  muted: false,
  setMuted: (muted) => set({ muted }),
}));

/* ==================================================================== */
/* The preview player                                                   */
/* ==================================================================== */

export type PreviewState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface PreviewPlayer {
  state: PreviewState;
  /** The song loaded into the player, or null once stopped. */
  songId: string | null;
  /** Loads `song`'s preview when it is not the one loaded, then plays it (from the top once it has ended). */
  play(song: SongLike): void;
  pause(): void;
  /** Pauses and forgets the song. The caller stops it on blur and before opening Apple Music. */
  stop(): void;
  muted: boolean;
  setMuted(muted: boolean): void;
}

/*
 * The player's properties are written through these plain functions, not
 * inline: React Compiler treats what a hook returns as immutable and its
 * lint refuses `player.muted = …` in a component (ReelVideo does the same).
 */

/**
 * One play per tap (no loop); other apps' audio is left alone while muted;
 * nothing plays on in the background, and nothing reaches the lock screen.
 */
function configure(player: VideoPlayer) {
  player.loop = false;
  player.audioMixingMode = 'auto';
  player.staysActiveInBackground = false;
  player.showNowPlayingNotification = false;
  player.muted = useStoryAudio.getState().muted;
}

function applyMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

function rewind(player: VideoPlayer) {
  player.currentTime = 0;
}

/**
 * Pause, for a caller that may be unmounting: a stop() in a blur or unmount
 * cleanup can run after useVideoPlayer has released the player, and a call
 * on a released player throws. Paused or released, the preview is silent.
 */
function hush(player: VideoPlayer) {
  try {
    player.pause();
  } catch {
    // Already released.
  }
}

/**
 * One expo-video player used for audio only (no VideoView), for a 30-second
 * Apple Music preview. Released by useVideoPlayer when the caller unmounts.
 *
 * `state` is worked out from the player's own events, never from a timer:
 * `loading` from the moment play() is asked until the player says it is
 * playing, `ended` after it plays to the end, `error` when the source
 * fails. Every play() takes a ticket, so a song still loading when the
 * caller pauses, stops or picks another never starts behind their back.
 */
export function usePreviewPlayer(): PreviewPlayer {
  const player = useVideoPlayer(null, configure);
  const muted = useStoryAudio((s) => s.muted);
  const setStoreMuted = useStoryAudio((s) => s.setMuted);

  const [songId, setSongId] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoPlayerStatus>(player.status);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  /** play() was asked and the player has not started yet. */
  const [waiting, setWaiting] = useState(false);

  // Read synchronously by play(), so two taps in one frame agree on what is loaded.
  const loaded = useRef<string | null>(null);
  // The load still in flight for `loaded`, so a play → pause → play inside it waits for the item.
  const pending = useRef<Promise<void> | null>(null);
  const endedNow = useRef(false);
  const ticket = useRef(0);

  useEffect(() => {
    applyMuted(player, muted);
  }, [player, muted]);

  useEventListener(player, 'statusChange', ({ status: next }) => {
    setStatus(next);
    if (next === 'error') setWaiting(false);
  });
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    setPlaying(isPlaying);
    if (isPlaying) {
      endedNow.current = false;
      setEnded(false);
      setWaiting(false);
    }
  });
  useEventListener(player, 'playToEnd', () => {
    endedNow.current = true;
    setEnded(true);
    setWaiting(false);
  });

  const play = (song: SongLike) => {
    const mine = ++ticket.current;
    setWaiting(true);
    if (loaded.current === song.id && status !== 'error') {
      if (pending.current) {
        // Still loading (a pause landed inside the load): play once the item is in, if nothing else was asked.
        pending.current.then(
          () => {
            if (ticket.current === mine) player.play();
          },
          () => {
            // The first play()'s own handler stands down (its ticket is old), so this one reports the failure.
            if (ticket.current !== mine) return;
            setStatus('error');
            setWaiting(false);
          },
        );
        return;
      }
      if (endedNow.current) rewind(player);
      endedNow.current = false;
      setEnded(false);
      player.play();
      return;
    }
    // Silence the old song first, so a superseded load never plays by itself on the player's old rate.
    if (loaded.current !== null) hush(player);
    loaded.current = song.id;
    endedNow.current = false;
    setSongId(song.id);
    setEnded(false);
    setStatus('loading');
    const load = player.replaceAsync({ uri: song.previewUrl });
    pending.current = load;
    load.then(
      () => {
        if (pending.current === load) pending.current = null;
        if (ticket.current === mine) player.play();
      },
      () => {
        if (pending.current === load) pending.current = null;
        if (ticket.current !== mine) return;
        setStatus('error');
        setWaiting(false);
      },
    );
  };

  const pause = () => {
    ticket.current++;
    setWaiting(false);
    hush(player);
  };

  const stop = () => {
    ticket.current++;
    loaded.current = null;
    pending.current = null;
    endedNow.current = false;
    setSongId(null);
    setWaiting(false);
    setEnded(false);
    hush(player);
    // Drop the item too, so a stopped preview holds no buffer. A failure here changes nothing the caller sees.
    try {
      player.replaceAsync(null).catch(() => {});
    } catch {
      // Already released.
    }
  };

  const state: PreviewState =
    songId === null
      ? 'idle'
      : status === 'error'
        ? 'error'
        : playing
          ? 'playing'
          : ended
            ? 'ended'
            : waiting
              ? 'loading'
              : 'paused';

  return { state, songId, play, pause, stop, muted, setMuted: setStoreMuted };
}

/* ==================================================================== */
/* Cover art                                                            */
/* ==================================================================== */

/**
 * A song's cover: 32pt on the story's song tag, 48pt on a picker row, at
 * the badge corner (4pt), decoded at that size (enforceEarlyResizing).
 * The music glyph on bgSunk is drawn underneath, so it is what shows
 * while the art loads, when it fails, and when a song has none.
 * Decorative: the row or tag beside it names the song.
 */
export function SongArtwork({ url, size }: { url: string | null; size: 32 | 48 }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.art, { width: size, height: size }]}>
      <Icon name="music" size={size === 32 ? 18 : 24} color={colors.textFaint} />
      {url ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          enforceEarlyResizing
          transition={120}
          accessible={false}
        />
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* The Apple Music credit                                               */
/* ==================================================================== */

const CREDIT = 'Listen on Apple Music';

/**
 * Only an Apple Music song page is opened. The server stores nothing else
 * (post_photos_music_shape), and this is another person's row, so the app
 * checks again rather than open whatever a link says.
 */
const APPLE_MUSIC_LINK = /^https:\/\/music\.apple\.com\//;

/**
 * "Listen on Apple Music", linking to the song in Apple Music: the link
 * App Review 5.2.5 asks for beside any playable preview. Always on screen
 * with the preview it credits, in the viewer and in the picker.
 *
 * A text link (Inter Medium 13/18) until Jan adds Apple's badge
 * (assets/images/apple-music-badge-white.png and -black.png); then this
 * swaps to the badge, which must land before the music flag goes on. The
 * text is enough for a build that ships with the flag off.
 *
 * `tone` is the ground: 'dark' is the viewer's reelGround footer (reelInk),
 * 'paper' the picker (text). `accessibilityLabel` names the song for
 * VoiceOver ("Listen to Golden Hour on Apple Music"). `onOpen` runs just
 * before Apple Music opens: stop the preview there. Its 18pt line reaches
 * 44 with hitSlop, so it sits on its own line without a taller row.
 */
export function AppleMusicCredit({
  url,
  tone,
  accessibilityLabel,
  onOpen,
}: {
  url: string;
  tone: 'paper' | 'dark';
  accessibilityLabel?: string;
  onOpen?: () => void;
}) {
  const ink = tone === 'dark' ? colors.reelInk : colors.text;
  const words = (
    <Text maxFontSizeMultiplier={1.3} style={[styles.credit, { color: ink }]}>
      {CREDIT}
    </Text>
  );
  if (!APPLE_MUSIC_LINK.test(url)) return words;
  return (
    <Pressable
      onPress={() => {
        onOpen?.();
        Linking.openURL(url).catch(() => {});
      }}
      hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? CREDIT}
      accessibilityHint="Opens Apple Music"
      style={({ pressed }) => [styles.creditTap, pressed && styles.pressed]}>
      {words}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  art: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radius.badge,
    backgroundColor: colors.bgSunk,
  },
  credit: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  creditTap: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.5 },
});
