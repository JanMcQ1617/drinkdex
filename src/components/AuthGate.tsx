import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import { Button, PressableScale } from '@/components/ui';
import { WelcomeConnect } from '@/components/WelcomeConnect';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { normalizePhone } from '@/lib/contacts';
import { normalizeHandle } from '@/lib/instagram';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import { hasSeenWelcome, markWelcomeSeen } from '@/lib/onboarding';
import {
  DISPLAY_NAME_MAX,
  USERNAME_MAX,
  USERNAME_PATTERN,
  USERNAME_RULE,
  useAuth,
  usernameObjectionable,
} from '@/store/auth';

/* ==================================================================== */
/* Announcements                                                        */
/* ==================================================================== */

/**
 * Speaks `message` to VoiceOver when it appears or changes.
 *
 * accessibilityLiveRegion, which these forms used for every error and
 * notice, is Android-only. On iOS — the platform this app ships on — a
 * VoiceOver user pressed Sign in, heard the button change and change back,
 * and was never told the password did not match. The live region stays for
 * Android, and this is gated to iOS so Android does not hear it twice.
 *
 * `queue: true` so the button's own label change, which lands at the same
 * moment, does not cut the message off. Keyed on the string: the store
 * clears `error` at the start of every attempt, so the same failure twice
 * is announced twice.
 */
export function useAnnounce(message: string | null | undefined) {
  useEffect(() => {
    if (message && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    }
  }, [message]);
}

/**
 * The error or notice box every auth surface shows above its button.
 * Exported for PasswordResetOverlay, for the same reason Field is: one auth
 * surface, drawn one way, and announced one way.
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
/* Field                                                                */
/* ==================================================================== */

