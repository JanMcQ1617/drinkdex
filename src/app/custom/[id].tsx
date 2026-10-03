import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
import {
  CompositionPanel,
  DrinkTitle,
  FieldNotes,
  MetaRow,
  NotLoggedCard,
  RecipePanel,
  sentence,
  ServePanel,
  TastingNotes,
  YourPour,
} from '@/components/DrinkPanels';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import {
  Button,
  Card,
  CategoryTag,
  EmptyState,
  Hold,
  MediaIconButton,
} from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  fonts,
  layout,
  space,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { catalogueTwin, formatAbv, isCustomId, syncStatusLine, toDrink } from '@/lib/customDrinks';
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
/* the photograph, the name, the facts, the pour, the recipe or the     */
/* bottle, drawn by the same panels (components/DrinkPanels) so the two */
/* pages read as one app.                                               */
/*                                                                      */
/* What differs, and why:                                               */
/*   - No dex number and no rarity. A custom drink has neither until    */
/*     Sipply adds it, and inventing them would say it had joined the   */
/*     Dex. The line above the name says whose it is instead.           */
/*   - A status line under the tags: where the suggestion stands with   */
/*     Sipply (lib/customDrinks' syncStatusLine), the only place a      */
/*     refused or over-quota send is ever said.                         */
/*   - No parallax. The hero is a fixed 4:3 band; the person's own photo */
/*     or the drawn glass, nothing to slide behind.                     */
/*   - Edit and delete at the foot, since the person owns the entry.    */
/*                                                                      */
/* The store is read with own keys only, so /custom/constructor is      */
/* nothing; until the store has loaded the page is a Hold, never a bare */
/* page (specs/06, rule 3).                                             */
/* ==================================================================== */

export default function CustomDrinkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = isCustomId(id) ? id : null;

  const hydrated = useCustomDrinks((s) => s.hydrated);
  const live = useCustomDrink(key);
  const livePour = useCustomPour(key);
  const signedIn = useAuth((s) => s.session != null);

  /*
   * What was on screen when the drink was deleted or moved into the Dex,
   * so the page stays drawn while it slides away instead of turning into
   * "Unknown entry" under the finger.
   */
  const [gone, setGone] = useState<{ drink: CustomDrink; pour: UnlockRecord | undefined } | null>(
    null,
  );
  const drink = live ?? gone?.drink;
  const pour = live ? livePour : gone?.pour;

  const back = () => router.back();

  if (!hydrated) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar
          title="Your drink"
          showRule={false}
          left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />}
        />
        <Hold slowMessage="Still loading your drinks." />
      </View>
    );
  }

  if (!drink) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          icon="search"
          title="Unknown entry"
          body="This drink isn't in your Dex."
          action={{ label: 'Back to the Dex', onPress: back }}
        />
      </View>
    );
  }

  const cocktail = drink.category === 'cocktail';
  const drawn = toDrink(drink);
  const photo = pour?.photoUri || customPhotoUri(drink.photoFile);
  const status = syncStatusLine(drink, signedIn);
  /*
   * The catalogue gained a drink of this name, and Sipply has not marked
   * the suggestion yet (when it does, the app moves the pour over on its
   * own: lib/submissions). The person can do it themselves meanwhile.
   */
  const twin = catalogueTwin(drink.name);

  const facts = [
    formatAbv(drink.abvLow, drink.abvHigh),
    drink.origin,
    cocktail && drink.glassware ? sentence(drink.glassware) : null,
  ].filter((f): f is string => Boolean(f));

  const logIt = () => router.navigate({ pathname: '/log', params: { drink: drink.id } });

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
      'It leaves your Dex with its photos and notes. If you sent it to Sipply, the suggestion is withdrawn.',
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
  const showServe =
    !cocktail &&
    serve != null &&
    Boolean(serve.temp || serve.how || serve.glass || (serve.pair && serve.pair.length > 0));

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/*
          Full bleed, up under the status bar, 4:3. Your pour's photo first,
          then the one sent with the suggestion, then the drawn glass on the
          category's wash.
        */}
        <View
          style={[
            styles.hero,
            { height: Math.round(width * 0.75), backgroundColor: CATEGORY_META[drink.category].wash },
            photo ? null : { paddingTop: insets.top + space.xl },
          ]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={photo ? `Your photo of ${drink.name}` : `Illustration of ${drink.name}`}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={styles.heroPhoto}
              contentFit="cover"
              transition={160}
              accessible={false}
            />
          ) : (
            <DrinkArt drink={drawn} size={150} />
          )}
        </View>

        <View
          style={[styles.page, { paddingBottom: Math.max(insets.bottom, space.xl) + space.xxxl }]}>
          <DrinkTitle eyebrow={`Added by you · ${drink.subcategory}`} name={drink.name} facts={facts} />
          <MetaRow>
            <CategoryTag category={drink.category} />
          </MetaRow>

          {status ? (
            <Text style={[styles.status, status.danger && styles.statusDanger]}>{status.text}</Text>
          ) : null}

          {twin ? (
            <Card style={styles.twin}>
              <Text style={styles.twinTitle}>{twin.name} is in the Dex now.</Text>
              <Text style={styles.twinBody}>Move your pour to the Dex entry and this copy goes.</Text>
              <Button label="Move my pour there" variant="secondary" onPress={moveToDex} />
            </Card>
          ) : null}

          {pour ? (
            <YourPour record={pour} />
          ) : (
            <NotLoggedCard
              title="Not logged yet"
              body="Snap a photo when you have it, and the pour is kept with this drink."
              onLog={logIt}
              accessibilityLabel={`Log ${drink.name}`}
            />
          )}

          <TastingNotes notes={drink.tastingNotes} />

          {cocktail && drawn.recipe && drink.ingredients.length > 0 ? (
            <RecipePanel recipe={drawn.recipe} />
          ) : null}
          {!cocktail && drawn.composition && drawn.composition.components.length > 0 ? (
            <CompositionPanel composition={drawn.composition} />
          ) : null}
          {showServe && serve ? <ServePanel serve={serve} /> : null}

          <FieldNotes description={drink.description} funFact={drink.funFact} />

          <View style={styles.footer}>
            {pour ? (
              <Button
                label="Update photo"
                variant="secondary"
                icon="camera"
                block
                onPress={logIt}
                accessibilityLabel={`Update your photo of ${drink.name}`}
              />
            ) : null}
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
        </View>
      </ScrollView>

      {/*
        Pinned over the photograph, as on the drink page: the media icon
        button, which holds on a white photo and a dark one alike.
      */}
      <MediaIconButton
        icon="chevronLeft"
        label="Back"
        onPress={back}
        style={[styles.backButton, { top: insets.top + space.sm }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: 'center' },

  hero: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroPhoto: { width: '100%', height: '100%' },

  /* The drink page's page: opaque ground and the screen gutter. */
  page: {
    backgroundColor: colors.bg,
    paddingHorizontal: layout.gutter,
    paddingTop: space.xl,
  },

  backButton: {
    position: 'absolute',
    left: space.md,
    zIndex: 2,
  },

  /* Where the suggestion stands. Red only when the person has to act. */
  status: {
    ...textRole.helper,
    color: colors.textMuted,
    marginTop: space.md,
  },
  statusDanger: { color: colors.danger },

  twin: {
    padding: space.lg,
    gap: space.sm,
    marginTop: space.xl,
  },
  twinTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
  twinBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginBottom: space.xs,
  },

  footer: {
    marginTop: space.xxl,
    gap: space.sm,
  },
});
