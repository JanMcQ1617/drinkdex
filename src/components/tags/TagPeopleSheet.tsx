import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Box } from '@/components/collections/Box';
import { SheetGrabber } from '@/components/Sheet';
import { announce, Avatar, Button, Chip, EmptyState, haptic, Hold, SearchField } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { CONNECTIONS_PAGE, fetchConnections, POST_TAGS_MAX, searchPeople } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/* ==================================================================== */
/* The Tag people picker (specs/v4.3/spec.md §1.3)                      */
/*                                                                      */
/* A page sheet, as the likers list is: it scrolls and takes typing,    */
/* and UIKit slides it and honours Reduce Motion. The people you        */
/* follow, each a row with the 22pt box (collections' Box); the picked  */
/* ride at the top as ink chips. Ten at most, the server's cap (024's   */
/* post_tags_full).                                                     */
/*                                                                      */
/* NOTHING HERE WRITES. Done, a swipe down and VoiceOver's escape all   */
/* keep the choice and hand it back (`onDone`): the compose step writes */
/* it with Post, and a post's ••• writes it on Done. So there is no     */
/* Cancel: closing is choosing, as Instagram's Tag people is.           */
/*                                                                      */
/* WHO IS LISTED, each person once and never you, in an order fixed     */
/* when the sheet opens so a ticked row never jumps: the people picked  */
/* already; the people you tagged lately (on your own posts the phone   */
/* holds, newest first, still followed, 20 at most); then everyone you  */
/* follow, newest follow first (the first CONNECTIONS_PAGE). Blocked    */
/* people never appear: a block removes the follow (006) and            */
/* follows_read hides the edge (011).                                   */
/* ==================================================================== */

/** People you tagged lately that lead the list. */
const RECENT_MAX = 20;
/** A row's face (the likers sheet's 44 in a 64 row). */
const ROW_AVATAR = 44;
/** Typing settles this long before a full follow list also asks the server. */
const SEARCH_DEBOUNCE_MS = 300;

export interface TagPeopleSheetProps {
  visible: boolean;
  /** Who is picked as it opens, in pick order. */
  initial: UserProfile[];
  /** The picked, in pick order, handed back on Done, a swipe down or VoiceOver's escape. */
  onDone: (picked: UserProfile[]) => void;
  /** Hides the sheet; called straight after onDone. */
  onClose: () => void;
}

export function TagPeopleSheet({ visible, initial, onDone, onClose }: TagPeopleSheetProps) {
  /*
   * The choice lives here, not in the page: the Modal's own close (a
   * swipe down) has to hand it back, and the page is out of its reach.
   * Taken from `initial` each time the sheet opens, as a render-time
   * adjustment rather than an effect, so the first frame is already
   * right. `handed` turns away a second Done during the slide away.
   */
  const [picked, setPicked] = useState<UserProfile[]>(initial);
  const [handed, setHanded] = useState(false);
  const [openNow, setOpenNow] = useState(visible);
  if (visible !== openNow) {
    setOpenNow(visible);
    if (visible) {
      setPicked(initial);
      setHanded(false);
    }
  }

  const finish = () => {
    if (handed) return;
    setHanded(true);
    onDone(picked);
    onClose();
  };

  const full = picked.length >= POST_TAGS_MAX;

  const toggle = (person: UserProfile) => {
    const on = picked.some((p) => p.id === person.id);
    if (!on && full) {
      announce(`You can tag ${POST_TAGS_MAX} people at most`);
      return;
    }
    haptic.select();
    const next = on ? picked.filter((p) => p.id !== person.id) : [...picked, person];
    setPicked(next);
    if (!on && next.length === POST_TAGS_MAX) announce(atTheMost());
  };

  // A chip's own press already gave the selection tick (ui Chip).
  const unpick = (person: UserProfile) => setPicked((now) => now.filter((p) => p.id !== person.id));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={finish}>
      <Body initial={initial} picked={picked} full={full} onToggle={toggle} onUnpick={unpick} onDone={finish} />
    </Modal>
  );
}

/** The line under the head at ten, said aloud as the tenth is ticked. */
const atTheMost = () => `That's ${POST_TAGS_MAX}, the most for one post.`;

