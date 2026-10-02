import { Image } from 'expo-image';
import React, { useCallback, useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { Button, RarityBadge } from '@/components/ui';
import {
  colors,
  dexNumber,
  fonts,
  layout,
  motion,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { getDrink, formatCount, formatDexNumber, TOTAL } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import { useCelebrate, type Celebration } from '@/store/celebrate';
import { useCollection } from '@/store/collection';

/* ==================================================================== */
/* Celebrations                                                         */
/*                                                                      */
/* The moment after you log a pour, and the moment you change rank.     */
/*                                                                      */
/* Mounted at the root beside the intro, for the same reason the        */
/* password overlay is: an entry can be logged from a Dex card or from  */
/* the tab bar's centre action, and a celebration that lived in either  */
/* screen would either miss the other or have to be built twice.        */
/*                                                                      */
/* It reads from a QUEUE. Logging the pour that crosses a rung earns    */
/* two of these at once, and they play in order rather than racing —    */
/* the entry you just caught, then what it made you.                    */
/*                                                                      */
/* Dismissed by tapping anywhere, not only by the button. It is a       */
/* reward, not a decision, and making someone find a target to get rid  */
/* of their own good news turns it into an interruption.                */
/* ==================================================================== */

/** How long the card takes to settle. Kept under the 400ms ceiling. */
const SETTLE = 380;

/*
 * The card alone. The scrim and the dismiss layer belong to the overlay,
 * which mounts them once for the whole queue; each card is keyed on its
 * queue id, so the next one springs in fresh.
 *
 * NO EXIT ANIMATION. The card that is done goes at once. An `exiting`
 * fade has two ways never to finish on this Reanimated (4.5.x): when
 * layout animations overlap (Done tapped while the scrim is still fading
 * in), the exit's "remove" is dropped; and a frame loop that stalls after
 * a cold start never reaches the end. Either way the card, or the dimmed
 * layer behind it, stays over the app for the rest of the session with
 * nothing to tap.
 *
 * The spring itself is safe to keep: it is a transform on a card that is
 * fully opaque from its first frame, so a stalled spring leaves the card
 * a little small and low, never invisible.
 */
function Card({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.86);
  const lift = useSharedValue(reduced ? 0 : 18);

  useEffect(() => {
    if (reduced) return;
    scale.set(withSpring(1, motion.selection));
    lift.set(withSpring(0, motion.selection));
  }, [reduced, scale, lift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: lift.value }],
  }));

  /*
    Absorbs its own touches without being a button, so a tap on the card
    does not fall through to the dismiss layer below it.
  */
  return (
    <Animated.View style={[styles.card, style]} onStartShouldSetResponder={() => true}>
      {children}
    </Animated.View>
  );
}

/* -------------------------------------------------------------------- */

/*
 * Which queued card has been spoken. Module scope because there are two
 * overlays mounted while the log sheet is up, both reading the same front
 * of the queue; whichever effect runs first announces it and the other
 * sees the id and stays quiet, so VoiceOver hears each card once.
 */
let lastAnnounced = 0;

function announcement(c: Celebration, collected: number): string {
  if (c.kind === 'milestone') {
    return `New rank: ${c.milestone.title}. ${formatCount(c.collected)} of ${formatCount(TOTAL)} collected.`;
  }
  const name = getDrink(c.drinkId)?.name ?? 'New entry';
  return `${name} collected. ${formatCount(collected)} of ${formatCount(TOTAL)}.`;
}

