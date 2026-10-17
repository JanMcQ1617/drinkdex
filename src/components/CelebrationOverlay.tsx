import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace } from '@/components/DexCard';
import { Icon } from '@/components/icons';
import { NumberPlate } from '@/components/plate';
import { Button } from '@/components/ui';
import { colors, layout, radius, space, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink, TOTAL } from '@/data';
import { photoFor } from '@/data/drinkPhotos';
import { catalogueCount } from '@/lib/cabinet';
import { useCelebrate, type Celebration } from '@/store/celebrate';
import { useCollection } from '@/store/collection';
import type { Drink, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Celebrations                                                         */
/*                                                                      */
/* The moment a drink joins your Dex (the catch), and the moment the    */
/* Dex reaches a new title (lib/milestones). Neither is worded as a     */
/* rank, a score or a prize: the title card says what the Dex now       */
/* holds, and its mark is the Dex glyph, not a trophy (App Review       */
/* 1.4.3).                                                              */
/*                                                                      */
/* THE CATCH (white spec 5.21, Daylight's one signature moment). The    */
/* card opens on the drink's grey proof, the picture the Dex showed     */
/* while it was not yet yours, and the colour print comes into it: a    */
/* native crossfade, expo-image's own `transition` from the proof       */
/* source to the photo source (DrinkFace), on no JS clock and no        */
/* Reanimated. The Nº plate fills with the accent (Campari, v4.4) at    */
/* the same moment, a state change and not an animation. Under Reduce   */
/* Motion the card opens on the colour print, filled plate and all: no  */
/* cut from grey to colour.                                             */
/*                                                                      */
/* Mounted at the root beside the intro, for the same reason the        */
/* password overlay is: a drink can join your Dex from its own page or  */
/* from the + window, and a celebration that lived in either screen     */
/* would miss the other or have to be built twice.                      */
/*                                                                      */
/* It reads from a QUEUE. Catching the drink that crosses a rung earns  */
/* two of these at once, and they play in order rather than racing.    */
/*                                                                      */
/* Dismissed by tapping anywhere, not only by the key. It is a reward,  */
/* not a decision.                                                      */
/* ==================================================================== */

/** How long the scrim takes to fade in. Kept under the 400ms ceiling. */
const SETTLE = 380;
/** How long the proof holds before the colour comes: long enough to see it is the Dex's grey. */
const PROOF_HOLD_MS = 500;
/** The native crossfade from the proof to the colour print. */
const CROSSFADE_MS = 600;

/** The card's widest, and its body's padding: the name's measure comes from both. */
const CARD_MAX = 340;
const BODY_PAD = space.xl;
/** The print on the card, square, as the Dex holds it. */
const PRINT_MAX = 220;
const CAP = 1.3;

/*
 * The card alone. The scrim and the dismiss layer belong to the overlay,
 * which mounts them once for the whole queue; each card is keyed on its
 * queue id, so the next one is drawn fresh (and its proof shown again).
 *
 * AT REST FROM ITS FIRST FRAME, AND NO EXIT ANIMATION. An `exiting` fade
 * has two ways never to finish on this Reanimated (4.5.x): overlapping
 * layout animations drop its "remove", and a frame loop that stalls after
 * a cold start never reaches the end. Either way the card, or the dimmed
 * layer behind it, would stay over the app with nothing to tap.
 */
function CelebrationCard({ children }: { children: React.ReactNode }) {
  // Absorbs its own touches without being a button, so a tap on the card does not fall through to the dismiss layer.
  return (
    <View style={styles.card} onStartShouldSetResponder={() => true}>
      {children}
    </View>
  );
}

/**
 * The catch: the proof, then the colour print, the name in nameLg, the
 * plate filling, the count. The colour print is the catalogue's when it
 * has one (the same frame the proof is, so it reads as the picture taking
 * its colour), else your pour, else the no-photo face.
 */
function CatchBody({
  drink,
  record,
  collected,
  measure,
  reduced,
  onDone,
}: {
  drink: Drink;
  record: UnlockRecord | undefined;
  collected: number;
  measure: number;
  reduced: boolean;
  onDone: () => void;
}) {
  const [caught, setCaught] = useState(reduced);
  // A JS timer flips a state; the crossfade itself is native. Nothing waits on it to be readable.
  useEffect(() => {
    if (caught) return;
    const t = setTimeout(() => setCaught(true), PROOF_HOLD_MS);
    return () => clearTimeout(t);
  }, [caught]);

  const side = Math.round(Math.min(PRINT_MAX, measure));
  const stock = photoFor(drink.id) !== undefined;

  return (
    <View style={styles.body}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Print width={side} height={side}>
          <DrinkFace
            drink={drink}
            mode={caught ? 'photo' : 'proof'}
            photoUri={stock ? null : record?.photoUri}
            width={side}
            height={side}
            // The proof is there at once; only the change to colour fades, so it reads as the picture taking its colour.
            transition={caught && !reduced ? CROSSFADE_MS : 0}
          />
        </Print>
      </View>

      {/* Never truncated: a long name wraps, and the card grows with it. */}
      <DrinkName
        name={drink.name}
        role={textRole.nameLg}
        measure={measure}
        cap={CAP}
        color={colors.text}
        align="center"
        accessibilityRole="header"
        style={styles.name}
      />

      {/* Empty while it shows the proof, the accent once the colour has come: the plate the drink page will show. */}
      <View style={styles.plate}>
        <NumberPlate n={drink.dexNumber} tone={caught ? 'caught' : 'notYet'} size="lg" />
      </View>

      <Text style={[textRole.small, styles.muted, styles.progress, tabular]}>
        {formatCount(collected)} of {formatCount(TOTAL)} in your Dex
      </Text>

      <Button label="Done" onPress={onDone} block style={styles.cta} />
    </View>
  );
}

/* -------------------------------------------------------------------- */

/*
 * Which queued card has been spoken. Module scope because there are two
 * overlays mounted while the + window is up, both reading the same front
 * of the queue; whichever effect runs first announces it and the other
 * sees the id and stays quiet, so VoiceOver hears each card once.
 */
let lastAnnounced = 0;

function announcement(c: Celebration, collected: number): string {
  if (c.kind === 'milestone') {
    return `${c.milestone.title}. Your Dex now holds ${formatCount(c.collected)} of ${formatCount(TOTAL)} entries.`;
  }
  const name = getDrink(c.drinkId)?.name ?? 'New drink';
  return `${name} logged. ${formatCount(collected)} of ${formatCount(TOTAL)} in your Dex.`;
}

export function CelebrationOverlay() {
  const current = useCelebrate((s) => s.queue[0]);
  const dismiss = useCelebrate((s) => s.dismiss);
  const unlocks = useCollection((s) => s.unlocks);
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const measure = Math.min(CARD_MAX, width - 2 * layout.gutter) - 2 * BODY_PAD;
  // Catalogue drinks only (catalogueCount), as the Dex counts them, so the card and the Dex say the same number.
  const collected = catalogueCount(unlocks);

  const onDismiss = useCallback(() => dismiss(), [dismiss]);

  /*
   * The card has to be heard, not only seen. Without this a VoiceOver
   * user catches a drink and gets the app's biggest moment in silence.
   * Queued rather than interrupting, so it follows the key's own feedback.
   */
  useEffect(() => {
    if (!current || current.id === lastAnnounced) return;
    lastAnnounced = current.id;
    const text = announcement(current, collected);
    // react-native-web has no WithOptions variant; the plain call is its no-op.
    if (Platform.OS === 'web') AccessibilityInfo.announceForAccessibility(text);
    else AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  }, [current, collected]);

  if (!current) return null;

  let card: React.ReactNode;

  if (current.kind === 'collected') {
    const drink = getDrink(current.drinkId);
    if (!drink) return null;
    const record = Object.prototype.hasOwnProperty.call(unlocks, current.drinkId)
      ? unlocks[current.drinkId]
      : undefined;
    card = (
      <CatchBody
        drink={drink}
        record={record}
        collected={collected}
        measure={measure}
        reduced={reduced}
        onDone={onDismiss}
      />
    );
  } else {
    card = (
      <View style={styles.body}>
        {/*
          The Dex glyph drawn bare, in ink: a glyph does not need a disc to
          be seen. No kicker over it (layout spec, no kickers): the line
          under the title says it.
        */}
        <View style={styles.rankMark}>
          <Icon name="dex" size={48} color={colors.text} />
        </View>

        {/* A title is a reading of the collection, not a drink, so it is Inter (Playfair is for drink names only). */}
        <Text style={[textRole.title, styles.ink, styles.centred]} accessibilityRole="header">
          {current.milestone.title}
        </Text>
        <Text style={[textRole.small, styles.muted, styles.progress, tabular]}>
          Your Dex now holds {formatCount(current.collected)} of {formatCount(TOTAL)} entries
        </Text>

        <Button label="Done" onPress={onDismiss} block style={styles.cta} />
      </View>
    );
  }

  /*
    Modal for VoiceOver: everything behind the scrim drops out of the swipe
    order while a card is up, and the two-finger escape dismisses it the
    way a tap does.
  */
  return (
    <View
      style={styles.scrim}
      pointerEvents="box-none"
      accessibilityViewIsModal
      onAccessibilityEscape={onDismiss}>
      {/*
        Fades in, and leaves at once with the overlay. The fade-in is
        decoration over a card that is already visible, so one that stalls
        leaves only a lighter scrim (check-design's one allowlisted entering).
      */}
      <Animated.View
        pointerEvents="none"
        entering={reduced ? undefined : FadeIn.duration(SETTLE)}
        style={styles.scrimFill}
      />

      {/*
        The dismiss target is a SIBLING under the card, not a wrapper round
        it, so the card's own key is never a button inside a button. Hidden
        from screen readers: Done and the escape gesture already do its job.
      */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessible={false}
        importantForAccessibility="no"
      />

      <CelebrationCard key={current.id}>{card}</CelebrationCard>
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
  /* Separate fill so the scrim alone fades in, under a card already at rest. */
  scrimFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  /* A dialog on the page's white: no edge (the scrim sets it apart) and no shadow. */
  card: {
    width: '100%',
    maxWidth: CARD_MAX,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  body: { alignItems: 'center', padding: BODY_PAD },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  centred: { textAlign: 'center' },

  name: { marginTop: space.xl },
  plate: { marginTop: space.md },
  rankMark: { marginBottom: space.lg },
  progress: { marginTop: space.md, textAlign: 'center' },
  cta: { marginTop: space.xl },
});
