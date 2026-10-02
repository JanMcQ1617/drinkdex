import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Avatar, Button, EmptyState, Hold, ListGroup, ListRow, announce } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
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
 * A list row like every other list of people: 40pt avatar, the name and
 * handle, and one action at the end, the 36pt `sm` button, which keeps the
 * row at 64 rather than stretching it to a call to action's height. A
 * static row, so VoiceOver reads the person and then reaches the button
 * on its own. The button's spoken label names the person, or VoiceOver's
 * rotor lists a column of identical "Unblock" buttons.
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
    <ListRow
      title={person.displayName}
      subtitle={`@${person.username}`}
      emphasis
      leading={{
        node: (
          <Avatar
            name={person.displayName}
            accent={person.accent}
            size={40}
            avatarPath={person.avatarPath}
          />
        ),
      }}
      trailing={{
        node: (
          <Button
            label="Unblock"
            variant="secondary"
            size="sm"
            loading={busy}
            onPress={onUnblock}
            accessibilityLabel={`Unblock ${person.displayName}`}
          />
        ),
      }}
    />
  );
}

export default function BlockedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const [scrolled, onScroll] = useScrolledPast();

  /* Back to Settings, which opens it; with nothing under it, to Settings anyway. */
  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }, [router]);

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
         *
         * Spoken as well: the spinner giving way to the message is a
         * silent swap to VoiceOver, and a failed Try again would otherwise
         * sound exactly like nothing happening.
         */
        setPeople([]);
        setFailed(true);
        announce('Could not load your blocks.');
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
    <View style={styles.screen}>
      <ScreenTopBar
        title="Blocked accounts"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxxl },
        ]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {people === null ? (
          /*
            Not a bare spinner: a wait that runs long says what it is
            waiting for, so it cannot be mistaken for an empty list.
          */
          <Hold fill={false} slowMessage="Still loading your blocked accounts." />
        ) : failed ? (
          <EmptyState
            icon="alert"
            title="Could not load your blocks"
            body="Check your connection and try again. A list that did not load is not the same as having blocked nobody."
            action={{ label: 'Try again', onPress: retry }}
            actionVariant="secondary"
          />
        ) : people.length === 0 ? (
          <EmptyState
            icon="eyeOff"
            title="Nobody is blocked"
            body="You can block someone from the menu on their profile or on any of their posts. They will not be told."
          />
        ) : (
          <ListGroup>
            {people.map((p) => (
              <BlockedRow
                key={p.id}
                person={p}
                busy={working === p.id}
                onUnblock={() => confirmUnblock(p)}
              />
            ))}
          </ListGroup>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: space.sm },
});
