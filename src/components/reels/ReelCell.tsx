import { Image } from 'expo-image';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  type GestureResponderEvent,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { timeAgo, timeAgoSpoken } from '@/components/PostCard';
import { ReelVideo } from '@/components/reels/ReelVideo';
import { announce, Avatar, Button, haptic, PressableScale } from '@/components/ui';
import { colors, dexNumber, fonts, layout, motion, radius, space, stroke, tabular, type as typeScale } from '@/constants/theme';
import { formatCount, formatDexNumber, getDrink } from '@/data';
import { blockUser, REPORT_REASONS, reportReel, type ReportReason } from '@/lib/moderation';
import { COPY, deleteReel, type Reel } from '@/lib/reels';
import { forgetSignedPhoto } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useReels } from '@/store/reels';
import { useSocial } from '@/store/social';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Scrims                                                               */
/* ==================================================================== */

/** Under the caption, the author and the rail: clear at the top, darkest at the bottom edge. */
export const BOTTOM_SCRIM = [
  [0, colors.reelScrimClear],
  [0.4, colors.reelScrimMid],
  [1, colors.reelScrim],
] as const;

/** Under the Reels header: darkest at the top edge, clear by the bottom. */
export const TOP_SCRIM = [
  [0, colors.reelScrimMid],
  [1, colors.reelScrimClear],
] as const;

/**
 * A band of graded dark over video, so bone type on it reads over a white
 * frame (5.45:1 at the shallow end of the caption band, per check-contrast).
 * The only gradients v2 keeps: they do a job, which is legibility.
 */
export function Scrim({
  id,
  stops,
  style,
}: {
  /** Unique within the screen: SVG gradients are looked up by id. */
  id: string;
  stops: readonly (readonly [number, string])[];
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" style={style}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {stops.map(([offset, color]) => (
              <Stop key={offset} offset={offset} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/* ==================================================================== */
/* Feedback that leaves on its own                                      */
/*                                                                      */
/* Both are unmounted by a JS timer in the cell, not by their fade      */
/* finishing. Reanimated can stall for seconds after a cold start        */
/* (specs/06), and a mute badge or a heart left on screen because a fade */
/* never ran is worse than one that vanishes without fading. Both also   */
/* START visible: the fade is only ever on the way out.                 */
/* ==================================================================== */

const DOUBLE_TAP_MS = 250;
const LONG_PRESS_MS = 300;
const FLASH_FADE_AT = 700;
const FLASH_FADE_MS = 120;
const FLASH_GONE_MS = 820;
const BURST_FADE_MS = 600;
const BURST_GONE_MS = 700;

function MuteFlash({ muted }: { muted: boolean }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withDelay(FLASH_FADE_AT, withTiming(0, { duration: FLASH_FADE_MS })));
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.View style={[styles.flash, style]}>
        <Icon name={muted ? 'volumeOff' : 'volume'} size={28} color={colors.reelInk} />
      </Animated.View>
    </View>
  );
}

const BURST = 96;

function HeartBurst({ x, y }: { x: number; y: number }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.6);
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduced) {
      scale.set(withSequence(withSpring(1.15, motion.spring), withSpring(1, motion.spring)));
    }
    opacity.set(withDelay(BURST_FADE_MS - 200, withTiming(0, { duration: 200 })));
  }, [reduced, scale, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.burst, { left: x - BURST / 2, top: y - BURST / 2 }, style]}>
      <Icon name="heart" size={BURST} color={colors.wineSoft} filled />
    </Animated.View>
  );
}

/* ==================================================================== */
/* Caption                                                              */
/* ==================================================================== */

/**
 * Two lines, and "more" when there is more; a tap opens it to eight.
 *
 * The full length is measured on an invisible copy with no line limit,
 * because a Text that is already clamped reports only the lines it drew.
 * The copy is hidden from VoiceOver, which reads the visible caption.
 *
 * A caption with nothing more to show has no press handler rather than a
 * `disabled` Pressable: disabled is announced as "dimmed", which a caption
 * is not.
 */
