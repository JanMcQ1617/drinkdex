import { useRef } from 'react';
import { Pressable, StyleSheet, Text, type TextInput, View } from 'react-native';

import { useInputFocusOnShow } from '@/components/auth/AuthTitleBar';
import { AuthMessage } from '@/components/auth/Consent';
import { ProviderRows } from '@/components/auth/ProviderButton';
import { Button, Field, FieldGroup } from '@/components/ui';
import { colors, fonts, space, type as typeScale } from '@/constants/theme';
import { PHONE_SIGN_IN_ENABLED, useAuth } from '@/store/auth';
import { looksLikeEmail, MIN_NEW_PASSWORD, useSignInFlow } from '@/store/signInFlow';

/* ==================================================================== */
/* Email: the address, then the password                                */
/*                                                                      */
/* EMAIL FIRST, THEN THE PASSWORD. The address is looked up (migration  */
/* 016's sign_in_method) and the next step is the one that address      */
/* needs: sign in, create an account, or "sign in another way" for an   */
/* account made with Apple, Google, Facebook or a phone number. When    */
/* the lookup will not answer (metered, or the function missing) the    */
/* step offers both paths, so a refused lookup is never an outage.      */
/*                                                                      */
/* THE ADDRESS STAYS ON SCREEN, READ-ONLY, ON THE PASSWORD STEP. iOS    */
/* Password AutoFill pairs a password with a username field present on  */
/* the same screen; a two-screen login without it saves passwords under */
/* no account. So the address is a real TextInput tagged as the         */
/* keychain username, drawn as a field that cannot be typed in, and     */
/* tapping it ("Change") goes back to the step where it can be.         */
/*                                                                      */
/* Every value lives in the sign-in flow store, not here, so Home and   */
/* Profile (each with its own gate) show the same address and the same  */
/* step, and these components are only the drawing of it.               */
/* ==================================================================== */

const EMAIL_HINT = 'We’ll check whether you already have an account.';
const NEW_PASSWORD_HINT = 'At least 6 characters.';
const OTHER_LEDE =
  'That email belongs to an account that signs in another way: with Apple, Google, Facebook or a phone number. Use the one you set it up with.';
const RESET_LEDE = 'We’ll email a link to set a new password.';

function noop() {}

/**
 * The auth store's own answer, under the step's primary button: a refused
 * password, "check your email, then sign in" after a sign-up that needs
 * confirming, a sent reset link, or a dead reset link (failRecovery) that
 * arrived while signed out. The flow's own messages (a lookup that failed,
 * a code that was wrong) sit in the helper slot under the field instead.
 */
export function AuthStoreMessages() {
  const error = useAuth((s) => s.error);
  const notice = useAuth((s) => s.notice);
  return (
    <>
      {error ? (
        <AuthMessage tone="error" style={styles.message}>
          {error}
        </AuthMessage>
      ) : null}
      {notice ? (
        <AuthMessage tone="notice" style={styles.message}>
          {notice}
        </AuthMessage>
      ) : null}
    </>
  );
}

/**
 * Where "Change" on the read-only address goes: the step that types it.
 * With the phone number off, that is the first step itself.
 */
function useChangeEmail() {
  const go = useSignInFlow((s) => s.go);
  return () => go(PHONE_SIGN_IN_ENABLED ? 'email' : 'entry');
}

/**
 * The address, shown and not editable, in a group row of its own. The
 * whole row is one button ("Change"), so the field inside takes no touch
 * of its own: its box would otherwise take the press to focus an input
 * that cannot be typed in.
 */
function ReadOnlyEmail({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <Pressable
      onPress={onChange}
      accessibilityRole="button"
      accessibilityLabel={`Email, ${email}`}
      accessibilityHint="Double-tap to change."
      style={({ pressed }) => pressed && styles.pressed}>
      <View pointerEvents="none">
        <Field
          label="Email"
          value={email}
          onChangeText={noop}
          editable={false}
          // The keychain username the password below is saved under.
          textContentType="username"
          autoComplete="email"
          trailing={<Text style={styles.change}>Change</Text>}
        />
      </View>
    </Pressable>
  );
}

/**
 * The address on its own: the first step when the phone number is off
 * (`focusOnShow` false: the keyboard stays down over the ways in below),
 * and "Continue with email" when it is on.
 */
export function EmailStep({ focusOnShow }: { focusOnShow: boolean }) {
  const email = useSignInFlow((s) => s.email);
  const error = useSignInFlow((s) => s.error);
  const pending = useSignInFlow((s) => s.pending);
  const setEmail = useSignInFlow((s) => s.setEmail);
  const submitEmail = useSignInFlow((s) => s.submitEmail);
  const inputRef = useRef<TextInput>(null);
  useInputFocusOnShow(inputRef, focusOnShow);

  const checking = pending === 'email';

  return (
    <View>
      <FieldGroup error={error} hint={EMAIL_HINT}>
        <Field
          ref={inputRef}
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          inputMode="email"
          autoComplete="email"
          // The account's login name, so it is what iOS pairs with the
          // password in the keychain on the next step.
          textContentType="username"
          returnKeyType="next"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void submitEmail()}
          invalid={!!error}
        />
      </FieldGroup>
      <Button
        label={checking ? 'Checking…' : 'Continue'}
        onPress={() => void submitEmail()}
        disabled={!looksLikeEmail(email)}
        loading={checking}
        block
        style={styles.primary}
      />
      <AuthStoreMessages />
    </View>
  );
}

