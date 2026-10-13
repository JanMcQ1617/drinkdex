import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { BottomSheet } from '@/components/Sheet';
import { announce, Button, haptic, Notice } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { COLLECTION_ITEMS_MAX, type Collection, contentsSpoken, holds, nameOk } from '@/lib/collections';
import { refOf, type SavedThing, useCollections } from '@/store/collections';

import { Box } from './Box';
import { Cover, type CoverPiece, ThingPrint } from './Cover';
import { NameField } from './NameField';

/* ==================================================================== */
/* Save to collection (spec §4.3, §4.4; frames `sheet`, `new`)          */
/*                                                                      */
/* The thing is already in All saved when this opens (the bar's key, or */
/* a held bookmark, saved it first). Two pages in one short sheet:      */
/*                                                                      */
/*   LIST  "Save to collection", the line that says what was saved      */
/*         ("maya.pours's post is in All saved": a post's names its     */
/*         author, so it never reads as the drink being saved), New     */
/*         collection, then every collection, the one saved to last     */
/*         first, each a 64pt row with its cover and a box. A tap puts  */
/*         the thing in or takes it out AT ONCE (the store is           */
/*         optimistic), with the selection tick; a failure unticks it   */
/*         and says so. At 200 the row says "Full: 200 items" and does  */
/*         not tick. Done closes, as the scrim and a swipe do.          */
/*   NEW   the thing as a 120pt cover, the name, the privacy line and   */
/*         Create, which makes the collection with the thing in it and  */
/*         turns back to the list, ticked.                              */
/*                                                                      */
/* A plain component, not a route: the host draws one over the whole    */
/* app, and a bookmark inside a full-screen Modal (the first picks in   */
/* Settings' Your tastes) draws its own, since a Modal only presents    */
/* over the Modal it is inside.                                         */
/* ==================================================================== */

/** The list scrolls past about six rows, so the sheet stops at its medium height. */
const ROWS_VISIBLE = 6;
const ROW = layout.rowTall;
const THUMB = 48;
const NEW_COVER = 120;

/** What the thing is, said on the list page's second line. */
function savedLine(thing: SavedThing): string {
  if (thing.kind === 'post') return `${thing.author}'s post is in All saved`;
  return `${getDrink(thing.id)?.name ?? 'This drink'} is in All saved`;
}

export const pieceOf = (thing: SavedThing): CoverPiece =>
  thing.kind === 'drink'
    ? { kind: 'drink', drinkId: thing.id, photoPath: null }
    : { kind: 'post', drinkId: thing.drinkId, photoPath: thing.photoPath };

/** The keyboard's height while it is up, so the name page's key stays above it. */
function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}

export function SaveSheet({
  thing,
  visible,
  onClose,
}: {
  /** What was saved. Kept by the caller through the close, so the sheet fades out showing it. */
  thing: SavedThing | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [page, setPage] = useState<'list' | 'new'>('list');
  const [failed, setFailed] = useState<string | null>(null);

  // Each opening starts on the list, with no old failure showing.
  const [openedFor, setOpenedFor] = useState<SavedThing | null>(null);
  if (visible && thing !== openedFor) {
    setOpenedFor(thing);
    setPage('list');
    setFailed(null);
  }

  if (!thing) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {page === 'list' ? (
        <ListPage thing={thing} failed={failed} onFailed={setFailed} onNew={() => setPage('new')} onDone={onClose} />
      ) : (
        <NewPage
          thing={thing}
          onBack={() => setPage('list')}
          onMade={(made) => {
            setPage('list');
            /*
             * The store makes the collection even when its first thing will
             * not go in (the row then shows unticked), so this says which
             * happened rather than claiming the save.
             */
            if (holds(made, refOf(thing))) {
              announce(`Saved to ${made.name}`);
            } else {
              setFailed(`Made ${made.name}, but could not save to it. Try again.`);
            }
          }}
        />
      )}
    </BottomSheet>
  );
}

