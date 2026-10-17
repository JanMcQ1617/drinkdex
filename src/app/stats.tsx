import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollectionStats } from '@/components/CollectionStats';
import { requestDexFilter } from '@/components/dex/dexFilter';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { colors, layout, space } from '@/constants/theme';
import { useCustomDrinks } from '@/store/customDrinks';

/**
 * Dex progress (layout spec 5.2 and 7): the ruler, the title, the latest
 * entry and "See your 38", which the less-stuff layout took off the Dex
 * and Profile and put one tap away. Pushed from the Dex's "38 / 2,089"
 * and Profile's "38 entries in your Dex ›". The route keeps its old path,
 * /stats: a new route file would need Metro to regenerate the typed routes.
 *
 * A pushed screen's bar holds the back chevron and nothing else (layout
 * spec 4): the panel's "38 of 2,089 in the Dex" is the page's title, as
 * the drink name is the post detail's. The bar still speaks "Dex progress".
 *
 * Deliberately NOT behind AuthGate: everything here reads the local
 * collection, which works signed out.
 */
export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scrolled, onScroll] = useScrolledPast();

  /*
   * Back to whatever opened it, the Dex or Profile. With nothing under it
   * (a link straight here), to the Dex rather than to a dead end.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  const openDrink = useCallback(
    (id: string) => router.navigate({ pathname: '/drink/[id]', params: { id } }),
    [router],
  );
  const openCustom = useCallback(
    (id: string) => router.navigate({ pathname: '/custom/[id]', params: { id } }),
    [router],
  );

  /*
   * Back from the add-a-drink form opened by "Add a drink" here. The form
   * leaves a note for the screen underneath saying where to go next (the
   * entry just added, or the catalogue drink it pointed at); taken here, so
   * it is not left for the Dex to act on later, out of the blue.
   */
  useFocusEffect(
    useCallback(() => {
      const h = useCustomDrinks.getState().takeHandoff('dex');
      if (!h) return;
      if (h.kind === 'custom') router.navigate({ pathname: '/custom/[id]', params: { id: h.id } });
      else router.navigate({ pathname: '/drink/[id]', params: { id: h.id } });
    }, [router]),
  );

  /* The Dex filtered to Logged: a note it takes on focus (dexFilter says why it is not a param). */
  const seeCaught = useCallback(() => {
    requestDexFilter({ status: 'unlocked' });
    router.navigate('/dex');
  }, [router]);

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Dex progress"
        titleVisible={false}
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={leave} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        <CollectionStats
          onOpenDrink={openDrink}
          onOpenCustom={openCustom}
          onSeeCaught={seeCaught}
          onPost={() => router.navigate('/log')}
          onAddDrink={() => router.push({ pathname: '/add-drink', params: { from: 'shelf' } })}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: space.sm },
});
