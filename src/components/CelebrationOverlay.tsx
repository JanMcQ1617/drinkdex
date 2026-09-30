import { Image } from 'expo-image';
import React, { useCallback, useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { Button, RarityBadge } from '@/components/ui';
import {
  colors,
  fonts,
  motion,
  radius,
  space,
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
 * queue id, so the next one springs in fresh while this one fades out.
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
    <Animated.View
      style={[styles.card, style]}
      exiting={reduced ? undefined : FadeOut.duration(motion.exit)}
      onStartShouldSetResponder={() => true}>
      {children}
    </Animated.View>
  );
}

/*
 * The ring that sweeps out from behind the art.
 *
 * Its colour is the caller's, because two cards use it and only one has
 * earned gilt: a legendary catch rings in gilt, and a new rank rings in
 * wineSoft, the palette's stroke cut of wine. Gilt means legendary
 * everywhere else in the app, and a rank ringed in it would say a rarity
 * it does not have. Not the disc's own wine either: the same colour as
 * the fill it sweeps out from reads as the disc swelling, not a ring.
 *
 * Required, with no gilt default, so a third card cannot pick up the
 * legendary metal by leaving the prop off.
 */
function Halo({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(0.6);
  const o = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    o.set(withSequence(withTiming(0.5, { duration: 220 }), withDelay(120, withTiming(0, { duration: 520 }))));
    s.set(withTiming(1.5, { duration: 860, easing: Easing.out(Easing.quad) }));
  }, [reduced, s, o]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ scale: s.value }],
  }));

  if (reduced) return null;
  return <Animated.View pointerEvents="none" style={[styles.halo, { borderColor: color }, style]} />;
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

        <View style={styles.artWrap}>
          {legendary ? <Halo color={colors.gilt} /> : null}
          <View style={styles.art}>
            {photo ? (
              <Image source={photo} style={styles.artPhoto} contentFit="cover" />
            ) : (
              <DrinkArt drink={drink} size={104} flat />
            )}
          </View>
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

        <View style={styles.artWrap}>
          <Halo color={colors.wineSoft} />
          <View style={styles.rankDisc}>
            <Icon name="trophy" size={40} color={colors.textOnWine} />
          </View>
        </View>

        <Text style={styles.title}>{current.milestone.title}</Text>
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
      <Animated.View
        pointerEvents="none"
        entering={reduced ? undefined : FadeIn.duration(SETTLE)}
        exiting={reduced ? undefined : FadeOut.duration(220)}
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
    padding: space.xl,
    zIndex: 30,
  },
  /* Separate fill so the scrim can fade while the card springs. */
  scrimFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  body: { alignItems: 'center', padding: space.xl },

  eyebrow: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.tag,
    color: colors.textMuted,
    marginBottom: space.lg,
  },

  artWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  halo: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  art: {
    width: 116,
    height: 116,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  artPhoto: { width: '100%', height: '100%' },
  rankDisc: {
    width: 116,
    height: 116,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
    textAlign: 'center',
  },
  dex: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeRow: { marginTop: space.md },
  progress: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    marginTop: space.md,
  },
  cta: { marginTop: space.xl },
});
