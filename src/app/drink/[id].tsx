import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
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

import { CategoryPill, GoldButton, RarityBadge, SectionLabel } from '@/components/ui';
import { CATEGORY_META, colors, drinkGlyph, fonts } from '@/constants/theme';
import { DRINKS_BY_ID, formatDexNumber } from '@/data';
import { useCollection } from '@/store/collection';
import { confirmDestructive, showNotice } from '@/utils/alerts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Small in-file components
// ---------------------------------------------------------------------------

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

function PressableScale({
  onPress,
  style,
  children,
  accessibilityLabel,
  disabled,
}: {
  onPress: () => void;
  style?: object | object[];
  children: React.ReactNode;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, pressed && { opacity: 0.72 }, disabled && { opacity: 0.4 }]}
    >
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

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
            'DrinkDex needs photo library access to log proof. You can enable it in Settings.'
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
          'DrinkDex needs camera access to snap proof. You can enable it in Settings.'
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
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        closeModal();
        triggerCelebration();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, closeModal, drink, note, pickedUri, pickerMode, triggerCelebration, unlock, updatePhoto]);

  const handleRemove = useCallback(() => {
    if (!drink) return;
    confirmDestructive(
      'Remove from collection?',
      `${drink.name} will go back to locked. Your photo and note for this entry will be forgotten.`,
      'Remove',
      () => {
        relock(drink.id);
        router.back();
      }
    );
  }, [drink, relock, router]);

  // ---- Unknown entry ------------------------------------------------------
  if (!drink) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.unknownGlyph}>?</Text>
        <Text style={styles.unknownTitle}>Unknown entry</Text>
        <Text style={styles.unknownBody}>This drink is not in the Dex.</Text>
        <PressableScale onPress={() => router.back()} style={styles.unknownBack} accessibilityLabel="Go back">
          <Text style={styles.unknownBackText}>Back to the Dex</Text>
        </PressableScale>
      </View>
    );
  }

  const meta = CATEGORY_META[drink.category];
  const glyph = drinkGlyph(drink);
  const unlocked = Boolean(record);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 28) + 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <PressableScale onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
          <Text style={styles.backChevron}>‹</Text>
        </PressableScale>

        <Text style={styles.dexLine}>
          {formatDexNumber(drink.dexNumber)}
          {'  ·  '}
          {drink.subcategory.toUpperCase()}
        </Text>
        <Text style={[styles.name, !unlocked && { color: colors.textMuted }]}>{drink.name}</Text>

        {/* Hero */}
        {unlocked && record?.photoUri ? (
          <View style={[styles.heroWrap, { borderColor: meta.color + '55' }]}>
            <Image
              source={{ uri: record.photoUri }}
              style={styles.heroImage}
              contentFit="cover"
              transition={220}
              accessibilityLabel={`Your photo of ${drink.name}`}
            />
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>Logged {formatLogDate(record.date)}</Text>
            </View>
          </View>
        ) : unlocked ? (
          <View style={[styles.glyphPanel, { borderColor: meta.color + '55' }]}>
            <Text style={styles.glyphUnlocked}>{glyph}</Text>
            <Text style={styles.glyphCaption}>Logged {record ? formatLogDate(record.date) : ''}</Text>
          </View>
        ) : (
          <View style={styles.lockedPanel}>
            <Text style={styles.glyphLocked}>{glyph}</Text>
            <Text style={styles.lockedCaption}>Not yet logged</Text>
          </View>
        )}

        {/* Meta row */}
        <View style={styles.metaRow}>
          <CategoryPill category={drink.category} />
          <RarityBadge rarity={drink.rarity} />
        </View>
        {unlocked && record?.note ? <Text style={styles.noteText}>“{record.note}”</Text> : null}

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard label="ABV" value={drink.abv} />
          <StatCard label="Origin" value={drink.origin} />
          <StatCard label="Glass" value={drink.glassware ?? '—'} />
        </View>

        {unlocked ? (
          <>
            {/* Tasting notes */}
            <SectionLabel style={styles.section}>Tasting notes</SectionLabel>
            <View style={styles.chipRow}>
              {drink.tastingNotes.map((n, i) => (
                <View key={`${i}-${n}`} style={styles.chip}>
                  <Text style={styles.chipText}>{n}</Text>
                </View>
              ))}
            </View>

            {/* Ingredients */}
            {drink.ingredients && drink.ingredients.length > 0 ? (
              <>
                <SectionLabel style={styles.section}>The build</SectionLabel>
                <View style={styles.buildCard}>
                  {drink.ingredients.map((ing, i) => (
                    <View
                      key={`${i}-${ing}`}
                      style={[styles.ingredientRow, i > 0 && styles.ingredientRowDivider]}
                    >
                      <View style={[styles.ingredientDot, { backgroundColor: meta.color }]} />
                      <Text style={styles.ingredientText}>{ing}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Description */}
            <SectionLabel style={styles.section}>Field notes</SectionLabel>
            <Text style={styles.description}>{drink.description}</Text>

            {/* Fun fact */}
            <SectionLabel style={styles.section}>Bar trivia</SectionLabel>
            <View style={[styles.triviaCard, { borderLeftColor: meta.color }]}>
              <Text style={styles.triviaText}>{drink.funFact}</Text>
            </View>

            {/* Footer actions */}
            <PressableScale
              onPress={() => openPicker('update')}
              style={styles.secondaryButton}
              accessibilityLabel="Update photo"
            >
              <Text style={styles.secondaryButtonText}>Update photo</Text>
            </PressableScale>
            <PressableScale
              onPress={handleRemove}
              style={styles.dangerButton}
              accessibilityLabel={`Remove ${drink.name} from collection`}
            >
              <Text style={styles.dangerButtonText}>Remove from collection</Text>
            </PressableScale>
          </>
        ) : (
          <>
            {/* Locked teaser */}
            <View style={styles.teaserCard}>
              <Text style={styles.teaserText}>
                Log this drink to reveal its tasting notes, lore, and bar trivia.
              </Text>
            </View>
            <GoldButton
              label="Log this drink"
              onPress={() => openPicker('unlock')}
              accessibilityLabel={`Log ${drink.name}`}
              style={styles.ctaSpacing}
            />
          </>
        )}
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
            style={styles.sheetPositioner}
          >
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
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
                  <GoldButton
                    label={pickerMode === 'update' ? 'Save photo' : 'Unlock entry'}
                    onPress={handleConfirm}
                    disabled={busy}
                    accessibilityLabel={pickerMode === 'update' ? 'Save new photo' : 'Unlock entry'}
                    style={styles.ctaSpacing}
                  />
                  <PressableScale
                    onPress={() => setPickedUri(null)}
                    style={styles.retakeButton}
                    accessibilityLabel="Choose a different photo"
                  >
                    <Text style={styles.retakeText}>Retake</Text>
                  </PressableScale>
                </>
              ) : (
                <>
                  <PressableScale
                    onPress={pickFromCamera}
                    style={styles.optionRow}
                    accessibilityLabel="Take a photo with the camera"
                  >
                    <Text style={styles.optionEmoji}>📷</Text>
                    <Text style={styles.optionText}>Take photo</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={pickFromLibrary}
                    style={styles.optionRow}
                    accessibilityLabel="Choose a photo from your library"
                  >
                    <Text style={styles.optionEmoji}>🖼</Text>
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
          <Animated.View style={[styles.celebration, { backgroundColor: colors.overlay }, celebStyle]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: meta.color + '2E' }]} />
            <Text style={[styles.celebrationTitle, { color: meta.color }]}>UNLOCKED</Text>
            <Text style={styles.celebrationName}>{drink.name}</Text>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    padding: 20,
  },

  // Header
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 14,
  },
  backChevron: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    marginTop: -3,
    fontFamily: fonts.body,
  },
  dexLine: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.textFaint,
    marginBottom: 6,
  },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: 30,
    lineHeight: 36,
    color: colors.text,
    marginBottom: 16,
  },

  // Hero
  heroWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 14,
    backgroundColor: colors.surface,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  datePill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: colors.overlay,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.text + '24',
  },
  datePillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.text,
  },
  glyphPanel: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  glyphUnlocked: {
    fontSize: 72,
  },
  glyphCaption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
  lockedPanel: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.cardBorderLit,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  glyphLocked: {
    fontSize: 72,
    opacity: 0.16,
  },
  lockedCaption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textFaint,
    textTransform: 'uppercase',
  },

  // Meta
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  noteText: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginBottom: 6,
  },

  // Stats
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 5,
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
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },

  // Sections
  section: {
    marginTop: 28,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  buildCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  ingredientRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
  },
  ingredientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ingredientText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  triviaCard: {
    backgroundColor: colors.card,
    borderLeftWidth: 3,
    borderRadius: 16,
    padding: 16,
  },
  triviaText: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },

  // Locked teaser + CTA
  teaserCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    padding: 18,
    marginTop: 24,
  },
  teaserText: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
  },
  ctaSpacing: {
    marginTop: 14,
  },

  // Footer actions (unlocked)
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorderLit,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  dangerButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.danger,
  },

  // Modal sheet
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorderLit,
    padding: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cardBorderLit,
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 22,
    lineHeight: 27,
    color: colors.text,
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginBottom: 18,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
    minHeight: 52,
  },
  optionEmoji: {
    fontSize: 18,
  },
  optionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
  },
  noteInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    minHeight: 46,
  },
  retakeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 4,
    minHeight: 44,
  },
  retakeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textMuted,
  },

  // Celebration
  celebration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  celebrationTitle: {
    fontFamily: fonts.displayBlack,
    fontSize: 40,
    letterSpacing: 4,
  },
  celebrationName: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.text,
  },

  // Unknown entry
  unknownGlyph: {
    fontFamily: fonts.displayBlack,
    fontSize: 64,
    color: colors.textFaint,
    marginBottom: 8,
  },
  unknownTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    color: colors.text,
    marginBottom: 6,
  },
  unknownBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 24,
  },
  unknownBack: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorderLit,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownBackText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
});
