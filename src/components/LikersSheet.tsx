import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BrassGrabber, BrassPlate, BrassRail, LabelTag } from '@/components/brass';
import { Grain } from '@/components/Grain';
import { TopBarTextButton } from '@/components/ScreenTopBar';
import { Avatar, Button, EmptyState, Hold, SearchField } from '@/components/ui';
import { colors, fonts, layout, space, stroke, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  fetchPostLikers,
  likersSupported,
  timeAgo,
  timeAgoSpoken,
  type LikersCursor,
  type PostLiker,
} from '@/lib/social';
import { textWidth } from '@/lib/textFit';
import { useAuth } from '@/store/auth';
import { useCollection, useIsUnlocked } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Drink } from '@/types';

/* ==================================================================== */
/* Who liked a post                                                     */
/*                                                                      */
/* The list behind a card's "Liked by" line (migration 021): everyone   */
/* who liked it, newest first, fifty at a time, each with their Follow. */
/* A page sheet, presented and slid away by UIKit, so the feed stays    */
/* exactly where it was underneath and Reduce Motion is UIKit's to      */
/* honour.                                                              */
/*                                                                      */
/* BRASS (D18). A brass grabber, "Liked by" over a sentence naming the  */
/* drink with its engraved plate, a brass rail, then a search and the   */
/* people in two groups, "People you follow" and "Others", each row     */
/* numbered within its group the way a guest list is (graft 5).         */
/* "In their Dex" is left out on purpose: the likers function has no    */
/* such column on the live server, so only your own row says whether    */
/* the drink is in your Dex, from the collection on the phone.          */
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
  /** The drink posted, for the header's sentence and plate. */
  drink: Drink;
  /** The card's own count (optimistic, so it moves with the heart). */
  likes: number;
  /** The post's author, for "theo_stirs's Paper Plane". */
  authorId: string;
  authorUsername: string;
}

export function LikersSheet({ postId, visible, onClose, drink, likes, authorId, authorUsername }: LikersSheetProps) {
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
      <Body
        key={postId}
        postId={postId}
        myId={myId}
        drink={drink}
        likes={likes}
        mine={!!myId && authorId === myId}
        authorUsername={authorUsername}
        onClose={onClose}
        onOpen={openPerson}
      />
    </Modal>
  );
}

/* ==================================================================== */
/* Rows                                                                 */
/* ==================================================================== */

/** The liker's face: the mock's 44pt, a touch larger than a people list's 40. */
const ROW_AVATAR = 44;
/** Rank numerals sit in a fixed frame, so they grow only so far (spec section 4's 1.3). */
const RANK_CAP = 1.3;

