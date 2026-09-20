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
import { PressableScale } from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  fonts,
  glass,
  radius,
  RARITY_META,
  space,
  tabular,
} from '@/constants/theme';
import { formatDexNumber } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import type { Drink } from '@/types';

/* ==================================================================== */
/* DexCard                                                              */
/*                                                                      */
/* One cell of the collection board. The grid is a display case, so the */
/* two states are physically different objects rather than two tints of */
/* the same card:                                                       */
/*                                                                      */
/*   COLLECTED  a card. Lit category field, framed in its rarity tier,   */
/*              lifted off the page by a shadow, name on a plate.        */
/*   EMPTY      a recess. Sunk below the page, no lift, hairline shadow  */
/*              along the top edge to sell the depth, silhouette only.   */
/*                                                                      */
/* The old grid separated these by 2% luminance (#FBFBF8 vs #F6F5F0),    */
/* which is why the board never produced any desire to fill it.          */
/*                                                                      */
/* Where a photograph exists it is the card face in BOTH states. Locked  */
/* DRAINS it rather than darkening it: most of the colour pulled out,    */
/* contrast pushed back up, under a thin warm veil. Collecting restores  */
/* the colour, and that restoration is the reward.                       */
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
/* Once you log a pour, YOUR photo takes over as the face — the card     */
/* becomes a record of the one you actually drank. The stock photograph  */
/* is the placeholder standing in until then.                            */
/*                                                                      */
/* Entries with no photograph at all — every spirit, and the cocktails  */
/* beyond the photographed 150 — keep the vector artwork and its         */
/* black-ink locked state.                                               */
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
 * animation in a 460-cell virtualised grid, and legendaries are a small
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
  collected: boolean;
  /** The user's own pour photo, once they have logged one. */
  userPhotoUri?: string | null;
  onPress: (id: string) => void;
}

