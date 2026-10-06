import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { FACE_FILL, VectorFace } from '@/components/artwork/VectorFace';
import { DrinkName, MOUNT, Mount, MountWindow, NumberPlate, svgStop, TierWord } from '@/components/cabinet';
import { Icon } from '@/components/icons';
import { haptic, PressableScale } from '@/components/ui';
import { colors, fonts, foil, RARITY_META, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { drinkPhoto, drinkPhotoGhost } from '@/data/drinkPhotos';
import type { Drink } from '@/types';

/* ==================================================================== */
/* DexCard                                                              */
/*                                                                      */
/* One cell of the cabinet (spec §7.4). Collecting moves a drink from   */
/* one material to the other, so the two states are different objects: */
/*                                                                      */
/*   COLLECTED  a mount: bone card stock (mat) with the tier's rule     */
/*              printed 4pt inside its edge, seated in the lining with  */
/*              a contact shadow. The face is lit: your pour, else the  */
/*              tungsten-lit catalogue photo, else the lit vector face. */
/*   LOCKED     a slot: a recess pressed into the lining. The face is   */
/*              the 256px ghost of the photo, else the debossed vector  */
/*              glass in the drink's own hue.                           */
/*                                                                      */
/* The label sits at the TOP, above the window, so a row half hidden    */
/* under the floating tab bar still names both of its drinks. The name  */
/* is never clipped: DrinkName shrinks only a word too wide for the     */
/* column, and the card grows with the name. A Dex row stretches both   */
/* cards to the taller, and the window takes the extra height, so the   */
/* two windows always end on one line.                                  */
/*                                                                      */
/* Never a user photo or a lit photo on a locked card: a lit face on a  */
/* slot reads as collected.                                             */
/* ==================================================================== */

/** Window height as a share of the card's width (139pt on a 440pt phone). */
const WINDOW_ASPECT = 0.7;
/**
 * The grid mount's content column: the card less its 1pt edges and the
 * mount's padding (the 4pt rule inset, the rule, then 12pt of mat), which
 * is cardWidth - 38. The name's measure and the window's width are both it.
 */
const GRID_INSET = 2 * (stroke.edge + MOUNT.grid.padding);
/** Dynamic Type cap for everything on the card (spec §6.5). */
const CAP = 1.3;

/** A locked card's name: Inter, so Playfair stays the mark of a drink you have. */
const LOCKED_NAME: TextStyle = { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20 };

/*
 * Every face here sits in a MountWindow, whose height is a minimum: a Dex
 * window grows when its row stretches, so each face is given FACE_FILL and
 * filled to the new foot rather than left with a band under the picture.
 * Re-exported for DrinkFace callers with a frame that can grow.
 */
export { FACE_FILL };

/* ==================================================================== */
/* FoilSweep                                                            */
/* ==================================================================== */

/**
 * The foil pass on a collected legendary.
 *
 * One pass when it mounts, then it rests off the card's right edge: a
 * loop was the only perpetual motion in a 2,089-cell grid, and a sweep
 * that ends lets the card sit still like every other one. Off under
 * Reduce Motion, here rather than at each caller, so no caller can forget.
 * If Reanimated stalls, the band never leaves its start, which is also
 * off the card (x = -1): nothing is ever left half across the picture.
 *
 * `once={false}` keeps the old loop for a surface that wants it; none does.
 */
export function FoilSweep({ width, once = true }: { width: number; once?: boolean }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(-1);

  useEffect(() => {
    if (reduced) return;
    const pass = withTiming(1, { duration: once ? 1400 : 2600, easing: Easing.inOut(Easing.quad) });
    x.set(once ? pass : withRepeat(pass, -1, false));
  }, [x, once, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * width * 1.6 }, { rotate: '18deg' }],
  }));

  if (reduced) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.foil, { width: width * 0.5 }, style]}>
      {/* Sized by attribute too: VectorFace says why. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {/*
            Through svgStop: native gradients drop an rgba stop's alpha, so
            the foil's clear edges and 0.62 peak painted as one solid bar.
          */}
          <LinearGradient id="dexFoil" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" {...svgStop(foil.edge)} />
            <Stop offset="0.5" {...svgStop(foil.peak)} />
            <Stop offset="1" {...svgStop(foil.edge)} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dexFoil)" />
      </Svg>
    </Animated.View>
  );
}

/* ==================================================================== */
/* DrinkFace                                                            */
/* ==================================================================== */