/** "01", "02" … "120": two digits at least, as a numbered list is set. */
function rankText(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The rank column's width for a group of `count` rows, worked out from
 * the widest numeral it will hold (textFit errs wide), so every row in a
 * group lines its avatar up from the first frame with no layout pass.
 */
function rankWidth(count: number, fontScale: number): number {
  const digits = Math.max(2, String(count).length);
  const s = Math.min(fontScale, RANK_CAP);
  const tracking = (textRole.rank.letterSpacing ?? 0) * s * digits;
  return Math.ceil(textWidth('0'.repeat(digits), 'inter', textRole.rank.fontSize * s) + tracking);
}

/** "liked 2h ago", "liked just now": the card's short time, in the sentence the row reads. */
function likedWhen(iso: string): string {
  const t = timeAgo(iso);
  return t === 'now' ? 'liked just now' : `liked ${t} ago`;
}

/**
 * One liker: their number in the group, face, name and username, when
 * they liked it, and their Follow. Your own row says "(you)", has no
 * button, and carries the "In your Dex" label when the drink is yours.
 *
 * The person (number, face, words) is one button that opens their
 * profile, spoken in full: "Maya Ortiz, maya.pours, liked 2 hours ago,
 * following". The Follow beside it stays its own control, so each is
 * reachable on its own (PersonRow's reason). Names wrap, never truncate.
 */
function LikerRow({
  person,
  rank,
  rankW,
  self,
  following,
  selfInDex,
  onToggle,
  onOpen,
  separator,
}: {
  person: PostLiker;
  rank: number;
  rankW: number;
  self: boolean;
  following: boolean;
  selfInDex: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  separator: boolean;
}) {
  const spoken = [
    person.displayName,
    self ? 'you' : null,
    person.username,
    `liked ${timeAgoSpoken(person.likedAt)}`,
    self ? (selfInDex ? 'in your Dex' : null) : following ? 'following' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onOpen(person.id)}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={self ? 'Opens your profile' : 'Opens their profile'}
        /*
         * Pressed, the person dims rather than the row filling: the brass
         * rank numeral is audited on paper, not on the sunk fill.
         */
        style={({ pressed }) => [styles.identity, pressed && styles.identityPressed]}>
        <Text maxFontSizeMultiplier={RANK_CAP} style={[styles.rank, { width: rankW }]}>
          {rankText(rank)}
        </Text>
        <Avatar name={person.displayName} accent={person.accent} size={ROW_AVATAR} avatarPath={person.avatarPath} />
        <View style={styles.rowText}>
          <Text style={styles.name}>
            {person.displayName}
            {self ? <Text style={styles.you}> (you)</Text> : null}
          </Text>
          <View style={styles.subLine}>
            <Text style={styles.handle}>
              {person.username} · {likedWhen(person.likedAt)}
            </Text>
            {self && selfInDex ? <LabelTag text="In your Dex" /> : null}
          </View>
        </View>
      </Pressable>
      {self ? null : (
        /*
         * Follow is the sheet's one wine action (the Brass mock); Following
         * is the outline, a state rather than a second call. Squared, 1pt
         * edges, Button's row size.
         */
        <Button
          label={following ? 'Following' : 'Follow'}
          variant={following ? 'secondary' : 'primary'}
          size="sm"
          onPress={onToggle}
          accessibilityLabel={following ? `Unfollow ${person.displayName}` : `Follow ${person.displayName}`}
        />
      )}
      {separator ? (
        <View
          style={[styles.separator, { left: layout.gutter + rankW + space.md + ROW_AVATAR + space.md }]}
        />
      ) : null}
    </View>
  );
}