export const DexCard = React.memo(function DexCard({
  drink,
  artSize,
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
   */
  const stock = drinkPhoto(drink.id);
  const mine = collected && userPhotoUri ? userPhotoUri : null;
  const photo = mine ? { uri: mine } : stock;
  // Dim the stock photo until it is collected. A logged pour is never dimmed.
  const shadowed = Boolean(photo) && !collected;
  const legendary = collected && drink.rarity === 'legendary';
  // The field is ~1.9× the art box; enough for the sweep to clear the card.
  const cardWidth = Math.round(artSize / 0.66);

  /*
   * Per-card gradient id. On web, SVG <Defs> ids share one global namespace,
   * so keying by category alone would let a collected card and an empty one
   * of the same category resolve to whichever mounted last.
   */
  const washId = `nameWash-${drink.id}`;
  const fieldId = `dexField-${drink.id}-${collected ? 'c' : 'e'}`;

  return (
    <PressableScale
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${formatDexNumber(drink.dexNumber)}, ${
        rarity.label
      }, ${collected ? 'collected' : 'not collected yet'}`}
      // Flat, not nested: PressableScale takes a one-level style array.
      style={[
        styles.card,
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
      */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={fieldId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={collected ? category.fieldFrom : colors.slot} />
            <Stop offset="1" stopColor={collected ? category.fieldTo : colors.slotDeep} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fieldId})`} />
      </Svg>

      {/* ---- Photograph ---- */}
      {/*
        Sits over the field gradient, which stays underneath as the ground
        while the image decodes. The dex plate and nameplate both use
        `glass.fillStrong`, the token specced for surfaces over photography,
        so they stay legible without a scrim.
      */}
      {photo ? (
        <>
          {/*
            The filter rides a wrapper View, not the Image. `filter` is a
            ViewStyle prop and expo-image types its style as ImageStyle,
            which does not carry it — so putting it on the Image is a type
            error rather than a silent no-op. It applies to the subtree
            either way.
          */}
          <View pointerEvents="none" style={[styles.photo, shadowed && styles.photoLocked]}>
            <Image
              source={photo}
              style={styles.photoFill}
              contentFit="cover"
              transition={140}
              accessible={false}
              cachePolicy="memory-disk"
            />
          </View>
        </>
      ) : null}

      {legendary && !reduced ? <FoilSweep width={cardWidth} /> : null}

      {/* ---- Rarity / lock marker ---- */}
      <View style={styles.marker} pointerEvents="none">
        {collected ? (
          legendary ? (
            <Icon name="sparkle" size={13} color={colors.giltGlyph} filled />
          ) : (
            // `color`, not `edge`: the pip CONVEYS the tier, so it takes the
            // contrast-audited value. `edge` is decorative and too pale here
            // — as `common` it read as a smudge on the category field.
            <View style={[styles.rarityPip, { backgroundColor: rarity.color }]} />
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
        A second Svg rather than another Rect on the field one above: that Svg
        is painted UNDER the photograph, and this wash has to sit over it. It
        is one extra node per RENDERED cell, not per entry — the grid is
        virtualised, so the cost is bounded by what fits on screen.

        The gradient is its own layer rather than a background on the text
        container, because a View background cannot fade, and a hard-edged
        fill is exactly the trough this replaces.
      */}
      <Svg style={styles.nameWash} pointerEvents="none">
        <Defs>
          <LinearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.surface} stopOpacity="0" />
            <Stop offset="0.55" stopColor={colors.surface} stopOpacity="0.72" />
            <Stop offset="1" stopColor={colors.surface} stopOpacity="0.94" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${washId})`} />
      </Svg>
      <View style={styles.nameplate}>
        <Text style={styles.numberLine}>{formatDexNumber(drink.dexNumber)}</Text>
        <Text numberOfLines={2} style={[styles.name, !collected && styles.nameEmpty]}>
          {drink.name}
        </Text>
      </View>
    </PressableScale>
  );
});

/* ==================================================================== */

const styles = StyleSheet.create({
  card: {
    flex: 1,
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
   * The locked photograph. Greyscale carries the state; brightness and
   * contrast place it in the recess.
   *
   * Lifted and flattened, NOT darkened. The empty card is a well in a bone
   * page whose own ground (`slot` / `slotDeep`) is a light warm grey — so
   * "sunken" here has to mean faded, the way a label left in the sun goes,
   * not shadowed. Pushing brightness down instead put the photo cards in a
   * different tonal band from the vector cards beside them and turned the
   * board into a wall of dark rectangles.
   *
   * WRITTEN AS A STRING, NOT AN ARRAY. `filter` accepts both, but
   * react-native-web silently drops the array form of
   * `[{grayscale: 1}, …]` — 54 photographs rendered on web and not one
   * element carried a computed filter, with "grayscale" absent from the
   * DOM entirely. The string is passed straight through to CSS, so the
   * same declaration works on web and native instead of failing on one of
   * them without saying so.
   *
   * That failure mode is worth remembering: when `filter` no-ops, a locked
   * card renders in FULL COLOUR and reads as collected. Check that a
   * locked card is grey before trusting a build.
   *
   * The three numbers were arrived at by looking, not by theory: rendered
   * against the real cocktail photographs on web, and checked against an
   * unfiltered row in the same frame so the locked-to-collected gap could
   * be judged rather than assumed. They have NOT been seen on a device.
   */
  photoLocked: {
    /*
     * 0.85, up from 0.75. The espresso veil that used to sit over this was
     * removed so one mechanism carries the state — which left the locked
     * card closer to full colour than intended. Raising greyscale puts the
     * gap back without reintroducing a second layer.
     *
     * NOT 1.0: full greyscale deletes these drinks. They are studio shots on
     * a neutral backdrop, so the subject lives in chroma rather than
     * luminance, and at 1.0 a Caesar, a Greyhound and a Brandy Alexander
     * collapse into the same taupe rectangle. A sixth of the colour left,
     * with contrast pushed up, holds them apart.
     */
    filter: 'grayscale(0.85) brightness(0.99) contrast(1.12)',
  },
  /** Fills the filter wrapper; the wrapper owns the position. */
  photoFill: { width: '100%', height: '100%' },
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
     * top — a caption trough, in two tints, across every one of 7,653 cells.
     * What is left is the text over a light gradient painted on the card.
     *
     * The gradient goes to WHITE rather than to ink, so one treatment serves
     * both grounds: over a photograph it lifts the bottom edge until dark
     * text clears comfortably, and over the vector field — already a pale
     * tint — it is nearly invisible. Fading to ink would have required light
     * text, which the vector cards could not carry.
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
  /* The catalogue number sits above the name here rather than in a bordered
     plate of its own in the corner. */
  numberLine: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.textMuted,
    ...tabular,
  },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: 12,
    lineHeight: 15,
    color: colors.text,
  },
  nameEmpty: {
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
});

export default DexCard;
