import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BottleLabel, BrassPlate, IngredientGlyph, SpoonRule, WalnutFill } from '@/components/brass';
import { DrinkName, MOUNT, Mount, MountWindow, VerticalFade } from '@/components/cabinet';
import { Button } from '@/components/ui';
import { colors, layout, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import type { Drink } from '@/types';

import { rowStyles, ShelfToggle, shelfToggleWidth } from './controls';
import { BarFace, PourMount, useStripNameHeight } from './faces';
import type { AwayRow, BestCard } from './model';

/* ==================================================================== */
/* What your bar makes                                                  */
/*                                                                      */
/* Under the picker: what you can make now, standing on a walnut        */
/* counter, and what is one ingredient away. A tick above changes both  */
/* at once, so the payoff is one scroll from the box you ticked.        */
/*                                                                      */
/* One ingredient away opens with the best single bottle to add (graft  */
/* 7), then one row per drink: its thumb, its name and plate, what it   */
/* needs and how far that bottle goes, and a squared "+ Orange".        */
/*                                                                      */
/* STILLNESS. The rows and the card are the screen's snapshot: an Add   */
/* flips its toggle to "✓ Orange" where it stands and lights the        */
/* drink's thumb (expo-image's own crossfade); nothing joins, leaves or */
/* moves until another tab takes the front. No layout animation runs    */
/* (v3.3 section 0): a stalled layout transition is a row drawn in the  */
/* wrong place, which is not "resting fully visible".                   */
/* ==================================================================== */

/* ---- Section heads ---- */

/**
 * A section's title (a header to VoiceOver) with its count in brassInk
 * SemiBold at the head's own size, a bar-spoon rule filling the rest of
 * the row (Brass D7), and an action at its end.
 */
export function SectionHead({
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
      <SpoonRule />
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

/** The same list, as VoiceOver hears it. */
function nameListSpoken(drinks: readonly Drink[], shown = 3): string {
  const head = drinks.slice(0, shown).map((d) => d.name);
  const rest = drinks.length - head.length;
  if (rest > 0) return `${head.join(', ')} and ${formatCount(rest)} more`;
  if (head.length < 2) return head.join('');
  return `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}`;
}

function plural(n: number) {
  return n === 1 ? 'drink' : 'drinks';
}

/* ==================================================================== */
/* You can make                                                         */
/* ==================================================================== */

/** What the line under "You can make" says. */
export type PourNote =
  | { kind: 'lit'; label: string; drinks: readonly Drink[] }
  | { kind: 'off'; label: string; lost: number; onUndo: () => void }
  | { kind: 'basics'; pour: number }
  | { kind: 'default' }
  | { kind: 'none'; short: boolean };

/** At most this many mounts in the strip; "See all" has the rest. */
export const STRIP_MAX = 12;

/*
 * The counter (Brass D8, D9): the Dex shelf's fittings at its top edge,
 * the walnut top face and the brass rail with its lit top, then the wood
 * the mounts stand on, and the mock's 4pt walnutDeep plank edge at its
 * foot, with the cabinet's 12pt `shade` hung under it onto the paper (the
 * light a ledge really casts, not a scroll fade). ONE WalnutFill for the
 * whole counter, never one per card: one image view over the shared
 * bitmap. The seed only picks which window of the grain shows.
 */
const COUNTER = { top: 4, rail: 2, foot: 4, shade: 12, seed: 3 } as const;

export function YouCanMake({
  total,
  strip,
  note,
  onSeeAll,
  onOpen,
}: {
  /** Drinks you can make; null before anything is in your bar. */
  total: number | null;
  strip: readonly Drink[];
  note: PourNote;
  onSeeAll?: () => void;
  onOpen: (id: string) => void;
}) {
  const nameHeight = useStripNameHeight(strip);
  return (
    <View style={styles.section}>
      <SectionHead
        title="You can make"
        count={total ?? undefined}
        action={
          onSeeAll
            ? { label: 'See all', onPress: onSeeAll, accessibilityLabel: `See all ${formatCount(total ?? 0)} drinks you can make` }
            : undefined
        }
      />
      <Note note={note} />
      {strip.length ? (
        <View style={styles.counterWrap}>
          <View style={styles.counter}>
            <WalnutFill seed={COUNTER.seed} />
            <View style={styles.counterTop} />
            <View style={styles.counterRail} />
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
              accessibilityLabel="Drinks you can make"
            />
            <View style={styles.counterFoot} />
          </View>
          <VerticalFade from={colors.shade} to={colors.shade} toOpacity={0} style={styles.counterShade} />
        </View>
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
              {note.label} unlocked {formatCount(note.drinks.length)}: <NameList drinks={note.drinks} />.
            </>
          ) : (
            `${note.label} is in your bar. Nothing new with it yet.`
          )}
        </Text>
      );
    case 'off':
      return (
        <View style={styles.noteRow}>
          <Text style={[styles.note, styles.noteGrow]}>
            {note.label} is out of your bar{note.lost ? `: ${formatCount(note.lost)} fewer.` : '.'}
          </Text>
          <Button
            label="Undo"
            variant="text"
            size="sm"
            onPress={note.onUndo}
            accessibilityLabel={`Undo, put ${note.label} back in your bar`}
          />
        </View>
      );
    case 'basics':
      return (
        <Text style={styles.note}>
          Nothing yet. The basics alone make {formatCount(note.pour)}, like these.
        </Text>
      );
    case 'default':
      return <Text style={styles.note}>New to your Dex first.</Text>;
    case 'none':
      return (
        <Text style={styles.note}>
          {note.short
            ? 'Nothing yet. One ingredient away, below, is the shortest way there.'
            : 'Nothing yet. A few of the basics, or a search, will start it.'}
        </Text>
      );
  }
}

/* ==================================================================== */
/* One ingredient away                                                  */
/* ==================================================================== */

/**
 * The stub's figure is 36pt already, and the line beside it says the same
 * number in words that grow freely, so it grows only so far (a plate's cap).
 */
const STUB_CAP = 1.3;

/**
 * Graft 7 · the best single bottle to add, before the rows: "+10 drinks"
 * on the stub, then "Opens Martini, Clarito, Bronx and 7 more." and a
 * squared "+ Dry vermouth" that ticks it by the rows' own path. A bottle
 * label (D6) like the checklist's: white while it is not yours, label
 * stock with the inner brass rule once it is, so the card says "in your
 * bar" the way the label above it does.
 *
 * The bottle is named on its button, never inside a sentence: the index
 * labels carry no mark for a proper name, so a lowercased "campari" or
 * "angostura bitters" would misspell the brand.
 *
 * Its words are the snapshot's, so its own Add changes only the label's
 * stock and the toggle's mark: nothing in it reflows under the finger.
 */
function BestBottleCard({ best, onAdd }: { best: BestCard; onAdd: (id: string) => void }) {
  const { ingredient, drinks, owned } = best;
  const n = drinks.length;
  return (
    <BottleLabel ticked={owned} style={styles.best}>
      <View style={styles.bestRow}>
        {/* The stub is said in the line's own label, so VoiceOver reads the card as one sentence and then its toggle. */}
        <View style={styles.bestStub} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text maxFontSizeMultiplier={STUB_CAP} style={[textRole.heroFigure, styles.bestFigure]}>
            {`+${formatCount(n)}`}
          </Text>
          <Text maxFontSizeMultiplier={STUB_CAP} style={styles.bestUnit}>
            {plural(n)}
          </Text>
        </View>
        <View style={styles.bestBody}>
          {/* The Menu ticket's words (graft 7's source): "Opens …" here, the bottle named on the button under it. */}
          <Text
            style={styles.bestLine}
            accessibilityLabel={`The best bottle to add, ${ingredient.label}: ${formatCount(n)} more ${plural(n)}. Opens ${nameListSpoken(drinks)}.`}>
            Opens <NameList drinks={drinks} />.
          </Text>
          <ShelfToggle
            on={owned}
            label={ingredient.label}
            onPress={() => onAdd(ingredient.id)}
            accessibilityLabel={
              owned ? `${ingredient.label}, in your bar` : `Add ${ingredient.label}, ${formatCount(n)} more ${plural(n)}`
            }
            style={styles.bestToggle}
          />
        </View>
        {/* Top right, where the checklist's labels carry it. */}
        <View style={styles.bestGlyph}>
          <IngredientGlyph ingredient={ingredient} />
        </View>
      </View>
    </BottleLabel>
  );
}

/** A row's thumb: Mount size="thumb", 3pt of mat and a 1pt edge around a 48pt window. */
const THUMB = 56;
const THUMB_FACE = THUMB - 2 * (MOUNT.thumb.padding + stroke.edge);
/** The narrowest the name and its line may get beside the toggle before the toggle goes under them. */
const TEXT_MIN = 150;
const ROW_GAP = space.md;

/** What a row says under its name, every case worded so the bottle's name starts its clause (see BestBottleCard). */
function awayLine(r: AwayRow): string {
  const label = r.need.label;
  if (r.made) return r.owned ? `${label} added · you can make it` : 'You can make it now';
  if (r.owned) return `${label} added · it needs more now`;
  if (!r.short) return `Needs: ${label} and more now`;
  return r.pours > 1 ? `Needs: ${label} · it pours ${formatCount(r.pours)} more` : `Needs: ${label}`;
}

/** What VoiceOver says for a line drawn with middle dots. */
const spoken = (s: string) => s.split(' · ').join(', ');

/**
 * One drink one ingredient away: the thumb, name and plate open the
 * drink (one button, its full label read aloud); the toggle beside them
 * adds what it needs. The toggle sits beside the words where both fit,
 * and under them where its name is long ("+ Maraschino liqueur") or the
 * text is large, decided from worked-out widths, so the row is laid out
 * once. Ghost thumb while one away; the lit photo once you can make it.
 */
const AwayRowView = React.memo(function AwayRowView({
  row,
  first,
  onAdd,
  onOpen,
}: {
  row: AwayRow;
  first: boolean;
  onAdd: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const { drink, need, owned, made, pours } = row;
  const room = width - 2 * layout.gutter;
  const toggleW = shelfToggleWidth(need.label, fontScale);
  const beside = THUMB + ROW_GAP + TEXT_MIN + ROW_GAP + toggleW <= room;
  const textW = room - THUMB - ROW_GAP - (beside ? ROW_GAP + toggleW : 0);
  const line = awayLine(row);
  const toggle = (
    <ShelfToggle
      on={owned}
      label={need.label}
      onPress={() => onAdd(need.id)}
      accessibilityLabel={
        owned
          ? `${need.label}, in your bar`
          : `Add ${need.label}${pours > 1 ? `, pours ${formatCount(pours)} more ${plural(pours)}` : ''}`
      }
      style={beside ? undefined : styles.awayToggleUnder}
    />
  );
  return (
    <View style={[styles.awayRow, beside && styles.awayRowBeside]}>
      {first ? null : <View style={[rowStyles.rule, styles.awayRule]} />}
      <Pressable
        onPress={() => onOpen(drink.id)}
        accessibilityRole="button"
        accessibilityLabel={`${drink.name}, number ${drink.dexNumber}, ${spoken(line)}`}
        style={({ pressed }) => [styles.awayMain, beside && styles.awayMainBeside, pressed && styles.dim]}>
        <Mount state="mounted" size="thumb" onLining={false} style={styles.thumb}>
          <MountWindow height={THUMB_FACE} state="mounted">
            <BarFace drink={drink} mode={made ? 'lit' : 'ghost'} width={THUMB_FACE} height={THUMB_FACE} />
          </MountWindow>
        </Mount>
        <View style={styles.awayText}>
          <View style={styles.awayName}>
            <DrinkName
              name={drink.name}
              role={textRole.rowName}
              // The plate wraps under a name that leaves it no room, so the name always has the column.
              measure={textW}
              cap={1.4}
              color={colors.text}
              style={styles.awayNameText}
            />
            {/* A slot, so the row centres it on the name: the plate sets its own alignSelf (flex-start, for columns). */}
            <View>
              <BrassPlate n={drink.dexNumber} />
            </View>
          </View>
          <Text style={rowStyles.subtitle}>{line}</Text>
        </View>
      </Pressable>
      {toggle}
    </View>
  );
});

/** Rows under One ingredient away at first, then this many more a tap (the screen pages by it too). */
export const AWAY_PAGE = 6;

export function OneIngredientAway({
  total,
  best,
  rows,
  more,
  onAdd,
  onShowMore,
  onOpen,
}: {
  /** Drinks one ingredient away now. */
  total: number;
  best: BestCard | null;
  rows: readonly AwayRow[];
  /** Rows not shown yet. */
  more: number;
  /** Puts the thing in your bar, or takes it out (the screen freezes the rows first). */
  onAdd: (id: string) => void;
  onShowMore: () => void;
  onOpen: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <View style={styles.section}>
      <SectionHead title="One ingredient away" count={total} />
      {best ? <BestBottleCard best={best} onAdd={onAdd} /> : null}
      <View style={styles.awayList}>
        {rows.map((r, i) => (
          <AwayRowView key={r.drink.id} row={r} first={i === 0} onAdd={onAdd} onOpen={onOpen} />
        ))}
      </View>
      {more > 0 ? (
        <Button
          label={`Show ${formatCount(Math.min(more, AWAY_PAGE))} more`}
          variant="secondary"
          block
          onPress={onShowMore}
          accessibilityHint={`${formatCount(more)} more drinks are one ingredient away`}
          style={styles.showMore}
        />
      ) : null}
    </View>
  );
}

/** Between one section and the head of the next. */
const SECTION_GAP = 26;

const styles = StyleSheet.create({
  section: { paddingTop: SECTION_GAP },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
  },
  headTitle: { ...textRole.shelfTitle, color: colors.text, flexShrink: 1 },
  headCount: { color: colors.brassInk },
  headAction: { marginLeft: space.xs },
  headActionText: { ...textRole.buttonSm, color: colors.wine },
  dim: { opacity: 0.5 },

  note: { ...textRole.helper, color: colors.textMuted, paddingHorizontal: layout.gutter, marginTop: 2 },
  noteRow: { flexDirection: 'row', alignItems: 'center', paddingRight: space.sm },
  noteGrow: { flexShrink: 1 },

  /* The counter. Its own box clips the wood; the shade hangs under it, outside the clip. */
  counterWrap: { marginTop: space.md },
  counter: { overflow: 'hidden', backgroundColor: colors.walnut },
  counterTop: { height: COUNTER.top, backgroundColor: colors.walnutTop },
  counterRail: {
    height: COUNTER.rail,
    backgroundColor: colors.brass,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.brassLit,
  },
  counterFoot: { height: COUNTER.foot, backgroundColor: colors.walnutDeep },
  counterShade: { position: 'absolute', left: 0, right: 0, top: '100%', height: COUNTER.shade },
  strip: { paddingHorizontal: layout.gutter, paddingVertical: space.lg, alignItems: 'stretch' },
  stripGap: { width: 10 },

  /* The best bottle's card: a checklist label at the column's full width. */
  best: { marginHorizontal: layout.gutter, marginTop: space.md, paddingVertical: space.md },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  /* The stub keeps a two-figure "+10" wide at the least, so a "+8" does not pull the words left of where a "+10" starts them. */
  bestStub: { alignItems: 'center', minWidth: 56 },
  bestFigure: { color: colors.brassInk },
  bestUnit: { ...textRole.labelCaption, color: colors.textMuted },
  bestBody: { flex: 1, gap: space.sm },
  bestLine: { ...textRole.helper, color: colors.textMuted },
  bestToggle: { alignSelf: 'flex-start' },
  bestGlyph: { alignSelf: 'flex-start' },

  awayList: { marginTop: space.sm },
  awayRow: { paddingHorizontal: layout.gutter, paddingVertical: space.md, gap: space.sm },
  awayRowBeside: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  /* The rule starts at the words, not the thumb, like every row with a leading picture. */
  awayRule: { left: layout.gutter + THUMB + ROW_GAP, right: layout.gutter },
  awayMain: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  awayMainBeside: { flex: 1 },
  thumb: { width: THUMB, height: THUMB },
  awayText: { flex: 1 },
  awayName: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: 2 },
  awayNameText: { flexShrink: 1 },
  /* Under the words: in line with them, past the thumb. */
  awayToggleUnder: { alignSelf: 'flex-start', marginLeft: THUMB + ROW_GAP },
  showMore: { marginHorizontal: layout.gutter, marginTop: space.md },
});
