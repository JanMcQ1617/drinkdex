import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { AppleMusicCredit, SongArtwork, usePreviewPlayer, type PreviewPlayer } from '@/components/songs';
import { Button, EmptyState, haptic, Hold, SearchField, useAnnounce } from '@/components/ui';
import { colors, fonts, layout, space, stroke, textRole } from '@/constants/theme';
import { searchSongs, STORY_MUSIC, type SearchResult, type Song } from '@/lib/music';

/* ==================================================================== */
/* Add music                                                            */
/*                                                                      */
/* The Log window's song picker (specs/v3.1-changes.md 10.2): search    */
/* Apple Music, audition a preview, tap a row to put the song on the    */
/* post's story.                                                        */
/*                                                                      */
/* A React Native page-sheet Modal, so UIKit presents and dismisses it  */
/* (no Reanimated, nothing on the frame loop), over the Log window that */
/* opened it. It carries its own grain: a native sheet is presented     */
/* above the React root.                                                */
/*                                                                      */
/* Previews are user-initiated only, one song at a time, and stop the   */
/* moment the picker closes, a song is chosen, the search changes or    */
/* the Log window loses focus. While one is loaded the foot carries the */
/* link to that song in Apple Music, the link App Review 5.2.5 asks     */
/* for beside any preview.                                              */
/* ==================================================================== */

/** Under two characters nothing is searched: the function refuses it, and one letter finds noise. */
const MIN_TERM = 2;
/** Long enough that a word typed at speed is one search, not one per letter (120 an hour each). */
const DEBOUNCE_MS = 350;

type Failure = Extract<SearchResult, { ok: false }>['reason'];

/** What a failed search says, in the spec's words; `retry` is whether trying again can help now. */
const FAILURE: Record<Failure, { text: string; retry: boolean }> = {
  rate_limited: { text: 'Too many searches. Try again in a few minutes.', retry: false },
  not_configured: { text: 'Music is not available yet.', retry: false },
  offline: { text: 'Could not reach Apple Music. Check your connection and try again.', retry: true },
  failed: { text: 'Could not reach Apple Music. Check your connection and try again.', retry: true },
};

/**
 * The picker. Renders nothing while story music is off, so a build with
 * the flag off cannot reach the search even if a caller forgot to check.
 *
 * `onChoose` gets the song and is expected to close the picker (set
 * `visible` false); the preview is already stopped by then.
 */
export function MusicPicker({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (song: Song) => void;
}) {
  if (STORY_MUSIC === 'off') return null;
  /*
   * No allowSwipeDismissal, on purpose: React Native 0.86 then keeps the
   * sheet modalInPresentation, so a swipe down only asks (onRequestClose)
   * and the sheet leaves when `visible` goes false. Cancel and the swipe
   * take one path, and UIKit never drops a sheet React still shows.
   */
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/*
        Mounted for as long as the Modal renders, so a fresh opening starts
        from an empty search and a closed one releases its player (React
        Native keeps it mounted through the dismiss, then unmounts it).
      */}
      <PickerBody visible={visible} onClose={onClose} onChoose={onChoose} />
    </Modal>
  );
}

