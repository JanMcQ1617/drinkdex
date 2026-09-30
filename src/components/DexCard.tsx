import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { haptic, PressableScale } from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  dexNumber,
  fonts,
  glass,
  radius,
  RARITY_META,
  space,
  type as typeScale,
} from '@/constants/theme';
import { formatDexNumber } from '@/data';
import { drinkPhoto, drinkPhotoLocked } from '@/data/drinkPhotos';
import type { Drink } from '@/types';

/* ==================================================================== */
/* DexCard                                                              */
/*                                                                      */
/* One cell of the collection board. The grid is a display case, so the */
/* two states are physically different objects rather than two tints of */
/* the same card:                                                       */
/*                                                                      */
/*   COLLECTED  a card. Lit category field, framed in its rarity tier,   */
/*              name over a light wash. No shadow: the frame and the    */
/*              colour already separate it from its neighbours.         */
/*   EMPTY      a recess. Sunk below the page in `slot`, darkening      */
/*              toward its floor, silhouette only.                      */
/*                                                                      */
/* The old grid separated these by 2% luminance (#FBFBF8 vs #F6F5F0),    */
/* which is why the board never produced any desire to fill it.          */
/*                                                                      */
/* Where a photograph exists it is the card face in BOTH states. Locked  */
/* DRAINS it rather than darkening it: most of the colour pulled out,    */
/* contrast pushed back up. Collecting restores the colour, and that     */
/* restoration is the reward.                                            */
/*                                                                      */
/* It used to darken instead — a flat espresso veil at 0.72 — and that   */
/* failed three ways at once. It crushed every photograph to the same    */
/* brown-grey, so nine cards on screen read as nine identical            */
/* rectangles and the board lost the variety that makes an index worth   */
/* scrolling. It fought itself, because the veil heavy enough to say     */
/* "not yours" was also heavy enough to hide the drink (0.82 turned an   */
/* Espresso Martini into a black rectangle; 0.72 was a truce, not a      */
/* fix). And it did not match the empty cards next to it: the vector     */
/* recess is built on `slot`/`slotDeep`, which are LIGHT warm greys, so  */
/* a near-black photo card sat in a completely different tonal band from */
/* the empty card beside it.                                            */
/*                                                                      */
/* Draining solves all three. It is the photographic spelling of what    */
/* the vector locked state already says — colour removed, form kept —    */
/* so the two empty states finally speak one language. Form and tone     */
/* survive, so a coupe still reads as a coupe and the grid keeps its     */
/* variety. And the reward for collecting is COLOUR, which is a far      */
/* stronger pull than "slightly less dark".                              */
/*                                                                      */
/* PARTIAL, NOT FULL. grayscale(1) was tried first and it deleted the    */
/* drinks: these are studio shots on a neutral light backdrop, so the    */
/* subject is carried almost entirely in CHROMA, not luminance. Strip    */
/* the colour completely and a Caesar, a Greyhound and a Brandy          */
/* Alexander all collapse into the same flat taupe rectangle — the exact */
/* failure the old dark veil had, arrived at from the opposite           */
/* direction. Keeping a quarter of the chroma and pushing contrast back  */
/* up holds each drink apart while the gap to full colour stays obvious. */
/*                                                                      */
/* THE ESPRESSO VEIL IS GONE. A second scrim View used to sit over the   */
/* greyscale to warm it toward sepia. Two layers were saying one thing,  */
/* and with the name no longer in a tinted trough the card had to carry  */
/* less treatment overall, not more. Greyscale alone still opens a wide  */
/* gap — checked against a collected card in the same frame.             */
/*                                                                      */
/* THE DRAIN IS BAKED INTO THE IMAGE, NOT APPLIED AT RUNTIME. It was a   */
/* `filter` on the card, and on iOS that filter silently did not run:    */
/* React Native 0.86 draws grayscale() and contrast() through a SwiftUI  */
/* wrapper that only exists behind a flag that is off at the Stable      */
/* release level this app ships on. Only the 1% brightness step reached  */
/* the screen, so every photographed entry showed in full colour while   */
/* locked and read as collected — the one thing this card must not do.   */
/* scripts/build-drink-photos.mjs now writes a drained copy of each      */
/* photograph (drinkPhotoLocked) with the same numbers, and the card     */
/* just shows it. One asset per state, identical on every platform, and  */
/* no extra layer per locked card.                                       */
/*                                                                      */
/* Once you log a pour, YOUR photo takes over as the face — the card     */
/* becomes a record of the one you actually drank. The stock photograph  */
/* is the placeholder standing in until then.                            */
/*                                                                      */
/* Entries with no photograph — most of the index — keep the vector      */
/* artwork and its black-ink locked state.                               */
/* ==================================================================== */

