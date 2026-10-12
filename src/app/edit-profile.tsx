import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { Avatar, Button, Field, Notice, haptic } from '@/components/ui';
import {
  ACCENT_NAMES,
  avatarTone,
  colors,
  layout,
  SIGNUP_ACCENTS,
  space,
  tabular,
  textRole,
} from '@/constants/theme';
import {
  containsObjectionable,
  isObjectionableError,
  OBJECTIONABLE_MESSAGE,
} from '@/lib/moderation';
import { pickFromCamera, pickFromLibrary, type PickResult } from '@/lib/pour';
import { forgetSignedPhoto, removeStoredPhoto, uploadAvatar } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Edit profile                                                         */
/*                                                                      */
/* Everything about you that other people see, in one place: the name    */
/* on your posts, the handle they find you by, the line under it, and    */
/* the tone of your initials disc.                                      */
/*                                                                      */
/* None of it was editable before. Display name and username were set    */
/* once at signup and there was no way to write a bio at all, so the     */
/* `bio` column existed, rendered on the profile, and could only ever    */
/* be null.                                                             */
/*                                                                      */
/* The limits below are the database's, restated. `profiles` carries     */
/* CHECK constraints for all three and a unique index on username, so    */
/* these counters are a courtesy — they tell you before you press Save   */
/* rather than deciding anything. The store re-checks, and the server    */
/* has the last word.                                                   */
/* ==================================================================== */

const NAME_MAX = 40;
const BIO_MAX = 300;
const HANDLE_MAX = 24;

/*
 * The avatar tone picker (white spec 5.15): the four greys an initials disc
 * can take, each drawn as the disc it makes and named under it (Graphite,
 * Charcoal, Slate, Mist, from theme.ts's ACCENT_NAMES), because four greys
 * cannot be told apart by fill alone, by eye or by ear. Keyed by
 * SIGNUP_ACCENTS' stored hexes; CATEGORY_META's colours are both ink now
 * and no longer name anything.
 */
/** The disc in a tone swatch, and the ring's box around it (2pt ring, 4pt gap). */
const TONE_DISC = 48;
const TONE_RING = 2;
const TONE_BOX = TONE_DISC + 2 * (TONE_RING + 4);

/** The three fields the content filter reads. */
type TextField = 'name' | 'handle' | 'bio';

/**
 * Which field a server refusal is about, when its message names the column.
 * The trigger covers display_name, username and bio; a message that names
 * none of them is placed by the caller instead.
 */
function refusedColumn(message: string): TextField | null {
  if (message.includes('display_name')) return 'name';
  if (message.includes('username')) return 'handle';
  if (/\bbio\b/.test(message)) return 'bio';
  return null;
}

/*
 * A picker that did not return a photo. A denial is always the camera (the
 * library needs no permission), and the only fix for it is in Settings, so
 * that alert carries the way there rather than just naming it. The same
 * handling as the pour screen's.
 */
