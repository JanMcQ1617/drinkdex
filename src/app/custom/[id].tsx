import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Paper } from '@/components/details/Paper';
import {
  CompositionSection,
  DexSinceRow,
  FieldNotes,
  HeroPrint,
  HeroRecord,
  OriginStory,
  PinnedPostBar,
  pinnedBarEstimate,
  ServeSection,
  serveRows,
  SpecSection,
  TastesOf,
  useMoreBelow,
} from '@/components/DrinkPanels';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Button, EmptyState, Hold } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { catalogueTwin, isCustomId, syncStatusLine, toDrink } from '@/lib/customDrinks';
import { customPhotoUri } from '@/lib/pour';
import { adoptCustom, flushSubmissions } from '@/lib/submissions';
import { useAuth } from '@/store/auth';
import { useCustomDrink, useCustomDrinks, useCustomPour } from '@/store/customDrinks';
import type { CustomDrink, UnlockRecord } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* A drink someone added                                                */
/*                                                                      */
/* The drink page's anatomy, for a drink that is not in the catalogue:  */
/* the same bar, square print, name, facts, spec and pinned key, drawn  */
/* by the same panels (components/DrinkPanels) so the two pages read as */
/* one app.                                                             */
/*                                                                      */
/* What differs, and why:                                               */
/*   - No Nº. A custom drink has none until Sipply adds it, and          */
/*     inventing one would say it had joined the Dex. Its plate says    */
/*     "Added by you" instead.                                          */
/*   - A status line under the facts: where the suggestion stands with  */
/*     Sipply (lib/customDrinks' syncStatusLine), the only place a      */
/*     refused or over-quota send is ever said.                         */
/*   - Edit and delete at the foot, since the person owns the entry.    */
/*   - The pinned key is ink, not the accent (v4.4): the + window it    */
/*     opens can only save a drink someone added, never post it, and    */
/*     the accent says post.                                            */
/*   - The first how-section opens with the pen's double rule and no    */
/*     figure (v4.9 C.5): the press's figure is a Dex number, and this  */
/*     drink has none.                                                  */
/*                                                                      */
/* The page and its bar lie on the paper's grain (v4.9 A.5), as the     */
/* drink page's do; loading and the unknown drink stay bare.            */
/*                                                                      */
/* The store is read with own keys only, so /custom/constructor is      */
/* nothing; until the store has loaded the page is a Hold, never a bare */
/* page (specs/06, rule 3).                                             */
/* ==================================================================== */

