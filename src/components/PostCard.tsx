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
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DrinkArt } from '@/components/artwork';
import { Icon, type IconName } from '@/components/icons';
import { Avatar, haptic, PressableScale } from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  dexNumber,
  fonts,
  radius,
  space,
  tabular,
  type as typeScale,
} from '@/constants/theme';
import { getDrink, formatDexNumber } from '@/data';
import { blockUser, REPORT_REASONS, reportPost, type ReportReason } from '@/lib/moderation';
import { isBlankCaption, peekSignedPhoto, signedPhotoUrl } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

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

/** "2h" / "3d" style relative timestamp. */
export function timeAgo(iso: string): string {
  const t = elapsed(iso);
  return t ? `${t.n}${t.unit[0]}` : 'now';
}

/**
 * The same timestamp in words, for VoiceOver — which reads "2h" as
 * "2 h" and "3w" as "3 w".
 */
export function timeAgoSpoken(iso: string): string {
  const t = elapsed(iso);
  return t ? `${t.n} ${t.unit}${t.n === 1 ? '' : 's'} ago` : 'just now';
}

/**
 * Turns a private-bucket object key into a displayable URL.
 *
 * Three answers, because "not yet" and "never" look different on screen: a
 * string once signed, `undefined` while signing is in flight, and `null`
 * when there is no path or it would not sign. A caller that waits on
 * `undefined` keeps the photo's frame in place; only `null` should fall
 * back to artwork. Treating the two alike is what made every photo post
 * open as an illustration and then jump taller when its URL arrived.
 *
 * An already-signed path is answered on the first render, from the cache,
 * so a card remounting in the feed or a gallery paging back paints at once.
 *
 * `retryKey` re-asks when it changes — pass something that changes on
 * refresh (the post object does). A success is memoised, so on the happy
 * path that costs nothing; after a failed signing, which the cache no longer
 * keeps, it is what lets a pull-to-refresh bring a mounted photo back.
 *
 * Exported because the profile grid renders the same photos in a different
 * frame, and the signing round-trip shouldn't be written twice.
 */
export function useSignedPhoto(
  path: string | null | undefined,
  retryKey?: unknown,
): string | null | undefined {
  // Keyed by the path it was signed for, so a changed path reads as "not
  // resolved yet" without a synchronous reset that would cascade renders.
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);
  const cached = peekSignedPhoto(path);

  useEffect(() => {
    /*
     * Skipped only when THIS render already had the URL. Asking the cache
     * again here would race: a signing that settles between the render and
     * the effect would make the effect bail while the render still showed
     * the empty frame, and nothing would ever fill it.
     */
    if (!path || cached !== undefined) return;
    let alive = true;
    // signedPhotoUrl never rejects; a photo that won't sign resolves null
    // and falls back to the drink's artwork.
    void signedPhotoUrl(path).then((url) => {
      if (alive) setSigned({ path, url });
    });
    return () => {
      alive = false;
    };
  }, [path, retryKey, cached]);

  if (!path) return null;
  if (cached !== undefined) return cached;
  return signed && signed.path === path ? signed.url : undefined;
}

/* ==================================================================== */
/* Icon control                                                         */
/* ==================================================================== */

/** 32pt box + slop clears the 44pt target without inflating the row. */
const SLOP = { top: 10, bottom: 10, left: 8, right: 8 };

/**
 * Action icon that POPS when it becomes selected.
 *
 * Liking is the most repeated gesture in the whole app, so it is worth a real
 * moment: a fast squash, then a spring overshoot past full size, then settle.
 * Turning a like OFF gets a smaller, quieter dip — undoing something should
 * not feel as good as doing it.
 *
 * Driven by the VALUE changing, never by mount. The feed is a virtualised
 * list, so a mount-triggered animation would set off a wave of popping hearts
 * every time a card scrolled back into view.
 */
