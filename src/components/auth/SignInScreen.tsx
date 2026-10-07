import { useNavigation, useRoute } from 'expo-router';
import { type ReactNode, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, type Text, type TextInput, View } from 'react-native';

import { AuthHold } from '@/components/auth/AuthHold';
import { AuthTitleBar, useInputFocusOnShow, useStepTitleFocus } from '@/components/auth/AuthTitleBar';
import { CabinetSheet, FEATURED } from '@/components/auth/CabinetBackdrop';
import { CountryPicker } from '@/components/auth/CountryPicker';
import { AuthStoreMessages, EmailStep, PasswordStep, ResetStep } from '@/components/auth/EmailSteps';
import { PhoneCodeStep } from '@/components/auth/PhoneCodeStep';
import { useRemembered } from '@/components/auth/rememberedAccount';
import { TastePicker } from '@/components/auth/TastePicker';
import { WaysIn } from '@/components/auth/WaysIn';
import { WelcomeBack } from '@/components/auth/WelcomeBack';
import { Grain } from '@/components/Grain';
import { Button, Field, FieldGroup, SelectField } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
import { latestDexIds, TASTES_TO_START } from '@/lib/tastes';
import { PHONE_INVALID, useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
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
/* wrap themselves in a gate), so the floating tab bar stays, and with  */
/* it the Dex, which works signed out. A native modal would rise above  */
/* the cold-start intro.                                                */
/*                                                                      */
/* THE FIRST STEP DEPENDS ON THE GATE AND THE PHONE (v3.2, Jan's        */
/* "Pick your tastes" with the judges' grafts from "First pour"):       */
/*   - a phone that has signed in before: Welcome back, on every gate   */
/*     (auth/WelcomeBack), until "Use another way";                     */
/*   - Home, with an empty Dex: "What do you drink?" (auth/TastePicker),*/
/*     with "Sign in" top right to every way in from its first frame;   */
/*   - anywhere else (Profile, a gated pushed route, a Dex already      */
/*     begun): straight to the card of ways in, so nobody who taps      */
/*     Profile gets a quiz.                                             */
/* After the picker's Continue the card sits under the person's own     */
/* picks, "Your Dex has begun", titled "Join Sipply".                   */
/*                                                                      */
/* OVER THE CABINET. Every step but the picker is a paper sheet on the  */
/* cabinet's lining (CabinetSheet, auth/CabinetBackdrop): the first     */
/* step's backdrop shows three mounted drinks above it, the others just */
/* the wordmark. The sheet's title bar sticks while the form scrolls.   */
/*                                                                      */
/* ONE FLOW, SHARED BY EVERY GATE. The step, the picks and everything   */
/* typed live in the sign-in flow store (store/signInFlow), so Home and */
/* Profile show the same step with the same digits. This file is the    */
/* step router and the phone step; the others are TastePicker,          */
/* WelcomeBack, WaysIn, PhoneCodeStep and EmailSteps. Every sign-in     */
/* path underneath (the code, the email password and reset, Apple,      */
/* Google, Facebook) is as it was; phone moved off the first step onto  */
/* its own, behind "Phone number".                                      */
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
const JOIN_LEAD = 'Already on Sipply? The same buttons sign you in.';

function titleOf(step: SignInStep, emailStatus: EmailStatus | null, joining: boolean): string {
  switch (step) {
    case 'tastes':
    case 'entry':
      return joining ? 'Join Sipply' : 'Sign in or join Sipply';
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
 * Whether another tab is in front of this gate's own (Home's), read from
 * the tab navigator's state rather than the URL. The URL only names the
 * route on top: a drink page pushed from the Dex tab would read as "not on
 * another tab" and mount the picker's photo grid again behind it, mid-push.
 * The tab navigator still knows the Dex is in front there, and that Home is
 * under a sheet such as Log, where the picker stays in view behind it.
 * Not useIsFocused, which is false in both cases. False off Home.
 */
function useOtherTabInFront(home: boolean): boolean {
  const navigation = useNavigation();
  const { key } = useRoute();
  const subscribe = useCallback(
    (onChange: () => void) => navigation.addListener('state', onChange),
    [navigation],
  );
  const read = () => {
    if (!home) return false;
    const tabs = navigation.getState();
    return tabs?.type === 'tab' && tabs.routes[tabs.index]?.key !== key;
  };
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The signed-out screen. `onClose` is the close control on a first step:
 * the Dex from a tab, back out of a pushed or modal route. `home` is the
 * Home tab's gate, the one place the taste picker is offered.
 */
export default function SignInScreen({ onClose, home }: { onClose: () => void; home: boolean }) {
  const step = useSignInFlow((s) => s.step);
  const emailStatus = useSignInFlow((s) => s.emailStatus);
  const picks = useSignInFlow((s) => s.picks);
  const joined = useSignInFlow((s) => s.joined);
  const anotherWay = useSignInFlow((s) => s.anotherWay);
  const back = useSignInFlow((s) => s.back);
  const backToTastes = useSignInFlow((s) => s.backToTastes);
  const returnToRemembered = useSignInFlow((s) => s.returnToRemembered);

  // A message from the auth store (a dead reset link) needs the card to sit under, not the picker.
  const authMessage = useAuth((s) => s.error ?? s.notice);
  const remembered = useRemembered((s) => s.account);
  const primed = useRemembered((s) => s.primed);
  const dexReady = useCollection((s) => s.hydrated);
  const unlocks = useCollection((s) => s.unlocks);
  const awayOnTab = useOtherTabInFront(home);

  const first = step === 'tastes' || step === 'entry';
  const welcome = first && !anotherWay ? remembered : null;
  /*
   * The picker is a question for someone new: Home only, and only while the
   * Dex is empty, or while picks are held. Someone mid-pick who logs a drink
   * from the Dex keeps the picker, so the picks they made stay in view and
   * can still be taken back out.
   */
  const picker = home && (Object.keys(unlocks).length === 0 || picks.length > 0);
  const tastes = !welcome && step === 'tastes' && picker && !authMessage;
  // Every other gate draws the picker's step as the card of ways in.
  const sheetStep: Exclude<SignInStep, 'tastes'> = step === 'tastes' ? 'entry' : step;
  const joining = joined && picks.length >= TASTES_TO_START;
  const view = welcome ? 'welcome' : tastes ? 'tastes' : sheetStep;

  const titleRef = useRef<Text>(null);
  // A different variant is a different step to the person, with its own title.
  const stepKey = `${view}:${emailStatus ?? ''}:${joining ? 'join' : ''}`;
  useStepTitleFocus(titleRef, stepKey);

  // A frame or two at launch while the remembered account and the Dex are read.
  if (!primed || (home && !dexReady)) return <AuthHold slowMessage="Still loading." />;

  // The person's own drinks behind the first step: their picks, else their latest, else the cabinet's three.
  const latest = latestDexIds(unlocks, 3);
  const own = latest.length > 0 ? latest : FEATURED;

  if (welcome) {
    return <WelcomeBack account={welcome} drinks={own} onClose={onClose} titleRef={titleRef} />;
  }

  if (tastes) {
    /*
     * Unmounted while another tab is in front, so its photo grid never sits
     * in memory behind that tab's (the tab-switch lag). The picks are the
     * flow's, so nothing is lost; the lining stands in meanwhile.
     */
    if (awayOnTab) {
      return (
        <View style={styles.ground}>
          <Grain tone="lining" />
        </View>
      );
    }
    return <TastePicker />;
  }

  const entry = sheetStep === 'entry';
  /*
   * The first step's way back: to Welcome back after "Use another way", to
   * the picks on Home, otherwise out (the Dex, or back down the stack).
   */
  const leading: { kind: 'close' | 'back'; onPress: () => void } = !entry
    ? { kind: 'back', onPress: back }
    : remembered && anotherWay
      ? { kind: 'back', onPress: returnToRemembered }
      : picker
        ? { kind: 'back', onPress: backToTastes }
        : { kind: 'close', onPress: onClose };

  let body: ReactNode;
  switch (sheetStep) {
    case 'entry':
      body = <WaysIn lead={joining ? JOIN_LEAD : undefined} />;
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
      backdropDrinks={joining ? picks : own}
      begun={entry && joining ? picks.length : undefined}
      bar={
        <AuthTitleBar
          title={titleOf(step, emailStatus, joining)}
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
  ground: { flex: 1, backgroundColor: colors.lining },
  body: { paddingHorizontal: layout.gutter, paddingTop: space.xl },
  primary: { marginTop: space.xl },
});
