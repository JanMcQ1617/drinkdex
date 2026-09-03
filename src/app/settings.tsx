import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindFriends } from '@/components/FindFriends';
import { Icon, type IconName } from '@/components/icons';
import { Avatar, Card, PressableScale, SectionLabel, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';

/* ==================================================================== */
/* Settings                                                             */
/*                                                                      */
/* A screen, where this used to be an Alert with three destructive       */
/* buttons in it.                                                       */
/*                                                                      */
/* That Alert was the only home for signing out, resetting the           */
/* collection and deleting the account — three irreversible things       */
/* stacked in a list with no room to say what any of them did. An        */
/* action sheet is for confirming a decision already taken, not for      */
/* browsing what is available, and it cannot hold the Instagram and      */
/* contact controls that also belong here.                              */
/*                                                                      */
/* Ordered by how much damage each row can do, gently at the top. The    */
/* three that cannot be undone sit at the bottom under their own         */
/* heading, well away from anything you might tap on the way past.       */
/* ==================================================================== */

function Row({
  icon,
  label,
  detail,
  onPress,
  danger,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
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
      {danger ? null : <Icon name="chevronRight" size={16} color={colors.textFaint} />}
    </PressableScale>
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

      {/* ---- You ---- */}
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
          <Avatar name={profile.display_name} accent={profile.accent} size={54} ring />
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

      {/* ---- Discovery ---- */}
      {/*
        Instagram and contact matching live here rather than on the profile
        tab because they are settings about how findable you are, not
        things to browse. Browsing other people stayed behind on Profile.
      */}
      <SectionLabel style={styles.sectionLabel}>Finding people</SectionLabel>
      <FindFriends />

      {/* ---- The irreversible half ---- */}
      <SectionLabel style={styles.sectionLabel}>Danger zone</SectionLabel>
      <Card style={styles.block}>
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
      </Card>
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
});
