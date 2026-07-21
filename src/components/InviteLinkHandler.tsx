import * as Linking from 'expo-linking';
import { useEffect } from 'react';

import {
  clearPendingInvite,
  getPendingInvite,
  parseInviteUrl,
  setPendingInvite,
} from '@/lib/invite';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';

/**
 * Applies invite deep links.
 *
 * Renders nothing. Two paths:
 *   • a link opened while signed in redeems immediately;
 *   • a link opened while signed out is parked in storage and redeemed the
 *     moment a session appears (i.e. right after the new user signs up).
 *
 * Mounted once at the app root.
 */
export function InviteLinkHandler() {
  const myId = useAuth((s) => s.session?.user.id);
  const acceptInvite = useSocial((s) => s.acceptInvite);

  // Incoming links, both cold-start and while running.
  useEffect(() => {
    let active = true;

    const handle = async (url: string | null) => {
      if (!url) return;
      const inviterId = parseInviteUrl(url);
      if (!inviterId) return;

      const currentId = useAuth.getState().session?.user.id;
      if (currentId) {
        if (inviterId !== currentId) void acceptInvite(currentId, inviterId);
      } else {
        // Redeemed once the user finishes signing up (effect below).
        await setPendingInvite(inviterId);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (active) void handle(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => void handle(url));

    return () => {
      active = false;
      sub.remove();
    };
  }, [acceptInvite]);

  // Drain a parked invite as soon as we have a session.
  useEffect(() => {
    if (!myId) return;
    let active = true;

    (async () => {
      const inviterId = await getPendingInvite();
      if (!active || !inviterId) return;
      await clearPendingInvite();
      if (inviterId !== myId) void acceptInvite(myId, inviterId);
    })();

    return () => {
      active = false;
    };
  }, [myId, acceptInvite]);

  return null;
}