function Caption({ text }: { text: string }) {
  const [lines, setLines] = useState(0);
  const [open, setOpen] = useState(false);
  const more = lines > 2;
  return (
    <Pressable
      onPress={more ? () => setOpen((o) => !o) : undefined}
      accessibilityRole={more ? 'button' : 'text'}
      accessibilityLabel={text}
      accessibilityHint={more ? (open ? 'Shows less of the caption' : 'Shows the whole caption') : undefined}>
      <Text
        style={[styles.caption, styles.measure]}
        maxFontSizeMultiplier={1.4}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onTextLayout={(e) => {
          const n = e.nativeEvent.lines.length;
          setLines((prev) => (prev === n ? prev : n));
        }}>
        {text}
      </Text>
      <Text style={styles.caption} numberOfLines={open ? 8 : 2} maxFontSizeMultiplier={1.4}>
        {text}
      </Text>
      {more && !open ? (
        <Text style={styles.more} maxFontSizeMultiplier={1.4}>
          more
        </Text>
      ) : null}
    </Pressable>
  );
}

/* ==================================================================== */
/* ReelCell                                                             */
/* ==================================================================== */

export interface ReelCellProps {
  reel: Reel;
  author: UserProfile | undefined;
  /** The page's height: the pager's own, measured. */
  height: number;
  /** Space kept clear at the bottom: the tab bar on the Reels tab, the home indicator on a pushed pager. */
  bottomInset: number;
  /** This is the page on screen, in a screen that has focus. */
  current: boolean;
  /** The app is in the foreground. */
  appActive: boolean;
  /** Mount a player: this page or one beside it, in a screen that has focus. */
  loadVideo: boolean;
  index: number;
  count: number;
  /** Move to the page `delta` away (VoiceOver's swipe up and down). */
  onStep: (delta: 1 | -1) => void;
  /** After a delete or a report: the reel is gone from wherever it is listed. */
  onRemoved?: (reelId: string) => void;
  /** After a block: everything by this person is gone. */
  onAuthorBlocked?: (authorId: string) => void;
}

/**
 * One full-screen reel: the poster at once, the video over it once its
 * first frame is drawn, a dark band at the foot for the author, the
 * caption, the drink and the like and menu controls.
 *
 * TOUCHES, WITHOUT A GESTURE LIBRARY. One Pressable under the controls: a
 * tap mutes (after 250 ms, in case it is the first of two), a second tap
 * inside that window likes with a heart where the finger was (and never
 * unlikes), and a press held 300 ms pauses and clears the screen until it
 * lets go. Scrolling the list cancels the press, so a swipe never mutes.
 * The app has no GestureHandlerRootView, and one double tap did not
 * justify adding one around everything.
 *
 * Hiding the overlays on a hold is instant, not a fade: they must be back
 * the moment the finger lifts, whatever the animation loop is doing.
 *
 * Text over video is bone with a soft dark shadow, never a lowered-opacity
 * grey, which fails over a bright frame. Overlay text stops growing at
 * 1.4x so it stays on the page at the largest sizes.
 */
