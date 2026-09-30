import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { Avatar, Card, PressableScale, SectionLabel, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { hasFacebookIdentity } from '@/lib/facebook';
import { FACEBOOK_SIGN_IN_ENABLED, useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
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
/* This screen has nine. A search box over nine rows is furniture        */
/* that says "this is complicated" about something that is not.          */
/*                                                                      */
/* No drill-down for its own sake. Instagram pushes almost every row to  */
/* a sub-screen; most of ours would be a sub-screen holding one switch.  */
/* Only "Find friends" and "Blocked accounts" push, because those two    */
/* genuinely have a screen behind them.                                  */
/*                                                                      */
/* No Accounts Centre row. That exists to span Instagram, Facebook and   */
/* Threads. There is one account here, so the identity row goes straight */
/* to editing it.                                                        */
/* ==================================================================== */

const SUPPORT_URL = 'https://janmcq1617.github.io/drinkdex/support';
const PRIVACY_URL = 'https://janmcq1617.github.io/drinkdex/privacy';
const TERMS_URL = 'https://janmcq1617.github.io/drinkdex/terms';

/*
 * `busy` is the row whose action is running: a spinner in the icon slot,
 * and the row stops taking taps so a second confirm cannot start a second
 * run. `disabled` is every other account row meanwhile, dimmed the way a
 * disabled Button is. Danger rows act rather than navigate, so they carry
 * no chevron.
 */
function Row({
  icon,
  label,
  detail,
  onPress,
  danger,
  busy,
  disabled,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const inert = !!busy || !!disabled;
  const tint = danger ? colors.danger : colors.textMuted;
  return (
    <PressableScale
      onPress={inert ? undefined : onPress}
      disabled={inert}
      noHaptic
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ disabled: inert, busy: !!busy }}
      style={[styles.row, disabled && !busy && styles.rowDisabled]}>
      {busy ? (
        <ActivityIndicator size="small" color={tint} style={styles.rowSpinner} />
      ) : (
        <Icon name={icon} size={19} color={tint} />
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {danger ? null : <Icon name="chevronRight" size={16} color={colors.textFaint} />}
    </PressableScale>
  );
}

/** Section heading + its card. Keeps the rhythm identical across groups. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SectionLabel style={styles.sectionLabel}>{title}</SectionLabel>
      <Card style={styles.block}>{children}</Card>
    </>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const profile = useAuth((s) => s.profile);
  const facebookShown = useAuth(
    (s) => FACEBOOK_SIGN_IN_ENABLED || hasFacebookIdentity(s.session?.user),
  );
  const signOut = useAuth((s) => s.signOut);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const resetAll = useCollection((s) => s.resetAll);
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
    haptic.tap();
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

  const confirmReset = useCallback(() => {
    Alert.alert(
      'Reset collection',
      'Every entry goes back to locked, and the photos you logged are forgotten. Your posts and account stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => resetAll() },
      ],
    );
  }, [resetAll]);

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
   * phone included. Sign out keeps the collection and says so in the row
   * above, so leaving it out here read as a promise that deletion kept it
   * too. It does not: resetAll() runs on success, deliberately, so a
   * deleted account leaves a clean slate rather than a Dex of photos the
   * server no longer has. Only on success — a failed delete must not
   * leave a wiped phone and a live account.
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
      'This removes your profile, every post, every photo you uploaded, your likes and your follows, and resets the collection on this phone. It cannot be undone.',
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
  }, [pending, deleteAccount, resetAll, resetSocial, leave]);

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber ?? '';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <PressableScale
          onPress={() => router.back()}
          noHaptic
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </PressableScale>
        <Text style={styles.title} accessibilityRole="header">Settings</Text>
      </View>

      {/* ---- Identity. Instagram's Accounts Centre slot. ---- */}
      {profile ? (
        <PressableScale
          onPress={() => {
            haptic.tap();
            router.push('/edit-profile');
          }}
          noHaptic
          accessibilityRole="button"
          accessibilityLabel="Edit your profile"
          style={styles.identity}>
          <Avatar
            name={profile.display_name}
            accent={profile.accent}
            size={54}
            ring
            avatarPath={profile.avatar_path}
          />
          <View style={styles.identityText}>
            <Text style={styles.identityName} numberOfLines={1}>
              {profile.display_name}
            </Text>
            <Text style={styles.identityHandle} numberOfLines={1}>
              @{profile.username}
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textFaint} />
        </PressableScale>
      ) : null}

      {/*
        ---- How people find you ----
        The detail lists what the screen behind it holds, in its order.
        Facebook only when the Facebook card there has something to draw,
        by the card's own rule: the account already has Facebook, or
        Facebook sign-in is switched on and it can be connected. Otherwise
        the card draws nothing, and naming it here would promise a row
        that is not there.
      */}
      <Section title="How people find you">
        <Row
          icon="users"
          label="Find friends"
          detail={
            facebookShown
              ? 'Facebook, contacts, invites, search and Instagram.'
              : 'Contacts, invites, search and Instagram.'
          }
          onPress={() => {
            haptic.tap();
            router.push('/find-friends');
          }}
        />
      </Section>

      {/* ---- Who you have shut out ---- */}
      <Section title="Who can reach you">
        {/*
          eyeOff, not lock: the lock is the Dex's "not collected yet", and
          blocking is two people hidden from each other.
        */}
        <Row
          icon="eyeOff"
          label="Blocked accounts"
          detail="See who you have blocked, and undo it."
          onPress={() => {
            haptic.tap();
            router.push('/blocked');
          }}
        />
      </Section>

      {/* ---- Instagram's "Help" and "About", merged. ---- */}
      <Section title="About">
        <Row
          icon="comment"
          label="Help and support"
          detail="Answers, and an email one person reads."
          onPress={() => open(SUPPORT_URL)}
        />
        <View style={styles.divider} />
        <Row
          icon="eye"
          label="Privacy Policy"
          onPress={() => open(PRIVACY_URL)}
        />
        <View style={styles.divider} />
        {/* The page, not the bookmark: the bookmark is "save a post" on every card in the feed. */}
        <Row icon="document" label="Terms of Use" onPress={() => open(TERMS_URL)} />
      </Section>

      {/*
        Instagram parks Log Out at the very bottom under its own "Login"
        heading, far from anything routine. The three irreversible actions
        get the same treatment, ordered by how much they destroy.
      */}
      <Section title="Account">
        <Row
          icon="flame"
          label="Reset collection"
          detail="Locks every entry again. Posts and account stay."
          onPress={confirmReset}
          danger
          disabled={pending !== null}
        />
        <View style={styles.divider} />
        <Row
          icon="profile"
          label="Sign out"
          detail={pending === 'signout' ? 'Signing out…' : 'Your collection stays on this phone.'}
          onPress={confirmSignOut}
          danger
          busy={pending === 'signout'}
          disabled={pending === 'delete'}
        />
        <View style={styles.divider} />
        <Row
          icon="close"
          label="Delete account"
          detail={
            pending === 'delete'
              ? 'Deleting your account…'
              : 'Profile, posts, photos, follows and this phone’s collection. Permanent.'
          }
          onPress={confirmDelete}
          danger
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.lg },
  back: { padding: space.xs },
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
  },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  identityText: { flex: 1 },
  identityName: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.bodyLg.fontSize,
    color: colors.text,
  },
  identityHandle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },

  sectionLabel: { marginTop: space.xxl, marginBottom: space.md },
  block: { padding: 0 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    /* 56 clears the 44pt floor with room for the two-line rows. */
    minHeight: 56,
  },
  rowDisabled: { opacity: 0.42 },
  /* Same footprint as the 19pt glyph it stands in for, so the label does not shift. */
  rowSpinner: { width: 19, height: 19 },
  rowText: { flex: 1 },
  rowLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  rowLabelDanger: { color: colors.danger },
  rowDetail: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: 1,
  },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginHorizontal: space.lg },

  version: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    /*
     * textMuted, not textFaint. This is caption-sized, which WCAG holds to
     * 4.5:1, and textFaint measures 3.51:1 on the page: enough for large
     * type and glyphs, which is its job, and short of what a caption needs.
     * Quiet is a job for size and placement; it is not a licence to make
     * the text unreadable. 5.50:1 here.
     */
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.xxl,
  },
});
