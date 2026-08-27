import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  ZoomIn,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DrinkArt } from '@/components/artwork';
import { drinkPhoto } from '@/data/drinkPhotos';
import { FoilSweep } from '@/components/DexCard';
import { GlassCircle } from '@/components/glass';
import { Icon } from '@/components/icons';
import {
  Button,
  Card,
  CategoryPill,
  Divider,
  EmptyState,
  haptic,
  PressableScale,
  RarityBadge,
  SectionLabel,
} from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  elevation,
  fonts,
  motion,
  radius,
  RARITY_META,
  space,
  type as typeScale,
  tabular,
} from '@/constants/theme';
import { DRINKS_BY_ID, formatDexNumber } from '@/data';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import {
  ATLAS_COUNTRIES,
  grapeByName,
  grapeIndexByName,
  winesByName,
} from '@/data/wineAtlas';
import { atlasLinkFor } from '@/data/wineAtlasLinks';
import type { Composition, Recipe, ServeGuide } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Helpers                                                              */
/* ==================================================================== */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date -> "Jul 16, 2026" */
function formatLogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Copy a picked photo into app document storage so it survives cache cleanup. */
async function persistPhoto(drinkId: string, sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;
  try {
    const dir = new Directory(Paths.document, 'unlocks');
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${drinkId}-${Date.now()}.jpg`);
    // Must be awaited — an un-awaited copy let the store persist a URI
    // pointing at a file that had not finished writing.
    await new File(sourceUri).copy(dest);
    return dest.uri;
  } catch {
    return sourceUri;
  }
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
};

/**
 * Width the legendary foil sweep travels across on the hero.
 *
 * A fixed value rather than a measured one: the hero is a full-bleed block
 * between the screen's 24pt gutters, so on every phone in circulation it is
 * comfortably under this. Overshooting only means the sweep clears the card
 * with room to spare, which is the harmless direction to be wrong in.
 */
const HERO_FOIL_WIDTH = 420;

/* ==================================================================== */
/* Small in-file components                                             */
/* ==================================================================== */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

/**
 * Cocktails — the make-at-home build.
 *
 * Amounts are set in mono and right-aligned so the numerals stack into a
 * column the eye can scan, the way a printed spec sheet reads.
 */
function RecipePanel({ recipe }: { recipe: Recipe }) {
  return (
    <>
      <SectionLabel style={styles.section}>How it&apos;s made</SectionLabel>

      <Card style={styles.listCard}>
        {recipe.ingredients.map((ing, i) => (
          <View key={`${i}-${ing.item}`}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.ingredientRow}>
              <Text style={styles.ingredientItem}>{ing.item}</Text>
              <Text style={styles.ingredientAmount}>{ing.amount}</Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={styles.steps}>
        {recipe.steps.map((step, i) => (
          <View key={`step-${i}`} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {recipe.method || recipe.garnish ? (
        <View style={styles.chipRow}>
          {recipe.method ? <Chip label={`Method — ${recipe.method}`} /> : null}
          {recipe.garnish ? <Chip label={`Garnish — ${recipe.garnish}`} /> : null}
        </View>
      ) : null}
    </>
  );
}

/**
 * Beers, wines, and spirits — what the drink is made of.
 *
 * Deliberately not framed as a recipe: nobody builds these at the bar, so a
 * step list would be a lie. Labels come from the data because they change by
 * category (Malt/Hops/Yeast, Grapes/Region/Aging, Base/Distillation, Rice).
 */
function CompositionPanel({ composition }: { composition: Composition }) {
  return (
    <>
      <SectionLabel style={styles.section}>What&apos;s in it</SectionLabel>

      <Text style={styles.lead}>{composition.summary}</Text>

      <Card style={styles.listCard}>
        {composition.components.map((component, i) => (
          <View key={`${i}-${component.label}`}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.componentRow}>
              <Text style={styles.componentLabel}>{component.label}</Text>
              <Text style={styles.componentDetail}>{component.detail}</Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={styles.noteCard}>
        <Text style={styles.noteCardText}>{composition.process}</Text>
      </View>
    </>
  );
}

/** How to serve it at home — complements, never replaces, the composition. */
function ServePanel({ serve }: { serve: ServeGuide }) {
  return (
    <>
      <SectionLabel style={styles.section}>Serve it right</SectionLabel>

      <View style={styles.statRow}>
        <StatCard label="Temp" value={serve.temp} />
        <StatCard label="Glass" value={serve.glass} />
      </View>

      <View style={styles.serveCard}>
        <Text style={styles.bodyText}>{serve.how}</Text>
      </View>

      {serve.pair && serve.pair.length > 0 ? (
        <View style={styles.pairWrap}>
          <Text style={styles.miniLabel}>Pairs with</Text>
          <View style={styles.chipRow}>
            {serve.pair.map((p, i) => (
              <Chip key={`${i}-${p}`} label={p} />
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

/* ==================================================================== */
/* Screen                                                               */
/* ==================================================================== */

type PickerMode = 'unlock' | 'update';

/**
 * Where this wine sits on the map.
 *
 * The Dex is 460 authored cards; the atlas behind it holds every named
 * wine and grape variety. A varietal card ("Nebbiolo") points at the
 * grape, a place card ("Barolo") at the appellations themselves. Cards
 * with nothing to point at — sake, vermouth — say so instead of linking
 * to something adjacent.
 */
function AtlasPanel({ drinkId }: { drinkId: string }) {
  const router = useRouter();
  const link = atlasLinkFor(drinkId);
  if (!link) return null;

  if (link.absent) {
    return (
      <>
        <SectionLabel style={styles.section}>On the map</SectionLabel>
        <Text style={styles.bodyText}>{link.absent}</Text>
      </>
    );
  }

  /* Links carry names; resolve them here. A name that no longer exists is
     dropped rather than rendering someone else's wine. */
  const grape = grapeByName(link.grape);
  const wines = winesByName(link.wines);
  const count = grape ? grape.wines.length : wines.length;
  if (!count) return null;

  const countries = grape
    ? grape.countries.map((c) => ATLAS_COUNTRIES[c].name)
    : [...new Set(wines.map((w) => ATLAS_COUNTRIES[w.c].name))];

  return (
    <>
      <SectionLabel style={styles.section}>On the map</SectionLabel>
      <Text style={styles.lead}>
        {grape
          ? `${grape.name} makes ${count} named ${count === 1 ? 'wine' : 'wines'} in the atlas`
          : `${count} matching ${count === 1 ? 'appellation' : 'appellations'} in the atlas`}
        {countries.length ? `, across ${countries.length} ` : ''}
        {countries.length ? (countries.length === 1 ? 'country' : 'countries') : ''}.
      </Text>
      {grape?.synonyms.length ? (
        <Text style={styles.bodyText}>Also called {grape.synonyms.join(', ')}.</Text>
      ) : null}
      <PressableScale
        onPress={() =>
          router.push(
            grape
              ? { pathname: '/wine-atlas', params: { grape: String(grapeIndexByName(link.grape)) } }
              : { pathname: '/wine-atlas', params: { q: wines[0].n } }
          )
        }
        accessibilityRole="button"
        accessibilityLabel="Open this in the wine atlas"
        style={styles.atlasLink}>
        <Text style={styles.atlasLinkText}>Open in the Wine Atlas</Text>
        <Icon name="chevronRight" size={16} color={colors.wine} />
      </PressableScale>
    </>
  );
}


export default function DrinkDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const drink = id ? DRINKS_BY_ID[id] : undefined;

  const record = useCollection((s) => (drink ? s.unlocks[drink.id] : undefined));
  const unlock = useCollection((s) => s.unlock);
  const updatePhoto = useCollection((s) => s.updatePhoto);
  const addPhotoForDrink = useSocial((s) => s.addPhotoForDrink);
  const relock = useCollection((s) => s.relock);
  const myId = useAuth((s) => s.session?.user.id);
  const addPost = useSocial((s) => s.addPost);
  const removePostsForDrink = useSocial((s) => s.removePostsForDrink);

  // Modal / picker state
  const [modalVisible, setModalVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('unlock');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * Celebration overlay — the biggest moment in the app: an entry earned.
   *
   * Two gold rings push out from the centre, deliberately echoing the clink
   * rings in the launch intro. Same motif at the two moments that matter
   * means the app has a signature rather than a pile of effects.
   *
   * The scrim now fades on its OWN value. It used to sit inside the scaling
   * group, so the dimming zoomed along with the card — which read as the
   * whole world lurching rather than a card arriving over a settled page.
   *
   * Gold is legendary-only everywhere else in the app; this is the one other
   * place it appears, which is exactly why it still means something here.
   */
  const [celebrating, setCelebrating] = useState(false);
  const celebScrim = useSharedValue(0);
  const celebScale = useSharedValue(0.82);
  const celebOpacity = useSharedValue(0);
  const celebRot = useSharedValue(-3);
  const celebRing1 = useSharedValue(0);
  const celebRing2 = useSharedValue(0);
  const celebTitle = useSharedValue(0);
  const celebName = useSharedValue(0);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: celebScrim.value }));
  const celebStyle = useAnimatedStyle(() => ({
    opacity: celebOpacity.value,
    transform: [{ scale: celebScale.value }, { rotate: `${celebRot.value}deg` }],
  }));
  const ring1Style = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - celebRing1.value) * celebScrim.value,
    transform: [{ scale: 0.3 + 1.5 * celebRing1.value }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - celebRing2.value) * celebScrim.value,
    transform: [{ scale: 0.3 + 1.5 * celebRing2.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: celebTitle.value,
    transform: [{ translateY: (1 - celebTitle.value) * 12 }],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: celebName.value,
    transform: [{ translateY: (1 - celebName.value) * 12 }],
  }));

  const triggerCelebration = useCallback(() => {
    if (celebrating) return;
    setCelebrating(true);

    // Reset first, then ONE `.set()` per value carrying the whole timeline —
    // a second `.set()` in the same tick cancels the first outright.
    celebScrim.set(0);
    celebScale.set(0.82);
    celebOpacity.set(0);
    celebRot.set(-3);
    celebRing1.set(0);
    celebRing2.set(0);
    celebTitle.set(0);
    celebName.set(0);

    celebScrim.set(
      withSequence(
        withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
        withDelay(1050, withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) }))
      )
    );
    celebOpacity.set(
      withDelay(
        80,
        withSequence(
          withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
          withDelay(950, withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }))
        )
      )
    );
    celebScale.set(withDelay(80, withSpring(1, { damping: 13, stiffness: 200, mass: 0.9 })));
    celebRot.set(withDelay(80, withSpring(0, { damping: 15, stiffness: 170 })));
    celebRing1.set(withDelay(60, withTiming(1, { duration: 760, easing: Easing.out(Easing.quad) })));
    celebRing2.set(withDelay(200, withTiming(1, { duration: 860, easing: Easing.out(Easing.quad) })));
    celebTitle.set(withDelay(240, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) })));
    celebName.set(withDelay(380, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) })));

    setTimeout(() => setCelebrating(false), 1750);
  }, [
    celebrating,
    celebOpacity,
    celebScale,
    celebScrim,
    celebRot,
    celebRing1,
    celebRing2,
    celebTitle,
    celebName,
  ]);

  const openPicker = useCallback((mode: PickerMode) => {
    setPickerMode(mode);
    setPickedUri(null);
    setNote('');
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setPickedUri(null);
    setNote('');
  }, []);

  const handleAsset = useCallback((result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return; // stay in the modal
    const asset = result.assets?.[0];
    if (asset?.uri) setPickedUri(asset.uri);
  }, []);

  const pickFromLibrary = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          showNotice(
            'Photo access needed',
            'Sipply needs photo library access to log proof. You can enable it in Settings.'
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      handleAsset(result);
    } catch {
      showNotice('Something went wrong', 'Could not open the photo library. Try again.');
    }
  }, [handleAsset]);

  const pickFromCamera = useCallback(async () => {
    // getUserMedia capture is unreliable on web — fall back to the library picker.
    if (Platform.OS === 'web') {
      await pickFromLibrary();
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showNotice(
          'Camera access needed',
          'Sipply needs camera access to snap proof. You can enable it in Settings.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
      handleAsset(result);
    } catch {
      showNotice('Something went wrong', 'Could not open the camera. Try again.');
    }
  }, [handleAsset, pickFromLibrary]);

  const handleConfirm = useCallback(async () => {
    if (!drink || !pickedUri || busy) return;
    setBusy(true);
    try {
      const uri = await persistPhoto(drink.id, pickedUri);
      if (pickerMode === 'update') {
        updatePhoto(drink.id, uri);
        /*
         * The post has to follow the collection. This used to be purely
         * local, so the shared post kept showing the picture just replaced.
         * It now ADDS rather than replaces: several photos of one drink taken
         * weeks apart are the same entry photographed twice, and the newest
         * becomes the preview. Awaited, unlike the unlock path — the user is
         * watching this specific change rather than being celebrated.
         */
        if (myId) await addPhotoForDrink(myId, drink.id, uri);
        closeModal();
      } else {
        const trimmed = note.trim();
        unlock(drink.id, uri, trimmed.length > 0 ? trimmed : undefined);
        /*
         * Only the sharing half needs an account — the collection is local
         * and must never be gated. Not awaited: uploading the photo can take
         * seconds, and the unlock has already earned its celebration.
         */
        if (myId) {
          void addPost(myId, drink.id, trimmed.length > 0 ? trimmed : 'Logged a new entry.', uri);
        }
        haptic.success();
        closeModal();
        triggerCelebration();
      }
    } finally {
      setBusy(false);
    }
  }, [
    addPost,
    busy,
    closeModal,
    drink,
    myId,
    note,
    pickedUri,
    pickerMode,
    addPhotoForDrink,
    triggerCelebration,
    unlock,
    updatePhoto,
  ]);

  const handleRemove = useCallback(() => {
    if (!drink) return;
    confirmDestructive(
      'Remove from collection?',
      `${drink.name} will go back to locked. Your photo and note for this entry will be forgotten.`,
      'Remove',
      () => {
        relock(drink.id);
        if (myId) void removePostsForDrink(myId, drink.id);
        router.back();
      }
    );
  }, [drink, myId, relock, removePostsForDrink, router]);

  /*
   * Entrance choreography. The page arrives in reading order — number, name,
   * artwork, tags, facts — but the artwork gets a spring rather than a fade,
   * because it is the subject of the screen and should land with weight while
   * the labels merely settle around it.
   */
  const reduced = useReducedMotion();
  const enter = (delay: number) =>
    reduced ? undefined : FadeInDown.duration(motion.base).delay(delay);

  /* ---- Unknown entry --------------------------------------------- */
  if (!drink) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          icon="search"
          title="Unknown entry"
          body="This drink is not in the Dex."
          action={{ label: 'Back to the Dex', onPress: () => router.back() }}
        />
      </View>
    );
  }

  const unlocked = Boolean(record);
  const rarityMeta = RARITY_META[drink.rarity];
  const categoryMeta = CATEGORY_META[drink.category];
  // Unique per entry+state: SVG <Defs> ids share one namespace on web.
  const heroFieldId = `heroField-${drink.id}-${unlocked ? 'c' : 'e'}`;
  // Your own pour outranks the stock photograph once you have logged one.
  const heroPhoto = unlocked && record?.photoUri ? { uri: record.photoUri } : drinkPhoto(drink.id);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: Math.max(insets.bottom, space.xl) + 48 },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <PressableScale
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          {/*
           * Same material as the tab bar. It was a flat outlined circle,
           * which read as a different design language from the bar the
           * user just came from — one app should be made of one substance.
           */}
          <GlassCircle size={44}>
            <Icon name="chevronLeft" size={22} color={colors.text} />
          </GlassCircle>
        </PressableScale>

        <Animated.View entering={enter(0)}>
          <Text style={styles.dexLine}>
            <Text style={styles.dexNumber}>{formatDexNumber(drink.dexNumber)}</Text>
            {'  ·  '}
            {drink.subcategory.toUpperCase()}
          </Text>
          <Text style={styles.name}>{drink.name}</Text>
        </Animated.View>

        {/*
          Always full color here, even before logging: you're on this
          screen to make the drink, and the color tells you what you're
          aiming for. The dashed frame and caption still mark it unlogged.
          The Dex grid keeps its silhouettes — that's the collection board.
        */}
        <Animated.View
          entering={
            reduced
              ? undefined
              : ZoomIn.springify().damping(16).stiffness(180).mass(0.9).delay(70)
          }
          /*
           * Same card language as the Dex grid: category field, framed in the
           * entry's rarity tier. A collected legendary gets the foil sweep it
           * has in the grid — the payoff should be BIGGER on the screen you
           * open to look at the thing, not smaller.
           */
          style={[
            styles.hero,
            // A photograph defines the hero's height itself, so the padding
            // that framed the 150pt vector would only band the image.
            heroPhoto ? styles.heroPhotoMode : null,
            unlocked && styles.heroUnlocked,
            unlocked && { borderColor: rarityMeta.edge, borderWidth: rarityMeta.edgeWidth },
            !unlocked && styles.heroLocked,
          ]}
          accessible
          accessibilityLabel={
            unlocked
              ? `Illustration of ${drink.name}, ${rarityMeta.label}`
              : `Illustration of ${drink.name}, not yet logged`
          }>
          {unlocked ? (
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <LinearGradient id={heroFieldId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={categoryMeta.fieldFrom} />
                  <Stop offset="1" stopColor={categoryMeta.fieldTo} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${heroFieldId})`} />
            </Svg>
          ) : null}

          {unlocked && drink.rarity === 'legendary' && !reduced ? (
            <FoilSweep width={HERO_FOIL_WIDTH} />
          ) : null}

          {/*
            The hero follows the same precedence as the Dex card: the pour you
            logged, else the stock photograph, else the vector art. It is NOT
            dimmed while locked, unlike the grid — the grid is the collection
            board, where withholding creates the pull, but this is the screen
            you open to decide whether to make the drink. Hiding what it looks
            like here would work against the recipe sitting directly below it.
          */}
          {heroPhoto ? (
            <Image
              source={heroPhoto}
              style={styles.heroPhoto}
              contentFit="cover"
              transition={160}
              accessible={false}
              cachePolicy="memory-disk"
            />
          ) : (
            <DrinkArt drink={drink} size={150} />
          )}
          {unlocked ? null : <Text style={styles.heroCaption}>Not yet logged</Text>}
        </Animated.View>

        {/* Meta row */}
        <Animated.View entering={enter(140)} style={styles.metaRow}>
          <CategoryPill category={drink.category} />
          <RarityBadge rarity={drink.rarity} />
        </Animated.View>

        {/* Basic facts — visible whether or not the entry is logged */}
        <Animated.View entering={enter(200)} style={styles.statRow}>
          <StatCard label="ABV" value={drink.abv} />
          <StatCard label="Origin" value={drink.origin} />
          <StatCard label="Glass" value={drink.glassware ?? '—'} />
        </Animated.View>

        {/*
          Everything below is visible whether or not the entry is logged.
          The point of the app is to send you off to make and try a drink,
          which the recipe can't do from behind a lock. Logging is the
          record that you did it, not the key to finding out how.
        */}

        {/* Your proof photo — the one thing logging actually reveals */}
        {unlocked && record?.photoUri ? (
          <>
            <SectionLabel style={styles.section}>Your pour</SectionLabel>
            <View style={styles.photoFrame}>
              <Image
                source={{ uri: record.photoUri }}
                style={styles.photo}
                contentFit="cover"
                transition={220}
                accessibilityLabel={`Your photo of ${drink.name}`}
              />
            </View>
            <Text style={styles.photoMeta}>Logged {record ? formatLogDate(record.date) : ''}</Text>
            {record?.note ? <Text style={styles.quote}>“{record.note}”</Text> : null}
          </>
        ) : null}

        {/* Not logged yet — an invitation, sitting above the how-to */}
        {!unlocked ? (
          <Card style={styles.lockedCard}>
            <View style={styles.lockedIcon}>
              <Icon name="lock" size={22} color={colors.wine} />
            </View>
            <Text style={styles.lockedTitle}>Not in your collection yet</Text>
            <Text style={styles.lockedBody}>
              Everything you need to make it is right below. Snap a photo when you do and it joins
              your Dex.
            </Text>
            <Button
              label="Log this drink"
              icon="camera"
              block
              onPress={() => openPicker('unlock')}
              accessibilityLabel={`Log ${drink.name}`}
              style={styles.lockedCta}
            />
          </Card>
        ) : null}

        {/* Tasting notes */}
        <SectionLabel style={styles.section}>Tasting notes</SectionLabel>
        <View style={styles.chipRow}>
          {drink.tastingNotes.map((n, i) => (
            <Chip key={`${i}-${n}`} label={n} />
          ))}
        </View>

        {/* How it's made — a recipe for cocktails, a composition for the rest */}
        {drink.recipe ? <RecipePanel recipe={drink.recipe} /> : null}
        {!drink.recipe && drink.composition ? (
          <CompositionPanel composition={drink.composition} />
        ) : null}

        {drink.serve ? <ServePanel serve={drink.serve} /> : null}

        {drink.category === 'wine' ? <AtlasPanel drinkId={drink.id} /> : null}

        {/* Lore */}
        <SectionLabel style={styles.section}>Field notes</SectionLabel>
        <Text style={styles.bodyText}>{drink.description}</Text>

        <SectionLabel style={styles.section}>Bar trivia</SectionLabel>
        <View style={styles.noteCard}>
          <Text style={styles.noteCardText}>{drink.funFact}</Text>
        </View>

        {/* Footer actions — only meaningful once it's in your collection */}
        {unlocked ? (
          <>
            <Button
              label="Update photo"
              variant="secondary"
              icon="camera"
              block
              onPress={() => openPicker('update')}
              accessibilityLabel={`Update your photo of ${drink.name}`}
              style={styles.footerButton}
            />
            <Button
              label="Remove from collection"
              variant="ghost"
              block
              onPress={handleRemove}
              accessibilityLabel={`Remove ${drink.name} from collection`}
              style={styles.removeButton}
            />
          </>
        ) : null}
      </ScrollView>

      {/* Unlock / update-photo modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeModal}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={styles.sheetPositioner}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {pickerMode === 'update' ? 'Update photo' : `Log ${drink.name}`}
              </Text>
              <Text style={styles.sheetSubtitle}>
                Photo proof required — that&apos;s the rule of the Dex.
              </Text>

              {pickedUri ? (
                <>
                  <Image
                    source={{ uri: pickedUri }}
                    style={styles.previewImage}
                    contentFit="cover"
                    accessibilityLabel="Photo preview"
                  />
                  {pickerMode === 'unlock' ? (
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder="Where'd you find it? (optional)"
                      placeholderTextColor={colors.textFaint}
                      maxLength={80}
                      style={styles.noteInput}
                      returnKeyType="done"
                      accessibilityLabel="Optional note about where you found this drink"
                    />
                  ) : null}
                  <Button
                    label={pickerMode === 'update' ? 'Save photo' : 'Unlock entry'}
                    block
                    onPress={handleConfirm}
                    disabled={busy}
                    accessibilityLabel={pickerMode === 'update' ? 'Save new photo' : 'Unlock entry'}
                    style={styles.sheetCta}
                  />
                  <Button
                    label="Retake"
                    variant="ghost"
                    block
                    onPress={() => setPickedUri(null)}
                    accessibilityLabel="Choose a different photo"
                  />
                </>
              ) : (
                <>
                  <PressableScale
                    onPress={pickFromCamera}
                    style={styles.optionRow}
                    accessibilityRole="button"
                    accessibilityLabel="Take a photo with the camera">
                    <Icon name="camera" size={20} color={colors.wine} />
                    <Text style={styles.optionText}>Take photo</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={pickFromLibrary}
                    style={styles.optionRow}
                    accessibilityRole="button"
                    accessibilityLabel="Choose a photo from your library">
                    <Icon name="grid" size={20} color={colors.wine} />
                    <Text style={styles.optionText}>Choose from library</Text>
                  </PressableScale>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Celebration overlay */}
      {celebrating ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.View style={[styles.celebScrim, scrimStyle]} />
          <View style={styles.celebration}>
            <Animated.View style={[styles.celebRing, ring1Style]} />
            <Animated.View style={[styles.celebRing, styles.celebRingThin, ring2Style]} />
            <Animated.View style={[styles.celebCard, celebStyle]}>
              <Icon name="sparkle" size={40} color={colors.gilt} filled />
              <Animated.Text style={[styles.celebrationTitle, titleStyle]}>UNLOCKED</Animated.Text>
              <Animated.Text style={[styles.celebrationName, nameStyle]}>
                {drink.name}
              </Animated.Text>
            </Animated.View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* Styles                                                               */
/* ==================================================================== */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: space.xl,
  },

  /* Header */
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: space.lg,
  },
  dexLine: {
    /* The brand's letterspaced sub-label, above the name. */
    fontFamily: fonts.label,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 2.6,
    color: colors.taupeInk,
    marginBottom: space.xs,
  },
  dexNumber: {
    /*
     * Wine, not gilt. Gilt means legendary and nothing else now, and a
     * catalogue number printed in the legendary metal on every entry was
     * spending the one colour the rarity ladder tops out at.
     */
    color: colors.wine,
  },
  name: {
    /* Drink names are the handoff's Playfair 700 at 28. */
    fontFamily: fonts.displayBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
    marginBottom: space.lg,
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    /* Photographs carry the handoff's 16pt radius wherever they appear. */
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
    marginBottom: space.lg,
    // Clips the category field and the legendary foil to the rounded corners.
    overflow: 'hidden',
  },
  heroUnlocked: {
    // borderColor/Width come from the entry's rarity tier at the call site.
    ...elevation.card,
  },
  heroLocked: {
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
  },
  heroPhotoMode: {
    paddingVertical: 0,
    gap: 0,
    paddingBottom: space.sm,
  },
  heroPhoto: {
    /*
     * Square, matching the source, so nothing is cropped — and it is a real
     * laid-out child rather than an absolute fill, because the hero has no
     * height of its own once the vector artwork stops providing it.
     */
    width: '100%',
    aspectRatio: 1,
  },
  heroCaption: {
    fontFamily: fonts.label,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.taupeInk,
  },

  /* Meta */
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },

  /* Stats */
  statRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  statLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.taupeInk,
  },
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.text,
  },

  /* Sections */
  section: {
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  lead: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.text,
    marginBottom: space.lg,
  },
  bodyText: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
  miniLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.taupeInk,
  },

  /* Chips */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },

  /* Recipe + composition rows */
  listCard: {
    paddingHorizontal: space.lg,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: space.md,
  },
  ingredientItem: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
  ingredientAmount: {
    maxWidth: '42%',
    textAlign: 'right',
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.giltInk,
    ...tabular,
  },
  steps: {
    marginTop: space.lg,
    gap: space.md,
  },
  stepRow: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorderLit,
    backgroundColor: colors.giltWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.giltInk,
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
  componentRow: {
    paddingVertical: space.md,
    gap: space.xs,
  },
  componentLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.giltInk,
  },
  componentDetail: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },

  /* Atlas */
  atlasLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.wineWash,
  },
  atlasLinkText: {
    fontFamily: fonts.bodySemiBold,
    ...typeScale.caption,
    color: colors.wine,
  },

  /* Serve */
  serveCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.md,
  },
  pairWrap: {
    marginTop: space.lg,
    gap: space.sm,
  },

  /* Pull-quote style note card — process, trivia */
  noteCard: {
    backgroundColor: colors.wineWash,
    borderLeftWidth: 3,
    borderLeftColor: colors.wine,
    borderRadius: radius.md,
    padding: space.lg,
    marginTop: space.md,
  },
  noteCardText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 21,
    color: colors.textMuted,
  },

  /* Proof photo */
  photoFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorderLit,
    backgroundColor: colors.surface,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoMeta: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 0.4,
    color: colors.textFaint,
    marginTop: space.sm,
  },
  quote: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    fontStyle: 'italic',
    color: colors.textMuted,
    marginTop: space.xs,
  },

  /* Locked */
  lockedCard: {
    alignItems: 'center',
    padding: space.xl,
    marginTop: space.xl,
  },
  lockedIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.wineWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  lockedTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    marginBottom: space.sm,
  },
  lockedBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
  },
  lockedCta: {
    marginTop: space.xl,
  },

  /* Footer actions */
  footerButton: {
    marginTop: space.xxl,
  },
  removeButton: {
    marginTop: space.xs,
  },

  /* Modal sheet */
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetPositioner: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.xl,
    paddingTop: space.md,
    ...elevation.sheet,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: space.lg,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    marginBottom: space.xs,
  },
  sheetSubtitle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginBottom: space.lg,
  },
  sheetCta: {
    marginTop: space.md,
    marginBottom: space.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    marginBottom: space.sm,
    minHeight: 52,
  },
  optionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: space.md,
  },
  noteInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
    minHeight: 48,
  },

  /* Celebration */
  celebScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  celebration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebCard: {
    alignItems: 'center',
    gap: space.sm,
  },
  // Eco de los anillos del intro: mismo motivo en los dos momentos que importan.
  celebRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: colors.gilt,
  },
  celebRingThin: {
    borderWidth: 1,
    borderColor: colors.taupe,
  },
  celebrationTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.display.fontSize,
    letterSpacing: 4,
    color: colors.gilt,
  },
  celebrationName: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodyLg.fontSize,
    color: colors.textOnWine,
  },
});
