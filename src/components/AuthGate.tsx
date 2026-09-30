import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
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
import { create } from 'zustand';

import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { Button, Field, PressableScale, useAnnounce } from '@/components/ui';
import { WelcomeConnect } from '@/components/WelcomeConnect';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { normalizePhone } from '@/lib/contacts';
import type { ProfileRow } from '@/lib/database.types';
import { normalizeHandle } from '@/lib/instagram';
import { containsObjectionable, isObjectionableError, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import { hasSeenWelcome, markWelcomeSeen } from '@/lib/onboarding';
import {
  APPLE_SIGN_IN_ENABLED,
  DISPLAY_NAME_MAX,
  FACEBOOK_SIGN_IN_ENABLED,
  isPlaceholderUsername,
  PLACEHOLDER_USERNAME_RULE,
  suggestedDisplayName,
  USERNAME_MAX,
  USERNAME_PATTERN,
  USERNAME_RULE,
  USERNAME_TAKEN,
  useAuth,
  usernameObjectionable,
} from '@/store/auth';

/* ==================================================================== */
/* Messages                                                             */
/* ==================================================================== */

/**
 * The error or notice box every auth surface shows near its button.
 * Exported for PasswordResetOverlay: one auth surface, drawn one way, and
 * announced one way — useAnnounce speaks it on iOS, where the live region
 * that serves Android does nothing.
 */
export function AuthMessage({ tone, children }: { tone: 'error' | 'notice'; children: string }) {
  useAnnounce(children);
  const error = tone === 'error';
  return (
    <View style={error ? styles.errorBox : styles.noticeBox} accessibilityLiveRegion="polite">
      <Icon name={error ? 'close' : 'check'} size={16} color={error ? colors.danger : colors.success} />
      <Text style={error ? styles.errorText : styles.noticeText}>{children}</Text>
    </View>
  );
}

/* ==================================================================== */
/* Name and username rules                                              */
/* ==================================================================== */

/**
 * The profile rules as the two forms that set a username state them: the
 * sign-up form, and the step an Apple or Facebook account takes instead.
 * One function, so the two cannot drift.
 *
 * Checked here, not left to the server. At signup the server can only
 * refuse with an opaque 500 (see humanizeSignUp in store/auth), so a name
 * it would reject has to be caught before it is sent, next to the field
 * that is wrong. Too short is not wrong yet, just unfinished: the rule is
 * on screen and the button waits. Characters the rule can never accept
 * are flagged at once.
 */
function checkIdentity(displayName: string, username: string) {
  const handle = username.trim().toLowerCase();
  const handleObjectionable = usernameObjectionable(handle);
  const handleBadChars = /[^a-z0-9._]/.test(handle);
  const handlePlaceholder = isPlaceholderUsername(handle);
  const handleOk = USERNAME_PATTERN.test(handle) && !handleObjectionable && !handlePlaceholder;
  const handleError = handleObjectionable
    ? OBJECTIONABLE_MESSAGE
    : handlePlaceholder
      ? PLACEHOLDER_USERNAME_RULE
      : handleBadChars
        ? USERNAME_RULE
        : null;

  const name = displayName.trim();
  const nameObjectionable = containsObjectionable(name);
  const nameOk = name.length >= 1 && name.length <= DISPLAY_NAME_MAX && !nameObjectionable;
  const nameError = nameObjectionable ? OBJECTIONABLE_MESSAGE : null;

  return { handle, handleOk, handleError, name, nameOk, nameError };
}

/* ==================================================================== */
/* Welcome step                                                         */
/* ==================================================================== */

/*
 * Whether each account has been through the welcome step, shared by every
 * AuthGate.
 *
 * Home and Profile each mount their own gate, and this used to be local
 * state in each. A new user who opened Profile while Welcome was up on Home
 * got it a second time there, and Continue on one tab left the other still
 * showing it. One answer, read once per account, dismissed everywhere at
 * once.
 *
 * Keyed by account id, so a "seen" from one account never applies to the
 * next one to sign in on the same phone. `undefined` for an id means not
 * yet known. hasSeenWelcome never rejects: an unreadable store answers
 * true (lib/onboarding says why).
 */
const useWelcome = create<{
  seen: Record<string, boolean>;
  load: (userId: string) => void;
  dismiss: (userId: string) => void;
}>()((set, get) => ({
  seen: {},
  load: (userId) => {
    if (get().seen[userId] !== undefined) return;
    void hasSeenWelcome(userId).then((seen) =>
      set((s) => ({ seen: { ...s.seen, [userId]: s.seen[userId] ?? seen } })),
    );
  },
  /*
   * Dismissed in memory FIRST, then persisted. The write can fail on a full
   * disk and the user still expects the step to close; the cost of a lost
   * write is being offered it once more next launch, which lib/onboarding.ts
   * is explicit about accepting.
   */
  dismiss: (userId) => {
    set((s) => ({ seen: { ...s.seen, [userId]: true } }));
    void markWelcomeSeen(userId);
  },
}));

/** An account that was made, or can sign in, through Apple or Facebook. */
function signsInSocially(user: User): boolean {
  if (user.identities?.some((i) => i.provider === 'apple' || i.provider === 'facebook')) return true;
  const providers: unknown = user.app_metadata?.providers;
  return Array.isArray(providers) && providers.some((p) => p === 'apple' || p === 'facebook');
}

/* ==================================================================== */
/* AuthGate                                                             */
/* ==================================================================== */

/**
 * Renders `children` once signed in, otherwise the sign-in form.
 *
 * Only the social surfaces are gated — the Dex and your collection stay
 * local and work signed out, because your collection is yours.
 *
 * Between the two, in order: an account made by Apple or Facebook chooses
 * its username (it has a placeholder until then), and a new account is
 * offered the welcome step. The username comes first because Welcome is
 * where friends start finding you, by the handle you are about to choose.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const profile = useAuth((s) => s.profile);
  const profileError = useAuth((s) => s.profileError);
  const userId = session?.user.id;

  const welcomeSeen = useWelcome((s) => (userId ? s.seen[userId] : undefined));
  const loadWelcome = useWelcome((s) => s.load);
  const dismissWelcome = useWelcome((s) => s.dismiss);

  useEffect(() => {
    if (userId) loadWelcome(userId);
  }, [userId, loadWelcome]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.wine} />
      </View>
    );
  }

  if (!session || !userId) return <AuthForm />;

  /*
   * Whenever the handle is still the placeholder, whatever else is true:
   * the step can be left half-done by quitting the app, and the next launch
   * has to bring it back rather than let the account in as pour_1a2b3c4d.
   */
  const ownProfile = profile?.id === userId ? profile : null;
  if (ownProfile && isPlaceholderUsername(ownProfile.username)) {
    return <ChooseUsername key={userId} profile={ownProfile} />;
  }

  /*
   * Unknown for a frame or two while AsyncStorage answers. A plain page,
   * not a spinner: a wine spinner that shows for 16ms reads as a flicker
   * rather than as waiting.
   */
  if (welcomeSeen === undefined) return <View style={styles.loading} />;

  if (!welcomeSeen) {
    /*
     * A new Apple or Facebook account is about to be asked for a username,
     * and whether it must be is in its profile row. Waiting on the row
     * here, rather than showing Welcome and swapping it for the username
     * step a moment later, keeps one step from flashing past before the
     * other. A row that fails to load lets the account through: the
     * profile screen says so with a retry, and the step appears once the
     * row arrives.
     */
    if (!ownProfile && !profileError && signsInSocially(session.user)) {
      return <View style={styles.loading} />;
    }
    return <WelcomeConnect onDone={() => dismissWelcome(userId)} />;
  }

  return <>{children}</>;
}

