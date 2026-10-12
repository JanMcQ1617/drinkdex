import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
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

import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { Icon, type IconName } from '@/components/icons';
import { LikersSheet } from '@/components/LikersSheet';
import { ActionSheet, type SheetAction } from '@/components/Sheet';
import { MediaMarker } from '@/components/media';
import { formatPlateNumber } from '@/components/plate';
import { announce, Avatar, haptic } from '@/components/ui';
import { colors, fonts, layout, motion, onMedia, radius, space, stroke, textRole } from '@/constants/theme';
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
import { clampToLines, textWidth } from '@/lib/textFit';
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
/* INSTAGRAM'S ANATOMY in Daylight's black and white (v4.1; Jan: "make  */
/* it look the same as instagram"; specs/v4-mockups/home-ig). Top to    */
/* bottom, at 440 wide:                                                 */
/*                                                                      */
/*   header    52: the face (in a 2pt ink ring when they have a story   */
/*             you have not seen), the username over the drink in       */
/*             Playfair, where Instagram puts a place, and •••.         */
/*   photo     440 x 440, full bleed, square corners, the photo edge.   */
/*   actions   44: heart, share · · · bookmark. The gallery's dots sit  */
/*             in the middle.                                           */
/*   liked by  22: one face (migration 021 names one liker) and         */
/*             "Liked by maya.pours and 23 others".                     */
/*   caption   the username in 600, then the words: two lines and       */
/*             "… more", cut before layout (lib/textFit), opened in     */
/*             place by a tap.                                          */
/*   time      "2 hours ago", muted. Then a 14pt foot.                  */
/*                                                                      */
/* 616 tall with a one-line caption, 634 with two. The post page        */
/* (variant 'detail') is the same card with its caption opened.         */
/*                                                                      */
/* NO COMMENTS YET. There is no comments table and no thread (home-ig   */
/* 5.6), so while COMMENTS_ENABLED is false there is no comment glyph   */
/* and no "View all N comments": no dead control.                       */
/*                                                                      */
/* No red anywhere: a liked heart is the solid ink heart.               */
/* ==================================================================== */

/**
 * Comments are not built (home-ig 5.6). Until they are, the actions row is
 * heart · share · · · bookmark and no comments line draws. When true, the
 * glyph sits second (51 to 95) and the line shows under a caption once a
 * post has comments, for a screen that passes `onOpenComments`.
 */
const COMMENTS_ENABLED: boolean = false;

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
/* Measures (home-ig 2.4, at 440 wide)                                  */
/* ==================================================================== */

/** Home's text column: 16 to 424. */
const GUTTER = layout.feedGutter;
/** All four action glyphs are 26 (heart, comment, share, bookmark); the header's ••• is 24. */
const GLYPH = 26;
const MORE_GLYPH = 24;
/** The actions' 44pt boxes start 7 in, so the heart's glyph starts on the column (16) and the bookmark's ends on it (424). */
const ACTIONS_INSET = GUTTER - (layout.hit - GLYPH) / 2;
/** The header's ••• box ends 6 in, so its 24pt glyph ends on the column too. */
const MORE_INSET = GUTTER - (layout.hit - MORE_GLYPH) / 2;

/** The header row, the face and the story ring round it: 2pt ink, a 2pt gap, 40 outer at x 12, y 6. */
const HEADER_H = 52;
const HEADER_AVATAR = 32;
const STORY_RING_GAP = 2;
const STORY_RING = HEADER_AVATAR + 2 * (stroke.ring + STORY_RING_GAP);
const STORY_RING_AT = -(stroke.ring + STORY_RING_GAP);
/** The 32pt face reaches a 44pt target. */
const AVATAR_SLOP = (layout.hit - HEADER_AVATAR) / 2;
/** The header's two 18pt lines take the row's spare 8 above the name and 8 under the drink. */
const LINE_SLOP = (HEADER_H - 2 * textRole.small.lineHeight) / 2;
/** Dynamic Type cap for the header's two lines: they sit beside a fixed-size face (specs/v3-cabinet.md 6.5). */
const HEADER_CAP = 1.3;