/** DrinkArt's viewBox is 100×112, so height follows width by this factor. */
const ART_ASPECT = 112 / 100;

/**
 * Minimum height the name overlay occupies at the foot of the card.
 *
 * It used to be the height the photo STOPPED at, so a square source cropped
 * into a near-square box and the whole drink stayed visible. The photo now
 * fills the full 0.72 cell, which does crop top and bottom — the old note
 * warned this would hide the vessel's base behind the plate.
 *
 * Checked rather than assumed: against the real photographs the glasses keep
 * their bases, because the drink is centred in a square frame with headroom
 * above and below. If a future photo set crops badly, the fix is the source
 * framing, not reinstating a 38pt band across every card.
 */
const NAMEPLATE_MIN = 38;

/**
 * The foil sweep on a collected legendary.
 *
 * Gated to legendary-and-collected on purpose: it is the only looping
 * animation in a 2,089-cell virtualised grid, and legendaries are a small
 * fraction of the index, so at most one or two are ever on screen. A sweep
 * on every card would be both a battery cost and visual noise.
 */
export function FoilSweep({ width }: { width: number }) {
  const x = useSharedValue(-1);

  useEffect(() => {
    x.set(
      withRepeat(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    );
  }, [x]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * width * 1.6 }, { rotate: '18deg' }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.foil, { width: width * 0.5 }, style]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="dexFoil" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={glass.sheenTo} />
            <Stop offset="0.5" stopColor={glass.sheenFrom} />
            <Stop offset="1" stopColor={glass.sheenTo} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dexFoil)" />
      </Svg>
    </Animated.View>
  );
}

export interface DexCardProps {
  drink: Drink;
  /** Width of the artwork in points — derived from the live column width. */
  artSize: number;
  /**
   * Width of the card itself: the exact column width, unrounded.
   *
   * Explicit rather than `flex: 1`, because FlatList lays each grid row out
   * as a plain flex row, so a card alone in the last row — every odd-length
   * search result, a single match, the first entry on Collected — stretched
   * to the full row and, at a 0.72 aspect, to twice the height of every
   * other card, with column-sized art floating in it. A fixed width keeps
   * that card a grid cell, left-aligned like the rest.
   */
  cardWidth: number;
  collected: boolean;
  /** The user's own pour photo, once they have logged one. */
  userPhotoUri?: string | null;
  onPress: (id: string) => void;
}

