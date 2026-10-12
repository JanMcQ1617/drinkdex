import { Image } from 'expo-image';
import React, { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { groupPours, POUR_WINDOW_MS, type PourGroup } from '@/components/home/groupPours';
import { Icon } from '@/components/icons';
import { Avatar, haptic, PressableScale } from '@/components/ui';
import { colors, layout, motion, radius, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { primeSignedUrls, toProfile } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useSeen } from '@/store/seen';
import type { Drink, Pour, UserProfile } from '@/types';

/* ==================================================================== */
/* Today's pours: the stories                                           */
/*                                                                      */
/* The row under Home's bar. Each circle is one person's newest post    */
/* from the last 24 hours, and tapping it opens the viewer. The POST is */
/* the content, so a circle shows the photo, not the face, with the     */
/* person's name under it on one line; the drink is in the picture and  */
/* in the spoken label.                                                 */
/*                                                                      */
/* FIVE WHOLE RINGS (the judges' fix to the less-stuff layout). Each    */
/* circle owns a fifth of the gutter-to-gutter column, so five whole    */
/* rings fit any width, the first at the gutter, and the sixth starts   */
/* exactly at the far gutter: it peeks into the margin to say the row   */
/* scrolls, and is never cut mid-ring on screen.                        */
/*                                                                      */
/* NEW IS THE RING. An unseen story has a 2pt ink ring and an ink name; */
/* a seen one has NO ring and a muted name, so the row quiets down as   */
/* you watch it. The ring's presence is the cue, not a colour, and      */
/* VoiceOver says ", new". Until the seen marks have been read from     */
/* disk every story is drawn seen, so nothing is ringed at launch and   */
/* then goes quiet a moment later.                                      */
/*                                                                      */
/* YOU, FIRST, WITH NO BADGE. Your circle is named "You". With no story */
/* today it is your face and opens the + window; with one it is your    */
/* newest photo and plays it, and the viewer has the way to add more.   */
/*                                                                      */
/* ONE LINE, ONE HEIGHT. A username is a single capped line, so the    */
/* row never grows when a later circle mounts. "Find friends" is words, */
/* not a handle, so it wraps rather than lose half a word; it shows     */
/* only when the row has nobody else in it.                             */
/*                                                                      */
/* NO PLACEHOLDERS. Before the first answer, or after a failed one, the */
/* row is your own circle alone: no skeleton circles and no message,    */
/* because the feed below already says whether the connection is there. */
/* ==================================================================== */

const STORY = layout.story;
/** The photo's disc inside the ring box: the box less the ring and its gap on each side (52). */
const DISC = STORY.ring - 2 * (STORY.ringWidth + STORY.gap);
/** Where the disc sits in the ring box. */
const DISC_INSET = (STORY.ring - DISC) / 2;
/** Dynamic Type cap for the name: it sits under a fixed-size circle. */
const LABEL_CAP = 1.3;
/**
 * The rings start 8 under the bar's 52pt row (layout spec 5.1: y 122).
 * Home's spacer is HOME_BAR_HEIGHT, which already counts the bar's 1pt foot.
 */
const RAIL_TOP = space.sm - stroke.edge;
/** The longest single wait for the next story to expire; re-armed after. */
const MAX_TIMER_MS = 60 * 60 * 1000;

export interface TodaysPoursProps {
  myId: string;
  pours: Pour[];
  status: 'idle' | 'ready' | 'error';
  profiles: Record<string, UserProfile>;
  seenHydrated: boolean;
  /** Opens the + window: your circle when you have not posted today. */
  onPost: () => void;
  onOpen: (authorId: string) => void;
  onFindFriends: () => void;
}

/* ==================================================================== */
/* The row                                                              */
/* ==================================================================== */

/**
 * The time the row is drawn against, moved on when the next post reaches
 * 24 hours, so its circle leaves the row at that moment rather than at
 * the next refetch. One timer, aimed at the next expiry and capped at an
 * hour (long timers are re-armed rather than trusted), and re-aimed
 * whenever the pours change. A post that ran out while nothing re-rendered
 * is caught at once: its expiry is already past, so the timer fires at 0.
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

/** One circle of the row. */
type Item =
  /** You posted today: your newest photo, which plays your story. */
  | { kind: 'mine'; group: PourGroup }
  /** You have not posted today: your face, which opens the + window. */
  | { kind: 'you' }
  | { kind: 'friend'; group: PourGroup; unseen: boolean }
  | { kind: 'find' };

function itemKey(item: Item): string {
  return item.kind === 'friend' ? `p:${item.group.authorId}` : item.kind;
}

const newest = (g: PourGroup) => g.pours[g.pours.length - 1]!;

/** "1 post today" / "3 posts today": what the row says aloud, never a count of drinks. */
const postsToday = (n: number) => `${n} ${n === 1 ? 'post' : 'posts'} today`;

export function TodaysPours({
  myId,
  pours,
  status,
  profiles,
  seenHydrated,
  onPost,
  onOpen,
  onFindFriends,
}: TodaysPoursProps) {
  const { width } = useWindowDimensions();
  const seen = useSeen((s) => s.pours[myId]);
  const ownRow = useAuth((s) => s.profile);
  const now = useExpiryClock(pours);
  const { mine, others } = groupPours(pours, myId, seen, now);
  const ready = status === 'ready';
  const shown = ready ? others : [];

  /*
   * A fifth of the column per circle (78.4 at 440, 69 at 393), the ring
   * centred in it; the row's ends are pulled in by the slot's slack, so the
   * first ring lands on the gutter.
   */
  const slot = (width - 2 * layout.gutter) / STORY.perRow;
  const end = layout.gutter - (slot - STORY.ring) / 2;

  // Your own row first (the social store may not hold your profile), for your face.
  const me: UserProfile | undefined = ownRow?.id === myId ? toProfile(ownRow) : profiles[myId];

  /*
   * One signing request for every circle in the row, rather than one per
   * circle as each mounts. Keyed by the paths themselves, so a refetch
   * that changes nothing signs nothing.
   *
   * A LAYOUT effect, on purpose. Passive effects run children first, so
   * from a plain useEffect every circle's own signing (useSignedPhoto) had
   * already gone out by the time this ran, and the batch found nothing
   * left to sign. Layout effects all run before any passive one, so the
   * batch is in the cache first and each circle waits on it instead.
   */
  const newestPaths = [mine, ...shown].flatMap((g) => (g ? [newest(g).path] : []));
  const pathsKey = newestPaths.join('\n');
  useLayoutEffect(() => {
    if (pathsKey) void primeSignedUrls('pours', pathsKey.split('\n'));
  }, [pathsKey]);

  const items: Item[] = [
    mine ? { kind: 'mine', group: mine } : { kind: 'you' },
    ...shown.map((g): Item => ({ kind: 'friend', group: g, unseen: seenHydrated && g.unseen })),
    ...(ready && others.length === 0 ? [{ kind: 'find' } as const] : []),
  ];

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.kind) {
      case 'mine': {
        const pour = newest(item.group);
        const drink = getDrink(pour.drinkId);
        const n = item.group.pours.length;
        return (
          <Story
            width={slot}
            unseen={false}
            label="You"
            ink={colors.text}
            accessibilityLabel={`Your story, ${postsToday(n)}${drink ? `, latest ${drink.name}` : ''}`}
            accessibilityHint="Plays your posts from today"
            onPress={() => onOpen(myId)}>
            <PourFace pour={pour} drink={drink} />
          </Story>
        );
      }
      case 'you':
        return (
          <Story
            width={slot}
            unseen={false}
            label="You"
            ink={colors.text}
            accessibilityLabel="You, post a drink"
            accessibilityHint="Opens the camera"
            onPress={onPost}>
            <Avatar
              name={me?.displayName ?? 'You'}
              accent={me?.accent ?? colors.tone2}
              size={DISC}
              avatarPath={me?.avatarPath}
            />
          </Story>
        );
      case 'friend': {
        const g = item.group;
        const pour = newest(g);
        const drink = getDrink(pour.drinkId);
        const who = profiles[g.authorId];
        return (
          <Story
            width={slot}
            unseen={item.unseen}
            label={who?.username ?? 'someone'}
            ink={item.unseen ? colors.text : colors.textMuted}
            accessibilityLabel={`${who?.displayName ?? 'Someone'}, ${postsToday(g.pours.length)}${
              drink ? `, latest ${drink.name}` : ''
            }${item.unseen ? ', new' : ''}`}
            accessibilityHint="Opens their posts from today"
            onPress={() => onOpen(g.authorId)}>
            <PourFace pour={pour} drink={drink} />
          </Story>
        );
      }
      case 'find':
        return (
          <Story
            width={slot}
            unseen={false}
            label="Find friends"
            lines={2}
            ink={colors.text}
            accessibilityLabel="Find friends"
            onPress={onFindFriends}>
            <View style={styles.glyph}>
              <Icon name="users" size={24} color={colors.text} />
            </View>
          </Story>
        );
    }
  };

  /*
   * A FlatList, not a ScrollView: a ScrollView mounted every circle (up to
   * 50) for as long as Home was, each holding its decoded photo.
   *
   * scrollsToTop off: UIKit honours a status-bar tap only when exactly one
   * scroll view on screen opts in, and every ScrollView opts in by default.
   * With this row in too, the tap reached neither, and the feed never went
   * back to the top.
   */
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={itemKey}
      renderItem={renderItem}
      initialNumToRender={7}
      windowSize={3}
      scrollsToTop={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.rail, { paddingHorizontal: end }]}
    />
  );
}

