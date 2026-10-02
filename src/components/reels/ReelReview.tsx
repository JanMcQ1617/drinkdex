import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { DrinkTagSheet } from '@/components/reels/DrinkTagSheet';
import { discardLocalFiles, type RecordedClip } from '@/components/reels/Recorder';
import {
  announce,
  Button,
  Field,
  haptic,
  MediaIconButton,
  Notice,
  ProgressBar,
} from '@/components/ui';
import { colors, dexNumber, fonts, layout, radius, space, stroke } from '@/constants/theme';
import { formatDexNumber, getDrink } from '@/data';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import { makePoster } from '@/lib/reelMedia';
import {
  COPY,
  fetchMyReelQuota,
  postReel,
  REEL_CAPTION_MAX,
  REEL_DAY_LIMIT,
  REEL_LIVE_LIMIT,
} from '@/lib/reels';
import { toProfile } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useReels } from '@/store/reels';
import type { UserProfile } from '@/types';

/** The caption's character count shows from here on. */
const COUNT_FROM = 250;

/* Player writes live outside the component; see the note in ReelVideo. */
function setLooping(player: VideoPlayer) {
  player.loop = true;
  player.play();
}
function applyMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

type Poster = { uri: string; landscape: boolean };

/**
 * The review step of /record: the take playing on a loop with its sound,
 * a caption, an optional Dex tag, and Retake or Post.
 *
 * The camera is unmounted by now (record.tsx swaps it out), which ends the
 * capture session, so the take plays from the speaker rather than the
 * earpiece the session had routed audio to.
 *
 * THE POSTER IS MADE HERE, WHILE YOU WRITE. A frame half a second in,
 * re-encoded as a plain JPEG (lib/reelMedia), and its shape says whether
 * the take was filmed sideways. Post waits for it ("Preparing…"), which in
 * practice is over before a caption is typed; if it cannot be made at all,
 * the take cannot be posted and the screen says to retake it.
 *
 * Posting keeps the files on the phone until the server has the reel, so a
 * failed attempt is retried without filming again; they are deleted once
 * it is up, or when the take is discarded.
 */