export interface DrinkFaceProps {
  drink: Drink;
  /** `lit` for a drink you have (or are identifying); `ghost` for one you have not. */
  mode: 'lit' | 'ghost';
  /** Your pour. Lit only: a ghost face never shows a person's photo. */
  photoUri?: string | null;
  /**
   * The pour's storage path, when `photoUri` is a signed URL. Signed URLs
   * carry a fresh token each time they are minted, so keyed on the URL a
   * profile's Dex tab downloaded every photo again each session.
   */
  photoCacheKey?: string | null;
  /** The frame in points; sizes the vector glass when there is no photo. */
  width: number;
  height: number;
  /** Passed to VectorFace (DrinkArt's size as a share of the height). */
  artScale?: number;
  /**
   * For a frame that can grow past `height`: pass FACE_FILL (exported
   * here). StyleSheet.absoluteFill keeps `width` x `height` and does not grow.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * The picture of a drink, wherever one is framed.
 *
 *   lit    your pour, else the lit catalogue photo, else VectorFace lit
 *   ghost  the 256px ghost photo, else VectorFace deboss
 *
 * A null `photoUri` (a logged photo that went missing) falls through to
 * the catalogue rather than leaving an empty frame.
 *
 * Disk, not memory-disk: expo-image's memory tier holds the FULL decoded
 * bitmap (4 MB for a 1024px lit photo, 12 MB for a 2048px pour), so every
 * card scrolled past stayed resident in the one pool the feed and avatars
 * share. These files are on the phone already; a disk hit costs one
 * off-main-thread decode when a cell mounts and nothing once it leaves.
 * enforceEarlyResizing decodes at the frame's size, not the file's.
 */
export const DrinkFace = React.memo(function DrinkFace({
  drink,
  mode,
  photoUri,
  photoCacheKey,
  width,
  height,
  artScale,
  style,
}: DrinkFaceProps) {
  const source =
    mode === 'lit'
      ? photoUri
        ? { uri: photoUri, cacheKey: photoCacheKey ?? undefined }
        : drinkPhoto(drink.id)
      : drinkPhotoGhost(drink.id);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.face, { width, height }, style]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={140}
          accessible={false}
          cachePolicy="disk"
          enforceEarlyResizing
        />
      ) : (
        <VectorFace
          drink={drink}
          mode={mode === 'lit' ? 'lit' : 'deboss'}
          width={width}
          height={height}
          artScale={artScale}
          style={FACE_FILL}
        />
      )}
    </View>
  );
});

/* ==================================================================== */
/* DexCard                                                              */
/* ==================================================================== */

export interface DexCardProps {
  drink: Drink;
  /** Ignored since v3 (the window sizes from `cardWidth`). Kept so callers compile. */
  artSize?: number;
  /**
   * Width of the card itself: the exact column width, unrounded.
   *
   * Explicit rather than `flex: 1`, because a list lays each row out as a
   * plain flex row, so a card alone in the last row (every odd-length
   * search result) stretched to the whole row. A fixed width keeps it a
   * cell, left-aligned like the rest.
   */
  cardWidth: number;
  collected: boolean;
  /** The user's own pour photo, once they have logged one. */
  userPhotoUri?: string | null;
  /** Its storage path when userPhotoUri is a signed URL (see DrinkFace). */
  userPhotoCacheKey?: string | null;
  /**
   * Whether the card sits in the lining (the Dex tray, a profile's Dex
   * tab): a collected mount is seated with a contact shadow and a dark
   * edge. On paper it lies flat with a `line` edge. Default true.
   */
  onLining?: boolean;
  onPress: (id: string) => void;
}

export const DexCard = React.memo(function DexCard({
  drink,
  cardWidth,
  collected,
  userPhotoUri,
  userPhotoCacheKey,
  onLining = true,
  onPress,
}: DexCardProps) {
  const rarity = RARITY_META[drink.rarity];
  const legendary = collected && drink.rarity === 'legendary';

  const column = cardWidth - GRID_INSET;
  const windowH = Math.round(cardWidth * WINDOW_ASPECT);

  return (
    <PressableScale
      /*
       * No tick on touch-down, and a short delay before the press state.
       * The tray is wall-to-wall cards, so nearly every flick starts on
       * one, and PressableScale's default answers onPressIn, before the
       * list has claimed the gesture: every scroll buzzed the phone and
       * pulsed the card under the thumb. A flick leaves the slop inside
       * 120ms and cancels the touch before either fires; a tap still
       * lands, and ticks on release.
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
      style={[styles.card, { width: cardWidth }]}>
      <Mount
        state={collected ? 'mounted' : 'slot'}
        tier={drink.rarity}
        size="grid"
        onLining={onLining}
        style={styles.mount}>
        {/* ---- Label, at the top ---- */}
        <DrinkName
          name={drink.name}
          role={collected ? textRole.cardName : LOCKED_NAME}
          measure={column}
          cap={CAP}
          color={collected ? colors.text : colors.onLiningMuted}
        />
        {/*
          The plate and the tier wrap as a pair when the column is narrow (a
          375pt phone, large text); the lock keeps its corner on the first
          line rather than dropping onto a line of its own.
        */}
        <View style={styles.plates}>
          <View style={styles.plateGroup}>
            <NumberPlate n={drink.dexNumber} tone={collected ? 'mat' : 'slot'} />
            <TierWord rarity={drink.rarity} tone={collected ? 'paper' : 'lining'} />
          </View>
          {collected ? null : (
            <View style={styles.lock}>
              <Icon name="lock" size={14} color={colors.onLiningFaint} />
            </View>
          )}
        </View>

        {/* ---- Window ---- */}
        {/*
          The window takes whatever height the row's stretch adds (its height
          is a minimum), so the windows in a row end on one line.
        */}
        <View style={styles.windowSlot}>
          <MountWindow height={windowH} state={collected ? 'mounted' : 'slot'}>
            <DrinkFace
              drink={drink}
              mode={collected ? 'lit' : 'ghost'}
              photoUri={collected ? userPhotoUri : null}
              photoCacheKey={collected ? userPhotoCacheKey : null}
              width={column}
              height={windowH}
              style={FACE_FILL}
            />
            {/* Last, so it paints over the picture; the window clips it. */}
            {legendary ? <FoilSweep width={column} /> : null}
          </MountWindow>
        </View>
      </Mount>
    </PressableScale>
  );
});

