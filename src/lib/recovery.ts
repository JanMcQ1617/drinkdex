import * as Linking from 'expo-linking';

/* ==================================================================== */
/* Password-recovery deep links                                         */
/*                                                                      */
/* Supabase does not send the app a reset link directly. The email      */
/* points at GoTrue's own verify endpoint:                              */
/*                                                                      */
/*   {SUPABASE_URL}/auth/v1/verify?token=…&type=recovery&redirect_to=…  */
/*                                                                      */
/* which consumes the one-time token and 302s to `redirect_to` with the */
/* session appended. Where it appends it depends on the client's        */
/* flowType, and this app is on the supabase-js default, `implicit`:    */
/*                                                                      */
/*   drinkdex://reset-password#access_token=…&refresh_token=…&type=…    */
/*                                                                      */
/* — a URL FRAGMENT, not a query string. That matters twice over:       */
/*                                                                      */
/*  1. expo-linking's `parse` returns scheme/hostname/path/queryParams  */
/*     and drops the fragment on the floor, so it cannot be used here.  */
/*     The fragment is split off by hand below.                         */
/*                                                                      */
/*  2. `detectSessionInUrl` is false on our client (see lib/supabase),  */
/*     so nothing picks these tokens up on its own. beginRecovery in    */
/*     the auth store hands them to setSession explicitly.              */
/*                                                                      */
/* NOT switched to PKCE to get a tidier `?code=`. flowType is a         */
/* client-wide setting, so changing it would also change how signup     */
/* confirmation resolves — a much wider blast radius than one screen    */
/* is worth. Implicit is what this client already does everywhere else. */
/* ==================================================================== */

/** Where GoTrue is told to send the user back to. Must be allowlisted in
 *  the Supabase dashboard under Authentication → URL Configuration. */
export const RECOVERY_PATH = 'reset-password';

export function recoveryRedirectUrl(): string {
  return Linking.createURL(RECOVERY_PATH);
}

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  /** GoTrue reports a dead link in the fragment too, rather than failing loudly. */
  | { kind: 'error'; message: string };

/**
 * Splits `a=1&b=2` into a map, tolerating a leading `#` or `?` and empty
 * segments. Hand-rolled rather than URLSearchParams: that only exists here
 * because react-native-url-polyfill is imported for Supabase's benefit, and
 * depending on another module's import side effect for correctness is the
 * kind of coupling that breaks silently when imports get reordered.
 */
function parsePairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.replace(/^[#?]/, '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    // '+' is a space in form encoding; decodeURIComponent leaves it alone,
    // which is what turned "Email link is invalid" into "Email+link+is+invalid".
    const value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Reads a recovery deep link. Returns null for any URL that is not one —
 * the invite handler and this one both see every incoming link, so each
 * has to ignore the other's without complaining.
 *
 * Checks the fragment first and the query string second. Only the fragment
 * is used today, but a project switched to PKCE, or GoTrue changing where
 * it puts things, would land in the query — and reading both costs nothing.
 */
export function parseRecoveryUrl(url: string): RecoveryLink | null {
  if (!url) return null;

  const hash = url.indexOf('#');
  const fields = {
    ...parsePairs(url.slice(url.indexOf('?'))),
    ...(hash >= 0 ? parsePairs(url.slice(hash)) : {}),
  };

  /*
   * Match on the payload, not on the path. GoTrue preserves `redirect_to`
   * but has changed how it normalizes the path between versions (a trailing
   * slash, host-vs-path placement on custom schemes), and an app that only
   * recognised its own spelling of "reset-password" would silently ignore a
   * link that is otherwise perfectly good. `type=recovery` is GoTrue's own
   * label and is the honest thing to key on.
   */
  const isRecovery =
    fields.type === 'recovery' ||
    // A failed recovery link carries the error instead of a type.
    (fields.error != null && url.includes(RECOVERY_PATH));

  if (!isRecovery) return null;

  if (fields.error || fields.error_description) {
    const code = fields.error_code ?? fields.error;
    const expired = code === 'otp_expired' || /expired/i.test(fields.error_description ?? '');
    return {
      kind: 'error',
      message: expired
        ? 'That reset link has expired. Request a new one.'
        : 'That reset link is not valid. Request a new one.',
    };
  }

  const accessToken = fields.access_token;
  const refreshToken = fields.refresh_token;

  /*
   * Both or nothing. setSession needs the refresh token as well — given
   * only the access token it produces a session that dies in an hour with
   * no way to renew, which would look like "the app signed me out again"
   * rather than anything to do with a reset.
   */
  if (!accessToken || !refreshToken) {
    return { kind: 'error', message: 'That reset link is incomplete. Request a new one.' };
  }

  return { kind: 'tokens', accessToken, refreshToken };
}
