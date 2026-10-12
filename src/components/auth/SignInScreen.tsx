import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, type Text, type TextInput, View } from 'react-native';

import { AuthHold } from '@/components/auth/AuthHold';
import { AuthTitleBar, useInputFocusOnShow, useStepTitleFocus } from '@/components/auth/AuthTitleBar';
import { CabinetSheet } from '@/components/auth/CabinetBackdrop';
import { CountryPicker } from '@/components/auth/CountryPicker';
import { AuthStoreMessages, EmailStep, PasswordStep, ResetStep } from '@/components/auth/EmailSteps';
import { PhoneCodeStep } from '@/components/auth/PhoneCodeStep';
import { useRemembered } from '@/components/auth/rememberedAccount';
import { WaysIn } from '@/components/auth/WaysIn';
import { WelcomeBack } from '@/components/auth/WelcomeBack';
import { Button, Field, FieldGroup, SelectField } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
import { PHONE_INVALID } from '@/store/auth';
import {
  countryOf,
  type EmailStatus,
  enteredPhone,
  type SignInStep,
  useSignInFlow,
} from '@/store/signInFlow';
import { useTaste } from '@/store/taste';

/* ==================================================================== */
/* Sign in or join                                                      */
/*                                                                      */
/* INLINE, NOT A MODAL ROUTE. AuthGate draws this in place inside the   */
/* gated scene (Home, Profile, someone's profile, and the routes that   */
/* wrap themselves in a gate), so the tab bar stays, and with           */
/* it the Dex, which works signed out. A native modal would rise above  */
/* the cold-start intro.                                                */
/*                                                                      */
/* NO QUESTIONS HERE (v4.1). A signed-out phone that has not finished  */
/* the first run meets the questions and its picks before any of this,  */
/* in the overlay over the whole app (components/FirstRun). Its sign-in */
/* step draws WaysIn on the same flow store, so choosing email or phone */
/* there lands on Home's gate at that step.                             */
/*                                                                      */
/* THE FIRST STEP DEPENDS ON THE PHONE AND THE GATE:                    */
/*   - a phone that has signed in before: Welcome back, on every gate   */
/*     (auth/WelcomeBack), until "Use another way";                     */
/*   - Home, while the phone holds picks or drinks saved to try (after  */
/*     the first run's "Not now"): the card of ways in under "Your      */
/*     picks", titled "Keep your picks" (specs/v4.1-changes.md 1.6);    */
/*   - anywhere else: the card of ways in.                              */
/*                                                                      */
/* ONE WHITE PAGE. Every step stands on the sign-in page (CabinetSheet, */
/* auth/CabinetBackdrop): the step's bar at the top, the large wordmark */
/* over the first step (or the person's picks), and the form. Nothing   */
/* lies behind it.                                                      */
/*                                                                      */
/* ONE FLOW, SHARED BY EVERY GATE. The step and everything typed live   */
/* in the sign-in flow store (store/signInFlow), so Home and Profile    */
/* show the same step with the same digits. This file is the step       */
/* router and the phone step; the others are WelcomeBack, WaysIn,       */
/* PhoneCodeStep and EmailSteps. Every sign-in path underneath (the     */
/* code, the email password and reset, Apple, Google, Facebook) is as   */
/* it was; phone is its own step, behind "Phone number".                */
/*                                                                      */
/* STEPS SWAP INSTANTLY. No fade between them: a layout animation can   */
/* stall for seconds after a cold start in a Release build, and an exit */
/* that never finishes leaves a ghost form on screen. iOS's own sign-in */
/* sheets cut between steps too. VoiceOver focus moves to the new title */
/* on each change, so a cut is never silent.                            */
/* ==================================================================== */

/** The phone field's promise, and its accessibility hint. */
const PHONE_HINT = 'We’ll text a 6-digit code to confirm it’s you. Message and data rates may apply.';
/** After the country picker's sheet has started to close, so the keyboard does not fight it. */
const PICKER_FOCUS_DELAY_MS = 300;

function titleOf(step: SignInStep, emailStatus: EmailStatus | null, keepPicks: boolean): string {
  switch (step) {
    case 'entry':
      return keepPicks ? 'Keep your picks' : 'Sign in or join Sipply';
    case 'phone':
      return 'Continue with phone number';
    case 'code':
      return 'Confirm your number';
    case 'email':
      return 'Continue with email';
    case 'reset':
      return 'Reset your password';
    case 'password':
      switch (emailStatus) {
        case 'new':
          return 'Create your account';
        case 'other':
          return 'Sign in another way';
        case 'unknown':
          return 'Enter your password';
        default:
          return 'Welcome back';
      }
  }
}

/**
 * The phone step: country over number, one group. Continue sends the code.
 * The person chose "Phone number" to get here, so the number field takes
 * the cursor as the step appears.
 *
 * A number is not a mistake until the person stops typing it: every number
 * is too short for its first few digits. So it is flagged from the first
 * time the field is left (and only while something is in it), and the
 * button waits either way. Left-ness is this mount's own, so coming back
 * from the code step starts clean.
 */
