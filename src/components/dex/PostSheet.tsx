import { Image } from 'expo-image';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Print } from '@/components/cabinet';
import { TopBarTextButton } from '@/components/ScreenTopBar';
import { SheetGrabber } from '@/components/Sheet';
import { Button, Field } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { NOTE_MAX } from '@/lib/pour';

/* ==================================================================== */
/* The drink page's post sheet                                          */
/*                                                                      */
/* A first photo of the drink ("Post Negroni"), or another one ("Post   */
/* it again"): the two sources, then the picked photo, its caption and  */
/* the same pair of keys as the + window, "Save to Dex" and "Save &     */
/* post". The route owns what saving does (drink/[id].tsx); this draws  */
/* it.                                                                  */
/*                                                                      */
/* A PAGE SHEET (specs/v4-changes.md 2.2): it holds a text field, so it */
/* is the system's sheet, which keeps the field above the keyboard and  */
/* closes with a swipe, never the short BottomSheet. Cancel is the one  */
/* way out that needs no gesture.                                       */
/* ==================================================================== */

export type PostSheetMode = 'unlock' | 'update';
/** Which save is running, so only the key that was pressed spins. */
export type PostSaving = 'dex' | 'post' | null;

/** The picked photo's frame: 4:5, the feed's own shape, so it is previewed as it will be posted. */
const PREVIEW_ASPECT = 5 / 4;

export function PostSheet({
  visible,
  mode,
  drinkName,
  signedIn,
  pickedUri,
  note,
  noteError,
  saving,
  onClose,
  onTakePhoto,
  onChoosePhoto,
  onChooseAnother,
  onNoteChange,
  onConfirm,
}: {
  visible: boolean;
  mode: PostSheetMode;
  drinkName: string;
  signedIn: boolean;
  pickedUri: string | null;
  note: string;
  noteError: string | null;
  saving: PostSaving;
  onClose: () => void;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
  onChooseAnother: () => void;
  onNoteChange: (text: string) => void;
  /** `alsoPost` is the person's answer to "share this?", asked by the two keys. */
  onConfirm: (alsoPost: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const busy = saving !== null;
  const previewW = Math.round(width - 2 * layout.gutter);
  const previewH = Math.round(previewW * PREVIEW_ASPECT);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <SheetGrabber />
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
            {mode === 'update' ? (
              'Post it again'
            ) : (
              <>
                Post <Text style={textRole.nameInline}>{drinkName}</Text>
              </>
            )}
          </Text>
          <TopBarTextButton label="Cancel" muted onPress={onClose} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}>
          {/*
            A first photo's sheet says what the photo is for and that
            sharing is a choice. Another photo's says where it goes,
            including the post, if there is one.
          */}
          {mode === 'unlock' ? (
            <Text style={[textRole.small, styles.muted]}>
              A photo is how a drink joins your Dex. Posting it is up to you.
            </Text>
          ) : signedIn ? (
            <Text style={[textRole.small, styles.muted]}>If you shared this drink, the post gets the new photo too.</Text>
          ) : null}

          {pickedUri ? (
            <>
              <Print width={previewW} height={previewH} style={styles.preview}>
                <Image
                  accessibilityIgnoresInvertColors
                  // A picked photo is up to 2048px: decoded at the frame, keyed by its size.
                  source={{ uri: pickedUri, cacheKey: `${pickedUri}#${previewW}x${previewH}` }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  enforceEarlyResizing
                  accessibilityLabel="Photo preview"
                />
              </Print>

              {/*
                Field, the app's one form input, so the caption (kept as the
                record's `note`) is drawn, labelled and announced like every
                other field. Field links a refused caption to the input and
                speaks it when it appears. Prose, so capitals and autocorrect
                are on. Only a first photo has one: an existing post keeps the
                words it was first shared with.
              */}
              {mode === 'unlock' ? (
                <Field
                  label="Add a caption"
                  value={note}
                  onChangeText={onNoteChange}
                  placeholder="Where you had it, what you thought"
                  maxLength={NOTE_MAX}
                  autoCapitalize="sentences"
                  autoCorrect
                  returnKeyType="done"
                  error={noteError}
                  accessibilityLabel="Caption, optional"
                />
              ) : null}

              {/*
                The same pair, in the same order, as the + window. Posting is
                the ink key because it is the social half of the app, but it
                is never the only one: the first keeps the photo on this phone.
                Ink, not the accent the + window's Post wears (v4.4): the
                accent has exactly five places (theme.ts) and this key is not
                one of them. A sixth is Jan's call (check-design rule 17).
              */}
              <View style={styles.actions}>
                <Button
                  label={mode === 'update' ? 'Save photo' : 'Save to Dex'}
                  variant="secondary"
                  onPress={() => onConfirm(false)}
                  disabled={busy && saving !== 'dex'}
                  loading={saving === 'dex'}
                  style={styles.action}
                />
                <Button
                  label="Save & post"
                  onPress={() => onConfirm(true)}
                  disabled={!signedIn || (busy && saving !== 'post')}
                  loading={saving === 'post'}
                  style={styles.action}
                />
              </View>
              {/* Says why the second key is dead rather than leaving a disabled control unexplained. */}
              {!signedIn ? (
                <Text style={[textRole.small, styles.muted, styles.centred]}>
                  Sign in to post. Saving to your Dex works either way.
                </Text>
              ) : null}
              {/* Back to the two sources, not "Retake": after a library pick there was nothing to retake. */}
              <Button
                label="Choose another"
                variant="text"
                muted
                block
                onPress={onChooseAnother}
                disabled={busy}
                accessibilityLabel="Choose another photo"
              />
            </>
          ) : (
            <View style={styles.sources}>
              <Button label="Take photo" variant="secondary" icon="camera" block onPress={onTakePhoto} />
              <Button label="Choose photo" variant="secondary" icon="grid" block onPress={onChoosePhoto} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  centred: { textAlign: 'center' },
  /* The title at the gutter; Cancel's own inset taken back so its word ends on the far gutter. */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingLeft: layout.gutter,
    paddingRight: layout.gutter - space.md,
  },
  title: { flexShrink: 1 },
  body: { paddingHorizontal: layout.gutter, paddingTop: space.sm, gap: space.lg },
  preview: { marginTop: space.xs },
  sources: { gap: space.sm, marginTop: space.xs },
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1 },
});