function ListPage({
  thing,
  failed,
  onFailed,
  onNew,
  onDone,
}: {
  thing: SavedThing;
  failed: string | null;
  onFailed: (message: string | null) => void;
  onNew: () => void;
  onDone: () => void;
}) {
  const list = useCollections((s) => s.list);
  const setItem = useCollections((s) => s.setItem);
  const ref = refOf(thing);

  const toggle = (c: Collection) => {
    const on = !holds(c, ref);
    if (on && c.items.length >= COLLECTION_ITEMS_MAX) {
      haptic.error();
      announce(`${c.name} is full. It holds ${COLLECTION_ITEMS_MAX} things.`);
      return;
    }
    haptic.select();
    onFailed(null);
    void setItem(c.id, thing, on).then((done) => {
      if (done.ok) return;
      onFailed(
        done.reason === 'collection_full'
          ? `${c.name} is full. Take something out to add this.`
          : on
            ? `Could not save to ${c.name}. Try again.`
            : `Could not take it out of ${c.name}. Try again.`,
      );
    });
  };

  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        Save to collection
      </Text>
      <Text style={styles.subline}>{savedLine(thing)}</Text>
      <ScrollView
        style={[styles.rows, { maxHeight: ROW * ROWS_VISIBLE + ROW / 2 }]}
        bounces={false}
        showsVerticalScrollIndicator={list.length >= ROWS_VISIBLE}>
        <Pressable
          onPress={onNew}
          accessibilityRole="button"
          accessibilityLabel="New collection"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <View style={styles.plus}>
            <Icon name="plus" size={24} color={colors.text} />
          </View>
          <Text style={styles.rowLabelStrong}>New collection</Text>
        </Pressable>
        {list.map((c) => {
          const inIt = holds(c, ref);
          const full = !inIt && c.items.length >= COLLECTION_ITEMS_MAX;
          return (
            <Pressable
              key={c.id}
              onPress={() => toggle(c)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inIt, disabled: full }}
              accessibilityLabel={`${c.name}, ${contentsSpoken(c.items)}, ${inIt ? 'in it' : full ? 'full' : 'not in it'}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Cover pieces={c.items} size={THUMB} />
              </View>
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.rowLabel}>
                  {c.name}
                </Text>
                {full ? <Text style={styles.rowNote}>{`Full: ${COLLECTION_ITEMS_MAX} items`}</Text> : null}
              </View>
              <Box on={inIt} />
            </Pressable>
          );
        })}
      </ScrollView>
      {failed ? (
        <Notice tone="error" style={styles.notice}>
          {failed}
        </Notice>
      ) : null}
      <Button label="Done" onPress={onDone} block style={styles.done} />
    </>
  );
}

/**
 * The name page: the thing being saved as a 120pt cover (none when a
 * collection is made empty, from the Saved tab's tile), one field, the
 * privacy line and Create. The keyboard's return creates too.
 */
function NewPage({
  thing,
  onBack,
  onMade,
}: {
  thing: SavedThing | null;
  /** The list page, inside the save sheet; none on the Saved tab's own sheet. */
  onBack?: () => void;
  onMade: (collection: Collection) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const create = useCollections((s) => s.create);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = nameOk(name) && !busy;

  const submit = () => {
    if (!ready) return;
    setBusy(true);
    setFailed(null);
    void create(name, thing).then((done) => {
      setBusy(false);
      if (done.ok) {
        haptic.success();
        onMade(done.value);
        return;
      }
      setFailed(
        done.reason === 'collections_full'
          ? 'You have 50 collections. Delete one to make another.'
          : 'Could not make the collection. Try again.',
      );
    });
  };

  return (
    <View style={{ paddingBottom: Math.max(0, keyboard - insets.bottom) }}>
      <View style={styles.newHead}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}>
            <Icon name="chevronLeft" size={26} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <Text accessibilityRole="header" style={styles.newTitle}>
          New collection
        </Text>
        <View style={styles.back} />
      </View>
      {thing ? (
        <View style={styles.newCover} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ThingPrint piece={pieceOf(thing)} size={NEW_COVER} />
        </View>
      ) : null}
      <NameField value={name} onChangeText={setName} onSubmit={submit} autoFocus returnKeyLabel="Create" />
      <Text style={styles.privacy}>Only you can see it. You can share a link to it later.</Text>
      {failed ? (
        <Notice tone="error" style={styles.notice}>
          {failed}
        </Notice>
      ) : null}
      <Button label="Create" onPress={submit} disabled={!nameOk(name)} loading={busy} block />
    </View>
  );
}

/**
 * New collection from the Saved tab's tile (spec §4.4): the same name
 * page, on its own, for a collection made empty. `onMade` then offers
 * Add from All saved (the collection's page does).
 */
export function NewCollectionSheet({
  visible,
  onClose,
  onMade,
}: {
  visible: boolean;
  onClose: () => void;
  /** Runs once the sheet has gone, so whatever it opens is not presented over a Modal still leaving. */
  onMade: (collection: Collection) => void;
}) {
  const [made, setMade] = useState<Collection | null>(null);
  const after = () => {
    if (!made) return;
    setMade(null);
    onMade(made);
  };
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      // iOS reports the Modal's dismissal; elsewhere `after` runs from the create itself.
      onDismissed={after}>
      {/* Mounted only while up, so each opening starts with an empty name. */}
      {visible ? (
        <NewPage
          thing={null}
          onMade={(c) => {
            onClose();
            if (Platform.OS === 'ios') setMade(c);
            else onMade(c);
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...textRole.bodyStrong, color: colors.text, textAlign: 'center' },
  subline: { ...textRole.small, color: colors.textMuted, textAlign: 'center', marginTop: space.xs, marginBottom: space.lg },
  rows: { marginHorizontal: -layout.gutter, flexGrow: 0 },
  row: {
    minHeight: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.press },
  plus: { width: THUMB, height: THUMB, backgroundColor: colors.bgSunk, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { ...textRole.body, color: colors.text },
  rowLabelStrong: { ...textRole.bodyMedium, color: colors.text, flex: 1 },
  rowNote: { ...textRole.small, color: colors.textMuted },
  notice: { marginTop: space.md },
  done: { marginTop: space.xl },
  newHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xl },
  back: { width: layout.hit, height: layout.hit, alignItems: 'flex-start', justifyContent: 'center' },
  backPressed: { opacity: 0.6 },
  newTitle: { ...textRole.barTitle, color: colors.text, flex: 1, textAlign: 'center' },
  newCover: { alignSelf: 'center', marginBottom: space.xl },
  privacy: { ...textRole.small, color: colors.textMuted, marginTop: space.md, marginBottom: space.lg },
});
