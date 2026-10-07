import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, VerticalFade } from '@/components/cabinet';
import { Icon, type IconName } from '@/components/icons';
import { dexNumber, fonts, onMedia, radius, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatDexNumber } from '@/data';
import { textWidth } from '@/lib/textFit';
import type { Rarity } from '@/types';

/* ==================================================================== */
/* Over a photograph                                                    */
/*                                                                      */
/* Everything v3 draws on top of a picture: the feed's nameplate, the   */
/* number and status plates, the markers on grid tiles and the scrim    */
/* under a status bar.                                                  */
/*                                                                      */
/* ONE INK, ON A SCRIM OR A SOLID PLAQUE. A photograph can be a blown   */
/* out white tablecloth, so nothing here is drawn in a colour chosen    */
/* for a ground. Text is onMedia.ink, only ever on scrim alpha >= 0.62  */
/* (5.45:1 even over white) or on a solid plaque, because every tinted  */
/* word fails there. This file may reference no `colors.` key, only     */
/* `onMedia` (check-design rule 11), and check-contrast composites each */
/* onMedia text colour over the white worst case.                       */
/*                                                                      */
/* Over Dynamic Type every label here caps at 1.3: they sit on media    */
/* whose size does not grow with the text.                             */
/* ==================================================================== */

/** Height of the clear-to-scrimMid fade above a nameplate's content. */
const NAMEPLATE_FADE = 96;
/** The number plate and the status plaque: one row height. */
const PLAQUE_H = 24;
const MEDIA_CAP = 1.3;
/** A plaque's word: 12pt. */
const PLAQUE_TEXT = 12;
const STATUS_ICON = 13;
const STATUS_GAP = 5;

/* ==================================================================== */
/* Plates and plaques                                                   */
/* ==================================================================== */

/** @deprecated rarity, removed in v3.1: draws nothing; deleted at the close-out. */
export function MediaPlaque(props: { rarity: Rarity; size?: 'sm' | 'md' }): null {
  return null;
}

/**
 * The number plate's media skin: "#0009" in `dexNumber` with onMedia.ink
 * on the marker fill (9.98:1 over a white frame), 24pt, 1pt marker edge.
 * Not its own VoiceOver element: the nameplate (or the pours viewer's
 * footer) says "number 9".
 */
export function MediaNumberPlate({ n }: { n: number }) {
  return (
    <View style={styles.numberPlate}>
      <Text accessible={false} maxFontSizeMultiplier={MEDIA_CAP} style={[dexNumber, styles.numberText]}>
        {formatDexNumber(n)}
      </Text>
    </View>
  );
}

type StatusSkin = { icon: IconName; label: string; strong: boolean };

function statusSkin(inDex: boolean, pressable: boolean): StatusSkin {
  if (inDex) return { icon: 'check', label: 'In your Dex', strong: false };
  return pressable
    ? { icon: 'plus', label: 'New to your Dex', strong: true }
    : { icon: 'lock', label: 'Not in your Dex yet', strong: false };
}

/**
 * The room a status plaque takes on its row, worked out rather than
 * measured (lib/textFit.ts errs wide), so the nameplate can keep its other
 * plates clear of it from the first frame.
 */
function statusPlaqueWidth(inDex: boolean, pressable: boolean, fontScale: number): number {
  const label = statusSkin(inDex, pressable).label;
  const size = PLAQUE_TEXT * Math.min(fontScale, MEDIA_CAP);
  return stroke.edge * 2 + space.sm * 2 + STATUS_ICON + STATUS_GAP + textWidth(label, 'inter', size);
}

/**
 * Whether this drink is in your Dex, on the neutral plaque.
 *
 * With `onPress` (the feed) it is a button: in, a check and "In your Dex";
 * not in, a plus and "New to your Dex" in SemiBold on a 1pt ink edge, the
 * one plaque that asks to be tapped. Spoken "Open <name> in the Dex", with
 * the hint "Not in your Dex yet" when it is not. 24pt with 10pt of hitSlop,
 * so 44 to the finger.
 *
 * Without `onPress` (the drink page's eyebrow) it is a statement: a check
 * and "In your Dex", or a lock and "Not in your Dex yet".
 */
