import { useRouter } from 'expo-router';
import React from 'react';
import { type AccessibilityActionEvent, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DexCard } from '@/components/DexCard';
import { chunk, PostGridTile, useGridTile } from '@/components/profile/PostGrid';
import { colors, layout, space, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import type { CollectionItem, ItemKind } from '@/lib/collections';
import { timeAgoSpoken } from '@/lib/social';
import { useCollection } from '@/store/collection';
import type { Drink, Post } from '@/types';

import { Box } from './Box';

/* ==================================================================== */
/* A collection's grid (spec §4.6, §4.8)                                */
/*                                                                      */
/* Drinks two-up as the Dex draws them, against THIS phone's Dex: the   */
/* colour print and its name in ink once caught, the grey proof and a   */
/* muted name before (so a shared collection is drawn against the       */
/* viewer's Dex, not its owner's). Then a "Posts" head and the posts    */
/* three-up as a profile's grid. Newest first, both. A tap opens the    */
/* drink or the post.                                                   */
/*                                                                      */
/* SELECTING (Remove items, Add from All saved): a 22pt box on every    */
/* tile, and a tap ticks it instead of opening. VoiceOver hears each    */
/* tile as a checkbox then. Outside the mode, a collection's own page   */
/* gives every tile a custom action, "Remove from Sunday sours", so     */
/* removing never needs the mode (spec §4.6).                           */
/*                                                                      */
/* Rows, one column, as Saved and the profile build theirs: the list    */
/* never changes its column count while mounted.                        */
/* ==================================================================== */

export type GridRow =
  | { key: string; kind: 'drinks'; drinks: Drink[]; first: boolean }
  | { key: string; kind: 'postsHead'; count: number; afterGrid: boolean }
  | { key: string; kind: 'posts'; posts: Post[] };

/** A post item as the tile it is drawn with: what PostGridTile reads, nothing more. */
export const postOf = (i: CollectionItem): Post => ({
  id: i.id,
  authorId: i.authorId,
  drinkId: i.drinkId,
  caption: '',
  photoUri: null,
  photoPath: i.photoPath,
  createdAt: i.postedAt,
  likes: 0,
});

/** The grid's rows: the drinks two to a row, then the posts' head and their rows of three. */
export function gridRows(drinks: readonly Drink[], posts: readonly Post[], columns = 2): GridRow[] {
  return [
    ...chunk(drinks, columns).map((r, i): GridRow => ({ key: `d:${r[0]!.id}`, kind: 'drinks', drinks: r, first: i === 0 })),
    ...(posts.length > 0
      ? [
          { key: 'posts:head', kind: 'postsHead', count: posts.length, afterGrid: drinks.length > 0 } as GridRow,
          ...chunk(posts, 3).map((r): GridRow => ({ key: `p:${r[0]!.id}`, kind: 'posts', posts: r })),
        ]
      : []),
  ];
}

/** Selection, as `kind:id` keys. */
export const pickKey = (kind: ItemKind, id: string) => `${kind}:${id}`;

export interface GridSelection {
  /** True while tiles tick rather than open. */
  on: boolean;
  picked: ReadonlySet<string>;
  toggle: (kind: ItemKind, id: string) => void;
}

/** Outside selecting: a custom action to take one tile out. */
export interface GridRemoval {
  /** "Remove from Sunday sours". */
  label: string;
  remove: (kind: ItemKind, id: string) => void;
}

/** The column width two prints share at this screen width. Unrounded, as DexCard asks. */
export function useDrinkColumn(columns = 2): number {
  const { width } = useWindowDimensions();
  return (width - 2 * layout.gutter - layout.dexGap * (columns - 1)) / columns;
}

export function GridRowView({
  row,
  column,
  selection,
  removal,
  onOpenDrink,
}: {
  row: GridRow;
  column: number;
  selection?: GridSelection;
  removal?: GridRemoval;
  onOpenDrink: (id: string) => void;
}) {
  const tile = useGridTile();
  if (row.kind === 'postsHead') {
    return (
      <View style={[styles.head, row.afterGrid && styles.headAfterGrid]}>
        <Text accessibilityRole="header" style={styles.headTitle}>
          Posts
        </Text>
      </View>
    );
  }
  if (row.kind === 'drinks') {
    return (
      <View style={[styles.drinkRow, row.first && styles.drinkRowFirst]}>
        {row.drinks.map((drink) => (
          <DrinkCell
            key={drink.id}
            drink={drink}
            column={column}
            selection={selection}
            removal={removal}
            onOpen={onOpenDrink}
          />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.postRow}>
      {row.posts.map((post) => (
        <PostCell key={post.id} post={post} size={tile} selection={selection} removal={removal} />
      ))}
    </View>
  );
}

/** The accessibility a tile gets in each mode: a checkbox while selecting, a button with a removal otherwise. */
function tileAccessibility(
  kind: ItemKind,
  id: string,
  label: string,
  open: () => void,
  selection?: GridSelection,
  removal?: GridRemoval,
) {
  if (selection?.on) {
    const picked = selection.picked.has(pickKey(kind, id));
    return {
      accessible: true,
      accessibilityRole: 'checkbox' as const,
      accessibilityLabel: label,
      accessibilityState: { checked: picked },
      accessibilityActions: [{ name: 'activate' }],
      onAccessibilityAction: (e: AccessibilityActionEvent) => {
        if (e.nativeEvent.actionName === 'activate') selection.toggle(kind, id);
      },
    };
  }
  return {
    accessible: true,
    accessibilityRole: 'button' as const,
    accessibilityLabel: label,
    accessibilityActions: [{ name: 'activate' }, ...(removal ? [{ name: 'remove', label: removal.label }] : [])],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'activate') open();
      else if (e.nativeEvent.actionName === 'remove') removal?.remove(kind, id);
    },
  };
}

/** One drink, holding its own Dex subscription as Saved's cells do, so a catch re-renders one card. */
const DrinkCell = React.memo(function DrinkCell({
  drink,
  column,
  selection,
  removal,
  onOpen,
}: {
  drink: Drink;
  column: number;
  selection?: GridSelection;
  removal?: GridRemoval;
  onOpen: (id: string) => void;
}) {
  const record = useCollection((s) => (Object.prototype.hasOwnProperty.call(s.unlocks, drink.id) ? s.unlocks[drink.id] : undefined));
  const picking = !!selection?.on;
  const picked = picking && selection.picked.has(pickKey('drink', drink.id));
  const press = (id: string) => (picking ? selection.toggle('drink', id) : onOpen(id));
  // DexCard's own words: the tile is spoken the same here as in the Dex.
  const label = `${drink.name}, number ${drink.dexNumber}, ${record ? 'caught' : 'not caught yet'}`;
  return (
    <View {...tileAccessibility('drink', drink.id, label, () => onOpen(drink.id), selection, removal)}>
      <DexCard drink={drink} cardWidth={column} collected={!!record} userPhotoUri={record?.photoUri} onPress={press} />
      {picking ? (
        <View pointerEvents="none" style={styles.box}>
          <Box on={picked} onMedia />
        </View>
      ) : null}
    </View>
  );
});

function PostCell({
  post,
  size,
  selection,
  removal,
}: {
  post: Post;
  size: number;
  selection?: GridSelection;
  removal?: GridRemoval;
}) {
  const router = useRouter();
  const picking = !!selection?.on;
  const picked = picking && selection.picked.has(pickKey('post', post.id));
  const drink = getDrink(post.drinkId);
  // PostGridTile's own words.
  const label = `${drink?.name ?? 'A post'}, posted ${timeAgoSpoken(post.createdAt)}`;
  // `navigate`, as PostGridTile's own open: a double tap opens the post once.
  const open = () => router.navigate({ pathname: '/post/[id]', params: { id: post.id } });
  return (
    <View {...tileAccessibility('post', post.id, label, open, selection, removal)} style={{ width: size }}>
      <PostGridTile
        post={post}
        size={size}
        // Selecting, a tap ticks instead of opening.
        onOpen={picking ? () => selection.toggle('post', post.id) : open}
      />
      {picking ? (
        <View pointerEvents="none" style={styles.box}>
          <Box on={picked} onMedia />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* The Dex's grid row: two cards stretched to the taller, so a long name grows its row, never overlaps the next. */
  drinkRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: layout.dexGap,
    paddingHorizontal: layout.gutter,
    paddingBottom: layout.dexLedge,
  },
  drinkRowFirst: { paddingTop: space.lg },
  postRow: {
    flexDirection: 'row',
    gap: layout.gridGap,
    marginTop: layout.gridGap,
    paddingHorizontal: layout.gutter,
  },
  /* 32 of air above the head, counted from the drink grid's 24 ledge when it follows one. */
  head: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xs },
  headAfterGrid: { paddingTop: layout.section - layout.dexLedge },
  headTitle: { ...textRole.bodyStrong, color: colors.text },
  /* The box sits 8 in from the print's top right corner. */
  box: { position: 'absolute', top: space.sm, right: space.sm },
});
