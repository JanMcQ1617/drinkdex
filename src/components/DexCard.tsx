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
} from '@/constants/theme';
import { formatDexNumber } from '@/data';
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
/* ==================================================================== */

/** DrinkArt's viewBox is 100×112, so height follows width by this factor. */
const ART_ASPECT = 112 / 100;

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
  onPress: (id: string) => void;
}

export const DexCard = React.memo(function DexCard({
  drink,
  artSize,
  collected,
  onPress,
}: DexCardProps) {
  const category = CATEGORY_META[drink.category];
  const rarity = RARITY_META[drink.rarity];
  const reduced = useReducedMotion();

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
            <Icon name="sparkle" size={13} color={colors.goldGlyph} filled />
          ) : (
            // `color`, not `edge`: the pip CONVEYS the tier, so it takes the
            // contrast-audited value. `edge` is decorative and too pale here
            // — as `common` it read as a smudge on the category field.
            <View style={[styles.rarityPip, { backgroundColor: rarity.color }]} />
          )
        ) : (
          <Icon name="lock" size={11} color={colors.textFaint} filled />
        )}
      </View>

      {/* ---- Artwork ---- */}
      <View style={[styles.artZone, { height: Math.round(artSize * ART_ASPECT) }]}>
        <DrinkArt drink={drink} size={artSize} locked={!collected} flat />
      </View>

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
    backgroundColor: colors.slotDeep,
    borderColor: colors.slotBorder,
  },
  plateText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.3,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  plateTextSunk: {
    color: colors.textFaint,
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
    minHeight: 38,
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
    backgroundColor: colors.slotDeep,
    borderTopColor: colors.slotBorder,
  },
  name: {
    fontFamily: fonts.display,
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
