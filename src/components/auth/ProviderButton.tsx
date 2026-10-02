import * as AppleAuthentication from 'expo-apple-authentication';
import { SymbolView } from 'expo-symbols';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthMessage } from '@/components/auth/Consent';
import { GoogleMark, Icon } from '@/components/icons';
import { Button } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useSignInFlow, type Method } from '@/store/signInFlow';
import {
  APPLE_SIGN_IN_ENABLED,
  FACEBOOK_SIGN_IN_ENABLED,
  GOOGLE_SIGN_IN_ENABLED,
  PHONE_SIGN_IN_ENABLED,
  useAuth,
} from '@/store/auth';

/* ==================================================================== */
/* The ways in, one row each                                            */
/*                                                                      */
/* Every alternate method is the same outlined row: email, Apple,       */
/* Google, Facebook, in that order, each a white rectangle with a 1pt   */
/* espresso edge, the provider's own mark pinned 16pt from the left and */
/* the label centred (Button's block secondary anatomy). One component, */
/* so the stack lines up its marks in one column and its labels on one  */
/* axis, and no provider's row looks foreign beside the others.         */
/*                                                                      */
/* THE MARKS ARE THE PROVIDERS' OWN, and nothing else on this screen is */
/* borrowed. Apple's, Google's and Meta's sign-in guidelines require    */
/* their mark on a button that signs in with them: Apple's is the       */
/* system's SF Symbol (drawn by iOS, not redrawn here), Google's is its */
/* published "G" (GoogleMark), Meta's is the Facebook mark the app      */
/* already draws. The words are the providers' sanctioned phrasings.    */
/*                                                                      */
/* WHICH ROWS SHOW (useMethods). Google and Facebook only ever appear   */
/* beside Apple: App Review guideline 4.8 requires Sign in with Apple   */
/* wherever another third-party sign-in is offered. Phone and email are */
/* first-party and not subject to it. Email gets a row only when the    */
/* phone number is the top field; with phone off, email IS the top      */
/* field, so it is not offered twice.                                   */
/* ==================================================================== */

/*
 * Whether this device can Sign in with Apple, asked ONCE, when this module
 * loads. The gated tabs import AuthGate at app start, and AuthGate imports
 * the sign-in screen, which imports this, so the answer is in before the
 * first signed-out render and the Apple, Google and Facebook rows never pop
 * in after the screen has laid out. The answer cannot change while the app
 * runs. Until it arrives (or if it fails) Apple counts as unavailable, so a
 * row is never shown and then taken away; on the off chance it lands after
 * a render, the subscribers below redraw the rows once.
 */
let appleAvailable = false;
const appleListeners = new Set<() => void>();

async function primeApple() {
  try {
    appleAvailable = await AppleAuthentication.isAvailableAsync();
  } catch {
    appleAvailable = false;
  }
  appleListeners.forEach((listener) => listener());
}

if (APPLE_SIGN_IN_ENABLED) void primeApple();

function subscribeApple(listener: () => void) {
  appleListeners.add(listener);
  return () => {
    appleListeners.delete(listener);
  };
}

function readApple() {
  return appleAvailable;
}

export interface Methods {
  apple: boolean;
  google: boolean;
  facebook: boolean;
  phone: boolean;
  /** "Continue with email" as a row: only when the phone number holds the top field. */
  emailRow: boolean;
  /** Whether the "or" rule and the stack under it are drawn at all. */
  anyRows: boolean;
}

/** Which ways in this build and this device offer. See WHICH ROWS SHOW above. */
export function useMethods(): Methods {
  const available = useSyncExternalStore(subscribeApple, readApple, readApple);
  const apple = APPLE_SIGN_IN_ENABLED && available;
  const phone = PHONE_SIGN_IN_ENABLED;
  return {
    apple,
    google: apple && GOOGLE_SIGN_IN_ENABLED,
    facebook: apple && FACEBOOK_SIGN_IN_ENABLED,
    phone,
    emailRow: phone,
    anyRows: phone || apple,
  };
}