function PickerBody({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (song: Song) => void;
}) {
  const insets = useSafeAreaInsets();
  const player = usePreviewPlayer();

  const [query, setQuery] = useState('');
  /** Bumped by "Try again", so the same words search again. */
  const [attempt, setAttempt] = useState(0);
  /** The newest answer received, with the search it answers. */
  const [answer, setAnswer] = useState<{ key: string; result: SearchResult } | null>(null);
  /** Every search takes a number; only the newest one's answer is kept. */
  const seq = useRef(0);
  /** The search `answer` answers, read by the effect without re-running it. */
  const answeredKey = useRef<string | null>(null);

  const term = query.trim();
  const searching = term.length >= MIN_TERM;
  const key = `${attempt}|${term}`;

  useEffect(() => {
    const mine = ++seq.current;
    /*
     * A typo taken back ("adel", "adelw", "adel") lands on the search
     * already on screen: it is shown as it is, not asked again, since
     * every search is charged to the account's hourly budget.
     */
    if (!searching || answeredKey.current === key) return;
    const timer = setTimeout(() => {
      void searchSongs(term).then((result) => {
        // A late answer to an older search never replaces a newer one.
        if (seq.current !== mine) return;
        answeredKey.current = key;
        setAnswer({ key, result });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, searching, term]);

  /*
   * The player's stop(), read through a ref so the blur and close effects
   * below are made once and run only when focus or `visible` changes (the
   * player object is new on every render).
   */
  const stopRef = useRef<PreviewPlayer['stop']>(player.stop);
  useEffect(() => {
    stopRef.current = player.stop;
  });
  // Swiped closed, or closed by the Log window: silent at once, not after the dismiss.
  useEffect(() => {
    if (!visible) stopRef.current();
  }, [visible]);
  // The Log window losing focus takes the preview with it.
  useFocusEffect(useCallback(() => () => stopRef.current(), []));

  const close = () => {
    player.stop();
    onClose();
  };

  const choose = (song: Song) => {
    player.stop();
    haptic.select();
    onChoose(song);
  };

  /*
   * Typing again moves on from the song being auditioned: its row may be
   * about to leave the list, taking its pause control with it. A field
   * cleared below two characters forgets the last answer too, so the next
   * search starts from the hold, not from the old search's songs.
   */
  const onChangeText = (text: string) => {
    if (player.songId !== null) player.stop();
    if (text.trim().length < MIN_TERM) {
      answeredKey.current = null;
      setAnswer(null);
    }
    setQuery(text);
  };

  /* ---- What the list shows ---- */
  const current = searching && answer?.key === key ? answer.result : null;
  const loading = searching && current === null;
  /*
   * While the next search runs, the last one's songs stay up (with a
   * spinner in the field) rather than blanking the list on every pause in
   * typing. Only a first search, or one after a failure, shows the hold.
   */
  const stale = loading && answer?.result.ok && answer.result.songs.length > 0 ? answer.result.songs : null;
  // searchSongs has already left out any song whose title or artist the content filter refuses.
  const songs: Song[] = current?.ok ? current.songs : (stale ?? []);
  const failure = current && !current.ok ? FAILURE[current.reason] : null;
  const noneFound = current?.ok === true && current.songs.length === 0;

  useAnnounce(failure ? failure.text : noneFound ? `No songs for ${term}.` : null);
  useAnnounce(player.state === 'error' ? 'The preview did not play.' : null);

  const playing = player.songId === null ? null : (songs.find((s) => s.id === player.songId) ?? null);

  const empty = !searching ? (
    <EmptyState
      icon="music"
      title="Add a song"
      body="Search Apple Music for a song to go with your post."
    />
  ) : failure ? (
    <View style={styles.message}>
      <Text style={styles.messageText}>{failure.text}</Text>
      {failure.retry ? (
        <Button
          label="Try again"
          variant="secondary"
          size="sm"
          onPress={() => setAttempt((a) => a + 1)}
        />
      ) : null}
    </View>
  ) : noneFound ? (
    <View style={styles.message}>
      <Text style={styles.messageText}>No songs for “{term}”.</Text>
    </View>
  ) : loading && !stale ? (
    <Hold fill={false} slowMessage="Still searching. Apple Music is taking a while to answer." />
  ) : null;

  /*
   * The page sheet's offset from the top of the window, for the keyboard
   * (add-drink does the same): KeyboardAvoidingView compares a sheet-relative
   * frame with the keyboard's window position, so without it the foot
   * stays under the keyboard by the gap above the sheet.
   */
  const { height: windowH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(windowH);

  return (
    <KeyboardAvoidingView
      style={styles.sheet}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheetH : 0}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        setSheetH((prev) => (prev === h ? prev : h));
      }}>
      <Grain />
      {/*
        No status-bar inset on iOS: the page sheet starts below it. Android
        presents a Modal full screen and needs it.
      */}
      <ScreenTopBar
        title="Add music"
        inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}
        showRule
        left={<TopBarTextButton label="Cancel" muted onPress={close} />}
      />
      <SearchField
        value={query}
        onChangeText={onChangeText}
        placeholder="Search songs or artists"
        accessibilityLabel="Search Apple Music"
        autoFocus
        trailing={
          stale ? (
            <ActivityIndicator size="small" color={colors.textMuted} accessibilityLabel="Searching" />
          ) : null
        }
        style={styles.search}
      />
      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <SongRow song={item} player={player} onChoose={() => choose(item)} />
        )}
        // The rows draw the player's state, which is not in `data`.
        extraData={`${player.songId}|${player.state}`}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
      />

      {/*
        The foot: where previews come from, and, while one is loaded, the
        link to that song in Apple Music. Apple's badge replaces the text
        link once Jan adds it (songs.tsx, AppleMusicCredit).
      */}
      <View style={[styles.foot, { paddingBottom: insets.bottom + space.sm }]}>
        <Text style={styles.footText}>Previews from Apple Music</Text>
        {playing ? (
          <AppleMusicCredit
            url={playing.appleMusicUrl}
            tone="paper"
            accessibilityLabel={`Listen to ${playing.title} on Apple Music`}
            onOpen={player.stop}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * One song: its cover, title and "artist · album", and a 44pt preview
 * control at the end. Two controls side by side, not one row with a button
 * inside it, so VoiceOver reaches both: the row chooses the song, the
 * control auditions it. The row answers a press with a fill.
 */
function SongRow({
  song,
  player,
  onChoose,
}: {
  song: Song;
  player: PreviewPlayer;
  onChoose: () => void;
}) {
  const mine = player.songId === song.id;
  const loading = mine && player.state === 'loading';
  const sounding = mine && (player.state === 'playing' || loading);
  const meta = [song.artist, song.album].filter(Boolean).join(' · ');
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onChoose}
        accessibilityRole="button"
        accessibilityLabel={`${song.title} by ${song.artist}`}
        accessibilityHint="Adds it to your post"
        style={({ pressed }) => [styles.rowChoose, pressed && styles.rowPressed]}>
        <SongArtwork url={song.artworkUrl} size={48} />
        <View style={styles.rowText}>
          <Text numberOfLines={2} style={styles.rowTitle}>
            {song.title}
          </Text>
          <Text numberOfLines={2} style={styles.rowMeta}>
            {meta}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => (sounding ? player.pause() : player.play(song))}
        accessibilityRole="button"
        accessibilityLabel={sounding ? 'Pause the preview' : `Play a preview of ${song.title} by ${song.artist}`}
        accessibilityState={{ busy: loading }}
        style={({ pressed }) => [styles.preview, pressed && styles.previewPressed]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Icon name={sounding ? 'pause' : 'play'} size={24} color={colors.text} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  search: { marginHorizontal: layout.gutter, marginTop: space.md, marginBottom: space.sm },
  list: { flexGrow: 1, paddingBottom: space.lg },

  /* A song: edge to edge, a hairline under it, min 64, growing with the text. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: stroke.hair,
    borderBottomColor: colors.line,
  },
  rowChoose: {
    flex: 1,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: layout.gutter,
    paddingRight: space.sm,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.bgSunk },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22, color: colors.text },
  rowMeta: { ...textRole.helper, color: colors.textMuted },
  /* 44 square; its 24pt glyph's right edge lands on the gutter. */
  preview: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: layout.gutter - (layout.hit - 24) / 2,
  },
  previewPressed: { opacity: 0.6 },

  /* A short message where the list would be, with its way out under it. */
  message: {
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingTop: space.xl,
  },
  messageText: { ...textRole.prose, color: colors.textMuted, textAlign: 'center' },

  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.md,
    rowGap: space.xs,
    paddingHorizontal: layout.gutter,
    paddingTop: space.sm,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
  },
  footText: { ...textRole.helper, color: colors.textMuted },
});
