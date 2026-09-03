import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { Button, PressableScale, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { normalizePhone } from '@/lib/contacts';
import { normalizeHandle } from '@/lib/instagram';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* Field                                                                */
/* ==================================================================== */

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];
  textContentType?: React.ComponentProps<typeof TextInput>['textContentType'];
  inputMode?: React.ComponentProps<typeof TextInput>['inputMode'];
  hint?: string;
  /** Fixed leading character, e.g. the '@' on a handle. Not part of the value. */
  prefix?: string;
  /** Colours the hint as a problem. The submit button is disabled either
   *  way, so without this the reason reads as ordinary help text. */
  hintIsError?: boolean;
}

/**
 * Exported for PasswordResetOverlay, which is the same auth surface reached
 * from a deep link rather than from this screen. Sharing it keeps one
 * implementation of the label, the hint states and the reveal toggle —
 * three password fields that behaved subtly differently would be worse than
 * the small coupling.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  autoComplete,
  textContentType,
  inputMode,
  hint,
  prefix,
  hintIsError,
}: FieldProps) {
  const [reveal, setReveal] = useState(false);

  return (
    <View style={styles.field}>
      {/* A visible label, not a placeholder-only field. */}
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={secure && !reveal}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          inputMode={inputMode}
          style={[styles.input, prefix ? styles.inputWithPrefix : null]}
          accessibilityLabel={label}
        />
        {secure ? (
          <PressableScale
            onPress={() => setReveal((r) => !r)}
            hitSlop={12}
            noHaptic
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
            style={styles.reveal}>
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>
      {hint ? (
        <Text
          style={[styles.fieldHint, hintIsError && styles.fieldHintError]}
          accessibilityLiveRegion={hintIsError ? 'polite' : 'none'}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* AuthGate                                                             */
/* ==================================================================== */

/**
 * Renders `children` once signed in, otherwise the sign-in form.
 *
 * Only the social surfaces are gated — the Dex and your collection stay
 * local and work signed out, because your collection is yours.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.wine} />
      </View>
    );
  }

  return session ? <>{children}</> : <AuthForm />;
}

function AuthForm() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, requestPasswordReset, busy, error, notice, clearError } = useAuth();

  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    clearError();
  }, [mode, clearError]);

  const signup = mode === 'up';
  /* The reset request needs an email and nothing else — no password field,
     none of the signup extras, and a different button and tagline. */
  const forgot = mode === 'forgot';

  /*
   * Optional, but not ignorable: a typo is blocked rather than accepted and
   * quietly dropped, because a handle that never matches anyone looks
   * identical to a feature that does not work.
   */
  const instagramTyped = instagram.trim().length > 0;
  const instagramOk = !instagramTyped || normalizeHandle(instagram) !== null;

  const phoneTyped = phone.trim().length > 0;
  const phoneOk = !phoneTyped || normalizePhone(phone) !== null;

  const canSubmit =
    email.includes('@') &&
    (forgot || password.length >= 6) &&
    (!signup ||
      (username.trim().length >= 3 && displayName.trim().length > 0 && instagramOk && phoneOk));

  const submit = () => {
    haptic.tap();
    if (forgot) void requestPasswordReset(email);
    else if (signup) void signUp(email, password, username, displayName, instagram, phone);
    else void signIn(email, password);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + space.xxxl,
            /*
             * TAB_BAR_CLEARANCE, not a bare inset: the tab bar floats OVER
             * this screen, so 32pt of padding left the "Already have an
             * account?" link stranded underneath it with nothing left to
             * scroll — verified on an iPhone 17 once the Instagram field
             * made the form a row taller. Same clearance every tab screen uses.
             */
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
          },
        ]}
        keyboardShouldPersistTaps="handled">
        <Image
          source={require('../../assets/images/sipply-lockup.webp')}
          style={styles.lockup}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel="Sipply"
        />
        <Text style={styles.tagline}>
          {forgot
            ? 'Type the email you signed up with and we will send a link to set a new password.'
            : signup
              ? 'Make an account to share your pours and follow other collectors.'
              : 'Sign in to see what everyone has been pouring.'}
        </Text>

        <View style={styles.form}>
          {signup ? (
            <>
              <Field
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Jan McQueeny"
                autoComplete="name"
                textContentType="name"
              />
              <Field
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="janpours"
                autoComplete="username-new"
                textContentType="username"
                hint="Letters and numbers, at least 3 characters."
              />
            </>
          ) : null}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            textContentType="emailAddress"
            inputMode="email"
          />
          {forgot ? null : (
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secure
              autoComplete={signup ? 'password-new' : 'password'}
              textContentType={signup ? 'newPassword' : 'password'}
            />
          )}

          {/*
            Sign-in only. On the signup form there is no password to have
            forgotten yet, and offering a reset there reads as an error
            message about the account being created.
          */}
          {mode === 'in' ? (
            <PressableScale
              onPress={() => setMode('forgot')}
              noHaptic
              accessibilityRole="button"
              style={styles.forgot}>
              <Text style={styles.forgotText}>Forgot your password?</Text>
            </PressableScale>
          ) : null}

          {signup ? (
            <Field
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="(787) 555-0134"
              inputMode="tel"
              autoComplete="tel"
              textContentType="telephoneNumber"
              hintIsError={phoneTyped && !phoneOk}
              hint={
                phoneTyped && !phoneOk
                  ? 'That does not look like a phone number.'
                  : 'Lets friends who already have your number find you here. Stored as a one-way hash, never the number.'
              }
            />
          ) : null}

          {signup ? (
            <Field
              label="Instagram (optional)"
              value={instagram}
              onChangeText={setInstagram}
              placeholder="yourusername"
              prefix="@"
              /* Not autoComplete="username": this sits inside a create-account
                 form, and offering saved logins here muddles the password
                 manager's prompt for the account actually being made. */
              autoComplete="off"
              hintIsError={instagramTyped && !instagramOk}
              hint={
                instagramTyped && !instagramOk
                  ? 'That does not look like an Instagram username.'
                  : 'Lets friends who import their Instagram list find you. Stored as a one-way hash, never the username.'
              }
            />
          ) : null}

          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Icon name="close" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {notice ? (
            <View style={styles.noticeBox} accessibilityLiveRegion="polite">
              <Icon name="check" size={16} color={colors.success} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <Button
            label={
              busy
                ? 'Just a moment…'
                : forgot
                  ? 'Send reset link'
                  : signup
                    ? 'Create account'
                    : 'Sign in'
            }
            onPress={submit}
            disabled={!canSubmit || busy}
            block
            style={styles.submit}
          />

          <PressableScale
            onPress={() => setMode(mode === 'in' ? 'up' : 'in')}
            noHaptic
            accessibilityRole="button"
            style={styles.switch}>
            <Text style={styles.switchText}>
              {forgot
                ? 'Remembered it? Sign in'
                : signup
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account'}
            </Text>
          </PressableScale>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  scroll: { paddingHorizontal: space.xl, flexGrow: 1 },

  lockup: {
    /*
     * The brand lockup itself — seal, wordmark and letterspaced tagline —
     * rather than "Sipply" set in Playfair. This is the app's front door
     * and the one screen where the mark is the content, so it is the whole
     * lockup and not the bare seal the icon uses.
     *
     * CENTRED, which the rest of this screen is not. The lockup is an
     * internally centred composition: its seal sits over the middle of the
     * wordmark and the tagline is centred under both. Left-aligned against
     * the form it reads as a centred thing shoved into a corner, so the
     * mark and its supporting line take a centre axis and the form below
     * keeps the left one it has always had.
     *
     * BOTH dimensions are explicit, and there is a hard cap on top.
     *
     * This was `width: 170` plus `aspectRatio: 727 / 896`, letting Yoga
     * derive the height — and on device it rendered the lockup at roughly
     * full screen width, overflowing both edges and pushing the email and
     * password fields below the fold behind the tab bar. Signing in was
     * impossible without scrolling past a mark the size of the screen.
     *
     * The ratio was not the problem: the asset is 512x632, which is 727:896
     * to three decimals. An Image carries its own intrinsic size, so a
     * width-plus-ratio pair is an inference about how that intrinsic size
     * gets overridden, and an inference is exactly what should not be load
     * bearing on the app's front door. Concrete numbers cannot be
     * misinterpreted, and maxWidth means that even if something upstream
     * changes again, the worst case is a mark that fits the screen.
     *
     * 160x198 keeps the 512:632 ratio. If the sheet is recut, recompute
     * height as width * 632 / 512.
     */
    width: 160,
    height: 198,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    /*
     * Wider gap than the old wordmark needed. That was a line of type and
     * this is artwork whose tagline already sits close under it, so the
     * small step read as one crowded block of three lines.
     */
    marginTop: space.lg,
    marginBottom: space.xxl,
    maxWidth: 320,
    textAlign: 'center',
    alignSelf: 'center',
  },

  form: { gap: space.lg },

  field: { gap: 6 },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  inputWrap: { justifyContent: 'center' },
  inputWithPrefix: { paddingLeft: space.lg + 16 },
  input: {
    minHeight: 50,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingRight: 46,
    // 16pt keeps iOS from auto-zooming the field on focus.
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
  },
  reveal: { position: 'absolute', right: space.md, padding: 6 },
  /*
   * Drawn over the field rather than inside the value: an '@' the user can
   * delete or double up on is a handle that never matches anybody.
   */
  prefix: {
    position: 'absolute',
    left: space.lg,
    zIndex: 1,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.textFaint,
  },
  fieldHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textFaint,
  },
  fieldHintError: { color: colors.danger },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.dangerWash,
    borderWidth: 1,
    borderColor: colors.danger + '55',
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 18,
    color: colors.danger,
  },

  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.successWash,
    borderWidth: 1,
    borderColor: colors.success + '55',
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 18,
    color: colors.success,
  },

  submit: { marginTop: space.sm },

  /*
   * Pulled up tight under the password field and given negative top margin
   * to sit inside the form's `gap: space.lg` rather than adding a third
   * gap's worth of air below the field it belongs to. Right-aligned, where
   * every other iOS sign-in form puts it.
   */
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -space.md,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
  },
  forgotText: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  switch: { alignSelf: 'center', paddingVertical: space.md, paddingHorizontal: space.lg },
  switchText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
  },
});
