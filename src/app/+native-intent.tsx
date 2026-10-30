import { INVITE_PATH } from '@/lib/invite';
import { AUTH_CALLBACK_PATH } from '@/lib/oauth';
import { RECOVERY_PATH } from '@/lib/recovery';
import { SPIRIT_SHOP_ENABLED } from '@/lib/shop';
import { STRIPE_RETURN_PATH } from '@/lib/shopCore';

/* ==================================================================== */
/* Incoming links, before the router sees them                          */
/*                                                                      */
/* expo-router routes every URL the app is opened with, and it does so   */
/* independently of the Linking listeners that actually handle ours.     */
/* drinkdex://invite/<token> became the path `invite/<token>` and a      */
/* reset link became `reset-password`; neither is a screen, so every     */
/* invite tap and every reset email ended on the router's black          */
/* "Unmatched Route" page, with the real work happening unseen behind it. */
/*                                                                      */
/* So those two are taken away from the router here, with a third:      */
/* drinkdex://auth/callback, where GoTrue sends the browser back after   */
/* Continue with Google or Facebook. The system auth sheet normally      */
/* hands that URL straight to lib/oauth and the router never sees it,    */
/* but a sheet that is dismissed as the redirect lands, or Android's     */
/* browser, can deliver it as an ordinary link, and that must not end on */
/* Unmatched Route either. InviteLinkHandler and PasswordResetOverlay    */
/* still receive their raw URLs through their own listeners — this only  */
/* decides where the navigator goes:                                     */
/*                                                                      */
/*   • on a cold start, Home, which is where both flows are meant to     */
/*     unfold (the sign-up form for a signed-out invitee, the overlay    */
/*     for a reset);                                                     */
/*   • while running, nowhere. Returning null leaves the user on the     */
/*     screen they were on, and the handler's own alert or overlay       */
/*     arrives over it. A stray auth callback has no handler to wait     */
/*     for: its session was already taken, or the sheet was closed.      */
/*                                                                      */
/* A fourth, while the shop is on (v4.11, specs/v4.11/shop.md):         */
/* drinkdex://stripe-redirect, where a payment method that left the app  */
/* (a bank's page, another app) sends the person back to the payment    */
/* sheet. components/ShopHost hands it to Stripe; like a stray auth      */
/* callback it goes nowhere while running and Home on a cold start.      */
/* With the shop off the link is passed through as before.              */
/*                                                                      */
/* The old drinkdex://u/<uuid> invite, which named a user rather than    */
/* carrying a token, opens that person's profile (the /user/[id] screen) */
/* and follows nobody.                                                  */
/*                                                                      */
/* drinkdex://collection/<share id>, a shared collection's Open in       */
/* Sipply (v4.2 §4.7: the web page's key, a QR code, a pasted link),     */
/* opens app/collection/[share] with the id lower-cased, as stored. A    */
/* malformed id still goes there, where it reads as a link that is not  */
/* shared any more rather than as Unmatched Route.                      */
/* Anything else is passed through untouched.                           */
/*                                                                      */
/* Must never throw: an exception here is raised inside the router's     */
/* linking setup, where it takes the app down with it.                  */
/* ==================================================================== */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The route part of an incoming link: `invite/<token>` out of
 * drinkdex://invite/<token>, drinkdex:///invite/<token> (a spelling GoTrue
 * sometimes produces), or the dev client's exp://host:8081/--/invite/<token>.
 */
function routeOf(path: string): string[] {
  const devMarker = path.indexOf('/--/');
  const bare =
    devMarker >= 0 ? path.slice(devMarker + 4) : path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  return (bare.split(/[?#]/)[0] ?? '').replace(/^\/+/, '').split('/');
}

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    const [first = '', second = ''] = routeOf(path);

    if (first === INVITE_PATH || first === RECOVERY_PATH) return initial ? '/' : null;

    if (`${first}/${second}` === AUTH_CALLBACK_PATH) return initial ? '/' : null;

    if (SPIRIT_SHOP_ENABLED && first === STRIPE_RETURN_PATH) return initial ? '/' : null;

    if (first === 'u' && UUID.test(second)) return `/user/${second.toLowerCase()}`;

    // Even with the id missing (a link cut short): the screen reads that as not shared, never Unmatched Route.
    if (first === 'collection') {
      return `/collection/${UUID.test(second) ? second.toLowerCase() : encodeURIComponent(second || '-')}`;
    }

    return path;
  } catch {
    return path;
  }
}
