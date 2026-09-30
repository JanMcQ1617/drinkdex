import { useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useRef } from 'react';
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
  const openDex = useCallback(() => router.navigate('/dex'), [router]);

  // Tapping the Stats tab while already on it scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      {/*
        The Dex tab's title, size for size, and no subtitle. This was the one
        tab title at display size, so moving between two neighbouring tabs
        made the heading jump 8pt; and its subtitle, "How the collection is
        coming along.", restated the screen's name — the reason the Dex
        dropped its own. The first section label's margin spaces what
        follows.
      */}
      <Text style={styles.title} accessibilityRole="header">
        Stats
      </Text>

      <CollectionStats onOpenDrink={openDrink} onOpenDex={openDex} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
  },
});
