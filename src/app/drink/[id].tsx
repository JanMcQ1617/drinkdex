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
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
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
import { colors, elevation, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { DRINKS_BY_ID, formatDexNumber } from '@/data';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
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

export default function DrinkDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const drink = id ? DRINKS_BY_ID[id] : undefined;

  const record = useCollection((s) => (drink ? s.unlocks[drink.id] : undefined));
  const unlock = useCollection((s) => s.unlock);
  const updatePhoto = useCollection((s) => s.updatePhoto);
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

  // Celebration overlay
  const [celebrating, setCelebrating] = useState(false);
  const celebScale = useSharedValue(0.8);
  const celebOpacity = useSharedValue(0);
  const celebStyle = useAnimatedStyle(() => ({
    opacity: celebOpacity.value,
    transform: [{ scale: celebScale.value }],
  }));

  const triggerCelebration = useCallback(() => {
    if (celebrating) return;
    setCelebrating(true);
    celebScale.set(0.8);
    celebOpacity.set(0);
    celebOpacity.set(
      withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
        withDelay(720, withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }))
      )
    );
    celebScale.set(withTiming(1, { duration: 480, easing: Easing.out(Easing.back(1.7)) }));
    setTimeout(() => setCelebrating(false), 1450);
  }, [celebrating, celebOpacity, celebScale]);

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
            'Clink needs photo library access to log proof. You can enable it in Settings.'
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
          'Clink needs camera access to snap proof. You can enable it in Settings.'
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
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </PressableScale>

        <Text style={styles.dexLine}>
          <Text style={styles.dexNumber}>{formatDexNumber(drink.dexNumber)}</Text>
          {'  ·  '}
          {drink.subcategory.toUpperCase()}
        </Text>
        <Text style={styles.name}>{drink.name}</Text>

        {/*
          Always full color here, even before logging: you're on this
          screen to make the drink, and the color tells you what you're
          aiming for. The dashed frame and caption still mark it unlogged.
          The Dex grid keeps its silhouettes — that's the collection board.
        */}
        <View
          style={[styles.hero, unlocked ? styles.heroUnlocked : styles.heroLocked]}
          accessible
          accessibilityLabel={
            unlocked
              ? `Illustration of ${drink.name}`
              : `Illustration of ${drink.name}, not yet logged`
          }>
          <DrinkArt drink={drink} size={150} />
          {unlocked ? null : <Text style={styles.heroCaption}>Not yet logged</Text>}
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <CategoryPill category={drink.category} />
          <RarityBadge rarity={drink.rarity} />
        </View>

        {/* Basic facts — visible whether or not the entry is logged */}
        <View style={styles.statRow}>
          <StatCard label="ABV" value={drink.abv} />
          <StatCard label="Origin" value={drink.origin} />
          <StatCard label="Glass" value={drink.glassware ?? '—'} />
        </View>

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
          <Animated.View style={[styles.celebration, celebStyle]}>
            <Icon name="sparkle" size={40} color={colors.gold} filled />
            <Text style={styles.celebrationTitle}>UNLOCKED</Text>
            <Text style={styles.celebrationName}>{drink.name}</Text>
          </Animated.View>
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
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 1.4,
    color: colors.textFaint,
    marginBottom: space.xs,
  },
  dexNumber: {
    fontFamily: fonts.mono,
    color: colors.goldInk,
  },
  name: {
    fontFamily: fonts.display,
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
    borderRadius: radius.xl,
    borderWidth: 1,
    backgroundColor: colors.surface,
    marginBottom: space.lg,
  },
  heroUnlocked: {
    borderColor: colors.cardBorderLit,
    ...elevation.card,
  },
  heroLocked: {
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
  },
  heroCaption: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textFaint,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
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
    fontFamily: fonts.mono,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.goldInk,
    fontVariant: ['tabular-nums'],
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
    backgroundColor: colors.goldWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fonts.mono,
    fontSize: typeScale.micro.fontSize,
    color: colors.goldInk,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.goldInk,
  },
  componentDetail: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
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
  celebration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.overlay,
  },
  celebrationTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.display.fontSize,
    letterSpacing: 4,
    color: colors.gold,
  },
  celebrationName: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodyLg.fontSize,
    color: colors.textOnWine,
  },
});
