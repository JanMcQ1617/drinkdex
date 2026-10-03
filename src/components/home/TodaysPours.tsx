import { Image } from 'expo-image';
import React, { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DrinkArt } from '@/components/artwork';
import { groupPours, POUR_WINDOW_MS } from '@/components/home/groupPours';
import { Icon, type IconName } from '@/components/icons';
import { haptic, PressableScale } from '@/components/ui';
import { CATEGORY_META, colors, fonts, layout, motion, radius, space, stroke } from '@/constants/theme';
import { getDrink } from '@/data';
import { primeSignedUrls } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useSeen } from '@/store/seen';
import type { Pour, UserProfile } from '@/types';

/* ==================================================================== */
/* Today's pours                                                        */
/*                                                                      */
/* The row under Home's top bar: each tile is one person's newest pour  */
/* from the last 24 hours, and tapping it opens the viewer. The POUR is */
/* the content, so a tile shows the drink, not the face, in a 4:5       */
/* rectangle with the person's name under it. A rectangle thumbnail is  */
/* v2's shape for a picture this size; a gradient ring round a face is  */
/* another app's mark, and is not borrowed.                             */
/*                                                                      */
/* NEW IS SAID TWICE. An unseen tile has a 2pt wine frame and a name in */
/* ink; a seen one a 1pt rule and a muted name. The frame's thickness   */
/* is the cue that does not depend on colour. Until the seen marks have */
/* been read from disk every frame is drawn seen, so nothing flashes    */
/* wine and then turns grey a moment after launch.                      */
/*                                                                      */
/* NO PLACEHOLDERS. Before the first answer, or after a failed one, the */
/* row is your own tile alone: no skeleton tiles and no message,        */
/* because the feed below already says whether the connection is there. */
/* ==================================================================== */

/** The tile's 4:5 frame. */
const TILE_W = 72;
const TILE_H = 90;
/**
 * The photo's inset from the frame's OUTER edge, whatever the frame's
 * width, so a tile never changes size between new and seen. Its corner
 * is concentric with the frame's: radius.control − INSET.
 */
const INSET = 3;
/** The + badge on your own tile: square, because it sits on a thumbnail, not an avatar. */
const BADGE = 22;
/** How far the badge hangs past the frame's corner. */
const BADGE_OVERHANG = 4;
/** The longest single wait for the next tile to expire; re-armed after. */
const MAX_TIMER_MS = 60 * 60 * 1000;

export interface TodaysPoursProps {
  myId: string;
  pours: Pour[];
  status: 'idle' | 'ready' | 'error';
  profiles: Record<string, UserProfile>;
  seenHydrated: boolean;
  onLog: () => void;
  onOpen: (authorId: string) => void;
  onFindFriends: () => void;
}

/**
 * The time the row is drawn against, moved on when the next pour reaches
 * 24 hours, so its tile leaves the row at that moment rather than at the
 * next refetch. One timer, aimed at the next expiry and capped at an hour
 * (long timers are re-armed rather than trusted), and re-aimed whenever
 * the pours change. A pour that ran out while nothing re-rendered is
 * caught at once: its expiry is already past, so the timer fires at 0.
 */
function useExpiryClock(pours: Pour[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let next = Infinity;
    for (const p of pours) {
      const ends = Date.parse(p.at) + POUR_WINDOW_MS;
      if (ends > now && ends < next) next = ends;
    }
    if (next === Infinity) return;
    const wait = Math.min(Math.max(0, next - Date.now()), MAX_TIMER_MS);
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [pours, now]);
  return now;
}

