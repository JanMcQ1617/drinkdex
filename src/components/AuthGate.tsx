import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { create } from 'zustand';

import { AuthTitleBar } from '@/components/auth/AuthTitleBar';
import { CabinetSheet } from '@/components/auth/CabinetBackdrop';
import { AuthMessage, Consent } from '@/components/auth/Consent';
import SignInScreen from '@/components/auth/SignInScreen';
import { Grain } from '@/components/Grain';
import { Button, Field, Hold } from '@/components/ui';
import { WelcomeConnect } from '@/components/WelcomeConnect';
import { colors, fonts, layout, space, type as typeScale } from '@/constants/theme';
import type { ProfileRow } from '@/lib/database.types';
import { containsObjectionable, isObjectionableError, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import { hasSeenWelcome, markWelcomeSeen } from '@/lib/onboarding';
import {
  DISPLAY_NAME_MAX,
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

/*
 * The message box every auth surface shows near its button. It lives in
 * auth/Consent now, a leaf the sign-in steps can import without coming
 * back through this file; exported here still, for PasswordResetOverlay.
 */
export { AuthMessage };

/* ==================================================================== */
/* Name and username rules                                              */
/* ==================================================================== */

/**
 * The profile rules as the username step states them. Every new account
 * meets them there, whichever way it was made: no way of signing up sends
 * a username any more (store/auth, "New accounts").
 *
 * Checked here as well as by the server, so the answer is next to the
 * field that is wrong, as it is typed. Too short is not wrong yet, just
 * unfinished: the rule is on screen and the button waits. Characters the
 * rule can never accept are flagged at once.
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
  /**
   * Accounts whose wait for their own profile row is over for this
   * session: it failed, or ROW_WAIT_MS ran out. Sticky on purpose: a
   * token refresh clears profileError, and without this the gate fell
   * back from Welcome to a blank page each time.
   */
  rowWaitOver: Record<string, true>;
  load: (userId: string) => void;
  dismiss: (userId: string) => void;
  endRowWait: (userId: string) => void;
}>()((set, get) => ({
  seen: {},
  rowWaitOver: {},
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
  endRowWait: (userId) => {
    if (get().rowWaitOver[userId]) return;
    set((s) => ({ rowWaitOver: { ...s.rowWaitOver, [userId]: true } }));
  },
}));

/**
 * How long a new account waits for its profile row before Welcome shows
 * anyway. Bounded by this, not by refreshProfile's retries: each retry
 * awaits a request with no timeout of its own, which can last until iOS's
 * 60s limit, and a token refresh starts them over.
 */
const ROW_WAIT_MS = 4000;

/* ==================================================================== */
/* AuthGate                                                             */
/* ==================================================================== */

/**
 * Renders `children` once signed in, otherwise the sign-in screen.
 *
 * Only the social surfaces are gated — the Dex and your collection stay
 * local and work signed out, because your collection is yours.
 *
 * Between the two, in order: a new account chooses its username (it has
 * a placeholder until then), and is offered the welcome step. The username
 * comes first because Welcome is where friends start finding you, by the
 * handle you are about to choose.
 *
 * `onClose` is where the sign-in screen's close control goes. A tab's gate
 * leaves it out and closes to the Dex, which works signed out. A pushed or
 * modal route passes its own way back, so closing never strands a modal
 * behind a tab.
 *
 * Every state that is still deciding shows a Hold, never a plain page: a
 * featureless cream page is indistinguishable from a screen that failed to
 * load, which is how "switching tabs shows a blank screen" was reported.
 *
 * The sign-in, username and Welcome steps are one frame, the paper sheet
 * over the cabinet (auth/CabinetBackdrop), so a new person walks through
 * them without the ground changing under them.
 */
export function AuthGate({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const router = useRouter();
  const close = onClose ?? (() => router.navigate('/dex'));

  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const profile = useAuth((s) => s.profile);
  const profileError = useAuth((s) => s.profileError);
  const userId = session?.user.id;

  const welcomeSeen = useWelcome((s) => (userId ? s.seen[userId] : undefined));
  const rowWaitOver = useWelcome((s) => (userId ? s.rowWaitOver[userId] === true : false));
  const loadWelcome = useWelcome((s) => s.load);
  const dismissWelcome = useWelcome((s) => s.dismiss);
  const endRowWait = useWelcome((s) => s.endRowWait);

  const ownProfile = profile && profile.id === userId ? profile : null;
  /*
   * Every new account (phone, email, Apple, Google, Facebook) gets a placeholder
   * handle from handle_new_user and is about to be asked for a username, and
   * whether it must be is in its profile row. Waiting on the row keeps Welcome
   * from flashing past before the username step, but only for ROW_WAIT_MS
   * (specs/06 cause 5): after that, or once the row has failed, the account goes
   * on to Welcome and the username step takes over whenever the row lands.
   */
  const waitingForRow =
    session != null && welcomeSeen === false && !ownProfile && !profileError && !rowWaitOver;

  useEffect(() => {
    if (userId) loadWelcome(userId);
  }, [userId, loadWelcome]);

  useEffect(() => {
    if (!userId || welcomeSeen !== false || rowWaitOver) return;
    if (profileError) {
      endRowWait(userId);
      return;
    }
    if (!waitingForRow) return;
    const t = setTimeout(() => endRowWait(userId), ROW_WAIT_MS);
    return () => clearTimeout(t);
  }, [userId, welcomeSeen, rowWaitOver, profileError, waitingForRow, endRowWait]);

  /*
   * auth-js finishing its startup, which refreshes an expired token and can
   * take up to a minute offline. The message says where to go meanwhile.
   */
  if (!ready) {
    return <GateHold slowMessage="Still connecting. The Dex and Stats work without a connection." />;
  }
  if (!session || !userId) return <SignInScreen onClose={close} />;
  /*
   * Whenever the handle is still the placeholder, whatever else is true:
   * the step can be left half-done by quitting the app, and the next launch
   * has to bring it back rather than let the account in as pour_1a2b3c4d.
   */
  if (ownProfile && isPlaceholderUsername(ownProfile.username)) {
    return <ChooseUsername key={userId} profile={ownProfile} />;
  }
  // A frame or two while AsyncStorage answers, or the bounded wait above.
  if (welcomeSeen === undefined || waitingForRow) {
    return <GateHold slowMessage="Still loading your account." />;
  }
  if (!welcomeSeen) return <WelcomeConnect onDone={() => dismissWelcome(userId)} />;
  return <>{children}</>;
}

/**
 * The gate's Hold, on paper with its own grain: grain is no longer one
 * overlay over the app, so each ground mounts its own, under the content.
 */
function GateHold({ slowMessage }: { slowMessage: string }) {
  return (
    <View style={styles.screen}>
      <Grain />
      <Hold slowMessage={slowMessage} fill={false} />
    </View>
  );
}

/* ==================================================================== */
/* Username step                                                        */
/* ==================================================================== */

/** A refusal from the server, and the value it refused. */
type Refusal = { field: 'name' | 'username' | 'form'; message: string; value: string };

/**
 * The one step any new account takes before the app (phone, email, Apple,
 * Google or Facebook): a username of its own in place of pour_ and 8 hex
 * digits, and a display name, prefilled from Apple's, Google's or
 * Facebook's when one came (suggestedDisplayName).
 *
 * The rules of checkIdentity, then the server's answers: a word the
 * content filter refuses, under the field it names, and a username someone
 * already has. Saved through updateProfile, whose refreshed row takes the
 * gate on to Welcome.
 *
 * It is also where every account meets the age and terms statement a
 * second time, under Continue: this is the moment the account is taken up.
 *
 * Drawn on the sign-in sheet's frame with the compact backdrop, as the
 * steps before it were.
 */
function ChooseUsername({ profile }: { profile: ProfileRow }) {
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
   * The name is optional, for everyone. Apple sends a name only on the very
   * first authorisation — a reinstall, a repeat sign-in or a person who
   * cleared the field arrives with none — and App Review rejects asking
   * someone to type a name again after Sign in with Apple, so an empty name
   * falls back to the username rather than blocking the step. A phone
   * number or an email brings no name at all, and the same rule serves them.
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
    <CabinetSheet
      backdrop="compact"
      // No leading control: there is no step before this one to go back to.
      bar={<AuthTitleBar title="Choose a username" leading="none" insetTop={false} />}
      contentStyle={styles.body}>
      <Text style={styles.lede}>
        It is how friends find you and how your posts are signed. You can change it later in Edit
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
          /* Names are typed with capitals; 'none' left them as
             'jan mcqueeny' on every post. */
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
          /*
           * Not the login. Sign-in is by email or phone, so this is tagged
           * as a nickname: tagged "username", iOS would save the account's
           * password under the handle and offer the handle back in the
           * Email field at sign-in.
           */
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

        {/* The form's gap spaces it; its own top margin is for the sign-in screen's foot. */}
        <Consent lead="By continuing" style={styles.consent} />

        {/*
          A way back for the person who meant another account: Apple's
          "Hide my email" makes a new, empty one even when an email account
          already exists, and a phone number makes its own account apart
          from an email one. While the sign-out runs, the spinner covers
          the words and the spoken name says what is happening.
        */}
        <Button
          label={leaving ? 'Signing out…' : 'Not your account? Sign out'}
          variant="text"
          size="sm"
          onPress={leave}
          loading={leaving}
          style={styles.signOut}
        />
      </View>
    </CabinetSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.gutter, paddingTop: space.xxl },

  lede: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginBottom: space.xl,
    maxWidth: 320,
  },

  form: { gap: space.lg },
  submit: { marginTop: space.sm },
  consent: { marginTop: 0 },
  signOut: { alignSelf: 'center' },
});
