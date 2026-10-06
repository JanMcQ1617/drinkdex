import { Image } from 'expo-image';
import React, { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { groupPours, POUR_WINDOW_MS, type PourGroup } from '@/components/home/groupPours';
import { Icon, type IconName } from '@/components/icons';
import { haptic, PressableScale } from '@/components/ui';
import { colors, fonts, layout, motion, radius, stroke, textRole, type } from '@/constants/theme';
import { getDrink } from '@/data';
import { latestCatch } from '@/lib/cabinet';
import { primeSignedUrls } from '@/lib/social';
import { faceOf, fitScale, textWidth, type Face } from '@/lib/textFit';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useCollection } from '@/store/collection';
import { useSeen } from '@/store/seen';
import type { Drink, Pour, UnlockRecord, UserProfile } from '@/types';

/* ==================================================================== */
/* Today's pours                                                        */
/*                                                                      */
/* The rail under Home's top bar, inside the head band's lining (the    */
/* band itself is Home's list header). Each tile is one person's newest */
/* pour from the last 24 hours, and tapping it opens the viewer. The    */
/* POUR is the content, so a tile shows the drink, not the face: the    */
/* photo inset in a bone mat, the person's name under it, and the       */
/* drink's name under that. A gradient ring round a face is another     */
/* app's mark, and is not borrowed.                                     */
/*                                                                      */
/* NEW IS SAID TWICE. An unseen tile sits in a 2pt bone frame and its   */
/* labels are bone; a seen one has no frame, its mat dulls into the     */
/* lining (matSeen) and its labels go muted. The frame is the cue that  */
/* does not depend on colour, and VoiceOver says ", new". Until the     */
/* seen marks have been read from disk every tile is drawn seen, so     */
/* nothing is framed at launch and then goes dull a moment later.       */
/*                                                                      */
/* NAMES ARE NEVER CUT. A drink name wraps under its tile (DrinkName,   */
/* no line limit) and every tile's name slot is as tall as the tallest  */
/* one in the rail, worked out before layout, so the rail is its final  */
/* height on the first frame and does not grow when a later tile        */
/* mounts.                                                              */
/*                                                                      */
/* NO PLACEHOLDERS. Before the first answer, or after a failed one, the */
/* rail is your own tile alone: no skeleton tiles and no message,       */
/* because the feed below already says whether the connection is there. */
/* ==================================================================== */

const TILE = layout.tile;
/** The photo's window inside the mat: the mat less its inset on each side. */
const WINDOW_W = TILE.w - 2 * TILE.inset;
const WINDOW_H = TILE.h - 2 * TILE.inset;
/** The mat's corner; the window's is concentric with it. */
const MAT_RADIUS = 6;
/** An unseen tile's frame: 2pt of lining, then 2pt of bone, outside the mat. */
const RING_GAP = 2;
const RING = 2;
const RING_OUT = RING_GAP + RING;
/** The + badge on your own tile: a 24pt bone square in a 2pt lining ring. */
const BADGE = 24;
const BADGE_RING = 2;
/** How far the badge's face hangs past the mat's corner. */
const BADGE_OVERHANG = 7;
/** Dynamic Type cap for the labels under a tile (spec §6.5). */
const LABEL_CAP = 1.3;
/** The longest single wait for the next tile to expire; re-armed after. */
const MAX_TIMER_MS = 60 * 60 * 1000;

/** "Log a pour" and "Find friends" under a tile: Inter, set to the drink name's metrics so rows line up. */
const ACTION_LABEL = { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 17 } as const;

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
 * DrinkName sizes a name (`fitted`: shrunk until its widest word fits) or
 * as plain wrapped text, at this Dynamic Type size and cap. lib/textFit
 * errs wide, so this errs tall: a rail laid out with it may keep a line
 * spare, but never grows after its first frame. Shared with NotInDexYet,
 * whose prints have the same problem.
 */
export function wrappedHeight(
  text: string,
  role: { fontFamily: string; fontSize: number; lineHeight: number },
  measure: number,
  cap: number,
  fontScale: number,
  fitted = true,
): number {
  const face = faceOf(role.fontFamily);
  const grow = Math.min(fontScale, cap);
  const size = role.fontSize * grow;
  const scale = fitted ? fitScale(text, face, size, measure) : 1;
  return lineCount(text, face, size * scale, measure) * role.lineHeight * grow * scale;
}