export const DexCard = React.memo(function DexCard({
  drink,
  artSize,
  cardWidth,
  collected,
  userPhotoUri,
  onPress,
}: DexCardProps) {
  const category = CATEGORY_META[drink.category];
  const rarity = RARITY_META[drink.rarity];
  const reduced = useReducedMotion();

  /*
   * Face precedence: the pour you logged, else the stock photograph, else
   * the vector art. `userPhotoUri` is null when a logged photo went missing,
   * so fall through to the stock image rather than showing an empty card.
   *
   * A locked card only ever gets the DRAINED photograph. If a locked copy
   * were missing it falls to the vector silhouette, never to the colour
   * one — a full-colour face on a locked card reads as collected.
   */
  const mine = collected && userPhotoUri ? userPhotoUri : null;
  const photo = mine
    ? { uri: mine }
    : collected
      ? drinkPhoto(drink.id)
      : drinkPhotoLocked(drink.id);
  const legendary = collected && drink.rarity === 'legendary';

  /*
   * The empty vector recess gets its own name wash, in `slot`. The white
   * one below is right over a photograph and over a collected card's pale
   * field, but over the recess it painted a near-white band across the
   * foot of the cell (1.48:1 against slotDeep) — undoing the darkening the
   * field exists to show, on the cell most of the Dex is made of.
   */
  const recessWash = !photo && !collected;

  /*
   * Per-card gradient id. On web, SVG <Defs> ids share one global namespace,
   * so keying by category alone would let a collected card and an empty one
   * of the same category resolve to whichever mounted last.
   */
  const washId = `nameWash-${drink.id}-${recessWash ? 'r' : 'w'}`;
  const fieldId = `dexField-${drink.id}-${collected ? 'c' : 'e'}`;
  const washColor = recessWash ? colors.slot : colors.surface;

  return (
    <PressableScale
      /*
       * No tick on touch-down, and a short delay before the press state.
       * The grid is wall-to-wall cards, so nearly every flick starts on
       * one, and PressableScale's default answers onPressIn — before the
       * list has claimed the gesture. Every scroll buzzed the phone and
       * pulsed the card under the thumb, feedback for a press that never
       * happened. A flick leaves the slop inside 120ms and cancels the
       * touch before either fires; a tap still lands, and ticks on
       * release.
       */
      noHaptic
      unstable_pressDelay={120}
      onPress={() => {
        haptic.tap();
        onPress(drink.id);
      }}
      accessibilityRole="button"
      // The spoken number is unpadded: "#0042" is read digit by digit.
      accessibilityLabel={`${drink.name}, number ${drink.dexNumber}, ${
        rarity.label
      }, ${collected ? 'collected' : 'not collected yet'}`}
      // Flat, not nested: PressableScale takes a one-level style array.
      style={[
        styles.card,
        { width: cardWidth },
        collected && styles.cardCollected,
        /*
         * The rarity edge is the collected card's one separator. It used to
         * carry a shadow as well — tint, border and lift for a cell already
         * distinguished from its neighbours by being in full colour beside
         * greyed ones.
         */
        collected && { borderColor: rarity.edge, borderWidth: rarity.edgeWidth },
        !collected && styles.cardEmpty,
      ]}>
      {/* ---- Field ---- */}
      {/*
        Both states are a vertical gradient, for the same reason: a flat fill
        reads as a swatch. Collected lightens toward the top (lit from above);
        empty DARKENS toward the bottom (a recess loses light at its floor).
        Gradient rather than two stacked Views — a hard boundary partway down
        the card reads as a seam, which is a rendering bug, not depth.

        Not drawn under a photograph. The photo covers the whole cell, so
        the field was a full-card vector layer rasterised only to be hidden;
        the card's own flat fill is the ground while the image decodes.
      */}
      {photo ? null : (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id={fieldId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={collected ? category.fieldFrom : colors.slot} />
              <Stop offset="1" stopColor={collected ? category.fieldTo : colors.slotDeep} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fieldId})`} />
        </Svg>
      )}

      {/* ---- Photograph ---- */}
      {photo ? (
        <Image
          source={photo}
          style={styles.photo}
          contentFit="cover"
          transition={140}
          accessible={false}
          cachePolicy="memory-disk"
        />
      ) : null}

      {legendary && !reduced ? <FoilSweep width={cardWidth} /> : null}

      {/* ---- Rarity / lock marker ---- */}
      <View style={styles.marker} pointerEvents="none">
        {collected ? (
          legendary ? (
            <Icon name="sparkle" size={13} color={colors.giltGlyph} filled />
          ) : (
            /*
             * `color`, not `edge`: the pip CONVEYS the tier, so it takes the
             * contrast-audited value. `edge` is decorative and too pale here
             * — as `common` it read as a smudge on the category field.
             *
             * Common is a RING, the others a filled dot. Common's ink and
             * uncommon's are 1.04:1 apart and nearly one hue, so as two
             * dots they were the same mark; shape tells them apart where
             * colour cannot. Rare then differs from uncommon by hue and
             * weight, and legendary is the sparkle.
             */
            <View
              style={[
                styles.rarityPip,
                drink.rarity === 'common'
                  ? { borderColor: rarity.color, borderWidth: 1.5 }
                  : { backgroundColor: rarity.color },
              ]}
            />
          )
        ) : (
          <Icon name="lock" size={11} color={colors.textMuted} filled />
        )}
      </View>

      {/* ---- Artwork ---- */}
      {photo ? null : (
        <View style={[styles.artZone, { height: Math.round(artSize * ART_ASPECT) }]}>
          <DrinkArt drink={drink} size={artSize} locked={!collected} flat />
        </View>
      )}

      {/* ---- Name ---- */}
      {/*
        A second Svg rather than another Rect on the field one above: the
        field belongs UNDER the photograph (and is skipped when there is
        one), and this wash has to sit over it. It is one extra node per
        MOUNTED cell, not per entry — the grid is virtualised, so the cost is
        bounded by the list's render window.

        The gradient is its own layer rather than a background on the text
        container, because a View background cannot fade, and a hard-edged
        fill is exactly the trough this replaces.

        The recess wash turns fully opaque at 0.3, not 0.55: `slot` is the
        darkest ground the muted name and number can sit on and still clear
        4.5:1, so both lines of a two-line name and the number above them
        have to land on solid slot rather than on slot thinned over
        slotDeep. At 0.4 the name was covered but the top of the number
        was not, and read at about 4.45:1.

        That holds at the default text size only. Each Dynamic Type step
        up lifts the number back onto the fade, down to about 4.3:1 at the
        1.4 cap. A stop high enough to cover that would be a hard edge
        across the recess, the seam the field gradient exists to avoid.
      */}
      <Svg style={styles.nameWash} pointerEvents="none">
        <Defs>
          <LinearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={washColor} stopOpacity="0" />
            <Stop
              offset={recessWash ? '0.3' : '0.55'}
              stopColor={washColor}
              stopOpacity={recessWash ? '1' : '0.72'}
            />
            <Stop offset="1" stopColor={washColor} stopOpacity={recessWash ? '1' : '0.94'} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${washId})`} />
      </Svg>
      {/*
        Dynamic Type is capped at 1.4 on both lines. Uncapped, the largest
        accessibility sizes grew the plate past the wash above it, so the
        name climbed onto bare photograph where nothing guarantees contrast.
        At 1.4 the number and a two-line name come to about 65pt of text,
        inside the fixed wash (NAMEPLATE_MIN * 2 = 76pt). A thumbnail is not
        where the full name has to be read: the card's accessibilityLabel
        gives VoiceOver all of it, and the drink page sets it at full size.
      */}
      <View style={styles.nameplate}>
        <Text
          style={[styles.numberLine, !collected && styles.numberLineEmpty]}
          maxFontSizeMultiplier={1.4}>
          {formatDexNumber(drink.dexNumber)}
        </Text>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
          style={[styles.name, !collected && styles.nameEmpty]}>
          {drink.name}
        </Text>
      </View>
    </PressableScale>
  );
});

