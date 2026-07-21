import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { DrinkArt } from '@/components/artwork';
import { Icon, type IconName } from '@/components/icons';
import { Avatar, CategoryPill, haptic, RarityBadge } from '@/components/ui';
import { CATEGORY_META, colors, fonts, space, type as typeScale } from '@/constants/theme';
import { DRINKS_BY_ID, formatDexNumber } from '@/data';
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
  return (
    <Pressable
      onPress={onPress}
      hitSlop={SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
      <Icon name={name} size={23} color={color} filled={filled} />
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
}

export const PostCard = React.memo(function PostCard({
  post,
  author,
  onOpenDrink,
  onOpenAuthor,
  photoPath,
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

  const photoUrl = useSignedPhoto(photoPath ?? post.photoPath) ?? post.photoUri;

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

  const openMenu = useCallback(() => {
    if (!drink) return;
    // Alert.alert is a no-op on web; go straight to the primary action there.
    if (Platform.OS === 'web') {
      onOpenDrink(drink.id);
      return;
    }
    Alert.alert(drink.name, undefined, [
      { text: 'Open in the Dex', onPress: () => onOpenDrink(drink.id) },
      { text: 'Share', onPress: share },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [drink, onOpenDrink, share]);

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
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            contentFit="cover"
            transition={180}
            accessibilityLabel={`Photo of ${drink.name}`}
          />
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