function pickNotice(r: Extract<PickResult, { ok: false; reason: 'denied' | 'error' }>) {
  if (r.reason === 'denied' && Platform.OS !== 'web') {
    Alert.alert(r.title, r.body, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]);
    return;
  }
  showNotice(r.title, r.body);
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();

  /*
   * The sheet's offset from the top of the window, for the keyboard.
   *
   * `presentation: 'modal'` is a page sheet on iPhone, starting some way
   * below the status bar. KeyboardAvoidingView compares its own frame,
   * which is sheet-relative, with the keyboard's top, which is in window
   * coordinates, so without the offset it under-pads by exactly that gap
   * and Save stays under the keyboard. A page sheet is anchored to the
   * bottom, so the gap is the window height minus the sheet's. Measured
   * from layout, as the pour screen does; 'padding' does not change the
   * view's own height, so this cannot feed back on itself.
   */
  const { height: windowH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(windowH);

  const profile = useAuth((s) => s.profile);
  const updateProfile = useAuth((s) => s.updateProfile);
  const refreshFeed = useSocial((s) => s.refreshFeed);
  const feedError = useSocial((s) => s.feedError);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [accent, setAccent] = useState(profile?.accent ?? SIGNUP_ACCENTS[0]!);
  /*
   * The tone the disc shows now. A profile can still carry a wine-era
   * accent; avatarTone maps it to one of the four, and that one reads as
   * chosen. Choosing it again keeps the stored hex, so opening this sheet
   * and saving nothing is not an edit.
   */
  const shownTone = avatarTone(accent).fill;
  /* A form-level failure, shown in a Notice above Save, which also speaks it. */
  const [error, setError] = useState<string | null>(null);

  /*
   * Text the content filter refused, by field, holding the exact value it
   * refused. The message shows under the field while it still holds that
   * value, so editing the field is what clears it — no effect needed.
   */
  const [refused, setRefused] = useState<Partial<Record<TextField, string>>>({});

  /*
   * The picture is picked now and uploaded on Save, not on pick.
   *
   * Uploading immediately would leave an orphan in the bucket every time
   * someone chooses a photo and then backs out. `pickedPhoto` is the local
   * URI being previewed; it only becomes an object when the rest of the
   * form is committed too. Save also removes what it replaces: a fresh
   * upload the profile then refuses, and the previous picture once the
   * profile no longer points at it (see save).
   */
  const [pickedPhoto, setPickedPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Distinct from "picked nothing": this means clear the existing one. */
  const [removed, setRemoved] = useState(false);
  /*
   * A save is under way, from the first upload byte to the close. The
   * store's `busy` is not enough: it drops while updateProfile re-reads the
   * row, and in that gap Save was live again. A second tap there uploaded a
   * second picture, pointed the profile at it and deleted the old one, and
   * left the first upload in the bucket with nothing pointing at it.
   */
  const [saving, setSaving] = useState(false);
  /** The save went through; the screen is closing and must not ask to discard. */
  const [committed, setCommitted] = useState(false);

  const handle = username.trim().toLowerCase();
  const nameOk = displayName.trim().length >= 1 && displayName.trim().length <= NAME_MAX;
  const handleOk = /^[a-z0-9._]{3,24}$/.test(handle);
  const bioOk = bio.trim().length <= BIO_MAX;

  const valueOf = (field: TextField) =>
    field === 'name' ? displayName : field === 'handle' ? handle : bio;
  const savedValueOf = (field: TextField) =>
    field === 'name'
      ? (profile?.display_name ?? '')
      : field === 'handle'
        ? (profile?.username ?? '')
        : (profile?.bio ?? '');
  const isRefused = (field: TextField) => refused[field] === valueOf(field);

  /*
   * `removed` counts only when there is a picture to remove. Without it,
   * "Remove photo" on its own left Save disabled, so a photo could only be
   * taken down alongside some unrelated edit. The avatar_path check keeps
   * picking a photo and then removing it again, on a profile that never had
   * one, from reading as a change.
   */
  const dirty =
    displayName !== (profile?.display_name ?? '') ||
    handle !== (profile?.username ?? '') ||
    bio !== (profile?.bio ?? '') ||
    accent !== (profile?.accent ?? '') ||
    pickedPhoto !== null ||
    (removed && !!profile?.avatar_path);

  const canSave = nameOk && handleOk && bioOk && dirty;

  /*
   * Closing on a successful save waits for the render in which `committed`
   * is true, so the discard guard below is already off when the screen goes.
   * Calling router.back() straight from save() would find `dirty` still true
   * (a picked photo stays picked) and ask the user to discard what they had
   * just saved.
   */
  useEffect(() => {
    if (committed) router.back();
  }, [committed, router]);

  /*
   * This is a sheet, and a sheet closes on a downward swipe. A half-written
   * bio or a new picture used to go with it, silently, and Cancel did the
   * same. Both now ask first. While a save is running the dismissal is held
   * rather than offered: the save is already deciding what happens next.
   */
  usePreventRemove(dirty && !committed, ({ data }) => {
    if (saving) return;
    confirmDestructive(
      'Discard your changes?',
      'Your edits to your profile have not been saved.',
      'Discard',
      () => navigation.dispatch(data.action),
    );
  });

  const applyPick = useCallback((r: PickResult) => {
    if (r.ok) setPickedPhoto(r.uri);
    else if (r.reason !== 'cancelled') pickNotice(r);
  }, []);

  // No haptics in these three: a button press does not tick, only a completed save does.
  const choosePhoto = useCallback(async () => {
    applyPick(await pickFromLibrary());
  }, [applyPick]);

  const takePhoto = useCallback(async () => {
    applyPick(await pickFromCamera());
  }, [applyPick]);

  const removePhoto = useCallback(() => {
    setPickedPhoto(null);
    setRemoved(true);
  }, []);

  /**
   * Puts the content filter's refusal next to the field it is about. A
   * refusal under a field is spoken by that Field, which announces an error
   * as it appears; one that lands in the form's Notice is spoken by the
   * Notice (and its live region on Android). Neither is said here, which
   * would say it twice.
   */
  const refuse = (fields: TextField[]) => {
    if (fields.length > 0) {
      setRefused(Object.fromEntries(fields.map((f) => [f, valueOf(f)])));
    } else {
      setError(OBJECTIONABLE_MESSAGE);
    }
  };

  // The press does not tick; the success haptic lands when the save has gone through.
  const save = async () => {
    if (!profile || saving) return;
    setError(null);
    setRefused({});

    /*
     * The content filter first, before a picture is uploaded for a save
     * that cannot go through. The server holds the same line, with the same
     * list, which can grow from the dashboard; this only says so next to the
     * field without the round trip. The username is checked glued, as the
     * server checks it ('thepourhouse' has no spaces to split on), and as
     * updateProfile now does before it sends anything: skipping that here
     * uploaded the picture first and then left it with nothing pointing at it.
     */
    const flagged = (['name', 'handle', 'bio'] as const).filter((f) =>
      containsObjectionable(valueOf(f), { glued: f === 'handle' }),
    );
    if (flagged.length > 0) {
      refuse(flagged);
      return;
    }

    /*
     * Three states, and they are not the same:
     *   a fresh pick  -> upload, then store the new path
     *   removed       -> store null, so the avatar falls back to initials
     *   neither       -> undefined, which leaves the column untouched
     *
     * The upload goes through uploadAvatar, which re-encodes it with
     * stripMetadata first: no EXIF, no GPS.
     */
    setSaving(true);
    let avatarPath: string | null | undefined;
    let uploaded: string | null = null;
    if (pickedPhoto) {
      setUploading(true);
      uploaded = await uploadAvatar(profile.id, pickedPhoto);
      setUploading(false);
      if (!uploaded) {
        setSaving(false);
        setError('Could not upload that photo. Try again.');
        return;
      }
      avatarPath = uploaded;
    } else if (removed) {
      avatarPath = null;
    }

    // Caught so that `saving` always comes back down: stuck up, it would
    // hold the sheet open with no way to save or leave.
    const message = await updateProfile({ displayName, username, bio, accent, avatarPath }).catch(
      () => 'Could not save your profile. Check your connection and try again.',
    );
    if (message) {
      setSaving(false);
      // The profile refused, so the picture just uploaded belongs to nothing.
      // The next Save uploads it again, so there is nothing to keep.
      if (uploaded) void removeStoredPhoto(uploaded);

      /*
       * The server's content filter. Today the store hands back
       * OBJECTIONABLE_MESSAGE itself, which does not say which field, so
       * the refusal goes to the one text field that changed, and only when
       * more than one did does it fall back to the form. The trigger does
       * name the column (in the error's DETAIL); should the store pass the
       * server's text through instead, refusedColumn places it exactly.
       */
      if (message === OBJECTIONABLE_MESSAGE || isObjectionableError({ message })) {
        const named = refusedColumn(message);
        const changed = (['name', 'handle', 'bio'] as const).filter(
          (f) => valueOf(f) !== savedValueOf(f),
        );
        refuse(named ? [named] : changed.length === 1 ? changed : []);
        return;
      }

      setError(message);
      return;
    }

    /*
     * The profile now points at the new picture, or at none, so the previous
     * one is removed from the bucket, not just from the signed-URL cache.
     * Every signed-in account can list and read `pours/<uid>/`, so a picture
     * someone removed and left in storage was not removed at all.
     */
    const previous = profile.avatar_path;
    if (avatarPath !== undefined && previous && previous !== avatarPath) {
      forgetSignedPhoto(previous);
      void removeStoredPhoto(previous);
    }

    /*
     * The feed holds its own copy of your profile beside your posts, with
     * the old name and, now, a picture that no longer exists. A failed feed
     * is left alone: its retry is a full load, which fetches this anyway.
     */
    if (!feedError) void refreshFeed(profile.id);

    haptic.success();
    setCommitted(true);
  };

  if (!profile) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <Text style={[textRole.body, styles.blurb]}>Sign in to edit your profile.</Text>
      </View>
    );
  }

  /*
   * What is wrong with each field now, or null. Field shows it in place of
   * the hint, reads it with the field and announces it as it appears, so
   * each one is written to stand on its own.
   */
  const nameError = isRefused('name') ? OBJECTIONABLE_MESSAGE : null;
  const handleError = isRefused('handle')
    ? OBJECTIONABLE_MESSAGE
    : username.length > 0 && !handleOk
      ? 'Lowercase letters, numbers, dots and underscores. 3–24 characters.'
      : null;
  const bioError = isRefused('bio') ? OBJECTIONABLE_MESSAGE : null;
  const bioLength = bio.trim().length;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheetH : 0}
      onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}>
      {/*
        The sheet inset on iOS, not the status bar's: the page sheet starts
        below the status bar, and the root's inset added inside it left a
        blank band above Cancel. Android presents the modal full screen and
        does need it. The rule is always on: the bar sits over a form that
        scrolls under it from the first field. Save stays at the foot of the
        form rather than in the bar, beside the fields it commits.
      */}
      <ScreenTopBar
        title="Edit profile"
        inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}
        showRule
        left={<TopBarTextButton label="Cancel" muted onPress={() => router.back()} />}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Live preview: the face as the profile draws it, ring and all. */}
        <View style={styles.preview}>
          <Avatar
            name={displayName || profile.display_name}
            accent={accent}
            size={96}
            ring
            avatarPath={removed ? null : profile.avatar_path}
            localUri={pickedPhoto}
          />
          <View style={styles.photoActions}>
            {/* The same two verbs as the pour screen, library first; two wash keys, words only. */}
            <Button label="Choose photo" variant="secondary" onPress={() => void choosePhoto()} />
            <Button label="Take photo" variant="secondary" onPress={() => void takePhoto()} />
          </View>
          {(profile.avatar_path && !removed) || pickedPhoto ? (
            /*
             * The destructive words, ink and underlined (no red in Daylight):
             * a quiet action under the two keys that are this block's point.
             * Row-sized, so it keeps a 44pt target without standing as tall
             * as they do. No tick, like theirs: a press does not tick, and
             * nothing is removed until Save.
             */
            <Button label="Remove photo" variant="dangerText" size="sm" onPress={removePhoto} />
          ) : null}
        </View>

        <Text style={styles.label}>Avatar tone</Text>
        <Text style={styles.toneHint}>Behind your initials when there is no photo.</Text>
        {/*
          Each tone as the disc it makes, its name under it. The chosen one
          is ringed in ink, 2pt, 4pt clear of the disc, and its name turns
          ink: two cues, neither of them a fill. The ring is drawn in a box
          every swatch keeps, so choosing one moves nothing.
        */}
        <View style={styles.tones}>
          {SIGNUP_ACCENTS.map((c) => {
            const selected = c === shownTone;
            const name = ACCENT_NAMES[c] ?? 'Custom';
            return (
              <Pressable
                key={c}
                onPress={() => {
                  if (selected) return;
                  haptic.select();
                  setAccent(c);
                }}
                accessibilityRole="button"
                // "Selected" comes from the state; saying it in the label too
                // made VoiceOver announce it twice.
                accessibilityState={{ selected }}
                accessibilityLabel={`${name} tone`}
                // The disc IS the choice, so it dims while held rather than changing fill.
                style={({ pressed }) => [styles.tone, pressed && styles.tonePressed]}>
                <View style={styles.toneBox}>
                  <Avatar name={displayName || profile.display_name} accent={c} size={TONE_DISC} />
                  {selected ? <View pointerEvents="none" style={styles.toneRing} /> : null}
                </View>
                {/*
                  One word in a quarter of the form: past 1.3x it shrinks to
                  fit its column rather than break inside the word.
                */}
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  maxFontSizeMultiplier={1.3}
                  style={[textRole.small, selected ? styles.toneNameOn : styles.toneName]}>
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/*
          The app's one form field, as sign-in draws it: a visible label,
          the hint or the problem beneath, both read with the field.
        */}
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          autoCapitalize="words"
          maxLength={NAME_MAX}
          error={nameError}
          style={styles.field}
        />

        <Field
          label="Username"
          prefix="@"
          value={username}
          onChangeText={setUsername}
          placeholder="yourname"
          maxLength={HANDLE_MAX}
          hint="How people find you. Changing it frees your old one for someone else."
          error={handleError}
          style={styles.field}
        />

        <Field
          label="About"
          accessibilityLabel="About you"
          value={bio}
          onChangeText={setBio}
          placeholder="What you drink, and where"
          multiline
          autoCapitalize="sentences"
          autoCorrect
          maxLength={BIO_MAX}
          error={bioError}
          style={styles.field}
        />
        {/* Its own line under the field, so a refusal above it never shares the row. */}
        <Text style={styles.counter} accessibilityLabel={`${bioLength} of ${BIO_MAX} characters`}>
          {bioLength}/{BIO_MAX}
        </Text>

        {error ? (
          <Notice tone="error" style={styles.notice}>
            {error}
          </Notice>
        ) : null}

        <Button
          label={uploading ? 'Uploading…' : saving ? 'Saving…' : 'Save changes'}
          onPress={() => void save()}
          disabled={!canSave}
          loading={saving}
          block
          style={styles.save}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centre: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: layout.gutter },

  preview: { alignItems: 'center', paddingVertical: space.lg, gap: space.lg },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },

  /*
   * The tones' label, set as Field sets its own, so the one label that is
   * not a Field's reads as one of them.
   */
  label: {
    ...textRole.fieldLabel,
    color: colors.textMuted,
    marginTop: space.xl,
  },
  toneHint: { ...textRole.small, color: colors.textMuted, marginTop: space.xs, marginBottom: space.md },

  /* Four columns across the form, each a disc in its ring box over its name. */
  tones: { flexDirection: 'row', justifyContent: 'space-between' },
  tone: { flex: 1, alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  tonePressed: { opacity: 0.6 },
  toneBox: { width: TONE_BOX, height: TONE_BOX, alignItems: 'center', justifyContent: 'center' },
  toneRing: {
    ...StyleSheet.absoluteFill,
    // round-ok: the ring round an avatar disc
    borderRadius: TONE_BOX / 2,
    borderWidth: TONE_RING,
    borderColor: colors.lineInk,
  },
  toneName: { color: colors.textMuted, textAlign: 'center' },
  toneNameOn: { color: colors.text, textAlign: 'center' },

  field: { marginTop: space.lg },
  counter: {
    alignSelf: 'flex-end',
    ...textRole.small,
    ...tabular,
    color: colors.textMuted,
    marginTop: space.sm,
  },

  notice: { marginTop: space.lg },

  save: { marginTop: space.xl },
  blurb: { color: colors.textMuted },
});
