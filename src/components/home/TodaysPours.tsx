import { Image } from 'expo-image';
import React, { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { groupPours, POUR_WINDOW_MS, type PourGroup } from '@/components/home/groupPours';
import { Icon } from '@/components/icons';
import { Avatar, haptic, PressableScale } from '@/components/ui';
import { colors, fonts, layout, motion, radius, type } from '@/constants/theme';
import { getDrink } from '@/data';
import { primeSignedUrls, toProfile } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useSeen } from '@/store/seen';
import type { Drink, Pour, UserProfile } from '@/types';

/* ==================================================================== */
/* Today's pours: the stories                                           */
/*                                                                      */
/* The rail under Home's top bar, inside the head band's lining (the    */
/* band itself is Home's list header). Each circle is one person's      */
/* newest post from the last 24 hours, and tapping it opens the viewer. */
/* The POST is the content, so a circle shows the photo, not the face,  */
/* with the person's name under it on one line; the drink is in the     */
/* picture and in the spoken label.                                     */
/*                                                                      */
/* CIRCLES, ON PURPOSE. This is the one place round shapes are wanted   */
/* (Jan, 6 Oct 2026): a story is a circle with a ring, which is the     */
/* structure people already read. The ring is flat, one colour, never a */
/* gradient: a gradient ring is another app's mark.                     */
/*                                                                      */
/* NEW IS SAID TWICE. An unseen story has a 2.5pt lit-wine ring         */
/* (storyRing; plain wine is 1.22:1 on the lining) and a bone label; a  */
/* seen one a 1pt faint ring and a muted label. The ring's weight is    */
/* the cue that does not depend on colour, and VoiceOver says ", new".  */
/* Until the seen marks have been read from disk every story is drawn   */
/* seen, so nothing is ringed at launch and then goes dull a moment     */
/* later.                                                               */
/*                                                                      */
/* ONE LINE, ONE HEIGHT. The label is a single capped line, so the rail */
/* is 112pt at the default size and never grows when a later circle     */
/* mounts.                                                              */
/*                                                                      */
/* NO PLACEHOLDERS. Before the first answer, or after a failed one, the */
/* rail is your own circle alone: no skeleton circles and no message,   */
/* because the feed below already says whether the connection is there. */
/* ==================================================================== */

const STORY = layout.story;
/** The photo's disc inside the ring box: the box less the ring and its gap on each side (57). */
const DISC = STORY.ring - 2 * (STORY.ringWidth + STORY.gap);
/** Where the disc sits in the ring box, whatever the ring's weight (seen rings are thinner). */
const DISC_INSET = (STORY.ring - DISC) / 2;
/** The ring box, centred in the label's column. */
const RING_INSET = (STORY.label - STORY.ring) / 2;
/** The + badge's corner: 1pt past the ring box's right and bottom edges. */
const BADGE_OUT = 1;
/** Dynamic Type cap for the label: it sits under a fixed-size circle. */
const LABEL_CAP = 1.3;
/** The longest single wait for the next story to expire; re-armed after. */
const MAX_TIMER_MS = 60 * 60 * 1000;

export interface TodaysPoursProps {
  myId: string;
  pours: Pour[];
  status: 'idle' | 'ready' | 'error';
  profiles: Record<string, UserProfile>;
  seenHydrated: boolean;
  /** Opens the camera sheet: your circle's + badge, and your circle when you have not posted today. */
  onPost: () => void;
  onOpen: (authorId: string) => void;
  onFindFriends: () => void;
}

/* ==================================================================== */
/* The rail                                                             */
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

/** One circle of the rail. */
type Item =
  /** You posted today: your newest photo, which opens your posts. */
  | { kind: 'mine'; group: PourGroup }
  /** You have not posted today: your avatar, which opens the camera sheet. */
  | { kind: 'you' }
  | { kind: 'friend'; group: PourGroup; unseen: boolean }
  | { kind: 'find' };

function itemKey(item: Item): string {
  return item.kind === 'friend' ? `p:${item.group.authorId}` : item.kind;
}

const newest = (g: PourGroup) => g.pours[g.pours.length - 1]!;

/** "1 post today" / "3 posts today": what the rail says aloud, never a count of drinks. */
const postsToday = (n: number) => `${n} ${n === 1 ? 'post' : 'posts'} today`;

