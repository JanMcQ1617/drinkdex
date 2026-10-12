import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Avatar, ListGroup, ListRow, SectionHeader } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import type { ProfileRow } from '@/lib/database.types';
import { hasFacebookIdentity } from '@/lib/facebook';
import { FACEBOOK_SIGN_IN_ENABLED, useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useCustomDrinks } from '@/store/customDrinks';
import { useSocial } from '@/store/social';

/* ==================================================================== */
/* Settings                                                             */
/*                                                                      */
/* Built on Instagram's settings model, which is worth copying for one   */
/* reason: it scales. Its shape is a single scroll of SECTIONS, each a   */
/* short list of icon + label + chevron rows, ordered so that the things */
/* that change what other people see sit above the things that only      */
/* change your own app, and the irreversible ones sit last under their   */
/* own heading.                                                          */
/*                                                                      */
/* Three things are deliberately NOT copied.                            */
/*                                                                      */
/* No search field. Instagram has one because it has sixty-odd rows      */
/* across nine groups and nobody can find "Hidden Words" by scanning.    */
/* This screen has eleven. A search box over eleven rows is furniture    */
/* that says "this is complicated" about something that is not.          */
/*                                                                      */
/* No drill-down for its own sake. Instagram pushes almost every row to  */
/* a sub-screen; most of ours would be a sub-screen holding one switch.  */
/* A row pushes only when a real screen is behind it: your profile,      */
/* Saved, Activity, Find friends and Blocked accounts.                   */
/*                                                                      */
/* No Accounts Centre row. That exists to span Instagram, Facebook and   */
/* Threads. There is one account here, so the identity row goes straight */
/* to editing it.                                                        */
/*                                                                      */
/* v4 Daylight, less stuff. Every section is a wash group on the page   */
/* with no edge (layout spec principle 3), its heading small and muted  */
/* above it, the groups parted by space. The identity row is the first  */
/* group: your face, name and handle, opening Edit profile. Rows are    */
/* their words and a chevron: the glyphs and the one-line explanations  */
/* went, except on the three account rows, where the line says what is  */
/* kept or lost before the confirm does. Those three are destructive    */
/* rows (ink SemiBold, underlined; no red), each followed by the        */
/* system's confirm, and their flows are exactly v3.3's.                */
/* ==================================================================== */

const SUPPORT_URL = 'https://janmcq1617.github.io/drinkdex/support';
const PRIVACY_URL = 'https://janmcq1617.github.io/drinkdex/privacy';
const TERMS_URL = 'https://janmcq1617.github.io/drinkdex/terms';

/*
 * What deleting an account removes, said in the confirm before it happens.
 * One sentence that covers every kind of thing the account can hold: the
 * profile, posts and their photos, reels, the drinks you added (the
 * suggestions sent with them go too), likes, saves and follows, and the
 * collection on this phone. A list that left one out would read as a
 * promise that it stays. The Apple sentence warns of the second sheet
 * (lib/appleRevoke), so it does not read as a fault.
 */
const DELETE_CONFIRM =
  'This removes your profile, every post, every photo and reel you uploaded, the drinks you added, your likes, saves and follows, and resets the collection on this phone. It cannot be undone. If you use Sign in with Apple, Apple asks you to confirm next, so Sipply comes off your Apple Account too.';