export type ProviderMethod = 'email' | 'apple' | 'google' | 'facebook';

const LABEL: Record<ProviderMethod, string> = {
  email: 'Continue with email',
  apple: 'Continue with Apple',
  google: 'Continue with Google',
  facebook: 'Continue with Facebook',
};

/** Each provider's mark, in the 20pt slot Button pins at the left. */
function Mark({ method }: { method: ProviderMethod }) {
  switch (method) {
    case 'email':
      return <Icon name="mail" size={20} color={colors.text} />;
    case 'apple':
      return (
        <SymbolView
          name="apple.logo"
          size={20}
          tintColor={colors.text}
          type="monochrome"
          style={styles.symbol}
        />
      );
    case 'google':
      return <GoogleMark size={20} />;
    case 'facebook':
      // Meta's mark: on white, the "f" shows the button's own white through it.
      return <Icon name="facebook" filled size={20} color={colors.facebook} />;
  }
}

function noop() {}

/**
 * One "Continue with …" row.
 *
 * `busy`: this row's request is out. Its mark becomes a spinner (Button's
 * `loading`), the label stays, and the row reads as busy.
 *
 * `inert`: some other request is out. The row stops taking presses but
 * keeps FULL strength, so it is a no-op press and a disabled state for
 * VoiceOver rather than Button's `disabled`, which fades to 42% and would
 * read as "your tap didn't land" on the row that was not even tapped.
 */
export function ProviderButton({
  method,
  onPress,
  busy,
  inert,
}: {
  method: ProviderMethod;
  onPress: () => void;
  busy: boolean;
  inert: boolean;
}) {
  const still = inert && !busy;
  return (
    <Button
      label={LABEL[method]}
      variant="secondary"
      size="md"
      block
      leading={<Mark method={method} />}
      loading={busy}
      onPress={still ? noop : onPress}
      accessibilityState={still ? { disabled: true } : undefined}
    />
  );
}

/**
 * The stack under the "or" rule, and the line that says why a provider
 * did not sign the person in, directly under its last row.
 *
 * `withEmail` adds "Continue with email" on top (the first step, when the
 * phone number holds the top field); the "Sign in another way" step lists
 * the providers alone, since the email is what brought the person there.
 *
 * One request at a time across every way in and every mounted gate: the
 * flow's `pending`, plus the auth store's `busy` for an email password
 * request, which is the store's own.
 */
export function ProviderRows({ withEmail }: { withEmail: boolean }) {
  const methods = useMethods();
  const pending = useSignInFlow((s) => s.pending);
  const providerError = useSignInFlow((s) => s.providerError);
  const go = useSignInFlow((s) => s.go);
  const continueWith = useSignInFlow((s) => s.continueWith);
  const authBusy = useAuth((s) => s.busy);

  const working = pending !== null || authBusy;
  const rows: ProviderMethod[] = [
    ...(withEmail && methods.emailRow ? (['email'] as const) : []),
    ...(methods.apple ? (['apple'] as const) : []),
    ...(methods.google ? (['google'] as const) : []),
    ...(methods.facebook ? (['facebook'] as const) : []),
  ];
  if (rows.length === 0) return null;

  return (
    <View style={styles.rows}>
      {rows.map((method) => (
        <ProviderButton
          key={method}
          method={method}
          // The email row starts no request of its own: 'email' pending is the lookup.
          busy={method !== 'email' && pending === (method as Method)}
          inert={working}
          onPress={() => (method === 'email' ? go('email') : void continueWith(method))}
        />
      ))}
      {providerError ? (
        <AuthMessage tone="error" style={styles.message}>
          {providerError}
        </AuthMessage>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.md },
  // Button sizes the slot; the symbol view needs its own box to draw into.
  symbol: { width: 20, height: 20 },
  // The rows' gap already puts it space.md under the last row, where 02 asks for it.
  message: { marginTop: 0 },
});