export function CelebrationOverlay() {
  const current = useCelebrate((s) => s.queue[0]);
  const dismiss = useCelebrate((s) => s.dismiss);
  const unlocks = useCollection((s) => s.unlocks);
  const reduced = useReducedMotion();

  const onDismiss = useCallback(() => dismiss(), [dismiss]);

  /*
   * The card has to be heard, not only seen. Without this a VoiceOver
   * user logs a pour and gets the app's biggest moment in silence, with
   * focus still sitting on the button they pressed. Queued rather than
   * interrupting, so it follows the button's own feedback instead of
   * cutting it off.
   */
  useEffect(() => {
    if (!current || current.id === lastAnnounced) return;
    lastAnnounced = current.id;
    const text = announcement(current, Object.keys(unlocks).length);
    // react-native-web has no WithOptions variant; the plain call is its no-op.
    if (Platform.OS === 'web') AccessibilityInfo.announceForAccessibility(text);
    else AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  }, [current, unlocks]);

  if (!current) return null;

  let card: React.ReactNode;

  if (current.kind === 'collected') {
    const drink = getDrink(current.drinkId);
    if (!drink) return null;

    const record = unlocks[current.drinkId];
    const photo = record?.photoUri ? { uri: record.photoUri } : drinkPhoto(drink.id);
    const legendary = drink.rarity === 'legendary';
    const collected = Object.keys(unlocks).length;

    card = (
      <View style={styles.body}>
        <Text style={styles.eyebrow}>Collected</Text>

        {/*
          The pour as an inset photo: a rectangle with a drawn edge, as a
          print would sit on the card. A legendary catch says so with a
          gilt edge, the metal that means legendary everywhere else; the
          rarity tag below says it in words.
        */}
        <View style={[styles.art, legendary && styles.artLegendary]}>
          {photo ? (
            <Image source={photo} style={styles.artPhoto} contentFit="cover" />
          ) : (
            <DrinkArt drink={drink} size={104} flat />
          )}
        </View>

        <Text style={styles.title}>{drink.name}</Text>
        <Text style={styles.dex}>{formatDexNumber(drink.dexNumber)}</Text>

        <View style={styles.badgeRow}>
          <RarityBadge rarity={drink.rarity} />
        </View>

        <Text style={styles.progress}>
          {formatCount(collected)} of {formatCount(TOTAL)} collected
        </Text>

        <Button label="Done" onPress={onDismiss} block style={styles.cta} />
      </View>
    );
  } else {
    card = (
      <View style={styles.body}>
        <Text style={styles.eyebrow}>New rank</Text>

        {/* The trophy drawn bare, in wine: a glyph does not need a disc to be seen. */}
        <View style={styles.rankMark}>
          <Icon name="trophy" size={48} color={colors.wine} />
        </View>

        <Text style={[styles.title, styles.rankTitle]}>{current.milestone.title}</Text>
        <Text style={styles.progress}>
          {formatCount(current.collected)} of {formatCount(TOTAL)} collected
        </Text>

        <Button label="Done" onPress={onDismiss} block style={styles.cta} />
      </View>
    );
  }

  /*
    Modal for VoiceOver: everything behind the scrim — the Stack at the
    root, the list and save bar in the log sheet — drops out of the
    swipe order while a card is up, and the two-finger escape dismisses
    it the way a tap does.
  */
  return (
    <View
      style={styles.scrim}
      pointerEvents="box-none"
      accessibilityViewIsModal
      onAccessibilityEscape={onDismiss}>
      {/*
        Fades in, and leaves at once with the overlay: an exit fade is the
        dead dimmed layer described on Card. The fade-in is decoration
        over a card that is already visible, so one that stalls leaves only
        a lighter scrim.
      */}
      <Animated.View
        pointerEvents="none"
        entering={reduced ? undefined : FadeIn.duration(SETTLE)}
        style={styles.scrimFill}
      />

      {/*
        The dismiss target is a SIBLING under the card, not a wrapper round
        it. Wrapping made the card's own buttons descendants of a button —
        invalid on web ("<button> cannot contain a nested <button>") and a
        nested touchable on native. Underneath, it still catches every tap
        that lands outside the card.

        Hidden from screen readers. As a screen-sized "Dismiss" button it
        was the first thing VoiceOver reached, ahead of the card it
        dismisses; Done and the escape gesture already do its job.
      */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessible={false}
        importantForAccessibility="no"
      />

      <Card key={current.id}>{card}</Card>
    </View>
  );
}

/* -------------------------------------------------------------------- */

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.gutter,
    zIndex: 30,
  },
  /* Separate fill so the scrim can fade in while the card springs. */
  scrimFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  /* A dialog: a panel with one drawn edge and no shadow. */
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  body: { alignItems: 'center', padding: space.xl },

  /* Sentence case and untracked, in wine: the one word that names the moment. */
  eyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.wine,
    marginBottom: space.lg,
  },

  art: {
    width: 120,
    height: 120,
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSunk,
    marginBottom: space.lg,
  },
  artLegendary: { borderWidth: 2.5, borderColor: colors.gilt },
  artPhoto: { width: '100%', height: '100%' },
  rankMark: { marginBottom: space.lg },

  /* The drink's name, in the display face: the drink is the subject here. */
  title: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
    textAlign: 'center',
  },
  /*
   * A rank is a reading of the collection, not a drink, so it is Inter, as
   * Stats sets it. Same size as a drink's name, so the two cards of one
   * log hold the same shape.
   */
  rankTitle: { fontFamily: fonts.bodySemiBold },
  /* The catalogue number's one stamp, as on the entry's Dex card. taupeInk on white is 5.89:1. */
  dex: { ...dexNumber, marginTop: space.xs },
  badgeRow: { marginTop: space.md },
  progress: {
    ...textRole.helper,
    ...tabular,
    color: colors.textMuted,
    marginTop: space.md,
  },
  cta: { marginTop: space.xl },
});
