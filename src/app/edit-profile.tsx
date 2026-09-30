import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnnounce } from '@/components/AuthGate';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { Avatar, Button, PressableScale, haptic } from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  fonts,
  radius,
  SIGNUP_ACCENTS,
  space,
  type as typeScale,
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
/* the colour of your avatar.                                           */
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
 * What VoiceOver calls each swatch. It used to read the hex, "Accent colour,
 * number 7 E 2 3 3 0", and six of those cannot be told apart by ear. Keyed
 * by the same tokens SIGNUP_ACCENTS is built from; the amber and the plum
 * have no token of their own (theme.ts keeps them as literals), so they are
 * keyed by their place in that list.
 */
const ACCENT_NAMES: Record<string, string> = {
  [CATEGORY_META.cocktail.color]: 'Merlot',
  [SIGNUP_ACCENTS[1]!]: 'Amber',
  [SIGNUP_ACCENTS[2]!]: 'Plum',
  [CATEGORY_META.spirit.color]: 'Espresso',
  [colors.wine]: 'Wine',
  [colors.taupeInk]: 'Taupe',
};

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
  const [error, setError] = useState<string | null>(null);
  /*
   * The error box's live region is Android's; iOS ignores it, so VoiceOver
   * heard nothing when Save failed. This speaks it there.
   */
  useAnnounce(error);

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
  /** Which field has the keyboard, for the edge the sign-in fields draw. */
  const [focused, setFocused] = useState<TextField | null>(null);

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

  // No haptics in these three: the controls they sit behind tick on press.
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
   * refusal under a field is spoken here, since nothing else announces it;
   * one that lands in the error box is spoken by useAnnounce (iOS) and the
   * box's live region (Android), so saying it here too would say it twice.
   */
  const refuse = (fields: TextField[]) => {
    if (fields.length > 0) {
      setRefused(Object.fromEntries(fields.map((f) => [f, valueOf(f)])));
      AccessibilityInfo.announceForAccessibility(OBJECTIONABLE_MESSAGE);
    } else {
      setError(OBJECTIONABLE_MESSAGE);
    }
  };

  // No haptic of its own: the Save button's press already ticked.
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

    setCommitted(true);
  };

  /*
   * Each return ends in its own Grain. This screen is presented natively,
   * above the root layout's grain layer, so nothing drawn there reaches it.
   */
  if (!profile) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <Text style={styles.blurb}>Sign in to edit your profile.</Text>
        <Grain />
      </View>
    );
  }

  const nameRefused = isRefused('name');
  const handleRefused = isRefused('handle');
  const bioRefused = isRefused('bio');
  // One string for the line under the field and for the field's own hint,
  // so VoiceOver reads the rule or the problem with the field itself.
  const handleHint = handleRefused
    ? OBJECTIONABLE_MESSAGE
    : username.length > 0 && !handleOk
      ? 'Lowercase letters, numbers, dots and underscores. 3–24 characters.'
      : 'How people find you. Changing it frees your old one for someone else.';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheetH : 0}
      onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}>
      {/*
        No status-bar inset on iOS: the page sheet starts below the status
        bar, and the root's inset added inside it left a blank band above
        Cancel. Android presents the modal full screen and does need it.
      */}
      <View
        style={[
          styles.topBar,
          { paddingTop: Platform.OS === 'ios' ? space.lg : insets.top + space.sm },
        ]}>
        <PressableScale
          onPress={() => router.back()}
          noHaptic
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.topBarSide}>
          {/* Capped so it stays one line in the fixed slot that keeps the title centred. */}
          <Text style={styles.cancel} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            Cancel
          </Text>
        </PressableScale>
        <Text style={styles.topBarTitle} accessibilityRole="header">
          Edit profile
        </Text>
        <View style={styles.topBarSide} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Live preview — the accent is the only thing here you cannot
            picture from its label, so it gets shown rather than described. */}
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
            {/* The same two verbs as the pour screen, library first. */}
            <Button
              label="Choose photo"
              variant="secondary"
              icon="grid"
              onPress={() => void choosePhoto()}
            />
            <Button
              label="Take photo"
              variant="secondary"
              icon="camera"
              onPress={() => void takePhoto()}
            />
          </View>
          {(profile.avatar_path && !removed) || pickedPhoto ? (
            // Its own press tick, like the Buttons above; the handler adds none.
            <PressableScale
              onPress={removePhoto}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              style={styles.removePhoto}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </PressableScale>
          ) : null}
        </View>

        <Text style={styles.label}>Accent</Text>
        <View style={styles.swatches}>
          {SIGNUP_ACCENTS.map((c) => {
            const selected = c === accent;
            return (
              <PressableScale
                key={c}
                onPress={() => {
                  haptic.select();
                  setAccent(c);
                }}
                noHaptic
                accessibilityRole="button"
                // "Selected" comes from the state; saying it in the label too
                // made VoiceOver announce it twice.
                accessibilityState={{ selected }}
                accessibilityLabel={`${ACCENT_NAMES[c] ?? 'Custom'} accent`}
                style={[styles.swatch, { backgroundColor: c }, selected && styles.swatchOn]}>
                {selected ? <Icon name="check" size={15} color={colors.textOnWine} /> : null}
              </PressableScale>
            );
          })}
        </View>

        <Text style={styles.label}>Display name</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          maxLength={NAME_MAX}
          onFocus={() => setFocused('name')}
          onBlur={() => setFocused(null)}
          style={[styles.input, focused === 'name' && styles.inputFocused]}
          accessibilityLabel="Display name"
          accessibilityHint={nameRefused ? OBJECTIONABLE_MESSAGE : undefined}
        />
        {nameRefused ? (
          <Text style={[styles.hint, styles.hintError]}>{OBJECTIONABLE_MESSAGE}</Text>
        ) : null}

        <Text style={styles.label}>Username</Text>
        <View style={[styles.handleWrap, focused === 'handle' && styles.inputFocused]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="yourname"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={HANDLE_MAX}
            onFocus={() => setFocused('handle')}
            onBlur={() => setFocused(null)}
            style={styles.handleInput}
            accessibilityLabel="Username"
            accessibilityHint={handleHint}
          />
        </View>
        <Text
          style={[
            styles.hint,
            (handleRefused || (username.length > 0 && !handleOk)) && styles.hintError,
          ]}>
          {handleHint}
        </Text>

        <Text style={styles.label}>About</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="What you drink, and where"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={BIO_MAX}
          onFocus={() => setFocused('bio')}
          onBlur={() => setFocused(null)}
          style={[styles.input, styles.bioInput, focused === 'bio' && styles.inputFocused]}
          accessibilityLabel="About you"
          accessibilityHint={bioRefused ? OBJECTIONABLE_MESSAGE : undefined}
        />
        <View style={styles.bioFoot}>
          {bioRefused ? (
            <Text style={[styles.hint, styles.hintError, styles.bioRefusal]}>
              {OBJECTIONABLE_MESSAGE}
            </Text>
          ) : (
            <View style={styles.bioRefusal} />
          )}
          <Text style={styles.counter}>
            {bio.trim().length}/{BIO_MAX}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Icon name="close" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
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
      <Grain />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centre: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.xl },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  topBarSide: { width: 72 },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    color: colors.text,
  },
  cancel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.body.fontSize,
    color: colors.textMuted,
  },

  preview: { alignItems: 'center', paddingVertical: space.lg, gap: space.lg },
  photoActions: { flexDirection: 'row', gap: space.md },
  // 44pt tall: it sits right under two 52pt buttons and is destructive.
  removePhoto: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
  removePhotoText: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    color: colors.danger,
  },

  /*
   * Label size, field height and edge match the sign-in Field (AuthGate),
   * the other place this app draws a labelled text field: 12pt on the type
   * scale, 50pt tall, and a textFaint edge that turns wine while you type.
   * The cardBorder hairline these had measured 1.08:1 against the page and
   * 1.21:1 against the white fill, so the fields were close to invisible to
   * anyone with low vision; a control's edge needs 3:1 (textFaint: 3.51:1
   * and 3.91:1), and the "tint and hairline" rule is for cards.
   */
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 0.2,
    color: colors.textMuted,
    marginTop: space.lg,
    marginBottom: space.sm,
  },

  swatches: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  /* The ring is drawn in the page colour so it reads as a gap around the
     swatch rather than a second colour competing with the one it marks. */
  swatchOn: { borderColor: colors.bg },

  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.textFaint,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 50,
    fontFamily: fonts.body,
    /* 16 so iOS does not auto-zoom the screen when the field takes focus. */
    fontSize: 16,
    color: colors.text,
  },
  bioInput: { minHeight: 108, paddingTop: space.md, textAlignVertical: 'top' },
  // Same width as the resting edge, so focusing does not nudge the layout.
  inputFocused: { borderColor: colors.wine },

  handleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.textFaint,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 50,
  },
  at: { fontFamily: fonts.body, fontSize: 16, color: colors.textMuted },
  handleInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    paddingLeft: 2,
  },

  hint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.sm,
  },
  hintError: { color: colors.danger },
  // The refusal and the counter share a line: message left, count right.
  bioFoot: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  bioRefusal: { flex: 1 },
  counter: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    marginTop: space.sm,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.dangerWash,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.lg,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.danger,
  },

  save: { marginTop: space.xl },
  blurb: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.textMuted,
  },
});