/*
 * The published documents. Extensionless on purpose — GitHub Pages serves
 * `terms.html` for `/terms`, and these are the exact strings recorded in
 * `docs/appstore.md` as the App Store Connect URLs, so the app and the
 * listing point at one thing rather than two spellings of it.
 */
const TERMS_URL = 'https://janmcq1617.github.io/drinkdex/terms';
const PRIVACY_URL = 'https://janmcq1617.github.io/drinkdex/privacy';

/**
 * The age and terms statement, said where an account becomes real: under
 * Create account, and under Continue on the username step, which every
 * account made by Apple or Facebook passes through. terms.md opens "By
 * creating an account you agree to these terms", and its first
 * eligibility rule is being 18 or older and of legal drinking age where
 * you live. On the sign-in and reset paths no account is being created,
 * so the sentence would be untrue there.
 *
 * A sentence rather than a checkbox: the terms are agreed to the same way,
 * and a required tick in front of every signup is a step, where this is a
 * statement the button then acts on.
 *
 * Nested <Text onPress> rather than two Pressables: this has to read and
 * wrap as one sentence, and a Pressable in the middle of a paragraph
 * breaks the line around itself.
 */
function Consent({ lead }: { lead: string }) {
  return (
    <Text style={styles.consent}>
      {lead} you confirm you are 18 or older and of legal drinking age where you live, and agree
      to the{' '}
      <Text
        style={styles.consentLink}
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>
        Terms of Use
      </Text>{' '}
      and the{' '}
      <Text
        style={styles.consentLink}
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

/* ==================================================================== */
/* Apple and Facebook                                                   */
/* ==================================================================== */

/*
 * isAvailableAsync, asked once per launch. The answer cannot change while
 * the app runs, and each gated tab mounts its own form.
 */
let appleAvailable: boolean | null = null;

/**
 * Whether to show Sign in with Apple: the .env flag, and the device saying
 * it can. Hidden until the device has answered, so the form never shows a
 * button that then disappears.
 */
function useAppleSignIn(): boolean {
  const [available, setAvailable] = useState(appleAvailable ?? false);

  useEffect(() => {
    if (!APPLE_SIGN_IN_ENABLED || appleAvailable !== null) return;
    let live = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        appleAvailable = ok;
        if (live) setAvailable(ok);
      })
      .catch(() => {
        appleAvailable = false;
      });
    return () => {
      live = false;
    };
  }, []);

  return APPLE_SIGN_IN_ENABLED && available;
}