/*
 * A section: its heading, then its rows in one wash group. The heading is
 * the group size (13pt SemiBold, muted), inset 16pt so it starts where the
 * rows' words do. Rows are passed straight in, so the group can tell the
 * last one to drop its separator.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SectionHeader title={title} size="group" style={styles.sectionHeader} />
      <ListGroup>{children}</ListGroup>
    </>
  );
}

/** The identity row's face: the likers sheet's 44. */
const MEMBER_AVATAR = 44;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scrolled, onScroll] = useScrolledPast();

  const profile = useAuth((s) => s.profile);
  const facebookShown = useAuth(
    (s) => FACEBOOK_SIGN_IN_ENABLED || hasFacebookIdentity(s.session?.user),
  );
  const signOut = useAuth((s) => s.signOut);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const resetAll = useCollection((s) => s.resetAll);
  /*
   * The drinks you added keep their own pours and photos, beside the
   * collection's (store/customDrinks). Each reset below clears both, or a
   * reset collection would still show the pours of every drink you added.
   */
  const clearCustomPours = useCustomDrinks((s) => s.clearPours);
  const resetCustomDrinks = useCustomDrinks((s) => s.resetAll);
  const resetSocial = useSocial((s) => s.reset);

  /* Which account action is running, if any. Set from the confirm's tap. */
  const [pending, setPending] = useState<'signout' | 'delete' | null>(null);

  /*
   * The in-app browser sheet, as the sign-in screen opens these same
   * documents: the page slides up over Settings and Done comes back here.
   * Linking.openURL threw the user out to Safari. It also blamed the
   * connection when it failed, which is not why a URL fails to open.
   */
  const open = useCallback((url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() =>
      Alert.alert('Could not open the page', 'Try again in a moment.'),
    );
  }, []);

  /*
   * Out of Settings once the account is gone. This screen is an ungated
   * stack screen, so after sign-out or deletion it stayed up for an
   * account that no longer existed — Find friends pushed an empty page,
   * Blocked accounts spun forever, and Delete could be tapped again with
   * no session. Popping to the tabs lands on the sign-in form. Done from
   * the handlers rather than a <Redirect> on the session, which would
   * race them and could push a second copy of the tabs instead of popping.
   */
  const leave = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
  }, [router]);

  /* Back to the profile, which opens it; with nothing under it, to the profile anyway. */
  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }, [router]);

  /*
   * The drinks you added stay, uncollected, just as catalogue entries stay
   * locked: a reset forgets what you had, not what exists. So the copy is
   * the same as before they existed. "The photos in your Dex", not "the
   * photos you logged": posting is the verb now (v3.1 §12), and these are
   * the Dex's own copies, not the posts, which stay.
   */
  const confirmReset = useCallback(() => {
    Alert.alert(
      'Reset collection',
      'Every entry goes back to locked, and the photos in your Dex are forgotten. Your posts and account stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetAll();
            clearCustomPours();
          },
        },
      ],
    );
  }, [resetAll, clearCustomPours]);

  const confirmSignOut = useCallback(() => {
    if (pending) return;
    Alert.alert('Sign out', 'Your collection stays on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setPending('signout');
          void signOut().finally(() => {
            resetSocial();
            setPending(null);
            leave();
          });
        },
      },
    ]);
  }, [pending, signOut, resetSocial, leave]);

  /*
   * The confirmation lists everything that goes, the collection on this
   * phone included (DELETE_CONFIRM). Sign out keeps the collection and says
   * so in the row above, so leaving it out here read as a promise that
   * deletion kept it too. It does not: both resets run on success,
   * deliberately, so a deleted account leaves a clean slate rather than a
   * Dex of photos the server no longer has. The drinks you added go
   * entirely, entries and their photos on this phone with them: the
   * suggestions they were sent as are deleted with the account, so a
   * drink left behind would be one nobody can sync or delete again. Only
   * on success: a failed delete must not leave a wiped phone and a live
   * account.
   *
   * A failure is said out loud. deleteAccount writes it to the store's
   * `error`, which only the sign-in form renders, and that form is not
   * mounted while anyone is signed in — so a dropped connection used to
   * close the alert and change nothing on screen. The message is read and
   * cleared here, so it does not surface later on the sign-in form either.
   * No "nothing was deleted": a response lost after the server committed
   * would make that false.
   */
  const confirmDelete = useCallback(() => {
    if (pending) return;
    Alert.alert(
      'Delete account',
      DELETE_CONFIRM,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            setPending('delete');
            void deleteAccount()
              .then((ok) => {
                if (ok) {
                  resetAll();
                  resetCustomDrinks();
                  resetSocial();
                  leave();
                  Alert.alert(
                    'Account deleted',
                    'Your profile, posts and photos have been removed from Sipply.',
                  );
                  return;
                }
                // Titled like the confirm it answers: the store's messages
                // already open with "Could not delete your account".
                const { error, clearError } = useAuth.getState();
                clearError();
                Alert.alert(
                  'Delete account',
                  error ?? 'Could not delete your account. Check your connection and try again.',
                );
              })
              .finally(() => setPending(null));
          },
        },
      ],
    );
  }, [pending, deleteAccount, resetAll, resetCustomDrinks, resetSocial, leave]);

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber ?? '';

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Settings"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {/* ---- Identity: Instagram's Accounts Centre slot, straight to editing it. ---- */}
        {profile ? <IdentityRow profile={profile} /> : null}

        {/*
          ---- What you keep and what came of it ----
          Straight after the identity row: the two things about your own
          account people come back for. Saved has no other door, and the
          bell on Home is Activity's only other one.
        */}
        <Section title="Your activity">
          <ListRow title="Saved" trailing="chevron" onPress={() => router.push('/saved')} />
          <ListRow title="Activity" trailing="chevron" onPress={() => router.push('/activity')} />
        </Section>

        {/*
          ---- How people find you ----
          The spoken hint lists what the screen behind it holds, in its
          order. Facebook only when the Facebook section there has something
          to draw, by its own rule: the account already has Facebook, or
          Facebook sign-in is switched on and it can be connected.
        */}
        <Section title="How people find you">
          <ListRow
            title="Find friends"
            trailing="chevron"
            onPress={() => router.push('/find-friends')}
            accessibilityHint={
              facebookShown
                ? 'Facebook, contacts, invites, search and Instagram'
                : 'Contacts, invites, search and Instagram'
            }
          />
        </Section>

        {/* ---- Who you have shut out ---- */}
        <Section title="Who can reach you">
          <ListRow title="Blocked accounts" trailing="chevron" onPress={() => router.push('/blocked')} />
        </Section>

        {/* ---- Instagram's "Help" and "About", merged. ---- */}
        <Section title="About">
          <ListRow title="Help and support" trailing="chevron" onPress={() => open(SUPPORT_URL)} />
          <ListRow title="Privacy Policy" trailing="chevron" onPress={() => open(PRIVACY_URL)} />
          <ListRow title="Terms of Use" trailing="chevron" onPress={() => open(TERMS_URL)} />
        </Section>

        {/*
          Instagram parks Log Out at the very bottom under its own "Login"
          heading, far from anything routine. The three irreversible actions
          get the same treatment, ordered by how much they destroy, drawn
          destructive (ink SemiBold, underlined) with no chevron: they act
          rather than navigate. Each keeps its one line, which says what is
          kept and what goes before the confirm does.

          `busy` is the row whose action is running: a spinner in the
          leading slot, and the row stops taking taps so a second confirm
          cannot start a second run. `disabled` is every other account row
          meanwhile, dimmed the way a disabled Button is.
        */}
        <Section title="Account">
          <ListRow
            title="Reset collection"
            subtitle="Locks every entry again. Posts and account stay."
            onPress={confirmReset}
            destructive
            disabled={pending !== null}
          />
          <ListRow
            title="Sign out"
            subtitle={pending === 'signout' ? 'Signing out…' : 'Your collection stays on this phone.'}
            onPress={confirmSignOut}
            destructive
            busy={pending === 'signout'}
            disabled={pending === 'delete'}
          />
          <ListRow
            title="Delete account"
            subtitle={
              pending === 'delete'
                ? 'Deleting your account…'
                : 'Profile, posts, photos, follows and this phone’s collection. Permanent.'
            }
            onPress={confirmDelete}
            destructive
            busy={pending === 'delete'}
            disabled={pending === 'signout'}
          />
        </Section>

        {/*
          Version last, unemphasised. It is here because it is the first
          thing a bug report needs and the last thing anyone browsing wants.
        */}
        <Text style={styles.version}>
          Sipply {version}
          {build ? ` (${build})` : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * You, at the top: your face, your name and handle, in a group of one
 * that opens Edit profile. The Dex tally and rank it carried in v3 live on
 * Dex progress now (Profile › "38 drinks in your Dex").
 */
function IdentityRow({ profile }: { profile: ProfileRow }) {
  const router = useRouter();
  return (
    <ListGroup style={styles.identity}>
      <ListRow
        title={profile.display_name}
        subtitle={`@${profile.username}`}
        emphasis
        leading={{
          node: (
            <Avatar
              name={profile.display_name}
              accent={profile.accent}
              size={MEMBER_AVATAR}
              avatarPath={profile.avatar_path}
            />
          ),
        }}
        trailing="chevron"
        onPress={() => router.push('/edit-profile')}
        accessibilityLabel={`${profile.display_name}, @${profile.username}`}
        accessibilityHint="Edits your profile"
      />
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: space.sm },

  identity: { marginBottom: space.sm },
  // 24 above each heading (layout.group), 8 between it and its group.
  sectionHeader: { marginTop: layout.group, marginBottom: space.sm },

  version: {
    ...textRole.small,
    /*
     * textMuted, not textFaint. This is caption-sized, which WCAG holds to
     * 4.5:1, and textFaint is for large type and glyphs only (3.45:1 on
     * the page). Quiet is a job for size and placement, not a licence to
     * make the text unreadable. 6.69:1 here.
     */
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.xxl,
  },
});
