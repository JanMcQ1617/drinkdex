import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { Grain } from '@/components/Grain';
import { PersonRow } from '@/components/PeopleList';
import { ScreenTopBar, TopBarTextButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Button, EmptyState, Hold } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { fetchPostLikers, likersSupported, type LikersCursor, type PostLiker } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';

/* ==================================================================== */
/* Who liked a post                                                     */
/*                                                                      */
/* The list behind a card's "Liked by" line (migration 021): everyone   */
/* who liked it, newest first, fifty at a time, each with their Follow. */
/* A page sheet, presented and slid away by UIKit, so the feed stays    */
/* exactly where it was underneath and Reduce Motion is UIKit's to      */
/* honour.                                                              */
/* ==================================================================== */

/**
 * Where the list stands. `more` is the next page's own state, so a page
 * that fails past the first leaves the people already shown in place.
 */
type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unsupported' }
  | { status: 'ready'; people: PostLiker[]; next: LikersCursor | null; more: 'idle' | 'loading' | 'failed' };

export function LikersSheet({
  postId,
  visible,
  onClose,
}: {
  postId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  /*
   * The person tapped, opened once the sheet has gone: a screen pushed
   * while the sheet is still up lands underneath it. PourTonightSheet's
   * pattern.
   */
  const pending = useRef<string | null>(null);

  const go = (id: string) => {
    // Your own name is the Profile tab, where Edit profile is, as on Home.
    if (id === myId) router.navigate('/profile');
    else router.navigate({ pathname: '/user/[id]', params: { id } });
  };

  const openPerson = (id: string) => {
    pending.current = id;
    onClose();
    // Only iOS reports the sheet's dismissal; elsewhere open the profile straight away.
    if (Platform.OS !== 'ios') {
      pending.current = null;
      go(id);
    }
  };

  const afterDismiss = () => {
    const id = pending.current;
    pending.current = null;
    if (id) go(id);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={afterDismiss}>
      {/* Keyed by the post, so a card the list hands another post never shows the last one's people. */}
      <Body key={postId} postId={postId} myId={myId} onClose={onClose} onOpen={openPerson} />
    </Modal>
  );
}

/**
 * The sheet's page. The Modal mounts it on every open and drops it once
 * the sheet has gone, so each open asks the server afresh: likes change
 * while a feed sits on screen.
 */
function Body({
  postId,
  myId,
  onClose,
  onOpen,
}: {
  postId: string;
  myId: string | undefined;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const followingSet = useMemo(() => new Set(following), [following]);
  const [scrolled, onScroll] = useScrolledPast();

  // Already known to be missing this session: say so at once rather than hold for an answer.
  const [load, setLoad] = useState<Load>(() =>
    likersSupported() ? { status: 'loading' } : { status: 'unsupported' },
  );
  // Bumped by Try again: the first page is asked for again.
  const [attempt, setAttempt] = useState(0);
  // A page that lands after the sheet has gone is dropped.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let current = true;
    fetchPostLikers(postId).then(
      (page) => {
        if (!current) return;
        setLoad(
          page === 'unsupported'
            ? { status: 'unsupported' }
            : { status: 'ready', people: page.people, next: page.next, more: 'idle' },
        );
      },
      () => {
        if (current) setLoad({ status: 'error' });
      },
    );
    return () => {
      current = false;
      alive.current = false;
    };
  }, [postId, attempt]);

  const retry = () => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  /*
   * The next page, once the list nears its end (or Try again under it).
   * One at a time: onEndReached fires more than once per end. A page is
   * kept only if it still continues from where the list ends, and anyone
   * already listed is skipped, so someone who unliked and liked again
   * while you scrolled is not listed twice.
   *
   * A failed page waits for its Try again (`again`). onEndReached fires
   * afresh whenever the footer changes height, and the footer swaps
   * between the spinner and the failure line, so left to itself a dead
   * connection would be asked again in a loop.
   */
  const loadMore = (again = false) => {
    if (load.status !== 'ready' || !load.next || load.more === 'loading') return;
    if (load.more === 'failed' && !again) return;
    const cursor = load.next;
    setLoad({ ...load, more: 'loading' });
    fetchPostLikers(postId, cursor).then(
      (page) => {
        if (!alive.current) return;
        setLoad((s) => {
          if (s.status !== 'ready' || s.next !== cursor) return s;
          if (page === 'unsupported') return { ...s, next: null, more: 'idle' };
          const seen = new Set(s.people.map((p) => p.id));
          return {
            ...s,
            people: [...s.people, ...page.people.filter((p) => !seen.has(p.id))],
            next: page.next,
            more: 'idle',
          };
        });
      },
      () => {
        if (!alive.current) return;
        setLoad((s) => (s.status === 'ready' && s.next === cursor ? { ...s, more: 'failed' } : s));
      },
    );
  };

  const people = load.status === 'ready' ? load.people : [];

  const empty =
    load.status === 'loading' ? (
      <Hold fill={false} slowMessage="Still loading who liked this." />
    ) : load.status === 'error' ? (
      <EmptyState
        icon="alert"
        title="Could not load likes"
        body="Check your connection and try again."
        action={{ label: 'Try again', onPress: retry }}
        actionVariant="secondary"
      />
    ) : load.status === 'unsupported' ? (
      /*
       * A phone ahead of its server (migration 021 not applied). Cards only
       * open this once the server has named a liker, so it is rare, and it
       * is not a failure: the count on the post is still right.
       */
      <EmptyState
        icon="heart"
        title="Likes will show here soon"
        body="The list of who liked a post is not switched on yet. The count on the post is up to date."
      />
    ) : (
      // Everyone who liked it has since unliked it, or is someone you are blocked with.
      <EmptyState icon="heart" title="No likes yet" body="When someone likes this post, they will show here." />
    );

  const footer =
    load.status !== 'ready' ? null : load.more === 'loading' ? (
      <Hold fill={false} slowMessage="Still loading more likes." />
    ) : load.more === 'failed' ? (
      <View style={styles.footer}>
        <Text style={styles.footerText}>Could not load more likes.</Text>
        <Button label="Try again" variant="secondary" size="sm" onPress={() => loadMore(true)} />
      </View>
    ) : null;

  return (
    <View style={styles.screen}>
      {/* The sheet's own grain, under everything: there is no global grain any more. */}
      <Grain />
      <ScreenTopBar
        title="Likes"
        inset="sheet"
        right={<TopBarTextButton label="Done" onPress={onClose} />}
        showRule={scrolled}
      />
      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        renderItem={({ item, index }) => {
          const self = item.id === myId;
          return (
            <PersonRow
              person={item}
              following={followingSet.has(item.id)}
              onToggle={() => {
                if (myId) void toggleFollow(myId, item.id);
              }}
              // You, in the list: no Follow, and your name opens your own tab.
              hideFollow={self}
              onOpen={onOpen}
              gutter
              separator={index < people.length - 1}
            />
          );
        }}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.5}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={12}
        windowSize={7}
        // Transparent, so the sheet's grain shows under the rows.
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  content: { paddingBottom: space.xxxl },
  footer: {
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },
  footerText: { ...textRole.helper, color: colors.textMuted },
});