export function TodaysPours({
  myId,
  pours,
  status,
  profiles,
  seenHydrated,
  onLog,
  onOpen,
  onFindFriends,
}: TodaysPoursProps) {
  const seen = useSeen((s) => s.pours[myId]);
  const now = useExpiryClock(pours);
  const { mine, others } = groupPours(pours, myId, seen, now);
  const ready = status === 'ready';
  const shown = ready ? others : [];

  /*
   * One signing request for every tile in the row, rather than one per
   * tile as each mounts. Keyed by the paths themselves, so a refetch that
   * changes nothing signs nothing.
   *
   * A LAYOUT effect, on purpose. Passive effects run children first, so
   * from a plain useEffect every tile's own signing (useSignedPhoto) had
   * already gone out by the time this ran, and the batch found nothing
   * left to sign. Layout effects all run before any passive one, so the
   * batch is in the cache first and each tile waits on it instead.
   */
  const newestPaths = [mine, ...shown].flatMap((g) => (g ? [g.pours[g.pours.length - 1]!.path] : []));
  const pathsKey = newestPaths.join('\n');
  useLayoutEffect(() => {
    if (pathsKey) void primeSignedUrls('pours', pathsKey.split('\n'));
  }, [pathsKey]);

  /*
   * scrollsToTop off: UIKit honours a status-bar tap only when exactly one
   * scroll view on screen opts in, and every ScrollView opts in by default.
   * With this row in too, the tap reached neither, and the feed never went
   * back to the top.
   */
  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        scrollsToTop={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}>
        {mine ? (
          <PhotoTile
            pour={mine.pours[mine.pours.length - 1]!}
            unseen={false}
            label="Your pours"
            accessibilityLabel={`Your pours today, ${mine.pours.length}`}
            onPress={() => onOpen(myId)}
            badge={
              <Pressable
                onPress={onLog}
                hitSlop={11}
                accessibilityRole="button"
                accessibilityLabel="Log a pour"
                style={({ pressed }) => [styles.badge, pressed && styles.badgePressed]}>
                <Icon name="plus" size={14} color={colors.textOnWine} />
              </Pressable>
            }
          />
        ) : (
          <ActionTile icon="plus" label="Log a pour" onPress={onLog} />
        )}

        {shown.map((g) => {
          const who = profiles[g.authorId];
          const n = g.pours.length;
          const unseen = seenHydrated && g.unseen;
          return (
            <PhotoTile
              key={g.authorId}
              pour={g.pours[n - 1]!}
              unseen={unseen}
              label={who?.username ?? 'someone'}
              accessibilityLabel={`${who?.displayName ?? 'Someone'}, ${n} ${n === 1 ? 'pour' : 'pours'} today${unseen ? ', new' : ''}`}
              accessibilityHint="Opens their pours"
              onPress={() => onOpen(g.authorId)}
            />
          );
        })}

        {ready && others.length === 0 ? (
          <ActionTile icon="users" label="Find friends" onPress={onFindFriends} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ==================================================================== */
/* Tiles                                                                */
/* ==================================================================== */

/**
 * A person's newest pour in its frame, with their name under it. A media
 * tile: it gives under the finger (PressableScale) and starts its press
 * only after 120 ms, so a flick along the row scrolls instead of opening.
 */
function PhotoTile({
  pour,
  unseen,
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  badge,
}: {
  pour: Pour;
  unseen: boolean;
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  badge?: ReactNode;
}) {
  // The pour as the retry key: a refetch hands over a new object, so a
  // photo that failed to sign gets another try on pull-to-refresh.
  const url = useSignedPhoto(pour.path, pour);
  const drink = getDrink(pour.drinkId);
  const edge = unseen ? 2 : stroke.edge;
  const inset = INSET - edge;

  return (
    <View style={styles.tile}>
      <PressableScale
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        noHaptic
        unstable_pressDelay={120}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}>
        <View
          style={[
            styles.frame,
            { borderWidth: edge, borderColor: unseen ? colors.wine : colors.line },
          ]}>
          <View
            style={[
              styles.photo,
              { top: inset, left: inset, right: inset, bottom: inset },
              url === null && drink ? { backgroundColor: CATEGORY_META[drink.category].wash } : null,
            ]}>
            {url ? (
              <Image
                source={{ uri: url, cacheKey: pour.path }}
                cachePolicy="memory-disk"
                /*
                 * Decoded at the tile's 72pt size, not the 2048px upload: the
                 * row is a plain ScrollView, so every tile in it (up to 50) is
                 * mounted at once, for as long as Home is. PostGridTile
                 * (profile/PostGrid) has the whole reason.
                 */
                enforceEarlyResizing
                contentFit="cover"
                transition={motion.fast}
                style={StyleSheet.absoluteFill}
              />
            ) : url === null && drink ? (
              <DrinkArt drink={drink} size={44} flat />
            ) : null}
          </View>
        </View>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={[styles.label, { color: unseen ? colors.text : colors.textMuted }]}>
          {label}
        </Text>
      </PressableScale>
      {badge}
    </View>
  );
}

/** Your empty tile ("Log a pour") and the Find friends tile: a glyph on the sunk ground. */
function ActionTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <View style={styles.tile}>
      <PressableScale
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        noHaptic
        unstable_pressDelay={120}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <View style={[styles.frame, styles.frameAction]}>
          <Icon name={icon} size={22} color={colors.text} />
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, styles.labelAction]}>
          {label}
        </Text>
      </PressableScale>
    </View>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: stroke.hair,
    borderBottomColor: colors.line,
  },
  rowContent: {
    paddingHorizontal: layout.gutter,
    paddingVertical: space.md,
    gap: space.md,
  },
  tile: { width: TILE_W },
  frame: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: radius.control,
    backgroundColor: colors.bg,
  },
  frameAction: {
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.bgSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Positioned by the frame's edge width (see INSET); sunk while the URL is on its way. */
  photo: {
    position: 'absolute',
    borderRadius: radius.control - INSET,
    overflow: 'hidden',
    backgroundColor: colors.bgSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 6,
    width: TILE_W,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  /* An action, not a person: ink, like an unseen name. */
  labelAction: { color: colors.text },
  badge: {
    position: 'absolute',
    left: TILE_W - BADGE + BADGE_OVERHANG,
    top: TILE_H - BADGE + BADGE_OVERHANG,
    width: BADGE,
    height: BADGE,
    borderRadius: radius.badge,
    backgroundColor: colors.wine,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePressed: { backgroundColor: colors.wineDeep },
});
