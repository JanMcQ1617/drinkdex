import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { Avatar, Card, PressableScale, SectionLabel, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { useAuth } from '@/store/auth';
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
/* This screen has eleven. A search box over eleven rows is furniture    */
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

function Row({
  icon,
  label,
  detail,
  onPress,
  danger,
  last,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
  /** Suppresses the chevron on rows that act rather than navigate. */
  last?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      noHaptic
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      style={styles.row}>
      <Icon name={icon} size={19} color={danger ? colors.danger : colors.textMuted} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {danger || last ? null : (
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      )}
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
  const signOut = useAuth((s) => s.signOut);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const resetAll = useCollection((s) => s.resetAll);
  const resetSocial = useSocial((s) => s.reset);

  const open = useCallback((url: string) => {
    haptic.tap();
    void Linking.openURL(url).catch(() =>
      Alert.alert('Could not open the link', 'Check your connection and try again.'),
    );
  }, []);

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
    Alert.alert('Sign out', 'Your collection stays on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void signOut().finally(resetSocial),
      },
    ]);
  }, [signOut, resetSocial]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Delete account',
      'This removes your profile, every post, every photo you uploaded, your likes and your follows. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            void deleteAccount().then((ok) => {
              if (ok) {
                resetAll();
                resetSocial();
              }
            });
          },
        },
      ],
    );
  }, [deleteAccount, resetAll, resetSocial]);

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
        <Text style={styles.title}>Settings</Text>
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

      {/* ---- How people find you ---- */}
      <Section title="How people find you">
        <Row
          icon="users"
          label="Find friends"
          detail="Instagram, contacts, username search and invites."
          onPress={() => {
            haptic.tap();
            router.push('/find-friends');
          }}
        />
      </Section>

      {/* ---- Who you have shut out ---- */}
      <Section title="Who can reach you">
        <Row
          icon="lock"
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
          detail="One person reads this address."
          onPress={() => open(SUPPORT_URL)}
        />
        <View style={styles.divider} />
        <Row
          icon="eye"
          label="Privacy Policy"
          onPress={() => open(PRIVACY_URL)}
        />
        <View style={styles.divider} />
        <Row icon="bookmark" label="Terms of Use" onPress={() => open(TERMS_URL)} />
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
        />
        <View style={styles.divider} />
        <Row
          icon="profile"
          label="Sign out"
          detail="Your collection stays on this phone."
          onPress={confirmSignOut}
          danger
        />
        <View style={styles.divider} />
        <Row
          icon="close"
          label="Delete account"
          detail="Profile, posts, photos and follows. Permanent."
          onPress={confirmDelete}
          danger
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
     * 4.5:1, and textFaint measures 2.84:1 on the page — the same failure
     * the Dex chip counts had. Quiet is a job for size and placement; it
     * is not a licence to make the text unreadable. 5.50:1 here.
     */
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.xxl,
  },
});