/** The gallery's "1/3" marker, 12 in from the photo's top right corner. */
const COUNT_INSET = 12;
/** The gallery's dots, centred on the actions row: 6pt, 4 apart. Decorative. */
const DOT = 6;
const DOT_GAP = 4;

/** Liked by: up to three 18pt faces, each in a 2pt page ring (22), 14 apart, so each overlaps the one before by 8. */
const FACE = 18;
const FACE_RING = 2;
const FACE_OUTER = FACE + 2 * FACE_RING;
const FACE_STRIDE = 14;
const MAX_FACES = 3;
/** The liked-by line reaches 44 with 11 of slop above and below its 22. */
const LIKED_SLOP = (layout.hit - FACE_OUTER) / 2;

/** The caption's two lines, and the words the cut ends in ("… " then "more" in muted). */
const CAPTION_LINES = 2;
const CUT_MARK = '… ';
const MORE_WORD = 'more';
/** Between the liked-by row's foot, the caption, the comments line and the time. */
const LINE_GAP = space.xs;
/** A post's foot: space only, then the next header. */
const FOOT = 14;

/* ==================================================================== */
/* PostCard                                                             */
/* ==================================================================== */

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
  /** 'feed' (Home) or 'detail' (the post page): the same card, the detail's caption opened. */
  variant?: 'feed' | 'detail';
  /**
   * Whether the author has a story in Home's row today (groupPours'
   * storyMap): 'unseen' rings their face in ink, and either makes the face
   * open the story rather than the profile. Omitted: no story.
   */
  story?: 'unseen' | 'seen';
  /** Opens the author's story (the viewer); used when `story` is set. */
  onOpenStory?: (authorId: string) => void;
  /** The comment thread, once comments exist; read only while COMMENTS_ENABLED. */
  onOpenComments?: (postId: string) => void;
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
  story,
  onOpenStory,
  onOpenComments,
}: PostCardProps) {
  const myId = useAuth((s) => s.session?.user.id);
  const toggleLike = useSocial((s) => s.toggleLike);
  const removePost = useSocial((s) => s.removePost);
  const toggleSave = useSocial((s) => s.toggleSave);
  const reduced = useReducedMotion();
  const { width, fontScale } = useWindowDimensions();
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
   * Who liked it: null until the liked-by line is first tapped, then open
   * or closed. The sheet mounts on that first tap and stays mounted, so a
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
   * The caption, opened in place by a tap on it. Keyed by the post, as the
   * like's `flip` is, so a cell the virtualised list recycles for another
   * post cannot open on someone else's caption.
   */
  const [openedFor, setOpenedFor] = useState<string | null>(null);

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
   * The share glyph: the system share sheet with one line of text. It
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
  const comments = COMMENTS_ENABLED && onOpenComments ? onOpenComments : null;

  /*
   * Everything the old menu did, and Save, in the order the layout spec
   * gives (Comment and Edit are left out: neither exists on the server;
   * Share left for the glyph in the actions row). Moderation is offered
   * only on OTHER people's posts: reporting or blocking yourself is
   * nonsense, and the server rejects a self-block (no_self_block).
   * Delete, Report and Block are the destructive words, ink and
   * underlined; Delete and Block go on to the system's confirm.
   */
  const menuActions: SheetAction[] = [
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
   * face, in the same square frame.
   */
  const showPhoto = !!current && photoUrl !== null;
  // Full bleed: the screen's width, square (440 x 440).
  const printW = Math.round(width);
  const mediaH = Math.round(printW / layout.feedPhotoAspect);
  const mediaLabel = hasGallery
    ? `Next photo of ${drink.name}, ${index + 1} of ${gallery.length}`
    : showPhoto
      ? `Photo of ${drink.name}`
      : photoFor(drink.id)
        ? `Dex photo of ${drink.name}`
        : `Illustration of ${drink.name}`;

  const when = timeAgoSpoken(post.createdAt);
  /*
   * The liked-by line opens the likers sheet once the server can name
   * them (migration 021: Post.likedBy is defined). Before that it is the
   * plain count, not a button, since there is no list to open.
   */
  const listable = likes > 0 && post.likedBy !== undefined;
  // 021 names one liker; LikedBy draws up to three, for a later migration to fill.
  const likers = post.likedBy ? [post.likedBy] : [];

  /*
   * The caption: the username, then the words. On the feed it is cut to
   * two lines ending "… more", worked out here before layout from Inter's
   * own advances (lib/textFit, set a little wide, so the kept words always
   * fit), so the cell is its final height on its first frame, at any text
   * size. Opened, or on the post page, it is whole.
   */
  const captionText = isBlankCaption(post.caption) ? null : post.caption.trim();
  const opened = detail || openedFor === post.id;
  const captionSize = textRole.small.fontSize * fontScale;
  const cut =
    captionText && !opened
      ? clampToLines(
          captionText,
          'inter400',
          captionSize,
          width - 2 * GUTTER,
          CAPTION_LINES,
          CUT_MARK + MORE_WORD,
          // The username before it is SemiBold.
          textWidth(who.username, 'inter600', captionSize),
        )
      : null;

  /*
   * The print. One Pressable covers it, for the page turn and the double-tap
   * like; nothing else is nested in it, so VoiceOver reads it as one
   * element: the photo, or on a gallery the button that turns the page.
   * Liking is always the heart below as well; the double tap is a shortcut,
   * never the only way. No words on the photo (white spec D5): the gallery
   * count is a solid ink marker.
   */
  const print = (
    <Print width={printW} height={mediaH}>
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

  /*
   * Heart, share, then the bookmark at the far end (only where the server
   * has saves). The row is above the liked-by line in the touch order
   * (zIndex), so that line's slop never takes a tap meant for a glyph,
   * and passes every touch that misses a glyph through to it (box-none).
   */
  const actions = (
    <View pointerEvents="box-none" style={styles.actions}>
      {hasGallery ? <GalleryDots count={gallery.length} index={index} /> : null}
      <IconButton name="heart" label="Like" onPress={onLike} filled={liked} selected={liked} />
      {comments ? <IconButton name="comment" label="Comment" onPress={() => comments(post.id)} /> : null}
      <IconButton name="send" label="Share" onPress={share} />
      <View pointerEvents="none" style={styles.spacer} />
      {canSave ? <IconButton name="bookmark" label="Save" onPress={onSave} filled={saved} selected={saved} /> : null}
    </View>
  );

  const commentCount = post.commentCount ?? 0;

  return (
    <View style={styles.card}>
      <PostHeader
        who={who}
        drinkId={drink.id}
        drinkName={drink.name}
        when={when}
        story={story && onOpenStory ? story : undefined}
        width={width}
        onOpenAuthor={onOpenAuthor}
        onOpenStory={onOpenStory}
        onOpenDrink={onOpenDrink}
        onMore={openMenu}
      />
      {print}
      {actions}
      <LikedBy likes={likes} likers={likers} listable={listable} onPress={openLikers} />
      {captionText ? (
        <Caption
          username={who.username}
          text={captionText}
          cut={cut}
          onOpen={() => setOpenedFor(post.id)}
          onOpenAuthor={onOpenAuthor ? () => onOpenAuthor(who.id) : undefined}
        />
      ) : null}
      {comments && commentCount > 0 ? (
        <Pressable
          onPress={() => comments(post.id)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.quietRow, pressed && styles.pressed]}>
          <Text style={styles.quiet}>
            {commentCount === 1 ? 'View 1 comment' : `View all ${formatCount(commentCount)} comments`}
          </Text>
        </Pressable>
      ) : null}
      {/* The header already says the time to VoiceOver ("ines.ag, Negroni, 2 hours ago"). */}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.quiet, styles.quietRow]}>
        {when}
      </Text>

      {likersOpen === null ? null : (
        <LikersSheet postId={post.id} visible={likersOpen} onClose={closeLikers} likes={likes} />
      )}
      {menu === null ? null : (
        <ActionSheet
          visible={menu.open}
          onClose={closeMenu}
          title={menu.page === 'report' ? 'Report this post' : undefined}
          // The time is on the card now; the sheet names whose post it is.
          header={
            menu.page === 'report'
              ? 'What is wrong with it? Reports are reviewed privately; the poster is not told who reported them.'
              : who.username
          }
          actions={menu.page === 'report' ? reasonActions : menuActions}
        />
      )}
    </View>
  );
});

