import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, LiningBand, MOUNT, Mount, MountWindow, TierWord } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { Icon } from '@/components/icons';
import { haptic, PressableScale } from '@/components/ui';
import { colors, fonts, layout, motion, RARITY_META, space, stroke, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { topShelf } from '@/lib/cabinet';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import type { Drink, Post } from '@/types';

/* ==================================================================== */
/* Top shelf                                                            */
/*                                                                      */
/* The slot under a profile's actions where Instagram keeps its         */
/* highlights, filled with what only Sipply has: the three rarest       */
/* drinks this person has posted, mounted in the cabinet's lining       */
/* (specs/v3-cabinet.md 9.9.2). The structure stays Instagram's; the    */
/* row is a shelf of mounted cards, not a row of rings.                 */
/*                                                                      */
/* Drawn from their posts, never from a collection: a collection lives  */
/* on its owner's phone, so "rarest in your posts" is what anyone       */
/* opening the profile can truthfully be shown. Each card shows that    */
/* post's own photo (signed with the rest of the grid by                */
/* usePostsByAuthor), and only a photo that will not sign falls back to */
/* the drink's lit face. Tapping a card opens the post.                 */
/*                                                                      */
/* A full-bleed band with its lip, and the shade IN FLOW: the band is a */
/* list header's child, and the TabStrip starts right under the shade.  */
/* ==================================================================== */

const CARDS = 3;
const CARD_GAP = space.sm;
/** The shelf mount's content column: the card less its 1pt edges and 12pt of mat, cardW - 26. */
const SHELF_INSET = 2 * (stroke.edge + MOUNT.shelf.padding);
/** Window height as a share of the card's width (102pt on a 440pt phone). */
const WINDOW_ASPECT = 0.78;
/** Dynamic Type cap for the band's text (spec 6.5): the cards' windows do not grow with it. */
const CAP = 1.3;

export function TopShelf({
  posts,
  isOwn,
  collected,
  pageOnly,
}: {
  /** The person's renderable posts (ProfileView's `shown`). */
  posts: Post[];
  isOwn: boolean;
  /** Your own Dex count, for the link at the right. Unused on someone else's profile. */
  collected: number;
  /** The posts are the latest page of more, so the shared count is a floor. */
  pageOnly: boolean;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const picks = useMemo(() => topShelf(posts, CARDS), [posts]);
  // One post per drink (migration 007), but counted by drink so a stray duplicate cannot inflate it.
  const distinct = useMemo(() => new Set(posts.map((p) => p.drinkId)).size, [posts]);

  if (picks.length === 0) return null;

  // Unrounded, like the grid's: rounded, three cards and two gaps miss the gutter.
  const cardW = (width - layout.gutter * 2 - CARD_GAP * (CARDS - 1)) / CARDS;
  const shared = `${formatCount(distinct)}${pageOnly ? '+' : ''} shared`;

  return (
    <LiningBand lip style={styles.band}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={CAP} style={styles.title}>
            Top shelf
          </Text>
          <Text maxFontSizeMultiplier={CAP} style={styles.subtitle}>
            {isOwn ? 'Rarest in your posts' : 'Rarest in their posts'}
          </Text>
        </View>
        {isOwn ? (
          <Pressable
            onPress={() => router.navigate('/dex')}
            // 18pt of type; 13 above and below reach the 44pt touch floor.
            hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Your Dex, ${formatCount(collected)} collected`}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={CAP} style={styles.linkText}>
              Dex {formatCount(collected)}
            </Text>
            <Icon name="chevronRight" size={14} color={colors.onLining} />
          </Pressable>
        ) : (
          <Text
            maxFontSizeMultiplier={CAP}
            accessibilityLabel={`${pageOnly ? 'At least ' : ''}${formatCount(distinct)} drinks shared`}
            style={styles.shared}>
            {shared}
          </Text>
        )}
      </View>
      <View style={styles.cards}>
        {picks.map(({ drink, post }) => (
          <ShelfCard key={drink.id} drink={drink} post={post} width={cardW} isOwn={isOwn} />
        ))}
      </View>
    </LiningBand>
  );
}

/**
 * One mounted card: the post's photo in a shelf mount's window, the tier
 * in words, then the drink's name in Playfair, whole (DrinkName fits a long
 * word to the column; the row stretches all three cards to the tallest).
 */
function ShelfCard({
  drink,
  post,
  width,
  isOwn,
}: {
  drink: Drink;
  post: Post;
  width: number;
  isOwn: boolean;
}) {
  const router = useRouter();
  // The post is the retry key, as on the grid tiles: a pull re-asks for a photo that failed.
  const photoUrl = useSignedPhoto(post.photoPath, post);
  const column = width - SHELF_INSET;
  const windowH = Math.round(width * WINDOW_ASPECT);

  return (
    <PressableScale
      // A media card in a scrolling list: DexCard's no-tick, delayed press.
      noHaptic
      unstable_pressDelay={120}
      onPress={() => {
        haptic.tap();
        router.navigate({ pathname: '/post/[id]', params: { id: post.id } });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${RARITY_META[drink.rarity].label}`}
      accessibilityHint={isOwn ? 'Opens your post' : 'Opens their post'}
      style={[styles.card, { width }]}>
      <Mount state="mounted" tier={drink.rarity} size="shelf" onLining style={styles.mount}>
        {/*
          A fixed box around the window: MountWindow grows into slack, and
          here the slack (a neighbour's two-line name) belongs under the
          name, so the three windows stay one height.
        */}
        <View style={{ height: windowH }}>
          {/* `undefined` is still signing: the window's own cellar ground holds the frame. */}
          <MountWindow height={windowH} state="mounted">
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl, cacheKey: post.photoPath ?? undefined }}
                // Keyed on the storage path and cached as the grid's tiles are (PostGrid).
                cachePolicy="memory-disk"
                // Decoded at the window's size, not the 2048px upload's (PostGrid says why).
                enforceEarlyResizing
                contentFit="cover"
                transition={motion.fast}
                accessible={false}
                style={StyleSheet.absoluteFill}
              />
            ) : photoUrl === null ? (
              <DrinkFace drink={drink} mode="lit" width={column} height={windowH} style={FACE_FILL} />
            ) : null}
          </MountWindow>
        </View>
        <View style={styles.tier}>
          <TierWord rarity={drink.rarity} tone="paper" size="sm" />
        </View>
        <DrinkName
          name={drink.name}
          role={textRole.miniName}
          measure={column}
          cap={CAP}
          color={colors.text}
          style={styles.name}
        />
      </Mount>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // The section above ends on its actions; 16pt down, the band runs edge to edge.
  band: { marginTop: space.lg, paddingTop: 14, paddingBottom: space.lg },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: layout.gutter,
    gap: space.md,
  },
  // Title and subtitle on one baseline; the subtitle drops under the title when they do not fit.
  titles: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space.sm,
  },
  title: { ...textRole.shelfTitle, color: colors.onLining },
  subtitle: { ...textRole.helper, color: colors.onLiningMuted },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { ...textRole.helper, fontFamily: fonts.bodySemiBold, color: colors.onLining },
  shared: { ...textRole.helper, color: colors.onLiningMuted },
  pressed: { opacity: 0.5 },
  cards: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: CARD_GAP,
    paddingHorizontal: layout.gutter,
    marginTop: space.md,
  },
  /* Width from the `width` prop; height from the tallest card in the row. */
  card: {},
  mount: { flexGrow: 1 },
  tier: { marginTop: 7 },
  name: { marginTop: space.xs },
});