/* ==================================================================== */
/* The rail                                                             */
/* ==================================================================== */

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

/** One cell of the rail. */
type Item =
  /** You poured today: your newest pour, which opens your pours. */
  | { kind: 'mine'; group: PourGroup }
  /** You have not poured today: your latest catch (or a bare mat), which logs one. */
  | { kind: 'you'; caught: { drink: Drink; record: UnlockRecord } | null }
  | { kind: 'friend'; group: PourGroup; unseen: boolean }
  | { kind: 'find' };

function itemKey(item: Item): string {
  return item.kind === 'friend' ? `p:${item.group.authorId}` : item.kind;
}

const newest = (g: PourGroup) => g.pours[g.pours.length - 1]!;

/** What a tile prints under its name line, for the rail's shared name slot. */
function secondLine(item: Item): { text: string; drinkName: boolean } | null {
  if (item.kind === 'mine' || item.kind === 'friend') {
    const drink = getDrink(newest(item.group).drinkId);
    return drink ? { text: drink.name, drinkName: true } : null;
  }
  if (item.kind === 'you') return { text: 'Log a pour', drinkName: false };
  return null;
}

/** The rail's items scroll sideways with 12pt between tiles. */
function TileGap() {
  return <View style={styles.tileGap} />;
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
  const unlocks = useCollection((s) => s.unlocks);
  const { fontScale } = useWindowDimensions();
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
  const newestPaths = [mine, ...shown].flatMap((g) => (g ? [newest(g).path] : []));
  const pathsKey = newestPaths.join('\n');
  useLayoutEffect(() => {
    if (pathsKey) void primeSignedUrls('pours', pathsKey.split('\n'));
  }, [pathsKey]);

  const items: Item[] = [
    mine ? { kind: 'mine', group: mine } : { kind: 'you', caught: latestCatch(unlocks) },
    ...shown.map((g): Item => ({ kind: 'friend', group: g, unseen: seenHydrated && g.unseen })),
    ...(ready && others.length === 0 ? [{ kind: 'find' } as const] : []),
  ];

  /*
   * The name slot under every tile is as tall as the tallest name in the
   * rail (see the header note): computed over all of them, not only the
   * tiles the list has mounted so far.
   */
  let nameSlot = 0;
  for (const item of items) {
    const line = secondLine(item);
    if (!line) continue;
    const h = line.drinkName
      ? wrappedHeight(line.text, textRole.tileName, TILE.label, LABEL_CAP, fontScale)
      : wrappedHeight(line.text, ACTION_LABEL, TILE.label, LABEL_CAP, fontScale, false);
    if (h > nameSlot) nameSlot = h;
  }
  nameSlot = Math.ceil(nameSlot);

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.kind) {
      case 'mine': {
        const pour = newest(item.group);
        const drink = getDrink(pour.drinkId);
        const n = item.group.pours.length;
        return (
          <PourTile
            pour={pour}
            drink={drink}
            look="own"
            top="Your pour"
            nameSlot={nameSlot}
            accessibilityLabel={`Your pours today, ${n}${drink ? `, latest ${drink.name}` : ''}`}
            onPress={() => onOpen(myId)}
            badge={
              <Pressable
                onPress={onLog}
                hitSlop={(44 - BADGE - 2 * BADGE_RING) / 2}
                accessibilityRole="button"
                accessibilityLabel="Log a pour"
                style={({ pressed }) => [styles.badge, pressed && styles.badgePressed]}>
                <Icon name="plus" size={16} color={colors.wine} />
              </Pressable>
            }
          />
        );
      }
      case 'you':
        return <YouTile caught={item.caught} nameSlot={nameSlot} onLog={onLog} />;
      case 'friend': {
        const g = item.group;
        const pour = newest(g);
        const drink = getDrink(pour.drinkId);
        const who = profiles[g.authorId];
        const n = g.pours.length;
        return (
          <PourTile
            pour={pour}
            drink={drink}
            look={item.unseen ? 'unseen' : 'seen'}
            top={who?.username ?? 'someone'}
            nameSlot={nameSlot}
            accessibilityLabel={`${who?.displayName ?? 'Someone'}, ${n} ${n === 1 ? 'pour' : 'pours'} today${
              drink ? `, latest ${drink.name}` : ''
            }${item.unseen ? ', new' : ''}`}
            accessibilityHint="Opens their pours"
            onPress={() => onOpen(g.authorId)}
          />
        );
      }
      case 'find':
        return (
          <GlyphTile icon="users" top="Find friends" second={null} nameSlot={nameSlot} onPress={onFindFriends} />
        );
    }
  };

  /*
   * A FlatList, not a ScrollView: a ScrollView mounted every tile (up to
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
      ItemSeparatorComponent={TileGap}
      initialNumToRender={6}
      windowSize={3}
      scrollsToTop={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    />
  );
}

/* ==================================================================== */
/* Tiles                                                                */
/* ==================================================================== */

