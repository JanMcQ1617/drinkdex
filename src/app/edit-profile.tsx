import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { Avatar, Button, PressableScale, haptic } from '@/components/ui';
import {
  colors,
  fonts,
  radius,
  SIGNUP_ACCENTS,
  space,
  type as typeScale,
} from '@/constants/theme';
import { pickFromCamera, pickFromLibrary, type PickResult } from '@/lib/pour';
import { forgetSignedPhoto, uploadAvatar } from '@/lib/social';
import { useAuth } from '@/store/auth';

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

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const profile = useAuth((s) => s.profile);
  const updateProfile = useAuth((s) => s.updateProfile);
  const busy = useAuth((s) => s.busy);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [accent, setAccent] = useState(profile?.accent ?? SIGNUP_ACCENTS[0]!);
  const [error, setError] = useState<string | null>(null);

  /*
   * The picture is picked now and uploaded on Save, not on pick.
   *
   * Uploading immediately would leave an orphan in the bucket every time
   * someone chooses a photo and then backs out — and the storage policy
   * lets them write, so nothing would ever clean it up. `pickedPhoto` is
   * the local URI being previewed; it only becomes an object when the
   * rest of the form is committed too.
   */
  const [pickedPhoto, setPickedPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Distinct from "picked nothing": this means clear the existing one. */
  const [removed, setRemoved] = useState(false);

  const handle = username.trim().toLowerCase();
  const nameOk = displayName.trim().length >= 1 && displayName.trim().length <= NAME_MAX;
  const handleOk = /^[a-z0-9._]{3,24}$/.test(handle);
  const bioOk = bio.trim().length <= BIO_MAX;

  const dirty =
    displayName !== (profile?.display_name ?? '') ||
    handle !== (profile?.username ?? '') ||
    bio !== (profile?.bio ?? '') ||
    accent !== (profile?.accent ?? '') ||
    pickedPhoto !== null;

  const canSave = nameOk && handleOk && bioOk && dirty && !busy && !uploading;

  const applyPick = useCallback((r: PickResult) => {
    if (r.ok) setPickedPhoto(r.uri);
    else if (r.reason !== 'cancelled') Alert.alert(r.title, r.body);
  }, []);

  const choosePhoto = useCallback(async () => {
    haptic.tap();
    applyPick(await pickFromLibrary());
  }, [applyPick]);

  const takePhoto = useCallback(async () => {
    haptic.tap();
    applyPick(await pickFromCamera());
  }, [applyPick]);

  const removePhoto = useCallback(() => {
    haptic.tap();
    setPickedPhoto(null);
    setRemoved(true);
  }, []);

  const save = useCallback(async () => {
    haptic.tap();
    setError(null);

    /*
     * Three states, and they are not the same:
     *   a fresh pick  -> upload, then store the new path
     *   removed       -> store null, so the avatar falls back to initials
     *   neither       -> undefined, which leaves the column untouched
     */
    let avatarPath: string | null | undefined;
    if (pickedPhoto && profile) {
      setUploading(true);
      const uploaded = await uploadAvatar(profile.id, pickedPhoto);
      setUploading(false);
      if (!uploaded) {
        setError('Could not upload that picture. Try again.');
        return;
      }
      avatarPath = uploaded;
    } else if (removed) {
      avatarPath = null;
    }

    const message = await updateProfile({ displayName, username, bio, accent, avatarPath });
    if (message) {
      setError(message);
      return;
    }

    /*
     * The old path's signed URL is memoised, and the object behind it is
     * still there — so without this, every Avatar that had already
     * resolved keeps showing the previous picture until the cache ages
     * out an hour later.
     */
    if (avatarPath !== undefined) forgetSignedPhoto(profile?.avatar_path ?? null);

    router.back();
  }, [
    updateProfile,
    displayName,
    username,
    bio,
    accent,
    pickedPhoto,
    removed,
    profile,
    router,
  ]);

  if (!profile) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <Text style={styles.blurb}>Sign in to edit your profile.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <PressableScale
          onPress={() => router.back()}
          noHaptic
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.topBarSide}>
          <Text style={styles.cancel}>Cancel</Text>
        </PressableScale>
        <Text style={styles.topBarTitle}>Edit profile</Text>
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
            <Button
              label="Camera roll"
              variant="secondary"
              icon="grid"
              onPress={() => void choosePhoto()}
            />
            <Button
              label="Camera"
              variant="secondary"
              icon="camera"
              onPress={() => void takePhoto()}
            />
          </View>
          {(profile.avatar_path && !removed) || pickedPhoto ? (
            <PressableScale
              onPress={removePhoto}
              noHaptic
              accessibilityRole="button"
              style={styles.removePhoto}>
              <Text style={styles.removePhotoText}>Remove picture</Text>
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
                accessibilityState={{ selected }}
                accessibilityLabel={`Accent colour ${c}${selected ? ', selected' : ''}`}
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
          style={styles.input}
          accessibilityLabel="Display name"
        />

        <Text style={styles.label}>Username</Text>
        <View style={styles.handleWrap}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="yourname"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={HANDLE_MAX}
            style={styles.handleInput}
            accessibilityLabel="Username"
          />
        </View>
        <Text style={[styles.hint, username.length > 0 && !handleOk && styles.hintError]}>
          {username.length > 0 && !handleOk
            ? 'Lowercase letters, numbers, dots and underscores. 3–24 characters.'
            : 'How people find you. Changing it frees your old one for someone else.'}
        </Text>

        <Text style={styles.label}>About</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Design lover. Cocktail explorer. Always chasing the next great sip."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={BIO_MAX}
          style={[styles.input, styles.bioInput]}
          accessibilityLabel="About you"
        />
        <Text style={styles.counter}>
          {bio.trim().length}/{BIO_MAX}
        </Text>

        {error ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Icon name="close" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={uploading ? 'Uploading…' : busy ? 'Saving…' : 'Save changes'}
          onPress={() => void save()}
          disabled={!canSave}
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
  removePhoto: { paddingVertical: space.xs, paddingHorizontal: space.md },
  removePhotoText: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    color: colors.danger,
  },

  label: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
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
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 48,
    fontFamily: fonts.body,
    /* 16 so iOS does not auto-zoom the screen when the field takes focus. */
    fontSize: 16,
    color: colors.text,
  },
  bioInput: { minHeight: 108, paddingTop: space.md, textAlignVertical: 'top' },

  handleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 48,
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
  counter: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: space.xs,
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
