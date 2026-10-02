import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
import { AuthGate } from '@/components/AuthGate';
import { firstUnseenIndex, groupPours, type PourGroup } from '@/components/home/groupPours';
import { timeAgo, timeAgoSpoken } from '@/components/PostCard';
import { announce, Avatar, EmptyState, MediaIconButton } from '@/components/ui';
import { colors, dexNumber, fonts, layout, space, stroke } from '@/constants/theme';
import { formatDexNumber, getDrink } from '@/data';
import { primeSignedUrls, toProfile } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useSeen } from '@/store/seen';
import { useSocial } from '@/store/social';
import type { Drink, Pour, UserProfile } from '@/types';

/* ==================================================================== */
/* Today's pours, one at a time                                         */
/*                                                                      */
/* Opened from a tile in Home's row: a modal sheet (root _layout), so   */
/* the native swipe down closes it and VoiceOver's escape gesture does  */
/* too. A pour is a photograph to look at, not a five-second clip, so   */
/* nothing here moves on by itself: a tap on the right goes forward, a  */
/* tap on the left goes back, and each step is an instant cut.          */
/*                                                                      */
/* SEEN STAYS ON THE PHONE. Each pour shown is marked in the seen store */
/* (store/seen.ts), which only frames tiles on this device; nobody is   */
/* told you looked.                                                     */
/*                                                                      */
/* THE ORDER IS FIXED ON OPEN. The people, and where each one starts,   */
/* are taken once from the row as it stood when the tile was tapped.    */
/* Marking pours seen while you watch reorders the row (seen people go  */
/* last), and a sequence that re-sorted under you would skip someone.   */
/* ==================================================================== */