/** The rail's circles scroll sideways with 10pt between their columns. */
function StoryGap() {
  return <View style={styles.storyGap} />;
}

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
  const seen = useSeen((s) => s.pours[myId]);
  const ownRow = useAuth((s) => s.profile);
  const now = useExpiryClock(pours);
  const { mine, others } = groupPours(pours, myId, seen, now);
  const ready = status === 'ready';
  const shown = ready ? others : [];

  // Your own row first (the social store may not hold your profile), for your avatar.
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
            label="You"
            ink={colors.onLining}
            accessibilityLabel={`Your posts today, ${n}${drink ? `, latest ${drink.name}` : ''}`}
            accessibilityHint="Opens your posts from today"
            onPress={() => onOpen(myId)}
            badge={
              <Pressable
                onPress={onPost}
                // 22 + 2 x 11: the 44pt touch floor, centred on the badge.
                hitSlop={(layout.hit - STORY.badge) / 2}
                accessibilityRole="button"
                accessibilityLabel="Post a drink"
                style={({ pressed }) => [styles.badge, styles.badgeButton, pressed && styles.badgePressed]}>
                <Icon name="plus" size={14} color={colors.wine} />
              </Pressable>
            }>
            <PourFace pour={pour} drink={drink} />
          </Story>
        );
      }
      case 'you':
        return (
          <Story
            ring="none"
            label="You"
            ink={colors.onLining}
            accessibilityLabel="Post a drink"
            onPress={onPost}
            decorativeBadge>
            <Avatar
              name={me?.displayName ?? 'You'}
              accent={me?.accent ?? colors.wineSoft}
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
            ink={item.unseen ? colors.onLining : colors.onLiningMuted}
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
            ring="seen"
            label="Find friends"
            ink={colors.onLining}
            accessibilityLabel="Find friends"
            onPress={onFindFriends}>
            <View style={styles.glyph}>
              <Icon name="users" size={24} color={colors.onLining} />
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
      ItemSeparatorComponent={StoryGap}
      initialNumToRender={6}
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

/** 'unseen': 2.5pt lit wine. 'seen': 1pt faint (also your own, and Find friends). 'none': your bare avatar. */
type Ring = 'unseen' | 'seen' | 'none';

/**
 * One story: the ring box (the ring, and the 57pt disc that holds the
 * picture on the cellar ground, a lit photo's own edge colour, so the
 * moment before it decodes matches) and the label under it.
 *
 * It gives under the finger (PressableScale) and starts its press only
 * after 120 ms, so a flick along the rail scrolls instead of opening. The
 * tick plays on release.
 *
 * `badge` is a control of its own (your + when you have posted today),
 * laid over the ring box's corner after the story's button so it takes
 * its own taps and is read after it. `decorativeBadge` draws the same +
 * as part of the picture, for the story that is itself "Post a drink".
 */
function Story({
  ring,
  label,
  ink,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  badge,
  decorativeBadge,
  children,
}: {
  ring: Ring;
  label: string;
  ink: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  badge?: ReactNode;
  decorativeBadge?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.item}>
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
        <View style={styles.ringBox}>
          {ring === 'none' ? null : (
            <View pointerEvents="none" style={ring === 'unseen' ? styles.ringUnseen : styles.ringSeen} />
          )}
          <View style={styles.disc}>{children}</View>
          {decorativeBadge ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.badge, styles.badgeInBox]}>
              <Icon name="plus" size={14} color={colors.wine} />
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={LABEL_CAP} style={[styles.label, { color: ink }]}>
          {label}
        </Text>
      </PressableScale>
      {badge}
    </View>
  );
}

/**
 * The newest photo in the disc. While the URL is on its way the disc holds
 * its place on the cellar ground; a photo that will not sign (null) falls
 * back to the drink's lit face, never to a blank.
 */
function PourFace({ pour, drink }: { pour: Pour; drink?: Drink }) {
  // The pour as the retry key: a refetch hands over a new object, so a
  // photo that failed to sign gets another try on pull-to-refresh.
  const url = useSignedPhoto(pour.path, pour);
  if (url) {
    return (
      <Image
        source={{ uri: url, cacheKey: pour.path }}
        cachePolicy="memory-disk"
        /*
         * Decoded at the disc's 57pt, not the 2048px upload, so the circles
         * the rail keeps mounted hold a few hundred KB between them.
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
    return <DrinkFace drink={drink} mode="lit" width={DISC} height={DISC} style={FACE_FILL} />;
  }
  return null;
}

/* ==================================================================== */

/** The ring fills its box; its stroke is drawn inward from the box's edge. */
const RING_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  /*
   * 10 above, 12 below, 12 at each end: the first ring sits 4pt inside its
   * 76pt column, so it lands on the 16pt gutter. 10 + 68 + 6 + 16 + 12 is
   * the rail's 112pt at the default text size.
   */
  rail: {
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  storyGap: { width: 10 },
  item: { width: STORY.label },

  /* The ring box, so the ring, the disc and the badge are placed from its edge. */
  ringBox: { width: STORY.ring, height: STORY.ring, marginLeft: RING_INSET },
  ringUnseen: {
    ...RING_FILL,
    // round-ok: story
    borderRadius: radius.round,
    borderWidth: STORY.ringWidth,
    borderColor: colors.storyRing,
  },
  ringSeen: {
    ...RING_FILL,
    // round-ok: story
    borderRadius: radius.round,
    borderWidth: STORY.ringWidthSeen,
    borderColor: colors.storyRingSeen,
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
    backgroundColor: colors.liningDeep,
  },
  glyph: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  label: {
    ...type.micro,
    fontFamily: fonts.bodyMedium,
    marginTop: 6,
    textAlign: 'center',
  },

  /* The + badge: 22pt overall, its 2pt lining ring drawn as the border, 1pt past the box's corner. */
  badge: {
    width: STORY.badge,
    height: STORY.badge,
    // round-ok: story
    borderRadius: radius.round,
    borderWidth: STORY.badgeRing,
    borderColor: colors.lining,
    backgroundColor: colors.onLining,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInBox: { position: 'absolute', right: -BADGE_OUT, bottom: -BADGE_OUT },
  /* The same corner, placed from the item: the ring box starts RING_INSET in and at the item's top. */
  badgeButton: {
    position: 'absolute',
    left: RING_INSET + STORY.ring + BADGE_OUT - STORY.badge,
    top: STORY.ring + BADGE_OUT - STORY.badge,
  },
  badgePressed: { backgroundColor: colors.onLiningMuted },
});
