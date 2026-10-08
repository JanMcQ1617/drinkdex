import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, onMedia, radius, stroke, textRole } from '@/constants/theme';
import { formatDexNumber } from '@/data';
import { textWidth } from '@/lib/textFit';

/* ==================================================================== */
/* The engraved number plate (Brass D1, D2)                             */
/*                                                                      */
/* Wherever a Dex number appears it is a small brass plate: "Nº 0127"   */
/* engraved in `text` on `brassPlate`, a 1pt lit top and a 1pt shaded   */
/* foot. A drink not yet caught gets an EMPTY HOLDER instead: the       */
/* plate's box with no metal in it, its number in brassOnDark. Caught = */
/* polished brass, not yet = an empty holder; the words a card speaks   */
/* say the same thing, so the state never rests on the metal alone.     */
/*                                                                      */
/* SOLID, SO IT READS OVER ANYTHING. Its skin is onMedia.plaque.brass,  */
/* the audited plate check-contrast measures (6.79:1 against the plate, */
/* never against the picture), so the same plate is right on a mat, on  */
/* paper and over a photo.                                              */
/*                                                                      */
/* NO SHADOW. The mock drew a 1.5pt contact shadow; plates sit in the   */
/* Dex's scrolling cells, so the 1pt brassShade foot is the contact     */
/* line instead (theme.ts `elevation` says why).                        */
/*                                                                      */
/* Decorative to VoiceOver: the card, row or nameplate that holds it    */
/* says "number 127" in its own label.                                  */
/* ==================================================================== */

export type PlateSize = 'sm' | 'lg';

/**
 * "Nº 0127". N and U+00BA, the masculine ordinal, which the Inter latin
 * subset carries; U+2116 (the numero sign) is not in it and check-design
 * rule 16 fails one. The digits are formatDexNumber's, so the padding
 * follows the catalogue.
 */
export function formatPlateNumber(n: number): string {
  return `Nº ${formatDexNumber(n).slice(1)}`;
}

/*
 * Heights are minimums: the frame grows with the text up to the 1.3 cap.
 * sm is 20 (the mock's 18): the cabinet's NumberPlate was 20, and
 * TastePicker and the Dex card lay out their plate rows to it.
 * lg is 24, one row with the media plaques beside it on a photo.
 */
const PLATE = {
  sm: { minHeight: 20, pad: 6, role: textRole.plate },
  lg: { minHeight: 24, pad: 13, role: textRole.plateLg },
} as const;
/** Plates sit in fixed rows, so their text grows only so far (spec section 4). */
export const PLATE_CAP = 1.3;
const SCREW = 4;
const SCREW_INSET = 4;

/**
 * The width a plate takes at this text size, worked out rather than
 * measured (textFit errs wide), so a row can keep a neighbour clear of it
 * from the first frame (the feed's status tag sits right after it).
 */
export function plateWidth(text: string, size: PlateSize, fontScale: number): number {
  const p = PLATE[size];
  const s = Math.min(fontScale, PLATE_CAP);
  const tracking = (p.role.letterSpacing ?? 0) * s * text.length;
  return 2 * p.pad + textWidth(text, 'inter', p.role.fontSize * s) + tracking + 2 * stroke.edge;
}

/** A screw head: a 4pt brassShade dot with a 1.5pt lit spot top left. Round: a dot. */
function Screw({ side }: { side: 'left' | 'right' }) {
  return (
    <View style={[styles.screw, side === 'left' ? styles.screwLeft : styles.screwRight]}>
      <View style={styles.screwLit} />
    </View>
  );
}

/**
 * A Dex number on its plate.
 *
 * `tone="brass"` (default): caught, or framed (a post, a tile).
 * `tone="holder"`: not caught yet, in a slot or a search result.
 * `label` replaces the number for a plate that engraves a tally ("12
 * ticked"); `n` is ignored then.
 * `size="lg"` (nameplate, sheet header, tally) adds two screws.
 */
export const BrassPlate = React.memo(function BrassPlate({
  n,
  label,
  size = 'sm',
  tone = 'brass',
}: {
  n?: number;
  label?: string;
  size?: PlateSize;
  tone?: 'brass' | 'holder';
}) {
  const p = PLATE[size];
  const holder = tone === 'holder';
  const text = label ?? (n != null ? formatPlateNumber(n) : '');
  const screws = size === 'lg' && !holder;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.plate,
        { minHeight: p.minHeight, paddingHorizontal: p.pad },
        holder ? styles.holder : styles.brass,
      ]}>
      {screws ? <Screw side="left" /> : null}
      <Text
        accessible={false}
        maxFontSizeMultiplier={PLATE_CAP}
        style={[p.role, holder ? styles.holderText : styles.engraved]}>
        {text}
      </Text>
      {screws ? <Screw side="right" /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  plate: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    // The mock's 2pt: a plate is a cut piece of metal, tighter than a badge's 4.
    borderRadius: 2,
  },
  brass: {
    backgroundColor: onMedia.plaque.brass.fill,
    borderTopWidth: stroke.edge,
    borderTopColor: onMedia.plaque.brass.lit,
    borderBottomWidth: stroke.edge,
    borderBottomColor: onMedia.plaque.brass.edge,
  },
  holder: { borderWidth: stroke.edge, borderColor: colors.plateHolderEdge },
  /* The engraving: ink with a 1pt lit lower edge, as a cut in metal catches the light. */
  engraved: {
    color: onMedia.plaque.brass.ink,
    textShadowColor: onMedia.plaque.brass.lit,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  holderText: { color: colors.brassOnDark },
  screw: {
    position: 'absolute',
    top: '50%',
    marginTop: -SCREW / 2,
    width: SCREW,
    height: SCREW,
    // round-ok: dot (a screw head)
    borderRadius: radius.round,
    backgroundColor: colors.brassShade,
  },
  screwLeft: { left: SCREW_INSET },
  screwRight: { right: SCREW_INSET },
  screwLit: {
    width: 1.5,
    height: 1.5,
    // round-ok: dot
    borderRadius: radius.round,
    backgroundColor: colors.brassLit,
  },
});
