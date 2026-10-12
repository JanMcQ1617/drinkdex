import { Image } from 'expo-image';
import React, { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { groupPours, POUR_WINDOW_MS, type PourGroup } from '@/components/home/groupPours';
import { Icon } from '@/components/icons';
import { Avatar, haptic, PressableScale } from '@/components/ui';
import { colors, layout, motion, radius, space, textRole } from '@/constants/theme';
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
/* INSTAGRAM'S TRAY (v4.1, home-ig 2.3). Fixed 80pt slots, the first    */
/* 66pt ring box 12 in, so at 440 the sixth ring is cut by the screen's */
/* edge: the cut is what says the row scrolls.                          */
/*                                                                      */
/* NEW IS THE RING'S WEIGHT. An unseen story has a 2pt ink ring and an  */
/* ink name; a seen one a 1pt `rule` ring and a muted name, so the row  */
/* quiets down as you watch it. The weight and the name's tone are the  */
/* cue (the grey ring is decorative), and VoiceOver says ", new". Until */
/* the seen marks have been read from disk every story is drawn seen,   */
/* so nothing is ringed in ink at launch and then goes quiet.           */
/*                                                                      */
/* YOU, FIRST: "Your story". With no story today it is your face with   */
/* the + badge, and opens the + window; with one it is your newest      */
/* photo in the 1pt ring, no badge, and plays it, and the viewer has    */
/* the way to add more.                                                 */
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
/** The photo's disc inside the ring box: the box less the ring and its gap on each side (56). */
const DISC = STORY.ring - 2 * (STORY.ringWidth + STORY.gap);
/** Where the disc sits in the ring box (5). */
const DISC_INSET = (STORY.ring - DISC) / 2;
/**
 * The rail's ends: the first ring box at x 12, the slot's slack (7 each
 * side) taken off, so 5. The header's story ring on each post sits at 12
 * too, round the 32pt face at the 16pt column.
 */
const RING_LEFT = 12;
const RAIL_END = RING_LEFT - (STORY.slot - STORY.ring) / 2;
/**
 * The rings start 8 under the bar's foot (y 115 at 440 x 956; Home's
 * spacer is HOME_BAR_HEIGHT, which counts the foot), and the tray ends 8
 * under the names (211). Half of each is inside the slot, so every story
 * is an 80 x 96 target (home-ig 3).
 */
const RAIL_PAD = space.sm / 2;
const SLOT_PAD = space.sm - RAIL_PAD;
/** The name, 4 under the ring box. */
const LABEL_GAP = space.xs;
/** Dynamic Type cap for the name: it sits under a fixed-size circle. */
const LABEL_CAP = 1.3;
/**
 * The + badge on "Your story" (no post today): a 22pt ink disc in a 3pt
 * page ring, 28 outer, its corner on the ring box's corner (38, 38). The
 * plus is 14pt at a 2.4 stroke, heavier than the set's, so it holds at
 * that size on ink.
 */
const BADGE_RING = 3;
const BADGE = 22 + 2 * BADGE_RING;
const BADGE_AT = STORY.ring - BADGE;
const BADGE_PLUS = 14;
const BADGE_STROKE = 2.4;
/** The longest single wait for the next story to expire; re-armed after. */
const MAX_TIMER_MS = 60 * 60 * 1000;

export interface TodaysPoursProps {
  myId: string;
  pours: Pour[];
  /**
   * The time the row is drawn against, from useExpiryClock(pours). Home
   * holds the clock, so the rings on its post headers expire with the
   * circles here, at the same moment.
   */
  now: number;
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
 *
 * Held by Home (v4.1), which passes it to the row and reads the same
 * groups for its post headers' rings.
 */
export function useExpiryClock(pours: Pour[]): number {
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
  now,
  status,
  profiles,
  seenHydrated,
  onPost,
  onOpen,
  onFindFriends,
}: TodaysPoursProps) {
  const seen = useSeen((s) => s.pours[myId]);
  const ownRow = useAuth((s) => s.profile);
  const { mine, others } = groupPours(pours, myId, seen, now);
  const ready = status === 'ready';
  const shown = ready ? others : [];

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
            ring="seen"
            label="Your story"
            ink={colors.textMuted}
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
            ring="none"
            badge
            label="Your story"
            ink={colors.textMuted}
            accessibilityLabel="Your story, post a drink"
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
            ring={item.unseen ? 'unseen' : 'seen'}
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
            ring="none"
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
      contentContainerStyle={styles.rail}
    />
  );
}

/* ==================================================================== */
/* Circles                                                              */
/* ==================================================================== */

/**
 * One story: its 80pt slot, the ring box (the ring, 2pt ink when unseen
 * and 1pt `rule` when seen; the 56pt disc that holds the picture on the
 * wash, so the moment before it decodes is the same grey as a print's;
 * the + badge on your own circle with no post today) and the name under
 * it.
 *
 * It gives under the finger (PressableScale) and starts its press only
 * after 120 ms, so a flick along the row scrolls instead of opening. The
 * tick plays on release.
 */
function Story({
  ring,
  badge,
  label,
  lines = 1,
  ink,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  children,
}: {
  ring: 'unseen' | 'seen' | 'none';
  /** The + badge: your own circle when you have not posted today. */
  badge?: boolean;
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
      style={styles.item}>
      <View style={styles.ringBox}>
        {ring === 'none' ? null : (
          <View pointerEvents="none" style={[styles.ring, ring === 'seen' && styles.ringSeen]} />
        )}
        <View style={styles.disc}>{children}</View>
        {badge ? (
          <View pointerEvents="none" style={styles.badge}>
            <Icon name="plus" size={BADGE_PLUS} color={colors.onInk} strokeWidth={BADGE_STROKE} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={lines} maxFontSizeMultiplier={LABEL_CAP} style={[styles.label, { color: ink }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * The newest photo in the 56pt disc. While the URL is on its way the disc holds
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
         * Decoded at the disc's 56pt, not the 2048px upload, so the circles
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
  rail: { paddingHorizontal: RAIL_END, paddingVertical: RAIL_PAD },
  item: { width: STORY.slot, alignItems: 'center', paddingVertical: SLOT_PAD },

  /* The ring box, so the ring and the disc are placed from its edge. */
  ringBox: { width: STORY.ring, height: STORY.ring },
  ring: {
    ...StyleSheet.absoluteFill,
    // round-ok: story
    borderRadius: radius.round,
    borderWidth: STORY.ringWidth,
    borderColor: colors.text,
  },
  /* Seen: the 1pt rule ring, decorative (1.74:1); the weight and the muted name carry the state. */
  ringSeen: { borderWidth: STORY.seenWidth, borderColor: colors.rule },
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
  /* Its border is the page ring: the ink fills under it, so the ink disc shows 22 across. */
  badge: {
    position: 'absolute',
    top: BADGE_AT,
    left: BADGE_AT,
    width: BADGE,
    height: BADGE,
    alignItems: 'center',
    justifyContent: 'center',
    // round-ok: badge
    borderRadius: radius.round,
    borderWidth: BADGE_RING,
    borderColor: colors.bg,
    backgroundColor: colors.text,
  },
  glyph: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* 4 under the ring box (home-ig 2.3), centred in the slot, one line. */
  label: {
    ...textRole.small,
    alignSelf: 'stretch',
    marginTop: LABEL_GAP,
    textAlign: 'center',
  },
});
