import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { whoShort } from '@/lib/tags';
import { colors, space, textRole } from '@/constants/theme';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Tag people, on the compose step (specs/v4.3/spec.md §1.2)            */
/*                                                                      */
/* One row under the caption: the person glyph, "Tag people", who is    */
/* picked so far in muted ("ana and leo", "ana and 2 others"), and a    */
/* chevron. 56 tall across the column with no fill and no rule: space   */
/* parts it from the caption (layout spec principle 3). Pressed, it     */
/* fills `press`, as a ListRow does. It opens TagPeopleSheet; the tags  */
/* go with Post only, like the song.                                    */
/* ==================================================================== */

const ROW_H = 56;
const GLYPH = 24;
const CHEVRON = 20;

export function TagPeopleRow({
  people,
  onPress,
  disabled,
}: {
  /** Who is picked, in pick order. */
  people: UserProfile[];
  onPress: () => void;
  /** After the save: the row stays, dimmed, so the screen does not jump while the window slides away. */
  disabled?: boolean;
}) {
  const who = whoShort(people);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Tag people"
      accessibilityValue={{ text: who || 'nobody yet' }}
      accessibilityHint="Choose people you follow who were with you"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon name="profile" size={GLYPH} color={colors.text} />
      <Text style={styles.label}>Tag people</Text>
      {/* One line, cut with an ellipsis: the whole list is in the picker. */}
      <Text numberOfLines={1} style={styles.who}>
        {who}
      </Text>
      <View style={styles.chevron}>
        <Icon name="chevronRight" size={CHEVRON} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* 56 across the column: the glyph at 24, the label at 60, the chevron ending at 416. */
  row: {
    minHeight: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  pressed: { backgroundColor: colors.press },
  disabled: { opacity: 0.42 },
  label: { ...textRole.bodyMedium, color: colors.text },
  who: { ...textRole.body, flex: 1, textAlign: 'right', color: colors.textMuted },
  /* "who" ends 8 before the chevron (the row's own 12 gap less 4). */
  chevron: { marginLeft: -space.xs },
});
