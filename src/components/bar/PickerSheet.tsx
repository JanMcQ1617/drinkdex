import React, { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBarTextButton } from '@/components/ScreenTopBar';
import { SheetGrabber } from '@/components/Sheet';
import { SearchField } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  type BarResult,
  FAMILY_LABEL,
  gainOf,
  type Ingredient,
  searchIngredients,
  type Shelf,
  SHELF_LABEL,
  shelfList,
} from '@/lib/bar';

import { IngredientRow, ListHead } from './controls';
import { rowNote } from './model';

/* ==================================================================== */
/* A shelf's picker                                                     */
/*                                                                      */
/* "+ Add" on a shelf (shelves spec 5.2 with Jan's "fewest steps"):     */
/* every bottle that lives there, in a fixed order taken from the data  */
/* (how many recipes name it), Spirits grouped by family. A tap on a    */
/* row adds or removes it AT ONCE: the box fills where it stands, every */
/* "+N" recomputes, and no row moves. There is nothing to confirm, so   */
/* the sheet just swipes away; Done stays for whoever looks for one.    */
/* The foot says what the bar makes now, live.                          */
/*                                                                      */
/* The field searches every shelf, because nobody should have to know  */
/* where a bottle lives first; a hit from another shelf says so.        */
/* ==================================================================== */

type PickRow =
  | { kind: 'head'; key: string; label: string }
  | { kind: 'row'; key: string; ingredient: Ingredient; alias?: string };

/** A shelf's rows at rest: its fixed order, with each family's head on Spirits. Worked out once per shelf. */
const restRows = new Map<Shelf, PickRow[]>();
function rowsAtRest(shelf: Shelf): PickRow[] {
  let rows = restRows.get(shelf);
  if (!rows) {
    rows = shelfList(shelf).flatMap((g) => [
      ...(g.family ? [{ kind: 'head' as const, key: `head-${g.family}`, label: FAMILY_LABEL[g.family] }] : []),
      ...g.items.map((ingredient) => ({ kind: 'row' as const, key: ingredient.id, ingredient })),
    ]);
    restRows.set(shelf, rows);
  }
  return rows;
}

export function PickerSheet({
  shelf,
  owned,
  result,
  onToggle,
  onClose,
}: {
  /** The shelf whose "+ Add" opened it; null when closed. */
  shelf: Shelf | null;
  owned: Record<string, true>;
  result: BarResult;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  /*
   * The last shelf shown, so the sheet keeps its rows while UIKit slides
   * it away after `shelf` has gone back to null.
   */
  const [shown, setShown] = useState<Shelf>(shelf ?? 'spirits');
  if (shelf && shelf !== shown) setShown(shelf);

  /*
   * No allowSwipeDismissal, as MusicPicker: a swipe down asks
   * (onRequestClose) and the sheet leaves when `shelf` goes null, so Done
   * and the swipe take one path. Every tick is already in the bar.
   */
  return (
    <Modal visible={shelf !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Body shelf={shown} owned={owned} result={result} onToggle={onToggle} onClose={onClose} />
    </Modal>
  );
}

function Body({
  shelf,
  owned,
  result,
  onToggle,
  onClose,
}: {
  shelf: Shelf;
  owned: Record<string, true>;
  result: BarResult;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  /*
   * The page sheet's offset from the top of the window, for the keyboard
   * (MusicPicker and add-drink do the same): KeyboardAvoidingView compares
   * a sheet-relative frame with the keyboard's window position, so without
   * it the foot would stay under the keyboard by the gap above the sheet.
   */
  const { height: windowH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(windowH);

  const searching = query.trim().length > 0;
  const rows: PickRow[] = searching
    ? searchIngredients(query).map(({ ingredient, alias }) => ({ kind: 'row', key: ingredient.id, ingredient, alias }))
    : rowsAtRest(shelf);
  const total = result.makeable.length;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheetH : 0}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        setSheetH((prev) => (prev === h ? prev : h));
      }}>
      <SheetGrabber />
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
          {SHELF_LABEL[shelf]}
        </Text>
        <TopBarTextButton label="Done" onPress={onClose} />
      </View>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search all ingredients"
        accessibilityLabel="Search all ingredients"
        style={styles.field}
      />
      <FlatList
        data={rows}
        extraData={owned}
        keyExtractor={(r) => r.key}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        // A tick while the keyboard is up lands first time; a drag puts the keyboard away.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        ListEmptyComponent={
          searching ? (
            <Text style={[textRole.body, styles.muted, styles.none]}>
              Nothing called “{query.trim()}”. Try a kind, like rum or citrus.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'head') return <ListHead label={item.label} />;
          const i = item.ingredient;
          const on = !!owned[i.id];
          return (
            <IngredientRow
              ingredient={i}
              on={on}
              gain={on ? 0 : gainOf(result, i.id)}
              note={rowNote(i, owned, { alias: item.alias, pickerShelf: searching ? shelf : undefined })}
              mark="box"
              onToggle={onToggle}
            />
          );
        }}
      />
      <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <Text
          accessibilityLabel={total ? `You can make ${formatCount(total)}` : 'Nothing to make yet'}
          style={[textRole.bodyStrong, styles.ink]}>
          {total ? `You can make ${formatCount(total)}` : 'Nothing to make yet'}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: layout.gutter,
    paddingRight: space.xs,
  },
  title: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  field: { marginHorizontal: layout.gutter, marginTop: space.sm, marginBottom: space.sm },
  list: { flex: 1 },
  listContent: { paddingBottom: space.lg },
  none: { paddingHorizontal: layout.gutter, paddingTop: space.lg },
  foot: { paddingHorizontal: layout.gutter, paddingTop: space.md, backgroundColor: colors.bg },
});
