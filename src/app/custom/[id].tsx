import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VectorFace } from '@/components/artwork/VectorFace';
import { LiningBand } from '@/components/cabinet';
import {
  CellarPage,
  CompositionCard,
  DexSinceRow,
  FieldNotes,
  heroHeight,
  HeroShade,
  HeroTitle,
  LabelBand,
  PinnedLogBar,
  pinnedBarEstimate,
  ServeCard,
  SpecCard,
  TastesOf,
  TriviaBand,
} from '@/components/DrinkPanels';
import { Grain } from '@/components/Grain';
import { FocusedStatusBar, ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { Button, EmptyState, Hold, MediaIconButton } from '@/components/ui';
import { colors, fonts, layout, space, textRole } from '@/constants/theme';
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
/* the same cellar ground, hero dissolve, title block, label band, spec */
/* card and pinned bar, drawn by the same panels (components/           */
/* DrinkPanels) so the two pages read as one app.                       */
/*                                                                      */
/* What differs, and why:                                               */
/*   - No dex number and no rarity. A custom drink has neither until    */
/*     Sipply adds it, and inventing them would say it had joined the   */
/*     Dex. The eyebrow's "Added by you" plate says whose it is instead. */
/*   - A status line under the label band: where the suggestion stands  */
/*     with Sipply (lib/customDrinks' syncStatusLine), the only place a */
/*     refused or over-quota send is ever said.                         */
/*   - No parallax. The page scrolls as one sheet over the hero; the    */
/*     title block's own cellar ground (CellarPage) covers the photo as */
/*     it rises, so nothing needs a slower layer behind it.             */
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
  /* The pinned bar's measured height, as on the drink page. */
  const [barH, setBarH] = useState(() => pinnedBarEstimate(insets.bottom));
  const drink = live ?? gone?.drink;
  const pour = live ? livePour : gone?.pour;

  const back = () => router.back();

  if (!hydrated) {
    return (
      <View style={styles.screen}>
        <Grain tone="lining" />
        {/* The lining bar brings the light status bar with it. */}
        <ScreenTopBar
          title="Your drink"
          showRule={false}
          tone="lining"
          left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />}
        />
        <View style={styles.holdSlot}>
          {/* The dark hold: a bone spinner, since wine is 1.22:1 here. */}
          <Hold slowMessage="Still loading your drinks." tone="dark" fill={false} />
        </View>
      </View>
    );
  }

  if (!drink) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Grain tone="lining" />
        <FocusedStatusBar style="light" />
        <EmptyState
          icon="search"
          title="Unknown entry"
          body="This drink isn't in your Dex."
          action={{ label: 'Back to the Dex', onPress: back }}
          tone="lining"
        />
      </View>
    );
  }

  const cocktail = drink.category === 'cocktail';
  const drawn = toDrink(drink);
  const photo = pour?.photoUri || customPhotoUri(drink.photoFile);
  const status = syncStatusLine(drink, signedIn);
  const heroH = heroHeight(width);
  /*
   * The catalogue gained a drink of this name, and Sipply has not marked
   * the suggestion yet (when it does, the app moves the pour over on its
   * own: lib/submissions). The person can do it themselves meanwhile.
   */
  const twin = catalogueTwin(drink.name);

  // The pinned bar's door, for a first pour and another one alike.
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
  const composition = drawn.composition;
  const showComposition = !cocktail && composition != null && composition.components.length > 0;

  return (
    <View style={styles.screen}>
      <Grain tone="lining" />
      <FocusedStatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/*
          Full bleed, up under the status bar, the drink page's height. Your
          pour's photo first, then the one sent with the suggestion, then the
          lit vector face. People's photographs are never graded, so the
          dissolve at the foot (HeroShade) is what settles one into the
          cellar.
        */}
        <View
          style={[styles.hero, { height: heroH }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={photo ? `Your photo of ${drink.name}` : `Illustration of ${drink.name}`}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={160}
              accessible={false}
              cachePolicy="disk"
              enforceEarlyResizing
            />
          ) : (
            <VectorFace
              drink={drawn}
              mode="lit"
              width={width}
              height={heroH}
              // The glass at 60% of the width; artScale is a share of the height.
              artScale={(0.6 * width) / heroH}
            />
          )}
          <HeroShade />
        </View>

        <CellarPage paddingBottom={barH + space.xl}>
          <HeroTitle drink={drawn} inDex custom />
          <LabelBand drink={drawn} />

          {status ? (
            <Text style={[styles.status, status.danger && styles.statusDanger]}>{status.text}</Text>
          ) : null}

          {twin ? (
            <LiningBand radius={12} style={styles.twin}>
              <Text style={styles.twinTitle}>
                <Text style={textRole.nameInline}>{twin.name}</Text> is in the Dex now.
              </Text>
              <Text style={styles.twinBody}>Move your pour to the Dex entry and this copy goes.</Text>
              <Button label="Move my pour there" variant="onLiningOutline" onPress={moveToDex} />
            </LiningBand>
          ) : null}

          {/* A custom drink is never posted (Log keeps its pour to the phone), so this row never opens a post. */}
          {pour ? <DexSinceRow drink={drawn} record={pour} /> : null}
          <TastesOf notes={drink.tastingNotes} />

          {cocktail && drawn.recipe && drink.ingredients.length > 0 ? <SpecCard recipe={drawn.recipe} /> : null}
          {showServe && serve ? <ServeCard serve={serve} /> : null}
          {showComposition && composition ? (
            <CompositionCard composition={composition} style={showServe ? styles.secondCard : undefined} />
          ) : null}

          <FieldNotes description={drink.description} />
          <TriviaBand drink={drawn} />

          <View style={styles.footer}>
            <Button
              label="Edit details"
              variant="onLiningOutline"
              block
              onPress={() => router.push({ pathname: '/add-drink', params: { edit: drink.id } })}
              accessibilityLabel={`Edit the details of ${drink.name}`}
            />
            <Button
              label="Delete this drink"
              variant="dangerOnLining"
              block
              onPress={confirmDelete}
              accessibilityLabel={`Delete ${drink.name}`}
            />
          </View>
        </CellarPage>
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

      {/*
        The drink page's pinned bar, on this page's own log flow (the
        centre-tab log screen with the drink chosen). It replaced the
        "Not logged yet" card and "Update photo".
      */}
      <PinnedLogBar name={drink.name} collected={pour != null} onPress={logIt} onHeight={setBarH} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* The cellar, as on the drink page. */
  screen: { flex: 1, backgroundColor: colors.liningDeep },
  centered: { justifyContent: 'center' },
  holdSlot: { flex: 1, justifyContent: 'center' },

  /* The cellar while the photo decodes; clips the dissolve. */
  hero: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.liningDeep,
  },

  backButton: {
    position: 'absolute',
    left: space.md,
    zIndex: 2,
  },

  /* Where the suggestion stands. Red only when the person has to act. */
  status: {
    ...textRole.helper,
    color: colors.onLiningMuted,
    marginTop: 14,
    paddingHorizontal: layout.gutter,
  },
  statusDanger: { color: colors.dangerOnLining },

  /* A panel of lining, raised off the cellar. */
  twin: {
    padding: space.lg,
    gap: space.sm,
    marginTop: space.lg,
    marginHorizontal: layout.gutter,
  },
  twinTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: colors.onLining,
  },
  twinBody: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.onLiningMuted,
    marginBottom: space.xs,
  },

  /* A spirit's second mat card, under "The pour". */
  secondCard: { marginTop: space.lg },

  footer: {
    marginTop: space.xxl,
    marginHorizontal: layout.gutter,
    gap: space.sm,
  },
});
