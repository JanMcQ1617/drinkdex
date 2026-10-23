import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { ProfileView } from '@/components/profile/ProfileView';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { ActionSheet, type SheetAction } from '@/components/Sheet';
import { EmptyState, Hold } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { shareProfile } from '@/lib/profileLink';
import { toProfile } from '@/lib/social';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* Your profile                                                         */
/*                                                                      */
/* Always you. Someone else's profile is its own screen, app/user/[id],  */
/* pushed over the tabs. Both draw the same ProfileView, so yours shows  */
/* what other people see.                                                */
/*                                                                      */
/* v4: the bar holds the handle and one •••, nothing else (layout spec  */
/* 5.5). Posting is Home's create key; the gear and Share profile are   */
/* rows of the •••: Share profile, Settings, About. Account deletion is */
/* still two taps from here (•••, Settings, then the row), which is     */
/* what Apple asks for, and its flow in Settings is unchanged.          */
/*                                                                      */
/* Tournaments are not here any more. Build 29 had a Tournaments line   */
/* under the Dex line and a ••• row for them, and this screen asked the */
/* server on focus to gate both. v4.7 gave them a tab of their own, the */
/* trophy, second in the bar (Jan, 23 Oct 2026; specs/v4.7/spec.md 2.9; */
/* it sat on the red key in the middle until his swap that day), which  */
/* replaced the line and the row: two ways in to the same list from     */
/* another tab would only be two things to keep in step. Activity's     */
/* invitations row still opens the list.                                */
/*                                                                      */
/* The list is the Profile tab's scroll source (chromeTab).              */
/* ==================================================================== */

function OwnProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);
  const profileLoading = useAuth((s) => s.profileLoading);
  const profileError = useAuth((s) => s.profileError);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [fallbackMenu, setFallbackMenu] = useState(false);

  const settings: SheetAction = { label: 'Settings', onPress: () => router.push('/settings') };

  /*
   * A profile already on screen stays there while it refreshes (an edit,
   * a pull): only a missing row is a loading or failed state. Checked
   * against the session, so the previous account's row never stands in.
   */
  if (profile && profile.id === myId) {
    const person = toProfile(profile);
    return (
      <ProfileView
        person={person}
        isOwn
        menu={(about) => [
          { label: 'Share profile', onPress: () => shareProfile(person) },
          settings,
          about,
        ]}
        bottomInset={insets.bottom + TAB_BAR_CLEARANCE + space.md}
        chromeTab="profile"
      />
    );
  }

  /*
   * A signed-in user with no profile row used to render nothing at all,
   * which looked exactly like a screen that had failed to load. The bar
   * stays, with its ••• holding Settings (and so sign out) either way, and
   * the body says which of the two it is.
   */
  return (
    <View style={styles.screen}>
      <ScreenTopBar
        size="lg"
        title=""
        right={<TopBarButton icon="more" label="Profile options" onPress={() => setFallbackMenu(true)} />}
        showRule={false}
      />
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
      <ActionSheet
        visible={fallbackMenu}
        onClose={() => setFallbackMenu(false)}
        actions={[settings]}
      />
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
