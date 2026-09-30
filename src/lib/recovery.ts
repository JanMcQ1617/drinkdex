import AsyncStorage from '@react-native-async-storage/async-storage';
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
/* WHAT IMPLICIT FLOW COSTS, AND HOW IT IS PAID FOR. A link like the one */
/* above carries a live session, and anyone can build one out of their  */
/* OWN tokens. Handed to setSession blindly, a crafted link would sign   */
/* whoever tapped it into the crafter's account and invite them to set   */
/* its password — a login swap the victim would not notice, while their  */
/* pours and photos went to the wrong account. So a link is honoured     */
/* only when the account inside it is the one this phone asked to reset, */
/* within the hour the link lives (see checkResetRequest below), and     */
/* never when it would replace a different signed-in account.           */
/*                                                                      */
/* NOT switched to PKCE, which would bind the link to this device by     */
/* construction. flowType is a client-wide setting, so changing it also  */
/* changes how signup confirmation resolves, and that path has not been  */
/* tested on a real build — and Continue with Facebook reads its session */
/* out of the same kind of fragment (lib/facebook). The request check    */
/* above gives the same guarantee for the one flow that needs it; PKCE   */
/* stays the better long-term answer once both have been verified on it. */
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
 *
 * A pair that will not decode is skipped, never thrown. This runs on EVERY
 * incoming URL, from a synchronous Linking listener, and decodeURIComponent
 * throws on a valid escape that is not UTF-8 (`?a=%FF`). A throw there is a
 * fatal error in a release build, so any web page could have closed the
 * app with one crafted link.
 */
function parsePairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.replace(/^[#?]/, '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(part.slice(0, eq));
      // '+' is a space in form encoding; decodeURIComponent leaves it alone,
      // which is what turned "Email link is invalid" into "Email+link+is+invalid".
      value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
    } catch {
      continue;
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Every pair in a URL's query string and its fragment, the fragment winning
 * where both name the same key.
 *
 * Both, because GoTrue puts a session in the fragment under the implicit
 * flow and a `code` in the query under PKCE, and has moved things between
 * the two across versions; reading both costs nothing. Exported for the
 * Facebook return link (lib/facebook), which GoTrue builds the same way as
 * a reset link and which must be just as unable to throw.
 */
export function urlFields(url: string): Record<string, string> {
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  return {
    ...(query >= 0 ? parsePairs(url.slice(query, hash > query ? hash : undefined)) : {}),
    ...(hash >= 0 ? parsePairs(url.slice(hash)) : {}),
  };
}

/**
 * Reads a recovery deep link. Returns null for any URL that is not one —
 * the invite handler and this one both see every incoming link, so each
 * has to ignore the other's without complaining.
 *
 * Checks the fragment first and the query string second (urlFields). Only
 * the fragment is used today, but a project switched to PKCE, or GoTrue
 * changing where it puts things, would land in the query.
 */
export function parseRecoveryUrl(url: string): RecoveryLink | null {
  if (!url) return null;

  const fields = urlFields(url);

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

/* ==================================================================== */
/* Whose link is it                                                     */
/* ==================================================================== */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64url to a UTF-8 string, or null. Hand-rolled for the same reason as
 *  parsePairs: atob and TextDecoder depend on which Hermes build shipped. */
function base64UrlToText(input: string): string | null {
  let bits = 0;
  let value = 0;
  let escaped = '';
  for (const ch of input.replace(/-/g, '+').replace(/_/g, '/')) {
    if (ch === '=') break;
    const digit = B64.indexOf(ch);
    if (digit < 0) return null;
    value = ((value << 6) | digit) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      escaped += '%' + ((value >> bits) & 0xff).toString(16).padStart(2, '0');
    }
  }
  try {
    return decodeURIComponent(escaped);
  } catch {
    return null;
  }
}

/**
 * The account a recovery link would sign in as, read from its access token.
 *
 * UNVERIFIED, and that is fine for what it is used for: it only decides
 * whether to call setSession at all. setSession is what checks the
 * signature, so a token forged to name the right account still fails there.
 */
export function readTokenAccount(accessToken: string): { id: string; email: string | null } | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  const text = base64UrlToText(payload);
  if (!text) return null;
  try {
    const claims = JSON.parse(text) as { sub?: unknown; email?: unknown };
    if (typeof claims.sub !== 'string') return null;
    return {
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null,
    };
  } catch {
    return null;
  }
}

/*
 * The reset this phone asked for. Written when the request succeeds and
 * read before a link is honoured, which is what ties a link to the person
 * holding the phone: the only way to get a real token for that address is
 * to open that address's mail.
 *
 * The window matches GoTrue's default one-hour link, plus five minutes for
 * mail delay and clock skew. A failed write means the link is refused and
 * the user asks again, which is the safe way for it to fail.
 */
const REQUEST_KEY = 'sipply-reset-request';
const REQUEST_WINDOW_MS = 65 * 60 * 1000;

export async function rememberResetRequest(email: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      REQUEST_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), at: Date.now() }),
    );
  } catch {
    /* See above: the link will be refused and can be requested again. */
  }
}

export async function forgetResetRequest(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REQUEST_KEY);
  } catch {
    /* Expires on its own within the hour. */
  }
}

/**
 * 'ok' when this phone asked to reset `email` within the link's lifetime.
 * 'expired' when it did, but too long ago. 'not-requested' otherwise,
 * including a link for a different address than the one asked about.
 */
export async function checkResetRequest(
  email: string | null,
): Promise<'ok' | 'expired' | 'not-requested'> {
  let record: { email?: unknown; at?: unknown } | null = null;
  try {
    const raw = await AsyncStorage.getItem(REQUEST_KEY);
    record = raw ? (JSON.parse(raw) as { email?: unknown; at?: unknown }) : null;
  } catch {
    record = null;
  }
  if (!record || typeof record.email !== 'string' || typeof record.at !== 'number') {
    return 'not-requested';
  }
  if (!email || email !== record.email) return 'not-requested';
  return Date.now() - record.at > REQUEST_WINDOW_MS ? 'expired' : 'ok';
}

/*
 * Which account is part-way through a reset, persisted.
 *
 * A recovery link signs the user in, and supabase-js persists that session
 * on its own. The "choose a new password" step lived only in memory, so
 * swiping the app away on that screen and reopening it left the user
 * signed in with no overlay and the forgotten password still in force.
 * Keyed by user id so it can only ever re-open the step for the account
 * whose session it came with.
 */
const RECOVERING_KEY = 'sipply-recovering';

export async function markRecovering(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(RECOVERING_KEY, userId);
  } catch {
    /* The overlay is up for this launch either way. */
  }
}

export async function recoveringUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(RECOVERING_KEY);
  } catch {
    return null;
  }
}

export async function clearRecovering(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECOVERING_KEY);
  } catch {
    /* A stale flag only matches its own account, and signIn clears it. */
  }
}
