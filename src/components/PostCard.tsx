import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { Icon, type IconName } from '@/components/icons';
import { MediaMarker, Nameplate } from '@/components/media';
import { Avatar, haptic } from '@/components/ui';
import { colors, fonts, layout, motion, space, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import { glassPhrase, styleLabel } from '@/lib/drinkLabels';
import { blockUser, REPORT_REASONS, reportPost, type ReportReason } from '@/lib/moderation';
import { isBlankCaption, isRenderablePost, savesSupported, signedPhotoUrl } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useCollection, useIsUnlocked } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/*
 * Re-exported so the screens that imported it from here keep working. It
 * lives in lib/useSignedPhoto now: Home, the profile grids, Activity and
 * the reel tiles all sign these photos, and none of them should depend on
 * this component's file to do it.
 */
export { useSignedPhoto };

/* ==================================================================== */
/* Helpers                                                              */
/* ==================================================================== */

/** Whole units since `iso`, or null for "just now". */
function elapsed(iso: string): { n: number; unit: 'minute' | 'hour' | 'day' | 'week' } | null {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return null;
  if (min < 60) return { n: min, unit: 'minute' };
  const h = Math.floor(min / 60);
  if (h < 24) return { n: h, unit: 'hour' };
  const d = Math.floor(h / 24);
  if (d < 7) return { n: d, unit: 'day' };
  return { n: Math.floor(d / 7), unit: 'week' };
}

/** "2h" / "3d" style relative timestamp, for tight spots: a post's author row, the story viewer's header, Activity rows. */
export function timeAgo(iso: string): string {
  const t = elapsed(iso);
  return t ? `${t.n}${t.unit[0]}` : 'now';
}

/**
 * The same timestamp in words: "2 hours ago". The card shows it this way
 * too now, at the foot of the post, where there is room for the words;
 * VoiceOver reads "2h" as "2 h" and "3w" as "3 w".
 */
export function timeAgoSpoken(iso: string): string {
  const t = elapsed(iso);
  return t ? `${t.n} ${t.unit}${t.n === 1 ? '' : 's'} ago` : 'just now';
}

/* ==================================================================== */
/* Icon control                                                         */
/* ==================================================================== */

/**
 * Action icon that POPS when it becomes selected.
 *
 * Liking is the most repeated gesture in the whole app, so it is worth a real
 * moment: a fast squash, then a spring overshoot past full size, then settle.
 * Turning a like OFF gets a smaller, quieter dip — undoing something should
 * not feel as good as doing it. The bookmark gets the same answer.
 *
 * Driven by the VALUE changing, never by mount. The feed is a virtualised
 * list, so a mount-triggered animation would set off a wave of popping hearts
 * every time a card scrolled back into view. The resting scale is 1, so a
 * pop that never runs leaves the glyph exactly where it should be.
 *
 * A full 44pt box with no slop: the actions row is 44 tall and laid out on
 * that grid, so the glyphs land near the page's 16pt gutter (see `actions`).
 * Pressed, it dims to half, the plain glyph rule; the pop is the real
 * feedback.
 */
function IconButton({
  name,
  label,
  onPress,
  color = colors.text,
  filled,
  selected,
  style,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const prev = useRef(selected);

  useEffect(() => {
    if (selected === prev.current) return;
    const turnedOn = !!selected && prev.current !== undefined;
    prev.current = selected;
    if (reduced) return;
    scale.set(
      turnedOn
        ? withSequence(
            withTiming(0.8, { duration: 90, easing: Easing.in(Easing.quad) }),
            withSpring(1, { damping: 8, stiffness: 420, mass: 0.7 }),
          )
        : withSequence(
            withTiming(0.9, { duration: 90 }),
            withSpring(1, { damping: 14, stiffness: 300 }),
          ),
    );
  }, [selected, reduced, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed, style]}>
      <Animated.View style={animated}>
        <Icon name={name} size={24} color={color} filled={filled} />
      </Animated.View>
    </Pressable>
  );
}

/* ==================================================================== */
/* Double-tap heart                                                     */
/* ==================================================================== */

/** Two taps on the photo closer together than this are a like. */
const DOUBLE_TAP_MS = 260;
/** The burst's whole life. A JS timer unmounts it then, whatever the animation did. */
const BURST_MS = 900;
/**
 * When the fade starts: motion.base before the end, so the heart has faded
 * out just as the timer unmounts it. The pop and a short hold fill the
 * time before.
 */
