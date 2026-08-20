import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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
import { Avatar, CategoryPill, haptic, RarityBadge } from '@/components/ui';
import { CATEGORY_META, colors, fonts, space, type as typeScale } from '@/constants/theme';
import { DRINKS_BY_ID, formatDexNumber } from '@/data';
import { blockUser, REPORT_REASONS, reportPost } from '@/lib/moderation';
import { signedPhotoUrl } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/* ==================================================================== */
/* Helpers                                                              */
/* ==================================================================== */

/** "2h" / "3d" style relative timestamp. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return 'now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

/**
 * Turns a private-bucket object key into a displayable URL.
 *
 * Exported because the profile grid renders the same photos in a different
 * frame, and the signing round-trip shouldn't be written twice.
 */
export function useSignedPhoto(path: string | null | undefined): string | null {
  // Keyed by the path it was signed for, so a changed path reads as "not
  // resolved yet" without a synchronous reset that would cascade renders.
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    signedPhotoUrl(path)
      .then((url) => {
        if (alive) setSigned({ path, url });
      })
      .catch(() => {
        // A photo that won't sign falls back to the drink's artwork.
        if (alive) setSigned({ path, url: null });
      });
    return () => {
      alive = false;
    };
  }, [path]);

  return signed && signed.path === path ? signed.url : null;
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
  // Saving has no store yet — a local flag still gives the control real feedback.
  const [saved, setSaved] = useState(false);

  /*
   * Optimistic overlay on the server's like state. The store only tracks the
   * feed, so on a profile — which holds its own list — a tap would otherwise
   * look like it did nothing. Keyed by the server's answer: once that catches
   * up the overlay stops matching and quietly drops out.
   */
  const [flip, setFlip] = useState<{ key: string; on: boolean } | null>(null);
  const serverLiked = !!post.likedByMe;
  const likeKey = `${post.id}|${serverLiked ? 1 : 0}|${post.likes}`;
  const liked = flip?.key === likeKey ? flip.on : serverLiked;
  const likes = Math.max(0, post.likes + (liked === serverLiked ? 0 : liked ? 1 : -1));

  const onLike = useCallback(() => {
    haptic.tap();
    setFlip({ key: likeKey, on: !liked });
    if (myId) void toggleLike(myId, post.id);
  }, [liked, likeKey, myId, post.id, toggleLike]);

  /*
   * A post can now carry several photos of the same drink, newest first
   * (migration 007). `index` is which one is on screen; it resets when the
   * post's photo set changes so a card recycled by the virtualised list
   * cannot open on someone else's third picture.
   */
  const gallery = post.photoPaths?.length ? post.photoPaths : [];
  const [index, setIndex] = useState(0);
  const galleryKey = gallery.join('|');
  useEffect(() => setIndex(0), [galleryKey]);

  const current = gallery[index] ?? photoPath ?? post.photoPath;
  const photoUrl = useSignedPhoto(current) ?? post.photoUri;
  const hasGallery = gallery.length > 1;

  const drink = DRINKS_BY_ID[post.drinkId];
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
      )} on Clink.`,
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
    Alert.alert(
      'Report this post',
      'What is wrong with it? Reports are reviewed privately; the poster is not told who reported them.',
      [
        ...REPORT_REASONS.map((r) => ({
          text: r.label,
          onPress: () => {
            void reportPost(myId, post.id, r.key)
              .then(() =>
                Alert.alert('Thanks', 'This post has been reported. You can also block this person from the post menu.'),
              )
              .catch(() => Alert.alert('Could not report', 'Check your connection and try again.'));
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [myId, post.id]);

  const confirmBlock = useCallback(() => {
    if (!myId) return;
    Alert.alert(
      `Block @${who.username}?`,
      'You will not see their posts and they will not see yours. Any follow between you is removed. You can undo this from their profile.',
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
     */
    const mine = who.id === myId;

    Alert.alert(drink.name, undefined, [
      { text: 'Open in the Dex', onPress: () => onOpenDrink(drink.id) },
      { text: 'Share', onPress: share },
      ...(mine
        ? []
        : [
            { text: 'Report post', style: 'destructive' as const, onPress: openReport },
            { text: `Block @${who.username}`, style: 'destructive' as const, onPress: confirmBlock },
          ]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [drink, onOpenDrink, share, who.id, who.username, myId, openReport, confirmBlock]);

  if (!drink) return null;

  const category = CATEGORY_META[drink.category];
  const comments = post.commentCount ?? 0;

  return (
    <View style={styles.card}>
      {/* ---- Author ---- */}
      <View style={styles.header}>
        <Pressable
          onPress={onOpenAuthor ? () => onOpenAuthor(who.id) : undefined}
          disabled={!onOpenAuthor}
          accessibilityRole={onOpenAuthor ? 'button' : undefined}
          accessibilityLabel={onOpenAuthor ? `Open ${who.displayName}'s profile` : undefined}
          style={({ pressed }) => [styles.headerIdentity, pressed && styles.pressed]}>
          <Avatar name={who.displayName} accent={who.accent} size={40} ring />
          <View style={styles.headerText}>
            <Text style={styles.displayName} numberOfLines={1}>
              {who.displayName}
            </Text>
            <Text style={styles.handle} numberOfLines={1}>
              @{who.username} · {timeAgo(post.createdAt)}
            </Text>
          </View>
        </Pressable>
        <IconButton name="more" label="Post options" onPress={openMenu} color={colors.textMuted} />
      </View>

      {/* ---- The pour ---- */}
      <Pressable
        onPress={() => onOpenDrink(drink.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${drink.name}, ${formatDexNumber(drink.dexNumber)}, in the Dex`}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        {photoUrl ? (
          <View>
            <Image
              source={{ uri: photoUrl }}
              style={styles.photo}
              contentFit="cover"
              transition={180}
              accessibilityLabel={
                hasGallery
                  ? `Photo ${index + 1} of ${gallery.length} of ${drink.name}`
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
                  setIndex((i) => (i + 1) % gallery.length);
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
          <View style={[styles.artPanel, { backgroundColor: category.wash }]}>
            {/* Sized to fill the 4:3 panel — 110 left it adrift in the wash. */}
            <DrinkArt drink={drink} size={190} />
          </View>
        )}

        <View style={styles.drinkMeta}>
          <View style={styles.drinkNameRow}>
            <Text style={styles.drinkName} numberOfLines={1}>
              {drink.name}
            </Text>
            <Text style={styles.dexNumber}>{formatDexNumber(drink.dexNumber)}</Text>
          </View>
          <View style={styles.badgeRow}>
            <CategoryPill category={drink.category} />
            <RarityBadge rarity={drink.rarity} />
          </View>
        </View>
      </Pressable>

      {/* ---- Actions ---- */}
      <View style={styles.actions}>
        <IconButton
          name="heart"
          label={liked ? 'Unlike' : 'Like'}
          onPress={onLike}
          filled={liked}
          selected={liked}
          color={liked ? colors.wine : colors.text}
        />
        {/* Static: there's no thread view to open yet. */}
        <View style={styles.commentCount} accessibilityLabel={`${comments} comments`}>
          <Icon name="comment" size={23} color={colors.text} />
          {comments > 0 ? <Text style={styles.commentCountText}>{comments}</Text> : null}
        </View>
        <IconButton name="share" label="Share this entry" onPress={share} />
        <View style={styles.spacer} />
        <IconButton
          name="bookmark"
          label={saved ? 'Remove from saved' : 'Save this entry'}
          onPress={() => {
            setSaved((s) => !s);
            haptic.tap();
          }}
          filled={saved}
          selected={saved}
          color={saved ? colors.goldInk : colors.text}
        />
      </View>

      {/* ---- Likes and caption ---- */}
      <Text style={styles.likes}>
        {likes} {likes === 1 ? 'like' : 'likes'}
      </Text>
      <Text style={styles.caption}>
        <Text style={styles.captionAuthor}>{who.username} </Text>
        {post.caption}
      </Text>
    </View>
  );
});

/* ==================================================================== */

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: space.md,
  },
  pressed: { opacity: 0.72 },
  spacer: { flex: 1 },

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
    color: colors.textFaint,
  },

  /* Body */
  body: { gap: space.md },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
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
    borderRadius: 999,
    backgroundColor: colors.scrim,
  },
  galleryCountLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: typeScale.micro.letterSpacing,
    color: colors.textOnWine,
    fontVariant: ['tabular-nums'],
  },
  artPanel: {
    width: '100%',
    aspectRatio: 4 / 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drinkMeta: {
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  drinkNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  drinkName: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.text,
  },
  dexNumber: {
    fontFamily: fonts.mono,
    fontSize: typeScale.micro.fontSize,
    color: colors.textFaint,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 32,
  },
  commentCountText: {
    fontFamily: fonts.mono,
    fontSize: typeScale.micro.fontSize,
    color: colors.textMuted,
  },

  /* Copy */
  likes: {
    paddingHorizontal: space.lg,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
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