export function ReelReview({
  clip,
  myId,
  onRetake,
  onClose,
  onPosted,
}: {
  clip: RecordedClip;
  myId: string;
  /** Back to the camera. The take's files are already deleted. */
  onRetake: () => void;
  /** Leave /record. The take's files are already deleted. */
  onClose: () => void;
  /** The reel is up and in the feed's store. */
  onPosted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const profile = useAuth((s) => s.profile);
  const player = useVideoPlayer({ uri: clip.uri }, setLooping);

  const [muted, setMuted] = useState(false);
  const [poster, setPoster] = useState<Poster | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [caption, setCaption] = useState('');
  const [drinkId, setDrinkId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  /** Whole percent of the video's bytes sent. */
  const [sent, setSent] = useState(0);
  const [serverRefusedCaption, setServerRefusedCaption] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  /** A quota said no: posting again today, or before deleting one, cannot work. */
  const [capped, setCapped] = useState(false);

  /* The upload in flight, so Cancel and Close can stop it; and whether anyone is still here to answer. */
  const flight = useRef<{ controller: AbortController | null; mounted: boolean }>({
    controller: null,
    mounted: true,
  });

  useEffect(() => {
    const state = flight.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
    };
  }, []);

  useEffect(() => {
    applyMuted(player, muted);
  }, [player, muted]);

  /*
   * The poster, once the take has loaded (a frame cannot be read before).
   * A poster that arrives after the screen has gone is deleted rather than
   * left in the cache.
   */
  useEffect(() => {
    let alive = true;
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      makePoster(player, clip.durationMs).then(
        (made) => {
          if (alive) setPoster(made);
          else discardLocalFiles(made.uri);
        },
        () => {
          if (alive) setPosterFailed(true);
        },
      );
    };
    if (player.status === 'readyToPlay') begin();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') begin();
      else if (status === 'error' && alive) setPosterFailed(true);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [player, clip.durationMs]);

  const drink = getDrink(drinkId);
  const trimmed = caption.trim();
  const objectionable = containsObjectionable(trimmed) || serverRefusedCaption;
  const preparing = !poster && !posterFailed;

  const toggleMute = () => {
    Keyboard.dismiss();
    setMuted((m) => !m);
  };

  const discard = () => {
    discardLocalFiles(clip.uri, poster?.uri);
  };

  const confirmDiscard = (then: () => void) => {
    Alert.alert(COPY.discardTitle, undefined, [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discard();
          then();
        },
      },
    ]);
  };

  const close = () => {
    if (!posting) {
      confirmDiscard(onClose);
      return;
    }
    Alert.alert('Stop posting?', undefined, [
      { text: 'Keep posting', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          flight.current.controller?.abort();
          discard();
          onClose();
        },
      },
    ]);
  };

  const me = (): UserProfile =>
    profile && profile.id === myId
      ? toProfile(profile)
      : { id: myId, username: 'you', displayName: 'You', accent: colors.wineSoft, joinedAt: '' };

  const post = async () => {
    if (!poster || posting || capped) return;
    if (containsObjectionable(trimmed)) {
      announce(OBJECTIONABLE_MESSAGE);
      return;
    }
    Keyboard.dismiss();
    const controller = new AbortController();
    const state = flight.current;
    state.controller = controller;
    setPosting(true);
    setSent(0);
    setPostError(null);

    const outcome = await postReel({
      myId,
      videoUri: clip.uri,
      posterUri: poster.uri,
      caption: trimmed,
      drinkId,
      durationMs: clip.durationMs,
      landscape: poster.landscape,
      signal: controller.signal,
      onProgress: (fraction) => {
        const pct = Math.round(fraction * 100);
        if (state.mounted) setSent((p) => (p === pct ? p : pct));
      },
    });
    state.controller = null;

    /*
     * A reel that went up is put in the feed and its files deleted even if
     * the screen was closed meanwhile (Stop arrived after the insert had
     * left, which postReel does not race): it is posted, and the feed
     * should say so.
     */
    if (outcome.status === 'ok') {
      discardLocalFiles(clip.uri, poster.uri);
      useReels.getState().prepend(outcome.reel, me());
      if (!state.mounted) return;
      haptic.success();
      announce('Posted.');
      onPosted();
      return;
    }
    if (!state.mounted) return;
    setPosting(false);

    switch (outcome.status) {
      case 'objectionable':
        setServerRefusedCaption(true);
        announce(OBJECTIONABLE_MESSAGE);
        return;
      case 'quota_day':
      case 'quota_total': {
        setCapped(true);
        const day = outcome.status === 'quota_day';
        const q = await fetchMyReelQuota();
        Alert.alert(
          day ? COPY.quotaDayTitle(q?.day_limit ?? REEL_DAY_LIMIT) : COPY.quotaLiveTitle(q?.live_limit ?? REEL_LIVE_LIMIT),
          day ? COPY.quotaDayBody : COPY.quotaLiveBody,
        );
        return;
      }
      case 'too_large':
        setPostError(COPY.tooLarge);
        return;
      case 'cancelled':
        // Back to the review as it was. Nothing is on the server.
        return;
      default:
        // The files stay, so Post tries again without filming again.
        setPostError(COPY.postFailed);
    }
  };

  const postLabel = posting ? `Posting ${sent}%` : preparing ? 'Preparing…' : 'Post';
  const spokenPost = posting ? `Posting, ${Math.floor(sent / 10) * 10} percent` : undefined;

  return (
    <View style={styles.fill}>
      <Pressable
        onPress={toggleMute}
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="button"
        accessibilityLabel={COPY.reviewLabel(clip.durationMs)}
        accessibilityHint="Double-tap to mute or unmute."
        accessibilityState={{ selected: muted }}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          // Filmed sideways: shown whole on the dark ground, not cropped to a sliver.
          contentFit={poster?.landscape ? 'contain' : 'cover'}
          nativeControls={false}
          allowsPictureInPicture={false}
          pointerEvents="none"
        />
      </Pressable>

      <MediaIconButton
        icon="close"
        label="Close"
        onPress={close}
        style={[styles.topLeft, { top: insets.top + space.sm }]}
      />
      <MediaIconButton
        icon={muted ? 'volumeOff' : 'volume'}
        label={muted ? 'Unmute' : 'Mute'}
        onPress={toggleMute}
        style={[styles.topRight, { top: insets.top + space.sm }]}
      />

      <KeyboardAvoidingView behavior="padding" style={styles.panelWrap} pointerEvents="box-none">
        <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
          <Field
            label="Caption"
            value={caption}
            onChangeText={(text) => {
              setCaption(text);
              setServerRefusedCaption(false);
            }}
            multiline
            maxLength={REEL_CAPTION_MAX}
            autoCapitalize="sentences"
            autoCorrect
            editable={!posting}
            error={objectionable ? OBJECTIONABLE_MESSAGE : null}
            hint={caption.length >= COUNT_FROM ? `${caption.length} of ${REEL_CAPTION_MAX}` : undefined}
          />

          <View style={styles.tagRow}>
            <Pressable
              onPress={() => setSheetOpen(true)}
              disabled={posting}
              accessibilityRole="button"
              accessibilityLabel={drink ? `Tagged ${drink.name}. Change the drink` : 'Tag a drink'}
              accessibilityHint={drink ? undefined : 'Optional. Links your reel to its Dex entry.'}
              style={({ pressed }) => [styles.tagMain, pressed && styles.tagPressed]}>
              {drink ? (
                <>
                  <DrinkArt drink={drink} size={28} flat />
                  <Text style={styles.tagName} numberOfLines={1}>
                    {drink.name}
                  </Text>
                  <Text style={dexNumber}>{formatDexNumber(drink.dexNumber)}</Text>
                </>
              ) : (
                <>
                  <Icon name="bottle" size={20} color={colors.textMuted} />
                  <Text style={styles.tagEmpty} numberOfLines={1}>
                    Tag a drink
                  </Text>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </>
              )}
            </Pressable>
            {drink && !posting ? (
              <Pressable
                onPress={() => setDrinkId(null)}
                accessibilityRole="button"
                accessibilityLabel="Remove drink tag"
                style={({ pressed }) => [styles.tagClear, pressed && styles.glyphPressed]}>
                <Icon name="close" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {posting ? <ProgressBar value={sent} max={100} height={2} /> : null}

          {posterFailed ? <Notice tone="error">{COPY.posterFailed}</Notice> : null}
          {postError ? <Notice tone="error">{postError}</Notice> : null}

          <View style={styles.buttons}>
            <Button
              label={posting ? 'Cancel' : 'Retake'}
              variant="secondary"
              block
              style={styles.button}
              onPress={
                posting ? () => flight.current.controller?.abort() : () => confirmDiscard(onRetake)
              }
            />
            <Button
              label={postLabel}
              variant="primary"
              block
              style={styles.button}
              loading={posting || preparing}
              disabled={posterFailed || capped || objectionable}
              accessibilityLabel={spokenPost}
              onPress={() => void post()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <DrinkTagSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={(picked) => {
          setDrinkId(picked.id);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.reelGround },
  topLeft: { position: 'absolute', left: space.lg },
  topRight: { position: 'absolute', right: space.lg },

  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderTopWidth: stroke.edge,
    borderColor: colors.line,
    paddingTop: space.lg,
    paddingHorizontal: layout.gutter,
    gap: space.md,
  },

  tagRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: stroke.edge,
    borderColor: colors.line,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  tagMain: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  tagPressed: { backgroundColor: colors.bgSunk },
  tagEmpty: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.text },
  tagName: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20, color: colors.text },
  tagClear: { width: layout.hit, height: layout.hit, alignItems: 'center', justifyContent: 'center' },
  glyphPressed: { opacity: 0.6 },

  buttons: { flexDirection: 'row', gap: space.md },
  button: { flex: 1 },
});