export function DexStatusPlaque({
  inDex,
  name,
  onPress,
}: {
  inDex: boolean;
  name: string;
  onPress?: () => void;
}) {
  const skin = statusSkin(inDex, !!onPress);
  const body = (
    <>
      <Icon name={skin.icon} size={STATUS_ICON} color={onMedia.ink} />
      <Text
        maxFontSizeMultiplier={MEDIA_CAP}
        style={[styles.plaqueText, skin.strong ? styles.plaqueTextStrong : null, { color: onMedia.ink }]}>
        {skin.label}
      </Text>
    </>
  );
  const box = [
    styles.plaque,
    {
      backgroundColor: onMedia.plaque.neutral.fill,
      borderColor: skin.strong ? onMedia.ink : onMedia.plaque.neutral.edge,
    },
  ];

  if (!onPress) return <View style={box}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name} in the Dex`}
      accessibilityHint={inDex ? undefined : 'Not in your Dex yet'}
      style={({ pressed }) => [box, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/**
 * A small marker on a photo: a gallery count ("1/3"), the stack glyph or
 * the reel glyph. 22pt, the marker fill with a 1pt marker edge, onMedia.ink.
 * It speaks through the photo it sits on, so it is hidden from VoiceOver
 * even when it is laid over the photo as a sibling ("1/3" read on its own
 * says nothing).
 *
 * `gilt` is ignored since v3.1 (it drew the legendary sparkle), so a marker
 * given only `gilt` draws nothing; the close-out deletes the prop.
 */
export function MediaMarker({
  icon,
  text,
}: {
  icon?: IconName;
  text?: string;
  /** @deprecated rarity, removed in v3.1: ignored; deleted at the close-out. */
  gilt?: boolean;
}) {
  if (!icon && !text) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.marker}>
      {icon ? <Icon name={icon} size={14} color={onMedia.ink} /> : null}
      {text ? (
        <Text maxFontSizeMultiplier={MEDIA_CAP} style={styles.markerText}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

/** @deprecated rarity, removed in v3.1: draws nothing; deleted at the close-out. */
export function RarityRule(props: { rarity: Rarity }): null {
  return null;
}

/**
 * The scrim under a status bar and a back button over a photo: scrimMid at
 * the top fading to clear over `height` (default 120). Absolute, at the
 * top of the photo's frame.
 */
export function TopScrim({ height = 120 }: { height?: number }) {
  return (
    <VerticalFade
      from={onMedia.scrimMid}
      to={onMedia.scrimClear}
      style={[styles.topScrim, { height }]}
    />
  );
}

/* ==================================================================== */
/* Nameplate                                                            */
/* ==================================================================== */

/**
 * A drink named on its photo: the feed post's label (specs/v3-cabinet.md
 * 7.3). Absolute, along the photo's foot, full width.
 *
 * Bottom up, inside 16pt sides and 18pt below: the meta line ("Fizz ·
 * Highball glass · New Orleans, USA"), the name in Playfair through
 * DrinkName (no line limit; it fits a long word to the line), then the
 * plates: the number, and at the right the status plaque.
 *
 * THE SCRIM NEEDS NO MEASUREMENT. A fixed 96pt fade (clear to scrimMid)
 * sits ABOVE the content, and the content box carries its own scrimMid to
 * scrimDeep gradient as an absolute-fill background, so however tall the
 * name grows (Dynamic Type, three lines) every glyph is on >= 0.62 from
 * the first frame. A single gradient sized to the content would need its
 * height first, and a mid stop placed for one line lands under the name
 * once it wraps.
 *
 * Taps outside its controls fall through to the photo (page turn, double
 * tap to like): the frame is `box-none`, and only the name and the status
 * plaque take a press. For VoiceOver the name, number and meta are one
 * button ("Ramos Gin Fizz, number 9. Fizz, Highball glass, New Orleans,
 * USA"), followed by the status plaque as its own button. The
 * status plaque is drawn absolutely, after that group, so it is read
 * second; the plates row keeps its width clear of it by arithmetic.
 *
 * `inDex` null (signed out, or not known yet) draws no status plaque.
 * `rarity` is ignored since v3.1; the close-out deletes it.
 */
export function Nameplate({
  name,
  number,
  meta,
  inDex,
  onOpen,
}: {
  name: string;
  number: number;
  /** @deprecated rarity, removed in v3.1: ignored; deleted at the close-out. */
  rarity?: Rarity;
  meta: string;
  inDex: boolean | null;
  /** Opens /drink/[id]. */
  onOpen: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  // The meta line's middle dots are for the eye; spoken, they are pauses.
  const spokenMeta = meta.split(/\s*·\s*/).filter(Boolean).join(', ');
  const spoken = `${name}, number ${number}.${spokenMeta ? ` ${spokenMeta}` : ''}`;
  const reserve = inDex === null ? 0 : statusPlaqueWidth(inDex, true, fontScale) + space.sm;

  return (
    <View pointerEvents="box-none" style={styles.nameplate}>
      {/*
        The fade hangs from the body's top edge rather than stacking above it
        in flow, so the two gradients meet on one shared edge at any pixel
        offset (two edges laid out separately can leave a hairline of photo
        between them on a fractional position).
      */}
      <VerticalFade from={onMedia.scrimClear} to={onMedia.scrimMid} style={styles.nameplateFade} />
      <VerticalFade from={onMedia.scrimMid} to={onMedia.scrimDeep} style={StyleSheet.absoluteFill} />
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens it in the Dex"
        onAccessibilityTap={onOpen}
        pointerEvents="box-none">
        <View pointerEvents="none" style={[styles.plates, { paddingRight: reserve }]}>
          <MediaNumberPlate n={number} />
        </View>
        <Pressable onPress={onOpen} hitSlop={8} style={styles.nameTap}>
          <DrinkName
            name={name}
            role={textRole.nameplate}
            measure={width - space.lg * 2}
            cap={MEDIA_CAP}
            color={onMedia.ink}
            style={styles.nameShadow}
          />
        </Pressable>
        {meta ? (
          // Wrapped so a tap on the words still reaches the photo beneath.
          <View pointerEvents="none">
            <Text maxFontSizeMultiplier={MEDIA_CAP} style={styles.meta}>
              {meta}
            </Text>
          </View>
        ) : null}
      </View>
      {inDex !== null ? (
        <View pointerEvents="box-none" style={styles.statusSlot}>
          <DexStatusPlaque inDex={inDex} name={name} onPress={onOpen} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Plaques and plates */
  plaque: {
    minHeight: PLAQUE_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: STATUS_GAP,
    paddingHorizontal: space.sm,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
  },
  plaqueText: { fontFamily: fonts.bodyMedium, fontSize: PLAQUE_TEXT, lineHeight: 16 },
  plaqueTextStrong: { fontFamily: fonts.bodySemiBold },
  pressed: { opacity: 0.8 },
  numberPlate: {
    minHeight: PLAQUE_H,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: onMedia.markerEdge,
    backgroundColor: onMedia.markerFill,
  },
  numberText: { color: onMedia.ink },

  /* Marker */
  marker: {
    minWidth: 22,
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 4,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: onMedia.markerEdge,
    backgroundColor: onMedia.markerFill,
  },
  markerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    color: onMedia.ink,
    ...tabular,
  },

  topScrim: { position: 'absolute', left: 0, right: 0, top: 0 },

  /* Nameplate */
  nameplate: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingBottom: 18 },
  nameplateFade: { position: 'absolute', left: 0, right: 0, top: -NAMEPLATE_FADE, height: NAMEPLATE_FADE },
  plates: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  statusSlot: { position: 'absolute', top: 0, right: space.lg },
  nameTap: { alignSelf: 'flex-start', marginTop: 10 },
  nameShadow: {
    textShadowColor: onMedia.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
    color: onMedia.ink,
    textShadowColor: onMedia.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