/*
 * Button's md height, which the brand buttons match exactly so the three
 * kinds of button on this screen share one size. The pill's radius is half
 * of it: Apple's button takes a number, not Button's `radius.pill`.
 */
const BRAND_BUTTON_HEIGHT = 52;

/**
 * Continue with Facebook, as Meta's brand rules draw it: their mark and
 * their words in white on their blue. Not Button: Button's skins are the
 * app's own colours, and this control stands for Facebook's account.
 * Same height and pill as Button, and no shadow, like every button here.
 */
function FacebookButton({ onPress, inert }: { onPress: () => void; inert: boolean }) {
  return (
    <PressableScale
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel="Continue with Facebook"
      accessibilityState={{ disabled: inert }}
      style={styles.facebook}>
      <Icon name="facebook" filled size={19} color={colors.onFacebook} />
      <Text style={styles.facebookLabel}>Continue with Facebook</Text>
    </PressableScale>
  );
}

/**
 * Apple first, Facebook second, the same width, above a quiet divider and
 * the email form. Facebook only ever appears beside Apple (App Review
 * guideline 4.8), so this renders nothing unless Apple does.
 *
 * One signal while either is finishing: the divider's words become
 * "Signing you in…". Apple's is the system's own button and cannot carry
 * a spinner, and a spinner in Facebook's alone would make the two behave
 * differently for the same wait. Both stay at full strength and stop
 * taking presses.
 */
