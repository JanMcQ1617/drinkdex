import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DrinkArt } from '@/components/artwork';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { haptic, SearchField, SectionHeader } from '@/components/ui';
import { colors, dexNumber, fonts, layout, space, stroke } from '@/constants/theme';
import { formatDexNumber, getDrink } from '@/data';
import { MAX_RESULTS, searchCatalogue } from '@/lib/drinkSearch';
import { useCollection } from '@/store/collection';
import type { Drink } from '@/types';

/** How many of your own recent drinks the sheet offers before you type. */
const RECENT = 20;

/**
 * Picks the Dex drink a reel is tagged with.
 *
 * Before anything is typed it offers your twenty most recent unlocks: the
 * drink you are filming is most likely one you just logged. Typing
 * searches the whole Dex with the log sheet's own ranking (lib/drinkSearch),
 * so a name finds the same drink here as there.
 *
 * Dex drinks only. A drink someone added themselves lives on their phone
 * until it joins the catalogue, and a reel tagged with an id nobody else
 * has would show everyone else no chip at all, so the no-match line says
 * so rather than leaving the person to wonder.
 *
 * A page sheet, on paper: it is a list to read, laid over the dark
 * review screen, and it swipes down to close like every other sheet.
 */
export function DrinkTagSheet({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (drink: Drink) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const unlocks = useCollection((s) => s.unlocks);

  const typed = query.trim().length > 0;
  const rows: Drink[] = typed
    ? searchCatalogue(query, MAX_RESULTS).rows
    : Object.values(unlocks)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, RECENT)
        .flatMap((r) => {
          const drink = getDrink(r.drinkId);
          return drink ? [drink] : [];
        });

  const close = () => {
    setQuery('');
    onClose();
  };

  const pick = (drink: Drink) => {
    haptic.select();
    setQuery('');
    onPick(drink);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.sheet}>
        <ScreenTopBar
          title="Tag a drink"
          inset="sheet"
          left={<TopBarTextButton label="Cancel" muted onPress={close} />}
          showRule
        />
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Name, style or country"
          accessibilityLabel="Search the Dex"
          autoFocus
          style={styles.search}
        />
        <FlatList
          data={rows}
          keyExtractor={(d) => d.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            !typed && rows.length > 0 ? (
              <SectionHeader title="From your Dex" size="group" style={styles.groupHeader} />
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {typed
                ? `No drink called “${query.trim()}” in the Dex. Only Dex drinks can be tagged for now.`
                : 'Search the Dex for the drink in your reel.'}
            </Text>
          }
          renderItem={({ item }) => <DrinkRow drink={item} onPress={() => pick(item)} />}
        />
      </View>
    </Modal>
  );
}

function DrinkRow({ drink, onPress }: { drink: Drink; onPress: () => void }) {
  const number = formatDexNumber(drink.dexNumber);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, number ${drink.dexNumber}${drink.subcategory ? `, ${drink.subcategory}` : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <DrinkArt drink={drink} size={32} flat />
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {drink.name}
          </Text>
          <Text style={dexNumber}>{number}</Text>
        </View>
        {drink.subcategory ? (
          <Text style={styles.sub} numberOfLines={1}>
            {drink.subcategory}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  search: { marginHorizontal: layout.gutter, marginTop: space.md, marginBottom: space.sm },
  list: { paddingBottom: space.xxxl },
  groupHeader: { marginTop: space.md, marginBottom: space.xs },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.xs,
    borderBottomWidth: stroke.hair,
    borderBottomColor: colors.line,
  },
  rowPressed: { backgroundColor: colors.bgSunk },
  rowText: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  name: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  empty: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingTop: space.xl,
    textAlign: 'center',
  },
});