/* ==================================================================== */
/* The header                                                           */
/* ==================================================================== */

/**
 * The post's header (home-ig 5.1): the face, the username over the drink,
 * and •••. Each is its own tap: the face opens their story when they have
 * one today, else their profile; the username opens the profile; the
 * drink opens the drink page.
 *
 * VoiceOver hears the face and the two lines as one element, "ines.ag,
 * Negroni, 2 hours ago": activating it opens the profile, and the drink
 * and the story are its actions. The ••• is its own button.
 */
function PostHeader({
  who,
  drinkId,
  drinkName,
  when,
  story,
  width,
  onOpenAuthor,
  onOpenStory,
  onOpenDrink,
  onMore,
}: {
  who: UserProfile;
  drinkId: string;
  drinkName: string;
  when: string;
  /** Set only when the story can be opened. */
  story?: 'unseen' | 'seen';
  width: number;
  onOpenAuthor?: (authorId: string) => void;
  onOpenStory?: (authorId: string) => void;
  onOpenDrink: (drinkId: string) => void;
  onMore: () => void;
}) {
  const openProfile = onOpenAuthor ? () => onOpenAuthor(who.id) : undefined;
  const openStory = story && onOpenStory ? () => onOpenStory(who.id) : undefined;
  const openDrink = () => onOpenDrink(drinkId);
  const onAvatar = openStory ?? openProfile;

  // The drink's column: from the text's start (60) to 8 short of the •••'s box (390).
  const measure = width - (GUTTER + HEADER_AVATAR + space.md) - (MORE_INSET + layout.hit) - space.sm;

  const a11yActions: AccessibilityActionInfo[] = [
    ...(openProfile ? [{ name: 'activate' }] : []),
    ...(openStory ? [{ name: 'story', label: 'View story' }] : []),
    { name: 'drink', label: `Open ${drinkName}` },
  ];
  const onA11yAction = (e: AccessibilityActionEvent) => {
    switch (e.nativeEvent.actionName) {
      case 'activate':
        openProfile?.();
        break;
      case 'story':
        openStory?.();
        break;
      case 'drink':
        openDrink();
        break;
    }
  };

  return (
    <View style={styles.header}>
      <View
        accessible
        accessibilityRole={openProfile ? 'button' : undefined}
        accessibilityLabel={`${who.username}, ${drinkName}, ${when}${story === 'unseen' ? ', new story' : ''}`}
        accessibilityHint={openProfile ? 'Opens their profile' : undefined}
        accessibilityActions={a11yActions}
        onAccessibilityAction={onA11yAction}
        style={styles.identity}>
        <Pressable
          onPress={onAvatar}
          disabled={!onAvatar}
          hitSlop={AVATAR_SLOP}
          style={({ pressed }) => [styles.headAvatar, pressed && styles.pressed]}>
          {story === 'unseen' ? <View pointerEvents="none" style={styles.storyRing} /> : null}
          <Avatar name={who.displayName} accent={who.accent} size={HEADER_AVATAR} avatarPath={who.avatarPath} />
        </Pressable>
        <View style={styles.headText}>
          <Pressable
            onPress={openProfile}
            disabled={!openProfile}
            hitSlop={{ top: LINE_SLOP, right: space.sm }}
            style={({ pressed }) => [styles.hug, pressed && styles.pressed]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={HEADER_CAP} style={styles.username}>
              {who.username}
            </Text>
          </Pressable>
          <Pressable
            onPress={openDrink}
            hitSlop={{ bottom: LINE_SLOP, right: space.sm }}
            style={({ pressed }) => [styles.hug, pressed && styles.pressed]}>
            <DrinkName name={drinkName} role={textRole.nameSm} measure={measure} cap={HEADER_CAP} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <IconButton name="more" label="Post options" onPress={onMore} size={MORE_GLYPH} />
    </View>
  );
}

/* ==================================================================== */
/* The actions row's gallery dots                                       */
/* ==================================================================== */

/** Which photo of a gallery is showing, as dots: decorative, so hidden from VoiceOver (the photo's label says it). */
function GalleryDots({ count, index }: { count: number; index: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
      ))}
    </View>
  );
}

