import { Image } from 'expo-image';
import React, { useLayoutEffect } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, LiningBand, LoosePrint } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { haptic, PressableScale } from '@/components/ui';
import { colors, fonts, layout, motion, stroke, textRole, type } from '@/constants/theme';
import { primeSignedUrls } from '@/lib/social';
import { faceOf, fitScale, textWidth, type Face } from '@/lib/textFit';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import type { Drink, Post, UserProfile } from '@/types';

/* ==================================================================== */
/* Not in your Dex yet                                                  */
/*                                                                      */
/* A band of the cabinet's lining set into the feed (after the 5th post */
/* and the 15th): drinks people you follow have posted that you have    */
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
/* tallest name in the band, worked out before layout (wrappedHeight,   */
/* below), so the band does not grow when a later print mounts.         */
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

/* ==================================================================== */
/* How tall a name will be, before it is laid out                       */
/* ==================================================================== */

/** Lines `text` wraps to at `size` in a `measure`-wide column, by lib/textFit's (wide) widths. */
function lineCount(text: string, face: Face, size: number, measure: number): number {
  const gap = textWidth(' ', face, size);
  let lines = 0;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const w = textWidth(word, face, size);
    if (used > 0 && used + gap + w <= measure) {
      used += gap + w;
      continue;
    }
    // A new line; a word wider than the line breaks inside itself over as many as it needs.
    const span = Math.max(1, Math.ceil(w / measure));
    lines += span;
    used = w - (span - 1) * measure;
  }
  return Math.max(1, lines);
}

/**
 * The height `text` takes in a column `measure` wide, worked out the way
 * DrinkName sizes a name (shrunk until its widest word fits), at this
 * Dynamic Type size and cap. lib/textFit errs wide, so this errs tall: a
 * band laid out with it may keep a line spare, but never grows after its
 * first frame. (It lived in TodaysPours until the stories lost their
 * name line; this band is its only reader now.)
 */
function wrappedHeight(
  text: string,
  role: { fontFamily: string; fontSize: number; lineHeight: number },
  measure: number,
  cap: number,
  fontScale: number,
): number {
  const face = faceOf(role.fontFamily);
  const grow = Math.min(fontScale, cap);
  const size = role.fontSize * grow;
  const scale = fitScale(text, face, size, measure);
  return lineCount(text, face, size * scale, measure) * role.lineHeight * grow * scale;
}

/* ==================================================================== */
/* The band                                                             */
/* ==================================================================== */

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
        <Text style={[textRole.helper, { color: colors.onLiningMuted }]}>Posted by people you follow</Text>
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
 * print's size), else the drink's lit face; under it the name and who
 * posted it. A media tile, so it gives under the finger and waits 120 ms
 * before its press, letting a flick scroll the band.
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
      accessibilityLabel={`${drink.name}, posted by ${username}. Not in your Dex yet`}
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
  username: {
    ...type.micro,
    fontFamily: fonts.body,
    marginTop: 3,
    color: colors.onLiningMuted,
  },
});
