import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthGate } from '@/components/AuthGate';
import { PeerProfile } from '@/components/PeerProfile';
import { colors } from '@/constants/theme';
import { isPlaceholderUsername, useAuth } from '@/store/auth';

/* ==================================================================== */
/* Someone's profile                                                    */
/*                                                                      */
/* A root-stack screen, pushed over the tabs from anywhere a person is   */
/* shown: a feed bubble, a post's author, the accounts list, a match in  */
/* Find friends, an accepted invite. It used to be a `user` param on     */
/* the Profile tab, which lit Profile in the tab bar while someone else  */
/* was on screen and had no swipe back. The Profile tab is now only      */
/* ever you.                                                             */
/*                                                                      */
/* Gated on the session and the username step, not on AuthGate's         */
/* welcome step. That step is shown by the tab scenes underneath, and it */
/* can open this screen itself (a match in its Find friends list); gated */
/* here too, it would open a second copy of the welcome step instead of  */
/* the person. The username step is different: it comes before welcome, */
/* so nothing inside the app opens this screen while it is pending, but  */
/* an old drinkdex://u/<id> link lands here cold, and an account made on */
/* this screen's sign-in form, by any method, still has its              */
/* pour_1a2b3c4d handle and has not yet been through that step. So       */
/* signed out, AuthGate stands in with the sign-in screen, and with the  */
/* handle still a placeholder, with that step.                           */
/*                                                                      */
/* Both gates close the way Back does (`leave`): out of this screen, or  */
/* Home when a link opened it cold, rather than to the Dex, which is     */
/* where a tab's gate closes to.                                         */
/* ==================================================================== */

export default function UserScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // Account ids are lowercase everywhere they are stored, and a link may not be.
  const id = String(params.id ?? '').toLowerCase();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);
  const isSelf = !!myId && id === myId.toLowerCase();
  // The same test AuthGate makes before it lets an account in.
  const unnamed = !!profile && profile.id === myId && isPlaceholderUsername(profile.username);

  /*
   * Your own id belongs to the Profile tab, where Edit profile is, not to a
   * copy of your profile offering to follow, report or block you. The feed
   * sends your own name there itself, and every list of people leaves you
   * out; this catches a link, which does neither. dismissTo pops back to
   * the tabs when they are underneath and
   * replaces this screen with them when they are not.
   */
  useEffect(() => {
    if (isSelf) router.dismissTo('/profile');
  }, [isSelf, router]);

  /*
   * Back is the stack's back. Opened cold from a link there is nothing
   * under this screen, so it goes Home rather than nowhere.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  if (isSelf) return <View style={styles.screen} />;
  if (unnamed) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <PeerProfile id={id} onBack={leave} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
