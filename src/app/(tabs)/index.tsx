import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RarityBadge } from '@/components/ui';
import { CATEGORY_META, colors, drinkGlyph, fonts } from '@/constants/theme';
import { DRINKS_BY_ID, formatDexNumber } from '@/data';
import { buildFeed, timeAgo, usePosts } from '@/store/posts';
import type { Post } from '@/types';

/* ------------------------------------------------------------------ */
/* Post card                                                           */
/* ------------------------------------------------------------------ */

const PostCard = React.memo(function PostCard({
  post,
  onOpenDrink,
}: {
  post: Post;
  onOpenDrink: (id: string) => void;
}) {
  const liked = usePosts((s) => Boolean(s.liked[post.id]));
  const toggleLike = usePosts((s) => s.toggleLike);
  const drink = DRINKS_BY_ID[post.drinkId];
  if (!drink) return null;

  const meta = CATEGORY_META[drink.category];
  const likeCount = post.likes + (liked ? 1 : 0);

  return (
    <View style={[styles.card, post.mine && styles.cardMine]}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <View style={[styles.avatar, { borderColor: post.accent + '66' }]}>
          <Text style={styles.avatarEmoji}>{post.avatar}</Text>
        </View>
        <View style={styles.authorMeta}>
          <Text style={[styles.author, post.mine && { color: colors.gold }]}>{post.author}</Text>
          <Text style={styles.time}>{timeAgo(post.createdAt)} ago</Text>
        </View>
        <RarityBadge rarity={drink.rarity} compact />
      </View>

      {/* Photo or glyph panel */}
      {post.photoUri ? (
        <Image
          source={{ uri: post.photoUri }}
          style={styles.photo}
          contentFit="cover"
          transition={180}
          accessibilityLabel={`${post.author}'s photo of ${drink.name}`}
        />
      ) : (
        <View style={[styles.glyphPanel, { backgroundColor: meta.color + '14' }]}>
          <Text style={styles.glyph}>{drinkGlyph(drink)}</Text>
        </View>
      )}

      {/* Drink reference chip */}
      <Pressable
        onPress={() => onOpenDrink(drink.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${drink.name} in the Dex`}
        style={({ pressed }) => [styles.drinkChip, { borderColor: meta.color + '55' }, pressed && styles.pressed]}
      >
        <Text style={styles.drinkChipEmoji}>{meta.emoji}</Text>
        <Text style={[styles.drinkChipName, { color: meta.color }]} numberOfLines={1}>
          {drink.name}
        </Text>
        <Text style={styles.drinkChipDex}>{formatDexNumber(drink.dexNumber)}</Text>
      </Pressable>

      {/* Caption */}
      <Text style={styles.caption}>{post.caption}</Text>

      {/* Like row */}
      <View style={styles.likeRow}>
        <Pressable
          onPress={() => toggleLike(post.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          style={({ pressed }) => [styles.likeBtn, pressed && styles.pressed]}
        >
          <Text style={[styles.likeHeart, liked && styles.likeHeartOn]}>{liked ? '♥' : '♡'}</Text>
          <Text style={[styles.likeCount, liked && styles.likeCountOn]}>{likeCount}</Text>
        </Pressable>
      </View>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const userPosts = usePosts((s) => s.userPosts);

  const feed = useMemo(() => buildFeed(userPosts), [userPosts]);

  const openDrink = useCallback(
    (id: string) => {
      router.push({ pathname: '/drink/[id]', params: { id } });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Post }) => <PostCard post={item} onOpenDrink={openDrink} />,
    [openDrink]
  );

  const header = (
    <View style={styles.headerWrap}>
      <Text style={styles.wordmark}>Clink</Text>
      <Text style={styles.tagline}>Drink it. Clink it.</Text>
      <Text style={styles.subtitle}>The pour report — what everyone&apos;s logging.</Text>
    </View>
  );

  return (
    <FlatList
      data={feed}
      renderItem={renderItem}
      keyExtractor={(post) => post.id}
      style={styles.screen}
      contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 12 }]}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  pressed: {
    opacity: 0.72,
  },

  /* Header */
  headerWrap: {
    marginBottom: 6,
  },
  wordmark: {
    fontFamily: 'GowunBatang_700Bold',
    fontSize: 34,
    color: colors.text,
  },
  tagline: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.gold,
    marginTop: 2,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },

  /* Card */
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  cardMine: {
    borderColor: colors.goldDim,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 17,
  },
  authorMeta: {
    flex: 1,
    gap: 1,
  },
  author: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  time: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  glyphPanel: {
    width: '100%',
    aspectRatio: 2.4,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 52,
  },
  drinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  drinkChipEmoji: {
    fontSize: 12,
  },
  drinkChipName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    flexShrink: 1,
  },
  drinkChipDex: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingRight: 12,
  },
  likeHeart: {
    fontSize: 18,
    color: colors.textMuted,
  },
  likeHeartOn: {
    color: colors.danger,
  },
  likeCount: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  likeCountOn: {
    color: colors.text,
  },
});