function SocialSignIn({
  working,
  inert,
  error,
  onApple,
  onFacebook,
}: {
  working: boolean;
  inert: boolean;
  error: string | null;
  onApple: () => void;
  onFacebook: () => void;
}) {
  const apple = useAppleSignIn();
  if (!apple) return null;

  return (
    <View style={styles.social}>
      <View pointerEvents={inert ? 'none' : 'auto'} accessibilityState={{ busy: working }}>
        <AppleAuthentication.AppleAuthenticationButton
          /* "Continue with Apple": true on both forms, since the first use
             makes the account, and it pairs with Facebook's wording. */
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={BRAND_BUTTON_HEIGHT / 2}
          style={styles.apple}
          onPress={onApple}
        />
      </View>
      {FACEBOOK_SIGN_IN_ENABLED ? <FacebookButton onPress={onFacebook} inert={inert} /> : null}

      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <View style={styles.divider}>
        <View style={styles.rule} />
        {working ? (
          <>
            <ActivityIndicator size="small" color={colors.wine} />
            <Text style={styles.dividerText}>Signing you in…</Text>
          </>
        ) : (
          <Text style={styles.dividerText}>or use email</Text>
        )}
        <View style={styles.rule} />
      </View>
    </View>
  );
}

/* ==================================================================== */
/* Sign-in form                                                         */
/* ==================================================================== */

