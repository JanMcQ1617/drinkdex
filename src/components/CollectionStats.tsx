import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import {
  Button,
  Card,
  Divider,
  PressableScale,
  ProgressBar,
  RarityBadge,
  SectionLabel,
} from '@/components/ui';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  colors,
  dexNumber,
  fonts,
  motion,
  radius,
  RARITY_META,
  space,
  type as typeScale,
} from '@/constants/theme';
import { COUNT_BY_CATEGORY, COUNT_BY_RARITY, getDrink, formatCount, formatDexNumber, TOTAL } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import { RarityDonut } from '@/components/RarityDonut';
import { MILESTONES, rankTitle } from '@/lib/milestones';
import { useCollection } from '@/store/collection';
import type { Drink, DrinkCategory, Rarity, UnlockRecord } from '@/types';

/* ==================================================================== */
/* Collection stats                                                     */
/*                                                                      */
/* The four blocks — Collection, Rarity, Milestones, Rarest entry —     */
/* extracted from the profile so the Stats tab and any future surface   */
/* render the identical thing. Reads the LOCAL collection; a peer's     */
/* stats are a different, post-derived view (see PeerProfile.tsx).      */
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
  const reduced = useReducedMotion();
  const unlocks = useCollection((s) => s.unlocks);

  const { unlockedCount, byCategory, byRarity, prize } = useMemo(
    () => deriveStats(unlocks),
    [unlocks],
  );
  const pct = TOTAL > 0 ? Math.floor((unlockedCount / TOTAL) * 100) : 0;

  /*
   * The rarest entry's face follows the Dex card's order — your pour, else
   * the stock photograph, else the vector art. It skipped the middle step,
   * so a photographed drink showed as a photo on one tab and as a drawing
   * on the next.
   */
  const prizePhoto = prize
    ? prize.record.photoUri
      ? { uri: prize.record.photoUri }
      : drinkPhoto(prize.drink.id)
    : undefined;
  const prizeRarity = prize ? RARITY_META[prize.drink.rarity] : null;

  const enter = (delay: number) =>
    reduced ? undefined : FadeInDown.duration(motion.base).delay(delay);

  return (
    <>
      {/* ---- Collection ---- */}
      <Animated.View entering={enter(0)}>
        <SectionLabel style={styles.sectionLabel}>Collection</SectionLabel>
        <Card style={styles.block}>
          <Text style={styles.rank}>{rankTitle(unlockedCount, TOTAL)}</Text>
          <View style={styles.rankCountRow}>
            <Text style={styles.rankCount}>{formatCount(unlockedCount)}</Text>
            {/* "Collected", as the Dex says it: one state, one word. */}
            <Text style={styles.rankTotal}>of {formatCount(TOTAL)} collected</Text>
            {/*
              Floored, so the first twenty entries of 2,089 all read 0% — "14
              of 2,089 collected, 0%" contradicts itself exactly when the
              reward loop matters most. Under one percent says so.
            */}
            <Text style={styles.rankPct}>
              {unlockedCount > 0 && pct === 0 ? '<1%' : `${pct}%`}
            </Text>
          </View>
          <ProgressBar value={unlockedCount} max={TOTAL} color={colors.wine} />

          {/*
            With nothing logged, every number on this page is a zero and
            none of them says how to change it. The rest of the page stays —
            the donut and the ladder are what there is to aim for — but the
            first block gets the way in.
          */}
          {unlockedCount === 0 && onOpenDex ? (
            <View style={styles.start}>
              <Text style={styles.startBody}>
                Open any entry in the Dex and tap Log this drink to start your collection.
              </Text>
              <Button variant="secondary" label="Open the Dex" onPress={onOpenDex} />
            </View>
          ) : null}

          <Divider style={styles.blockDivider} />

          {/*
            A gap on the list rather than a margin on each row: the margin
            also fell under the last row and gave the card 28pt of padding
            at the foot against 16 at the head.
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
                    <View style={[styles.categoryDot, { backgroundColor: meta.color }]} />
                    <Text style={styles.categoryName}>{meta.plural}</Text>
                    <Text style={styles.categoryCount}>
                      {formatCount(count)}/{formatCount(total)}
                    </Text>
                  </View>
                  <ProgressBar value={count} max={total} color={meta.color} height={5} />
                </View>
              );
            })}
          </View>
        </Card>
      </Animated.View>

      {/* ---- Rarity ---- */}
      <Animated.View entering={enter(motion.stagger)}>
        <SectionLabel style={styles.sectionLabel}>Rarity breakdown</SectionLabel>
        <Card style={styles.block}>
          {/*
            The RING is the whole index, not the user's own spread. It
            answers "what is out there to find", which is a fixed shape, and
            feeding it `byRarity` instead would leave a new account staring
            at an empty ring, which says nothing about the Dex at all.

            The LEGEND is the user's: how many of each tier they hold. The
            four rows the ring replaced carried exactly that, and the ring
            alone showed only index shares — the same numbers for every
            user on every day — so the one chart on this tab never moved as
            you played. The Collection block above has totals and
            categories; per-tier progress lives here.

            The card's full padding, not the list-row padding the milestones
            use: the ring is 128pt with no margin of its own, and at 4pt it
            nearly touched the card's top and bottom.
          */}
          <RarityDonut counts={COUNT_BY_RARITY} collected={byRarity} caption="Total" />
        </Card>
      </Animated.View>

      {/* ---- Milestones ---- */}
      <Animated.View entering={enter(motion.stagger * 2)}>
        <SectionLabel style={styles.sectionLabel}>Milestones</SectionLabel>
        <Card style={styles.blockTight}>
          {MILESTONES.map((m) => {
            const reached = unlockedCount > 0 && pct >= m.pct;
            /*
             * The first rung is reached by one entry, not by a percentage;
             * printed as "0%" beside a lock it read as already achieved.
             */
            const target = m.pct === 0 ? '1 entry' : `${m.pct}%`;
            const spokenTarget = m.pct === 0 ? 'first entry' : `${m.pct} percent`;
            return (
              /*
               * `accessible`, so VoiceOver reads the label — the only place
               * reached or not reached is said in words. The check and the
               * lock are unlabelled glyphs.
               */
              <View
                key={m.title}
                accessible
                style={styles.milestoneRow}
                accessibilityLabel={`${m.title}, ${spokenTarget}, ${reached ? 'reached' : 'not reached'}`}>
                <View
                  style={[
                    styles.milestoneMark,
                    reached && {
                      backgroundColor: colors.wineWash,
                      borderColor: colors.wineSoft,
                    },
                  ]}>
                  <Icon
                    name={reached ? 'check' : 'lock'}
                    size={13}
                    color={reached ? colors.wine : colors.textMuted}
                  />
                </View>
                <Text style={[styles.milestoneName, !reached && styles.milestoneNameDim]}>
                  {m.title}
                </Text>
                <Text style={styles.milestonePct}>{target}</Text>
              </View>
            );
          })}
        </Card>
      </Animated.View>

      {/* ---- Rarest entry ---- */}
      {prize && prizeRarity ? (
        <Animated.View entering={enter(motion.stagger * 3)}>
          <SectionLabel style={styles.sectionLabel}>Rarest entry</SectionLabel>
          <PressableScale
            onPress={() => onOpenDrink(prize.drink.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${prize.drink.name}, your rarest entry`}
            /*
             * Framed in the entry's own tier, as its Dex card is. It was
             * gilt whatever the tier — the legendary metal around a badge
             * that said Common, on the screen that explains rarity.
             */
            style={[
              styles.prize,
              { borderColor: prizeRarity.edge, borderWidth: prizeRarity.edgeWidth },
            ]}>
            <View
              style={[
                styles.prizeThumb,
                { backgroundColor: CATEGORY_META[prize.drink.category].wash },
              ]}>
              {prizePhoto ? (
                <Image
                  source={prizePhoto}
                  style={styles.prizeImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <DrinkArt drink={prize.drink} size={40} flat />
              )}
            </View>
            <View style={styles.prizeBody}>
              <View style={styles.prizeNameRow}>
                <Text style={styles.prizeName} numberOfLines={1}>
                  {prize.drink.name}
                </Text>
                <Text style={styles.prizeDex}>{formatDexNumber(prize.drink.dexNumber)}</Text>
              </View>
              <RarityBadge rarity={prize.drink.rarity} />
            </View>
            <Icon name="chevronRight" size={18} color={colors.textFaint} />
          </PressableScale>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
  block: { padding: space.lg },
  blockTight: { paddingHorizontal: space.lg, paddingVertical: space.xs },

  rank: {
    fontFamily: fonts.display,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.wine,
  },
  rankCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  rankCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.headline.fontSize,
    color: colors.text,
  },
  rankTotal: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  rankPct: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  blockDivider: { marginVertical: space.lg },

  start: { marginTop: space.lg, gap: space.md },
  startBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },

  categoryList: { gap: space.md },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  categoryCount: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textMuted,
  },

  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  milestoneMark: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.text,
  },
  /*
   * textMuted, not textFaint, here and on the percentages and the lock: all
   * of it is small text or a state glyph, and the unreached names are
   * content — for most users, most of the ladder.
   * Reached still differs by ink, weight and mark (check on wine wash
   * against lock on sunk).
   */
  milestoneNameDim: { fontFamily: fonts.body, color: colors.textMuted },
  milestonePct: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textMuted,
  },

  /* The frame is set per tier on the element. */
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  prizeThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeImage: { width: '100%', height: '100%' },
  prizeBody: { flex: 1, gap: space.sm },
  prizeNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  prizeName: {
    flex: 1,
    fontFamily: fonts.displayBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  /* The catalogue number's one stamp, as on the entry's Dex card. taupeInk
     on this white card is 5.89:1. */
  prizeDex: dexNumber,
});
