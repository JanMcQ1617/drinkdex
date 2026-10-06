import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, HeroFigure, LiningBand, NumberPlate, TierWord } from '@/components/cabinet';
import { DexThumb } from '@/components/DexCard';
import { Icon } from '@/components/icons';
import { Button, Card, ProgressBar, SectionHeader } from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  fonts,
  layout,
  radius,
  RARITY_META,
  RARITY_ORDER,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, COUNT_BY_RARITY, formatCount, getDrink, TOTAL } from '@/data';
import { nextRank } from '@/lib/cabinet';
import { MILESTONES, rankTitle } from '@/lib/milestones';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory, Rarity, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Collection stats                                                     */
/*                                                                      */
/* The four blocks — Collection, Rarity, Milestones, Rarest entry —     */
/* extracted from the profile so the Stats screen and any future        */
/* surface render the identical thing. Reads the LOCAL collection; a    */
/* peer's stats are a different, post-derived view (see PeerProfile).   */
/*                                                                      */
/* v3 (specs/v3-cabinet.md §9.13.4): the collection itself is a panel   */
/* of the cabinet's lining with the count as an Inter hero figure; the  */
/* tiers are four plates of card stock; the rarest entry is a mounted   */
/* thumbnail with its name in Playfair, the one name on the screen.     */
/*                                                                      */
/* NO ENTRANCE ANIMATION. The four blocks used to fade up in a stagger, */
/* and they are everything on the Stats screen under its title: a       */
/* Reanimated entrance that stalled after a cold start (it can, in      */
/* Release builds) left them at opacity 0, and the screen read as blank */
/* cream for the rest of the session. Content never waits on an         */
/* animation to be visible (specs/06-tab-switch-bug.md, cause 1).       */
/* ==================================================================== */

/* The ladder moved to lib/milestones — the collection store needs it too,
   and a store importing a component to get at a constant is backwards. */
export { MILESTONES, rankTitle } from '@/lib/milestones';

interface UnlockedEntry {
  drink: Drink;
  record: UnlockRecord;
}

export function deriveStats(unlocks: Record<string, UnlockRecord>) {
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, spirit: 0 };
  const byRarity: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };

  const entries: UnlockedEntry[] = [];
  for (const record of Object.values(unlocks)) {
    const drink = getDrink(record.drinkId);
    if (!drink) continue; // orphaned record — skip defensively
    entries.push({ drink, record });
    byCategory[drink.category] += 1;
    byRarity[drink.rarity] += 1;
  }

  // Highest rarity wins; ties go to the most recent log.
  let prize: UnlockedEntry | null = null;
  for (const entry of entries) {
    if (!prize) {
      prize = entry;
      continue;
    }
    const w = RARITY_META[entry.drink.rarity].weight;
    const pw = RARITY_META[prize.drink.rarity].weight;
    if (w > pw || (w === pw && Date.parse(entry.record.date) > Date.parse(prize.record.date))) {
      prize = entry;
    }
  }

  return { unlockedCount: entries.length, byCategory, byRarity, prize };
}

/*
 * The fewest entries at which each rung is held, by rankTitle's own test
 * (pct >= rung), so "11 to go" reaches 0 exactly when the rung is shown
 * reached. Asked of rankTitle rather than divided out: 10% of 2,089 is
 * 208.9, and floating point decides which side 209 falls. The first rung
 * is one entry (at 0 the rank is "Not started").
 */
const RUNG_AT: readonly number[] = MILESTONES.map((m) => {
  let at = Math.max(1, Math.ceil((m.pct / 100) * TOTAL));
  while (at > 1 && rankTitle(at - 1, TOTAL) === m.title) at -= 1;
  while (at < TOTAL && rankTitle(at, TOTAL) !== m.title) at += 1;
  return at;
});

/** The rarest entry's mounted thumbnail width and its chevron, for the name's measure. */
const PRIZE_THUMB = 44;
const PRIZE_CHEVRON = 18;
const CAP = 1.3;

/* ==================================================================== */
/* Component                                                            */
/* ==================================================================== */

