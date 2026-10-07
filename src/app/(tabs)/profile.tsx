import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { ProfileView } from '@/components/profile/ProfileView';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { EmptyState, Hold } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { toProfile } from '@/lib/social';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* Your profile                                                         */
/*                                                                      */
/* Always you. Someone else's profile is its own screen, app/user/[id],  */
/* pushed over the tabs; it used to be a `user` param on this tab, which */
/* lit Profile in the tab bar while another person was on screen. Both   */
/* now draw the same ProfileView, so yours shows what other people see.  */
/*                                                                      */
/* Settings is the gear, top right, as the docs describe it. Reset, sign */
/* out, delete and the find-me controls live there; account deletion is  */
/* still two taps from here, which is what Apple asks for. Find friends  */
/* is not in this header (v3.1 took the button beside Share profile      */
/* away): it is in Settings, on Home's stories rail ("Find friends"),    */
/* and in every empty state that offers it.                              */
/*                                                                      */
/* The list is the Profile tab's scroll source (chromeTab), so scrolling */
/* it compacts the tab bar as Home, Dex and My Bar do.                   */
/* ==================================================================== */

function OwnProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);
  const profileLoading = useAuth((s) => s.profileLoading);
  const profileError = useAuth((s) => s.profileError);
  const refreshProfile = useAuth((s) => s.refreshProfile);

  // Posting is the most frequent action, so + goes straight to the sheet.
  const left = (
    <TopBarButton icon="plus" label="Post a drink" onPress={() => router.navigate('/log')} />
  );
  const right = (
    <TopBarButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
  );

  /*
   * A profile already on screen stays there while it refreshes (an edit,
   * a pull): only a missing row is a loading or failed state. Checked
   * against the session, so the previous account's row never stands in.
   */
  if (profile && profile.id === myId) {
    return (
      <ProfileView
        person={toProfile(profile)}
        isOwn
        left={left}
        right={right}
        bottomInset={insets.bottom + TAB_BAR_CLEARANCE + space.md}
        chromeTab="profile"
      />
    );
  }

  /*
   * A signed-in user with no profile row used to render nothing at all,
   * which looked exactly like a screen that had failed to load. The bar
   * stays, so Post a drink and Settings (and sign out) are reachable either
   * way, and the body says which of the two it is.
   */
  /*
   * Paper grain under it all, now that the app has no global grain; the
   * Hold is the slot kind (no fill of its own), centred here, so the
   * grained page shows behind the spinner instead of a flat cream sheet.
   */
  return (
    <View style={styles.screen}>
      <Grain />
      <ScreenTopBar size="lg" title="" left={left} right={right} showRule={false} />
      {profileError && !profileLoading ? (
        /*
         * Not "check your connection": after three attempts a missing row
         * is as likely as a dropped connection, and the store's message
         * does not guess either.
         */
        <View style={styles.center}>
          <EmptyState
            icon="alert"
            title="Could not load your profile"
            body="It did not come back after three tries. Try again in a moment."
            action={{ label: 'Try again', onPress: () => void refreshProfile() }}
            actionVariant="secondary"
          />
        </View>
      ) : (
        <View style={styles.center}>
          <Hold fill={false} slowMessage="Still loading your profile." />
        </View>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  return (
    <AuthGate>
      <OwnProfile />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center' },
});
