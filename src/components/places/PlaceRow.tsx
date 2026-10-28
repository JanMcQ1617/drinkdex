import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { announce, haptic } from '@/components/ui';
import { colors, fonts, layout, radius, space, stroke, textRole } from '@/constants/theme';
import type { PlaceRef } from '@/lib/places';

/* ==================================================================== */
/* Add place, on the compose step (specs/v4.8-places 3.1)               */
/*                                                                      */
/* One optional row, Tag people's anatomy exactly (log/TagPeopleRow):   */
/* 56 tall across the column, no fill and no rule, `press` while held.  */
/* Empty, it reads "Add place" with the pin and a chevron, and the      */
/* whole row opens PlaceSearchSheet. Chosen, the same row holds the pin */
/* and the place as a chip, in the poster's own words for it (the label */
/* the "Tag this place" step prefilled from Apple and let them edit,    */
/* spec §0.5): the name reopens the search to change it, and its × takes */
/* it off. No chevron then: the chip is the control.                    */
/*                                                                      */
/* WHY A CHIP AND NOT A LINE. A place is a thing you picked, one of it, */
/* that you may want gone again before posting; a chip with its own ×   */
/* says both at a glance, where "Add place · La Factoría" would hide    */
/* the way out behind a second sheet. It is the white spec's "off"      */
/* chip (page fill, 1pt hair edge), never the ink one: nothing here is  */
/* selected, it is just there. No red, no pen mark (spec 3, the rules). */
/*                                                                      */
/* Offered only where a place can be tagged at all: the module in this  */
/* build and iOS 18 or later (Apple Place IDs), which the routes check  */
/* with placeSearchAvailable() before drawing this row.                 */
/*                                                                      */
/* The place goes with Save & post only, like tags and the song: the    */
/* route reads it in its save and nowhere else (P7).                    */
/* ==================================================================== */

const ROW_H = 56;
const GLYPH = 24;
const CHEVRON = 20;
const CHIP_CLOSE = 16;
/** The chip's name at Archivo 500 13, grown no further than this beside a fixed glyph. */
const CHIP_CAP = 1.4;
/** The × is 16 in a 32 chip: 14 of slop each way takes it to 44. */
const CLOSE_SLOP = (layout.hit - CHIP_CLOSE) / 2;

export function PlaceRow({
  place,
  onAdd,
  onRemove,
  disabled,
}: {
  /** The place picked so far, or nobody's choice yet. */
  place: PlaceRef | null;
  /** Opens PlaceSearchSheet: to add one, or to change the one there. */
  onAdd: () => void;
  onRemove: () => void;
  /** After the save: the row stays, dimmed, so the screen does not jump while the window slides away. */
  disabled?: boolean;
}) {
  if (!place) {
    return (
      <Pressable
        onPress={disabled ? undefined : onAdd}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Add place"
        accessibilityHint="Search for the bar or restaurant where you had it"
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}>
        <Icon name="pin" size={GLYPH} color={colors.text} />
        <Text style={styles.label}>Add place</Text>
        <View style={styles.spacer} />
        <View style={styles.chevron}>
          <Icon name="chevronRight" size={CHEVRON} color={colors.textMuted} />
        </View>
      </Pressable>
    );
  }

  const remove = () => {
    if (disabled) return;
    haptic.select();
    onRemove();
    announce('Place removed');
  };

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      {/* The pin says what the chip is; the chip's own label says it to VoiceOver. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="pin" size={GLYPH} color={colors.text} />
      </View>
      {/*
        The chip hugs its words up to the column, and the name gives way
        with an ellipsis before the × ever does. Two targets in one 32pt
        box: the name (change it) and the × (take it off), so the × keeps a
        44pt target of its own through its slop and never opens the search.
      */}
      <View style={styles.chip}>
        <Pressable
          onPress={disabled ? undefined : onAdd}
          disabled={disabled}
          hitSlop={{ top: 6, bottom: 6, left: space.sm }}
          accessibilityRole="button"
          accessibilityLabel={`Place, ${place.label}`}
          accessibilityHint="Changes the place"
          accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => [styles.chipName, pressed && styles.chipPressed]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={CHIP_CAP} style={styles.chipText}>
            {place.label}
          </Text>
        </Pressable>
        <Pressable
          onPress={remove}
          disabled={disabled}
          hitSlop={CLOSE_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Remove place"
          accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => [styles.chipClose, pressed && styles.chipPressed]}>
          <Icon name="close" size={CHIP_CLOSE} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* 56 across the column: the glyph at 24, the label (or the chip) 12 after it, the chevron ending at 416. */
  row: {
    minHeight: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  pressed: { backgroundColor: colors.press },
  disabled: { opacity: 0.42 },
  label: { ...textRole.bodyMedium, color: colors.text },
  spacer: { flex: 1 },
  /* The chevron ends on the gutter, as Tag people's does (its own 12 gap less 4). */
  chevron: { marginLeft: -space.xs },

  /* The white spec's "off" chip: 32 tall, the control corner, the page's white inside a 1pt hair edge. */
  chip: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: layout.chip,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.hair,
    backgroundColor: colors.bg,
  },
  /* The name 12 in from the chip's edge; the × 8 after it and 8 from the far edge. */
  chipName: {
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  chipText: { ...textRole.small, fontFamily: fonts.bodyMedium, color: colors.text },
  chipClose: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingRight: space.sm,
  },
  /*
   * Held, a part dims rather than fills: a square press fill inside the
   * 4pt corner would poke past the chip's edge, and clipping it would clip
   * the ×'s slop with it.
   */
  chipPressed: { opacity: 0.5 },
});