function AuthForm() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, requestPasswordReset, busy, error, notice, clearError } = useAuth();
  const signInWithApple = useAuth((s) => s.signInWithApple);
  const signInWithFacebook = useAuth((s) => s.signInWithFacebook);

  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');

  /** Which provider's sign-in is out, and what the last one said went wrong. */
  const [socialBusy, setSocialBusy] = useState<'apple' | 'facebook' | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  /*
   * Messages are cleared when the user switches mode, and only then.
   *
   * This used to be an effect on `mode`, which also ran on mount. Two
   * things went wrong with that. The effect fired for EVERY mode change,
   * including the one that follows a signup needing email confirmation, so
   * "check your email, then come back and sign in" vanished the moment the
   * user came back to sign in. And each gated tab mounts its own form, so
   * opening a second tab wiped a message the first was showing, including
   * a dead reset link's explanation that arrived before any form mounted.
   */
  const switchMode = (next: 'in' | 'up' | 'forgot') => {
    clearError();
    setSocialError(null);
    setMode(next);
  };

  const signup = mode === 'up';
  /* The reset request needs an email and nothing else — no password field,
     none of the signup extras, and a different button and tagline. */
  const forgot = mode === 'forgot';

  const identity = checkIdentity(displayName, username);

  /*
   * Optional, but not ignorable: a typo is blocked rather than accepted and
   * quietly dropped, because a handle that never matches anyone looks
   * identical to a feature that does not work.
   */
  const instagramTyped = instagram.trim().length > 0;
  const instagramOk = !instagramTyped || normalizeHandle(instagram) !== null;

  const phoneTyped = phone.trim().length > 0;
  const phoneOk = !phoneTyped || normalizePhone(phone) !== null;
  /*
   * A number is not a mistake until the user stops typing it. Every number
   * is too short for its first six digits, so flagging on each keystroke put
   * "does not look like a phone number" under the field from the first
   * digit — and, once errors were spoken, read it aloud there too. Flagged
   * from the first time the field is left; the button waits either way.
   */
  const [phoneLeft, setPhoneLeft] = useState(false);
  const phoneFlagged = phoneTyped && !phoneOk && phoneLeft;

  const canSubmit =
    socialBusy === null &&
    email.includes('@') &&
    (forgot || password.length >= 6) &&
    (!signup || (identity.handleOk && identity.nameOk && instagramOk && phoneOk));

  /*
   * No haptic here: Button's press-in already ticks, and a second tap()
   * made every submit two light impacts.
   *
   * Guarded, because the keyboard's return key reaches this too, and it
   * does not know the button is disabled.
   */
  const submit = () => {
    if (!canSubmit || busy) return;
    setSocialError(null);
    if (forgot) {
      void requestPasswordReset(email);
    } else if (signup) {
      void signUp(email, password, username, displayName, instagram, phone).then(() => {
        /*
         * Needs email confirmation: move to sign-in, where the user is about
         * to go anyway, with the email and password still filled in and the
         * notice kept on screen. setMode directly, not switchMode, so the
         * instructions survive the move.
         */
        const after = useAuth.getState();
        if (!after.session && after.notice) setMode('in');
      });
    } else {
      void signIn(email, password);
    }
  };

  /*
   * One provider at a time, and neither while the email form's request is
   * out. On success the gate swaps this form away, so only a failure or a
   * cancel comes back to it.
   */
  const continueWith = async (provider: 'apple' | 'facebook') => {
    if (socialBusy || busy) return;
    setSocialBusy(provider);
    setSocialError(null);
    try {
      setSocialError(await (provider === 'apple' ? signInWithApple() : signInWithFacebook()));
    } finally {
      setSocialBusy(null);
    }
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

        {/* Not on the reset form: that is about an email password only. */}
        {forgot ? null : (
          <SocialSignIn
            working={socialBusy !== null}
            inert={socialBusy !== null || busy}
            error={socialError}
            onApple={() => void continueWith('apple')}
            onFacebook={() => void continueWith('facebook')}
          />
        )}

        <View style={styles.form}>
          {signup ? (
            <>
              <Field
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                autoComplete="name"
                textContentType="name"
                /* Names are typed with capitals; 'none' left them as
                   'jan mcqueeny' on every post. */
                autoCapitalize="words"
                maxLength={DISPLAY_NAME_MAX}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => usernameRef.current?.focus()}
                error={identity.nameError}
              />
              <Field
                ref={usernameRef}
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="yourname"
                /*
                 * Not the login. Sign-in is by email, so the email field is
                 * tagged as the keychain username below, and this one as a
                 * nickname: tagged "username", iOS would save the password
                 * under the handle and offer the handle back in the Email
                 * field at sign-in.
                 */
                autoComplete="off"
                textContentType="nickname"
                maxLength={USERNAME_MAX}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => emailRef.current?.focus()}
                hint={USERNAME_RULE}
                error={identity.handleError}
              />
            </>
          ) : null}

          <Field
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            /* The account's login name, so it is what iOS pairs with the
               password in the keychain. See the username field above. */
            textContentType="username"
            inputMode="email"
            returnKeyType={forgot ? 'send' : 'next'}
            submitBehavior={forgot ? 'blurAndSubmit' : 'submit'}
            onSubmitEditing={forgot ? submit : () => passwordRef.current?.focus()}
          />
          {forgot ? null : (
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secure
              autoComplete={signup ? 'password-new' : 'password'}
              textContentType={signup ? 'newPassword' : 'password'}
              /*
               * The rule is a hint that stays, not a placeholder that goes at
               * the first keystroke and leaves a dimmed button with no reason.
               * On sign-in there is no rule to meet.
               */
              hint={signup ? 'At least 6 characters.' : undefined}
              returnKeyType={signup ? 'next' : 'go'}
              submitBehavior={signup ? 'submit' : 'blurAndSubmit'}
              onSubmitEditing={signup ? () => phoneRef.current?.focus() : submit}
            />
          )}

          {/*
            Sign-in only. On the signup form there is no password to have
            forgotten yet, and offering a reset there reads as an error
            message about the account being created.

            The slop reaches 16pt down into the free space above the button
            but only 4pt up: the link sits 4pt under the password field, and
            a taller top slop would take taps meant for the field's reveal
            toggle and switch the form to "forgot".
          */}
          {mode === 'in' ? (
            <PressableScale
              onPress={() => switchMode('forgot')}
              noHaptic
              hitSlop={{ top: 4, bottom: 16, left: 12, right: 12 }}
              accessibilityRole="button"
              style={styles.forgot}>
              <Text style={styles.forgotText}>Forgot your password?</Text>
            </PressableScale>
          ) : null}

          {signup ? (
            <Field
              ref={phoneRef}
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="(787) 555-0134"
              /* The phone pad has no return key, so the chain ends here and
                 Instagram is a tap away. */
              inputMode="tel"
              autoComplete="tel"
              textContentType="telephoneNumber"
              onBlur={() => setPhoneLeft(true)}
              hint="Lets friends who already have your number find you here. Stored scrambled, never shown to anyone."
              error={phoneFlagged ? 'That does not look like a phone number.' : null}
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
              returnKeyType="go"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={submit}
              hint="Lets friends who import their Instagram list find you. Stored scrambled, never shown on your profile."
              error={
                instagramTyped && !instagramOk
                  ? 'That does not look like an Instagram username.'
                  : null
              }
            />
          ) : null}

          {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
          {notice ? <AuthMessage tone="notice">{notice}</AuthMessage> : null}

          {/*
            `loading`, not `disabled`, while a request is out. The two used to
            share the 42% fade, so a tap that had landed looked like one that
            had not; loading keeps the button at full strength with a spinner.
          */}
          <Button
            label={
              busy
                ? forgot
                  ? 'Sending link…'
                  : signup
                    ? 'Creating account…'
                    : 'Signing in…'
                : forgot
                  ? 'Send reset link'
                  : signup
                    ? 'Create account'
                    : 'Sign in'
            }
            onPress={submit}
            disabled={!canSubmit}
            loading={busy}
            block
            style={styles.submit}
          />

          {signup ? <Consent lead="By creating an account" /> : null}

          <PressableScale
            onPress={() => switchMode(mode === 'in' ? 'up' : 'in')}
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

/* ==================================================================== */
/* Username step                                                        */
/* ==================================================================== */

/** A refusal from the server, and the value it refused. */
type Refusal = { field: 'name' | 'username' | 'form'; message: string; value: string };

/**
 * The one step an account made by Apple or Facebook takes before the app:
 * a username of its own in place of pour_ and 8 hex digits, and a display
 * name, prefilled from Apple's or Facebook's (suggestedDisplayName).
 *
 * The same rules as the sign-up form (checkIdentity), then the same
 * answers from the server: a word the content filter refuses, under the
 * field it names, and a username someone already has. Saved through
 * updateProfile, whose refreshed row takes the gate on to Welcome.
 *
 * It is also where these accounts meet the age and terms statement, which
 * the email form puts under Create account: this Continue is the moment
 * the account is taken up.
 */
function ChooseUsername({ profile }: { profile: ProfileRow }) {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.session?.user);
  const busy = useAuth((s) => s.busy);
  const updateProfile = useAuth((s) => s.updateProfile);
  const signOut = useAuth((s) => s.signOut);

  const [displayName, setDisplayName] = useState(() => suggestedDisplayName(profile, user));
  const [username, setUsername] = useState('');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /* Signing out takes a request; this keeps Continue from saying
     "Saving…" while the person is leaving without saving. */
  const [leaving, setLeaving] = useState(false);

  const usernameRef = useRef<TextInput>(null);

  const identity = checkIdentity(displayName, username);

  /*
   * A refusal belongs to the value it refused, so editing that field puts
   * it away — derived here rather than cleared by an effect.
   */
  const nameRefused =
    refusal?.field === 'name' && refusal.value === identity.name ? refusal.message : null;
  const handleRefused =
    refusal?.field === 'username' && refusal.value === identity.handle ? refusal.message : null;
  const formError = refusal?.field === 'form' ? refusal.message : null;

  /*
   * The name is optional HERE, unlike at email signup. This step is reached
   * after Sign in with Apple or Continue with Facebook, and Apple sends a name
   * only on the very first authorisation — a reinstall, a repeat sign-in or a
   * person who cleared the field arrives with none. App Review rejects asking
   * someone to type a name again after Sign in with Apple, so an empty name
   * falls back to the username rather than blocking the step.
   */
  const nameOk = identity.name.length === 0 || identity.nameOk;
  const nameToSave = identity.name.length > 0 ? identity.name : identity.handle;

  const canSubmit = identity.handleOk && nameOk && !nameRefused && !handleRefused && !leaving;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setRefusal(null);
    const result = await updateProfile({
      displayName: nameToSave,
      username: identity.handle,
      bio: profile.bio ?? '',
      accent: profile.accent,
    });
    if (!result) return;

    if (isObjectionableError({ message: result })) {
      if (result.includes('display_name')) {
        setRefusal({ field: 'name', message: OBJECTIONABLE_MESSAGE, value: identity.name });
      } else if (result.includes('username')) {
        setRefusal({ field: 'username', message: OBJECTIONABLE_MESSAGE, value: identity.handle });
      } else {
        setRefusal({ field: 'form', message: OBJECTIONABLE_MESSAGE, value: '' });
      }
    } else if (result === USERNAME_TAKEN) {
      setRefusal({ field: 'username', message: result, value: identity.handle });
    } else {
      setRefusal({ field: 'form', message: result, value: '' });
    }
  };

  const leave = () => {
    if (leaving || busy) return;
    setLeaving(true);
    void signOut();
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
            // The tab bar floats over this too; see AuthForm.
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md,
          },
        ]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle} accessibilityRole="header">
          Choose your username
        </Text>
        <Text style={styles.stepLede}>
          It is how friends find you and how your pours are signed. You can change it later in Edit
          profile.
        </Text>

        <View style={styles.form}>
          <Field
            label="Display name"
            hint="Optional. Leave it empty and your username is shown instead."
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            maxLength={DISPLAY_NAME_MAX}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => usernameRef.current?.focus()}
            error={identity.nameError ?? nameRefused}
          />
          <Field
            ref={usernameRef}
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="yourname"
            autoComplete="off"
            textContentType="nickname"
            maxLength={USERNAME_MAX}
            returnKeyType="go"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void submit()}
            hint={USERNAME_RULE}
            error={identity.handleError ?? handleRefused}
          />

          {formError ? <AuthMessage tone="error">{formError}</AuthMessage> : null}

          <Button
            label={busy && !leaving ? 'Saving…' : 'Continue'}
            onPress={() => void submit()}
            disabled={!canSubmit}
            loading={busy && !leaving}
            block
            style={styles.submit}
          />

          <Consent lead="By continuing" />

          {/*
            A way back for the person who meant another account: Apple's
            "Hide my email" makes a new, empty one even when an email account
            already exists.
          */}
          <PressableScale
            onPress={leave}
            disabled={leaving}
            noHaptic
            accessibilityRole="button"
            accessibilityState={{ disabled: leaving, busy: leaving }}
            style={styles.switch}>
            <Text style={styles.switchText}>
              {leaving ? 'Signing out…' : 'Not your account? Sign out'}
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

  /* Apple, Facebook, and the divider into the email form. */
  social: { gap: space.md, marginBottom: space.xl },
  /* Width and height are required: the native button draws nothing without both. */
  apple: { width: '100%', height: BRAND_BUTTON_HEIGHT },
  facebook: {
    height: BRAND_BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.facebook,
  },
  /* Button's label, in Facebook's white: 4.82:1 on its blue (check-contrast). */
  facebookLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.onFacebook,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
    minHeight: 20,
  },
  /* A hairline, decoration only; the words carry the meaning. */
  rule: { flex: 1, height: 1, backgroundColor: colors.cardBorder },
  dividerText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  /* The username step's heading: the form's own, left-aligned like it. */
  stepTitle: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
  },
  stepLede: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginTop: space.sm,
    marginBottom: space.xxl,
    maxWidth: 320,
  },

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
    lineHeight: typeScale.caption.lineHeight,
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
    lineHeight: typeScale.caption.lineHeight,
    color: colors.success,
  },

  submit: { marginTop: space.sm },

  /*
   * Pulled up tight under the password field and given negative top margin
   * to sit inside the form's `gap: space.lg` rather than adding a third
   * gap's worth of air below the field it belongs to. Right-aligned, where
   * every other iOS sign-in form puts it. The touch target is made up by
   * hitSlop where the link is rendered.
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

  consent: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.lg,
    /* Keeps the sentence off the screen edges when it wraps to three lines
       on a small handset. */
    paddingHorizontal: space.sm,
  },
  /* Same wine as the mode switch below it, which is already the established
     "this is tappable" colour on this screen. */
  consentLink: { fontFamily: fonts.bodySemiBold, color: colors.wine },

  switch: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  switchText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
  },
});
