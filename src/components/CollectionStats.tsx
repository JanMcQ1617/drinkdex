import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, HeroFigure, LiningBand } from '@/components/cabinet';
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
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, formatCount, getDrink, TOTAL } from '@/data';
import { nextRank } from '@/lib/cabinet';
import { dexSinceLabel } from '@/lib/drinkLabels';
import { MILESTONES, rankTitle } from '@/lib/milestones';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Collection stats                                                     */
/*                                                                      */
/* The three blocks — Collection, Milestones, First in your Dex —       */
/* extracted from the profile so the Stats screen and any future        */
/* surface render the identical thing. Reads the LOCAL collection; a    */
/* peer's stats are a different, post-derived view (see PeerProfile).   */
/*                                                                      */
/* v3 (specs/v3-cabinet.md §9.13.4): the collection itself is a panel   */
/* of the cabinet's lining with the count as an Inter hero figure. The  */
/* first drink in your Dex is a mounted thumbnail with its name in      */
/* Playfair, the one name on the screen. It took the old fourth block's */
/* place in v3.1 (spec §7): the first drink is the one fact about a     */
/* collection that never changes.                                       */
/*                                                                      */
/* NO ENTRANCE ANIMATION. The blocks used to fade up in a stagger,      */
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

/** A record's time for ordering; an unreadable date sorts after every readable one. */
function collectedAt(record: UnlockRecord): number {
  const t = Date.parse(record.date);
  return Number.isNaN(t) ? Infinity : t;
}

export function deriveStats(unlocks: Record<string, UnlockRecord>) {
  const byCategory: Record<DrinkCategory, number> = { cocktail: 0, spirit: 0 };
  let unlockedCount = 0;
  /*
   * The earliest entry still in the collection. A tie (two records saved
   * in the same millisecond, or two unreadable dates) goes to the lower
   * Dex number, so the answer does not depend on the store's key order.
   */
  let first: UnlockedEntry | null = null;

  for (const record of Object.values(unlocks)) {
    const drink = getDrink(record.drinkId);
    if (!drink) continue; // orphaned record — skip defensively
    unlockedCount += 1;
    byCategory[drink.category] += 1;
    if (
      !first ||
      collectedAt(record) < collectedAt(first.record) ||
      (collectedAt(record) === collectedAt(first.record) && drink.dexNumber < first.drink.dexNumber)
    ) {
      first = { drink, record };
    }
  }

  return { unlockedCount, byCategory, first };
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

/** The first entry's mounted thumbnail width (DexThumb's row size) and its chevron, for the name's measure. */
const FIRST_THUMB = 44;
const FIRST_CHEVRON = 18;
const CAP = 1.3;

/* ==================================================================== */
/* Component                                                            */
/* ==================================================================== */

export function CollectionStats({
  onOpenDrink,
}: {
  onOpenDrink: (id: string) => void;
}) {
  const router = useRouter();
  const unlocks = useCollection((s) => s.unlocks);
  const { width } = useWindowDimensions();

  const { unlockedCount, byCategory, first } = useMemo(() => deriveStats(unlocks), [unlocks]);
  const pct = TOTAL > 0 ? Math.floor((unlockedCount / TOTAL) * 100) : 0;
  /*
   * Floored, so the first twenty entries of 2,089 all read 0% — "14 of
   * 2,089 collected, 0%" contradicts itself exactly when the reward loop
   * matters most. Under one percent says so.
   */
  const pctLabel = unlockedCount > 0 && pct === 0 ? '<1%' : `${pct}%`;
  const next = nextRank(unlockedCount);

  /*
   * The first entry's name column: the window less the screen's gutters,
   * the row's padding and edges, the thumbnail, the chevron and the two
   * gaps between them. Worked out, so DrinkName fits a long name on the
   * first frame.
   */
  const firstMeasure =
    width -
    2 * layout.gutter -
    2 * space.md -
    2 * stroke.edge -
    FIRST_THUMB -
    FIRST_CHEVRON -
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
            With nothing collected, every number on this page is a zero and
            none of them says how to change it. The rest of the page stays
            (the ladder is what there is to aim for), but the first block
            gets the way in: the post sheet, where any drink can be picked,
            rather than a walk back to the Dex to find one.
          */}
          {unlockedCount === 0 ? (
            <View style={styles.start}>
              <Text style={[textRole.helper, styles.onLiningMuted]}>
                Post your first drink to start your collection.
              </Text>
              <Button
                variant="onLining"
                icon="plus"
                label="Post a drink"
                onPress={() => router.navigate('/log')}
              />
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

      {/* ---- First in your Dex ---- */}
      {first ? (
        <View>
          <SectionHeader title="First in your Dex" style={styles.sectionHeader} />
          <Pressable
            onPress={() => onOpenDrink(first.drink.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${first.drink.name}, the first drink in your Dex`}
            /*
             * A white row with the card edge. A row you tap, so it answers
             * with its fill, not a scale: shrinking is for media tiles.
             */
            style={({ pressed }) => [styles.first, pressed && styles.firstPressed]}>
            {/* Your photo, else the lit catalogue photo, else the lit vector face, decoded at 44pt. */}
            <DexThumb drink={first.drink} photoUri={first.record.photoUri} />
            <View style={styles.firstBody}>
              {/* No line limit: the row grows with a long name. */}
              <DrinkName
                name={first.drink.name}
                role={textRole.miniName}
                measure={firstMeasure}
                cap={CAP}
                color={colors.text}
              />
              {/* Uncapped: the row grows, and no measure depends on this line. */}
              <Text style={styles.firstSince}>{dexSinceLabel(first.record.date)}</Text>
            </View>
            <Icon name="chevronRight" size={FIRST_CHEVRON} color={colors.textFaint} />
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

  /* First in your Dex: a white row on the card edge, as every Card. */
  first: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    borderColor: colors.line,
  },
  firstPressed: { backgroundColor: colors.bgSunk },
  firstBody: { flex: 1, gap: space.xs },
  firstSince: { ...textRole.helper, color: colors.textMuted },
});
