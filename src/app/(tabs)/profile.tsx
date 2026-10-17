import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import type { TournamentsLine } from '@/components/profile/ProfileHeader';
import { ProfileView } from '@/components/profile/ProfileView';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { ActionSheet, type SheetAction } from '@/components/Sheet';
import { EmptyState, Hold } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { formatCount } from '@/data';
import { shareProfile } from '@/lib/profileLink';
import { toProfile } from '@/lib/social';
import { tournamentsHref } from '@/lib/tournaments';
import { useAuth } from '@/store/auth';
import { useTournaments } from '@/store/tournaments';

/* ==================================================================== */
/* Your profile                                                         */
/*                                                                      */
/* Always you. Someone else's profile is its own screen, app/user/[id],  */
/* pushed over the tabs. Both draw the same ProfileView, so yours shows  */
/* what other people see.                                                */
/*                                                                      */
/* v4: the bar holds the handle and one •••, nothing else (layout spec   */
/* 5.5). Posting is the + tab; the gear and Share profile are rows of    */
/* the •••: Share profile, Settings, Tournaments while the server has    */
/* them, About. Account deletion is still two taps from here (•••,       */
/* Settings, then the row), which is what Apple asks for, and its flow   */
/* in Settings is unchanged.                                             */
/*                                                                      */
/* Tournaments moved here from Home's bar (and Activity's invitations    */
/* still lead to them), so this screen asks the server on focus, as     */
/* Home did: a server without migration 020 answers by switching the    */
/* row off, and pending invitations show as its detail line. The same   */
/* gate draws the Tournaments line under the Dex line (17 Oct 2026:     */
/* the ••• row alone was too hard to find), which says "1 running"      */
/* first, since a tournament on now is the one to look at.              */
/*                                                                      */
/* The list is the Profile tab's scroll source (chromeTab).              */
/* ==================================================================== */

/** "1 invitation", "2 invitations". */
const invitations = (n: number) => `${formatCount(n)} ${n === 1 ? 'invitation' : 'invitations'}`;

/*
 * The Tournaments line's state: what is on before what is asked of you,
 * and nothing at all when neither (the line is then just the word).
 */
const lineDetail = (running: number, pending: number) =>
  running > 0 ? `${formatCount(running)} running` : pending > 0 ? invitations(pending) : undefined;

function OwnProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);
  const profileLoading = useAuth((s) => s.profileLoading);
  const profileError = useAuth((s) => s.profileError);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const tournaments = useTournaments((s) => s.supported);
  const pendingInvites = useTournaments((s) => s.pendingInvites);
  const running = useTournaments((s) => s.running);
  const [fallbackMenu, setFallbackMenu] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (myId) void useTournaments.getState().load();
    }, [myId]),
  );

  const settings: SheetAction = { label: 'Settings', onPress: () => router.push('/settings') };
  const tournamentsRow: SheetAction[] = tournaments
    ? [
        {
          label: 'Tournaments',
          detail: pendingInvites > 0 ? invitations(pendingInvites) : undefined,
          onPress: () => router.push(tournamentsHref()),
        },
      ]
    : [];
  // Signed out there is no profile to draw; checked anyway, as the store's load is.
  const tournamentsLine: TournamentsLine | undefined =
    tournaments && myId
      ? { detail: lineDetail(running, pendingInvites), onOpen: () => router.push(tournamentsHref()) }
      : undefined;

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
          ...tournamentsRow,
          about,
        ]}
        tournaments={tournamentsLine}
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
        actions={[settings, ...tournamentsRow]}
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
