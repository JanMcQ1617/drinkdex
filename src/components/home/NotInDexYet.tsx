import { Image } from 'expo-image';
import React, { useLayoutEffect } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, LiningBand, LoosePrint, TierWord } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { wrappedHeight } from '@/components/home/TodaysPours';
import { haptic, PressableScale } from '@/components/ui';
import { colors, fonts, layout, motion, RARITY_META, stroke, textRole, type } from '@/constants/theme';
import { primeSignedUrls } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import type { Drink, Post, UserProfile } from '@/types';

/* ==================================================================== */
/* Not in your Dex yet                                                  */
/*                                                                      */
/* A band of the cabinet's lining set into the feed (after the 5th post */
/* and the 15th): drinks people you follow have poured that you have    */
/* not caught. Each is a LOOSE PRINT, their photo lying in the lining   */
/* rather than mounted, because it is not yours yet. The picks come     */
/* from lib/cabinet's notInDexYet over the feed already on the phone:   */
/* no new query, and only drinks friends really posted.                 */
/*                                                                      */
/* It is a list ITEM, so its shade is in flow (LiningBand's default):   */
/* an absolute child of one FlatList cell is painted over by the next   */
/* cell whatever its zIndex (specs/v3-cabinet.md 5.4).                  */
/*                                                                      */
/* Names are never cut, and every print's name slot is as tall as the   */
/* tallest name in the band, worked out before layout (TodaysPours's    */
/* wrappedHeight), so the band does not grow when a later print mounts. */
/* ==================================================================== */

export type NotInDexYetPick = { drink: Drink; post: Post };

/** A print: 136 x 164, its photo inside the 1pt edge. */
const PRINT_W = 136;
const PRINT_H = 164;
/** Dynamic Type cap for a print's labels (spec §6.5). */
const CAP = 1.3;

/**
 * The print's photo: the post's newest, the one its feed card opens on.
 * The gallery (photoPaths) is sorted newest first; a post from before
 * galleries has only photoPath.
 */
function photoOf(post: Post): string | null {
  return post.photoPaths?.[0] ?? post.photoPath ?? null;
}

function PrintGap() {
  return <View style={styles.printGap} />;
}

export function NotInDexYet({
  picks,
  profiles,
  onOpenDrink,
}: {
  picks: NotInDexYetPick[];
  profiles: Record<string, UserProfile>;
  onOpenDrink: (drinkId: string) => void;
}) {
  const { fontScale } = useWindowDimensions();

  /*
   * One signing request for the band's photos, in a layout effect so it
   * is out before each print's own useSignedPhoto (TodaysPours says why).
   * The posts further down the feed have not been drawn yet, so nothing
   * else has signed them.
   */
  const pathsKey = picks.flatMap((p) => photoOf(p.post) ?? []).join('\n');
  useLayoutEffect(() => {
    if (pathsKey) void primeSignedUrls('pours', pathsKey.split('\n'));
  }, [pathsKey]);

  let nameSlot = 0;
  for (const p of picks) {
    nameSlot = Math.max(nameSlot, wrappedHeight(p.drink.name, textRole.printName, PRINT_W, CAP, fontScale));
  }
  nameSlot = Math.ceil(nameSlot);

  return (
    <LiningBand lip style={styles.band}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[textRole.shelfTitle, { color: colors.onLining }]}>
          Not in your Dex yet
        </Text>
        <Text style={[textRole.helper, { color: colors.onLiningMuted }]}>Poured by people you follow</Text>
      </View>
      {/*
        initialNumToRender 3 is what one screen shows: the first items are
        never unmounted, so the default 10 would hold every print's decoded
        photo for as long as the band is in the feed's window.
      */}
      <FlatList
        horizontal
        data={picks}
        keyExtractor={(p) => p.drink.id}
        renderItem={({ item }) => (
          <Print
            drink={item.drink}
            post={item.post}
            username={profiles[item.post.authorId]?.username ?? 'someone'}
            nameSlot={nameSlot}
            onOpen={onOpenDrink}
          />
        )}
        ItemSeparatorComponent={PrintGap}
        initialNumToRender={3}
        windowSize={2}
        scrollsToTop={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      />
    </LiningBand>
  );
}

/**
 * One drink: the friend's photo as a loose print (signed, decoded at the
 * print's size), else the drink's lit face; under it the name, the tier
 * in words and who poured it. A media tile, so it gives under the finger
 * and waits 120 ms before its press, letting a flick scroll the band.
 */
function Print({
  drink,
  post,
  username,
  nameSlot,
  onOpen,
}: {
  drink: Drink;
  post: Post;
  username: string;
  nameSlot: number;
  onOpen: (drinkId: string) => void;
}) {
  const path = photoOf(post);
  // The post as the retry key, as on the feed: a refetch hands over a new object.
  const url = useSignedPhoto(path, post);
  const tier = RARITY_META[drink.rarity].label.toLowerCase();
  const inner = { w: PRINT_W - 2 * stroke.edge, h: PRINT_H - 2 * stroke.edge };

  return (
    <PressableScale
      onPress={() => {
        haptic.tap();
        onOpen(drink.id);
      }}
      noHaptic
      unstable_pressDelay={120}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${tier}, poured by ${username}. Not in your Dex yet`}
      accessibilityHint="Opens it in the Dex"
      style={styles.card}>
      <LoosePrint width={PRINT_W} height={PRINT_H}>
        {url && path ? (
          <Image
            source={{ uri: url, cacheKey: path }}
            cachePolicy="memory-disk"
            // A pour is stored at up to 2048px; decoded at the print's 136pt.
            enforceEarlyResizing
            contentFit="cover"
            transition={motion.fast}
            accessible={false}
            style={StyleSheet.absoluteFill}
          />
        ) : url === null ? (
          <DrinkFace drink={drink} mode="lit" width={inner.w} height={inner.h} style={FACE_FILL} />
        ) : null}
      </LoosePrint>
      <View style={[styles.name, { minHeight: nameSlot }]}>
        <DrinkName name={drink.name} role={textRole.printName} measure={PRINT_W} cap={CAP} color={colors.onLining} />
      </View>
      <View style={styles.tier}>
        <TierWord rarity={drink.rarity} tone="lining" size="sm" />
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={CAP} style={styles.username}>
        {username}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  band: { paddingTop: 18, paddingBottom: 20 },
  head: { paddingHorizontal: layout.gutter, gap: 2 },
  rail: { paddingHorizontal: layout.gutter, paddingTop: 14 },
  printGap: { width: 12 },
  card: { width: PRINT_W },
  name: { marginTop: 9 },
  tier: { marginTop: 3, alignItems: 'flex-start' },
  username: {
    ...type.micro,
    fontFamily: fonts.body,
    marginTop: 2,
    color: colors.onLiningMuted,
  },
});
