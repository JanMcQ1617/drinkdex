import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizePhone } from '@/lib/contacts';
import { normalizeHandle } from '@/lib/instagram';

/* ==================================================================== */
/* Discovery claims                                                     */
/*                                                                      */
/* Two ways to be findable — your phone number and your Instagram        */
/* handle — and both work the same way: the device hashes the value and  */
/* the server stores only the hash, in profile_secrets, which no client  */
/* can read (migration 008). That is deliberate, and it has one          */
/* consequence: the app cannot ask the server what it claimed. So the    */
/* plaintext is remembered here, or the Accounts screen would keep       */
/* asking someone who already answered.                                  */
/*                                                                      */
/* PHONE IS THE ONE THAT MATTERS. An Instagram import needs BOTH people  */
/* to have typed a handle, which almost nobody will. A phone number      */
/* needs only that the two of you are already in each other's address    */
/* books — which is the normal state of knowing someone. Collecting it   */
/* at signup is what turns contact matching from a two-sided chore into  */
/* one tap, and it is why signup asks.                                   */
/* ==================================================================== */

const PHONE_KEY = 'clink-my-phone';
const HANDLE_KEY = 'clink-ig-handle';

export async function rememberPhone(phone: string): Promise<void> {
  await AsyncStorage.setItem(PHONE_KEY, phone);
}
export async function getRememberedPhone(): Promise<string | null> {
  return AsyncStorage.getItem(PHONE_KEY);
}
export async function forgetRememberedPhone(): Promise<void> {
  await AsyncStorage.removeItem(PHONE_KEY);
}

export async function rememberHandle(handle: string): Promise<void> {
  await AsyncStorage.setItem(HANDLE_KEY, handle);
}
export async function getRememberedHandle(): Promise<string | null> {
  return AsyncStorage.getItem(HANDLE_KEY);
}
export async function forgetRememberedHandle(): Promise<void> {
  await AsyncStorage.removeItem(HANDLE_KEY);
}

/* ==================================================================== */
/* What was claimed at signup, pending a session                        */
/*                                                                      */
/* Neither hash can be written during signUp. When the project requires  */
/* email confirmation the call returns no session at all, and even when  */
/* it does return one, the profile row is still being written by the     */
/* on_auth_user_created trigger — profile_secrets references profiles,   */
/* so an insert before that lands violates the foreign key.              */
/*                                                                      */
/* So both claims are parked here and drained once the profile row is    */
/* confirmed to exist. See drainPendingClaims in src/store/auth.ts.      */
/*                                                                      */
/* NOT passed through auth user_metadata, which would be shorter:        */
/* metadata is a second copy living outside profile_secrets, and         */
/* "stop being findable" would clear the hash while leaving it behind.   */
/* An opt-out that leaves a copy is not one.                             */
/* ==================================================================== */

const PENDING_KEY = 'clink-pending-claims';

/**
 * The email is stored alongside the claims and checked before either hash
 * is written. Without it, a signup that is started but never confirmed
 * leaves claims parked on the device that would attach themselves to
 * whatever account signs in next — on a shared phone, someone else's.
 */
export interface PendingClaims {
  email: string;
  /** Normalized to its last 10 significant digits, as contacts.ts does. */
  phone?: string;
  /** Normalized: lowercased, '@' and URL wrappers stripped. */
  handle?: string;
}

export async function setPendingClaims(
  email: string,
  claims: { phone?: string; handle?: string },
): Promise<void> {
  const phone = claims.phone ? (normalizePhone(claims.phone) ?? undefined) : undefined;
  const handle = claims.handle ? (normalizeHandle(claims.handle) ?? undefined) : undefined;

  // Nothing worth parking. Clear rather than storing an empty record, so
  // a later drain does not see a claim-less entry and have to reason about it.
  if (!phone && !handle) {
    await clearPendingClaims();
    return;
  }

  await AsyncStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ email: email.trim().toLowerCase(), phone, handle } satisfies PendingClaims),
  );
}

export async function getPendingClaims(): Promise<PendingClaims | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingClaims;
    return typeof parsed?.email === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingClaims(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}
