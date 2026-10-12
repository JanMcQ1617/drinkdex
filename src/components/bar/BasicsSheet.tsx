import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icons';
import { BottomSheet } from '@/components/Sheet';
import { Button } from '@/components/ui';
import { colors, layout, radius, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { BASICS, INGREDIENTS_BY_ID, matchBar } from '@/lib/bar';

import { drinks } from './model';

/* ==================================================================== */
/* Start with the basics                                                */
/*                                                                      */
/* The empty bar's one key (v4-changes 6.2, Jan's "fewest steps"): the  */
/* fourteen basics in shelf order, ALL TICKED, "Untick what you don't   */
/* have", and Add. Owning all fourteen is two taps (Start, Add); owning */
/* ten is six. Nothing goes in until Add, so a swipe down adds nothing, */
/* and the foot says what the ticked ones make, live, before you add.   */
/* ==================================================================== */

/** Above this text size the tiles go one to a row (the old picker's TWO_UP_MAX_SCALE). */
const TWO_UP_MAX_SCALE = 1.3;
/** A tile: 52 tall (layout.control), 12 between the two columns, a 64 pitch. A long label wraps and the row grows. */
const TILE_GAP = space.md;
/** The unticked tile's box: 20 square, 1.5pt of the control grey. */
const BOX = 20;
const BOX_EDGE = 1.5;

export function BasicsSheet({
  visible,
  onAdd,
  onClose,
}: {
  visible: boolean;
  /** The ticked ids, in shelf order. The caller adds them and closes the sheet. */
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Body onAdd={onAdd} />
    </BottomSheet>
  );
}

/** Mounted with each opening, so every opening starts with all fourteen ticked. */
function Body({ onAdd }: { onAdd: (ids: string[]) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(BASICS));
  const ids = BASICS.filter((id) => ticked.has(id) && INGREDIENTS_BY_ID[id]);
  const makes = matchBar(new Set(ids)).makeable.length;
  const twoUp = fontScale <= TWO_UP_MAX_SCALE;
  const tileW = twoUp ? (width - 2 * layout.gutter - TILE_GAP) / 2 : width - 2 * layout.gutter;

  const toggle = (id: string) =>
    setTicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink]}>
        The basics
      </Text>
      <Text style={[textRole.small, styles.muted]}>{"Untick what you don't have"}</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.tiles} showsVerticalScrollIndicator={false}>
        {BASICS.map((id) => {
          const i = INGREDIENTS_BY_ID[id];
          if (!i) return null;
          const on = ticked.has(id);
          return (
            <Pressable
              key={id}
              onPress={() => toggle(id)}
              accessibilityRole="button"
              accessibilityLabel={i.label}
              accessibilityState={{ selected: on }}
              accessibilityHint={on ? 'Unticks it' : 'Ticks it'}
              style={({ pressed }) => [
                styles.tile,
                { width: tileW },
                on ? styles.tileOn : styles.tileOff,
                pressed && (on ? styles.tileOnPressed : styles.tileOffPressed),
              ]}>
              <Text style={[textRole.body, styles.label, { color: on ? colors.onInk : colors.text }]}>
                {i.label}
              </Text>
              {on ? <Icon name="check" size={20} color={colors.onInk} /> : <View style={styles.box} />}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.foot}>
        <Text style={[textRole.bodyStrong, styles.ink, styles.makes]}>
          {ids.length ? `Makes ${drinks(makes)}` : 'Tick what you have'}
        </Text>
        <Button
          label={ids.length ? `Add ${formatCount(ids.length)}` : 'Add'}
          onPress={() => onAdd(ids)}
          // Nothing ticked: the wash key, faded and still announced (shelves spec 5.1).
          variant={ids.length ? 'primary' : 'secondary'}
          disabled={!ids.length}
          accessibilityHint={ids.length ? `Puts them in your bar. Makes ${drinks(makes)}` : undefined}
          style={styles.add}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  scroll: { flexGrow: 0, marginTop: space.xl },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  tile: {
    minHeight: layout.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.control,
  },
  tileOn: { backgroundColor: colors.text },
  tileOnPressed: { backgroundColor: colors.inkPressed },
  tileOff: { backgroundColor: colors.bgSunk },
  tileOffPressed: { backgroundColor: colors.press },
  label: { flex: 1 },
  box: { width: BOX, height: BOX, borderRadius: radius.control, borderWidth: BOX_EDGE, borderColor: colors.lineControl },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.xl },
  makes: { flex: 1 },
  add: { minWidth: 132 },
});