function PhoneEntry() {
  const iso = useSignInFlow((s) => s.iso);
  const national = useSignInFlow((s) => s.national);
  const error = useSignInFlow((s) => s.error);
  const pending = useSignInFlow((s) => s.pending);
  const setCountry = useSignInFlow((s) => s.setCountry);
  const setNational = useSignInFlow((s) => s.setNational);
  const submitPhone = useSignInFlow((s) => s.submitPhone);

  const [picking, setPicking] = useState(false);
  const [left, setLeft] = useState(false);
  const phoneRef = useRef<TextInput>(null);
  useInputFocusOnShow(phoneRef);

  const country = countryOf(iso);
  const e164 = enteredPhone({ iso, national });
  const flagged = left && national.trim().length > 0 && e164 === null;
  const shown = error ?? (flagged ? PHONE_INVALID : null);
  const sending = pending === 'phone';

  const choose = (next: string) => {
    setCountry(next);
    setPicking(false);
    setTimeout(() => phoneRef.current?.focus(), PICKER_FOCUS_DELAY_MS);
  };

  return (
    <View>
      <FieldGroup error={shown} hint={PHONE_HINT}>
        <SelectField
          label="Country or region"
          value={`${country.name} (+${country.dial})`}
          // "(+1)" reads as "open paren plus one"; say the dial code as words.
          accessibilityLabel={`Country or region, ${country.name}, plus ${country.dial}`}
          // Inert, at full strength, while a request is out: nothing to change mid-send.
          onPress={() => {
            if (!pending) setPicking(true);
          }}
          accessibilityHint="Opens the list"
        />
        <Field
          ref={phoneRef}
          label="Phone number"
          value={national}
          onChangeText={setNational}
          inputMode="tel"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={20}
          onBlur={() => setLeft(true)}
          invalid={!!shown}
        />
      </FieldGroup>
      <Button
        label={sending ? 'Sending code…' : 'Continue'}
        onPress={() => void submitPhone()}
        disabled={e164 === null}
        loading={sending}
        block
        style={styles.primary}
      />
      <AuthStoreMessages />
      <CountryPicker
        visible={picking}
        selected={country.iso}
        onSelect={choose}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/**
 * The signed-out screen. `onClose` is the close control on a first step:
 * the Dex from a tab, back out of a pushed or modal route. `home` is the
 * Home tab's gate, the one place the person's picks head the first step.
 */
export default function SignInScreen({ onClose, home }: { onClose: () => void; home: boolean }) {
  const step = useSignInFlow((s) => s.step);
  const emailStatus = useSignInFlow((s) => s.emailStatus);
  const anotherWay = useSignInFlow((s) => s.anotherWay);
  const back = useSignInFlow((s) => s.back);
  const returnToRemembered = useSignInFlow((s) => s.returnToRemembered);

  const remembered = useRemembered((s) => s.account);
  const primed = useRemembered((s) => s.primed);
  const tasteReady = useTaste((s) => s.hydrated);
  const picks = useTaste((s) => s.picks);
  const saved = useTaste((s) => s.saved);
  /*
   * Whether the first-run overlay is up over this gate: components/FirstRun's
   * test, less the two (auth ready, signed out) that are why this screen is
   * drawn at all. Meanwhile the gate keeps its step but draws a bare page,
   * so its title never takes VoiceOver focus from the overlay: the overlay's
   * accessibilityViewIsModal scopes where VoiceOver goes, not the focus this
   * screen sends.
   */
  const underFirstRun = useTaste((s) => s.hydrated && !s.done && !s.signInFirst);

  const entry = step === 'entry';
  const welcome = entry && !anotherWay ? remembered : null;
  /*
   * Home's first step, re-headed for someone who answered the questions
   * and chose "Not now": what they picked or saved is on this phone only,
   * and this card is where it gets an account to go to. Never over Welcome
   * back, which is the way in for a phone that already has one.
   */
  const keepPicks = home && entry && !welcome && (picks.length > 0 || saved.length > 0);
  const view = welcome ? 'welcome' : step;

  const titleRef = useRef<Text>(null);
  /*
   * A different variant is a different step to the person, with its own
   * title, and so is the overlay leaving: focus lands on this title then.
   */
  const variant = `${keepPicks ? 'picks' : ''}:${underFirstRun ? 'under' : ''}`;
  const stepKey = `${view}:${emailStatus ?? ''}:${variant}`;
  useStepTitleFocus(titleRef, stepKey);

  // A frame or two at launch while the remembered account (and, on Home, the picks) are read.
  if (!primed || (home && !tasteReady)) return <AuthHold slowMessage="Still loading." />;
  if (underFirstRun) return <View style={styles.ground} />;

  if (welcome) {
    return <WelcomeBack account={welcome} onClose={onClose} titleRef={titleRef} />;
  }

  /*
   * The first step's way back: to Welcome back after "Use another way",
   * otherwise out (the Dex, or back down the stack).
   */
  const leading: { kind: 'close' | 'back'; onPress: () => void } = !entry
    ? { kind: 'back', onPress: back }
    : remembered && anotherWay
      ? { kind: 'back', onPress: returnToRemembered }
      : { kind: 'close', onPress: onClose };

  let body: ReactNode;
  switch (step) {
    case 'entry':
      body = <WaysIn />;
      break;
    case 'phone':
      body = <PhoneEntry />;
      break;
    case 'code':
      body = <PhoneCodeStep />;
      break;
    case 'email':
      body = <EmailStep focusOnShow />;
      break;
    case 'password':
      body = <PasswordStep />;
      break;
    case 'reset':
      body = <ResetStep />;
      break;
  }

  return (
    <CabinetSheet
      backdrop={entry ? 'full' : 'compact'}
      picks={keepPicks ? { saved, picks } : undefined}
      bar={
        <AuthTitleBar
          title={titleOf(step, emailStatus, keepPicks)}
          leading={leading.kind}
          onLeading={leading.onPress}
          titleRef={titleRef}
          insetTop={false}
        />
      }
      contentStyle={styles.body}>
      {/* Keyed on the step: each one mounts fresh, with nothing carried over but the store. */}
      <View key={stepKey}>{body}</View>
    </CabinetSheet>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.gutter, paddingTop: space.xl },
  primary: { marginTop: space.xl },
});
