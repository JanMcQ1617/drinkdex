import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { colors, layout, space, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import type { Ingredient } from '@/lib/bar';
import type { Drink } from '@/types';

import { BottleRow, LARGE_WINDOW, rowStyles, ShelfToggle, SMALL_WINDOW } from './controls';
import { DrinkThumb, MoreTile, PourMount, useStripNameHeight } from './faces';

/* ==================================================================== */
/* The counter                                                          */
/*                                                                      */
/* The paper under the back bar: what the shelf pours tonight, lit, and */
/* what is one thing short, grouped by the one thing. It sits right     */
/* under the bottle you just tapped, so the payoff is always in reach.  */
/*                                                                      */
/* Add on a row expands IN PLACE: the row becomes a selected "Added"    */
/* toggle and grows the drinks it just lit right under it, in the same  */
/* render. Nothing moves away from the finger: rows keep the screen's   */
/* snapshot order until the tab loses focus, and no layout animation    */
/* runs (a new row of thumbs simply appears).                           */
/* ==================================================================== */

/* ---- Section heads ---- */

function Head({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void; accessibilityLabel: string };
}) {
  return (
    <View style={styles.head}>
      <Text style={styles.headTitle} accessibilityRole="header">
        {title}
        {count != null ? <Text style={[styles.headCount, tabular]}>{`  ${formatCount(count)}`}</Text> : null}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          style={({ pressed }) => [styles.headAction, pressed && styles.dim]}>
          <Text style={styles.headActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Negroni, Boulevardier, Americano and 6 more", names in Playfair inside an Inter sentence. */
export function NameList({ drinks, shown = 3 }: { drinks: readonly Drink[]; shown?: number }) {
  const head = drinks.slice(0, shown);
  const rest = drinks.length - head.length;
  return (
    <>
      {head.map((d, i) => (
        <React.Fragment key={d.id}>
          {i === 0 ? '' : i === head.length - 1 && rest === 0 ? ' and ' : ', '}
          <Text style={rowStyles.name}>{d.name}</Text>
        </React.Fragment>
      ))}
      {rest > 0 ? ` and ${formatCount(rest)} more` : ''}
    </>
  );
}

/* ==================================================================== */
/* Pour tonight                                                         */
/* ==================================================================== */

/** What the line under "Pour tonight" says. */
export type PourNote =
  | { kind: 'lit'; label: string; drinks: readonly Drink[] }
  | { kind: 'off'; label: string; lost: number; onUndo: () => void }
  | { kind: 'basics'; pour: number }
  | { kind: 'default' }
  | { kind: 'none'; short: boolean };

/** At most this many mounts in the strip; "See all" has the rest. */
export const STRIP_MAX = 12;

export function PourTonight({
  total,
  strip,
  note,
  onSeeAll,
  onOpen,
}: {
  /** Drinks you can pour; null before anything is on the shelf. */
  total: number | null;
  strip: readonly Drink[];
  note: PourNote;
  onSeeAll?: () => void;
  onOpen: (id: string) => void;
}) {
  const nameHeight = useStripNameHeight(strip);
  return (
    <View style={styles.section}>
      <Head
        title="Pour tonight"
        count={total ?? undefined}
        action={
          onSeeAll
            ? { label: 'See all', onPress: onSeeAll, accessibilityLabel: `See all ${formatCount(total ?? 0)} drinks you can pour` }
            : undefined
        }
      />
      <Note note={note} />
      {strip.length ? (
        <FlatList
          horizontal
          data={strip}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <PourMount drink={item} nameHeight={nameHeight} onOpen={onOpen} />}
          ItemSeparatorComponent={StripGap}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={3}
          accessibilityLabel="Drinks you can pour tonight"
        />
      ) : null}
    </View>
  );
}

function StripGap() {
  return <View style={styles.stripGap} />;
}

function Note({ note }: { note: PourNote }) {
  switch (note.kind) {
    case 'lit':
      return (
        <Text style={styles.note}>
          {note.drinks.length ? (
            <>
              {note.label} lit {formatCount(note.drinks.length)}: <NameList drinks={note.drinks} />.
            </>
          ) : (
            `${note.label} is on the shelf. Nothing new pours with it yet.`
          )}
        </Text>
      );
    case 'off':
      return (
        <View style={styles.noteRow}>
          <Text style={[styles.note, styles.noteGrow]}>
            {note.label} off the shelf{note.lost ? `: ${formatCount(note.lost)} fewer.` : '.'}
          </Text>
          <Button
            label="Undo"
            variant="text"
            size="sm"
            onPress={note.onUndo}
            accessibilityLabel={`Undo, put ${note.label} back on the shelf`}
          />
        </View>
      );
    case 'basics':
      return (
        <Text style={styles.note}>
          Nothing yet. The basics alone pour {formatCount(note.pour)}, like these.
        </Text>
      );
    case 'default':
      return <Text style={styles.note}>New to your Dex first.</Text>;
    case 'none':
      return (
        <Text style={styles.note}>
          {note.short
            ? 'Nothing pours yet. One thing short, below, is the shortest way there.'
            : 'Nothing pours yet. A few of the basics, or a search, will start it.'}
        </Text>
      );
  }
}

/* ==================================================================== */
/* One thing short                                                      */
/* ==================================================================== */

export interface ShortGroup {
  ingredient: Ingredient;
  /** On the shelf now (an Add, a tap on the back bar, the sheet). */
  added: boolean;
  /** Not added: the drinks it would pour. Added: the drinks it lit. */
  drinks: readonly Drink[];
}

/** Thumbs named in a row's subtitle and spoken by its toggle. */
const THUMBS = 3;
const CARD_THUMB = 76;
const ROW_THUMB = 68;
/**
 * The smallest thumb: under this a Playfair name such as "Greyhound" no
 * longer fits its tile even at the 11pt floor, and would break inside the
 * word. A narrow phone shows fewer thumbs instead of smaller ones.
 */
const THUMB_MIN = 66;
const THUMB_GAP = space.sm;
/** The card's inset, and a row's (its padding and the bottle window it hangs under). */
const CARD_INSET = 2 * layout.gutter + 2 + 2 * 14;
const ROW_INSET = 2 * layout.gutter + 2 + 14 + space.md + SMALL_WINDOW.width + space.md;

/**
 * How many tiles a row of thumbs holds, the "more" tile included, and
 * their size: as many as fit at THUMB_MIN or larger, never past `max`.
 */
function useThumbFit(inset: number, max: number): { size: number; tiles: number } {
  const { width } = useWindowDimensions();
  const room = width - inset;
  const tiles = Math.max(2, Math.min(4, Math.floor((room + THUMB_GAP) / (THUMB_MIN + THUMB_GAP))));
  const size = Math.min(max, Math.floor((room - (tiles - 1) * THUMB_GAP) / tiles));
  return { size, tiles };
}

/**
 * A group's drinks: three thumbs and a "6 more" tile, or every drink once
 * opened. Lit when the group's thing is on the shelf, else their ghosts.
 */
function Thumbs({
  drinks,
  lit,
  inset,
  max,
  open,
  onToggleOpen,
  onOpen,
  closeLabel = 'Show fewer',
}: {
  drinks: readonly Drink[];
  lit: boolean;
  /** Everything across the screen that is not the row of thumbs. */
  inset: number;
  max: number;
  open: boolean;
  onToggleOpen: () => void;
  onOpen: (id: string) => void;
  /** The last tile once open: "Show fewer", or "Hide" where closing hides them all. */
  closeLabel?: string;
}) {
  const { size, tiles } = useThumbFit(inset, max);
  if (!drinks.length) return null;
  // All of them when they fit; else one tile fewer, for "N more".
  const fits = drinks.length <= tiles ? drinks.length : tiles - 1;
  const shown = open ? drinks : drinks.slice(0, fits);
  const rest = drinks.length - fits;
  return (
    <View style={styles.thumbs}>
      {shown.map((d) => (
        <DrinkThumb key={d.id} drink={d} lit={lit} size={size} onOpen={onOpen} />
      ))}
      {rest > 0 ? (
        <MoreTile
          size={size}
          label={open ? closeLabel : lit ? `+${formatCount(rest)}\nSee all ${formatCount(drinks.length)}` : `${formatCount(rest)} more`}
          onPress={onToggleOpen}
          accessibilityLabel={open ? `${closeLabel} drinks` : `Show all ${formatCount(drinks.length)} drinks`}
        />
      ) : null}
    </View>
  );
}

function plural(n: number) {
  return n === 1 ? 'drink' : 'drinks';
}

/** What a group's toggle says to VoiceOver: everything the row shows. */
function spoken(g: ShortGroup): string {
  const n = g.drinks.length;
  if (g.added) return `${g.ingredient.label}, on your shelf, ${formatCount(n)} more tonight`;
  const names = g.drinks
    .slice(0, THUMBS)
    .map((d) => d.name)
    .join(', ');
  return `Add ${g.ingredient.label}, pours ${formatCount(n)} more ${plural(n)}${names ? `: ${names}` : ''}`;
}

/** The top group: a card with the bottle, the toggle, and the drinks' faces. */
function ShortCard({
  group,
  open,
  onToggle,
  onToggleOpen,
  onOpen,
}: {
  group: ShortGroup;
  open: boolean;
  onToggle: (id: string) => void;
  onToggleOpen: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { ingredient, added, drinks } = group;
  const n = drinks.length;
  return (
    <Card style={styles.card}>
      <BottleRow
        ingredient={ingredient}
        lit={added}
        first
        window={LARGE_WINDOW}
        style={styles.cardRow}
        title={ingredient.label}
        subtitle={
          added ? (
            <Text style={rowStyles.subtitleOn}>On your shelf: {formatCount(n)} more tonight</Text>
          ) : (
            <Text style={rowStyles.subtitle}>
              Pours {formatCount(n)} more {plural(n)}
            </Text>
          )
        }
        toggle={
          <ShelfToggle on={added} onLabel="Added" onPress={() => onToggle(ingredient.id)} accessibilityLabel={spoken(group)} />
        }
      />
      <View style={styles.cardThumbs}>
        <Thumbs
          drinks={drinks}
          lit={added}
          inset={CARD_INSET}
          max={CARD_THUMB}
          open={open}
          onToggleOpen={() => onToggleOpen(ingredient.id)}
          onOpen={onOpen}
        />
      </View>
    </Card>
  );
}

/**
 * Every other group: a row; an Add grows the drinks it lit under it.
 * Tapping the row's words shows the ghosts of every drink it would pour,
 * in place, so each drink one thing short still opens from My Bar, as
 * the old one-per-drink list let it (the row rests as the mockup drew it).
 */
const ShortRow = React.memo(function ShortRow({
  group,
  first,
  open,
  onToggle,
  onToggleOpen,
  onOpen,
}: {
  group: ShortGroup;
  first: boolean;
  open: boolean;
  onToggle: (id: string) => void;
  onToggleOpen: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { ingredient, added, drinks } = group;
  const n = drinks.length;
  return (
    <BottleRow
      ingredient={ingredient}
      lit={added}
      first={first}
      title={ingredient.label}
      subtitle={
        added ? (
          <Text style={rowStyles.subtitleOn}>On your shelf: {formatCount(n)} more tonight</Text>
        ) : n ? (
          <Text style={rowStyles.subtitle}>
            Pours {formatCount(n)} more: <NameList drinks={drinks} />
          </Text>
        ) : (
          <Text style={rowStyles.subtitle}>Pours nothing new with your shelf now.</Text>
        )
      }
      reveal={
        added || !n
          ? undefined
          : {
              open,
              onPress: () => onToggleOpen(ingredient.id),
              accessibilityLabel: open
                ? `Hide the drinks ${ingredient.label} would pour`
                : `Show the ${formatCount(n)} ${plural(n)} ${ingredient.label} would pour`,
            }
      }
      toggle={<ShelfToggle on={added} onLabel="Added" onPress={() => onToggle(ingredient.id)} accessibilityLabel={spoken(group)} />}>
      {added || open ? (
        <Thumbs
          drinks={drinks}
          lit={added}
          inset={ROW_INSET}
          max={ROW_THUMB}
          open={open}
          onToggleOpen={() => onToggleOpen(ingredient.id)}
          onOpen={onOpen}
          closeLabel={added ? undefined : 'Hide'}
        />
      ) : null}
    </BottleRow>
  );
});

export function OneThingShort({
  total,
  groups,
  more,
  open,
  onToggle,
  onToggleOpen,
  onShowMore,
  onOpen,
}: {
  /** Drinks one thing short. */
  total: number;
  groups: readonly ShortGroup[];
  /** Groups not shown yet. */
  more: number;
  /** Groups whose drinks are all showing. */
  open: Readonly<Record<string, true>>;
  onToggle: (id: string) => void;
  onToggleOpen: (id: string) => void;
  onShowMore: () => void;
  onOpen: (id: string) => void;
}) {
  if (!groups.length) return null;
  const [top, ...rest] = groups;
  return (
    <View style={[styles.section, styles.sectionShort]}>
      <Head title="One thing short" count={total} />
      {/* Ranked by how many drinks name the thing (lib/bar.ts, nextBest), so "most-needed", not "pours most". */}
      <Text style={styles.note}>By what you need, the most-needed first.</Text>
      <ShortCard
        group={top!}
        open={!!open[top!.ingredient.id]}
        onToggle={onToggle}
        onToggleOpen={onToggleOpen}
        onOpen={onOpen}
      />
      {rest.length ? (
        <Card style={styles.group}>
          {rest.map((g, i) => (
            <ShortRow
              key={g.ingredient.id}
              group={g}
              first={i === 0}
              open={!!open[g.ingredient.id]}
              onToggle={onToggle}
              onToggleOpen={onToggleOpen}
              onOpen={onOpen}
            />
          ))}
        </Card>
      ) : null}
      {more > 0 ? (
        <Button
          label={`Show ${formatCount(Math.min(more, 6))} more`}
          variant="secondary"
          block
          onPress={onShowMore}
          accessibilityHint={`${formatCount(more)} more things would each pour something new`}
          style={styles.showMore}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xs },
  sectionShort: { paddingTop: 26 },

  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
  },
  headTitle: { ...textRole.shelfTitle, color: colors.text, flexShrink: 1 },
  headCount: { color: colors.textMuted },
  headAction: { marginLeft: 'auto' },
  headActionText: { ...textRole.buttonSm, color: colors.wine },
  dim: { opacity: 0.5 },

  note: { ...textRole.helper, color: colors.textMuted, paddingHorizontal: layout.gutter, marginTop: 2 },
  noteRow: { flexDirection: 'row', alignItems: 'center', paddingRight: space.sm },
  noteGrow: { flexShrink: 1 },

  strip: { paddingHorizontal: layout.gutter, paddingTop: space.md, alignItems: 'stretch' },
  stripGap: { width: 10 },

  card: { marginHorizontal: layout.gutter, marginTop: space.md, paddingBottom: 14 },
  cardRow: { paddingTop: 14, paddingBottom: 0 },
  cardThumbs: { paddingHorizontal: 14 },
  group: { marginHorizontal: layout.gutter, marginTop: space.md, overflow: 'hidden' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: THUMB_GAP, paddingTop: space.md },
  showMore: { marginHorizontal: layout.gutter, marginTop: space.md },
});