export default function PoursScreen() {
  const params = useLocalSearchParams<{ authorId: string }>();
  // Account ids are lowercase everywhere they are stored, and a link may not be.
  const authorId = String(params.authorId ?? '').toLowerCase();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /*
   * Closing is the stack's back. Opened with nothing under it there is no
   * back, so it goes to the Dex, which works signed in or out.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <PoursViewer key={`${myId}:${authorId}`} myId={myId} authorId={authorId} onClose={leave} />;
}

/** The people to step through, and the pour each one starts at. */
interface Sequence {
  groups: PourGroup[];
  starts: number[];
}

function PoursViewer({
  myId,
  authorId,
  onClose,
}: {
  myId: string;
  authorId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pours = useSocial((s) => s.pours);
  const profiles = useSocial((s) => s.profiles);
  const ownRow = useAuth((s) => s.profile);
  const seen = useSeen((s) => s.pours[myId]);
  const markPourSeen = useSeen((s) => s.markPourSeen);

  /*
   * Your own tile opens your pours alone. Anyone else's opens the row from
   * that person on, as it was ordered when tapped, and each person starts
   * at their first pour you have not seen (oldest first), or at their
   * first pour if you have seen them all.
   */
  const [seq] = useState<Sequence>(() => {
    const { mine, others } = groupPours(pours, myId, seen);
    let groups: PourGroup[];
    if (authorId === myId) {
      groups = mine ? [mine] : [];
    } else {
      const at = others.findIndex((g) => g.authorId === authorId);
      groups = at < 0 ? [] : others.slice(at);
    }
    const starts = groups.map((g) =>
      g.authorId === myId ? 0 : firstUnseenIndex(g, seen?.[g.authorId]),
    );
    return { groups, starts };
  });
  const [pos, setPos] = useState({ person: 0, pour: seq.starts[0] ?? 0 });

  /*
   * Every photo in the sequence signed in one request, so each step paints
   * at once. A layout effect so it goes out before the first photo's own
   * signing (a passive effect, and children's run first), which then
   * shares it rather than asking alone.
   */
  useLayoutEffect(() => {
    void primeSignedUrls(
      'pours',
      seq.groups.flatMap((g) => g.pours.map((p) => p.path)),
    );
  }, [seq]);

  const group = seq.groups[pos.person];
  const pour = group?.pours[pos.pour];
  const drink = pour ? getDrink(pour.drinkId) : undefined;
  const who: UserProfile | undefined = group
    ? group.authorId === myId && ownRow?.id === myId
      ? toProfile(ownRow)
      : profiles[group.authorId]
    : undefined;
  const name = who?.displayName ?? 'Someone';
  const spoken =
    group && pour
      ? `Photo of ${drink?.name ?? 'a drink'}, ${pos.pour + 1} of ${group.pours.length}, by ${name}`
      : '';

  /*
   * Each pour shown is marked seen (the store keeps the later mark, so
   * stepping back to an older one changes nothing) and said aloud, because
   * a cut from one photo to the next makes no sound of its own.
   */
  useEffect(() => {
    if (!group || !pour) return;
    markPourSeen(myId, group.authorId, pour.at);
    announce(spoken);
  }, [group, pour, myId, markPourSeen, spoken]);

  /*
   * One way out, taken once. The sheet stays mounted while it slides away,
   * so a second tap in that moment (on the last pour, Close, or a footer
   * link) would run the close again against the screen underneath: a back
   * from Home, or with nothing to go back to, a jump to the Dex.
   */
  const closed = useRef(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  const next = () => {
    if (!group) return;
    if (pos.pour + 1 < group.pours.length) {
      setPos({ person: pos.person, pour: pos.pour + 1 });
    } else if (pos.person + 1 < seq.groups.length) {
      setPos({ person: pos.person + 1, pour: seq.starts[pos.person + 1] ?? 0 });
    } else {
      close();
    }
  };

  const previous = () => {
    if (!group) return;
    if (pos.pour > 0) {
      setPos({ person: pos.person, pour: pos.pour - 1 });
    } else if (pos.person > 0) {
      const before = seq.groups[pos.person - 1]!;
      setPos({ person: pos.person - 1, pour: before.pours.length - 1 });
    }
    // At the very first pour there is nothing before it.
  };

  // Close the sheet first, then push, so the drink or post opens over the
  // tabs as a normal push (with Back to Home) rather than on top of a sheet
  // that is on its way out.
  const openDrink = (id: string) => {
    if (closed.current) return;
    close();
    router.push({ pathname: '/drink/[id]', params: { id } });
  };
  const openPost = (id: string) => {
    if (closed.current) return;
    close();
    router.push({ pathname: '/post/[id]', params: { id } });
  };

  const top = Platform.OS === 'ios' ? space.sm : insets.top + space.sm;

  if (!group || !pour) {
    return (
      <View style={[styles.screen, styles.emptyScreen, { paddingTop: top }]}>
        <StatusBar style="light" />
        <EmptyState
          tone="dark"
          icon="camera"
          title="Nothing new right now"
          body="Pours stay here for a day after they are shared."
          secondaryAction={{ label: 'Close', onPress: close }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: top }]}>
      <StatusBar style="light" />

      {/* One bar per pour from this person: the ones shown so far are bone. */}
      <View
        style={styles.progress}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {group.pours.map((p, i) => (
          <View
            key={p.path}
            style={[styles.bar, { backgroundColor: i <= pos.pour ? colors.reelInk : colors.reelTrack }]}
          />
        ))}
      </View>

      <View style={styles.header}>
        <Avatar
          name={name}
          accent={who?.accent ?? colors.wineSoft}
          size={32}
          avatarPath={who?.avatarPath}
        />
        <Text style={styles.username} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {who?.username ?? 'someone'}
        </Text>
        <Text
          style={styles.when}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={timeAgoSpoken(pour.at)}>
          {timeAgo(pour.at)}
        </Text>
        <View style={styles.spacer} />
        <MediaIconButton icon="close" label="Close" onPress={close} />
      </View>

      <View style={styles.stage}>
        <PourPhoto key={pour.path} pour={pour} drink={drink} label={spoken} />
        {/* Tap zones over the photo: a third to go back, the rest to go on. */}
        <View style={styles.zones}>
          <Pressable
            onPress={previous}
            accessibilityRole="button"
            accessibilityLabel="Previous pour"
            style={styles.zonePrevious}
          />
          <Pressable
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel="Next pour"
            style={styles.zoneNext}
          />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {drink ? (
          <Pressable
            onPress={() => openDrink(drink.id)}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${drink.name}, number ${drink.dexNumber}. Opens it in the Dex`}
            style={({ pressed }) => [styles.drinkLink, pressed && styles.pressed]}>
            <Text style={styles.drinkName} numberOfLines={2} maxFontSizeMultiplier={1.4}>
              {drink.name}
            </Text>
            <Text style={[dexNumber, styles.drinkNumber]}>{formatDexNumber(drink.dexNumber)}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => openPost(pour.postId)}
          hitSlop={{ top: 13, bottom: 13, right: 24 }}
          accessibilityRole="button"
          accessibilityLabel="View post"
          style={({ pressed }) => [styles.postLink, pressed && styles.pressed]}>
          <Text style={styles.postLinkLabel} maxFontSizeMultiplier={1.4}>
            View post
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The photo, whole (contain, not cover: this is the one place a pour is
 * shown uncropped). Keyed by path by its parent, so a step never shows
 * the previous pour under the new name while the next one loads.
 */
function PourPhoto({ pour, drink, label }: { pour: Pour; drink: Drink | undefined; label: string }) {
  // The pour as the retry key, as on the tiles.
  const url = useSignedPhoto(pour.path, pour);
  return (
    <View style={styles.photo} accessible accessibilityRole="image" accessibilityLabel={label}>
      {url ? (
        <Image
          source={{ uri: url, cacheKey: pour.path }}
          cachePolicy="memory-disk"
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
      ) : url === null && drink ? (
        <DrinkArt drink={drink} size={160} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.reelGround },
  emptyScreen: { justifyContent: 'center' },

  progress: {
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: layout.gutter,
  },
  bar: { flex: 1, height: stroke.indicator },

  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
  },
  username: {
    flexShrink: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.reelInk,
  },
  when: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.reelInkMuted,
  },
  spacer: { flex: 1 },

  stage: { flex: 1 },
  photo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zones: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row' },
  zonePrevious: { width: '33%' },
  zoneNext: { flex: 1 },

  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.sm,
  },
  drinkLink: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, alignSelf: 'flex-start' },
  drinkName: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: colors.reelInk,
  },
  drinkNumber: { color: colors.reelInkMuted },
  postLink: { alignSelf: 'flex-start' },
  postLinkLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.reelInkMuted,
  },
  pressed: { opacity: 0.5 },
});