type Look = 'own' | 'unseen' | 'seen';

/**
 * The mat a tile's picture sits in: bone card stock with a 1pt edge, the
 * picture inset 3pt in a concentric window on the cellar ground (a lit
 * photo's own edge colour, so the moment before it decodes matches). A
 * seen tile's mat is dulled into the lining; an unseen one is framed.
 * `badge` is drawn over the mat's corner.
 */
function Mat({ look, children, badge }: { look: Look; children?: ReactNode; badge?: ReactNode }) {
  return (
    <View style={styles.matSlot}>
      {look === 'unseen' ? <View pointerEvents="none" style={styles.ring} /> : null}
      <View style={[styles.mat, look === 'seen' && styles.matSeen]}>
        <View style={styles.window}>{children}</View>
      </View>
      {badge}
    </View>
  );
}

/**
 * The two lines under a tile: who (Inter, one line) and the drink (its
 * name through DrinkName, never cut) or an action. 84pt wide, overhanging
 * the 76pt tile by 4pt on each side. The name slot is the rail's shared
 * height (TodaysPours), so every tile's labels end on one line.
 */
function Labels({
  top,
  drink,
  action,
  ink,
  nameSlot,
}: {
  top: string;
  drink?: Drink;
  action?: string;
  ink: string;
  nameSlot: number;
}) {
  return (
    <View style={styles.labels}>
      <Text numberOfLines={1} maxFontSizeMultiplier={LABEL_CAP} style={[styles.top, { color: ink }]}>
        {top}
      </Text>
      <View style={{ minHeight: nameSlot }}>
        {drink ? (
          <DrinkName
            name={drink.name}
            role={textRole.tileName}
            measure={TILE.label}
            cap={LABEL_CAP}
            color={ink}
            align="center"
          />
        ) : action ? (
          <Text maxFontSizeMultiplier={LABEL_CAP} style={[ACTION_LABEL, styles.centred, { color: ink }]}>
            {action}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A media tile: it gives under the finger (PressableScale) and starts its
 * press only after 120 ms, so a flick along the rail scrolls instead of
 * opening. The tick plays on release.
 */
function TilePress({
  accessibilityLabel,
  accessibilityHint,
  onPress,
  children,
}: {
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
      accessibilityHint={accessibilityHint}>
      {children}
    </PressableScale>
  );
}

/**
 * The photo of a pour in its window. While the URL is on its way the
 * window holds its place on the cellar ground; a photo that will not sign
 * (null) falls back to the drink's lit face, never to a blank.
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
         * Decoded at the window's 70pt size, not the 2048px upload, so the
         * tiles the rail keeps mounted hold a few hundred KB between them.
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
    return <DrinkFace drink={drink} mode="lit" width={WINDOW_W} height={WINDOW_H} style={FACE_FILL} />;
  }
  return null;
}

/** A person's newest pour in its mat, with their name and the drink's under it. */
function PourTile({
  pour,
  drink,
  look,
  top,
  nameSlot,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  badge,
}: {
  pour: Pour;
  drink?: Drink;
  look: Look;
  top: string;
  nameSlot: number;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  badge?: ReactNode;
}) {
  return (
    <View style={styles.tile}>
      <TilePress accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} onPress={onPress}>
        <Mat look={look}>
          <PourFace pour={pour} drink={drink} />
        </Mat>
        <Labels
          top={top}
          drink={drink}
          ink={look === 'seen' ? colors.onLiningMuted : colors.onLining}
          nameSlot={nameSlot}
        />
      </TilePress>
      {/* Its own button, after the tile's, over the mat's corner. */}
      {badge ? <View style={styles.badgeSlot}>{badge}</View> : null}
    </View>
  );
}

/**
 * Your tile when you have not poured today. With a catch, its lit face
 * (your own photo of it first) and the + badge; with none yet, a bare mat
 * and a plus. Either way the whole tile is one button that logs a pour,
 * so the badge here is only a picture of the + it means.
 */
function YouTile({
  caught,
  nameSlot,
  onLog,
}: {
  caught: { drink: Drink; record: UnlockRecord } | null;
  nameSlot: number;
  onLog: () => void;
}) {
  if (!caught) {
    return <GlyphTile icon="plus" top="You" second="Log a pour" nameSlot={nameSlot} onPress={onLog} />;
  }
  return (
    <View style={styles.tile}>
      <TilePress accessibilityLabel="Log a pour" onPress={onLog}>
        <Mat
          look="own"
          badge={
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.badgeSlot, styles.badge]}>
              <Icon name="plus" size={16} color={colors.wine} />
            </View>
          }>
          <DrinkFace
            drink={caught.drink}
            mode="lit"
            photoUri={caught.record.photoUri}
            width={WINDOW_W}
            height={WINDOW_H}
            style={FACE_FILL}
          />
        </Mat>
        <Labels top="You" action="Log a pour" ink={colors.onLining} nameSlot={nameSlot} />
      </TilePress>
    </View>
  );
}

/** A bare mat with one glyph in ink: your first "Log a pour", and "Find friends". */
function GlyphTile({
  icon,
  top,
  second,
  nameSlot,
  onPress,
}: {
  icon: IconName;
  top: string;
  second: string | null;
  nameSlot: number;
  onPress: () => void;
}) {
  return (
    <View style={styles.tile}>
      <TilePress accessibilityLabel={second ?? top} onPress={onPress}>
        <View style={styles.matSlot}>
          <View style={[styles.mat, styles.matGlyph]}>
            <Icon name={icon} size={22} color={colors.text} />
          </View>
        </View>
        <Labels top={top} action={second ?? undefined} ink={colors.onLining} nameSlot={nameSlot} />
      </TilePress>
    </View>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  /* 8 above (room for an unseen tile's frame), 12 below, the 16pt gutter at each end. */
  rail: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: layout.gutter,
  },
  tileGap: { width: 12 },
  tile: { width: TILE.w },

  /* The mat's box, so the frame and the badge are placed from its outer edge. */
  matSlot: { width: TILE.w, height: TILE.h },
  mat: {
    width: TILE.w,
    height: TILE.h,
    padding: TILE.inset - stroke.edge,
    borderRadius: MAT_RADIUS,
    borderWidth: stroke.edge,
    borderColor: colors.matEdge,
    backgroundColor: colors.mat,
  },
  matSeen: { backgroundColor: colors.matSeen },
  matGlyph: { alignItems: 'center', justifyContent: 'center' },
  window: {
    flex: 1,
    borderRadius: MAT_RADIUS - TILE.inset,
    overflow: 'hidden',
    backgroundColor: colors.liningDeep,
  },
  /* Outside the mat with a 2pt lining gap; its inner corner is concentric with the mat's. */
  ring: {
    position: 'absolute',
    top: -RING_OUT,
    left: -RING_OUT,
    right: -RING_OUT,
    bottom: -RING_OUT,
    borderRadius: MAT_RADIUS + RING_OUT,
    borderWidth: RING,
    borderColor: colors.onLining,
  },

  labels: { width: TILE.label, marginLeft: (TILE.w - TILE.label) / 2, marginTop: 10, alignItems: 'center' },
  top: {
    ...type.micro,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  centred: { textAlign: 'center' },

  /* The badge's ring is its border, so its face is BADGE and hangs BADGE_OVERHANG past the corner. */
  badgeSlot: {
    position: 'absolute',
    left: TILE.w + BADGE_OVERHANG - BADGE - BADGE_RING,
    top: TILE.h + BADGE_OVERHANG - BADGE - BADGE_RING,
  },
  badge: {
    width: BADGE + 2 * BADGE_RING,
    height: BADGE + 2 * BADGE_RING,
    borderRadius: radius.badge + BADGE_RING,
    borderWidth: BADGE_RING,
    borderColor: colors.lining,
    backgroundColor: colors.onLining,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePressed: { backgroundColor: colors.onLiningMuted },
});
