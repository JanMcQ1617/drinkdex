import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollectionStats } from '@/components/CollectionStats';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { colors, layout, space } from '@/constants/theme';

/**
 * Stats: how the collection is coming along.
 *
 * A pushed screen, opened from the Dex's top bar. It used to be a tab, but
 * it is a report on the Dex rather than a place visited every day, and a
 * sixth slot in the bar would have left each one too narrow for its label.
 * The path is the same as the tab's was, /stats.
 *
 * Deliberately NOT behind AuthGate: everything here reads the local
 * collection, which works signed out — an account is only needed for the
 * social surfaces.
 */
export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scrolled, onScroll] = useScrolledPast();

  /*
   * Back to whatever opened it, which is the Dex. With nothing under it (a
   * link straight here), to the Dex rather than to a dead end.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  const openDrink = useCallback(
    (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );

  return (
    <View style={styles.screen}>
      {/* The page's own grain, under everything: there is no global grain any more. */}
      <Grain />
      {/*
        The bar carries the title, so the page no longer prints its own
        "Stats" headline under it.
      */}
      <ScreenTopBar
        title="Stats"
        size="md"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={leave} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {/* An empty collection's way in is the post sheet, which the block opens itself. */}
        <CollectionStats onOpenDrink={openDrink} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
});
