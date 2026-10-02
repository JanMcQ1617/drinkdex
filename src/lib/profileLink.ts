import * as Linking from 'expo-linking';
import { Share } from 'react-native';

import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Sharing a profile                                                    */
/*                                                                      */
/* The link is drinkdex://u/<id>. app/+native-intent already routes      */
/* u/<uuid> to the /user/[id] screen (it is what the first invite links  */
/* looked like), so a shared profile opens that person and nothing else: */
/* sharing never creates an invite and never makes anyone follow anyone. */
/* An invite is a different thing, with its own token (lib/invite).      */
/*                                                                      */
/* As honest about the custom scheme as buildInviteMessage is: the link  */
/* does something only on a phone that already has the app, so the       */
/* message carries the handle to search for as well.                    */
/* ==================================================================== */

/** The link that opens someone's profile in the app. */
export const profileUrl = (id: string) => Linking.createURL(`u/${id}`);

/**
 * The text that wraps the link when a profile is shared. An object
 * argument, as buildInviteMessage takes, so a display name passed where the
 * username belongs fails to compile rather than ships.
 */
export function buildProfileShareMessage(p: {
  displayName: string;
  username: string;
  url: string;
}): string {
  return `${p.displayName} (@${p.username}) on Sipply. If you have the app, this opens the profile: ${p.url}\nOr search for @${p.username}.`;
}

/**
 * Opens the share sheet for a profile: yours from its Share profile
 * button, anyone else's from the profile's menu. Fire and forget, as
 * PostCard's share is: a dismissed sheet is not an error.
 */
export function shareProfile(p: Pick<UserProfile, 'id' | 'displayName' | 'username'>): void {
  Share.share({
    message: buildProfileShareMessage({
      displayName: p.displayName,
      username: p.username,
      url: profileUrl(p.id),
    }),
  }).catch(() => {
    /* dismissed, or unsupported off-device */
  });
}
