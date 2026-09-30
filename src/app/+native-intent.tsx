import { INVITE_PATH } from '@/lib/invite';
import { RECOVERY_PATH } from '@/lib/recovery';

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
/* So those two are taken away from the router here. InviteLinkHandler   */
/* and PasswordResetOverlay still receive the raw URL through their own  */
/* listeners — this only decides where the navigator goes:               */
/*                                                                      */
/*   • on a cold start, Home, which is where both flows are meant to     */
/*     unfold (the sign-up form for a signed-out invitee, the overlay    */
/*     for a reset);                                                     */
/*   • while running, nowhere. Returning null leaves the user on the     */
/*     screen they were on, and the handler's own alert or overlay       */
/*     arrives over it.                                                  */
/*                                                                      */
/* The old drinkdex://u/<uuid> invite, which named a user rather than    */
/* carrying a token, opens that person's profile and follows nobody.     */
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

    if (first === 'u' && UUID.test(second)) return `/profile?user=${second.toLowerCase()}`;

    return path;
  } catch {
    return path;
  }
}
