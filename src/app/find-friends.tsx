import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindFriends } from '@/components/FindFriends';
import { PersonRow } from '@/components/PeopleList';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { EmptyState, Hold, ListGroup, SectionHeader } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';

/* ==================================================================== */
/* Find friends                                                         */
/*                                                                      */
/* A screen, not a settings row that expands.                           */
/*                                                                      */
/* FindFriends is a stack of cards — Facebook when it has something to   */
/* show, contacts, being findable, invites, username search and the      */
/* Instagram import — each with a heading and a body paragraph. Expanded */
/* inside a settings group that is itself a card, it nested bordered     */
/* boxes inside a bordered box and pushed "Sign out" screens down.       */
/* Instagram drills down for exactly this reason, and this is the one    */
/* row here with enough behind it to deserve it.                         */
/*                                                                      */
/* The same component is rendered full-width by WelcomeConnect at        */
/* signup, so the thing offered on day one and the thing reachable from  */
/* Settings are one implementation rather than two that drift.           */
/*                                                                      */
/* Under it, everyone on Sipply: the browsing list that used to be your  */
/* profile's Accounts tab. It belongs with the other ways of finding     */
/* people, and the profile's add-person button leads here. Each row      */
/* opens that person's profile, where Report and Block live.             */
/*                                                                      */
/* Up to four text fields live in that stack (the number, the search,    */
/* and the Instagram username and pasted list once opened), so the       */
/* scroll view carries the keyboard props every other input screen here  */
/* does. Without "handled", the first tap on Follow under a search       */
/* result only closed the keyboard; without the inset adjustment, the    */
/* fields near the end sat behind it.                                    */
/* ==================================================================== */

export default function FindFriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scrolled, onScroll] = useScrolledPast();

  const myId = useAuth((s) => s.session?.user.id);
  const people = useSocial((s) => s.people);
  const following = useSocial((s) => s.following);
  const loadingPeople = useSocial((s) => s.loadingPeople);
  const peopleError = useSocial((s) => s.peopleError);
  const loadPeople = useSocial((s) => s.loadPeople);
  const toggleFollow = useSocial((s) => s.toggleFollow);

  // A second query, paid for only by the screen that shows it.
  useEffect(() => {
    if (myId) void loadPeople(myId);
  }, [myId, loadPeople]);

  // Opened cold (a link, a restored state) there is nothing under it to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /*
   * Failure and empty say different things. The empty line used to show
   * when the list failed to load too, so a dropped request read as "you're
   * early". Empty has no button: the invite card is on this same screen.
   */
  const everyone =
    loadingPeople && people.length === 0 ? (
      <Hold fill={false} slowMessage="Still loading accounts." />
    ) : peopleError && people.length === 0 ? (
      <EmptyState
        icon="alert"
        title="Could not load accounts"
        body="Check your connection and try again."
        action={{
          label: 'Try again',
          onPress: () => {
            if (myId) void loadPeople(myId);
          },
        }}
        actionVariant="secondary"
      />
    ) : people.length > 0 ? (
      <ListGroup>
        {people.map((p, i) => (
          <PersonRow
            key={p.id}
            person={p}
            following={following.includes(p.id)}
            onToggle={() => {
              if (myId) void toggleFollow(myId, p.id);
            }}
            gutter
            separator={i < people.length - 1}
          />
        ))}
      </ListGroup>
    ) : (
      <EmptyState
        icon="users"
        title="No one else here yet"
        body="Send a friend an invite from this screen. When they join, you’ll follow each other."
      />
    );

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Find friends"
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={leave} />}
        showRule={scrolled}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        <FindFriends />

        {/* Signed out, FindFriends draws nothing either: there is no one to follow as. */}
        {myId ? (
          <>
            <SectionHeader title="Everyone on Sipply" style={styles.section} />
            {everyone}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter },
  section: { marginTop: space.xl, marginBottom: space.md },
});
