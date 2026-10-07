import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { HeroFigure } from '@/components/cabinet';
import { DexCard } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { Button } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { formatCount, getDrink, TOTAL } from '@/data';
import { catalogueCount } from '@/lib/cabinet';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory, Post } from '@/types';

/* ==================================================================== */
/* A profile's Dex tab                                                  */
/*                                                                      */
/* The drinks this person has shared, in Dex order, as Dex cards: the    */
/* binder view is what makes a profile Sipply's rather than any photo    */
/* app's. It is built from their PUBLIC POSTS only. A collection lives   */
/* on its owner's phone and never reaches the server, so this is the     */
/* honest substitute, and the summary says "shared", never "collected". */
/* On your own profile, one button leads to the real thing, your Dex.   */
/*                                                                      */
/* In the cabinet's lining, like the Dex tray: every row is a stretch   */
/* of grained lining with a shelf ledge under it, and each card is a    */
/* collected mount seated there. The card's face is the person's OWN    */
/* pour of that drink, the post's photo, because every drink on this    */
/* tab came from a post: the stock photo exists for one drink in        */
/* thirteen, and threw that pour away.                                  */
/* ==================================================================== */

/**
 * Stats for a profile, derived from its PUBLIC POSTS only.
 *
 * A peer's real collection lives on their device and never reaches the
 * server, so this is the honest substitute: the category spread of the
 * drinks they've actually shared. `counted` skips posts whose drink isn't
 * in this build, so the figures sum to the drinks we can classify.
 */
export function derivePostStats(posts: Post[]) {
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, spirit: 0 };

  let counted = 0;
  for (const post of posts) {
    const drink = getDrink(post.drinkId);
    if (!drink) continue;
    counted += 1;
    byCategory[drink.category] += 1;
  }

  return { counted, byCategory };
}

/** A shared drink and the post it came from (its photo is the card's face). */
export interface SharedDrink {
  drink: Drink;
  post: Post;
}

/**
 * The shared drinks, lowest Dex number first, each with its post. A post
 * is one drink (one post per drink, migration 007), so there is nothing to
 * de-duplicate.
 */
export function sharedByDexNumber(posts: Post[]): SharedDrink[] {
  return posts
    .flatMap((post): SharedDrink[] => {
      const drink = getDrink(post.drinkId);
      return drink ? [{ drink, post }] : [];
    })
    .sort((a, b) => a.drink.dexNumber - b.drink.dexNumber);
}

/** Every catalogue drink in your collection: the figure the Dex shows, and this tab's link to it. */
export function useCollectedCount(): number {
  const unlocks = useCollection((s) => s.unlocks);
  return useMemo(() => catalogueCount(unlocks), [unlocks]);
}

/**
 * The head of the Dex tab, on the lining: how many drinks are shared as a
 * large figure, and on your own profile the way into your Dex.
 */
export function DexSummary({
  posts,
  isOwn,
  pageOnly,
}: {
  posts: Post[];
  isOwn: boolean;
  /** The posts are one page of more, so every figure here covers that page. */
  pageOnly: boolean;
}) {
  const router = useRouter();
  const { counted } = useMemo(() => derivePostStats(posts), [posts]);
  const collected = useCollectedCount();

  return (
    <View style={styles.lining}>
      <Grain tone="lining" />
      <View style={styles.summary}>
        <HeroFigure value={counted} caption={`of ${formatCount(TOTAL)} shared`} tone="lining" />
        {/*
          Past one page, "shared" counts the latest page, not everything, and
          the line says so rather than pass a hundred off as the total.
        */}
        {pageOnly ? (
          <Text style={styles.note}>
            Based on {isOwn ? 'your' : 'their'} latest {formatCount(posts.length)} posts
          </Text>
        ) : null}

        {isOwn ? (
          /*
           * What other people see is above; what you have actually collected
           * (most of it never posted) is one tap away, in the Dex tab, rather
           * than a second figure in the header that only your profile could
           * show.
           */
          <Button
            label={`${formatCount(collected)} in your Dex`}
            variant="onLiningText"
            size="sm"
            onPress={() => router.navigate('/dex')}
            accessibilityHint="Opens your Dex"
            style={styles.dexLink}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Two Dex cards to a row, the Dex tray's own geometry: 2-up because three
 * cards on a 375pt screen leave the drink's name a word or two wide (the
 * Dex tab's note), and the same card so a drink looks the same wherever
 * it is shown. Each is drawn collected and seated, with the person's own
 * photo of that pour. A ledge runs under every row but the last, which
 * ends on lining instead.
 */
export function DexShelfRow({ entries, last }: { entries: SharedDrink[]; last: boolean }) {
  const { width } = useWindowDimensions();
  // Unrounded, like the Dex grid's: a rounded width leaves a sliver or wraps.
  const cardWidth = (width - layout.gutter * 2 - layout.dexGap) / 2;

  return (
    <View style={styles.lining}>
      <Grain tone="lining" />
      <View style={styles.shelfRow}>
        {entries.map(({ drink, post }) => (
          <SharedCard key={drink.id} drink={drink} post={post} cardWidth={cardWidth} />
        ))}
      </View>
      {last ? <View style={styles.rowFoot} /> : <Ledge />}
    </View>
  );
}

/**
 * One shared drink. Its own component so each card signs its own post's
 * photo; usePostsByAuthor signed the whole list in one request already, so
 * this is normally answered from the cache on the first render. Until it
 * is (or if it will not sign) the card shows the drink's lit face, the
 * catalogue photo or else the lit vector glass, as DexCard does for any
 * missing photo.
 */
function SharedCard({ drink, post, cardWidth }: { drink: Drink; post: Post; cardWidth: number }) {
  const router = useRouter();
  const photo = useSignedPhoto(post.photoPath, post);
  return (
    <DexCard
      drink={drink}
      collected
      onLining
      userPhotoUri={photo ?? null}
      userPhotoCacheKey={post.photoPath ?? null}
      cardWidth={cardWidth}
      onPress={(id) => router.navigate({ pathname: '/drink/[id]', params: { id } })}
    />
  );
}

/**
 * The shelf ledge between two rows of mounts, as in the Dex tray: a 5pt
 * shadowed strip with a 1pt lip of light along its top. Decorative.
 */
function Ledge() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.ledge}>
      <View style={styles.ledgeStrip} />
    </View>
  );
}

const styles = StyleSheet.create({
  lining: { backgroundColor: colors.lining },
  summary: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  note: { ...textRole.helper, color: colors.onLiningMuted, marginTop: 2 },
  // A text button sits on its own 44pt hit line; this keeps its label on the gutter.
  dexLink: { alignSelf: 'flex-start', marginLeft: -space.sm, marginTop: space.xs },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: layout.dexGap,
    paddingHorizontal: layout.gutter,
  },
  ledge: { height: layout.dexLedge },
  ledgeStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 5,
    height: 5,
    backgroundColor: colors.ledge,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.liningLip,
  },
  // The last row ends on lining as deep as a ledge, so the tray does not stop at a card's edge.
  rowFoot: { height: layout.dexLedge },
});
