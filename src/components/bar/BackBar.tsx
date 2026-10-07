import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiningBand, VerticalFade } from '@/components/cabinet';
import { Button } from '@/components/ui';
import { colors, radius, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { type Look, SHELF_NAME } from '@/data/barShelf';
import { BASICS, type Ingredient } from '@/lib/bar';

import { BottleArt } from './BottleArt';
import { type PlankModel, SHELF_INSET, type ShelfModel, TAG_CAP } from './layout';
import { alpha, BAR } from './paint';

/* ==================================================================== */
/* The back bar                                                         */
/*                                                                      */
/* My Bar's shelves, in the cabinet's lining: what you own stands lit   */
/* with a bone label clipped to the shelf's edge; what you do not is    */
/* the same silhouette stamped into the lining, with its name and what  */
/* it would pour. A shelf's backlight comes on once anything stands on  */
/* it.                                                                  */
/*                                                                      */
/* Tapping a bottle puts it on or takes it off IN PLACE: it goes ghost  */
/* (or lit) where it stands and nothing reflows, so the same tap undoes */
/* it. The order is a snapshot the screen re-sorts only when the tab    */
/* loses focus, so bottles never move under the finger.                 */
/*                                                                      */
/* What moves, and why it rests visible: a bay lifts 2pt while held,    */
/* from Pressable's synchronous style (no animation driver, so it is at */
/* rest the moment the finger leaves). Nothing else here moves. Every   */
/* bottle, label and plank is laid out at full opacity on the first     */
/* frame, and nothing waits on a callback.                              */
/* ==================================================================== */

const PLANK = { top: 6, face: 10, shade: 14 } as const;
/** Where a tag hangs from the stand's foot: its top sits over the plank's front edge. */
const TAG_DROP = 10;
const GHOST_DROP = 13;
/** How far a caption may spill past its bay on each side. */
const CAPTION_SPILL = 40;

/**
 * One bay: the thing standing on the shelf, and under the shelf's edge
 * its label (on the shelf) or its name and what it would pour (not).
 * Memoised on plain props (the ingredient and its look are stable
 * objects), so a tap re-renders the one bay it changed.
 */
const Bay = React.memo(function Bay({
  ingredient,
  look,
  owned,
  pours,
  gain,
  text,
  width,
  captionH,
  zone,
  onToggle,
}: {
  ingredient: Ingredient;
  look: Look;
  owned: boolean;
  /** Written under a shelf's-end ghost. */
  pours: number | undefined;
  /** What it would pour, spoken on any ghost. */
  gain: number;
  /** The label with its line breaks. */
  text: string;
  width: number;
  captionH: number;
  zone: number;
  onToggle: (id: string) => void;
}) {
  const drop = owned ? TAG_DROP : GHOST_DROP;
  const label = ingredient.label;
  const spoken = owned
    ? `${label}, on your shelf`
    : `${label}, not on your shelf${gain ? `, pours ${gain} more ${gain === 1 ? 'drink' : 'drinks'}` : ''}`;
  return (
    <Pressable
      onPress={() => onToggle(ingredient.id)}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: owned }}
      accessibilityHint={owned ? 'Double-tap to take it off the shelf' : 'Double-tap to put it on the shelf'}
      style={({ pressed }) => [styles.bay, { width }, pressed && styles.lifted]}>
      <View style={[styles.stand, { height: zone }]}>
        <View style={styles.art}>
          <BottleArt look={look} lit={owned} />
        </View>
      </View>
      {/*
        The caption's room is reserved (captionH); the caption itself hangs
        in a box wider than the bay, so a label packed tighter than its
        estimate (layout.ts, PACK) spills into the air between bays and
        never wraps inside a word.
      */}
      <View style={{ height: GHOST_DROP + captionH + 2 }}>
        <View style={[styles.caption, { top: drop }]}>
          {owned ? (
            <View style={styles.tag}>
              <Text maxFontSizeMultiplier={TAG_CAP} style={styles.tagText}>
                {text}
              </Text>
              <View style={styles.tagSeat} />
            </View>
          ) : (
            <>
              <Text maxFontSizeMultiplier={TAG_CAP} style={styles.ghostName}>
                {text}
              </Text>
              {pours ? (
                <Text maxFontSizeMultiplier={TAG_CAP} style={[styles.ghostPours, tabular]}>
                  +{formatCount(pours)} {pours === 1 ? 'drink' : 'drinks'}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
});

function Plank({ plank, lit, onToggle }: { plank: PlankModel; lit: boolean; onToggle: (id: string) => void }) {
  const { zone } = plank;
  return (
    <View style={styles.plankRow}>
      {/* The backlight runs from clear to warm, ending at the plank. No text ever sits on it. */}
      {lit ? (
        <VerticalFade
          from={alpha(BAR.backlight, 0)}
          to={BAR.backlight}
          style={[styles.backlight, { height: zone - 2 }]}
        />
      ) : null}
      <View pointerEvents="none" style={[styles.plank, { top: zone - 2 }]}>
        <View style={styles.plankTop} />
        <View style={styles.plankFace}>
          <View style={styles.plankHighlight} />
        </View>
        <VerticalFade from={BAR.plankShade} to={BAR.plankShade} toOpacity={0} style={styles.plankShade} />
      </View>
      <View style={styles.bays}>
        {plank.bays.map((bay) => (
          <Bay
            key={bay.id}
            ingredient={bay.ingredient}
            look={bay.look}
            owned={bay.owned}
            pours={bay.pours}
            gain={bay.gain}
            text={bay.lines.join('\n')}
            width={bay.width}
            captionH={bay.captionH}
            zone={zone}
            onToggle={onToggle}
          />
        ))}
      </View>
    </View>
  );
}

function Shelf({ shelf, lit, onToggle }: { shelf: ShelfModel; lit: boolean; onToggle: (id: string) => void }) {
  const n = shelf.owned;
  return (
    <View>
      {/* What VoiceOver hears first on each shelf; the rotor jumps between them. */}
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${SHELF_NAME[shelf.key]}, ${n ? `${n} on your shelf` : 'nothing on your shelf yet'}`}
        style={styles.srHeader}
      />
      {shelf.planks.map((plank, i) => (
        <Plank key={i} plank={plank} lit={lit} onToggle={onToggle} />
      ))}
    </View>
  );
}

export function BackBar({
  mode,
  shelves,
  ownedCount,
  makeable,
  basicsPour,
  basicsLeft,
  hidden,
  folds,
  open,
  onToggle,
  onAddBasics,
  onSearch,
  onFold,
}: {
  mode: 'empty' | 'stocked';
  shelves: ShelfModel[];
  ownedCount: number;
  makeable: number;
  /** What the fourteen basics pour (47). */
  basicsPour: number;
  /** Basics not on the shelf yet. */
  basicsLeft: number;
  /** Owned bottles a fold put out of sight. */
  hidden: number;
  folds: boolean;
  open: boolean;
  onToggle: (id: string) => void;
  onAddBasics: () => void;
  onSearch: () => void;
  onFold: () => void;
}) {
  return (
    <LiningBand lip style={styles.band}>
      {mode === 'empty' ? (
        <View style={styles.intro}>
          <Text style={styles.introTitle} accessibilityRole="header">
            What&apos;s on your shelf?
          </Text>
          {ownedCount === 0 ? (
            <Text style={styles.introBody}>
              Tap what you have. These {BASICS.length} basics pour{' '}
              <Text style={styles.introStrong}>{formatCount(basicsPour)} drinks</Text>.
            </Text>
          ) : (
            <Text style={styles.introBody}>
              <Text style={styles.introStrong}>{formatCount(ownedCount)}</Text> on your shelf ·{' '}
              <Text style={styles.introStrong}>
                {formatCount(makeable)} {makeable === 1 ? 'drink' : 'drinks'}
              </Text>{' '}
              tonight. Keep tapping, or search for the rest.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.topGap} />
      )}

      {shelves.map((shelf) => (
        <Shelf
          key={shelf.key}
          shelf={shelf}
          lit={shelf.owned > 0}
          onToggle={onToggle}
        />
      ))}

      {mode === 'empty' ? (
        <View style={styles.actions}>
          {basicsLeft > 0 ? (
            <Button
              label={basicsLeft === BASICS.length ? `Add all ${BASICS.length} basics` : `Add the other ${basicsLeft}`}
              variant="onLining"
              onPress={onAddBasics}
              style={styles.actionMain}
              accessibilityHint="Puts every basic on the shelf. Tap any bottle to take it off again."
            />
          ) : null}
          <Button
            label="Search"
            icon="search"
            variant="onLiningOutline"
            onPress={onSearch}
            style={basicsLeft > 0 ? undefined : styles.actionMain}
            accessibilityLabel="Search for a bottle"
          />
        </View>
      ) : (
        <View style={styles.foot}>
          {/* With every bottle taken off (the shelves hold still until you leave), the hint turns round. */}
          {ownedCount === 0 ? (
            <Text style={styles.tally}>Nothing on your shelf now. Tap a bottle to put it back.</Text>
          ) : (
            <Text style={styles.tally}>
              <Text style={[styles.tallyStrong, tabular]}>{formatCount(ownedCount)}</Text> on your shelf ·{' '}
              <Text style={[styles.tallyStrong, tabular]}>
                {formatCount(makeable)} {makeable === 1 ? 'drink' : 'drinks'}
              </Text>
              . Tap a bottle to take it off.
            </Text>
          )}
          {folds ? (
            <Button
              label={open ? 'Show fewer' : `Show all ${formatCount(hidden + countShown(shelves))} bottles`}
              variant="onLiningOutline"
              size="sm"
              onPress={onFold}
              style={styles.fold}
              accessibilityHint={open ? undefined : `${formatCount(hidden)} more are on your shelf`}
            />
          ) : null}
        </View>
      )}
    </LiningBand>
  );
}

/** Owned bottles standing in view. */
function countShown(shelves: ShelfModel[]): number {
  let n = 0;
  for (const s of shelves) for (const p of s.planks) for (const b of p.bays) if (b.owned) n++;
  return n;
}

const styles = StyleSheet.create({
  band: { paddingBottom: space.xs },
  topGap: { height: 10 },

  intro: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm },
  introTitle: { ...textRole.emptyTitle, color: colors.onLining },
  introBody: { ...textRole.prose, color: colors.onLiningMuted, marginTop: space.xs },
  introStrong: { fontFamily: textRole.labelValue.fontFamily, color: colors.onLining },

  plankRow: { marginBottom: space.md },
  backlight: { position: 'absolute', left: 0, right: 0, top: 0 },
  plank: { position: 'absolute', left: 0, right: 0 },
  plankTop: { height: PLANK.top, backgroundColor: BAR.plankTop },
  plankFace: { height: PLANK.face, backgroundColor: BAR.plankFace },
  plankHighlight: { height: stroke.edge, backgroundColor: colors.counterLine },
  plankShade: { height: PLANK.shade },
  bays: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-evenly',
    paddingHorizontal: SHELF_INSET,
  },

  bay: { alignItems: 'center' },
  lifted: { transform: [{ translateY: -2 }] },
  stand: { justifyContent: 'flex-end', alignItems: 'center' },
  // The art box's 6pt foot margin hangs past the stand, so the bottle's foot lands on the plank's top face.
  art: { marginBottom: -3 },

  caption: { position: 'absolute', left: -CAPTION_SPILL, right: -CAPTION_SPILL, alignItems: 'center' },
  tag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.matEdge,
    backgroundColor: colors.mat,
  },
  tagText: { ...textRole.statusWord, color: colors.text, textAlign: 'center' },
  /* The tag's contact line on the plank, drawn as a rule (shadows live in theme's elevation). */
  tagSeat: {
    position: 'absolute',
    left: 1,
    right: 1,
    bottom: -2,
    height: stroke.edge,
    backgroundColor: BAR.tagSeat,
  },
  ghostName: { ...textRole.statusWord, color: colors.onLiningMuted, textAlign: 'center' },
  ghostPours: {
    ...textRole.statusWord,
    fontFamily: textRole.labelValue.fontFamily,
    color: colors.onLining,
    textAlign: 'center',
  },
  srHeader: { position: 'absolute', top: 0, left: 0, width: 1, height: 1 },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  actionMain: { flexGrow: 1 },

  foot: { paddingHorizontal: space.lg, paddingBottom: space.md },
  tally: { ...textRole.helper, color: colors.onLiningMuted },
  tallyStrong: { fontFamily: textRole.labelValue.fontFamily, color: colors.onLining },
  fold: { alignSelf: 'flex-start', marginTop: space.md },
});
