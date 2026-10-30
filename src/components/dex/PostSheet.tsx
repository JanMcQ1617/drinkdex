import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Print } from '@/components/cabinet';
import { PlaceRow } from '@/components/places/PlaceRow';
import { PlaceSearchSheet } from '@/components/places/PlaceSearchSheet';
import { PostCamera, useCameraAccess } from '@/components/PostCamera';
import { TopBarTextButton } from '@/components/ScreenTopBar';
import { SheetGrabber } from '@/components/Sheet';
import { Button, Field } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import type { PlaceRef } from '@/lib/places';
import { NOTE_MAX } from '@/lib/pour';

/* ==================================================================== */
/* The drink page's post sheet                                          */
/*                                                                      */
/* A first photo of the drink ("Post Negroni"), or another one ("Post   */
/* it again"): the picked photo, its caption and the same pair of keys  */
/* as the + window, "Save to Dex" and "Save & post". The route owns     */
/* what saving does (drink/[id].tsx); this draws it.                    */
/*                                                                      */
/* CAMERA FIRST (v4.11, specs/v4.11/post-camera.md). The route opens    */
/* the camera before this sheet and raises it with the photo already    */
/* picked, so the sheet's two sources ("Take photo", "Choose photo")    */
/* show only when the camera is refused. "Choose another" opens the     */
/* camera again, over this sheet, and a new photo comes back to it with */
/* the caption and the place kept; refused, it goes back to the two     */
/* sources as before. Take photo opens the camera too once it has been  */
/* allowed, and otherwise the route's system camera, whose refusal says */
/* where Settings turns it on.                                          */
/*                                                                      */
/* A PAGE SHEET (specs/v4-changes.md 2.2): it holds a text field, so it */
/* is the system's sheet, which keeps the field above the keyboard and  */
/* closes with a swipe, never the short BottomSheet. Cancel is the one  */
/* way out that needs no gesture.                                       */
/*                                                                      */
/* PLACE (v4.8, specs/v4.8-places 3.1). Under the caption (a first      */
/* photo) or under the preview (another one), before the two keys: Add  */
/* place, or the place picked as a chip. Only signed in, with a photo,  */
/* and where places work at all (`placesOn`: migration 026, the         */
/* place-search module, iOS 18). The route owns the place (a Place ID   */
/* and the poster's label) and sends it with Save & post alone; Save to */
/* Dex and Save photo drop it, since not posting is the decision (P7).  */
/*                                                                      */
/* THE SEARCH SHEET AND THE CAMERA ARE CHILDREN OF THIS SHEET'S MODAL,  */
/* not siblings in the route: iOS presents a modal only from the        */
/* topmost view controller, which while this sheet is up is this sheet. */
/* Rendered beside it in the route, neither would ever appear.          */
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
  place,
  placesOn,
  onAddPlace,
  onRemovePlace,
  onClose,
  onTakePhoto,
  onChoosePhoto,
  onChooseAnother,
  onReplacePhoto,
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
  /** The place picked for this photo, or none. */
  place: PlaceRef | null;
  /** Places work here: signed in, migration 026 there, the place-search module in this build, iOS 18+. */
  placesOn: boolean;
  /** A place picked in the search (its Place ID and label); the route keeps it for Save & post. */
  onAddPlace: (place: PlaceRef) => void;
  onRemovePlace: () => void;
  onClose: () => void;
  /** The system camera: Take photo, with the post camera refused. */
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
  /** Back to the two sources: Choose another, with the post camera refused. */
  onChooseAnother: () => void;
  /** A photo from the post camera, opened over this sheet by Choose another or Take photo. */
  onReplacePhoto: (uri: string) => void;
  onNoteChange: (text: string) => void;
  /** `alsoPost` is the person's answer to "share this?", asked by the two keys. */
  onConfirm: (alsoPost: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const busy = saving !== null;
  const previewW = Math.round(width - 2 * layout.gutter);
  const previewH = Math.round(previewW * PREVIEW_ASPECT);
  /* The place search, open over this sheet (see the header on why it is drawn inside it). */
  const [searching, setSearching] = useState(false);
  const offerPlace = signedIn && pickedUri != null && placesOn;
  /*
   * The camera over this sheet (v4.11): "Choose another", and Take photo
   * once the camera is allowed. `orElse` is the way each went before,
   * for a camera that is refused.
   */
  const askCamera = useCameraAccess();
  const [shooting, setShooting] = useState(false);
  const openCamera = async (orElse: () => void) => {
    if (await askCamera()) setShooting(true);
    else orElse();
  };
  const placeRow = offerPlace ? (
    <PlaceRow place={place} onAdd={() => setSearching(true)} onRemove={onRemovePlace} disabled={busy} />
  ) : null;

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
                  placeholder="Say something about it"
                  maxLength={NOTE_MAX}
                  autoCapitalize="sentences"
                  autoCorrect
                  returnKeyType="done"
                  error={noteError}
                  accessibilityLabel="Caption, optional"
                />
              ) : null}

              {/* Add place: under the caption, or under the preview when there is no caption. */}
              {placeRow}

              {/*
                The same pair, in the same order, as the + window. Posting is
                the strong key because it is the social half of the app, but
                it is never the only one: the first keeps the photo on this
                phone. "Save & post" is the post key, so it wears the accent
                like the + window's Post (v4.4, place 2 in theme.ts; Jan, 17
                Oct 2026). Signed out it is disabled, and the line under it
                says why.
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
                  variant="post"
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
              {/*
                The camera again, whose library key is the other source, so
                not "Retake": after a library pick there was nothing to
                retake. Back to the two sources if the camera is refused.
              */}
              <Button
                label="Choose another"
                variant="text"
                muted
                block
                onPress={() => void openCamera(onChooseAnother)}
                disabled={busy}
                accessibilityLabel="Choose another photo"
              />
            </>
          ) : (
            <View style={styles.sources}>
              <Button
                label="Take photo"
                variant="secondary"
                icon="camera"
                block
                onPress={() => void openCamera(onTakePhoto)}
              />
              <Button label="Choose photo" variant="secondary" icon="grid" block onPress={onChoosePhoto} />
            </View>
          )}
        </ScrollView>

        {offerPlace ? (
          <PlaceSearchSheet
            visible={searching}
            current={place}
            onPick={onAddPlace}
            onClose={() => setSearching(false)}
          />
        ) : null}

        <PostCamera
          visible={shooting}
          onPhoto={(uri) => {
            setShooting(false);
            onReplacePhoto(uri);
          }}
          onClose={() => setShooting(false)}
        />
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
