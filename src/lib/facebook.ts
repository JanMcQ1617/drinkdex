/* ==================================================================== */
/* Facebook friends                                                     */
/*                                                                      */
/* STUB — filled in by the social-login work. Continue with Facebook     */
/* requests the user_friends permission, which returns the user's        */
/* Facebook friends who ALSO use Sipply and granted it too. Those        */
/* app-scoped ids are matched server-side (match_facebook_friends)       */
/* against the Facebook identities Supabase stores.                      */
/* ==================================================================== */

export interface FacebookFriend {
  id: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  accent: string | null;
}

/** Sipply users among this user's Facebook friends, or null if not signed in with Facebook. */
export async function fetchFacebookFriends(): Promise<FacebookFriend[] | null> {
  return null;
}