function IconButton({
  name,
  label,
  onPress,
  color = colors.text,
  filled,
  selected,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  selected?: boolean;
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
      hitSlop={SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
      <Animated.View style={animated}>
        <Icon name={name} size={23} color={color} filled={filled} />
      </Animated.View>
    </Pressable>
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
}

export const PostCard = React.memo(function PostCard({
  post,
  author,
  onOpenDrink,
  onOpenAuthor,
  photoPath,
  onBlocked,
}: PostCardProps) {
  const myId = useAuth((s) => s.session?.user.id);
  const toggleLike = useSocial((s) => s.toggleLike);

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

  const drink = getDrink(post.drinkId);
  // A post can outrun its author's profile row; render it rather than crash.
  const who = author ?? {
    id: post.authorId,
    username: 'someone',
    displayName: 'Someone',
    accent: colors.wineSoft,
    joinedAt: '',
  };

  const share = useCallback(() => {
    if (!drink) return;
    Share.share({
      message: `${who.displayName} logged ${drink.name} ${formatDexNumber(
        drink.dexNumber,
      )} on Sipply.`,
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
     * Block is, because it takes a person out of your feed.
     */
    const mine = who.id === myId;
    const actions: { text: string; onPress: () => void; destructive?: boolean }[] = [
      { text: 'Open in the Dex', onPress: () => onOpenDrink(drink.id) },
      { text: 'Share', onPress: share },
      ...(mine
        ? []
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
  }, [drink, onOpenDrink, share, who.id, who.username, myId, openReport, confirmBlock]);

  if (!drink) return null;

  const category = CATEGORY_META[drink.category];
  const posted = timeAgoSpoken(post.createdAt);
  const showCaption = !isBlankCaption(post.caption);
  /*
   * The photo's frame is chosen from the PATH, not the signed URL. While the
   * URL is on its way (`undefined`) the frame holds its place on the sunk
   * ground; only a post with no photo, or one that would not sign (`null`),
   * gets the artwork panel.
   */
  const showPhoto = !!current && photoUrl !== null;

  const identity = (
    <>
      <Avatar
        name={who.displayName}
        accent={who.accent}
        size={40}
        ring
        avatarPath={who.avatarPath}
      />
      <View style={styles.headerText}>
        <Text style={styles.displayName} numberOfLines={1}>
          {who.displayName}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{who.username} · {timeAgo(post.createdAt)}
        </Text>
      </View>
    </>
  );

  return (
    <View style={styles.card}>
      {/*
        ---- Author ----
        A button only where it goes somewhere. On a profile, where you are
        already looking at the author, it is plain text read as one element:
        a disabled button there made VoiceOver call the name "dimmed".
      */}
      <View style={styles.header}>
        {onOpenAuthor ? (
          <PressableScale
            onPress={() => onOpenAuthor(who.id)}
            noHaptic
            accessibilityRole="button"
            accessibilityLabel={`Open ${who.displayName}'s profile, posted ${posted}`}
            style={styles.headerIdentity}>
            {identity}
          </PressableScale>
        ) : (
          <View
            accessible
            accessibilityLabel={`${who.displayName}, @${who.username}, posted ${posted}`}
            style={styles.headerIdentity}>
            {identity}
          </View>
        )}
        <IconButton name="more" label="Post options" onPress={openMenu} color={colors.textMuted} />
      </View>

      {/*
        ---- The pour ----
        The photograph and the link to the drink are siblings, not one
        button wrapped around the other. Nested, the same tap on the same
        picture opened the Dex on a single-photo post and paged the photos on
        a gallery, and VoiceOver — which treats a button as one element —
        could never reach the pager or anything past the first photo. The
        photo now does one thing, page a gallery; the name block below it
        opens the drink, as does the post menu.
      */}
      {showPhoto ? (
        <View style={styles.photoFrame}>
          <Image
            source={photoUrl ? { uri: photoUrl, cacheKey: current } : undefined}
            /*
             * Keyed on the storage path, not the URL. A signed URL carries a
             * fresh token every time it is minted, so keyed on the URL every
             * photo downloaded again after each launch and every hour. A path
             * never changes content — each upload gets a new name — so it is
             * a safe key, and the memory tier spares a remount the decode.
             */
            cachePolicy="memory-disk"
            style={styles.photo}
            contentFit="cover"
            transition={180}
            accessible
            accessibilityRole="image"
            accessibilityLabel={
              hasGallery
                ? `Photo of ${drink.name}, ${index + 1} of ${gallery.length}`
                : `Photo of ${drink.name}`
            }
          />
          {hasGallery ? (
            /*
             * Tap-to-advance rather than a swipe: this card already sits in
             * a vertically scrolling feed, and a horizontal pan inside it
             * fights the list for the gesture on every drag that is not
             * perfectly sideways.
             */
            <Pressable
              onPress={() => {
                haptic.select();
                // Computed from the rendered `index` rather than a functional
                // updater, because the new value has to be stamped with the
                // gallery key it belongs to.
                setPaged({ key: galleryKey, index: (index + 1) % gallery.length });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Next photo of ${drink.name}, ${index + 1} of ${gallery.length}`}
              style={styles.galleryTapTarget}>
              <View style={styles.galleryCount}>
                <Text style={styles.galleryCountLabel}>
                  {index + 1}/{gallery.length}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View
          style={[styles.artPanel, { backgroundColor: category.wash }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Illustration of ${drink.name}`}>
          {/* Sized to fill the panel — 190 left it adrift in the wash. */}
          <DrinkArt drink={drink} size={220} />
        </View>
      )}

      <PressableScale
        onPress={() => onOpenDrink(drink.id)}
        noHaptic
        accessibilityRole="button"
        accessibilityLabel={`Open ${drink.name}, number ${drink.dexNumber}, in the Dex`}
        style={styles.drinkMeta}>
        <View style={styles.drinkNameRow}>
          <Text style={styles.drinkName} numberOfLines={1}>
            {drink.name}
          </Text>
          <Text style={dexNumber}>{formatDexNumber(drink.dexNumber)}</Text>
        </View>
        {/*
          The spec line, not a badge row. A post is someone showing you a
          drink, and "Tequila · Grapefruit · Lime · Rosemary" tells you
          what it IS — which is what you want to know from a photograph.
          Category and rarity are Dex bookkeeping; they belong on the card
          in the index, not under someone's pour.

          Cocktails carry `ingredients`; spirits fall back to their style
          and origin, which is the nearest equivalent sentence for a bottle
          nobody builds.
        */}
        <Text style={styles.spec} numberOfLines={1}>
          {drink.ingredients?.length
            ? drink.ingredients.join(' · ')
            : [drink.subcategory, drink.origin].filter(Boolean).join(' · ')}
        </Text>
      </PressableScale>

      {/*
        ---- Actions ----
        Like and share, and nothing that only looks like a control. The
        comment glyph and the bookmark are gone: there is no thread to open
        and no saved list to find a post in, and a Save that forgets itself
        when the card scrolls away confirms something that never happened.
        They come back with the table and the screen behind them.
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
        <IconButton name="share" label="Share this entry" onPress={share} />
      </View>

      {/*
        ---- Likes and caption ----
        Both only when there is something to say. The like count is the one
        coloured figure on the post, and on a new post it spent that on a 0;
        the first like adds the line. An uncaptioned post shows no caption
        rather than a stock sentence under every picture.
      */}
      {likes > 0 ? (
        <Text style={styles.likes}>
          {likes} {likes === 1 ? 'like' : 'likes'}
        </Text>
      ) : null}
      {showCaption ? (
        <Text style={styles.caption}>
          <Text style={styles.captionAuthor}>{who.username} </Text>
          {post.caption}
        </Text>
      ) : null}
    </View>
  );
});

/* ==================================================================== */

const styles = StyleSheet.create({
  card: {
    /*
     * No card chrome. The handoff's feed is posts sitting straight on the
     * page — an image with a 16pt radius, its author above it and its
     * caption below — so the hairline top/bottom rules are gone. They were
     * the last of the borrowed Instagram frame: with them the photo read
     * as an inset panel, without them it reads as the object itself.
     *
     * No fill either. The post was white while the page was too; once the
     * page went cream, a white post became a tinted slab with the photo
     * inset in it — exactly how Card draws a panel. Transparent, the post
     * sits on the page the way this comment always said it did.
     */
    paddingVertical: space.md,
  },
  /*
   * The icon buttons' press state. They are the one place a dim is kept:
   * the value-driven pop is their real feedback, and the dim only marks the
   * touch. Everything larger on the card scales, as PressableScale does.
   */
  pressed: { opacity: 0.72 },

  /* Author */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.sm,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  headerText: { flex: 1, gap: 1 },
  displayName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize + 1,
    color: colors.text,
  },
  handle: {
    fontFamily: fonts.body,
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    // 12pt is small text: textMuted, never textFaint.
    color: colors.textMuted,
  },

  /* Body */
  /*
   * The frame carries the inset and the radius so the gallery tap target,
   * which fills it, lands exactly on the photograph and not on the page
   * beside it. It also holds the photo's full height while the signed URL
   * is on its way, so nothing below it moves when the picture arrives.
   */
  photoFrame: {
    marginHorizontal: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    /* The handoff's feed crop: portrait, a little taller than 3:4. */
    aspectRatio: 1 / 1.3,
    backgroundColor: colors.bgSunk,
  },
  /* Covers the photo, so a tap anywhere on it advances. */
  galleryTapTarget: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: space.sm,
  },
  galleryCount: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  galleryCountLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: typeScale.micro.letterSpacing,
    color: colors.textOnWine,
    ...tabular,
  },
  artPanel: {
    marginHorizontal: space.lg,
    /*
     * NOT the photo's 1/1.3. That crop is specified for photography, where
     * the subject fills the frame; a single piece of vector glassware in a
     * panel that tall floats in a field of wash with nothing around it.
     * This is DrinkArt's own 100×112 viewBox, so the panel is the shape of
     * the thing inside it.
     */
    aspectRatio: 100 / 112,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drinkMeta: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
  },
  drinkNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  /* The catalogue number beside it is theme's `dexNumber`, the one stamp
     every surface that names a drink uses. */
  drinkName: {
    flex: 1,
    fontFamily: fonts.displayBold,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.text,
  },
  /* The spec line under the drink name. Muted, so the name stays the
     loudest thing in the block and this reads as its caption. */
  spec: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: 2,
  },

  /* Actions */
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Copy */
  likes: {
    paddingHorizontal: space.lg,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    /* The handoff sets the like count in wine — the only coloured figure
       on the post, which is what makes it read as the live one. */
    color: colors.wine,
  },
  caption: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize + 1,
    lineHeight: 20,
    color: colors.text,
  },
  captionAuthor: { fontFamily: fonts.bodySemiBold },
});

export default PostCard;