export default function CustomDrinkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = isCustomId(id) ? id : null;

  const hydrated = useCustomDrinks((s) => s.hydrated);
  const live = useCustomDrink(key);
  const livePour = useCustomPour(key);
  const signedIn = useAuth((s) => s.session != null);

  /*
   * What was on screen when the drink was deleted or moved into the Dex,
   * so the page stays drawn while it slides away instead of turning into
   * "Unknown drink" under the finger.
   */
  const [gone, setGone] = useState<{ drink: CustomDrink; pour: UnlockRecord | undefined } | null>(
    null,
  );
  /* The pinned bar's measured height, and the two rules, as on the drink page. */
  const [barH, setBarH] = useState(() => pinnedBarEstimate(insets.bottom));
  const [scrolled, onScrollTop] = useScrolledPast();
  const below = useMoreBelow();
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScrollTop(e);
    below.onScroll(e);
  };

  const drink = live ?? gone?.drink;
  const pour = live ? livePour : gone?.pour;

  const back = () => router.back();
  // `paper` on the page's own bar only (v4.9 A.5): loading and the unknown drink stay as they were.
  const bar = (title: string, paper = false) => (
    <ScreenTopBar
      title={title}
      titleVisible={false}
      showRule={scrolled}
      paper={paper}
      left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />}
    />
  );

  if (!hydrated) {
    return (
      <View style={styles.screen}>
        {bar('Your drink')}
        <Hold slowMessage="Still loading your drinks." />
      </View>
    );
  }

  if (!drink) {
    return (
      <View style={styles.screen}>
        {bar('Unknown drink')}
        <View style={styles.centered}>
          <EmptyState
            icon="search"
            title="Unknown drink"
            body="This drink isn't in your Dex."
            action={{ label: 'Back to the Dex', onPress: back }}
          />
        </View>
      </View>
    );
  }

  const cocktail = drink.category === 'cocktail';
  const drawn = toDrink(drink);
  const photo = pour?.photoUri || customPhotoUri(drink.photoFile);
  const status = syncStatusLine(drink, signedIn);
  /*
   * The catalogue gained a drink of this name, and Sipply has not marked
   * the suggestion yet (when it does, the app moves your photo over on its
   * own: lib/submissions). The person can do it themselves meanwhile.
   */
  const twin = catalogueTwin(drink.name);

  // The pinned key's door, for a first photo and another one alike: the + window with this drink chosen.
  const postIt = () => router.navigate({ pathname: '/log', params: { drink: drink.id } });

  const moveToDex = () => {
    if (!twin) return;
    setGone({ drink, pour });
    // Quiet: the person asked for this, so there is nothing to explain.
    if (!adoptCustom(drink.id, twin.id, { quiet: true })) {
      setGone(null);
      showNotice("Couldn't move it yet", 'Your collection is still loading. Try again in a moment.');
      return;
    }
    router.replace({ pathname: '/drink/[id]', params: { id: twin.id } });
  };

  const confirmDelete = () =>
    confirmDestructive(
      `Delete ${drink.name}?`,
      'It leaves your Dex with its photos and captions. If you sent it to Sipply, the suggestion is withdrawn.',
      'Delete',
      () => {
        setGone({ drink, pour });
        useCustomDrinks.getState().remove(drink.id);
        router.back();
        // The withdrawal goes in the background; it is retried until it lands.
        void flushSubmissions();
      },
    );

  const serve = drawn.serve;
  /*
   * Whether the serve guide draws a row (DrinkPanels' serveRows): its
   * glass is this drink's own glassware, which the facts already show, so
   * a guide with only a glass draws nothing, and the composition is then
   * the first how-section, the one the lead opens.
   */
  const showServe = !cocktail && serve != null && serveRows(serve, drawn).length > 0;
  const composition = drawn.composition;
  const showComposition = !cocktail && composition != null && composition.components.length > 0;

  return (
    <View style={styles.screen}>
      {/* The paper's grain under the page (v4.9 A.5): outside the scroll, so the page moves over a fixed sheet. */}
      <Paper />
      {/* No visible title: the name under the print is the page's title. The bar still speaks it. */}
      {bar(drink.name, true)}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: barH + space.xl }}
        onScroll={onScroll}
        onLayout={below.onLayout}
        onContentSizeChange={below.onContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {/* Your pour's photo first, then the one sent with the suggestion, then the no-photo face. */}
        <HeroPrint
          drink={drawn}
          photoUri={photo}
          accessibilityLabel={photo ? `Your photo of ${drink.name}` : `Drawing of ${drink.name}`}
        />

        {/* Ruled as a catalogue entry's record is (v4.6): one HeroRecord, both pages. */}
        <HeroRecord drink={drawn} inDex custom />

        {/* Where the suggestion stands. Ink only when the person has to act; no red in Daylight. */}
        {status ? (
          <Text style={[textRole.small, status.danger ? styles.ink : styles.muted, styles.status]}>{status.text}</Text>
        ) : null}

        {twin ? (
          <View style={styles.section}>
            <Text style={[textRole.bodyStrong, styles.ink]}>
              <Text style={textRole.nameInline}>{twin.name}</Text> is in the Dex now.
            </Text>
            <Text style={[textRole.body, styles.muted]}>Move your photo to the Dex entry and this copy goes.</Text>
            <Button label="Move my photo there" variant="secondary" block onPress={moveToDex} style={styles.twinKey} />
          </View>
        ) : null}

        {/* A custom drink is never posted (the + window keeps it to the phone), so this row never opens a post. */}
        {pour ? <DexSinceRow drink={drawn} record={pour} /> : null}
        <TastesOf notes={drink.tastingNotes} />

        {/* The first how-section drawn opens with the pen's double rule, and no figure: it has no number (v4.9 C.5). */}
        {cocktail && drawn.recipe && drink.ingredients.length > 0 ? (
          <SpecSection recipe={drawn.recipe} number={null} />
        ) : null}
        {showServe && serve ? <ServeSection serve={serve} drink={drawn} number={null} /> : null}
        {showComposition && composition ? (
          <CompositionSection composition={composition} number={showServe ? undefined : null} />
        ) : null}

        <FieldNotes description={drink.description} />
        {/* "The story" on the add-a-drink form is the drink's funFact, so it shows here. */}
        <OriginStory drink={drawn} />

        <View style={styles.footer}>
          <Button
            label="Edit details"
            variant="secondary"
            block
            onPress={() => router.push({ pathname: '/add-drink', params: { edit: drink.id } })}
            accessibilityLabel={`Edit the details of ${drink.name}`}
          />
          <Button
            label="Delete this drink"
            variant="dangerText"
            block
            onPress={confirmDelete}
            accessibilityLabel={`Delete ${drink.name}`}
          />
        </View>
      </ScrollView>

      <PinnedPostBar
        name={drink.name}
        collected={pour != null}
        ruled={below.moreBelow}
        postable={false}
        onPress={postIt}
        onHeight={setBarH}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center' },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },

  status: { marginTop: space.lg, paddingHorizontal: layout.gutter },

  /* The twin's note: a group of its own, set apart by space, with no panel round it. */
  section: { marginTop: layout.section, paddingHorizontal: layout.gutter, gap: space.sm },
  twinKey: { marginTop: space.sm },

  footer: {
    marginTop: layout.section,
    marginHorizontal: layout.gutter,
    gap: space.sm,
  },
});
