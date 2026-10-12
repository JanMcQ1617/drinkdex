import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { colors, layout, radius, space, textRole } from '@/constants/theme';
import { type Ingredient, type Shelf, SHELF_EXAMPLE, SHELF_LABEL } from '@/lib/bar';

import { things } from './model';

/* ==================================================================== */
/* The shelves                                                          */
/*                                                                      */
/* What you have, as seven shelves always in one order, A to Z inside   */
/* each (shelves spec 3, 4.1, 4.2). Nothing here is ranked, so nothing  */
/* moves: a bottle you add lands in its alphabetical place, which is    */
/* the same place every time, and it lands while a sheet or the add     */
/* field's results cover the shelves.                                   */
/*                                                                      */
/* A bottle taken out on this visit STAYS where it stood, struck and    */
/* muted, reading "Lime · Undo" (the judges' graft: undo in place, no   */
/* toast), and a tap puts it back. The screen clears the struck tiles   */
/* when another tab takes the front.                                    */
/* ==================================================================== */

/** How a tile was struck: one Remove ("Lime · Undo"), or Clear my bar (struck, with one Undo under the shelves). */
export type Struck = 'one' | 'clear';

/** Between one shelf's last tile or line and the next head. */
const SHELF_GAP = 28;
/** Between tiles, both ways. */
const TILE_GAP = space.sm;

export function Shelves({
  shelves,
  struck,
  onOpen,
  onRestore,
  onAdd,
}: {
  /** inventory() of what you own plus what is struck, so a struck tile keeps its place. */
  shelves: readonly { shelf: Shelf; items: readonly Ingredient[] }[];
  /** The struck ids (none of them in your bar). */
  struck: Readonly<Record<string, Struck>>;
  onOpen: (i: Ingredient) => void;
  onRestore: (id: string) => void;
  onAdd: (shelf: Shelf) => void;
}) {
  return (
    <View style={styles.shelves}>
      {shelves.map(({ shelf, items }) => {
        const count = items.filter((i) => !struck[i.id]).length;
        return (
          <View key={shelf}>
            <View style={styles.head}>
              <Text
                accessibilityRole="header"
                accessibilityLabel={`${SHELF_LABEL[shelf]}, ${count ? things(count) : 'empty'}`}
                style={[textRole.bodyStrong, styles.ink, styles.headName]}>
                {SHELF_LABEL[shelf]}
              </Text>
              <Pressable
                onPress={() => onAdd(shelf)}
                hitSlop={{ top: 10, bottom: 10, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Add to ${SHELF_LABEL[shelf]}`}
                style={({ pressed }) => [styles.add, pressed && styles.addPressed]}>
                <Icon name="plus" size={16} color={colors.textMuted} />
                <Text style={[textRole.body, styles.muted]}>Add</Text>
              </Pressable>
            </View>
            {items.length ? (
              <View style={styles.tiles}>
                {items.map((i) => (
                  <Tile key={i.id} ingredient={i} struck={struck[i.id]} onOpen={onOpen} onRestore={onRestore} />
                ))}
              </View>
            ) : (
              <Text style={[textRole.small, styles.muted, styles.example]}>{SHELF_EXAMPLE[shelf]}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * One bottle: a wash tile with its label (one line; a long one ellipsizes,
 * and its sheet shows the whole name). Struck, its label is muted and
 * crossed through, and the tap is the Undo.
 *
 * Put back, it keeps the struck tile's width for the rest of the visit:
 * "Triple sec · Undo" can wrap onto the next line where "Triple sec" did
 * not, and the tile would jump back up from under the finger that undid
 * it. The screen remounts the shelves when another tab takes the front,
 * which lets the width go.
 */
const Tile = React.memo(function Tile({
  ingredient: i,
  struck,
  onOpen,
  onRestore,
}: {
  ingredient: Ingredient;
  struck?: Struck;
  onOpen: (i: Ingredient) => void;
  onRestore: (id: string) => void;
}) {
  const [floor, setFloor] = useState(0);
  if (struck) {
    return (
      <Pressable
        onPress={() => onRestore(i.id)}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > floor) setFloor(w);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${i.label}, removed. Undo`}
        accessibilityHint="Puts it back in your bar"
        style={({ pressed }) => [styles.tile, styles.tileStruck, pressed && styles.tilePressed]}>
        {/* A long label gives way to its ellipsis; "· Undo" never does, so the way back stays readable. */}
        <Text numberOfLines={1} style={[textRole.body, styles.muted, styles.struck, styles.shrink]}>
          {i.label}
        </Text>
        {struck === 'one' ? <Text style={[textRole.body, styles.muted]}>{' · Undo'}</Text> : null}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => onOpen(i)}
      accessibilityRole="button"
      accessibilityLabel={i.label}
      accessibilityHint="Opens details"
      style={({ pressed }) => [styles.tile, floor > 0 && { minWidth: floor }, pressed && styles.tilePressed]}>
      <Text numberOfLines={1} style={[textRole.body, styles.ink]}>
        {i.label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  shelves: { paddingHorizontal: layout.gutter, gap: SHELF_GAP },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headName: { flex: 1 },
  add: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  addPressed: { opacity: 0.5 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  example: { marginTop: space.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, marginTop: space.md },
  tile: {
    minHeight: layout.search,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
  },
  tileStruck: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  tilePressed: { backgroundColor: colors.press },
  shrink: { flexShrink: 1 },
  struck: { textDecorationLine: 'line-through', textDecorationColor: colors.textMuted },
});