/* ==================================================================== */
/* Liked by                                                             */
/* ==================================================================== */

/**
 * "Liked by maya.pours and 23 others", after up to three faces (home-ig
 * 5.1). Migration 021 names one liker, so one face shows; more are drawn
 * the moment the server sends them. With no name to show it is "24
 * likes"; at no likes there is no row. The whole line opens the likers
 * sheet once the server can list them.
 */
function LikedBy({
  likes,
  likers,
  listable,
  onPress,
}: {
  likes: number;
  likers: readonly UserProfile[];
  listable: boolean;
  onPress: () => void;
}) {
  if (likes <= 0) return null;
  const faces = likers.slice(0, MAX_FACES);
  const name = faces[0]?.username;
  const othersWord = likes - 1 === 1 ? '1 other' : `${formatCount(likes - 1)} others`;
  const countWord = `${formatCount(likes)} ${likes === 1 ? 'like' : 'likes'}`;
  const spoken = !name ? countWord : likes === 1 ? `Liked by ${name}` : `Liked by ${name} and ${othersWord}`;

  const body = (
    <>
      {faces.length > 0 ? (
        <View style={[styles.faces, { width: FACE_OUTER + (faces.length - 1) * FACE_STRIDE }]}>
          {faces.map((p, i) => (
            <View key={p.id} style={[styles.face, { left: i * FACE_STRIDE }]}>
              <Avatar name={p.displayName} accent={p.accent} size={FACE} avatarPath={p.avatarPath} />
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.likedText}>
        {name ? (
          <>
            {'Liked by '}
            <Text style={styles.strong}>{name}</Text>
            {likes > 1 ? (
              <>
                {' and '}
                <Text style={styles.strong}>{othersWord}</Text>
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.strong}>{countWord}</Text>
        )}
      </Text>
    </>
  );

  if (!listable) {
    return (
      <View accessible accessibilityLabel={spoken} style={styles.liked}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: LIKED_SLOP, bottom: LIKED_SLOP }}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Shows who liked this"
      style={({ pressed }) => [styles.liked, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/* ==================================================================== */
/* Caption                                                              */
/* ==================================================================== */

/**
 * The username in 600, then the caption (home-ig 5.1). `cut` is the part
 * that fits two lines with "… more" after it (PostCard works it out before
 * layout), or null when the caption is shown whole. Cut, the whole
 * caption is one target that opens it in place; the username inside it is
 * a target of its own, for the profile.
 *
 * VoiceOver reads the whole caption either way ("ines.ag, Stirred long
 * over one big cube"), with the profile as an action.
 */
function Caption({
  username,
  text,
  cut,
  onOpen,
  onOpenAuthor,
}: {
  username: string;
  text: string;
  cut: string | null;
  onOpen: () => void;
  onOpenAuthor?: () => void;
}) {
  const spoken = `${username}, ${text}`;
  const a11yActions: AccessibilityActionInfo[] | undefined = onOpenAuthor
    ? [{ name: 'profile', label: `Open ${username}'s profile` }]
    : undefined;
  const onA11yAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'profile') onOpenAuthor?.();
  };

  const words = (
    <Text numberOfLines={cut === null ? undefined : CAPTION_LINES} style={styles.captionText}>
      <Text style={styles.strong} onPress={onOpenAuthor} suppressHighlighting>
        {username}
      </Text>
      {' '}
      {cut === null ? (
        text
      ) : (
        <>
          {cut}
          {CUT_MARK}
          <Text style={styles.moreWord}>{MORE_WORD}</Text>
        </>
      )}
    </Text>
  );

  if (cut === null) {
    return (
      <View
        accessible
        accessibilityLabel={spoken}
        accessibilityActions={a11yActions}
        onAccessibilityAction={onA11yAction}
        style={styles.caption}>
        {words}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Shows the whole caption"
      accessibilityActions={a11yActions ? [{ name: 'activate' }, ...a11yActions] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') onOpen();
        else onA11yAction(e);
      }}
      style={({ pressed }) => [styles.caption, pressed && styles.pressed]}>
      {words}
    </Pressable>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  /* No card chrome and no fill: the post stands on the page, and a 14pt foot of space ends it. */
  card: { paddingBottom: FOOT },
  pressed: { opacity: 0.5 },

  /* The header: 52, the face at 16, the text 12 after it (60), ••• ending at 424. */
  header: {
    minHeight: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: GUTTER,
    paddingRight: MORE_INSET,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: HEADER_H },
  headAvatar: { width: HEADER_AVATAR, height: HEADER_AVATAR },
  storyRing: {
    position: 'absolute',
    top: STORY_RING_AT,
    left: STORY_RING_AT,
    width: STORY_RING,
    height: STORY_RING,
    // round-ok: story
    borderRadius: radius.round,
    borderWidth: stroke.ring,
    borderColor: colors.text,
  },
  headText: { flex: 1, marginLeft: space.md, marginRight: space.sm, alignItems: 'flex-start' },
  /* Hugs its words, so a line's target is the words and not the empty row beside them. */
  hug: { maxWidth: '100%' },
  username: { ...textRole.small, fontFamily: fonts.bodySemiBold, color: colors.text },

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
   * Actions: 44 tall, each glyph in its 44pt box, the three on the left
   * abutting at 7 · 51 · 95, the bookmark's box 389 to 433. A floor, not a
   * height. Above the liked-by line for touches (see the card).
   */
  actions: {
    minHeight: layout.hit,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ACTIONS_INSET,
    zIndex: 1,
  },
  spacer: { flex: 1 },
  iconBtn: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DOT_GAP,
  },
  dot: {
    width: DOT,
    height: DOT,
    // round-ok: dot
    borderRadius: radius.round,
    backgroundColor: colors.rule,
  },
  dotOn: { backgroundColor: colors.text },

  /* Liked by: 22 tall at the column, the faces then the line 8 after them. */
  liked: {
    minHeight: FACE_OUTER,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: GUTTER,
  },
  faces: { height: FACE_OUTER, marginRight: space.sm },
  face: {
    position: 'absolute',
    top: 0,
    width: FACE_OUTER,
    height: FACE_OUTER,
    padding: FACE_RING,
    // round-ok: avatar
    borderRadius: radius.round,
    backgroundColor: colors.bg,
  },
  likedText: { ...textRole.small, flexShrink: 1, color: colors.text },
  strong: { fontFamily: fonts.bodySemiBold },

  /* The caption, 4 under the liked-by row, across the column (16 to 424). */
  caption: { marginTop: LINE_GAP, paddingHorizontal: GUTTER },
  captionText: { ...textRole.small, color: colors.text },
  moreWord: { color: colors.textMuted },

  /* The comments line and the time: muted, 4 under what is above them. */
  quietRow: { marginTop: LINE_GAP, paddingHorizontal: GUTTER },
  quiet: { ...textRole.small, color: colors.textMuted },
});

export default PostCard;