/* ==================================================================== */

const styles = StyleSheet.create({
  /* Width comes from the `cardWidth` prop — see DexCardProps. */
  card: {
    aspectRatio: 0.72,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardCollected: {
    backgroundColor: colors.surface,
  },
  cardEmpty: {
    backgroundColor: colors.slot,
    borderWidth: 1,
    borderColor: colors.slotBorder,
  },


  /* Photograph */
  /*
   * THE LOCKED LOOK — grayscale(0.85) brightness(0.99) contrast(1.12) —
   * now lives in scripts/build-drink-photos.mjs (LOCK), baked into
   * assets/drinks/locked/. Why those numbers, which still hold:
   *
   * Greyscale carries the state; brightness and contrast place it in the
   * recess. Lifted and flattened, NOT darkened. The empty card is a well in
   * a bone page whose own ground (`slot` / `slotDeep`) is a light warm grey
   * — so "sunken" here has to mean faded, the way a label left in the sun
   * goes, not shadowed. Pushing brightness down instead put the photo cards
   * in a different tonal band from the vector cards beside them and turned
   * the board into a wall of dark rectangles.
   *
   * 0.85, up from 0.75. The espresso veil that used to sit over this was
   * removed so one mechanism carries the state — which left the locked card
   * closer to full colour than intended. Raising greyscale put the gap back
   * without reintroducing a second layer.
   *
   * NOT 1.0: full greyscale deletes these drinks. They are studio shots on a
   * neutral backdrop, so the subject lives in chroma rather than luminance,
   * and at 1.0 a Caesar, a Greyhound and a Brandy Alexander collapse into
   * the same taupe rectangle. A sixth of the colour left, with contrast
   * pushed up, holds them apart.
   *
   * The numbers were arrived at by looking, on web, against the real
   * photographs and an unfiltered row in the same frame. The baked assets
   * were checked against Chrome's own `filter` on the same source: under
   * 1.2/255 mean difference per channel, which is encoder noise.
   */
  photo: {
    /*
     * Fills the whole cell. It used to stop NAMEPLATE_MIN short so the tinted
     * nameplate could have its own strip of card — the photograph was being
     * cropped to make room for a caption trough. The name now sits over the
     * image on a light gradient, so the picture gets those 38pt back and the
     * cell reads as a photograph rather than a photograph-and-a-label.
     */
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  /* Foil */
  foil: {
    position: 'absolute',
    top: '-30%',
    bottom: '-30%',
    left: 0,
  },


  /* Marker */
  marker: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  rarityPip: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  /* Artwork */
  artZone: {
    marginTop: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Nameplate */
  nameWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    /* Taller than the text so the fade begins well above it and never reads
       as a band with an edge. */
    height: NAMEPLATE_MIN * 2,
  },
  nameplate: {
    /*
     * An overlay, not a bar. It was a filled strip with a hairline along its
     * top — a caption trough, in two tints, across every cell in the Dex.
     * What is left is the text over a light gradient painted on the card.
     *
     * The gradient goes LIGHT rather than to ink, so dark text works on
     * every ground: over a photograph, white lifts the bottom edge until
     * the name clears comfortably; over a collected card's pale field,
     * white is nearly invisible; over the empty recess it is `slot`, the
     * recess's own colour (see `recessWash`). Fading to ink would have
     * required light text, which the vector cards could not carry.
     */
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: NAMEPLATE_MIN,
    justifyContent: 'flex-end',
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    gap: 1,
  },
  /*
   * The catalogue number sits above the name here rather than in a bordered
   * plate of its own in the corner. It is theme.ts's `dexNumber`, the one
   * stamp the app defines for "#0042" wherever it appears: 11pt, `tag` size,
   * tracked half as wide as `label.ui` because it is figures, in taupeInk.
   * It was a 9pt one-off below the scale, then `label.ui` at the full
   * tracking meant for words.
   */
  numberLine: dexNumber,
  /*
   * taupeInk is 4.36:1 on the empty recess's `slot`, under the 4.5:1 an
   * 11pt number needs. The locked card's number takes textMuted instead,
   * as its name does.
   */
  numberLineEmpty: { color: colors.textMuted },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    color: colors.text,
  },
  nameEmpty: {
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
});

export default DexCard;