/* ==================================================================== */
/* Circles                                                              */
/* ==================================================================== */

/**
 * One story: its slot, the ring box (the ring when unseen, and the 52pt
 * disc that holds the picture on the wash, so the moment before it
 * decodes is the same grey as a print's) and the name under it.
 *
 * It gives under the finger (PressableScale) and starts its press only
 * after 120 ms, so a flick along the row scrolls instead of opening. The
 * tick plays on release.
 */
function Story({
  width,
  unseen,
  label,
  lines = 1,
  ink,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  children,
}: {
  width: number;
  unseen: boolean;
  label: string;
  /** 1 for a username (ellipsis allowed); 2 for words that must not be cut. */
  lines?: 1 | 2;
  ink: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <PressableScale
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      noHaptic
      unstable_pressDelay={120}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.item, { width }]}>
      <View style={styles.ringBox}>
        {unseen ? <View pointerEvents="none" style={styles.ring} /> : null}
        <View style={styles.disc}>{children}</View>
      </View>
      <Text numberOfLines={lines} maxFontSizeMultiplier={LABEL_CAP} style={[styles.label, { color: ink }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * The newest photo in the disc. While the URL is on its way the disc holds
 * its place on the wash; a photo that will not sign (null) falls back to
 * the drink's own print, never to a blank.
 */
function PourFace({ pour, drink }: { pour: Pour; drink?: Drink }) {
  // The pour as the retry key: a refetch hands over a new object, so a
  // photo that failed to sign gets another try on pull-to-refresh.
  const url = useSignedPhoto(pour.path, pour);
  if (url) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        // One key per decode size: SDWebImage 5.21.6 can hand another size's
        // thumbnail to a frame sharing the plain path key (see Avatar in ui.tsx).
        source={{ uri: url, cacheKey: `${pour.path}#${DISC}x${DISC}` }}
        cachePolicy="memory-disk"
        /*
         * Decoded at the disc's 52pt, not the 2048px upload, so the circles
         * the row keeps mounted hold a few hundred KB between them.
         * PostGridTile (profile/PostGrid) has the whole reason.
         */
        enforceEarlyResizing
        contentFit="cover"
        transition={motion.fast}
        accessible={false}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  if (url === null && drink) {
    return <DrinkFace drink={drink} mode="photo" width={DISC} height={DISC} style={FACE_FILL} />;
  }
  return null;
}

/* ==================================================================== */

const styles = StyleSheet.create({
  rail: { paddingTop: RAIL_TOP },
  item: { alignItems: 'center' },

  /* The ring box, so the ring and the disc are placed from its edge. */
  ringBox: { width: STORY.ring, height: STORY.ring },
  ring: {
    ...StyleSheet.absoluteFill,
    // round-ok: story
    borderRadius: radius.round,
    borderWidth: STORY.ringWidth,
    borderColor: colors.text,
  },
  disc: {
    position: 'absolute',
    top: DISC_INSET,
    left: DISC_INSET,
    width: DISC,
    height: DISC,
    // round-ok: story
    borderRadius: radius.round,
    overflow: 'hidden',
    backgroundColor: colors.bgSunk,
  },
  glyph: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* 8 under the ring (layout spec 5.1), centred in the slot. */
  label: {
    ...textRole.small,
    alignSelf: 'stretch',
    marginTop: space.sm,
    textAlign: 'center',
  },
});