/** A group's head: "People you follow 3", the count in brass ink (spec section 4). */
function GroupHead({ title, count }: { title: string; count: number }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${count}`} style={styles.groupHead}>
      <Text style={styles.groupTitle}>
        {title} <Text style={styles.groupCount}>{formatCount(count)}</Text>
      </Text>
    </View>
  );
}

/**
 * A loaded liker matches a search on their name or username, case and
 * accents aside. The combining-mark range is escaped, as in lib/bar and
 * InvitePicker: typed literally it is invisible, and an editor can drop it.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

type Group = { key: 'follow' | 'others'; title: string | null; data: PostLiker[] };

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
  drink,
  likes,
  mine,
  authorUsername,
  onClose,
  onOpen,
}: {
  postId: string;
  myId: string | undefined;
  drink: Drink;
  likes: number;
  mine: boolean;
  authorUsername: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const followingSet = useMemo(() => new Set(following), [following]);
  // Your own row's label: unknown (no label) until the collection has been read from disk.
  const unlocked = useIsUnlocked(drink.id);
  const collectionReady = useCollection((s) => s.hydrated);
  const selfInDex = collectionReady && unlocked;
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

  /*
   * The two groups. Grouped by `followedByMe`, the answer when the page
   * loaded, not by the live follow list: a row tapped to Follow would
   * otherwise jump to the other group under the finger. Its button still
   * reads the live list. You are never someone you follow, so your row is
   * with the others. Counts are of the rows loaded, so they grow as pages
   * arrive (the server orders by when each like landed, not by group).
   * With nobody you follow in the list there is one plain group and no
   * heads: "Others" than whom?
   */
  const needle = fold(query.trim().replace(/^@/, ''));
  const shown = needle
    ? people.filter((p) => fold(p.displayName).includes(needle) || fold(p.username).includes(needle))
    : people;
  const followed = shown.filter((p) => p.followedByMe && p.id !== myId);
  const others = shown.filter((p) => !(p.followedByMe && p.id !== myId));
  const groups: Group[] = followed.length
    ? [
        { key: 'follow', title: 'People you follow', data: followed },
        ...(others.length ? [{ key: 'others' as const, title: 'Others', data: others }] : []),
      ]
    : others.length
      ? [{ key: 'others', title: null, data: others }]
      : [];
  const rankW: Record<Group['key'], number> = {
    follow: rankWidth(followed.length, fontScale),
    others: rankWidth(others.length, fontScale),
  };

  // "24 people liked theo_stirs's Paper Plane"; on your own post, "your".
  const whose = mine ? 'your' : `${authorUsername}'s`;
  const lead = `${formatCount(likes)} ${likes === 1 ? 'person' : 'people'} liked ${whose} `;

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
    <View style={styles.screen}>
      {/* The sheet's own grain, under everything: there is no global grain any more. */}
      <Grain />
      <View style={styles.head}>
        <BrassGrabber />
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>
            Liked by
          </Text>
          <TopBarTextButton label="Done" onPress={onClose} />
        </View>
        <View accessible accessibilityLabel={`${lead}${drink.name}, number ${drink.dexNumber}`} style={styles.subRow}>
          <Text style={styles.sub}>
            {lead}
            <Text style={[textRole.nameInline, styles.subName]}>{drink.name}</Text>
          </Text>
          {/* Centred on the sentence: the plate's own frame hugs the top of its row. */}
          <View style={styles.plateSlot}>
            <BrassPlate n={drink.dexNumber} size="lg" />
          </View>
        </View>
        <BrassRail inFlow style={styles.rail} />
        {/* Only once there is someone to find: a loading or empty sheet has nothing to search. */}
        {people.length > 0 ? (
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            accessibilityLabel="Search people who liked this"
            style={styles.search}
          />
        ) : null}
      </View>
      <SectionList
        sections={groups}
        keyExtractor={(p) => p.id}
        renderSectionHeader={({ section }) =>
          section.title ? <GroupHead title={section.title} count={section.data.length} /> : null
        }
        renderItem={({ item, index, section }) => {
          const self = item.id === myId;
          return (
            <LikerRow
              person={item}
              rank={index + 1}
              rankW={rankW[section.key]}
              self={self}
              following={followingSet.has(item.id)}
              selfInDex={selfInDex}
              onToggle={() => {
                if (myId) void toggleFollow(myId, item.id);
              }}
              onOpen={onOpen}
              separator={index < section.data.length - 1}
            />
          );
        }}
        // Heads scroll with their rows: a stuck head would need an opaque ground over the sheet's grain.
        stickySectionHeadersEnabled={false}
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

  /* Head: the grabber 8pt from the sheet's top, then the title row. */
  head: { paddingTop: space.sm },
  /* Done's 12pt padding reaches past the gutter, so its word ends on it. */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.hit,
    marginTop: space.xs,
    paddingLeft: layout.gutter,
    paddingRight: layout.gutter - space.md,
  },
  title: { ...textRole.sectionTitle, flex: 1, color: colors.text },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
  },
  // The mock's 13/18 under the 16pt title: a caption to the title, not a second paragraph.
  sub: { ...textRole.helper, flex: 1, color: colors.textMuted },
  subName: { color: colors.text },
  plateSlot: { flexShrink: 0 },
  rail: { marginHorizontal: layout.gutter, marginTop: space.md },
  search: { marginHorizontal: layout.gutter, marginTop: space.md },

  /* Groups */
  groupHead: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xs },
  groupTitle: { ...textRole.helper, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  groupCount: { fontFamily: fonts.bodySemiBold, color: colors.brassInk },

  /* Rows: 68pt with the 44pt face, 12pt between the parts. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: ROW_AVATAR + 2 * space.md,
    paddingVertical: space.md,
    paddingHorizontal: layout.gutter,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: layout.hit },
  identityPressed: { opacity: 0.5 },
  rank: { ...textRole.rank, color: colors.brassInk },
  rowText: { flex: 1, gap: 2 },
  name: { ...textRole.rowTitle, fontFamily: fonts.bodySemiBold, color: colors.text },
  you: { fontFamily: fonts.body, color: colors.textMuted },
  subLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: space.xs },
  handle: { ...textRole.rowSubtitle, flexShrink: 1, color: colors.textMuted },
  // From the start of the name to the row's right edge, as iOS's own lists draw it.
  separator: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    height: stroke.hair,
    backgroundColor: colors.line,
  },
  noMatch: {
    ...textRole.helper,
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
  footerText: { ...textRole.helper, color: colors.textMuted },
});
