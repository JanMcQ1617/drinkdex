import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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

import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { Icon, type IconName } from '@/components/icons';
import { LikersSheet } from '@/components/LikersSheet';
import { ActionSheet, type SheetAction } from '@/components/Sheet';
import { MediaMarker } from '@/components/media';
import { formatPlateNumber } from '@/components/plate';
import { announce, Avatar, haptic } from '@/components/ui';
import { colors, layout, motion, onMedia, space, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { photoFor } from '@/data/drinkPhotos';
import { blockUser, REPORT_REASONS, reportPost, type ReportReason } from '@/lib/moderation';
import {
  isBlankCaption,
  isRenderablePost,
  savesSupported,
  signedPhotoUrl,
  timeAgo,
  timeAgoSpoken,
} from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/*
 * Re-exported so the screens that import the time helpers from here
 * (Activity, the reel cells, the profile grids, the story viewer) keep
 * working. They live in lib/social, where the likers sheet reads them too.
 */
export { timeAgo, timeAgoSpoken };

/* ==================================================================== */
/* A post                                                               */
/*                                                                      */
/* LESS STUFF (layout spec 5.1 and 5.4; Jan: "I want less stuff"). The  */
/* photo and the drink's name are the post; everything else is quieter  */
/* or one tap away.                                                     */
/*                                                                      */
/*   feed    the print (4:5, square corners, the photo edge), one line  */
/*           with the name in Playfair on the left and the author small */
/*           and muted on the right, on one baseline, then the heart,   */
/*           the like count, the bookmark and •••. Seven elements.      */
/*   detail  the post page: the author row (face, name, •••) above the  */
/*           print, the name, the whole caption, the heart and count.   */
/*                                                                      */
/* What left the feed, and where it went: the time and the place to the */
/* ••• sheet's header; the Nº, "In your Dex", style and origin to the   */
/* drink page (tap the name); the liked-by faces to the likers sheet    */
/* (tap the count); the caption to the post page; Share to •••.         */
/*                                                                      */
/* No red anywhere: a liked heart is the solid ink heart.               */
/* ==================================================================== */

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
 * pop that never runs leaves the glyph exactly where it should be. It runs
 * on the UI thread (Reanimated), never on a JS clock.
 *
 * A full 44pt box with no slop, so the rows can be laid out on that grid.
 * Pressed, it dims to half, the plain glyph rule; the pop is the real
 * feedback.
 */
function IconButton({
  name,
  label,
  onPress,
  size = GLYPH,
  filled,
  selected,
  accessibilityHint,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  filled?: boolean;
  selected?: boolean;
  accessibilityHint?: string;
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
        : withSequence(withTiming(0.9, { duration: 90 }), withSpring(1, { damping: 14, stiffness: 300 })),
    );
  }, [selected, reduced, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
      <Animated.View style={animated}>
        <Icon name={name} size={size} color={colors.text} filled={filled} />
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

/** The burst's heart, and the white ring round it. */
const BURST = 88;
const BURST_RING = 3;

/**
 * The heart that answers a double tap on the photo. It answers a touch,
 * and it is skipped under Reduce Motion (the action row's heart still
 * fills). Drawn as the plates over a photo are (onMedia): solid ink with
 * a white ring, a white heart a little larger laid under the ink one, so
 * it holds on a pale daylight print and on a dark bar photo alike.
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
      <Animated.View style={[styles.burst, animated]}>
        <Icon name="heart" size={BURST + 2 * BURST_RING} color={onMedia.ring} filled />
        <View style={styles.burstInk}>
          <Icon name="heart" size={BURST} color={onMedia.fill} filled />
        </View>
      </Animated.View>
    </View>
  );
}

/* ==================================================================== */
/* PostCard                                                             */
/* ==================================================================== */

/** The heart is 28 (layout spec 5.1); the bookmark and ••• are 24. */
const HEART = 28;
const GLYPH = 24;
/**
 * The actions row is inset so a 24pt glyph in its 44pt box ends on the
 * print's edge (••• at x 392 to 416 on a 440 screen), and so the heart's
 * box starts 14 in, which puts the 28pt heart at x 22 and the count at 58.
 */
const ACTIONS_INSET = layout.gutter - (layout.hit - GLYPH) / 2;
/** The actions' visible band (the 28pt heart, with a point either side), 14 under the name line. */
const ACTIONS_BAND = 30;
const BAND_SLACK = (layout.hit - ACTIONS_BAND) / 2;
/** The author's face on the post page. */
const AUTHOR_AVATAR = 32;
const AUTHOR_SLACK = (layout.hit - AUTHOR_AVATAR) / 2;
/** The gallery count's corner, inside the print. */
const COUNT_INSET = space.sm;
/** Dynamic Type cap for the Playfair name under the print (spec 6.5). */
const NAME_CAP = 1.3;
/** The name's one line (nameLg, 34) less the 44pt target, split above and below it. */
const NAME_SLACK = Math.max(0, (layout.hit - textRole.nameLg.lineHeight) / 2);
const NAME_SLOP = { top: NAME_SLACK, bottom: NAME_SLACK };

export interface PostCardProps {
  post: Post;
  /** The author's profile, from `useSocial().profiles`. */
  author?: UserProfile;
  onOpenDrink: (drinkId: string) => void;
  /** Omitted where you are already looking at the author. */
  onOpenAuthor?: (authorId: string) => void;
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
  /** 'feed' (Home) or 'detail' (the post page). See the header note. */
  variant?: 'feed' | 'detail';
}

type Timer = ReturnType<typeof setTimeout>;

export const PostCard = React.memo(function PostCard({
  post,
  author,
  onOpenDrink,
  onOpenAuthor,
  onBlocked,
  onDeleted,
  variant = 'feed',
}: PostCardProps) {
  const myId = useAuth((s) => s.session?.user.id);
  const toggleLike = useSocial((s) => s.toggleLike);
  const removePost = useSocial((s) => s.removePost);
  const toggleSave = useSocial((s) => s.toggleSave);
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const detail = variant === 'detail';

  /*
   * Optimistic overlay on the server's like state. The store only patches
   * the feed's copy of a post, so on the post page — which holds its own
   * copy — a tap would otherwise look like it did nothing. Keyed by the
   * server's answer: once that catches up the overlay stops matching and
   * quietly drops out.
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
   * Who liked it: null until the count is first tapped, then open or
   * closed. The sheet mounts on that first tap and stays mounted, so a
   * feed of a hundred cards holds no hundred Modals, and a close still
   * gets UIKit's slide down and the sheet's after-dismiss navigation.
   */
  const [likersOpen, setLikersOpen] = useState<boolean | null>(null);
  const openLikers = useCallback(() => setLikersOpen(true), []);
  const closeLikers = useCallback(() => setLikersOpen(false), []);

  /*
   * The ••• sheet: null until first opened (then mounted for good, as the
   * likers), and which page it shows: the post's menu, or Report's reasons
   * (the same sheet, its page turned). The page outlives a close, so the
   * sheet fades out showing what it showed.
   */
  const [menu, setMenu] = useState<{ open: boolean; page: 'post' | 'report' } | null>(null);
  const openMenu = useCallback(() => setMenu({ open: true, page: 'post' }), []);
  const closeMenu = useCallback(() => setMenu((m) => (m ? { ...m, open: false } : m)), []);

  /*
   * A post can carry several photos of the same drink, newest first
   * (migration 007). `index` is which one is on screen; it resets when the
   * post's photo set changes so a card recycled by the virtualised list
   * cannot open on someone else's third picture.
   *
   * The page carries the photo set it belongs to, exactly as `flip` above
   * carries its like key, so the reset is a derivation rather than an
   * effect (React Compiler rejects the setState-in-effect version, which
   * painted one frame of the wrong photo first).
   */
  const gallery = post.photoPaths?.length ? post.photoPaths : [];
  const galleryKey = gallery.join('|');
  const [paged, setPaged] = useState<{ key: string; index: number } | null>(null);
  const index = paged?.key === galleryKey ? paged.index : 0;

  const current = gallery[index] ?? post.photoPath;
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

  const drink = getDrink(post.drinkId);
  // A post can outrun its author's profile row; render it rather than crash.
  const who = author ?? {
    id: post.authorId,
    username: 'someone',
    displayName: 'Someone',
    accent: colors.tone2,
    joinedAt: '',
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
   * The menu's Share: the system share sheet with one line of text. It
   * says the act ("posted"), not the Dex number: the number means
   * something only inside the app.
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
   * gets abused as a downvote button. The reasons are the menu's second
   * page (`report`); a reason runs once the sheet has gone.
   */
  const fileReport = useCallback(
    (reason: ReportReason) => {
      if (!myId) return;
      void reportPost(myId, post.id, reason)
        .then(() =>
          Alert.alert('Thanks', 'This post has been reported. You can also block this person from the post menu.'),
        )
        .catch(() => Alert.alert('Could not report', 'Check your connection and try again.'));
    },
    [myId, post.id],
  );

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
      "It is removed from your profile and from everyone's feed, with its photos. This cannot be undone.",
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

  /*
   * One rule for "draws nothing", shared with every list of posts
   * (isRenderablePost, lib/social): a list filters these out before they
   * become a cell, so a post whose drink is not in this build never leaves
   * an empty gap. `!drink` is the same test, kept for the type.
   */
  if (!isRenderablePost(post) || !drink) return null;

  // Saving needs migration 017's table. The flag is settled by the fetch
  // that produced this post (toPosts asks about saves before it returns
  // any post), so it is known before any card renders.
  const canSave = !!myId && savesSupported();
  const mine = !!myId && who.id === myId;

  /*
   * Everything the old menu did, and Save, in the order the layout spec
   * gives (Comment and Edit are left out: neither exists on the server).
   * Moderation is offered only on OTHER people's posts: reporting or
   * blocking yourself is nonsense, and the server rejects a self-block
   * (no_self_block). Delete, Report and Block are the destructive words,
   * ink and underlined; Delete and Block go on to the system's confirm.
   */
  const menuActions: SheetAction[] = [
    { label: 'Share', onPress: share },
    ...(canSave ? [{ label: saved ? 'Remove from saved' : 'Save', onPress: onSave }] : []),
    { label: 'View drink', detail: formatPlateNumber(drink.dexNumber), onPress: () => onOpenDrink(drink.id) },
    ...(mine
      ? [{ label: 'Delete', destructive: true, onPress: confirmDelete }]
      : myId
        ? [
            {
              label: 'Report',
              destructive: true,
              stay: true,
              onPress: () => {
                setMenu({ open: true, page: 'report' });
                announce('Report this post. What is wrong with it?');
              },
            },
            { label: `Block @${who.username}`, destructive: true, onPress: confirmBlock },
          ]
        : []),
  ];
  const reasonActions: SheetAction[] = REPORT_REASONS.map((r) => ({
    label: r.label,
    onPress: () => fileReport(r.key),
  }));

  /*
   * The photo's frame is chosen from the PATH, not the signed URL. While the
   * URL is on its way (`undefined`) the frame holds its place on the wash;
   * only a post with no photo, or one that would not sign (`null`), falls
   * back to the drink's own face: its daylight print, else the no-photo
   * face, in the same 4:5 frame.
   */
  const showPhoto = !!current && photoUrl !== null;
  // The print column: the screen less its two gutters (392 at 440), at 4:5 (490).
  const printW = Math.round(width - 2 * layout.gutter);
  const mediaH = Math.round(printW / layout.feedPhotoAspect);
  const mediaLabel = hasGallery
    ? `Next photo of ${drink.name}, ${index + 1} of ${gallery.length}`
    : showPhoto
      ? `Photo of ${drink.name}`
      : photoFor(drink.id)
        ? `Dex photo of ${drink.name}`
        : `Illustration of ${drink.name}`;

  const when = timeAgoSpoken(post.createdAt);
  const likesSpoken = `${formatCount(likes)} ${likes === 1 ? 'like' : 'likes'}`;
  /*
   * The count opens the likers sheet once the server can name them
   * (migration 021: Post.likedBy is defined). Before that it is the plain
   * count, not a button, since there is no list to open.
   */
  const listable = likes > 0 && post.likedBy !== undefined;

  const more = <IconButton name="more" label="Post options" onPress={openMenu} />;

  const heart = (
    <IconButton
      name="heart"
      label="Like"
      onPress={onLike}
      size={HEART}
      filled={liked}
      selected={liked}
    />
  );

  const count =
    likes <= 0 ? null : listable ? (
      <Pressable
        onPress={openLikers}
        // The row is 44 tall; slop to the right reaches past the figure's few points.
        hitSlop={{ right: space.lg }}
        accessibilityRole="button"
        accessibilityLabel={likesSpoken}
        accessibilityHint="Shows who liked this"
        style={({ pressed }) => [styles.count, pressed && styles.pressed]}>
        <Text style={styles.countText}>{formatCount(likes)}</Text>
      </Pressable>
    ) : (
      <View style={styles.count}>
        <Text style={styles.countText} accessibilityLabel={likesSpoken}>
          {formatCount(likes)}
        </Text>
      </View>
    );

  /*
   * The print. One Pressable covers it, for the page turn and the double-tap
   * like; nothing else is nested in it, so VoiceOver reads it as one
   * element: the photo, or on a gallery the button that turns the page.
   * Liking is always the heart below as well; the double tap is a shortcut,
   * never the only way. No words on the photo (white spec D5): the gallery
   * count is a solid ink marker, and the name hangs under the print.
   */
  const print = (
    <Print width={printW} height={mediaH} style={detail ? styles.printDetail : styles.printFeed}>
      <Pressable
        onPress={onMediaPress}
        accessibilityRole={hasGallery ? 'button' : 'image'}
        accessibilityLabel={mediaLabel}
        style={StyleSheet.absoluteFill}>
        {showPhoto ? (
          <Image
            accessibilityIgnoresInvertColors
            source={photoUrl ? { uri: photoUrl, cacheKey: `${current}#${printW}x${mediaH}` } : undefined}
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
            // Pour photos are stored at up to 2048px; decode at the print's width.
            enforceEarlyResizing
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={reduced ? 0 : motion.fast}
          />
        ) : (
          <DrinkFace
            drink={drink}
            mode="photo"
            width={printW}
            height={mediaH}
            // The glass at 0.56 of the frame's width; VectorFace takes it as a share of the height.
            artScale={0.56 * layout.feedPhotoAspect}
            style={FACE_FILL}
          />
        )}
        {burst ? <HeartBurst key={burst} /> : null}
      </Pressable>
      {hasGallery ? (
        /*
         * Tap-to-advance rather than a swipe: this card already sits in a
         * vertically scrolling feed, and a horizontal pan inside it fights
         * the list for the gesture on every drag that is not perfectly
         * sideways. VoiceOver hears the count in the photo's own label.
         */
        <View pointerEvents="none" style={styles.galleryCount}>
          <MediaMarker text={`${index + 1}/${gallery.length}`} />
        </View>
      ) : null}
    </Print>
  );

  // The name under the print: a wall label, opening the drink page, where its Nº, state, style and origin went.
  const name = (
    <Pressable
      onPress={() => onOpenDrink(drink.id)}
      hitSlop={NAME_SLOP}
      accessibilityRole="button"
      accessibilityLabel={drink.name}
      accessibilityHint="Opens the drink"
      style={({ pressed }) => [styles.nameTarget, pressed && styles.pressed]}>
      <DrinkName name={drink.name} role={textRole.nameLg} measure={printW} cap={NAME_CAP} color={colors.text} />
    </Pressable>
  );

  const sheets = (
    <>
      {likersOpen === null ? null : (
        <LikersSheet postId={post.id} visible={likersOpen} onClose={closeLikers} likes={likes} />
      )}
      {menu === null ? null : (
        <ActionSheet
          visible={menu.open}
          onClose={closeMenu}
          title={menu.page === 'report' ? 'Report this post' : undefined}
          header={
            menu.page === 'report'
              ? 'What is wrong with it? Reports are reviewed privately; the poster is not told who reported them.'
              : `${who.username} · ${timeAgo(post.createdAt)}`
          }
          // "2h" is read as "2 h"; the spoken line says the time in words.
          headerLabel={menu.page === 'report' ? undefined : `${who.username}, ${when}`}
          actions={menu.page === 'report' ? reasonActions : menuActions}
        />
      )}
    </>
  );

  if (detail) {
    /*
     * The post page (layout spec 5.4): nine elements at rest. The ••• moved
     * from the bar to the end of the author row; Save lives in it here,
     * where the feed keeps its bookmark.
     */
    return (
      <View style={styles.cardDetail}>
        <View style={styles.authorRow}>
          <AuthorIdentity who={who} when={when} onOpenAuthor={onOpenAuthor} />
          {more}
        </View>
        {print}
        <View style={styles.detailName}>{name}</View>
        {isBlankCaption(post.caption) ? null : <Text style={styles.caption}>{post.caption}</Text>}
        <View style={[styles.actions, styles.actionsDetail]}>
          {heart}
          {count}
        </View>
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.cardFeed}>
      {print}
      {/*
        One line under the print: the name left, the author right, on one
        baseline. The name wraps (never cut); if name and author will not
        share the line, the author drops under it.
      */}
      <View style={styles.line}>
        {name}
        {onOpenAuthor ? (
          <Pressable
            onPress={() => onOpenAuthor(who.id)}
            hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${who.username}, ${when}`}
            accessibilityHint="Opens their profile"
            style={({ pressed }) => [styles.byline, pressed && styles.pressed]}>
            <Text numberOfLines={1} style={styles.bylineText}>
              {who.username}
            </Text>
          </Pressable>
        ) : (
          <Text numberOfLines={1} accessibilityLabel={`${who.username}, ${when}`} style={[styles.byline, styles.bylineText]}>
            {who.username}
          </Text>
        )}
      </View>
      {/*
        Heart and count on the left; the bookmark (only where the server has
        saves) and ••• on the right. No comment or share glyph: there is no
        thread to open, and Share is in •••.
      */}
      <View style={[styles.actions, styles.actionsFeed]}>
        {heart}
        {count}
        <View style={styles.spacer} />
        {canSave ? (
          <IconButton
            name="bookmark"
            label="Save"
            onPress={onSave}
            filled={saved}
            selected={saved}
          />
        ) : null}
        {more}
      </View>
      {sheets}
    </View>
  );
});

/**
 * The post page's author: the face and the name, one button to their
 * profile, spoken with the time ("ines.ag, 2 hours ago"). Without
 * onOpenAuthor it is plain, read as one element: a disabled button made
 * VoiceOver call the name "dimmed".
 */
function AuthorIdentity({
  who,
  when,
  onOpenAuthor,
}: {
  who: UserProfile;
  when: string;
  onOpenAuthor?: (authorId: string) => void;
}) {
  const body = (
    <>
      <Avatar name={who.displayName} accent={who.accent} size={AUTHOR_AVATAR} avatarPath={who.avatarPath} />
      <Text numberOfLines={1} style={styles.authorName}>
        {who.username}
      </Text>
    </>
  );
  if (!onOpenAuthor) {
    return (
      <View accessible accessibilityLabel={`${who.username}, ${when}`} style={styles.identity}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onOpenAuthor(who.id)}
      accessibilityRole="button"
      accessibilityLabel={`${who.username}, ${when}`}
      accessibilityHint="Opens their profile"
      style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  /*
   * No card chrome and no fill: the post stands on the page, and posts are
   * set apart by space alone (layout principle 3): 32 from the actions' band
   * to the next print, less the row's slack under the band.
   */
  cardFeed: { paddingBottom: layout.section - BAND_SLACK },
  cardDetail: { paddingBottom: space.xl },
  pressed: { opacity: 0.5 },

  /* The print, centred in the 392 column (Print draws the wash and the photo edge). */
  printFeed: { alignSelf: 'center' },
  /* 16 under the author row's 32pt face, less the row's slack. */
  printDetail: { alignSelf: 'center', marginTop: space.lg - AUTHOR_SLACK },
  galleryCount: { position: 'absolute', top: COUNT_INSET, right: COUNT_INSET },
  burstLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: { alignItems: 'center', justifyContent: 'center' },
  burstInk: { position: 'absolute' },

  /*
   * The feed's line: 16 under the print. Wraps, so a long name keeps its
   * whole column and the author drops under it; baseline-aligned, so the
   * small author sits on the Playfair name's first baseline.
   */
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.md,
    rowGap: space.xs,
    marginTop: space.lg,
    paddingHorizontal: layout.gutter,
  },
  /* Hugs the name, so the target is the words and not the empty row beside them. */
  nameTarget: { flexShrink: 1, maxWidth: '100%' },
  byline: { flexShrink: 0, maxWidth: '100%' },
  bylineText: { ...textRole.small, color: colors.textMuted },

  /*
   * Actions: each glyph in its 44pt box; the band is 14 under the line.
   * A floor, not a height, so the count at the largest text sizes pushes
   * the row taller instead of running over the next print.
   */
  actions: {
    minHeight: layout.hit,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ACTIONS_INSET,
  },
  actionsFeed: { marginTop: 14 - BAND_SLACK },
  /* 16 under the caption, less the heart box's slack around the 28pt glyph. */
  actionsDetail: { marginTop: space.lg - (layout.hit - HEART) / 2 },
  spacer: { flex: 1 },
  iconBtn: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { minHeight: layout.hit, justifyContent: 'center' },
  countText: { ...textRole.body, ...tabular, color: colors.text },

  /* The post page's author row: 32 face at the gutter, the name 12 after it, ••• on the far edge. */
  authorRow: {
    minHeight: layout.hit,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.sm - AUTHOR_SLACK,
    paddingLeft: layout.gutter,
    paddingRight: ACTIONS_INSET,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: layout.hit },
  authorName: { ...textRole.bodyStrong, flexShrink: 1, color: colors.text },
  /* 24 under the print, then the caption 8 under the name. */
  detailName: { marginTop: space.xl, paddingHorizontal: layout.gutter, alignItems: 'flex-start' },
  caption: {
    ...textRole.body,
    marginTop: space.sm,
    paddingHorizontal: layout.gutter,
    color: colors.text,
  },
});

export default PostCard;
