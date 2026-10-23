import { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ResultRow } from '@/components/log/ResultRow';
import { WithScrollEdges } from '@/components/log/scrollEdges';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { haptic, SearchField, SectionHeader } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
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
 * searches the whole Dex with the + window's own ranking (lib/drinkSearch),
 * so a name finds the same drink here as there.
 *
 * Dex drinks only. A drink someone added themselves lives on their phone
 * until it joins the catalogue, and a reel tagged with an id nobody else
 * has would show everyone else no chip at all, so the no-match line says
 * so rather than leaving the person to wonder.
 *
 * A page sheet, on the page: it is a list to read, laid over the dark
 * review screen, and it swipes down to close like every other sheet. Its
 * rows are the + window's (log/ResultRow): a print and the name, which
 * wraps and is never cut; the number and style live on the drink page.
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
  const { width } = useWindowDimensions();

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
      {/* Inside the Modal, so each opening starts at the top with its rule off. */}
      <WithScrollEdges>
        {(edges) => (
          <View style={styles.sheet}>
            <ScreenTopBar
              title="Tag a drink"
              inset="sheet"
              left={<TopBarTextButton label="Cancel" muted onPress={close} />}
              showRule={false}
            />
            {/* The search heads the list with the bar; its rule shows once the rows scroll under it. */}
            <View style={[styles.head, edges.under && styles.headRuled]}>
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Type your drink"
                accessibilityLabel="Search for a drink to tag, by name, style or country"
                autoFocus
                style={styles.search}
              />
            </View>
            <FlatList
              data={rows}
              keyExtractor={(d) => d.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScroll={edges.onScroll}
              scrollEventThrottle={16}
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
              renderItem={({ item }) => (
                <ResultRow
                  drink={item}
                  chosen={false}
                  width={width}
                  spoken={`${item.name}, number ${item.dexNumber}`}
                  onPress={pick}
                />
              )}
            />
          </View>
        )}
      </WithScrollEdges>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  /* Always laid out, transparent at rest, so the rule moves nothing when it shows. */
  head: { borderBottomWidth: stroke.edge, borderBottomColor: 'transparent' },
  headRuled: { borderBottomColor: colors.line },
  search: { marginHorizontal: layout.gutter, marginTop: space.md, marginBottom: space.sm },
  list: { paddingBottom: space.xxxl },
  /* A group head insets its own 16 (it was drawn for a panel), so this lands its words on the gutter, over the thumbs. */
  groupHeader: { marginTop: space.md, marginBottom: space.xs, marginHorizontal: layout.gutter - space.lg },
  empty: {
    ...textRole.body,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingTop: space.xl,
    textAlign: 'center',
  },
});
