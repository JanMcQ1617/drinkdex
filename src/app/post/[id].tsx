import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { PostCard } from '@/components/PostCard';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { EmptyState, Hold } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { fetchPost, fetchProfiles, toProfile } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post } from '@/types';

/* ==================================================================== */
/* One post                                                             */
/*                                                                      */
/* Where a profile grid tile, a saved post, an Activity row and the     */
/* pours viewer's "View post" all land: one PostCard on its own screen. */
/* Pushed over the tabs, so Back returns to whichever of those opened   */
/* it.                                                                  */
/*                                                                      */
/* "Unavailable" is one state for three causes the screen cannot tell   */
/* apart and should not try to: the post was deleted, you are blocked   */
/* with its author either way, or its drink has left the Dex. A failed  */
/* request is a different state, with Try again.                        */
/* ==================================================================== */

/**
 * A post id is a UUID. Checked here before anything is asked of the
 * server, so a mangled link is "unavailable" at once rather than an
 * error. (Its own pattern, rather than the profile's: this screen does
 * not depend on the profile's files.)
 */
const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function PostScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // Ids are lowercase everywhere they are stored, and a link may not be.
  const id = String(params.id ?? '').toLowerCase();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /*
   * Back is the stack's back. Opened with nothing under it there is no
   * back, so it goes to the Dex, which works signed in or out.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <PostBody key={`${myId}:${id}`} myId={myId} id={id} onBack={leave} />;
}

type Loaded = { status: 'ready'; post: Post } | { status: 'missing' } | { status: 'failed' };

/**
 * The post, and its author's profile when the social store does not hold
 * it yet (a saved post from someone you do not follow). The profile is a
 * nicety: if it will not load, the card still shows the post, under
 * "someone", rather than failing the screen.
 */
async function loadPost(id: string, myId: string): Promise<Post | null> {
  const gen = useSocial.getState().gen;
  const post = await fetchPost(id, myId);
  if (post && !useSocial.getState().profiles[post.authorId]) {
    const people = await fetchProfiles([post.authorId]).catch(() => ({}));
    if (useSocial.getState().gen === gen) {
      useSocial.setState((s) => ({ profiles: { ...s.profiles, ...people } }));
    }
  }
  return post;
}

function PostBody({ myId, id, onBack }: { myId: string; id: string; onBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profiles = useSocial((s) => s.profiles);
  const ownRow = useAuth((s) => s.profile);
  const dropAuthor = useSocial((s) => s.dropAuthor);
  const [scrolled, onScroll] = useScrolledPast();

  const valid = POST_ID.test(id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    loadPost(id, myId).then(
      (post) => {
        if (alive) setLoaded(post ? { status: 'ready', post } : { status: 'missing' });
      },
      () => {
        if (alive) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, myId, valid, attempt]);

  const status = valid ? (loaded?.status ?? 'loading') : 'missing';

  const retry = () => {
    setLoaded(null);
    setAttempt((a) => a + 1);
  };

  const openDrink = useCallback(
    (drinkId: string) => router.push({ pathname: '/drink/[id]', params: { id: drinkId } }),
    [router],
  );

  /*
   * Your own name is the Profile tab, where Edit profile is; anyone else
   * is their own screen, pushed on top of this one.
   */
  const openAuthor = useCallback(
    (authorId: string) => {
      if (authorId === myId) router.navigate('/profile');
      else router.push({ pathname: '/user/[id]', params: { id: authorId } });
    },
    [myId, router],
  );

  // A block takes them off every list the store holds, then this screen goes too.
  const onBlocked = useCallback(
    (authorId: string) => {
      dropAuthor(authorId);
      onBack();
    },
    [dropAuthor, onBack],
  );

  const post = loaded?.status === 'ready' ? loaded.post : null;
  const author = post
    ? (profiles[post.authorId] ??
      (post.authorId === myId && ownRow?.id === myId ? toProfile(ownRow) : undefined))
    : undefined;

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Post"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
      />
      {status === 'loading' ? (
        <Hold slowMessage="Still loading this post." />
      ) : status === 'failed' ? (
        <EmptyState
          icon="alert"
          title="Could not load this post"
          body="Check your connection and try again."
          actionVariant="secondary"
          action={{ label: 'Try again', onPress: retry }}
        />
      ) : status === 'missing' || !post ? (
        <EmptyState
          icon="camera"
          title="Post unavailable"
          body="This post was removed or isn't available."
          actionVariant="secondary"
          action={{ label: 'Back', onPress: onBack }}
        />
      ) : (
        <ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
          <PostCard
            post={post}
            author={author}
            onOpenDrink={openDrink}
            onOpenAuthor={openAuthor}
            onBlocked={onBlocked}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
});
