import { Image } from 'expo-image';
import React, { useLayoutEffect } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { haptic, PressableScale } from '@/components/ui';
import { colors, layout, motion, space, textRole } from '@/constants/theme';
import { primeSignedUrls } from '@/lib/social';
import { faceOf, fitScale, textWidth, type Face } from '@/lib/textFit';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import type { Drink, Post, UserProfile } from '@/types';

/* ==================================================================== */
/* Not in your Dex yet                                                  */
/*                                                                      */
/* A row set into the feed (after the 5th post and the 15th): drinks    */
/* people you follow have posted that you have not caught. Each is the  */
/* friend's photo as a small print on the page, its name in Playfair    */
/* under it and who posted it under that. The picks come from           */
/* lib/cabinet's notInDexYet over the feed already on the phone: no new */
/* query, and only drinks friends really posted.                        */
/*                                                                      */
/* DAYLIGHT. No band, no ground of its own: a heading and the prints,   */
/* set apart from the posts round it by space alone (layout principle   */
/* 3), the same 32 that separates two posts.                            */
/*                                                                      */
/* Names are never cut, and every print's name slot is as tall as the   */
/* tallest name in the row, worked out before layout (wrappedHeight,    */
/* below), so the row does not grow when a later print mounts.          */
/* ==================================================================== */

export type NotInDexYetPick = { drink: Drink; post: Post };

/** A print: 136 wide at the feed's 4:5, since it is the friend's post photo. */
const PRINT_W = 136;
const PRINT_H = Math.round(PRINT_W / layout.feedPhotoAspect);
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
 * row laid out with it may keep a line spare, but never grows after its
 * first frame.
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
/* The row                                                              */
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
   * One signing request for the row's photos, in a layout effect so it is
   * out before each print's own useSignedPhoto (TodaysPours says why). The
   * posts further down the feed have not been drawn yet, so nothing else
   * has signed them.
   */
  const pathsKey = picks.flatMap((p) => photoOf(p.post) ?? []).join('\n');
  useLayoutEffect(() => {
    if (pathsKey) void primeSignedUrls('pours', pathsKey.split('\n'));
  }, [pathsKey]);

  let nameSlot = 0;
  for (const p of picks) {
    nameSlot = Math.max(nameSlot, wrappedHeight(p.drink.name, textRole.name, PRINT_W, CAP, fontScale));
  }
  nameSlot = Math.ceil(nameSlot);

  return (
    <View style={styles.band}>
      <Text accessibilityRole="header" style={styles.head}>
        Not in your Dex yet
      </Text>
      {/*
        initialNumToRender 3 is what one screen shows: the first items are
        never unmounted, so the default 10 would hold every print's decoded
        photo for as long as the row is in the feed's window.
      */}
      <FlatList
        horizontal
        data={picks}
        keyExtractor={(p) => p.drink.id}
        renderItem={({ item }) => (
          <Pick
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
    </View>
  );
}

/**
 * One drink: the friend's photo as a print (signed, decoded at the print's
 * size), else the drink's own daylight print; under it the name and who
 * posted it. A media tile, so it gives under the finger and waits 120 ms
 * before its press, letting a flick scroll the row.
 */
function Pick({
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
      accessibilityHint="Opens the drink"
      style={styles.card}>
      <Print width={PRINT_W} height={PRINT_H}>
        {url && path ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: url, cacheKey: `${path}#${PRINT_W}x${PRINT_H}` }}
            cachePolicy="memory-disk"
            // A pour is stored at up to 2048px; decoded at the print's 136pt.
            enforceEarlyResizing
            contentFit="cover"
            transition={motion.fast}
            accessible={false}
            style={StyleSheet.absoluteFill}
          />
        ) : url === null ? (
          <DrinkFace drink={drink} mode="photo" width={PRINT_W} height={PRINT_H} style={FACE_FILL} />
        ) : null}
      </Print>
      <View style={[styles.name, { minHeight: nameSlot }]}>
        <DrinkName name={drink.name} role={textRole.name} measure={PRINT_W} cap={CAP} color={colors.text} />
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={CAP} style={styles.username}>
        {username}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Nothing above (the post before ends in its own 32); the 32 under it is the gap to the next post.
  band: { paddingBottom: layout.section },
  head: { ...textRole.bodyStrong, color: colors.text, paddingHorizontal: layout.gutter },
  rail: { paddingHorizontal: layout.gutter, paddingTop: space.md },
  printGap: { width: space.md },
  card: { width: PRINT_W },
  // The Dex's 8 between a print and its name.
  name: { marginTop: space.sm },
  username: { ...textRole.small, color: colors.textMuted },
});
