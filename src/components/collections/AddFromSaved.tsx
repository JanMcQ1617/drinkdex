import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTopBar, TopBarTextButton, useScrolledPast } from '@/components/ScreenTopBar';
import { announce, Button, haptic, Hold, Notice } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { type Collection, COLLECTION_ITEMS_MAX, holds, type ItemKind } from '@/lib/collections';
import { type SavedThing, useCollections } from '@/store/collections';
import { useTaste } from '@/store/taste';
import type { Drink } from '@/types';

import { useSavedPosts } from './AllSaved';
import { type GridRow, GridRowView, gridRows, pickKey, useDrinkColumn } from './CollectionGrid';

/* ==================================================================== */
/* Add from All saved (spec §4.4)                                       */
/*                                                                      */
/* After New collection on the Saved tab, and from an empty collection: */
/* All saved's grid (drinks two-up, posts three-up) with a box on every */
/* tile, what is in the collection already left out, and Add 4 at the   */
/* foot. Skip (or Cancel) leaves the collection as it is. Everything    */
/* here is in All saved already, so adding never saves anything.        */
/*                                                                      */
/* A whole page, as LikersSheet and the pickers are: it is something    */
/* you scroll and choose in, not a short list of actions.               */
/* ==================================================================== */

/**
 * Drawn by the collection's page in place of its grid, not presented over
 * it: straight after New collection it arrives with the push, and a page
 * sheet presented mid-push (or while the name sheet is still leaving) is
 * one UIKit can refuse. In place, it is simply the page, from its first
 * frame. Mounted only while it is up, so each opening starts with nothing
 * ticked.
 */
export function AddFromSaved(props: { collection: Collection; myId: string; fresh: boolean; onClose: () => void }) {
  return <Picker {...props} />;
}

function Picker({
  collection,
  myId,
  fresh,
  onClose,
}: {
  collection: Collection;
  myId: string;
  fresh: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const column = useDrinkColumn();
  const [scrolled, onScroll] = useScrolledPast();
  const addMany = useCollections((s) => s.addMany);
  const { status, posts } = useSavedPosts(myId);
  const savedIds = useTaste((s) => s.saved);

  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const drinks = savedIds.flatMap((id): Drink[] => {
    const d = getDrink(id);
    return d && !holds(collection, { kind: 'drink', id }) ? [d] : [];
  });
  const postsLeft = posts.filter((p) => !holds(collection, { kind: 'post', id: p.id }));
  const rows: GridRow[] = gridRows(drinks, postsLeft);
  const room = COLLECTION_ITEMS_MAX - collection.items.length;

  const toggle = (kind: ItemKind, id: string) => {
    const key = pickKey(kind, id);
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else if (next.size >= room) {
      haptic.error();
      announce(`${collection.name} has room for ${room} more.`);
      return;
    } else next.add(key);
    haptic.select();
    setPicked(next);
  };

  const add = () => {
    // In All saved's order: the drinks, then the posts, so the newest-first collection reads as All saved does.
    const things: SavedThing[] = [
      ...drinks.filter((d) => picked.has(pickKey('drink', d.id))).map((d): SavedThing => ({ kind: 'drink', id: d.id })),
      ...postsLeft
        .filter((p) => picked.has(pickKey('post', p.id)))
        .map(
          (p): SavedThing => ({
            kind: 'post',
            id: p.id,
            drinkId: p.drinkId,
            photoPath: p.photoPath ?? null,
            author: '',
            authorId: p.authorId,
            postedAt: p.createdAt,
          }),
        ),
    ].reverse();
    setBusy(true);
    setFailed(false);
    void addMany(collection.id, things).then((n) => {
      setBusy(false);
      if (n < things.length) {
        // What went in leaves the grid (it is in the collection now), so only what is still out stays ticked for the retry.
        const now = useCollections.getState().list.find((c) => c.id === collection.id);
        if (now) setPicked((prev) => new Set([...prev].filter((key) => !now.items.some((i) => pickKey(i.kind, i.id) === key))));
        setFailed(true);
        return;
      }
      haptic.success();
      onClose();
    });
  };

  const empty =
    status === 'loading' ? (
      <Hold fill={false} slowMessage="Still loading what you saved." />
    ) : (
      <Text style={styles.empty}>
        {collection.items.length > 0 ? 'Everything you saved is in it already.' : 'Nothing in All saved yet.'}
      </Text>
    );

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Add from All saved"
        showRule={scrolled}
        left={<TopBarTextButton label={fresh ? 'Skip' : 'Cancel'} muted onPress={onClose} />}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => (
          <GridRowView
            row={item}
            column={column}
            selection={{ on: true, picked, toggle }}
            onOpenDrink={(id) => toggle('drink', id)}
          />
        )}
        ListEmptyComponent={empty}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={4}
        windowSize={5}
        contentContainerStyle={{ paddingBottom: FOOT + insets.bottom + space.lg }}
        showsVerticalScrollIndicator={false}
      />
      <View style={[styles.foot, { paddingBottom: insets.bottom + space.md }]}>
        {failed ? (
          <Notice tone="error" style={styles.notice}>
            Some did not go in. Try again.
          </Notice>
        ) : null}
        <Button
          label={picked.size > 0 ? `Add ${picked.size}` : 'Add'}
          onPress={add}
          disabled={picked.size === 0}
          loading={busy}
          block
        />
      </View>
    </View>
  );
}

/** The foot slab's key and its padding, which the list keeps clear of. */
const FOOT = layout.control + space.md;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  empty: { ...textRole.body, color: colors.textMuted, paddingHorizontal: layout.gutter, paddingTop: space.xl },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bg,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
  },
  notice: { marginBottom: space.md },
});
