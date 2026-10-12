import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindFriends } from '@/components/FindFriends';
import { PersonRow } from '@/components/PeopleList';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { EmptyState, Hold, SectionHeader } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Find friends                                                         */
/*                                                                      */
/* A screen, not a settings row that expands.                           */
/*                                                                      */
/* FindFriends is a column of sections on the page, parted by space:    */
/* contacts (the one recommended path, the one ink key), Facebook when  */
/* it has something to show, being findable, invites, username search  */
/* and the Instagram import, each a heading, a line and a key. v4 took  */
/* away the cards and the lining panel (layout spec principle 3).       */
/*                                                                      */
/* The same component is rendered full-width by WelcomeConnect at        */
/* signup, so the thing offered on day one and the thing reachable from  */
/* Settings are one implementation rather than two that drift.           */
/*                                                                      */
/* Under it, everyone on Sipply, as rows of people. Each row opens that  */
/* person's profile, where Report and Block live.                       */
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
  // A set, so each row's "do I follow them" is one lookup, not a scan of everyone you follow.
  const followingSet = useMemo(() => new Set(following), [following]);
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
   * early". Empty has no key: the invite section is on this same screen.
   * Only the rows are the list's data; these stand in for them.
   */
  const everyoneState =
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
    ) : people.length === 0 ? (
      <EmptyState
        icon="users"
        title="No one else here yet"
        body="Send a friend an invite from this screen. When they join, you’ll follow each other."
      />
    ) : null;

  /*
   * ONE VIRTUALISED LIST. Everyone on Sipply is up to two hundred rows,
   * each with a face to decode, under a column that is already two screens
   * tall. Mapped into a ScrollView, every row and its picture mounted at
   * once on opening; as the list's data, only the rows near the screen are
   * drawn. FindFriends and the heading ride in the list's header, so the
   * whole page still scrolls as one, its fields included.
   */
  const rows: readonly UserProfile[] = myId ? people : [];

  const renderPerson = ({ item }: { item: UserProfile }) => (
    <PersonRow
      person={item}
      following={followingSet.has(item.id)}
      onToggle={() => {
        if (myId) void toggleFollow(myId, item.id);
      }}
    />
  );

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Find friends"
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={leave} />}
        showRule={scrolled}
      />
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        renderItem={renderPerson}
        // A follow changes no row's data, only its key: repaint the rows on screen for it.
        extraData={followingSet}
        ListHeaderComponent={
          <>
            <FindFriends />
            {/* Signed out, FindFriends draws nothing either: there is no one to follow as. */}
            {myId ? (
              <>
                <SectionHeader title="Everyone on Sipply" style={styles.section} />
                {everyoneState}
              </>
            ) : null}
          </>
        }
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        initialNumToRender={8}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
  // The 32 that parts every section of FindFriends above it (layout.section).
  section: { marginTop: layout.section, marginBottom: space.sm },
});