type InputProps = React.ComponentProps<typeof TextInput>;

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoComplete?: InputProps['autoComplete'];
  textContentType?: InputProps['textContentType'];
  inputMode?: InputProps['inputMode'];
  /** Defaults to 'none', which is right for everything but a person's name. */
  autoCapitalize?: InputProps['autoCapitalize'];
  maxLength?: number;
  /** Keyboard chaining: 'next' with a focus hop, or the form's own action. */
  returnKeyType?: InputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  submitBehavior?: InputProps['submitBehavior'];
  /** Called when the field loses focus, after its own focus ring drops. */
  onBlur?: () => void;
  /** A plain prop under React 19; lets the form move focus between fields. */
  ref?: React.Ref<TextInput>;
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
  autoCapitalize = 'none',
  maxLength,
  returnKeyType,
  onSubmitEditing,
  submitBehavior,
  onBlur,
  ref,
  hint,
  prefix,
  hintIsError,
}: FieldProps) {
  const [reveal, setReveal] = useState(false);
  const [focused, setFocused] = useState(false);

  // A hint that turns into an error is news; the same hint as help is not.
  useAnnounce(hintIsError ? hint : null);

  return (
    <View style={styles.field}>
      {/*
        A visible label, not a placeholder-only field. Hidden from VoiceOver
        because the input carries the same label; otherwise every field was
        announced twice, once as text and once as the field.
      */}
      <Text style={styles.fieldLabel} accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </Text>
      <View style={styles.inputWrap}>
        {/* Hidden for the same reason as the label: read on its own it is a
            stray "at sign" between the field's name and the field. */}
        {prefix ? (
          <Text style={styles.prefix} accessibilityElementsHidden importantForAccessibility="no">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !reveal}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          inputMode={inputMode}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          submitBehavior={submitBehavior}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[styles.input, focused && styles.inputFocused, prefix ? styles.inputWithPrefix : null]}
          accessibilityLabel={label}
          /* The rule or the error is read with the field, not left for a
             VoiceOver user to find as a separate element afterwards. */
          accessibilityHint={hint}
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
   * Unknown for a frame or two while AsyncStorage answers. A plain page,
   * not a spinner: a wine spinner that shows for 16ms reads as a flicker
   * rather than as waiting.
   */
  if (welcomeSeen === undefined) return <View style={styles.loading} />;

  if (!welcomeSeen) return <WelcomeConnect onDone={() => dismissWelcome(userId)} />;

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
    setMode(next);
  };

  const signup = mode === 'up';
  /* The reset request needs an email and nothing else — no password field,
     none of the signup extras, and a different button and tagline. */
  const forgot = mode === 'forgot';

  /*
   * The profile rules are checked here, not left to the server. At signup
   * the server can only refuse with an opaque 500 (see humanizeSignUp), so
   * a name it would reject has to be caught before it is sent, next to the
   * field that is wrong. Too short is not wrong yet, just unfinished: the
   * rule is on screen and the button waits. Characters the rule can never
   * accept are flagged at once.
   */
  const handle = username.trim().toLowerCase();
  const handleObjectionable = usernameObjectionable(handle);
  const handleBadChars = /[^a-z0-9._]/.test(handle);
  const handleOk = USERNAME_PATTERN.test(handle) && !handleObjectionable;

  const name = displayName.trim();
  const nameObjectionable = containsObjectionable(name);
  const nameOk = name.length >= 1 && name.length <= DISPLAY_NAME_MAX && !nameObjectionable;

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
    email.includes('@') &&
    (forgot || password.length >= 6) &&
    (!signup || (handleOk && nameOk && instagramOk && phoneOk));

  /*
   * No haptic here: Button's press-in already ticks, and a second tap()
   * made every submit two light impacts.
   *
   * Guarded, because the keyboard's return key reaches this too, and it
   * does not know the button is disabled.
   */
  const submit = () => {
    if (!canSubmit || busy) return;
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
                hintIsError={nameObjectionable}
                hint={nameObjectionable ? OBJECTIONABLE_MESSAGE : undefined}
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
                hintIsError={handleObjectionable || handleBadChars}
                hint={handleObjectionable ? OBJECTIONABLE_MESSAGE : USERNAME_RULE}
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
              hintIsError={phoneFlagged}
              hint={
                phoneFlagged
                  ? 'That does not look like a phone number.'
                  : 'Lets friends who already have your number find you here. Stored scrambled, never shown to anyone.'
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
              returnKeyType="go"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={submit}
              hintIsError={instagramTyped && !instagramOk}
              hint={
                instagramTyped && !instagramOk
                  ? 'That does not look like an Instagram username.'
                  : 'Lets friends who import their Instagram list find you. Stored scrambled, never shown on your profile.'
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

          {/*
            Signup only. terms.md opens "By creating an account you agree to
            these terms", and its first eligibility rule is being 18 or older
            and of legal drinking age where you live. Neither was put in front
            of anyone until this line existed. On the sign-in and reset paths
            no account is being created, so the sentence would be untrue there.

            A sentence rather than a checkbox: the terms are agreed to the same
            way, and a required tick in front of every signup is a step, where
            this is a statement the button then acts on.

            Nested <Text onPress> rather than two Pressables: this has to read
            and wrap as one sentence, and a Pressable in the middle of a
            paragraph breaks the line around itself.
          */}
          {signup ? (
            <Text style={styles.consent}>
              By creating an account you confirm you are 18 or older and of legal drinking age
              where you live, and agree to the{' '}
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
          ) : null}

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
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.2,
    color: colors.textMuted,
  },
  inputWrap: { justifyContent: 'center' },
  inputWithPrefix: { paddingLeft: space.lg + 16 },
  input: {
    minHeight: 50,
    backgroundColor: colors.surface,
    borderWidth: 1,
    /*
     * textFaint, a non-text use at 3.91:1 against the white fill. The
     * cardBorder hairline this had was 1.21:1, and the white fill itself is
     * 1.11:1 on the cream page, so the form's main controls were close to
     * invisible to anyone with low vision. A control's edge is not a card's
     * edge: the "tint and hairline" rule is for cards.
     */
    borderColor: colors.textFaint,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingRight: 46,
    // 16pt keeps iOS from auto-zooming the field on focus.
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
  },
  /* The field being typed into, in the affirmative colour. Same width, so
     focusing does not nudge the layout. */
  inputFocused: { borderColor: colors.wine },
  reveal: { position: 'absolute', right: space.md, padding: 6 },
  /*
   * Drawn over the field rather than inside the value: an '@' the user can
   * delete or double up on is a handle that never matches anybody.
   *
   * textMuted, not textFaint: the '@' is 16pt regular type, so it needs
   * 4.5:1 like any other small text, and it reads as part of the handle
   * being typed rather than as decoration.
   */
  prefix: {
    position: 'absolute',
    left: space.lg,
    zIndex: 1,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
  /*
   * textMuted, not textFaint. These are 13pt and carry the username rule
   * and the privacy promise for phone and Instagram; textFaint is for large
   * type and glyphs only.
   */
  fieldHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
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
