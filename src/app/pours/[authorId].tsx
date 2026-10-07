import { Image } from 'expo-image';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { DrinkName } from '@/components/cabinet';
import { DrinkFace } from '@/components/DexCard';
import { firstUnseenIndex, groupPours, type PourGroup } from '@/components/home/groupPours';
import { Icon } from '@/components/icons';
import { DexStatusPlaque, MediaNumberPlate } from '@/components/media';
import { timeAgo, timeAgoSpoken } from '@/components/PostCard';
import { AppleMusicCredit, SongArtwork, usePreviewPlayer } from '@/components/songs';
import { announce, Avatar, EmptyState, haptic, MediaIconButton } from '@/components/ui';
import { colors, fonts, layout, onMedia, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { STORY_MUSIC } from '@/lib/music';
import { primeSignedUrls, toProfile } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useCollection, useIsUnlocked } from '@/store/collection';
import { useSeen } from '@/store/seen';
import { useSocial } from '@/store/social';
import type { Drink, Pour, Song, UserProfile } from '@/types';

/* ==================================================================== */
/* Stories, one photo at a time                                         */
/*                                                                      */
/* Opened from a circle in Home's stories rail: a modal sheet (root     */
/* _layout), so the native swipe down closes it and VoiceOver's escape  */
/* gesture does too. A story is a photograph to look at, not a          */
/* five-second clip, so nothing here moves on by itself: a tap on the   */
/* right goes forward, a tap on the left goes back, and each step is an */
/* instant cut.                                                         */
/*                                                                      */
/* The photo is shown whole (contained), and the stage behind it takes  */
/* the drink's own colour: the same photo, decoded tiny and blurred,    */
/* scaled to cover. It stays inside the stage, so the header and the    */
/* footer are always on the plain dark ground and never over the blur.  */
/*                                                                      */
/* SEEN STAYS ON THE PHONE. Each photo shown is marked in the seen      */
/* store (store/seen.ts), which only rings circles on this device;      */
/* nobody is told you looked.                                           */
/*                                                                      */
/* THE ORDER IS FIXED ON OPEN. The people, and where each one starts,   */
/* are taken once from the row as it stood when the circle was tapped.  */
/* Marking photos seen while you watch reorders the row (seen people go */
/* last), and a sequence that re-sorted under you would skip someone.   */
/* The one thing that changes it is deleting your own post (Story       */
/* options): its photos leave the sequence, and nothing else moves.     */
/*                                                                      */
/* A SONG, WHEN THE FLAG IS ON. With EXPO_PUBLIC_STORY_MUSIC at 'tap'   */
/* or 'autoplay' a photo posted with a song carries a song tag in the   */
/* footer, never over the photo: its cover, title and artist, one       */
/* control, and "Listen on Apple Music" beside it (App Review 5.2.5).   */
/* With the flag off (the default) none of that is mounted and no       */
/* player exists (StoryMusic).                                          */
/* ==================================================================== */