/* ==================================================================== */
/* DexThumb                                                             */
/* ==================================================================== */

const THUMB = {
  row: { width: 44, height: 56 },
  mini: { width: 44, height: 58 },
} as const;

/**
 * A mounted thumbnail for a row of drinks (Log, My Bar, Activity, Stats).
 * Always lit: a row of drinks is somewhere you identify one, collected or
 * not. `mini` is the one seated in the lining (the collect preview), so
 * it carries the seat; `row` lies on paper.
 *
 * Hidden from VoiceOver: the row it sits in says the drink's name.
 */
export const DexThumb = React.memo(function DexThumb({
  drink,
  photoUri,
  size = 'row',
}: {
  drink: Drink;
  photoUri?: string | null;
  size?: 'row' | 'mini';
}) {
  const dims = THUMB[size];
  const inner = MOUNT.thumb.padding + stroke.edge;
  const w = dims.width - 2 * inner;
  const h = dims.height - 2 * inner;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Mount
        state="mounted"
        tier={drink.rarity}
        size="thumb"
        onLining={size === 'mini'}
        style={dims}>
        <MountWindow height={h} state="mounted">
          <DrinkFace drink={drink} mode="lit" photoUri={photoUri} width={w} height={h} style={FACE_FILL} />
        </MountWindow>
      </Mount>
    </View>
  );
});

/* ==================================================================== */
/* EmptyArt                                                             */
/* ==================================================================== */

const FEATURE = { width: 120, height: 150 } as const;

/**
 * The picture an EmptyState draws above its title (spec §7.1.5): one real
 * catalogue drink in a 120x150 feature mount. `lit` is a mount, `ghost` a
 * slot, the same two objects the Dex is made of, so an empty screen shows
 * what filling it looks like. Seated only on lining.
 *
 * A plain node the caller passes as `art`, never a registry ui.tsx reads:
 * ui.tsx must not import this file (this file imports ui.tsx). Null for an
 * unknown id, so a renamed drink drops the art instead of crashing the
 * screen. Decorative: the EmptyState's own text says everything.
 */
export function EmptyArt({
  drinkId,
  mode = 'lit',
  onLining = false,
}: {
  drinkId: string;
  mode?: 'lit' | 'ghost';
  onLining?: boolean;
}) {
  const drink = getDrink(drinkId);
  if (!drink) return null;

  const state = mode === 'lit' ? 'mounted' : 'slot';
  const inner = MOUNT.feature.padding + stroke.edge;
  const w = FEATURE.width - 2 * inner;
  const h = FEATURE.height - 2 * inner;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Mount
        state={state}
        tier={drink.rarity}
        size="feature"
        onLining={onLining}
        style={styles.feature}>
        <MountWindow height={h} state={state}>
          <DrinkFace drink={drink} mode={mode} width={w} height={h} style={FACE_FILL} />
        </MountWindow>
      </Mount>
    </View>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  /* Width comes from the `cardWidth` prop (see DexCardProps); height from the content. */
  card: {},
  /* Fills the card when the row stretches it to its taller neighbour. */
  mount: { flexGrow: 1 },
  plates: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
  plateGroup: {
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 4,
  },
  /* As tall as the plate, so the glyph centres on the first line. */
  lock: { marginLeft: 'auto', paddingLeft: 6, minHeight: 20, justifyContent: 'center' },
  windowSlot: { flexGrow: 1, marginTop: 10 },

  /* The picture's ground while it decodes: the colour a lit photo settles to. */
  face: { overflow: 'hidden', backgroundColor: colors.liningDeep },

  foil: {
    position: 'absolute',
    top: '-30%',
    bottom: '-30%',
    left: 0,
  },

  feature: FEATURE,
});

export default DexCard;
