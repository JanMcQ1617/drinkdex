import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SheetGrabber } from '@/components/Sheet';
import { Avatar, Button, EmptyState, Hold, SearchField } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { fetchPostLikers, LIKERS_PAGE, likersSupported, type LikersCursor, type PostLiker } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';

/* ==================================================================== */
/* Who liked a post                                                     */
/*                                                                      */
/* The list behind a post's like count (migration 021): everyone who    */
/* liked it, newest first, fifty at a time, each with their Follow. A   */
/* page sheet, presented and slid away by UIKit, so the feed stays      */
/* exactly where it was underneath and Reduce Motion is UIKit's to      */
/* honour.                                                              */
/*                                                                      */
/* LESS STUFF (layout spec 5.4). The grabber, "Liked by", and the       */
/* people: a face, a name, and Follow or Following. Handles, the time,  */
/* the drink's sentence and plate, the guest-list numbers and the       */
/* "People you follow" groups are gone: the count and the drink are on  */
/* the post behind the sheet, and a person's handle is on their         */
/* profile (tap the row). No rules between rows; space separates them.  */
/* The search shows only once more than a page of people liked it,     */
/* where finding one name is the job.                                   */
/*                                                                      */
/* Swipe down to close; VoiceOver's escape closes it too.               */
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

export interface LikersSheetProps {
  postId: string;
  visible: boolean;
  onClose: () => void;
  /** The card's own count (optimistic, so it moves with the heart): whether the search is worth showing. */
  likes: number;
}

export function LikersSheet({ postId, visible, onClose, likes }: LikersSheetProps) {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  /*
   * The person tapped, opened once the sheet has gone: a screen pushed
   * while the sheet is still up lands underneath it.
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
      <Body key={postId} postId={postId} myId={myId} likes={likes} onClose={onClose} onOpen={openPerson} />
    </Modal>
  );
}

/* ==================================================================== */
/* Rows                                                                 */
/* ==================================================================== */

/** The liker's face (layout spec 5.4: 44 in a 64 row). */
const ROW_AVATAR = 44;
/** Follow and Following share one width, so the keys line up down the list (116 x 36). */
const KEY_W = 116;

/**
 * One liker: face, name, and their Follow. Your own row says "(you)" in
 * muted and has no key.
 *
 * The person (face and name) is one button that opens their profile,
 * spoken "Maya Ortiz, following". The Follow beside it stays its own
 * control, so each is reachable on its own. The row never moves when its
 * key is tapped: the list keeps the server's order. Names wrap, never
 * truncate, and the row grows with them.
 */
function LikerRow({
  person,
  self,
  following,
  onToggle,
  onOpen,
}: {
  person: PostLiker;
  self: boolean;
  following: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const spoken = [person.displayName, self ? 'you' : following ? 'following' : null].filter(Boolean).join(', ');

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onOpen(person.id)}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={self ? 'Opens your profile' : 'Opens their profile'}
        style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
        <Avatar name={person.displayName} accent={person.accent} size={ROW_AVATAR} avatarPath={person.avatarPath} />
        <Text style={styles.name}>
          {person.displayName}
          {self ? <Text style={styles.you}> (you)</Text> : null}
        </Text>
      </Pressable>
      {self ? null : (
        /*
         * Follow is the sheet's one ink key (the screen's single obvious
         * action); Following is the wash key, a state rather than a second
         * call.
         */
        <Button
          label={following ? 'Following' : 'Follow'}
          variant={following ? 'secondary' : 'primary'}
          size="sm"
          onPress={onToggle}
          style={styles.key}
          accessibilityLabel={following ? `Unfollow ${person.displayName}` : `Follow ${person.displayName}`}
        />
      )}
    </View>
  );
}

/**
 * A loaded liker matches a search on their name or username, case and
 * accents aside. The combining-mark range is escaped, as in lib/bar and
 * InvitePicker: typed literally it is invisible, and an editor can drop it.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* ==================================================================== */
/* The sheet's page                                                     */
/* ==================================================================== */

/**
 * The sheet's page. The Modal mounts it on every open and drops it once
 * the sheet has gone, so each open asks the server afresh: likes change
 * while a feed sits on screen.
 */
function Body({
  postId,
  myId,
  likes,
  onClose,
  onOpen,
}: {
  postId: string;
  myId: string | undefined;
  likes: number;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const followingSet = useMemo(() => new Set(following), [following]);
  const [query, setQuery] = useState('');

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
   *
   * A search that leaves the list short keeps reaching its end, so it
   * pages on through everyone, fifty at a time: the search only ever
   * reads the people loaded, and this is how it gets to read them all.
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
  // More than one page of people: then finding a name is worth a field (layout spec 5.4).
  const searchable = people.length > 0 && (likes > LIKERS_PAGE || people.length > LIKERS_PAGE);
  const needle = searchable ? fold(query.trim().replace(/^@/, '')) : '';
  const shown = needle
    ? people.filter((p) => fold(p.displayName).includes(needle) || fold(p.username).includes(needle))
    : people;

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
    ) : people.length > 0 ? (
      // A search that matches nobody loaded; more may still be on its way (the footer says so).
      <Text style={styles.noMatch}>
        {load.next ? 'No one by that name in the likes loaded so far.' : 'No one by that name liked this.'}
      </Text>
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
    <View style={styles.screen} onAccessibilityEscape={onClose}>
      <SheetGrabber />
      <Text accessibilityRole="header" style={styles.title}>
        Liked by
      </Text>
      {searchable ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          accessibilityLabel="Search people who liked this"
          style={styles.search}
        />
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <LikerRow
            person={item}
            self={item.id === myId}
            following={followingSet.has(item.id)}
            onToggle={() => {
              if (myId) void toggleFollow(myId, item.id);
            }}
            onOpen={onOpen}
          />
        )}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        windowSize={7}
        // The search's keyboard: a drag lowers it, a tap on a row still lands, and rows scroll clear of it.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
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
  pressed: { opacity: 0.5 },

  /* "Liked by" at the gutter; the rows start 24 under it (the grabber's slot sets the top). */
  title: {
    ...textRole.bodyStrong,
    color: colors.text,
    paddingHorizontal: layout.gutter,
    marginBottom: layout.group - (layout.rowTall - ROW_AVATAR) / 2,
  },
  search: { marginHorizontal: layout.gutter, marginBottom: space.md },

  /* Rows: 64 tall, the 44 face at the gutter, the name 16 after it, the key on the far gutter. */
  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: layout.hit },
  name: { ...textRole.body, flexShrink: 1, color: colors.text },
  you: { color: colors.textMuted },
  key: { minWidth: KEY_W },
  noMatch: {
    ...textRole.small,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },

  footer: {
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },
  footerText: { ...textRole.small, color: colors.textMuted },
});
