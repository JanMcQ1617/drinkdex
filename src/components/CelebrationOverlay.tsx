import React, { useCallback, useEffect } from 'react';
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

import { DrinkName, MOUNT, Mount, MountWindow, NumberPlate, TierWord } from '@/components/cabinet';
import { DrinkFace, FACE_FILL, FoilSweep } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui';
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { formatCount, getDrink, TOTAL } from '@/data';
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

/** How long the scrim takes to fade in. Kept under the 400ms ceiling. */
const SETTLE = 380;

/** The card's widest, and its body's padding: the name's measure comes from both. */
const CARD_MAX = 340;
const BODY_PAD = space.xl;
/** The feature mount (spec §9.13.7), as EmptyArt draws it. */
const FEATURE = { width: 120, height: 150 } as const;
const FEATURE_INNER = 2 * (MOUNT.feature.padding + stroke.edge);
const CAP = 1.3;

/*
 * The card alone. The scrim and the dismiss layer belong to the overlay,
 * which mounts them once for the whole queue; each card is keyed on its
 * queue id, so the next one is drawn fresh.
 *
 * AT REST FROM ITS FIRST FRAME. It sprang in from 0.86 and 18pt low,
 * which a stalled frame loop left small and off-centre; now nothing about
 * the card moves, and the only motion on it is a legendary's one foil
 * pass, which rests off the picture (DexCard's FoilSweep).
 *
 * NO EXIT ANIMATION. The card that is done goes at once. An `exiting`
 * fade has two ways never to finish on this Reanimated (4.5.x): when
 * layout animations overlap (Done tapped while the scrim is still fading
 * in), the exit's "remove" is dropped; and a frame loop that stalls after
 * a cold start never reaches the end. Either way the card, or the dimmed
 * layer behind it, stays over the app for the rest of the session with
 * nothing to tap.
 *
 * Paper, with its grain: the card is a sheet of the app's own ground laid
 * over the dimmed screen, and the mount on it is card stock lying on paper.
 */
function CelebrationCard({ children }: { children: React.ReactNode }) {
  /*
    Absorbs its own touches without being a button, so a tap on the card
    does not fall through to the dismiss layer below it.
  */
  return (
    <View style={styles.card} onStartShouldSetResponder={() => true}>
      <Grain />
      {children}
    </View>
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
  const { width } = useWindowDimensions();
  const measure = Math.min(CARD_MAX, width - 2 * layout.gutter) - 2 * stroke.edge - 2 * BODY_PAD;

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

    const record = Object.prototype.hasOwnProperty.call(unlocks, current.drinkId)
      ? unlocks[current.drinkId]
      : undefined;
    const legendary = drink.rarity === 'legendary';
    const collected = Object.keys(unlocks).length;
    const faceW = FEATURE.width - FEATURE_INNER;
    const faceH = FEATURE.height - FEATURE_INNER;

    card = (
      <View style={styles.body}>
        <Text style={styles.eyebrow}>Collected</Text>

        {/*
          The catch as the Dex will hold it: a feature mount, card stock
          with the tier's rule printed inside its edge (a legendary's in
          double gilt), lying on the paper card, so no seat. Your pour,
          else the lit catalogue photo, else the lit vector face, decoded at
          the window's size rather than the pour's 2048px.
        */}
        <Mount state="mounted" tier={drink.rarity} size="feature" onLining={false} style={styles.art}>
          <MountWindow height={faceH} state="mounted">
            <DrinkFace
              drink={drink}
              mode="lit"
              photoUri={record?.photoUri}
              width={faceW}
              height={faceH}
              style={FACE_FILL}
            />
            {/* One pass, then at rest off the picture; none under Reduce Motion. */}
            {legendary ? <FoilSweep width={faceW} /> : null}
          </MountWindow>
        </Mount>

        {/* Never truncated: a long name wraps, and the card grows with it. */}
        <DrinkName
          name={drink.name}
          role={textRole.nameLg}
          measure={measure}
          cap={CAP}
          color={colors.text}
          align="center"
          accessibilityRole="header"
        />

        <View style={styles.plates}>
          <NumberPlate n={drink.dexNumber} tone="paper" />
          <TierWord rarity={drink.rarity} tone="paper" />
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

        <Text style={styles.rankTitle} accessibilityRole="header">
          {current.milestone.title}
        </Text>
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
  /* A dialog: a panel with one drawn edge and no shadow, on the paper ground. */
  card: {
    width: '100%',
    maxWidth: CARD_MAX,
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  body: { alignItems: 'center', padding: BODY_PAD },

  /* Sentence case and untracked, in wine: the one word that names the moment. */
  eyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.wine,
    marginBottom: space.lg,
  },

  art: { ...FEATURE, marginBottom: space.lg },
  rankMark: { marginBottom: space.lg },

  /*
   * A rank is a reading of the collection, not a drink, so it is Inter, as
   * Stats sets it (Playfair is for drink names only). The size of the
   * drink's name on the other card, so the two cards of one log hold the
   * same shape.
   */
  rankTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
    textAlign: 'center',
  },
  /* The catalogue number's stamp and the tier, as on the entry's Dex card. */
  plates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: space.sm,
    rowGap: space.xs,
    marginTop: space.md,
  },
  progress: {
    ...textRole.helper,
    ...tabular,
    color: colors.textMuted,
    marginTop: space.md,
  },
  cta: { marginTop: space.xl },
});