export function ReelCell({
  reel,
  author,
  height,
  bottomInset,
  current,
  appActive,
  loadVideo,
  index,
  count,
  onStep,
  onRemoved,
  onAuthorBlocked,
}: ReelCellProps) {
  const router = useRouter();
  const inTabs = useSegments()[0] === '(tabs)';
  const myId = useAuth((s) => s.session?.user.id);
  const muted = useReels((s) => s.muted);
  const setMuted = useReels((s) => s.setMuted);
  const toggleLike = useReels((s) => s.toggleLike);
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);

  /* The video, and a way to ask for it again after it failed. */
  const [retry, setRetry] = useState(0);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const posterUrl = useSignedPhoto(reel.posterPath, retry, 'reels');
  const videoUrl = useSignedPhoto(loadVideo ? reel.videoPath : null, retry, 'reels');
  const failed = failedAt === retry || (loadVideo && videoUrl === null);

  const progress = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  /* Hold (long press) and VoiceOver's magic tap pause; only the hold also clears the screen. */
  const [held, setHeld] = useState(false);
  const [stilled, setStilled] = useState(false);

  /*
   * The like, drawn optimistically over the reel's own state: PostCard's
   * `flip`. The Reels tab's store patches its copy at once, but the author
   * pager holds its own list, where a tap would otherwise look like it did
   * nothing. Keyed by the reel's state, so once that catches up the
   * overlay stops matching and drops out; a failed write clears it, or the
   * store's rollback would restore the very key it was stamped with.
   */
  const [flip, setFlip] = useState<{ key: string; on: boolean } | null>(null);
  const likeKey = `${reel.id}|${reel.likedByMe ? 1 : 0}|${reel.likes}`;
  const liked = flip?.key === likeKey ? flip.on : reel.likedByMe;
  const likes = Math.max(0, reel.likes + (liked === reel.likedByMe ? 0 : liked ? 1 : -1));

  const [flash, setFlash] = useState<{ id: number; muted: boolean } | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);

  /* Timers and press state between events; cleared when the page unmounts. */
  const live = useRef({
    pendingTap: null as ReturnType<typeof setTimeout> | null,
    longPressed: false,
    seq: 0,
    timers: new Set<ReturnType<typeof setTimeout>>(),
  });
  useEffect(() => {
    const state = live.current;
    return () => {
      if (state.pendingTap) clearTimeout(state.pendingTap);
      state.timers.forEach(clearTimeout);
      state.timers.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const timers = live.current.timers;
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const drink = getDrink(reel.drinkId);
  const who: UserProfile = author ?? {
    id: reel.authorId,
    username: 'someone',
    displayName: 'Someone',
    accent: colors.wineSoft,
    joinedAt: '',
  };
  const followed = following.includes(reel.authorId);

  /* ---- Actions ---- */

  const writeLike = (on: boolean) => {
    if (!myId || on === liked) return;
    const next = { key: likeKey, on };
    setFlip(next);
    void toggleLike(myId, reel.id, liked).then((ok) => {
      if (!ok) setFlip((f) => (f === next ? null : f));
    });
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    const id = ++live.current.seq;
    setFlash({ id, muted: next });
    later(() => setFlash((f) => (f?.id === id ? null : f)), FLASH_GONE_MS);
  };

  const doubleTap = (x: number, y: number) => {
    haptic.tap();
    const id = ++live.current.seq;
    setBursts((b) => [...b, { id, x, y }]);
    later(() => setBursts((b) => b.filter((p) => p.id !== id)), BURST_GONE_MS);
    // A second double tap on a liked reel is another heart, never an unlike.
    writeLike(true);
  };

  const onTap = (e: GestureResponderEvent) => {
    const state = live.current;
    const { locationX, locationY } = e.nativeEvent;
    if (state.pendingTap) {
      clearTimeout(state.pendingTap);
      state.pendingTap = null;
      doubleTap(locationX, locationY);
      return;
    }
    state.pendingTap = setTimeout(() => {
      state.pendingTap = null;
      toggleMute();
    }, DOUBLE_TAP_MS);
  };

  const retryVideo = () => {
    forgetSignedPhoto(reel.videoPath, 'reels');
    setRetry((r) => r + 1);
  };

  /*
   * Your own name goes to the Profile tab, where Edit profile is, not to a
   * copy of your profile pushed on top. From the Reels tab that is a tab
   * switch; from the author pager, which sits over the tabs, dismissTo pops
   * back to them first: in a stack, a plain navigate to a screen that is
   * not the current one pushes a new copy of it, here a second set of tabs.
   */
  const openAuthor = () => {
    if (!reel.mine) router.push({ pathname: '/user/[id]', params: { id: reel.authorId } });
    else if (inTabs) router.navigate('/profile');
    else router.dismissTo('/profile');
  };

  const openDrink = () => {
    if (drink) router.push({ pathname: '/drink/[id]', params: { id: drink.id } });
  };

  /*
   * Reason first, then file: PostCard's flow. A report hides the reel from
   * the reporter on the server (migration 019) and here at once.
   */
  const openReport = () => {
    if (!myId) return;
    const file = (reason: ReportReason) => {
      void reportReel(myId, reel.id, reason)
        .then(() => {
          useReels.getState().remove(reel.id);
          onRemoved?.(reel.id);
          Alert.alert(COPY.reportedTitle, COPY.reportedBody);
        })
        .catch(() => Alert.alert('Could not report', 'Check your connection and try again.'));
    };
    const message =
      'What is wrong with it? Reports are reviewed privately; the poster is not told who reported them.';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: COPY.report,
          message,
          options: [...REPORT_REASONS.map((r) => r.label), 'Cancel'],
          cancelButtonIndex: REPORT_REASONS.length,
        },
        (i) => {
          const reason = REPORT_REASONS[i];
          if (reason) file(reason.key);
        },
      );
      return;
    }
    Alert.alert(COPY.report, message, [
      ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => file(r.key) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmBlock = () => {
    if (!myId) return;
    Alert.alert(
      `Block @${who.username}?`,
      'You will not see their posts or reels and they will not see yours. Any follow between you is removed. You can undo this in Settings, under Blocked accounts.',
      [
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Block',
          style: 'destructive' as const,
          onPress: () => {
            void blockUser(myId, who.id)
              .then(() => {
                haptic.select();
                useReels.getState().dropAuthor(who.id);
                useSocial.getState().dropAuthor(who.id);
                onAuthorBlocked?.(who.id);
              })
              .catch(() => Alert.alert('Could not block', 'Check your connection and try again.'));
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    if (!myId) return;
    Alert.alert(COPY.deleteTitle, COPY.deleteBody, [
      { text: 'Cancel', style: 'cancel' as const },
      {
        text: 'Delete',
        style: 'destructive' as const,
        onPress: () => {
          void deleteReel(myId, reel)
            .then(() => {
              haptic.select();
              useReels.getState().remove(reel.id);
              onRemoved?.(reel.id);
            })
            .catch(() => Alert.alert('Could not delete', 'Check your connection and try again.'));
        },
      },
    ]);
  };

  /*
   * Your own reel: open its drink, delete it. Someone else's: open its
   * drink, report it, block them. Report is not styled destructive (filing
   * one removes nothing); delete and block are.
   */
  const openMenu = () => {
    const actions: { text: string; onPress: () => void; destructive?: boolean }[] = [
      ...(drink ? [{ text: `Open ${drink.name}`, onPress: openDrink }] : []),
      ...(reel.mine
        ? [{ text: COPY.delete, onPress: confirmDelete, destructive: true }]
        : [
            { text: COPY.report, onPress: openReport },
            { text: `Block @${who.username}`, onPress: confirmBlock, destructive: true },
          ]),
    ];
    if (Platform.OS === 'ios') {
      const destructiveIndex = actions.findIndex((a) => a.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...actions.map((a) => a.text), 'Cancel'],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        },
        (i) => actions[i]?.onPress(),
      );
      return;
    }
    Alert.alert(`@${who.username}`, undefined, [
      ...actions.map((a) => ({
        text: a.text,
        onPress: a.onPress,
        style: a.destructive ? ('destructive' as const) : ('default' as const),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  /* ---- Accessibility ---- */

  const spoken = COPY.cellLabel({
    username: who.username,
    durationMs: reel.durationMs,
    caption: reel.caption,
    drink: drink?.name,
  });
  const likesSpoken = likes > 0 ? `, ${formatCount(likes)} ${likes === 1 ? 'like' : 'likes'}` : '';

  const onAction = (name: string) => {
    switch (name) {
      case 'like':
        haptic.tap();
        writeLike(!liked);
        announce(liked ? 'Unliked' : 'Liked');
        return;
      case 'mute':
        toggleMute();
        announce(muted ? 'Sound on' : 'Muted');
        return;
      case 'increment':
        onStep(1);
        return;
      case 'decrement':
        onStep(-1);
        return;
      case 'magicTap':
        setStilled((s) => !s);
        return;
    }
  };

  /* ---- Layout ---- */

  const fit = reel.landscape ? 'contain' : 'cover';
  const blockBottom = bottomInset + space.md;

  return (
    <View style={[styles.page, { height }]}>
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl, cacheKey: reel.posterPath }}
          // Keyed on the path, as PostCard does: the disk copy survives each hour's new signed URL.
          cachePolicy="memory-disk"
          contentFit={fit}
          transition={120}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : null}

      {loadVideo && typeof videoUrl === 'string' && failedAt !== retry ? (
        <ReelVideo
          key={`${videoUrl}|${retry}`}
          uri={videoUrl}
          landscape={reel.landscape}
          durationMs={reel.durationMs}
          muted={muted}
          current={current}
          paused={!appActive || held || stilled}
          progress={progress}
          onError={() => setFailedAt(retry)}
        />
      ) : null}

      <Scrim id={`reelFoot-${reel.id}`} stops={BOTTOM_SCRIM} style={styles.footScrim} />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onTap}
        onLongPress={() => {
          const state = live.current;
          if (state.pendingTap) clearTimeout(state.pendingTap);
          state.pendingTap = null;
          state.longPressed = true;
          setHeld(true);
        }}
        onPressOut={() => {
          const state = live.current;
          if (!state.longPressed) return;
          state.longPressed = false;
          setHeld(false);
        }}
        delayLongPress={LONG_PRESS_MS}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={spoken}
        accessibilityValue={{ text: `${index + 1} of ${count}` }}
        accessibilityHint={COPY.cellHint}
        accessibilityActions={[
          { name: 'like', label: liked ? 'Unlike' : 'Like' },
          { name: 'mute', label: muted ? 'Unmute' : 'Mute' },
          { name: 'increment', label: 'Next reel' },
          { name: 'decrement', label: 'Previous reel' },
          { name: 'magicTap', label: stilled ? 'Play' : 'Pause' },
        ]}
        onAccessibilityAction={(e) => onAction(e.nativeEvent.actionName)}
      />

      {held ? null : (
        <>
          <View style={[styles.left, { bottom: blockBottom }]} pointerEvents="box-none">
            <View style={styles.authorRow}>
              <PressableScale
                onPress={openAuthor}
                noHaptic
                accessibilityRole="button"
                accessibilityLabel={`Open @${who.username}'s profile, posted ${timeAgoSpoken(reel.createdAt)}`}
                style={styles.identity}>
                <Avatar name={who.displayName} accent={who.accent} avatarPath={who.avatarPath} size={32} ring />
                <Text style={styles.handle} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                  @{who.username}
                </Text>
                <Text style={styles.when} maxFontSizeMultiplier={1.4}>
                  · {timeAgo(reel.createdAt)}
                </Text>
              </PressableScale>
              {reel.mine || followed || !myId ? null : (
                <Pressable
                  onPress={() => {
                    haptic.select();
                    void toggleFollow(myId, reel.authorId);
                  }}
                  hitSlop={{ top: 8, bottom: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Follow @${who.username}`}
                  style={({ pressed }) => [styles.follow, pressed && styles.pressed]}>
                  <Text style={styles.followText} maxFontSizeMultiplier={1.4}>
                    Follow
                  </Text>
                </Pressable>
              )}
            </View>

            {reel.caption.trim() ? <Caption text={reel.caption.trim()} /> : null}

            {drink ? (
              <Pressable
                onPress={openDrink}
                accessibilityRole="button"
                accessibilityLabel={`Open ${drink.name}, number ${drink.dexNumber}, in the Dex`}
                hitSlop={{ top: 6, bottom: 6 }}
                style={({ pressed }) => [styles.drinkChip, pressed && styles.pressed]}>
                <DrinkArt drink={drink} size={20} flat />
                <Text style={styles.drinkName} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                  {drink.name}
                </Text>
                <Text style={styles.drinkNumber} maxFontSizeMultiplier={1.4}>
                  {formatDexNumber(drink.dexNumber)}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.rail, { bottom: blockBottom }]} pointerEvents="box-none">
            <Pressable
              onPress={() => {
                haptic.tap();
                writeLike(!liked);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${liked ? 'Unlike' : 'Like'}${likesSpoken}`}
              accessibilityState={{ selected: liked }}
              style={({ pressed }) => [styles.railItem, pressed && styles.pressed]}>
              <View style={styles.railGlyph}>
                <Icon name="heart" size={28} color={liked ? colors.wineSoft : colors.reelInk} filled={liked} />
              </View>
              {likes > 0 ? (
                <Text style={styles.count} maxFontSizeMultiplier={1.4}>
                  {formatCount(likes)}
                </Text>
              ) : null}
            </Pressable>
            <Pressable
              onPress={openMenu}
              accessibilityRole="button"
              accessibilityLabel="More options"
              style={({ pressed }) => [styles.railItem, pressed && styles.pressed]}>
              <View style={styles.railGlyph}>
                <Icon name="more" size={28} color={colors.reelInk} />
              </View>
            </Pressable>
          </View>

          {current ? (
            <View style={[styles.track, { bottom: bottomInset - space.sm }]} pointerEvents="none">
              <Animated.View style={[styles.trackFill, progressStyle]} />
            </View>
          ) : null}
        </>
      )}

      {failed ? (
        <View style={styles.center} pointerEvents="box-none">
          <Text style={styles.cellError} maxFontSizeMultiplier={1.4}>
            {COPY.cellError}
          </Text>
          <Button label="Try again" variant="onDark" size="sm" onPress={retryVideo} />
        </View>
      ) : null}

      {flash ? <MuteFlash key={flash.id} muted={flash.muted} /> : null}
      {bursts.map((b) => (
        <HeartBurst key={b.id} x={b.x} y={b.y} />
      ))}
    </View>
  );
}

/* ==================================================================== */

const RAIL = 52;

const shadow = {
  textShadowColor: colors.reelTextShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

const styles = StyleSheet.create({
  page: { width: '100%', backgroundColor: colors.reelGround, overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: space.md },
  footScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  pressed: { opacity: 0.72 },

  /* Left block: author, caption, drink. Its right edge clears the rail. */
  left: {
    position: 'absolute',
    left: space.lg,
    right: space.lg + RAIL + space.sm + space.md,
    gap: space.sm,
  },
  authorRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  identity: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.hit },
  handle: {
    flexShrink: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.reelInk,
    ...shadow,
  },
  when: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.reelInk, ...shadow },
  follow: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.reelInk,
  },
  followText: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18, color: colors.reelInk, ...shadow },

  caption: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.reelInk,
    ...shadow,
  },
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  more: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18, color: colors.reelInk, ...shadow },

  drinkChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.reelControlBorder,
    backgroundColor: colors.reelControlFill,
  },
  /*
   * Shadowed like all type over video: the chip's translucent fill alone
   * leaves 13pt bone at 4.27:1 over a white frame.
   */
  drinkName: {
    flexShrink: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.reelInk,
    ...shadow,
  },
  drinkNumber: { ...dexNumber, color: colors.reelInk, ...shadow },

  /* Right rail: like and the menu, bottom-aligned with the left block. */
  rail: { position: 'absolute', right: space.sm, width: RAIL, alignItems: 'center', gap: space.lg },
  railItem: { width: RAIL, minHeight: layout.hit, alignItems: 'center', justifyContent: 'center', gap: 2 },
  railGlyph: { width: layout.hit, height: layout.hit, alignItems: 'center', justifyContent: 'center' },
  count: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.reelInk,
    ...tabular,
    ...shadow,
  },

  /* The reel's progress, on the reel on screen only. */
  track: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.reelTrack },
  trackFill: { height: 2, backgroundColor: colors.reelInk },

  flash: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.reelControlBorder,
    backgroundColor: colors.reelControlFill,
  },
  burst: { position: 'absolute', width: BURST, height: BURST },

  cellError: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.reelInk,
    textAlign: 'center',
    ...shadow,
  },
});