export function CollectionStats({
  onOpenDrink,
  onOpenDex,
}: {
  onOpenDrink: (id: string) => void;
  /** Where a collection with nothing in it is sent to start. */
  onOpenDex?: () => void;
}) {
  const unlocks = useCollection((s) => s.unlocks);
  const { width } = useWindowDimensions();

  const { unlockedCount, byCategory, byRarity, prize } = useMemo(
    () => deriveStats(unlocks),
    [unlocks],
  );
  const pct = TOTAL > 0 ? Math.floor((unlockedCount / TOTAL) * 100) : 0;
  /*
   * Floored, so the first twenty entries of 2,089 all read 0% — "14 of
   * 2,089 collected, 0%" contradicts itself exactly when the reward loop
   * matters most. Under one percent says so.
   */
  const pctLabel = unlockedCount > 0 && pct === 0 ? '<1%' : `${pct}%`;
  const next = nextRank(unlockedCount);

  /*
   * The rarest entry's name column: the window less the screen's gutters,
   * the panel's padding and edges, the thumbnail, the chevron and the two
   * gaps between them. Worked out, so DrinkName fits a long name on the
   * first frame.
   */
  const prizeRule = prize ? RARITY_META[prize.drink.rarity].rule : null;
  const prizeMeasure =
    width -
    2 * layout.gutter -
    2 * space.md -
    2 * (prizeRule?.width ?? stroke.edge) -
    PRIZE_THUMB -
    PRIZE_CHEVRON -
    2 * space.md;

  return (
    <>
      {/* ---- Collection ---- */}
      <View>
        <SectionHeader title="Collection" style={styles.sectionHeader} />
        {/*
          A panel of the cabinet's lining: the one place on this screen
          that is the collection itself rather than a report on it. The rank
          and the figure are Inter (a reading, not a name); bone on lining,
          since wine there is 1.22:1.
        */}
        <LiningBand radius={12} style={styles.panel}>
          <Text style={[textRole.shelfTitle, styles.onLining]}>
            {rankTitle(unlockedCount, TOTAL)}
          </Text>
          <View style={styles.figure}>
            <HeroFigure
              value={unlockedCount}
              caption={`of ${formatCount(TOTAL)} collected · ${pctLabel}`}
              tone="lining"
            />
          </View>
          {next && unlockedCount > 0 ? (
            <Text style={[textRole.helper, styles.onLiningMuted, tabular]}>
              {`${formatCount(next.toGo)} to ${next.title}`}
            </Text>
          ) : null}
          <View style={styles.panelBar}>
            <ProgressBar value={unlockedCount} max={TOTAL} tone="lining" />
          </View>

          {/*
            With nothing logged, every number on this page is a zero and
            none of them says how to change it. The rest of the page stays —
            the plates and the ladder are what there is to aim for — but the
            first block gets the way in.
          */}
          {unlockedCount === 0 && onOpenDex ? (
            <View style={styles.start}>
              <Text style={[textRole.helper, styles.onLiningMuted]}>
                Open any entry in the Dex and tap Log this drink to start your collection.
              </Text>
              <Button variant="onLining" label="Open the Dex" onPress={onOpenDex} />
            </View>
          ) : null}

          <View style={styles.panelRule} />

          {/*
            Bone bars for both categories: the category colours are merlot
            and espresso, which vanish on the lining. The name beside each
            bar says which it is.
          */}
          <View style={styles.categoryList}>
            {CATEGORY_ORDER.map((category) => {
              const meta = CATEGORY_META[category];
              const total = COUNT_BY_CATEGORY[category];
              const count = byCategory[category];
              return (
                /*
                 * `accessible` makes the row one VoiceOver element that
                 * speaks its label. Without it iOS ignores the label and
                 * reads the children one by one.
                 */
                <View
                  key={category}
                  accessible
                  accessibilityLabel={`${meta.plural}: ${count} of ${total} collected`}>
                  <View style={styles.categoryHead}>
                    <Text style={[styles.categoryName, styles.onLining]}>{meta.plural}</Text>
                    <Text style={[styles.categoryCount, styles.onLiningMuted]}>
                      {formatCount(count)} of {formatCount(total)}
                    </Text>
                  </View>
                  <ProgressBar value={count} max={total} tone="lining" />
                </View>
              );
            })}
          </View>
        </LiningBand>
      </View>

      {/* ---- Rarity ---- */}
      <View>
        <SectionHeader title="Rarity breakdown" style={styles.sectionHeader} />
        {/*
          Four plates, two by two: each tier's word and mark, then how many
          of the index's entries in it you hold. The "of N" is the index,
          the same for everyone; the figure is yours, the one number that
          moves as you play. It replaces a donut whose ring was index shares
          and whose centre "2,089" was set in Playfair.

          Legendary's plate takes a gilt edge, the metal that means
          legendary everywhere; the others the plain card edge.
        */}
        <View style={styles.plates}>
          {RARITY_ORDER.map((rarity) => {
            const have = byRarity[rarity];
            const of = COUNT_BY_RARITY[rarity];
            return (
              <View
                key={rarity}
                style={styles.plateCell}
                accessible
                accessibilityLabel={`${RARITY_META[rarity].label}, ${formatCount(have)} of ${formatCount(of)} collected`}>
                <Card surface="mat" style={[styles.plate, rarity === 'legendary' && styles.plateLegendary]}>
                  <TierWord rarity={rarity} tone="paper" />
                  <Text style={styles.plateFigure}>
                    <Text style={[textRole.count, styles.plateCount]}>{formatCount(have)}</Text>
                    <Text style={styles.plateOf}>{` of ${formatCount(of)}`}</Text>
                  </Text>
                </Card>
              </View>
            );
          })}
        </View>
      </View>

      {/* ---- Milestones ---- */}
      <View>
        <SectionHeader title="Milestones" style={styles.sectionHeader} />
        <Card style={styles.blockTight}>
          {MILESTONES.map((m, i) => {
            const at = RUNG_AT[i]!;
            const reached = unlockedCount >= at;
            const toGo = at - unlockedCount;
            const spokenTarget = m.pct === 0 ? 'first entry' : `${m.pct} percent`;
            return (
              /*
               * `accessible`, so VoiceOver reads the label — the only place
               * reached or not reached is said in words. The mark is an
               * unlabelled checkbox: an empty box with a control edge, or
               * wine with a bone check.
               */
              <View
                key={m.title}
                accessible
                style={styles.milestoneRow}
                accessibilityLabel={`${m.title}, ${spokenTarget}, ${
                  reached ? 'reached' : `${formatCount(toGo)} to go`
                }`}>
                <View style={[styles.milestoneMark, reached && styles.milestoneMarkReached]}>
                  {reached ? <Icon name="check" size={14} color={colors.textOnWine} filled /> : null}
                </View>
                <Text style={[styles.milestoneName, !reached && styles.milestoneNameDim]}>
                  {m.title}
                </Text>
                {/* How far, not where: a percentage of 2,089 is not a number anyone counts toward. */}
                <Text style={styles.milestoneLeft}>
                  {reached ? 'Reached' : `${formatCount(toGo)} to go`}
                </Text>
              </View>
            );
          })}
        </Card>
      </View>

      {/* ---- Rarest entry ---- */}
      {prize && prizeRule ? (
        <View>
          <SectionHeader title="Rarest entry" style={styles.sectionHeader} />
          <Pressable
            onPress={() => onOpenDrink(prize.drink.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${prize.drink.name}, your rarest entry, ${RARITY_META[prize.drink.rarity].label}`}
            /*
             * Framed in the entry's own tier rule, as its mount is printed:
             * wine for rare, gilt for legendary, the plain edge below that.
             *
             * A row you tap, so it answers with its fill, not a scale:
             * shrinking is for media tiles.
             */
            style={({ pressed }) => [
              styles.prize,
              { borderColor: prizeRule.color, borderWidth: prizeRule.width },
              pressed && styles.prizePressed,
            ]}>
            {/* Your pour, else the lit catalogue photo, else the lit vector face, decoded at 44pt. */}
            <DexThumb drink={prize.drink} photoUri={prize.record.photoUri} />
            <View style={styles.prizeBody}>
              <DrinkName
                name={prize.drink.name}
                role={textRole.miniName}
                measure={prizeMeasure}
                cap={CAP}
                color={colors.text}
              />
              <View style={styles.prizePlates}>
                <NumberPlate n={prize.drink.dexNumber} tone="paper" />
                <TierWord rarity={prize.drink.rarity} tone="paper" />
              </View>
            </View>
            <Icon name="chevronRight" size={PRIZE_CHEVRON} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { marginTop: space.xl, marginBottom: space.md },
  blockTight: { paddingHorizontal: space.lg, paddingVertical: space.xs },

  /* Collection, on the lining */
  panel: { padding: space.lg },
  onLining: { color: colors.onLining },
  onLiningMuted: { color: colors.onLiningMuted },
  figure: { marginTop: space.sm },
  panelBar: { marginTop: space.md },
  panelRule: { height: stroke.edge, backgroundColor: colors.liningLine, marginVertical: space.lg },
  start: { marginTop: space.lg, gap: space.md },

  categoryList: { gap: space.md },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginBottom: space.sm,
  },
  categoryName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
  },
  categoryCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    ...tabular,
  },

  /* Rarity plates, two by two */
  plates: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  /* Two to a row: half the row less half the gap. */
  plateCell: { flexBasis: '47%', flexGrow: 1 },
  plate: { flexGrow: 1, paddingHorizontal: space.md, paddingVertical: 10, gap: space.xs },
  plateLegendary: { borderColor: colors.gilt },
  plateFigure: { ...tabular },
  plateCount: { color: colors.text },
  plateOf: { ...textRole.helper, color: colors.textMuted },

  /* Milestones */
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  /*
   * The checkbox anatomy: a 20pt square at the badge radius, a control edge
   * (3.91:1 on white) while unreached, wine with a bone check once reached.
   * It was a pill-round disc with a lock in it, a second glyph saying what
   * the row's ink and weight already say.
   */
  milestoneMark: {
    width: 20,
    height: 20,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneMarkReached: { backgroundColor: colors.wine, borderColor: colors.wine },
  milestoneName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  /*
   * textMuted, not textFaint, here and on the counts: both are small text,
   * and the unreached names are content — for most users, most of the
   * ladder. Reached still differs by ink, weight and mark (a wine box with
   * a check against an empty one).
   */
  milestoneNameDim: { fontFamily: fonts.body, color: colors.textMuted },
  milestoneLeft: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textMuted,
    ...tabular,
  },

  /* The frame is set per tier on the element. */
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
  },
  prizePressed: { backgroundColor: colors.bgSunk },
  prizeBody: { flex: 1, gap: space.sm },
  prizePlates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.sm,
    rowGap: space.xs,
  },
});
