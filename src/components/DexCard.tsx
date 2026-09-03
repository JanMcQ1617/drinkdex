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
  elevation,
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
/* The veil stays, at a fraction of its old weight, because pure         */
/* greyscale on a bone page reads cold and digital. `lockInk` is         */
/* espresso, so a thin pass of it warms the grey into something closer   */
/* to a sepia plate, which is in the palette rather than beside it.      */
/*                                                                      */
/* Once you log a pour, YOUR photo takes over as the face — the card     */
/* becomes a record of the one you actually drank. The stock photograph  */
/* is the placeholder standing in until then.                            */
/*                                                                      */
/* Entries with no photograph at all (every beer, wine and spirit) keep  */
/* the vector artwork and its black-ink locked state.                    */
/* ==================================================================== */

/** DrinkArt's viewBox is 100×112, so height follows width by this factor. */
const ART_ASPECT = 112 / 100;

/**
 * Height the nameplate reserves at the foot of the card.
 *
 * The photo stops here rather than running under the plate: cover-cropping a
 * square source into the full 0.72 card would push the vessel's base behind
 * the nameplate. Ending at the plate leaves the container near-square, so the
 * crop takes a few points off the sides and the whole drink stays visible.
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
        collected && { borderColor: rarity.edge, borderWidth: rarity.edgeWidth },
        collected && elevation.card,
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
          {shadowed ? <View pointerEvents="none" style={[styles.photo, styles.photoScrim]} /> : null}
        </>
      ) : null}

      {/* The lit lip along the top edge — what makes a recess read as cut in. */}
      {collected ? null : <View pointerEvents="none" style={styles.wellLip} />}

      {legendary && !reduced ? <FoilSweep width={cardWidth} /> : null}

      {/* ---- Dex number plate ---- */}
      <View style={[styles.plate, collected ? styles.plateLit : styles.plateSunk]}>
        <Text style={[styles.plateText, !collected && styles.plateTextSunk]}>
          {formatDexNumber(drink.dexNumber)}
        </Text>
      </View>

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

      {/* ---- Nameplate ---- */}
      <View style={[styles.nameplate, collected ? styles.nameplateLit : styles.nameplateSunk]}>
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

  /* Recess */
  wellLip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.embossShadow,
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
    filter: 'grayscale(0.75) brightness(0.99) contrast(1.1)',
  },
  /** Fills the filter wrapper; the wrapper owns the position. */
  photoFill: { width: '100%', height: '100%' },
  photoScrim: {
    /*
     * A quarter of its old weight. It is no longer what says "not yours" —
     * greyscale does that — so all this has left to do is warm the grey
     * back toward the palette and sink it a touch below the page.
     */
    backgroundColor: colors.lockInk,
    opacity: 0.18,
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: NAMEPLATE_MIN,
  },

  /* Foil */
  foil: {
    position: 'absolute',
    top: '-30%',
    bottom: '-30%',
    left: 0,
  },

  /* Dex plate */
  plate: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  plateLit: {
    backgroundColor: glass.fillStrong,
    borderColor: colors.embossLight,
  },
  plateSunk: {
    /*
     * A bone plaque, not the recess floor. The Sipply muted ink clears
     * 4.5:1 on bone (4.88) but only reaches 4.04 on `slotDeep`, so the
     * plate is the lighter object sitting IN the well rather than a
     * darker patch of it — which is also how a real engraved plate reads.
     */
    backgroundColor: colors.cardAlt,
    borderColor: colors.slotBorder,
  },
  plateText: {
    /*
     * The catalogue number is now the brand's letterspaced label — Inter
     * Medium, tracked out, tabular so the digits hold a column down the
     * grid. 2pt at 9px is the label style pulled in slightly so six
     * characters still fit the plate.
     */
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.textMuted,
    ...tabular,
  },
  plateTextSunk: {
    color: colors.textMuted,
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
  nameplate: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: NAMEPLATE_MIN,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nameplateLit: {
    backgroundColor: glass.fillStrong,
    borderTopColor: colors.embossLight,
  },
  nameplateSunk: {
    backgroundColor: colors.cardAlt,
    borderTopColor: colors.slotBorder,
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