const BURST_FADE_AT = BURST_MS - motion.base;

/**
 * The heart that answers a double tap on the photo. It answers a touch,
 * which is the motion v2 allows, and it is skipped under Reduce Motion
 * (the action row's heart still fills).
 *
 * ITS RESTING STATE IS "NOT MOUNTED". The card unmounts it on a JS timer
 * after BURST_MS rather than when its fade finishes: after a cold start in
 * a Release build Reanimated can stall for seconds while JS timers keep
 * running (specs/06-tab-switch-bug.md), and a stalled fade would have left
 * a heart printed on someone's photo.
 */
function HeartBurst() {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.set(withSequence(withSpring(1.1, motion.spring), withSpring(1, motion.spring)));
    opacity.set(withDelay(BURST_FADE_AT, withTiming(0, { duration: motion.base })));
  }, [scale, opacity]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.burstLayer}>
      <Animated.View style={animated}>
        <Icon name="heart" size={88} color={colors.textOnWine} filled />
      </Animated.View>
    </View>
  );
}

/* ==================================================================== */
/* PostCard                                                             */
/* ==================================================================== */

export interface PostCardProps {
  post: Post;
  /** The author's profile, from `useSocial().profiles`. */
  author?: UserProfile;
  onOpenDrink: (drinkId: string) => void;
  /** Omitted on a profile screen, where you're already looking at the author. */
  onOpenAuthor?: (authorId: string) => void;
  /** Overrides `post.photoPath` — only needed when the caller resolved it elsewhere. */
  photoPath?: string | null;
  /**
   * Called after a successful block, so the list can drop this author's cards
   * without waiting for a refetch. RLS already hides them from the NEXT query;
   * this only closes the gap until then, which would otherwise leave the
   * blocked person on screen and the block looking like it failed.
   */
  onBlocked?: (authorId: string) => void;
  /**
   * Called after you delete this post, so a screen that shows only this post
   * can leave. Lists need nothing: the store drops the post from the feed.
   */
  onDeleted?: (postId: string) => void;
}

type Timer = ReturnType<typeof setTimeout>;

