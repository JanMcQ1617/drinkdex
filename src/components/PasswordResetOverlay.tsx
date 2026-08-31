import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field } from '@/components/AuthGate';
import { Icon } from '@/components/icons';
import { Button, PressableScale, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { parseRecoveryUrl } from '@/lib/recovery';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* Password reset                                                       */
/*                                                                      */
/* Two jobs in one component, because they are two halves of one thing:  */
/* it listens for the recovery deep link, and it renders the "choose a  */
/* new password" step that link leads to.                               */
/*                                                                      */
/* WHY AN OVERLAY AND NOT A SCREEN. Opening a valid recovery link signs  */
/* the user in — GoTrue hands back an ordinary session, which is the     */
/* whole mechanism by which someone who has forgotten their password     */
/* gets back in. So by the time this needs to be on screen, AuthGate has */
/* already swapped the sign-in form for the app itself. There is no      */
/* signed-out surface left to host it. It is mounted at the root beside  */
/* the intro, above the whole navigator.                                */
/*                                                                      */
/* It is deliberately not dismissible by gesture. Backing out is an      */
/* explicit "Cancel", which signs back out — leaving someone silently    */
/* signed in off a mailed link, with a password they do not know, is the */
/* one outcome worth designing against.                                 */
/* ==================================================================== */

export function PasswordResetOverlay() {
  const recovering = useAuth((s) => s.recovering);
  const beginRecovery = useAuth((s) => s.beginRecovery);
  const failRecovery = useAuth((s) => s.failRecovery);

  /*
   * `done` lives HERE rather than in the form below, and that is load-
   * bearing. completePasswordReset clears `recovering` on success, so a
   * confirmation owned by the child would be unmounted by this component
   * in the same commit that set it — the success beat would never render.
   * Holding it one level up lets the overlay outlive the flag that opened
   * it, which is exactly what a confirmation has to do.
   */
  const [done, setDone] = useState(false);

  /*
   * Both cold start and warm, exactly as InviteLinkHandler does — a link
   * tapped while the app is closed arrives through getInitialURL and never
   * fires the listener. Every incoming URL reaches both handlers; each
   * returns null for the other's links rather than treating them as junk.
   */
  useEffect(() => {
    let active = true;

    const handle = (url: string | null) => {
      if (!url || !active) return;
      const link = parseRecoveryUrl(url);
      if (!link) return;

      if (link.kind === 'error') failRecovery(link.message);
      else void beginRecovery(link.accessToken, link.refreshToken);
    };

    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));

    return () => {
      active = false;
      sub.remove();
    };
  }, [beginRecovery, failRecovery]);

  if (!recovering && !done) return null;

  return done ? (
    <Confirmation onDismiss={() => setDone(false)} />
  ) : (
    <ChoosePassword onDone={() => setDone(true)} />
  );
}

function Confirmation({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.doneWrap}>
        <View style={styles.doneMark}>
          <Icon name="check" size={22} color={colors.textOnWine} />
        </View>
        <Text style={styles.title}>Password changed</Text>
        <Text style={[styles.blurb, styles.blurbCentred]}>
          You are signed in on this phone. The old password no longer works anywhere.
        </Text>
        <Button label="Continue" onPress={onDismiss} block style={styles.submit} />
      </View>
    </View>
  );
}

function ChoosePassword({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const completePasswordReset = useAuth((s) => s.completePasswordReset);
  const cancelRecovery = useAuth((s) => s.cancelRecovery);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const longEnough = password.length >= 6;
  const typedConfirm = confirm.length > 0;
  const matches = password === confirm;
  const canSubmit = longEnough && typedConfirm && matches && !busy;

  const submit = useCallback(async () => {
    haptic.tap();
    if (await completePasswordReset(password)) onDone();
  }, [completePasswordReset, password, onDone]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.wordmark}>Sipply</Text>
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.blurb}>
          You opened a reset link, so you are already signed in. Pick a password and it is done.
        </Text>

        <View style={styles.form}>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secure
            autoComplete="password-new"
            textContentType="newPassword"
            hintIsError={password.length > 0 && !longEnough}
            hint={
              password.length > 0 && !longEnough
                ? 'Passwords must be at least 6 characters.'
                : undefined
            }
          />
          <Field
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            secure
            /* Not password-new: offering to generate a second password for
               this field is how a mismatched pair gets saved to the keychain. */
            autoComplete="off"
            textContentType="newPassword"
            hintIsError={typedConfirm && !matches}
            hint={typedConfirm && !matches ? 'These do not match.' : undefined}
          />

          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Icon name="close" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            label={busy ? 'Just a moment…' : 'Set password'}
            onPress={() => void submit()}
            disabled={!canSubmit}
            block
            style={styles.submit}
          />

          <PressableScale
            onPress={() => void cancelRecovery()}
            noHaptic
            accessibilityRole="button"
            accessibilityHint="Signs you back out without changing your password"
            style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel and sign out</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /*
   * An opaque ground, not a scrim. This covers the running app — the tab
   * bar and whatever screen was behind it — and a translucent layer would
   * leave the app legible and tappable-looking underneath.
   */
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 20,
  },
  scroll: { paddingHorizontal: space.xl, flexGrow: 1 },

  wordmark: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.display.fontSize,
    lineHeight: typeScale.display.lineHeight,
    color: colors.wine,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    marginTop: space.lg,
  },
  blurb: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginTop: space.sm,
    marginBottom: space.xxl,
    maxWidth: 320,
  },
  blurbCentred: { textAlign: 'center' },

  form: { gap: space.lg },
  submit: { marginTop: space.sm },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.dangerWash,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.danger,
  },

  cancel: { alignSelf: 'center', paddingVertical: space.md, paddingHorizontal: space.lg },
  cancelText: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  doneMark: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
});
