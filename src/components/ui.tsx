import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { CATEGORY_META, RARITY_META, colors, fonts } from '@/constants/theme';
import type { DrinkCategory, Rarity } from '@/types';

/** Small colored rarity tag, e.g. ● Rare */
export function RarityBadge({ rarity, compact }: { rarity: Rarity; compact?: boolean }) {
  const meta = RARITY_META[rarity];
  return (
    <View style={[styles.badge, { borderColor: meta.color + '55' }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      {!compact && <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>}
    </View>
  );
}

/** Category chip, e.g. 🍸 Cocktail */
export function CategoryPill({ category }: { category: DrinkCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <View style={[styles.badge, { borderColor: meta.color + '55' }]}>
      <Text style={styles.pillEmoji}>{meta.emoji}</Text>
      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

/** Uppercase, letterspaced section label */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={style}>
      <Text style={styles.sectionLabel}>{children}</Text>
    </View>
  );
}

/** Thin horizontal progress bar */
export function ProgressBar({
  value,
  max,
  color = colors.gold,
  height = 6,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.barFill,
          { width: `${pct}%`, backgroundColor: color, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  pillEmoji: { fontSize: 11 },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  barTrack: {
    width: '100%',
    backgroundColor: colors.cardBorder,
    overflow: 'hidden',
  },
  barFill: { height: '100%' },
});
