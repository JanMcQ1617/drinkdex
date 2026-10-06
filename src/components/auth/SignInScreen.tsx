import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, type Text, type TextInput, View } from 'react-native';

import { AuthTitleBar, useStepTitleFocus } from '@/components/auth/AuthTitleBar';
import { CabinetSheet } from '@/components/auth/CabinetBackdrop';
import { Consent } from '@/components/auth/Consent';
import { CountryPicker } from '@/components/auth/CountryPicker';
import { AuthStoreMessages, EmailStep, PasswordStep, ResetStep } from '@/components/auth/EmailSteps';
import { PhoneCodeStep } from '@/components/auth/PhoneCodeStep';
import { ProviderRows, useMethods } from '@/components/auth/ProviderButton';
import { Button, Field, FieldGroup, OrDivider, SelectField } from '@/components/ui';
import { layout, space } from '@/constants/theme';
import { PHONE_INVALID } from '@/store/auth';
import {
  countryOf,
  type EmailStatus,
  enteredPhone,
  type SignInStep,
  useSignInFlow,
} from '@/store/signInFlow';

/* ==================================================================== */
/* Sign in or join                                                      */
/*                                                                      */
/* INLINE, NOT A MODAL ROUTE. AuthGate draws this in place inside the   */
/* gated scene (Home, Profile, someone's profile, and the routes that   */
/* wrap themselves in a gate), so it draws a sheet's anatomy itself: a  */
/* title bar with a close control, the form, and the ways in. A native  */
/* modal would rise above the cold-start intro, and close already has   */
/* an honest destination, the Dex, which works signed out.              */
/*                                                                      */
/* OVER THE CABINET. The sheet lies on the cabinet's lining             */
/* (CabinetSheet, auth/CabinetBackdrop): on the first step the large    */
/* wordmark and three mounted drinks show above it, on the others just  */
/* the wordmark. The sheet's own layout is unchanged; its title bar     */
/* sticks under the status bar while the form scrolls.                  */
/*                                                                      */
/* ONE FLOW, SHARED BY EVERY GATE. The step and everything typed live   */
/* in the sign-in flow store (store/signInFlow), so Home and Profile    */
/* show the same step with the same digits. This file is the step       */
/* router and the first step; the others are PhoneCodeStep and          */
/* EmailSteps.                                                          */
/*                                                                      */
/* THE FIRST STEP. With the phone number on: country and number in one  */
/* group, then "or" and a row for email, Apple, Google and Facebook.    */
/* With it off, the group is the email address, and the rows are the    */
/* providers alone (useMethods says which this build and device offer). */
/* Every new account, by any method, then chooses a username            */
/* (AuthGate's ChooseUsername).                                         */
/*                                                                      */
/* STEPS SWAP INSTANTLY. No fade between them: a layout animation can   */
/* stall for seconds after a cold start in a Release build, and an exit */
/* that never finishes leaves a ghost form on screen. iOS's own sign-in */
/* sheets cut between steps too. VoiceOver focus moves to the new title */
/* on each change, so a cut is never silent.                            */
/* ==================================================================== */

/** The phone field's promise, and its accessibility hint. */
const PHONE_HINT = 'We’ll text a 6-digit code to confirm it’s you. Message and data rates may apply.';
/** After the picker's sheet has started to close, so the keyboard does not fight it. */
const PICKER_FOCUS_DELAY_MS = 300;

function titleOf(step: SignInStep, emailStatus: EmailStatus | null): string {
  switch (step) {
    case 'entry':
      return 'Sign in or join Sipply';
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
 * The first step with the phone number on: country over number, one
 * group. Continue sends the code.
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
 * The signed-out screen. `onClose` is the close control on the first
 * step: the Dex from a tab, back out of a pushed or modal route.
 */
export default function SignInScreen({ onClose }: { onClose: () => void }) {
  const step = useSignInFlow((s) => s.step);
  const emailStatus = useSignInFlow((s) => s.emailStatus);
  const back = useSignInFlow((s) => s.back);
  const methods = useMethods();

  const titleRef = useRef<Text>(null);
  // A different password variant is a different step to the person, with its own title.
  const stepKey = `${step}:${emailStatus ?? ''}`;
  useStepTitleFocus(titleRef, stepKey);

  const entry = step === 'entry';

  let body: ReactNode;
  switch (step) {
    case 'entry':
      body = (
        <>
          {methods.phone ? <PhoneEntry /> : <EmailStep focusOnShow={false} />}
          {methods.anyRows ? (
            <>
              <OrDivider style={styles.or} />
              <ProviderRows withEmail />
            </>
          ) : null}
          <Consent lead="By continuing" />
        </>
      );
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
      bar={
        <AuthTitleBar
          title={titleOf(step, emailStatus)}
          leading={entry ? 'close' : 'back'}
          onLeading={entry ? onClose : back}
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
  body: { paddingHorizontal: layout.gutter, paddingTop: space.xxl },
  primary: { marginTop: space.xl },
  or: { marginVertical: space.xl },
});
