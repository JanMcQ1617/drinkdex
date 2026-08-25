import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

/* ==================================================================== */
/* Invite links                                                         */
/*                                                                      */
/* An invite is a deep link carrying the inviter's user id. Opening it   */
/* on a device with Sipply installed makes the two accounts mutual        */
/* follows (see accept_invite in migration 002). If the recipient isn't  */
/* signed in yet, the inviter id is parked in storage and applied the    */
/* moment they finish signing up.                                        */
/*                                                                      */
/* Honest limit: this is a custom-scheme link (drinkdex://…), so it only */
/* does anything on a phone that already has the app. There's no website */
/* behind it to bounce a new user to the App Store — that needs a        */
/* universal link and a domain, which this project doesn't have yet.     */
/* ==================================================================== */

const PENDING_KEY = 'clink-pending-invite';

/** The tappable/shareable link for a given account. */
export function buildInviteUrl(userId: string): string {
  // e.g. drinkdex://u/<uuid>
  return Linking.createURL(`u/${userId}`);
}

/** The message that wraps the link when shared. */
export function buildInviteMessage(displayName: string, url: string): string {
  return `${displayName} is on Sipply — the pocket bar you build one drink at a time. Tap to add me:\n${url}`;
}

/**
 * Pulls an inviter id out of a deep link, or null if it isn't one.
 *
 * Accepts both `drinkdex://u/<id>` and the `/u/<id>` path shape that
 * Linking.parse produces, and tolerates a trailing slash or query.
 */
export function parseInviteUrl(url: string): string | null {
  try {
    const { hostname, path } = Linking.parse(url);
    // Custom-scheme URLs put the first segment in hostname on some
    // platforms and in path on others, so check both.
    const segments = [hostname, ...(path ? path.split('/') : [])].filter(Boolean) as string[];
    const uIndex = segments.indexOf('u');
    const id = uIndex >= 0 ? segments[uIndex + 1] : undefined;
    if (!id) return null;
    // Guard against garbage: our ids are UUIDs.
    return /^[0-9a-f-]{32,36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function setPendingInvite(inviterId: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, inviterId);
}

export async function getPendingInvite(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_KEY);
}

export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}