export default function PoursScreen() {
  const params = useLocalSearchParams<{ authorId: string }>();
  // Account ids are lowercase everywhere they are stored, and a link may not be.
  const authorId = String(params.authorId ?? '').toLowerCase();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /*
   * Closing is the stack's back. Opened with nothing under it there is no
   * back, so it goes to the Dex, which works signed in or out.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <PoursViewer key={`${myId}:${authorId}`} myId={myId} authorId={authorId} onClose={leave} />;
}

/** The people to step through, and the photo each one starts at (by path, so a deletion cannot move it). */
interface Sequence {
  groups: PourGroup[];
  starts: string[];
}

/** One person as the viewer steps through them now: their photos less any deleted post, and where to start. */
interface Stop {
  group: PourGroup;
  start: number;
}

/** Where the viewer is, and the posts deleted while it has been open. */
interface Nav {
  person: number;
  pour: number;
  gone: ReadonlySet<string>;
}

/**
 * The fixed sequence less the deleted posts: each person's photos without
 * them, and a person left with none skipped. With nothing deleted it is
 * the sequence itself, group for group.
 */
function visible(seq: Sequence, gone: ReadonlySet<string>): Stop[] {
  const stops: Stop[] = [];
  seq.groups.forEach((g, i) => {
    const pours = gone.size === 0 ? g.pours : g.pours.filter((p) => !gone.has(p.postId));
    if (pours.length === 0) return;
    const at = pours.findIndex((p) => p.path === seq.starts[i]);
    stops.push({ group: pours === g.pours ? g : { ...g, pours }, start: at < 0 ? 0 : at });
  });
  return stops;
}

/**
 * Where the viewer goes once `postId` is deleted. A drink is one post, so
 * every photo of it leaves at once. The same person, if they have photos
 * left: the photo now at the same place, else their last. A person left
 * with none is skipped: the next person, at their start, else the one
 * before, at their last. With nobody left the viewer closes (PoursViewer).
 */
function dropPost(nav: Nav, seq: Sequence, postId: string): Nav {
  const gone = new Set(nav.gone).add(postId);
  const was = visible(seq, nav.gone)[nav.person];
  const now = visible(seq, gone);
  const same = was ? now.findIndex((s) => s.group.authorId === was.group.authorId) : -1;
  if (same >= 0) {
    return { person: same, pour: Math.min(nav.pour, now[same]!.group.pours.length - 1), gone };
  }
  const after = now[nav.person];
  if (after) return { person: nav.person, pour: after.start, gone };
  const before = now[now.length - 1];
  if (before) return { person: now.length - 1, pour: before.group.pours.length - 1, gone };
  return { person: 0, pour: 0, gone };
}

function PoursViewer({
  myId,
  authorId,
  onClose,
}: {
  myId: string;
  authorId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pours = useSocial((s) => s.pours);
  const profiles = useSocial((s) => s.profiles);
  const ownRow = useAuth((s) => s.profile);
  const seen = useSeen((s) => s.pours[myId]);
  const markPourSeen = useSeen((s) => s.markPourSeen);
  const removePost = useSocial((s) => s.removePost);

  /*
   * Your own circle opens your photos alone. Anyone else's opens the row
   * from that person on, as it was ordered when tapped, and each person
   * starts at their first photo you have not seen (oldest first), or at
   * their first if you have seen them all.
   */
  const [seq] = useState<Sequence>(() => {
    const { mine, others } = groupPours(pours, myId, seen);
    let groups: PourGroup[];
    if (authorId === myId) {
      groups = mine ? [mine] : [];
    } else {
      const at = others.findIndex((g) => g.authorId === authorId);
      groups = at < 0 ? [] : others.slice(at);
    }
    const starts = groups.map(
      (g) => g.pours[g.authorId === myId ? 0 : firstUnseenIndex(g, seen?.[g.authorId])]?.path ?? '',
    );
    return { groups, starts };
  });
  const [nav, setNav] = useState<Nav>(() => ({
    person: 0,
    pour: visible(seq, new Set())[0]?.start ?? 0,
    gone: new Set(),
  }));

  /*
   * Every photo in the sequence signed in one request, so each step paints
   * at once. A layout effect so it goes out before the first photo's own
   * signing (a passive effect, and children's run first), which then
   * shares it rather than asking alone.
   */
  useLayoutEffect(() => {
    void primeSignedUrls(
      'pours',
      seq.groups.flatMap((g) => g.pours.map((p) => p.path)),
    );
  }, [seq]);

  const view = visible(seq, nav.gone);
  const group = view[nav.person]?.group;
  const pour = group?.pours[nav.pour];
  const drink = pour ? getDrink(pour.drinkId) : undefined;
  /*
   * Whether this pour's drink is in YOUR Dex, for the status plaque; no
   * plaque until the collection has been read from disk, so a drink you
   * have never shows "New to your Dex" for a moment.
   */
  const unlocked = useIsUnlocked(pour?.drinkId ?? '');
  const collectionReady = useCollection((s) => s.hydrated);
  const who: UserProfile | undefined = group
    ? group.authorId === myId && ownRow?.id === myId
      ? toProfile(ownRow)
      : profiles[group.authorId]
    : undefined;
  const name = who?.displayName ?? 'Someone';
  const spoken =
    group && pour
      ? `Photo of ${drink?.name ?? 'a drink'}, ${nav.pour + 1} of ${group.pours.length}, by ${name}`
      : '';
  // Your own story is yours to delete; nobody else's sequence ever holds it (groupPours keeps it apart).
  const mine = group?.authorId === myId;

  /*
   * Each photo shown is marked seen (the store keeps the later mark, so
   * stepping back to an older one changes nothing) and said aloud, because
   * a cut from one photo to the next makes no sound of its own. Keyed on
   * the author and the photo, which keep their identity when a deletion
   * rebuilds the person's list around them.
   */
  const author = group?.authorId;
  useEffect(() => {
    if (!author || !pour) return;
    markPourSeen(myId, author, pour.at);
    announce(spoken);
  }, [author, pour, myId, markPourSeen, spoken]);

  /*
   * One way out, taken once. The sheet stays mounted while it slides away,
   * so a second tap in that moment (on the last pour, Close, or a footer
   * link) would run the close again against the screen underneath: a back
   * from Home, or with nothing to go back to, a jump to the Dex.
   */
  const closed = useRef(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  // Every photo deleted: nothing is left to show, so the sheet goes.
  const emptied = nav.gone.size > 0 && view.length === 0;
  useEffect(() => {
    if (!emptied || closed.current) return;
    closed.current = true;
    onClose();
  }, [emptied, onClose]);

  const next = () => {
    if (!group) return;
    if (nav.pour + 1 < group.pours.length) {
      setNav({ ...nav, pour: nav.pour + 1 });
    } else if (nav.person + 1 < view.length) {
      setNav({ ...nav, person: nav.person + 1, pour: view[nav.person + 1]!.start });
    } else {
      close();
    }
  };

  const previous = () => {
    if (!group) return;
    if (nav.pour > 0) {
      setNav({ ...nav, pour: nav.pour - 1 });
    } else if (nav.person > 0) {
      const before = view[nav.person - 1]!;
      setNav({ ...nav, person: nav.person - 1, pour: before.group.pours.length - 1 });
    }
    // At the very first photo there is nothing before it.
  };

  /*
   * Delete, from your own story. The same confirmation as PostCard's Delete
   * post, word for word: a drink is one post (migration 007), so this
   * removes every photo of it, which "with its photos" already says. On
   * success the store drops the post's pours and its feed row, so the rail
   * and the feed behind the sheet update at once; here the post's photos
   * leave the sequence fixed on open.
   */
  const confirmDelete = (postId: string) => {
    // Permanent, so a two-way alert on every platform, as on PostCard.
    Alert.alert(
      'Delete this post?',
      "It is removed from your profile and from everyone's feed, with its photos. This cannot be undone.",
      [
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Delete',
          style: 'destructive' as const,
          onPress: () => {
            void removePost(myId, postId).then((ok) => {
              if (!ok) {
                Alert.alert('Could not delete', 'Check your connection and try again.');
                return;
              }
              haptic.select();
              announce('Post deleted');
              setNav((n) => dropPost(n, seq, postId));
            });
          },
        },
      ],
    );
  };

  /* Story options: one action so far, so Delete post and Cancel. */
  const openOptions = () => {
    if (!pour) return;
    const postId = pour.postId;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Delete post', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (i) => {
          if (i === 0) confirmDelete(postId);
        },
      );
      return;
    }
    Alert.alert('Story options', undefined, [
      { text: 'Delete post', style: 'destructive' as const, onPress: () => confirmDelete(postId) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  // Close the sheet first, then push, so the drink or post opens over the
  // tabs as a normal push (with Back to Home) rather than on top of a sheet
  // that is on its way out.
  const openDrink = (id: string) => {
    if (closed.current) return;
    close();
    router.navigate({ pathname: '/drink/[id]', params: { id } });
  };
  const openPost = (id: string) => {
    if (closed.current) return;
    close();
    router.navigate({ pathname: '/post/[id]', params: { id } });
  };

  const top = Platform.OS === 'ios' ? space.sm : insets.top + space.sm;

  // The last photo was just deleted and the sheet is on its way out: the bare ground, not an empty state.
  if (emptied) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!group || !pour) {
    return (
      <View style={[styles.screen, styles.emptyScreen, { paddingTop: top }]}>
        <StatusBar style="light" />
        <EmptyState
          tone="dark"
          icon="camera"
          title="Nothing new right now"
          body="Posts stay here for a day after they are shared."
          secondaryAction={{ label: 'Close', onPress: close }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: top }]}>
      <StatusBar style="light" />

      {/* One bar per photo from this person: the ones shown so far are bone. */}
      <View
        style={styles.progress}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {group.pours.map((p, i) => (
          <View
            key={p.path}
            style={[styles.bar, { backgroundColor: i <= nav.pour ? colors.reelInk : colors.reelTrack }]}
          />
        ))}
      </View>

      <View style={styles.header}>
        <Avatar
          name={name}
          accent={who?.accent ?? colors.wineSoft}
          size={32}
          avatarPath={who?.avatarPath}
        />
        <Text style={styles.username} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {who?.username ?? 'someone'}
        </Text>
        <Text
          style={styles.when}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={timeAgoSpoken(pour.at)}>
          {timeAgo(pour.at)}
        </Text>
        <View style={styles.spacer} />
        {mine ? <MediaIconButton icon="more" label="Story options" onPress={openOptions} /> : null}
        <MediaIconButton icon="close" label="Close" onPress={close} />
      </View>

      <View style={styles.stage}>
        <PourPhoto key={pour.path} pour={pour} drink={drink} label={spoken} />
        {/* Tap zones over the photo: a third to go back, the rest to go on. */}
        <View style={styles.zones}>
          <Pressable
            onPress={previous}
            accessibilityRole="button"
            accessibilityLabel="Previous photo"
            style={styles.zonePrevious}
          />
          <Pressable
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel="Next photo"
            style={styles.zoneNext}
          />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {/*
          In this slot while the flag is on, song or not, so its one player
          lives as long as the viewer and is stopped, not rebuilt, at each
          step. With the flag off nothing is mounted here.
        */}
        {STORY_MUSIC !== 'off' ? <StoryMusic mode={STORY_MUSIC} step={pour.path} song={pour.music} /> : null}
        {drink ? (
          <>
            {/*
              The name whole, never cut: DrinkName wraps it and fits a long
              word to the line, and the footer grows while the stage gives
              way. One button with its number, as on the feed's nameplate;
              the plates under it say the same to the eye.
            */}
            <Pressable
              onPress={() => openDrink(drink.id)}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`${drink.name}, number ${drink.dexNumber}`}
              accessibilityHint="Opens it in the Dex"
              style={({ pressed }) => [styles.drinkLink, pressed && styles.pressed]}>
              <DrinkName
                name={drink.name}
                role={textRole.nameLg}
                measure={width - 2 * layout.gutter}
                cap={1.3}
                color={onMedia.ink}
              />
            </Pressable>
            <View style={styles.plates}>
              <View
                style={styles.plateGroup}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <MediaNumberPlate n={drink.dexNumber} />
              </View>
              {collectionReady ? (
                <DexStatusPlaque inDex={unlocked} name={drink.name} onPress={() => openDrink(drink.id)} />
              ) : null}
            </View>
          </>
        ) : null}
        <Pressable
          onPress={() => openPost(pour.postId)}
          hitSlop={{ top: 13, bottom: 13, right: 24 }}
          accessibilityRole="button"
          accessibilityLabel="View post"
          style={({ pressed }) => [styles.postLink, pressed && styles.pressed]}>
          <Text style={styles.postLinkLabel} maxFontSizeMultiplier={1.4}>
            View post
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ==================================================================== */
/* The song tag                                                         */
/* ==================================================================== */

/** Dynamic Type cap for the song tag: a fixed 32pt cover sits beside it. */
const SONG_CAP = 1.3;

/**
 * A photo's song, in the footer on the reel ground (never over the photo,
 * so it needs no scrim): the cover, the title and artist, one 44pt
 * control, and "Listen on Apple Music" on its own line under them, the
 * link App Review 5.2.5 asks for beside any playable preview.
 *
 * ONE PLAYER, mounted only while the flag is on. `step` is the photo on
 * screen: each new one stops the last one's preview, and in 'autoplay'
 * starts this one's. 'tap' plays nothing until the viewer taps play, and
 * its control is play and pause; 'autoplay' plays while the photo is
 * shown, and its control is mute (the choice holds for the session,
 * useStoryAudio). A preview plays once (no loop), stops when the sheet
 * loses focus, is released when it closes, and pauses in the background
 * (expo-video, staysActiveInBackground off).
 */
function StoryMusic({ mode, step, song }: { mode: 'tap' | 'autoplay'; step: string; song: Song | null }) {
  const preview = usePreviewPlayer();
  const focused = useIsFocused();

  /*
   * Effect events: they read the player and the song as they are when the
   * photo changes, without being reasons to re-run. With the player in the
   * dependencies, every change of its state would stop and restart the song.
   */
  const onStep = useEffectEvent(() => {
    preview.stop();
    if (mode === 'autoplay' && song && focused) preview.play(song);
  });
  useEffect(() => {
    onStep();
  }, [step]);

  // Leaving (Close, a swipe down, a push to the drink or the post): silent at once.
  const onBlur = useEffectEvent(() => preview.stop());
  useEffect(() => {
    if (!focused) onBlur();
  }, [focused]);

  if (!song) return null;

  const loaded = preview.songId === song.id;
  const playing = loaded && (preview.state === 'playing' || preview.state === 'loading');
  const control =
    mode === 'tap'
      ? {
          icon: playing ? ('pause' as const) : ('play' as const),
          label: playing ? 'Pause the preview' : `Play a preview of ${song.title} by ${song.artist}`,
          onPress: () => (playing ? preview.pause() : preview.play(song)),
          busy: loaded && preview.state === 'loading',
        }
      : {
          icon: preview.muted ? ('volumeOff' as const) : ('volume' as const),
          label: preview.muted ? 'Unmute' : 'Mute',
          onPress: () => preview.setMuted(!preview.muted),
          busy: false,
        };

  return (
    <View style={styles.song}>
      <View style={styles.songRow}>
        <SongArtwork url={song.artworkUrl} size={32} />
        <View style={styles.songText} accessible accessibilityLabel={`Music, ${song.title} by ${song.artist}`}>
          <Text numberOfLines={1} maxFontSizeMultiplier={SONG_CAP} style={styles.songTitle}>
            {song.title}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={SONG_CAP} style={styles.songArtist}>
            {song.artist}
          </Text>
        </View>
        <Pressable
          onPress={control.onPress}
          accessibilityRole="button"
          accessibilityLabel={control.label}
          accessibilityState={{ busy: control.busy }}
          style={({ pressed }) => [styles.songControl, pressed && styles.pressed]}>
          <Icon name={control.icon} size={24} color={colors.reelInk} />
        </Pressable>
      </View>
      <AppleMusicCredit
        url={song.appleMusicUrl}
        tone="dark"
        accessibilityLabel={`Listen to ${song.title} on Apple Music`}
        onOpen={preview.stop}
      />
    </View>
  );
}

/**
 * The blurred backdrop's box. Tiny on purpose: decoded at 55 x 73pt
 * (about 165 x 220 pixels) and scaled up by a static transform to cover
 * the stage, so the colour behind the photo costs almost nothing to hold.
 * A blur of a picture that small is all colour and no detail.
 */
const BACKDROP = { w: 55, h: 73 } as const;
const BACKDROP_BLUR = 24;

/**
 * The photo, whole (contain, not cover: this is the one place a pour is
 * shown uncropped), over a blurred copy of itself that fills the
 * letterbox. Keyed by path by its parent, so a step never shows the
 * previous pour under the new name while the next one loads.
 */
function PourPhoto({ pour, drink, label }: { pour: Pour; drink: Drink | undefined; label: string }) {
  // The pour as the retry key, as on the tiles.
  const url = useSignedPhoto(pour.path, pour);
  const { width, height } = useWindowDimensions();
  // The window covers the stage, whatever the header and footer take.
  const cover = Math.max(width / BACKDROP.w, height / BACKDROP.h);
  return (
    <View style={styles.photo} accessible accessibilityRole="image" accessibilityLabel={label}>
      {url ? (
        <View pointerEvents="none" style={styles.backdrop}>
          <Image
            source={{ uri: url, cacheKey: pour.path }}
            cachePolicy="memory-disk"
            // Decoded at the box's 55pt, before the scale: see BACKDROP.
            enforceEarlyResizing
            blurRadius={BACKDROP_BLUR}
            contentFit="cover"
            accessible={false}
            style={[styles.backdropImage, { transform: [{ scale: cover }] }]}
          />
        </View>
      ) : null}
      {url ? (
        <Image
          source={{ uri: url, cacheKey: pour.path }}
          cachePolicy="memory-disk"
          /*
           * Decoded at the stage's size rather than the full upload, so each
           * step neither keeps another full-size decode in the image cache
           * nor redraws one on the main thread (PostGridTile, in
           * profile/PostGrid, has the whole reason). The thumbnail is fitted
           * inside the frame, which is exactly what contain draws, so the
           * photo looks the same.
           */
          enforceEarlyResizing
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
      ) : url === null && drink ? (
        // A photo that will not sign: the drink's own lit face, at the feed's 4:5.
        <DrinkFace drink={drink} mode="lit" width={width} height={Math.round(width * 1.25)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.reelGround },
  emptyScreen: { justifyContent: 'center' },

  progress: {
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: layout.gutter,
  },
  bar: { flex: 1, height: stroke.indicator },

  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
  },
  username: {
    flexShrink: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.reelInk,
  },
  when: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.reelInkMuted,
  },
  spacer: { flex: 1 },

  /* Clips the backdrop's scaled blur to the stage. */
  stage: { flex: 1, overflow: 'hidden' },
  photo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdropImage: { width: BACKDROP.w, height: BACKDROP.h },
  zones: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row' },
  zonePrevious: { width: '33%' },
  zoneNext: { flex: 1 },

  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.sm,
  },
  drinkLink: { alignSelf: 'flex-start', maxWidth: '100%' },
  plates: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  plateGroup: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  postLink: { alignSelf: 'flex-start' },
  postLinkLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.reelInkMuted,
  },
  pressed: { opacity: 0.5 },

  /* The song tag: a 48pt row, then the credit; the footer's own gap follows it. */
  song: { gap: space.xs },
  songRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.md },
  songText: { flex: 1 },
  songTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.reelInk,
  },
  songArtist: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.reelInkMuted,
  },
  songControl: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