/**
 * Case, accents and a leading @ aside, as the likers sheet's search. The
 * combining-mark range is escaped: typed literally it is invisible.
 */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * The people you tagged lately, from your own posts already on the phone
 * (the feed holds them, newest post first, each post's tags oldest
 * first): last tagged first, each once, only those you still follow.
 */
function recentlyTagged(feed: readonly Post[], myId: string | undefined, following: readonly string[]): UserProfile[] {
  const followed = new Set(following);
  const seen = new Set<string>();
  const out: UserProfile[] = [];
  for (const post of feed) {
    if (!post.mine || !post.tagged) continue;
    for (let i = post.tagged.length - 1; i >= 0; i--) {
      const p = post.tagged[i]!;
      if (seen.has(p.id) || p.id === myId || !followed.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      if (out.length === RECENT_MAX) return out;
    }
  }
  return out;
}

/** Each person once, first place kept, never you. */
function uniquePeople(lists: readonly (readonly UserProfile[])[], myId: string | undefined): UserProfile[] {
  const seen = new Set<string>();
  const out: UserProfile[] = [];
  for (const list of lists) {
    for (const p of list) {
      if (seen.has(p.id) || p.id === myId) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** The follow list: `full` when it came back a whole page, so there may be more than it holds. */
type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; people: UserProfile[]; full: boolean };

/**
 * The sheet's page. The Modal mounts it on every open and drops it once
 * the sheet has gone, so each open reads the follow list afresh and the
 * search starts empty.
 */
function Body({
  initial,
  picked,
  full,
  onToggle,
  onUnpick,
  onDone,
}: {
  initial: UserProfile[];
  picked: UserProfile[];
  full: boolean;
  onToggle: (person: UserProfile) => void;
  onUnpick: (person: UserProfile) => void;
  onDone: () => void;
}) {
  const myId = useAuth((s) => s.session?.user.id);

  /*
   * The head of the list, fixed as the sheet opens: the picked, then the
   * people tagged lately. Read once from the store rather than subscribed
   * to, so a feed refresh behind the sheet cannot reorder the rows.
   */
  const [head] = useState(() => {
    const { feed, following } = useSocial.getState();
    return uniquePeople([initial, recentlyTagged(feed, myId, following)], myId);
  });

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  // Bumped by Try again: the follow list is asked for again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!myId) return;
    let alive = true;
    fetchConnections(myId, 'following').then(
      (people) => {
        if (alive) setLoad({ status: 'ready', people, full: people.length >= CONNECTIONS_PAGE });
      },
      () => {
        if (alive) setLoad({ status: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [myId, attempt]);

  const retry = () => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  const [query, setQuery] = useState('');
  const term = query.trim().replace(/^@+/, '');
  const needle = fold(term);

  /*
   * Past a full page of follows, the list on the phone may not hold the
   * person typed, so each search also asks the server and keeps only
   * people in the follow set (useSocial.following), never a stranger.
   * Answers are kept by the term they answer, so a slow one for an older
   * term is never shown under a newer one.
   */
  const [found, setFound] = useState<{ term: string; people: UserProfile[] } | null>(null);
  const searchServer = load.status === 'ready' && load.full && term.length > 0;
  useEffect(() => {
    if (!myId || !searchServer) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchPeople(myId, term).then(
        (people) => {
          if (!alive) return;
          const followed = new Set(useSocial.getState().following);
          setFound({ term, people: people.filter((p) => followed.has(p.id)) });
        },
        () => {
          // The phone's own list still answers; a failed extra search says nothing.
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [myId, searchServer, term]);

  const everyone = uniquePeople(
    [head, load.status === 'ready' ? load.people : [], found && found.term === term ? found.people : []],
    myId,
  );
  const shown = needle
    ? everyone.filter((p) => fold(p.username).includes(needle) || fold(p.displayName).includes(needle))
    : everyone;
  const pickedIds = new Set(picked.map((p) => p.id));

  /*
   * A chip added scrolls the chips to their end, so the newest is in
   * view; one taken away leaves them where they are.
   */
  const chipsRef = useRef<ScrollView>(null);
  const chipCount = useRef(picked.length);
  const onChipsSize = () => {
    if (picked.length > chipCount.current) chipsRef.current?.scrollToEnd({ animated: false });
    chipCount.current = picked.length;
  };

  const failedLine = (
    <View style={styles.footer}>
      <Text style={styles.quiet}>Couldn&apos;t load the people you follow.</Text>
      <Button label="Try again" variant="secondary" size="sm" onPress={retry} />
    </View>
  );

  const empty =
    load.status === 'loading' ? (
      <Hold fill={false} slowMessage="Still loading the people you follow." />
    ) : load.status === 'error' ? (
      failedLine
    ) : needle ? (
      <Text style={[styles.quiet, styles.noMatch]}>{`No one you follow matches “${term}”.`}</Text>
    ) : (
      <EmptyState
        icon="users"
        title="No one to tag yet"
        body="You can tag people you follow. Find friends from your profile."
      />
    );

  // With rows already listed (the picked, the recent), the follow list's state is said under them.
  const footer =
    shown.length === 0 ? null : load.status === 'loading' ? (
      <Hold fill={false} slowMessage="Still loading the people you follow." />
    ) : load.status === 'error' ? (
      failedLine
    ) : null;

  return (
    <View style={styles.screen} onAccessibilityEscape={onDone}>
      <SheetGrabber />
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          Tag people
        </Text>
        <Pressable
          onPress={onDone}
          hitSlop={{ top: 10, bottom: 10, left: space.md, right: space.md }}
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityHint="Keeps who you picked"
          style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <Text style={[styles.quiet, styles.line]}>
        {full ? atTheMost() : "People you follow. They'll see this post in Activity."}
      </Text>
      {/* Not focused on open: the list is the first thing to see. */}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search people you follow"
        accessibilityLabel="Search people you follow"
        style={styles.search}
      />
      {picked.length > 0 ? (
        <ScrollView
          ref={chipsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={onChipsSize}
          accessibilityRole="list"
          accessibilityLabel="Tagged"
          style={styles.chips}
          contentContainerStyle={styles.chipsRow}>
          {picked.map((p) => (
            <Chip
              key={p.id}
              label={p.username}
              selected
              trailingIcon="close"
              onPress={() => onUnpick(p)}
              accessibilityLabel={`Remove ${p.username}`}
            />
          ))}
        </ScrollView>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const on = pickedIds.has(item.id);
          return <PersonRow person={item} on={on} closed={full && !on} onPress={() => onToggle(item)} />;
        }}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
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

/**
 * One person: the face, the name over "@handle", and the box. The whole
 * row is the checkbox, so a tap anywhere toggles it. At ten an unticked
 * row reads disabled and takes no tick, but still takes the tap, to say
 * why (the toggle announces it). Names wrap, never truncate.
 */
function PersonRow({
  person,
  on,
  closed,
  onPress,
}: {
  person: UserProfile;
  on: boolean;
  /** Ten are picked and this one is not. */
  closed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={`${person.displayName}, @${person.username}`}
      accessibilityState={{ checked: on, disabled: closed }}
      style={({ pressed }) => [styles.row, pressed && !closed && styles.rowPressed, closed && styles.closed]}>
      <Avatar name={person.displayName} accent={person.accent} size={ROW_AVATAR} avatarPath={person.avatarPath} />
      <View style={styles.rowText}>
        <Text style={styles.name}>{person.displayName}</Text>
        <Text style={styles.quiet}>@{person.username}</Text>
      </View>
      <Box on={on} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  /* The first row 8 under the field or the chips. */
  content: { paddingTop: space.sm, paddingBottom: space.xxxl },
  pressed: { opacity: 0.5 },
  quiet: { ...textRole.small, color: colors.textMuted },

  /* The head: "Tag people" at the gutter, Done ending on the far gutter. */
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
  },
  title: { ...textRole.bodyStrong, color: colors.text },
  done: { ...textRole.bodyMedium, color: colors.text },
  line: { marginTop: space.xs, paddingHorizontal: layout.gutter },
  search: { marginTop: space.md, marginHorizontal: layout.gutter },

  /* The picked, one row edge to edge that scrolls sideways, 16 under the field. */
  chips: { flexGrow: 0, marginTop: space.lg },
  chipsRow: { gap: space.sm, paddingHorizontal: layout.gutter, paddingVertical: space.xs },

  /* Rows: 64, the 44 face at the gutter, the name 16 after it (x 84), the box on the far gutter. */
  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.press },
  closed: { opacity: 0.5 },
  rowText: { flex: 1 },
  name: { ...textRole.body, color: colors.text },
  noMatch: { paddingHorizontal: layout.gutter, paddingTop: space.lg },

  footer: {
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },
});