export const PostCard = React.memo(function PostCard({
  post,
  author,
  onOpenDrink,
  onOpenAuthor,
  photoPath,
  onBlocked,
  onDeleted,
}: PostCardProps) {
  const myId = useAuth((s) => s.session?.user.id);
  const toggleLike = useSocial((s) => s.toggleLike);
  const removePost = useSocial((s) => s.removePost);
  const toggleSave = useSocial((s) => s.toggleSave);
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  /*
   * Whether the drink is in YOUR Dex, for the nameplate's status plaque.
   * Unknown (null, no plaque) while signed out or before the collection
   * has been read from disk, so a drink you have never shows "New to your
   * Dex" for a moment at launch.
   */
  const unlocked = useIsUnlocked(post.drinkId);
  const collectionReady = useCollection((s) => s.hydrated);
  const inDex = myId && collectionReady ? unlocked : null;

  /*
   * Optimistic overlay on the server's like state. The store only patches
   * the feed's copy of a post, so on a profile — which holds its own list —
   * a tap would otherwise look like it did nothing. Keyed by the server's
   * answer: once that catches up the overlay stops matching and quietly
   * drops out.
   *
   * A failed write clears the overlay. Without that, the store's rollback
   * restored the very key the overlay was stamped with, so the card went on
   * showing a like that never happened — and the next tap, meant as an
   * unlike, sent a second like.
   */
  const [flip, setFlip] = useState<{ key: string; on: boolean } | null>(null);
  const serverLiked = !!post.likedByMe;
  const likeKey = `${post.id}|${serverLiked ? 1 : 0}|${post.likes}`;
  const liked = flip?.key === likeKey ? flip.on : serverLiked;
  const likes = Math.max(0, post.likes + (liked === serverLiked ? 0 : liked ? 1 : -1));

  const onLike = useCallback(() => {
    // Signed out, nothing could be written, so nothing is shown as liked.
    if (!myId) return;
    haptic.tap();
    const next = { key: likeKey, on: !liked };
    setFlip(next);
    void toggleLike(myId, post.id, liked).then((ok) => {
      if (!ok) setFlip((f) => (f === next ? null : f));
    });
  }, [liked, likeKey, myId, post.id, toggleLike]);

  /*
   * The bookmark, on exactly the like's terms: an overlay keyed by the
   * server's answer, cleared when the write fails (or when the server has
   * no saves table, which toggleSave answers at once with false).
   */
  const [saveFlip, setSaveFlip] = useState<{ key: string; on: boolean } | null>(null);
  const serverSaved = !!post.savedByMe;
  const saveKey = `${post.id}|${serverSaved ? 1 : 0}`;
  const saved = saveFlip?.key === saveKey ? saveFlip.on : serverSaved;

  const onSave = useCallback(() => {
    if (!myId) return;
    haptic.select();
    const next = { key: saveKey, on: !saved };
    setSaveFlip(next);
    void toggleSave(myId, post.id, saved).then((ok) => {
      if (!ok) setSaveFlip((f) => (f === next ? null : f));
    });
  }, [myId, post.id, saveKey, saved, toggleSave]);

  /*
   * A post can now carry several photos of the same drink, newest first
   * (migration 007). `index` is which one is on screen; it resets when the
   * post's photo set changes so a card recycled by the virtualised list
   * cannot open on someone else's third picture.
   */
  const gallery = post.photoPaths?.length ? post.photoPaths : [];
  const galleryKey = gallery.join('|');
  /*
   * The page carries the photo set it belongs to, exactly as `flip` above
   * carries its like key, and for the same reason: the reset is then a
   * derivation rather than an effect.
   *
   * This was `useState(0)` plus `useEffect(() => setIndex(0), [galleryKey])`,
   * which React Compiler rejects — setting state synchronously inside an
   * effect renders the card once with the WRONG photo and then again with the
   * right one. In a virtualised feed that stale first frame is the recycling
   * bug the reset exists to prevent, so the effect was reintroducing on paint
   * the very thing it fixed on the next tick.
   */
  const [paged, setPaged] = useState<{ key: string; index: number } | null>(null);
  const index = paged?.key === galleryKey ? paged.index : 0;

  const current = gallery[index] ?? photoPath ?? post.photoPath;
  // `post` as the retry key: every refetch hands over a new object, so a
  // photo that failed to sign gets another try on pull-to-refresh.
  const photoUrl = useSignedPhoto(current, post);
  const hasGallery = gallery.length > 1;

  /*
   * Sign the rest of the gallery up front, so a tap to the next photo finds
   * its URL already in hand and paints at once instead of blanking the frame
   * for a round trip.
   */
  useEffect(() => {
    if (!galleryKey.includes('|')) return;
    for (const path of galleryKey.split('|')) void signedPhotoUrl(path);
  }, [galleryKey]);

  /*
   * The caption's "more". `expandedFor` names the post it was opened on,
   * so a card the list recycles for another post starts clamped again.
   * Whether the caption runs past two lines is read from a hidden,
   * unclamped copy of it (below), keyed by what it measured: a changed
   * caption reads as "not measured yet" rather than keeping the old answer.
   */
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === post.id;

  const drink = getDrink(post.drinkId);
  // A post can outrun its author's profile row; render it rather than crash.
  const who = author ?? {
    id: post.authorId,
    username: 'someone',
    displayName: 'Someone',
    accent: colors.wineSoft,
    joinedAt: '',
  };

  const captionKey = `${post.id}|${who.username}|${post.caption}`;
  const [measured, setMeasured] = useState<{ key: string; over: boolean } | null>(null);
  const overflows = measured?.key === captionKey && measured.over;
  const onMeasure = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const over = e.nativeEvent.lines.length > 2;
    setMeasured((m) => (m && m.key === captionKey && m.over === over ? m : { key: captionKey, over }));
  };

  /*
   * Taps on the photo. One tap pages a gallery; two within DOUBLE_TAP_MS
   * like the post (never unlike: a second double tap is not an undo) and
   * play the heart. A single-photo post has nothing for one tap to do, so
   * it never waits: only a gallery holds its page turn for DOUBLE_TAP_MS,
   * to see whether a second tap is coming.
   *
   * Timing on a plain Pressable rather than a gesture recogniser: a
   * double-tap recogniser needs a root GestureHandlerRootView, which this
   * app does not mount, and timing is enough for two taps.
   */
  const lastTap = useRef(0);
  const timers = useRef<{ page: Timer | null; burst: Timer | null }>({ page: null, burst: null });
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const t = timers.current;
    return () => {
      if (t.page) clearTimeout(t.page);
      if (t.burst) clearTimeout(t.burst);
    };
  }, []);

  const playBurst = () => {
    if (reduced) return;
    const t = timers.current;
    if (t.burst) clearTimeout(t.burst);
    // A new key per burst: a second double tap restarts the heart.
    setBurst((b) => b + 1);
    t.burst = setTimeout(() => {
      t.burst = null;
      setBurst(0);
    }, BURST_MS);
  };

  const onMediaPress = () => {
    const t = timers.current;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (t.page) clearTimeout(t.page);
      t.page = null;
      lastTap.current = 0;
      if (!myId) return;
      if (!liked) onLike();
      playBurst();
      return;
    }
    lastTap.current = now;
    if (!hasGallery) return;
    // Stamped now with the photo set it belongs to, as every page turn is.
    const next = { key: galleryKey, index: (index + 1) % gallery.length };
    if (t.page) clearTimeout(t.page);
    t.page = setTimeout(() => {
      t.page = null;
      haptic.select();
      setPaged(next);
    }, DOUBLE_TAP_MS);
  };

  /*
   * The paper airplane, and the menu's Share: the system share sheet with
   * one line of text. It says the act ("posted"), not the Dex number: the
   * number means something only inside the app.
   */
  const share = useCallback(() => {
    if (!drink) return;
    Share.share({
      message: `${who.displayName} posted ${drink.name} on Sipply.`,
    }).catch(() => {
      /* dismissed, or unsupported off-device */
    });
  }, [who.displayName, drink]);

  /*
   * Reason first, then file. A free-text-only report is unactionable at
   * review time, and a one-tap "report" with no reason is the shape that
   * gets abused as a downvote button.
   */
  const openReport = useCallback(() => {
    if (!myId) return;
    const file = (reason: ReportReason) => {
      void reportPost(myId, post.id, reason)
        .then(() =>
          Alert.alert('Thanks', 'This post has been reported. You can also block this person from the post menu.'),
        )
        .catch(() => Alert.alert('Could not report', 'Check your connection and try again.'));
    };
    const title = 'Report this post';
    const message =
      'What is wrong with it? Reports are reviewed privately; the poster is not told who reported them.';

    // A choice among six is an action sheet on iOS; an alert is for a yes or no.
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
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
    Alert.alert(title, message, [
      ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => file(r.key) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [myId, post.id]);

  const confirmBlock = useCallback(() => {
    if (!myId) return;
    // A true two-way confirmation, so it stays an alert on every platform.
    Alert.alert(
      `Block @${who.username}?`,
      'You will not see their posts and they will not see yours. Any follow between you is removed. You can undo this in Settings, under Blocked accounts.',
      [
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Block',
          style: 'destructive' as const,
          onPress: () => {
            void blockUser(myId, who.id)
              .then(() => {
                haptic.select();
                onBlocked?.(who.id);
              })
              .catch(() => Alert.alert('Could not block', 'Check your connection and try again.'));
          },
        },
      ],
    );
  }, [myId, who.id, who.username, onBlocked]);

  const confirmDelete = useCallback(() => {
    if (!myId) return;
    // Permanent, so a two-way alert on every platform, like Block.
    Alert.alert(
      'Delete this post?',
      'It is removed from your profile and from everyone\'s feed, with its photos. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Delete',
          style: 'destructive' as const,
          onPress: () => {
            void removePost(myId, post.id).then((ok) => {
              if (ok) {
                haptic.select();
                onDeleted?.(post.id);
              } else {
                Alert.alert('Could not delete', 'Check your connection and try again.');
              }
            });
          },
        },
      ],
    );
  }, [myId, post.id, removePost, onDeleted]);

  const openMenu = useCallback(() => {
    if (!drink) return;
    // Alert.alert is a no-op on web; go straight to the primary action there.
    if (Platform.OS === 'web') {
      onOpenDrink(drink.id);
      return;
    }
    /*
     * Moderation actions are offered only on OTHER people's posts. Offering
     * to report or block yourself is nonsense, and the server would reject
     * the block anyway (no_self_block).
     *
     * Report is not styled destructive: filing a report removes nothing.
     * Block is, because it takes a person out of your feed. On your own post
     * the destructive action is Delete.
     */
    const mine = who.id === myId;
    const actions: { text: string; onPress: () => void; destructive?: boolean }[] = [
      { text: 'Open in the Dex', onPress: () => onOpenDrink(drink.id) },
      { text: 'Share', onPress: share },
      ...(mine
        ? [{ text: 'Delete post', onPress: confirmDelete, destructive: true }]
        : [
            { text: 'Report post', onPress: openReport },
            { text: `Block @${who.username}`, onPress: confirmBlock, destructive: true },
          ]),
    ];

    // An overflow menu is an action sheet on iOS, anchored to the thumb.
    if (Platform.OS === 'ios') {
      const blockIndex = actions.findIndex((a) => a.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: drink.name,
          options: [...actions.map((a) => a.text), 'Cancel'],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: blockIndex >= 0 ? blockIndex : undefined,
        },
        (i) => actions[i]?.onPress(),
      );
      return;
    }
    Alert.alert(drink.name, undefined, [
      ...actions.map((a) => ({
        text: a.text,
        onPress: a.onPress,
        style: a.destructive ? ('destructive' as const) : ('default' as const),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [drink, onOpenDrink, share, who.id, who.username, myId, openReport, confirmBlock, confirmDelete]);

  /*
   * One rule for "draws nothing", shared with every list of posts
   * (isRenderablePost, lib/social): a list filters these out before they
   * become a cell, so a post whose drink is not in this build never leaves
   * an empty gap. `!drink` is the same test, kept for the type.
   */
  if (!isRenderablePost(post) || !drink) return null;

  const showCaption = !isBlankCaption(post.caption);
  /*
   * The photo's frame is chosen from the PATH, not the signed URL. While the
   * URL is on its way (`undefined`) the frame holds its place on the sunk
   * ground; only a post with no photo, or one that would not sign (`null`),
   * falls back to the drink's own face: its lit catalogue photo, else the
   * lit vector window, in the same 4:5 frame, never a coloured square.
   */
  const showPhoto = !!current && photoUrl !== null;
  const mediaH = Math.round(width / layout.feedPhotoAspect);
  const mediaLabel = hasGallery
    ? `Next photo of ${drink.name}, ${index + 1} of ${gallery.length}`
    : showPhoto
      ? `Photo of ${drink.name}`
      : drinkPhoto(drink.id)
        ? `Dex photo of ${drink.name}`
        : `Illustration of ${drink.name}`;
  // "Fizz · Highball glass · New Orleans, USA": sentence-case style, the glass said once.
  const meta = [styleLabel(drink.subcategory), glassPhrase(drink), drink.origin].filter(Boolean).join(' · ');

  const avatar = (
    <Avatar name={who.displayName} accent={who.accent} size={32} avatarPath={who.avatarPath} />
  );
  const captionText = (
    <>
      <Text style={styles.captionAuthor}>{who.username} </Text>
      {post.caption}
    </>
  );
  // Saving needs migration 017's table. The flag is settled by the fetch
  // that produced this post (toPosts asks about saves before it returns
  // any post), so it is known before any card renders.
  const canSave = savesSupported();

  return (
    <View style={styles.card}>
      {/*
        ---- Author row ----
        Who posted it, and when. The drink is no longer named here: the
        nameplate on the photo names it, in Playfair, with its number. The
        username opens their profile, with the avatar as a second
        way in that VoiceOver skips (the name beside it does the same
        thing). The short "· 2h" is for the eye; VoiceOver hears the time
        in words at the foot of the post.

        Without onOpenAuthor (a profile, where you are already looking at
        the author) the identity is plain text, read as one element: a
        disabled button there made VoiceOver call the name "dimmed".
      */}
      <View style={styles.author}>
        {onOpenAuthor ? (
          <Pressable
            onPress={() => onOpenAuthor(who.id)}
            hitSlop={6}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            {avatar}
          </Pressable>
        ) : (
          avatar
        )}
        <View style={styles.authorText}>
          {onOpenAuthor ? (
            <Pressable
              onPress={() => onOpenAuthor(who.id)}
              hitSlop={{ top: 12, bottom: 12, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${who.displayName}'s profile`}
              style={({ pressed }) => [styles.nameTarget, pressed && styles.textPressed]}>
              <Text style={styles.username} numberOfLines={1}>
                {who.username}
              </Text>
            </Pressable>
          ) : (
            <Text
              style={[styles.username, styles.nameTarget]}
              numberOfLines={1}
              accessibilityLabel={`${who.displayName}, @${who.username}`}>
              {who.username}
            </Text>
          )}
          <Text
            style={styles.when}
            numberOfLines={1}
            accessibilityElementsHidden
            importantForAccessibility="no">
            · {timeAgo(post.createdAt)}
          </Text>
        </View>
        <IconButton
          name="more"
          label="Post options"
          onPress={openMenu}
          color={colors.textMuted}
          style={styles.moreButton}
        />
      </View>

      {/*
        ---- The photo ----
        Full bleed, square-cornered, 4:5. One Pressable covers it, for the
        page turn and the double-tap like; nothing else is nested in it, so
        VoiceOver reads it as one element: the photo, or on a gallery the
        button that turns the page. Liking is always the heart below as
        well; the double tap is a shortcut, never the only way.

        The nameplate and the gallery count are SIBLINGS laid over it,
        outside that Pressable: the nameplate passes every tap that misses
        its name and status plaque down to the photo (its frame is
        box-none), and VoiceOver reads it after the photo, as its own button
        and then the plaque.
      */}
      <View style={styles.media}>
        <Pressable
          onPress={onMediaPress}
          accessibilityRole={hasGallery ? 'button' : 'image'}
          accessibilityLabel={mediaLabel}
          style={StyleSheet.absoluteFill}>
          {showPhoto ? (
            <Image
              source={
                photoUrl ? { uri: photoUrl, cacheKey: `${current}#${Math.round(width)}x${mediaH}` } : undefined
              }
              /*
               * Keyed on the storage path, not the URL. A signed URL carries a
               * fresh token every time it is minted, so keyed on the URL every
               * photo downloaded again after each launch and every hour. A path
               * never changes content — each upload gets a new name — so it is
               * a safe key, and the memory tier spares a remount the decode.
               *
               * And on the frame's size: the same path is drawn as a grid tile,
               * a Dex card and a story, and expo-image's SDWebImage hands a
               * smaller frame's early-resized decode to the next size that
               * misses its own entry (PostGridTile says how). This card's own
               * key keeps it from ever drawing a tile's picture at full width.
               */
              cachePolicy="memory-disk"
              // Pour photos are stored at up to 2048px; decode at the card's width.
              enforceEarlyResizing
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={motion.fast}
            />
          ) : (
            <DrinkFace
              drink={drink}
              mode="lit"
              width={width}
              height={mediaH}
              // The glass at 0.56 of the frame's width; VectorFace takes it as a share of the height.
              artScale={0.56 * layout.feedPhotoAspect}
              style={FACE_FILL}
            />
          )}
          {burst ? <HeartBurst key={burst} /> : null}
        </Pressable>
        <Nameplate
          name={drink.name}
          number={drink.dexNumber}
          meta={meta}
          inDex={inDex}
          onOpen={() => onOpenDrink(drink.id)}
        />
        {hasGallery ? (
          /*
           * Tap-to-advance rather than a swipe: this card already sits in a
           * vertically scrolling feed, and a horizontal pan inside it fights
           * the list for the gesture on every drag that is not perfectly
           * sideways. The count is a marker on the photo, scrim and bone, so
           * it holds over a white frame as well as a dark one; VoiceOver
           * hears it in the photo's own label.
           */
          <View pointerEvents="none" style={styles.galleryCount}>
            <MediaMarker text={`${index + 1}/${gallery.length}`} />
          </View>
        ) : null}
      </View>

      {/*
        ---- Actions ----
        Like and share on the left, save on the right, and nothing that only
        looks like a control: there is no comment glyph, because there is no
        thread to open. Share is the paper airplane (`send`, Sipply's own
        drawing): sending a post on, where the system's `share` glyph stays
        for sharing a link (Find friends' invite). The bookmark is real (the
        saves table and the Saved screen behind it), so it shows only where
        the server has that table.
      */}
      <View style={styles.actions}>
        <IconButton
          name="heart"
          label={liked ? 'Unlike' : 'Like'}
          onPress={onLike}
          filled={liked}
          selected={liked}
          color={liked ? colors.wine : colors.text}
        />
        <IconButton name="send" label="Share this post" onPress={share} />
        <View style={styles.actionsSpacer} />
        {canSave ? (
          <IconButton
            name="bookmark"
            label={saved ? 'Remove from saved' : 'Save'}
            onPress={onSave}
            filled={saved}
            selected={saved}
          />
        ) : null}
      </View>

      {/*
        ---- Likes, caption, time ----
        Likes and caption only when there is something to say: a new post
        has no "0 likes" line, and an uncaptioned one no stock sentence. The
        like figure is ink, not wine: the filled wine heart right above it
        already says whether you liked it.
      */}
      {likes > 0 ? (
        <Text style={styles.likes}>
          {likes} {likes === 1 ? 'like' : 'likes'}
        </Text>
      ) : null}
      {showCaption ? (
        <View style={styles.captionBlock}>
          <Text style={styles.caption} numberOfLines={expanded ? undefined : 2}>
            {captionText}
          </Text>
          {expanded ? null : (
            /*
             * The measuring copy: unclamped, invisible and unreachable, laid
             * over the real one at the same width, so its line count says
             * whether the clamp is hiding anything.
             */
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.captionMeasure}>
              <Text style={styles.caption} onTextLayout={onMeasure}>
                {captionText}
              </Text>
            </View>
          )}
          {!expanded && overflows ? (
            <Pressable
              onPress={() => setExpandedFor(post.id)}
              // 12 above and below a 22pt line: the 44pt touch floor, near enough.
              hitSlop={{ top: 12, bottom: 12, right: 24 }}
              accessibilityRole="button"
              accessibilityLabel="More"
              accessibilityHint="Shows the whole caption"
              style={({ pressed }) => [styles.textTarget, pressed && styles.textPressed]}>
              <Text style={styles.more}>more</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.time}>{timeAgoSpoken(post.createdAt)}</Text>
    </View>
  );
});

/* ==================================================================== */

const styles = StyleSheet.create({
  /*
   * No card chrome and no fill: the post sits straight on the paper (its
   * grain shows through), its photo running edge to edge, the way a feed
   * of pictures is read. Home puts a 12pt sunk gap between two posts.
   */
  card: { paddingBottom: space.lg },
  pressed: { opacity: 0.5 },

  /* Author: a 52pt row; the more button reaches the row's right edge. */
  author: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.gutter,
    gap: 10,
  },
  authorText: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  /* Gives way to the time beside it, which never wraps: the name ellipsizes instead. */
  nameTarget: { flexShrink: 1 },
  /* Hugs its text, so the target is the words and not the empty row beside them. */
  textTarget: { alignSelf: 'flex-start', maxWidth: '100%' },
  textPressed: { opacity: 0.5 },
  username: { ...textRole.username, color: colors.text },
  when: { ...textRole.prose, flexShrink: 0, color: colors.textMuted },
  /*
   * Pulled out to the actions row's 8pt inset, so its glyph stands on the
   * same vertical line as the bookmark's below it rather than 8pt inside.
   */
  moreButton: { marginRight: space.sm - layout.gutter },

  /* Media: the 4:5 frame, sunk while a photo is on its way. */
  media: {
    width: '100%',
    aspectRatio: layout.feedPhotoAspect,
    overflow: 'hidden',
    backgroundColor: colors.bgSunk,
  },
  galleryCount: { position: 'absolute', top: space.md, right: space.md },
  burstLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Actions: 8pt in, so each 24pt glyph in its 44pt box sits near the 16pt gutter. */
  actions: {
    height: layout.hit,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
  actionsSpacer: { flex: 1 },
  iconBtn: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Copy */
  likes: { ...textRole.username, paddingHorizontal: layout.gutter, color: colors.text },
  captionBlock: { paddingHorizontal: layout.gutter, paddingTop: space.xs },
  caption: { ...textRole.prose, color: colors.text },
  /* Insets count from the block's padding edge, not its content, so the gutter and top are restated. */
  captionMeasure: {
    position: 'absolute',
    top: space.xs,
    left: layout.gutter,
    right: layout.gutter,
    opacity: 0,
  },
  captionAuthor: { fontFamily: fonts.bodySemiBold },
  more: { ...textRole.prose, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  time: {
    ...textRole.helper,
    paddingHorizontal: layout.gutter,
    paddingTop: space.xs,
    color: colors.textMuted,
  },
});

export default PostCard;
