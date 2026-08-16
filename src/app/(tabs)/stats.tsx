import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollectionStats } from '@/components/CollectionStats';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { colors, fonts, space, type as typeScale } from '@/constants/theme';

/**
 * The Stats tab.
 *
 * Deliberately NOT behind AuthGate: everything here reads the local
 * collection, which works signed out — an account is only needed for the
 * social surfaces.
 */
export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const openDrink = useCallback(
    (id: string) => router.push({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Stats</Text>
      <Text style={styles.subtitle}>How the collection is coming along.</Text>

      <CollectionStats onOpenDrink={openDrink} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.display.fontSize,
    lineHeight: typeScale.display.lineHeight,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginTop: space.xs,
  },
});