/**
 * The step after the lookup. 'other' has no password to type, so it is
 * the ways in alone; every other answer is the address and a password.
 */
export function PasswordStep() {
  const emailStatus = useSignInFlow((s) => s.emailStatus);
  return emailStatus === 'other' ? <OtherWayStep /> : <PasswordForm />;
}

/**
 * Sign in ('password'), create an account ('new'), or, when the lookup
 * would not say ('unknown'), sign in with a way to switch to sign-up.
 */
function PasswordForm() {
  const email = useSignInFlow((s) => s.email);
  const password = useSignInFlow((s) => s.password);
  const emailStatus = useSignInFlow((s) => s.emailStatus);
  const setPassword = useSignInFlow((s) => s.setPassword);
  const submitPassword = useSignInFlow((s) => s.submitPassword);
  const signUpInstead = useSignInFlow((s) => s.signUpInstead);
  const go = useSignInFlow((s) => s.go);
  const busy = useAuth((s) => s.busy);
  const changeEmail = useChangeEmail();
  const inputRef = useRef<TextInput>(null);
  useInputFocusOnShow(inputRef);

  const isNew = emailStatus === 'new';
  const ready = password.length >= (isNew ? MIN_NEW_PASSWORD : 1);
  const label = isNew
    ? busy
      ? 'Creating account…'
      : 'Create account'
    : busy
      ? 'Signing in…'
      : 'Sign in';

  return (
    <View>
      {/*
        The rule is a hint that stays, not a placeholder that goes at the
        first keystroke and leaves a dimmed button with no reason. Signing
        in has no rule to meet.
      */}
      <FieldGroup hint={isNew ? NEW_PASSWORD_HINT : undefined}>
        <ReadOnlyEmail email={email} onChange={changeEmail} />
        <Field
          ref={inputRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure
          // New: iOS offers a strong password (the app's webcredentials
          // association). Otherwise: the saved one for the address above.
          textContentType={isNew ? 'newPassword' : 'password'}
          autoComplete={isNew ? 'password-new' : 'password'}
          returnKeyType="go"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void submitPassword()}
        />
      </FieldGroup>

      {/*
        Signing in only. On the sign-up variant there is no password to
        have forgotten yet, and offering a reset there reads as an error
        about the account being made.
      */}
      {isNew ? null : (
        <Button
          label="Forgot your password?"
          variant="text"
          size="sm"
          onPress={() => go('reset')}
          style={styles.forgot}
        />
      )}

      {/*
        `loading`, not `disabled`, while the request is out: loading keeps
        the button at full strength with a spinner, so a tap that landed
        never looks like one that did not.
      */}
      <Button
        label={label}
        onPress={() => void submitPassword()}
        disabled={!ready}
        loading={busy}
        block
        style={styles.primary}
      />
      <AuthStoreMessages />

      {emailStatus === 'unknown' ? (
        <Button
          label="New to Sipply? Create an account"
          variant="text"
          size="sm"
          onPress={signUpInstead}
          style={styles.link}
        />
      ) : null}
    </View>
  );
}

/**
 * An address whose account was made with Apple, Google, Facebook or a
 * phone number, so it has no password. The ways in are the actions, and
 * a password can still be set through the reset email, which is what
 * "set a password" really is for an account without one.
 */
function OtherWayStep() {
  const sendReset = useSignInFlow((s) => s.sendReset);
  const busy = useAuth((s) => s.busy);
  return (
    <View>
      <Text style={styles.lede}>{OTHER_LEDE}</Text>
      <ProviderRows withEmail={false} />
      <Button
        label="Or set a password by email"
        variant="text"
        onPress={() => void sendReset()}
        loading={busy}
        style={styles.link}
      />
      <AuthStoreMessages />
    </View>
  );
}

/**
 * The reset request: the address is already known, so it is the
 * read-only row and one button. The link it sends opens
 * PasswordResetOverlay, as it always has.
 */
export function ResetStep() {
  const email = useSignInFlow((s) => s.email);
  const sendReset = useSignInFlow((s) => s.sendReset);
  const busy = useAuth((s) => s.busy);
  const changeEmail = useChangeEmail();
  return (
    <View>
      <Text style={styles.lede}>{RESET_LEDE}</Text>
      <FieldGroup>
        <ReadOnlyEmail email={email} onChange={changeEmail} />
      </FieldGroup>
      <Button
        label={busy ? 'Sending link…' : 'Send reset link'}
        onPress={() => void sendReset()}
        loading={busy}
        block
        style={styles.primary}
      />
      <AuthStoreMessages />
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { marginTop: space.xl },
  message: { marginTop: space.md },
  lede: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.textMuted,
    marginBottom: space.lg,
  },
  /* Right-aligned under the group, where every iOS sign-in form puts it. */
  forgot: { alignSelf: 'flex-end', marginTop: space.sm },
  link: { alignSelf: 'center', marginTop: space.md },
  /*
    The read-only row's press. Field draws its own sunk fill, which this
    wrapper cannot swap, so the row dims instead, as a text button does;
    it never moves.
  */
  pressed: { opacity: 0.5 },
  change: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.wine,
  },
});
