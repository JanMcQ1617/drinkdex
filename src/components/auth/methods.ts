import * as AppleAuthentication from 'expo-apple-authentication';
import { useSyncExternalStore } from 'react';

import {
  APPLE_SIGN_IN_ENABLED,
  FACEBOOK_SIGN_IN_ENABLED,
  GOOGLE_SIGN_IN_ENABLED,
  PHONE_SIGN_IN_ENABLED,
} from '@/store/auth';

/* ==================================================================== */
/* Which ways in this build and this device offer                       */
/*                                                                      */
/* A leaf module (it imports no screen and no flow), so the sign-in     */
/* flow store can ask it too: whether the email address is typed on the */
/* first step or on a step of its own depends on what else is offered.  */
/*                                                                      */
/* EACH FLAG HIDES ITS BUTTON. EXPO_PUBLIC_*_SIGN_IN set to 'on' shows  */
/* a way in, anything else hides it (store/auth). Google and Facebook   */
/* only ever appear beside Apple: App Review guideline 4.8 requires     */
/* Sign in with Apple wherever another third-party sign-in is offered.  */
/* Phone and email are first-party and not tied to it. Email has no     */
/* flag: with every other way off, it is the whole first step.          */
/* ==================================================================== */

/*
 * Whether this device can Sign in with Apple, asked ONCE, when this module
 * loads. The gated tabs import AuthGate at app start, and AuthGate reaches
 * this through the sign-in screen, so the answer is in before the first
 * signed-out render and the Apple, Google and Facebook rows never pop in
 * after the screen has laid out. The answer cannot change while the app
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
  /**
   * Nothing but email is offered, so the first step is the address field
   * itself rather than a card holding one "Continue with email" button.
   */
  emailOnly: boolean;
}

function methodsFor(available: boolean): Methods {
  const apple = APPLE_SIGN_IN_ENABLED && available;
  const phone = PHONE_SIGN_IN_ENABLED;
  return {
    apple,
    google: apple && GOOGLE_SIGN_IN_ENABLED,
    facebook: apple && FACEBOOK_SIGN_IN_ENABLED,
    phone,
    // Google and Facebook need Apple, so these two decide it.
    emailOnly: !apple && !phone,
  };
}

/** Which ways in this build and device offer, redrawn once if Apple's answer lands late. */
export function useMethods(): Methods {
  return methodsFor(useSyncExternalStore(subscribeApple, readApple, readApple));
}

/** The same answer outside React, for the flow store's step routing. */
export function methodsNow(): Methods {
  return methodsFor(appleAvailable);
}
