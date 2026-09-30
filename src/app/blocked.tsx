import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { Avatar, Button, Card, Divider, EmptyState, PressableScale, haptic } from '@/components/ui';
import { colors, fonts, space, type as typeScale } from '@/constants/theme';
import { fetchBlocked, unblockUser } from '@/lib/moderation';
import { fetchProfiles } from '@/lib/social';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Blocked accounts                                                     */
/*                                                                      */
/* blockUser, unblockUser and fetchBlocked have existed since migration  */
/* 006; until now only the first had a UI, reachable from a post's "..." */
/* menu. That made blocking a one-way door — you could shut it and never */
/* find the handle again, because a blocked person's posts are exactly   */
/* the thing you can no longer see.                                     */
/*                                                                      */
/* Apple's guideline 1.2 asks for blocking. An App Review that cannot    */
/* find the way back out is a reasonable rejection, and a user who       */
/* mis-taps deserves better than a permanent mistake.                    */
/* ==================================================================== */

/*
 * Sized like the follow rows in PeopleList — 44pt avatar, the 44pt `sm`
 * button — because it is the same kind of list: a person and one action.
 * The full 52pt call-to-action pill made every row 84pt tall against a
 * 40pt avatar. The spoken label names the person, or VoiceOver's rotor
 * lists a column of identical "Unblock" buttons.
 */
function BlockedRow({
  person,
  onUnblock,
  busy,
}: {
  person: UserProfile;
  onUnblock: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.row}>
      <Avatar
        name={person.displayName}
        accent={person.accent}
        size={44}
        avatarPath={person.avatarPath}
      />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{person.username}
        </Text>
      </View>
      <Button
        label="Unblock"
        variant="secondary"
        size="sm"
        loading={busy}
        onPress={onUnblock}
        accessibilityLabel={`Unblock ${person.displayName}`}
      />
    </View>
  );
}

export default function BlockedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  const [people, setPeople] = useState<UserProfile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  /*
   * Every setState here is inside a promise callback, never in the body.
   * `react-hooks/set-state-in-effect` rejects a synchronous one under the
   * React Compiler, and it is right to: clearing the error flag up front
   * would render twice before the request had even been made.
   */
  const load = useCallback(() => {
    if (!myId) return;
    fetchBlocked(myId)
      .then((ids) => (ids.length ? fetchProfiles(ids) : {}))
      .then((byId) => {
        setPeople(Object.values(byId));
        setFailed(false);
      })
      .catch(() => {
        /*
         * Surfaced, not swallowed. An empty list and a failed fetch look
         * identical on screen, and telling someone they have blocked
         * nobody when the request failed is the kind of quiet lie that
         * makes people distrust a block button.
         */
        setPeople([]);
        setFailed(true);
      });
  }, [myId]);

  useEffect(load, [load]);

  /* Retry runs from a tap, so resetting to the spinner here is allowed. */
  const retry = useCallback(() => {
    setPeople(null);
    setFailed(false);
    load();
  }, [load]);

  const confirmUnblock = useCallback(
    (person: UserProfile) => {
      Alert.alert(
        `Unblock @${person.username}?`,
        'They will be able to see your posts and follow you again. Following is not restored — blocking dropped it in both directions.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: () => {
              if (!myId) return;
              haptic.tap();
              setWorking(person.id);
              unblockUser(myId, person.id)
                .then(() => setPeople((prev) => (prev ?? []).filter((p) => p.id !== person.id)))
                .catch(() => Alert.alert('Could not unblock', 'Check your connection and try again.'))
                .finally(() => setWorking(null));
            },
          },
        ],
      );
    },
    [myId],
  );

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
        <Text style={styles.title} accessibilityRole="header">Blocked accounts</Text>
      </View>

      {people === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.wine} />
        </View>
      ) : failed ? (
        <EmptyState
          icon="close"
          title="Could not load your blocks"
          body="The list could not be fetched. This is not the same as having blocked nobody."
          action={{ label: 'Try again', onPress: retry }}
        />
      ) : people.length === 0 ? (
        <EmptyState
          icon="eyeOff"
          title="Nobody is blocked"
          body="You can block someone from the menu on any of their posts. They will not be told."
        />
      ) : (
        <Card style={styles.block}>
          {people.map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <BlockedRow
                person={p}
                busy={working === p.id}
                onUnblock={() => confirmUnblock(p)}
              />
            </View>
          ))}
        </Card>
      )}
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

  loading: { paddingVertical: space.xxxl, alignItems: 'center' },
  block: { padding: 0 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 56,
  },
  rowText: { flex: 1 },
  name: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  handle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
});
