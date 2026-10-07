/*
 * Revoking Sign in with Apple when an account is deleted.
 *
 * App Review guideline 5.1.1(v): an app that offers Sign in with Apple
 * must revoke the person's Apple tokens when they delete their account.
 * Supabase keeps no Apple token, so the person confirms with Apple once
 * more, which gives the app a fresh authorization code, and the
 * apple-revoke Edge Function (supabase/functions/apple-revoke) trades it
 * for a token and revokes that with Apple. The key that signs those calls
 * lives only in the function's secrets.
 *
 * store/auth's deleteAccount calls revokeAppleAccess before it removes
 * anything, and deletes only on `ok: true`.
 */

import { isAuthRetryableFetchError, type User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/*
 * Bodies of Settings' "Delete account" alert, which is where deleteAccount's
 * error is read, so none repeats the title. Each says the account is still
 * there: a failed delete must never read as a finished one.
 */
const OFFLINE = 'Sipply could not connect, so your account is still here. Check your connection and try again.';
const CANCELLED =
  'Your account is still here. An account that uses Sign in with Apple is deleted only once you confirm with Apple, so that Sipply comes off your Apple Account too.';
// Most often an iPhone with no Apple Account signed in, so it says where to look.
const APPLE_FAILED =
  'Apple could not confirm, so your account is still here. Check that this iPhone is signed in to your Apple Account in Settings, then try again.';
const CODE_REFUSED = 'Apple did not accept the confirmation, so your account is still here. Try again.';
const OTHER_APPLE_ACCOUNT =
  'This iPhone is signed in to a different Apple Account from the one your Sipply account uses, so your account is still here. Delete it on an iPhone signed in to that Apple Account, or ask us to delete it through Help and support.';
const SIGNED_OUT = 'Your session has expired, so your account is still here. Sign out, sign back in and try again.';
const UPSTREAM = 'Sipply could not reach Apple just now, so your account is still here. Try again in a minute.';

/** A sheet plus two calls to Apple behind the function: generous, but never a spinner forever. */
const REVOKE_TIMEOUT_MS = 20_000;

export type AppleRevokeResult = { ok: true } | { ok: false; message: string };

const stop = (message: string): AppleRevokeResult => ({ ok: false, message });

/**
 * Whether this account signs in with Apple. Read the way hasFacebookIdentity
 * (lib/facebook) reads Facebook: `identities`, which not every GoTrue
 * response fills in, or app_metadata.providers.
 */
export function hasAppleIdentity(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.identities?.some((identity) => identity.provider === 'apple')) return true;
  const providers: unknown = user.app_metadata?.providers;
  return Array.isArray(providers) && providers.includes('apple');
}

/** The HTTP status of a FunctionsHttpError, whose context is the Response. */
function statusOf(error: unknown): number | null {
  const ctx = (error as { context?: unknown } | null)?.context;
  const status = (ctx as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : null;
}

/*
 * The one place deletion goes ahead WITHOUT revoking: the function is not
 * deployed (404) or its Apple key is missing or refused (503). Deliberate,
 * so a TestFlight build is never stuck unable to delete an account while
 * the key is being set up. It is logged here, and the function logs every
 * 503 with console.error, so check its logs once it is deployed. Nothing
 * about the person is in the message.
 */
function proceedUnrevoked(why: string): AppleRevokeResult {
  console.warn(`appleRevoke: ${why}; deleting without revoking Apple tokens`);
  return { ok: true };
}

/**
 * Revokes Sipply's Sign in with Apple access for the signed-in account, or
 * says why deletion has to stop. `ok: true` when the tokens are revoked,
 * when the account has no Apple ID, and in the cases proceedUnrevoked lets
 * through. Never throws.
 *
 * `sessionUser` is the store's copy, used only when the fresh read fails
 * for a reason other than the connection.
 */
export async function revokeAppleAccess(sessionUser: User): Promise<AppleRevokeResult> {
  try {
    /*
     * The account as the server has it now: an Apple ID linked on another
     * phone may not be in this session's copy yet. Offline stops here,
     * before Apple's sheet goes up for a deletion that could not finish.
     */
    let user = sessionUser;
    const fresh = await supabase.auth.getUser();
    if (fresh.error) {
      if (isAuthRetryableFetchError(fresh.error) && !fresh.error.status) return stop(OFFLINE);
    } else if (fresh.data.user) {
      user = fresh.data.user;
    }
    if (!hasAppleIdentity(user)) return { ok: true };

    /*
     * Apple's sheet exists only on iOS 13 and later. Sipply ships for
     * iPhone, so this is a development build on another platform, and
     * deletion is not held hostage to a sheet that cannot appear.
     */
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      return proceedUnrevoked('Sign in with Apple is not available on this device');
    }

    /*
     * No scopes: the sheet only asks the person to confirm, and the code it
     * returns is all the function needs. The name and email are not asked
     * for again.
     */
    let code: string | null;
    try {
      const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
      code = credential.authorizationCode;
    } catch (e) {
      // Closing the sheet is a decision, so deletion stops and says why.
      if ((e as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED') return stop(CANCELLED);
      return stop(APPLE_FAILED);
    }
    if (!code) return stop(APPLE_FAILED);

    const { data, error } = await supabase.functions.invoke('apple-revoke', {
      body: { authorizationCode: code },
      timeout: REVOKE_TIMEOUT_MS,
    });
    if (error) {
      // By class name, as lib/music does: a second functions-js copy would break instanceof.
      const name = (error as { name?: unknown }).name;
      if (name === 'FunctionsFetchError') return stop(OFFLINE);
      switch (statusOf(error)) {
        case 404:
          return proceedUnrevoked('the apple-revoke function is not deployed');
        case 503:
          return proceedUnrevoked('apple-revoke is not configured');
        case 401:
          return stop(SIGNED_OUT);
        case 409:
          return stop(OTHER_APPLE_ACCOUNT);
        case 422:
          return stop(CODE_REFUSED);
        default:
          return stop(UPSTREAM);
      }
    }
    const result = (data as { result?: unknown } | null)?.result;
    if (result === 'revoked' || result === 'no_apple_identity') return { ok: true };
    return stop(UPSTREAM);
  } catch {
    return stop(UPSTREAM);
  }
}
