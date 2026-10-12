import React from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Icon } from '@/components/icons';
import { colors, layout, space, textRole } from '@/constants/theme';
import { type BarResult, gainOf, searchIngredients, type Shelf, SHELF_LABEL, SHELF_ORDER } from '@/lib/bar';

import { IngredientRow } from './controls';
import { rowNote } from './model';

/* ==================================================================== */
/* The add field's results                                              */
/*                                                                      */
/* Jan's amendment: adding takes the fewest steps there can be. Tap the */
/* field under the payoff key, type, tap + on a result: three taps, no  */
/* Done, and the keyboard stays up for the next one. The results lie    */
/* over the shelves, between the field and the keyboard, so what you    */
/* type is never hidden under the keys (Jan, build 17).                 */
/*                                                                      */
/* Rows never reorder while the field holds the same text: the order    */
/* comes from the words and the data, never from your bar, and a tap    */
/* fills the key where it stands. With nothing typed yet, a quiet line  */
/* teaches that brand names work, over the seven shelves as rows that   */
/* open each shelf's list.                                              */
/* ==================================================================== */

export function AddResults({
  query,
  owned,
  result,
  bottomInset,
  onToggle,
  onOpenShelf,
  onCancel,
  onScroll,
}: {
  query: string;
  owned: Record<string, true>;
  result: BarResult;
  /** The tab bar's clearance, so the last row is not under it with the keyboard down. */
  bottomInset: number;
  onToggle: (id: string) => void;
  onOpenShelf: (shelf: Shelf) => void;
  /** A tap on the page under the rows: put the field away. */
  onCancel: () => void;
  /** For the head's rule: the rows' own offset. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  const words = query.trim();
  const hits = words ? searchIngredients(words) : [];

  return (
    <ScrollView
      style={styles.layer}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      // A + while the keyboard is up lands first time; a drag puts the keyboard away and keeps the rows.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // The keyboard's height comes off the scroll, so the last row can be lifted above it.
      automaticallyAdjustKeyboardInsets
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}>
      {!words ? (
        <>
          <Text style={[textRole.small, styles.muted, styles.hint]}>Brand names work too, like Cointreau</Text>
          {SHELF_ORDER.map((shelf) => (
            <Pressable
              key={shelf}
              onPress={() => onOpenShelf(shelf)}
              accessibilityRole="button"
              accessibilityLabel={SHELF_LABEL[shelf]}
              accessibilityHint="Opens everything on that shelf"
              style={({ pressed }) => [styles.shelf, pressed && styles.pressed]}>
              <Text style={[textRole.body, styles.ink, styles.shelfName]}>{SHELF_LABEL[shelf]}</Text>
              <Icon name="chevronRight" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </>
      ) : hits.length ? (
        hits.map(({ ingredient: i, alias }) => {
          const on = !!owned[i.id];
          return (
            <IngredientRow
              key={i.id}
              ingredient={i}
              on={on}
              gain={on ? 0 : gainOf(result, i.id)}
              note={rowNote(i, owned, { alias })}
              mark="key"
              onToggle={onToggle}
            />
          );
        })
      ) : (
        <Text style={[textRole.body, styles.muted, styles.none]}>
          Nothing called “{words}”. Try a kind, like rum or citrus.
        </Text>
      )}
      {/* The page under the rows: a tap here is "outside", and puts the field away. */}
      <Pressable accessible={false} onPress={onCancel} style={styles.rest}>
        <View />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingTop: space.xs },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  hint: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.sm },
  shelf: {
    minHeight: layout.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
  },
  shelfName: { flex: 1 },
  pressed: { backgroundColor: colors.press },
  none: { paddingHorizontal: layout.gutter, paddingTop: space.lg },
  rest: { flexGrow: 1, minHeight: layout.hit },
});
