import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { whenIntroPlayed } from '@/lib/intro';
import {
  clearPendingInvite,
  getPendingInvite,
  parseInviteUrl,
  setPendingInvite,
} from '@/lib/invite';
import { useAuth } from '@/store/auth';
import { useSocial, type InviteOutcome } from '@/store/social';
import { showNotice } from '@/utils/alerts';

/**
 * Resolves once the persisted session has been restored, with the signed-in
 * id or undefined.
 *
 * A cold start from a link reaches getInitialURL before the auth store has
 * read the session back, so asking "is anyone signed in" at that moment
 * answered no for people who were. Their link was parked and then offered
 * as though they had opened it signed out.
 */
function signedInId(): Promise<string | undefined> {
  const now = useAuth.getState();
  if (now.ready) return Promise.resolve(now.session?.user.id);
  return new Promise((resolve) => {
    const unsubscribe = useAuth.subscribe((s) => {
      if (!s.ready) return;
      unsubscribe();
      resolve(s.session?.user.id);
    });
  });
}

/**
 * Says what became of an invite. A link that does its work silently leaves
 * the person who tapped it unable to tell whether anything happened, and
 * the failure case used to be exactly as silent as success.
 *
 * `parked`: the token is still in storage and will be offered again, so a
 * failure says that rather than asking them to find the link again.
 */
function reportOutcome(outcome: InviteOutcome, parked: boolean) {
  if (outcome.status === 'accepted') {
    // acceptInvite reloads the graph before resolving, so the inviter's
    // profile is already in the store by now.
    const name = useSocial.getState().profiles[outcome.inviterId]?.displayName;
    Alert.alert(
      'Invite accepted',
      name ? `You and ${name} now follow each other.` : 'You now follow each other.',
      [
        { text: 'Done', style: 'cancel' },
        {
          text: 'View profile',
          onPress: () =>
            router.push({ pathname: '/user/[id]', params: { id: outcome.inviterId } }),
        },
      ],
    );
    return;
  }

  if (outcome.status === 'invalid') {
    /*
     * The server does not say why — expired, unknown, your own link, or a
     * block between you — and must not: a block has to stay undiscoverable.
     * So the copy names the common case and offers the way round it.
     */
    showNotice(
      'This invite link cannot be used',
      'It may have expired. Ask for a new link, or find them by username in Find friends.',
    );
    return;
  }

  showNotice(
    'Could not accept the invite',
    parked
      ? 'Check your connection. Sipply will offer it again the next time you open the app.'
      : 'Check your connection, then open the link again.',
  );
}

/**
 * Asks before an invite is redeemed. `lead` says how the user got here.
 *
 * The token cannot be looked up before it is redeemed (only its creator
 * can read it), so the question cannot name the inviter; it names what
 * accepting will do instead, and the answer names them once it is done.
 */
function offerInvite(lead: string, onAccept: () => void, onIgnore?: () => void) {
  Alert.alert(
    'Accept the invite?',
    `${lead} Accept it and you and the person who sent it will follow each other.`,
    [
      { text: 'Ignore', style: 'cancel', onPress: onIgnore },
      { text: 'Accept', onPress: onAccept },
    ],
    { cancelable: false },
  );
}

/**
 * Applies invite deep links. Renders nothing; mounted once at the app root.
 *
 * Nothing is redeemed without a yes, on either path. A link does not prove
 * that anyone tapped it: a web page, a QR code or another app can open
 * drinkdex://invite/<token> on its own, and anyone can mint a token of
 * their own to put there. Redeeming on arrival let that make a signed-in
 * user follow a stranger, and be followed back, without being asked.
 *
 *   • a link opened while signed in is offered at once, and redeemed on
 *     Accept.
 *   • a link opened while signed out is parked, and offered when a session
 *     appears. That session is not necessarily the person who tapped the
 *     link: on a shared phone it can be whoever signs in next, which is the
 *     same cross-account leak drainPendingClaims guards against. Parked
 *     tokens also expire after a day (see lib/invite).
 *
 * The result is reported either way (reportOutcome).
 *
 * Neither path asks over the intro film. An invite link usually
 * cold-starts the app, and every cold start plays the film (lib/intro), so
 * "Accept the invite?" raised on arrival landed on top of it, half-watched.
 * Both wait for whenIntroPlayed, which resolves at once when the app was
 * already running. The answer's report needs no wait: it comes after a tap.
 *
 * Where the router goes when one of these links opens the app is decided
 * in app/+native-intent, not here.
 */
export function InviteLinkHandler() {
  const myId = useAuth((s) => s.session?.user.id);
  const acceptInvite = useSocial((s) => s.acceptInvite);

  // Incoming links, both cold-start and while running.
  useEffect(() => {
    let active = true;

    const handle = async (url: string | null) => {
      if (!url) return;
      const token = parseInviteUrl(url);
      if (!token) return;

      const currentId = await signedInId();
      if (!active) return;
      if (!currentId) {
        await setPendingInvite(token);
        return;
      }
      await whenIntroPlayed();
      if (!active) return;
      offerInvite('You opened an invite link.', () => {
        void acceptInvite(currentId, token).then((outcome) => reportOutcome(outcome, false));
      });
    };

    void Linking.getInitialURL().then((url) => {
      if (active) void handle(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => void handle(url));

    return () => {
      active = false;
      sub.remove();
    };
  }, [acceptInvite]);

  // Offer a parked invite as soon as there is a session.
  useEffect(() => {
    if (!myId) return;
    let active = true;

    const redeem = async (token: string) => {
      const outcome = await acceptInvite(myId, token);
      // Kept only when the request itself failed, so it can be offered again.
      if (outcome.status !== 'failed') await clearPendingInvite();
      reportOutcome(outcome, true);
    };

    void getPendingInvite().then(async (token) => {
      if (!active || !token) return;
      await whenIntroPlayed();
      if (!active) return;
      offerInvite(
        'You opened an invite link before signing in.',
        () => void redeem(token),
        () => void clearPendingInvite(),
      );
    });

    return () => {
      active = false;
    };
  }, [myId, acceptInvite]);

  return null;
}
