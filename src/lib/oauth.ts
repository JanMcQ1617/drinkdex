import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { urlFields } from '@/lib/recovery';
import { supabase } from '@/lib/supabase';

/* ==================================================================== */
/* OAuth in the system browser sheet                                    */
/*                                                                      */
/* The leg Continue with Google and Continue with Facebook share. It    */
/* lived in lib/facebook while Facebook was the only provider; each      */
/* provider now passes its own scopes, query params and copy, and its   */
/* own file keeps whatever is particular to it (lib/facebook: the       */
/* friends list and its token). Nothing here changes a session: the     */
/* auth store's finishOAuth decides what to do with what comes back.    */
/*                                                                      */
/* THE BROWSER LEG. supabase-js builds the /authorize URL (or, to add    */
/* Facebook to an existing account, /user/identities/authorize), the     */
/* system auth sheet opens it, and GoTrue sends the browser back to      */
/* drinkdex://auth/callback with the session in the URL. The client is   */
/* on the default implicit flow, so that session is a FRAGMENT, as on a  */
/* reset link (lib/recovery), and is read by hand for the same reason:   */
/* detectSessionInUrl is off. Do not switch the client to PKCE for this; */
/* password recovery depends on the implicit flow.                      */
/* ==================================================================== */

/** The OAuth return link's path. app/+native-intent keys on it too. */
export const AUTH_CALLBACK_PATH = 'auth/callback';

/** drinkdex://auth/callback in a release build. Must be on Supabase's
 *  Redirect URLs allow-list, or GoTrue sends the browser to the Site URL. */
export function authCallbackUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

/** The providers that sign in through the browser. Apple uses its own native sheet. */
export type OAuthProvider = 'google' | 'facebook';

/**
 * 'sign-in' makes or opens the account the provider identity belongs to.
 * 'link' adds the provider to the signed-in account
 * (supabase.auth.linkIdentity), which needs "Allow manual linking" on in
 * the Supabase dashboard. Only Facebook links today.
 */
export type OAuthMode = 'sign-in' | 'link';

export type OAuthOutcome =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; providerToken: string | null }
  /** Only under PKCE, which this client does not use; handled rather than dropped. */
  | { kind: 'code'; code: string; providerToken: null }
  /** Closed the sheet, or said no on the provider's own page. Nothing to say. */
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/**
 * A provider's failures in words: GoTrue's error code in, copy out, keyed
 * on its stable codes, never on the text, which is written for
 * developers. Called with no code for a failure that carries none, and
 * should then answer with the provider's general "did not sign you in".
 * Shared by an error the API call returns and one the return link
 * carries, since GoTrue reports the same failures both ways.
 */
export type DescribeAuthError = (code?: string) => string;

const OFFLINE = 'Cannot reach Sipply. Check your connection and try again.';

function describeApiError(error: AuthError, describe: DescribeAuthError): string {
  if (isAuthRetryableFetchError(error) && !error.status) return OFFLINE;
  return describe(error.code);
}

/**
 * Reads the return link. Never throws: urlFields skips anything that will
 * not decode, and this runs on a URL a web page could have written.
 */
export function parseAuthCallback(url: string, describe: DescribeAuthError): OAuthOutcome {
  const fields = urlFields(url);

  if (fields.error || fields.error_code || fields.error_description) {
    /*
     * Cancel on Facebook's own dialog comes back as access_denied with the
     * reason user_denied, or, once GoTrue has passed it on without the
     * reason, with Facebook's description of it ("Permissions error"). It is
     * the same decision as closing the sheet, so it is answered the same
     * way: with nothing. An access_denied that carries one of GoTrue's own
     * error codes is a real refusal and falls through to be described.
     */
    const denied =
      fields.error_reason === 'user_denied' ||
      (fields.error === 'access_denied' &&
        !/[a-z]/i.test(fields.error_code ?? '') &&
        /denied|cancel|permission/i.test(fields.error_description ?? ''));
    if (denied) return { kind: 'cancelled' };
    return { kind: 'error', message: describe(fields.error_code || fields.error) };
  }

  if (fields.access_token && fields.refresh_token) {
    return {
      kind: 'tokens',
      accessToken: fields.access_token,
      refreshToken: fields.refresh_token,
      providerToken: fields.provider_token || null,
    };
  }
  if (fields.code) return { kind: 'code', code: fields.code, providerToken: null };

  return { kind: 'error', message: describe() };
}

/**
 * Runs the provider's sign-in page in the system auth sheet and reads what
 * GoTrue sends back. Changes no session: the auth store decides what to do
 * with the tokens, including refusing them (see connectFacebook there).
 *
 * `queryParams` are passed on to the provider by GoTrue (Facebook's
 * auth_type, Google's prompt); `scopes` is the provider's own list.
 */
export async function openOAuth(
  provider: OAuthProvider,
  mode: OAuthMode,
  opts: { scopes?: string; queryParams?: Record<string, string>; describe: DescribeAuthError },
): Promise<OAuthOutcome> {
  const redirectTo = authCallbackUrl();
  const options = {
    redirectTo,
    scopes: opts.scopes,
    skipBrowserRedirect: true,
    queryParams: opts.queryParams,
  };

  try {
    const { data, error } =
      mode === 'link'
        ? await supabase.auth.linkIdentity({ provider, options })
        : await supabase.auth.signInWithOAuth({ provider, options });
    if (error) return { kind: 'error', message: describeApiError(error, opts.describe) };
    if (!data?.url) return { kind: 'error', message: opts.describe() };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { kind: 'cancelled' };
    return parseAuthCallback(result.url, opts.describe);
  } catch {
    // A second sheet while one is open throws, as does a failed fetch.
    return { kind: 'error', message: opts.describe() };
  }
}
