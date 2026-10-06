import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthMessage } from '@/components/AuthGate';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { Button, Field, haptic } from '@/components/ui';
import { colors, fonts, layout, space, textRole, type as typeScale } from '@/constants/theme';
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
/* the intro, above the whole navigator. The router itself is kept off   */
/* the reset link by app/+native-intent.                                */
/*                                                                      */
/* It is deliberately not dismissible by gesture. Backing out is an      */
/* explicit "Cancel", which signs back out — leaving someone silently    */
/* signed in off a mailed link, with a password they do not know, is the */
/* one outcome worth designing against. That holds for VoiceOver too:    */
/* both steps are accessibilityViewIsModal, so the app underneath is not */
/* in the swipe order, and focus starts on the step's title.             */
/*                                                                      */
/* It brings its own paper grain: grain is no longer one overlay over    */
/* the app, and this sits above all of it. And its own dark status bar,  */
/* a plain one: it is outside every route screen, where FocusedStatusBar */
/* has no navigator to ask, and the screen under it may be a lining one  */
/* (Home) whose light glyphs would vanish on this paper. Status bars     */
/* merge in mount order, so this wins over a screen already mounted; a   */
/* lining screen that mounts after it (AuthGate swapping the sign-in     */
/* sheet for the app as the link signs in) still wins until the          */
/* confirmation, which mounts its own.                                   */
/* ==================================================================== */

/**
 * Hands VoiceOver focus to `ref` once the step has laid out. Without it
 * focus stayed wherever it was in the app underneath, which is now hidden.
 * A short delay rather than the first frame: the overlay mounts in the same
 * commit that changed the screen, and focus sent before layout is dropped.
 */
function useInitialFocus(ref: RefObject<Text | null>) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
    }, 300);
    return () => clearTimeout(timer);
  }, [ref]);
}

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
   *
   * The body is guarded. `handle` runs synchronously inside a native
   * Linking listener, where anything thrown is a fatal error in a release
   * build, and it sees every URL any web page or message can open.
   */
  useEffect(() => {
    let active = true;

    const handle = (url: string | null) => {
      if (!url || !active) return;
      try {
        const link = parseRecoveryUrl(url);
        if (!link) return;

        if (link.kind === 'error') failRecovery(link.message);
        else void beginRecovery(link.accessToken, link.refreshToken);
      } catch {
        /* Not a link this app can use; ignoring it is the whole answer. */
      }
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
  const titleRef = useRef<Text>(null);
  useInitialFocus(titleRef);

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      accessibilityViewIsModal>
      <Grain />
      <StatusBar style="dark" />
      <View style={styles.doneWrap}>
        {/* The check drawn bare, in wine: a glyph does not need a disc to be seen. */}
        <Icon name="check" size={40} color={colors.wine} />
        <Text ref={titleRef} style={styles.title} accessibilityRole="header">
          Password changed
        </Text>
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
  /*
   * Cancel keeps this step on screen until the sign-out has gone through
   * (see cancelRecovery). The store's `busy` covers that wait too, so this
   * is what tells the two apart: without it the button would say "Setting
   * password…" while the user was leaving without setting one.
   */
  const [leaving, setLeaving] = useState(false);

  const titleRef = useRef<Text>(null);
  const confirmRef = useRef<TextInput>(null);
  useInitialFocus(titleRef);

  const longEnough = password.length >= 6;
  const typedConfirm = confirm.length > 0;
  const matches = password === confirm;
  const canSubmit = longEnough && typedConfirm && matches && !leaving;

  /*
   * A press does not tick; the new password being saved does, as every
   * completed save in the app does. Guarded because the keyboard's return
   * key reaches this too.
   */
  const submit = async () => {
    if (!canSubmit || busy) return;
    if (await completePasswordReset(password)) {
      haptic.success();
      onDone();
    }
  };

  const cancel = () => {
    if (leaving || busy) return;
    setLeaving(true);
    void cancelRecovery();
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      accessibilityViewIsModal>
      <Grain />
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled">
        <Text maxFontSizeMultiplier={1.2} style={styles.wordmark}>
          Sipply
        </Text>
        <Text ref={titleRef} style={styles.title} accessibilityRole="header">
          Choose a new password
        </Text>
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
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={
              password.length > 0 && !longEnough ? 'Passwords must be at least 6 characters.' : null
            }
          />
          <Field
            ref={confirmRef}
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            secure
            /* Not password-new: offering to generate a second password for
               this field is how a mismatched pair gets saved to the keychain. */
            autoComplete="off"
            textContentType="newPassword"
            returnKeyType="go"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void submit()}
            error={typedConfirm && !matches ? 'These do not match.' : null}
          />

          {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

          <Button
            label={busy && !leaving ? 'Setting password…' : 'Set password'}
            onPress={() => void submit()}
            disabled={!canSubmit}
            loading={busy && !leaving}
            block
            style={styles.submit}
          />

          {/*
            The way back out, so it is the muted text button, under the
            one action this step is for. While the sign-out runs it keeps
            its size and shows a spinner, and its spoken name says what is
            happening. The visible label stays put for that: Button hides
            it under the spinner but keeps its width, so a shorter label
            would only make the button jump narrower.
          */}
          <Button
            label="Cancel and sign out"
            accessibilityLabel={leaving ? 'Signing out' : undefined}
            variant="text"
            muted
            size="sm"
            loading={leaving}
            onPress={cancel}
            accessibilityHint="Signs you back out without changing your password"
            style={styles.cancel}
          />
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
  scroll: { paddingHorizontal: layout.gutter, flexGrow: 1 },

  /*
   * The wordmark is the brand's voice, so it keeps the display face,
   * through wordmarkLg: Playfair is set only by a name role (check-design
   * rule 6), and this is the same large wordmark the sign-in backdrop uses.
   */
  wordmark: { ...textRole.wordmarkLg, color: colors.wine },
  /* A step's title is chrome: Inter, at the size every state title uses. */
  title: {
    ...textRole.emptyTitle,
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

  cancel: { alignSelf: 'center' },

  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.gutter,
  },
});
