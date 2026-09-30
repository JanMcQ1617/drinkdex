import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

/* ==================================================================== */
/* Invite links                                                         */
/*                                                                      */
/* An invite is a deep link carrying a random token the inviter created  */
/* (public.invites, migration 011). Opening it on a device with Sipply   */
/* installed asks whether to accept; accepting redeems the token through */
/* accept_invite, which makes the two accounts mutual follows. If the    */
/* recipient isn't signed in yet, the token is parked in storage and     */
/* offered once they are. components/InviteLinkHandler says why nothing  */
/* is redeemed without asking.                                           */
/*                                                                      */
/* A token, not the inviter's user id. The first version of this link   */
/* was drinkdex://u/<uuid>, and user ids are not secrets: anyone could   */
/* write that link for any account and make whoever opened it follow     */
/* them. Only someone the inviter actually sent a link to holds a token. */
/* Old u/<uuid> links still open that person's profile (see             */
/* app/+native-intent) but follow nobody.                                */
/*                                                                      */
/* Honest limit: this is a custom-scheme link (drinkdex://…), so it only */
/* does anything on a phone that already has the app. There's no website */
/* behind it to bounce a new user to the App Store — that needs a        */
/* universal link and a domain, which this project doesn't have yet.     */
/* The message around the link says so instead of promising a tap.       */
/* ==================================================================== */

/** First path segment of an invite link. app/+native-intent keys on it too. */
export const INVITE_PATH = 'invite';

const PENDING_KEY = 'clink-pending-invite';

/**
 * How long a link opened while signed out waits for a session. Long enough
 * to sign up and confirm an email; short enough that it cannot surface days
 * later on whoever signs in next on a shared phone.
 */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a fresh invite and returns its link, e.g. drinkdex://invite/<token>.
 * Throws when the insert fails, so the caller can say so rather than share
 * a link that leads nowhere.
 *
 * insert({}) on purpose: every column has a server default, inviter_id
 * included, and the client is only granted to write inviter_id. The token,
 * creation time and 30-day expiry are the server's to choose.
 */
export async function createInviteUrl(): Promise<string> {
  const { data, error } = await supabase.from('invites').insert({}).select('token').single();
  if (error) throw error;
  return Linking.createURL(`${INVITE_PATH}/${data.token}`);
}

/**
 * The message that wraps the link when shared. Written for someone who
 * does not have Sipply yet, because that is who an invite is for: the link
 * only works once the app is installed, so the message gives the handle to
 * search as well. An object argument so a call that still passes a
 * display name where the username belongs fails to compile.
 */
export function buildInviteMessage({ username, url }: { username: string; url: string }): string {
  return `Follow me on Sipply, a field guide to the drinks you try. Once you have the app, open this link and we will follow each other, or search for @${username}.\n${url}`;
}

/**
 * Pulls an invite token out of a deep link, or null if it isn't one.
 *
 * Accepts `drinkdex://invite/<token>`, the dev-client spelling
 * `exp://host/--/invite/<token>`, and a trailing slash or query.
 * Custom-scheme URLs put the first segment in hostname on some platforms
 * and in path on others, so both are checked.
 */
export function parseInviteUrl(url: string): string | null {
  try {
    const { hostname, path } = Linking.parse(url);
    const segments = [hostname, ...(path ? path.split('/') : [])].filter(Boolean) as string[];
    const at = segments.indexOf(INVITE_PATH);
    const token = at >= 0 ? segments[at + 1] : undefined;
    // Guard against garbage: tokens are uuids.
    return token && UUID.test(token) ? token.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Parks a token opened while signed out. Failing to park only loses the offer. */
export async function setPendingInvite(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    /* Nothing to do: the link can be opened again once signed in. */
  }
}

/**
 * The parked token, or null. A stale or unreadable entry is cleared and
 * reads as null, and so does the bare user id an older build parked here,
 * which accept_invite no longer takes.
 */
export async function getPendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown; at?: unknown };
    if (
      typeof parsed?.token === 'string' &&
      UUID.test(parsed.token) &&
      typeof parsed.at === 'number' &&
      Date.now() - parsed.at < PENDING_TTL_MS
    ) {
      return parsed.token;
    }
  } catch {
    /* Falls through to clearing it. */
  }
  await clearPendingInvite();
  return null;
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    /* Expires on its own; see PENDING_TTL_MS. */
  }
}
