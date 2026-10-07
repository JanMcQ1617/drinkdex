import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { DexThumb } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { FollowButton } from '@/components/PeopleList';
import { timeAgo, timeAgoSpoken } from '@/components/PostCard';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Avatar, EmptyState, haptic, Hold, Notice, PressableScale, SectionHeader } from '@/components/ui';
import { colors, fonts, layout, motion, radius, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { fetchActivity, fetchProfiles } from '@/lib/social';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { isLater, laterOf, useSeen } from '@/store/seen';
import { mergeProfiles, useSocial } from '@/store/social';
import type { ActivityItem, UserProfile } from '@/types';

/* ==================================================================== */
/* Activity                                                             */
/*                                                                      */
/* Where Home's heart goes: likes on your posts and new followers,      */
/* newest first, from the last 30 days. Built from the likes and        */
/* follows tables as they are; nothing new is stored or fetched.        */
/*                                                                      */
/* LIKES ARE GROUPED BY POST, within each section: ten likes on one     */
/* Negroni are one row, "ana, leo and 8 others liked your Negroni",     */
/* with up to three faces overlapping, placed where its newest like     */
/* falls. Ten identical rows were a list of the same news. Follows stay */
/* one row each: each is a different person and a decision about them.  */
/*                                                                      */
/* "New" is everything since you last opened this screen, by the mark   */
/* in the seen store, which lives on this phone only. The mark is taken */
/* once, as the screen opens, and moved on once the rows have loaded,   */
/* so what was new stays under "New" while you read it and the heart's  */
/* dot on Home goes out. New is said three ways: the group header in    */
/* ink rather than muted, its place first, and a 2pt wine edge at each  */
/* new row's leading side (Home's stories say unseen with a ring; a row */
/* has no circle to ring, so it takes the edge).                        */
/* ==================================================================== */

export default function ActivityScreen() {
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
  return <ActivityBody key={myId} myId={myId} onBack={leave} />;
}

type Loaded =
  | { status: 'ready'; items: ActivityItem[]; refreshFailed: boolean }
  | { status: 'failed' };

type LikeItem = Extract<ActivityItem, { kind: 'like' }>;
type FollowItem = Extract<ActivityItem, { kind: 'follow' }>;

/** One row's event, before it knows where in its section it sits. */
type Entry = { kind: 'likes'; likes: LikeItem[] } | { kind: 'follow'; item: FollowItem };

type Row =
  | { kind: 'header'; key: string; title: string; strong: boolean }
  | (Entry & { key: string; first: boolean; fresh: boolean });

/**
 * A section's items as rows: every like on one post folded into one entry,
 * at the place of that post's newest like. `list` is newest first (as
 * fetchActivity sorts it), so each group's likes are too, and its first
 * like is the one whose time and face lead the row.
 */
function groupByPost(list: readonly ActivityItem[]): Entry[] {
  const entries: Entry[] = [];
  const byPost = new Map<string, LikeItem[]>();
  for (const item of list) {
    if (item.kind === 'follow') {
      entries.push({ kind: 'follow', item });
      continue;
    }
    const group = byPost.get(item.postId);
    if (group) {
      group.push(item);
    } else {
      const likes = [item];
      byPost.set(item.postId, likes);
      entries.push({ kind: 'likes', likes });
    }
  }
  return entries;
}

/**
 * The rows, then the people in them, merged into the social store's
 * profiles so a name tapped here opens a profile that is already in hand.
 * Written only while the same account is signed in, like the store's own
 * writes. A failed profile read fails the whole load: a row without a
 * name to put in it is not worth showing.
 */
async function fetchActivityWithPeople(myId: string): Promise<ActivityItem[]> {
  const gen = useSocial.getState().gen;
  const items = await fetchActivity(myId);
  const people = await fetchProfiles(items.map((i) => i.actorId));
  if (useSocial.getState().gen === gen) {
    /*
     * Through the store's mergeProfiles, not a spread. The spread handed
     * every actor a fresh object on every open and every pull, changed or
     * not, and a new map with them; most actors are people you follow, so
     * each visit re-rendered their cards on Home underneath (PostCard's memo
     * compares `author` by identity) and every screen still mounted that
     * reads the map. Merged, only a profile that actually changed is new.
     */
    useSocial.setState((s) => ({ profiles: mergeProfiles(s.profiles, people) }));
  }
  return items;
}

function ActivityBody({ myId, onBack }: { myId: string; onBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profiles = useSocial((s) => s.profiles);
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const activityLatestAt = useSocial((s) => s.activityLatestAt);
  const markActivitySeen = useSeen((s) => s.markActivitySeen);

  // The mark as it stood when the screen opened: it decides "New" for this visit.
  const [seenAtOnOpen] = useState(() => useSeen.getState().activity[myId]);
  const [scrolled, onScroll] = useScrolledPast();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reloading, setReloading] = useState(false);

  /*
   * One fetch per attempt. A failure over rows already on screen keeps the
   * rows and says so in a notice; with nothing held (no answer yet, or an
   * empty one) it is the error state, never "No activity yet".
   */
  useEffect(() => {
    let alive = true;
    fetchActivityWithPeople(myId)
      .then(
        (items) => {
          if (alive) setLoaded({ status: 'ready', items, refreshFailed: false });
        },
        () => {
          if (!alive) return;
          setLoaded((prev) =>
            prev?.status === 'ready' && prev.items.length > 0
              ? { ...prev, refreshFailed: true }
              : { status: 'failed' },
          );
        },
      )
      .finally(() => {
        if (alive) setReloading(false);
      });
    return () => {
      alive = false;
    };
  }, [myId, attempt]);

  const items = loaded?.status === 'ready' ? loaded.items : null;

  /*
   * Opened means seen: once the rows are in, the mark moves to the newest
   * of them (or to the newest the Home badge knew of, if that is later),
   * which puts the dot on Home's heart out. On focus, so coming back here
   * from a post marks anything that arrived meanwhile.
   */
  useFocusEffect(
    useCallback(() => {
      if (!items) return;
      const at = laterOf(items[0]?.at, activityLatestAt);
      if (at) markActivitySeen(myId, at);
    }, [items, activityLatestAt, markActivitySeen, myId]),
  );

  const retry = () => {
    setLoaded(null);
    setAttempt((a) => a + 1);
  };

  const onRefresh = () => {
    setReloading(true);
    setAttempt((a) => a + 1);
  };

  const openPerson = (id: string) => {
    if (id === myId) router.navigate('/profile');
    else router.navigate({ pathname: '/user/[id]', params: { id } });
  };
  const openPost = (id: string) => router.navigate({ pathname: '/post/[id]', params: { id } });

  /*
   * Rows whose person is not in hand are left out: an account deleted, or
   * one you have just blocked (dropAuthor takes their profile away, so their
   * rows go at once, with their posts and their story circle on Home).
   */
  const visible = (items ?? []).filter((i) => profiles[i.actorId]);
  const isNew = (i: ActivityItem) => !seenAtOnOpen || isLater(i.at, seenAtOnOpen);
  const fresh = visible.filter(isNew);
  const earlier = visible.filter((i) => !isNew(i));
  const rows: Row[] = [];
  const section = (title: string, list: ActivityItem[], isFresh: boolean) => {
    if (list.length === 0) return;
    rows.push({ kind: 'header', key: `header:${title}`, title, strong: isFresh });
    groupByPost(list).forEach((entry, n) => {
      // A post can have likes in both sections, so its key carries the section.
      const key =
        entry.kind === 'likes' ? `likes:${title}:${entry.likes[0]!.postId}` : entry.item.key;
      rows.push({ ...entry, key, first: n === 0, fresh: isFresh });
    });
  };
  section('New', fresh, true);
  section('Earlier', earlier, false);

  const renderItem = ({ item: row }: { item: Row }) => {
    if (row.kind === 'header') {
      return (
        <SectionHeader
          title={row.title}
          size="group"
          strong={row.strong}
          style={styles.sectionHeader}
        />
      );
    }
    if (row.kind === 'likes') {
      return (
        <LikesRow
          likes={row.likes}
          people={row.likes.map((l) => profiles[l.actorId]!)}
          first={row.first}
          fresh={row.fresh}
          onOpenPerson={openPerson}
          onOpenPost={openPost}
        />
      );
    }
    const person = profiles[row.item.actorId]!;
    return (
      <FollowRow
        item={row.item}
        person={person}
        first={row.first}
        fresh={row.fresh}
        following={following.includes(person.id)}
        onToggleFollow={() => void toggleFollow(myId, person.id)}
        onOpenPerson={openPerson}
      />
    );
  };

  return (
    <View style={styles.screen}>
      {/* The page's own grain, under everything: there is no global grain any more. */}
      <Grain />
      <ScreenTopBar
        title="Activity"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        ListHeaderComponent={
          loaded?.status === 'ready' && loaded.refreshFailed && visible.length > 0 ? (
            <Notice tone="error" style={styles.notice}>
              Could not refresh. Pull down to try again.
            </Notice>
          ) : null
        }
        ListEmptyComponent={
          loaded === null ? (
            reloading ? null : (
              <Hold fill={false} slowMessage="Still loading activity." />
            )
          ) : loaded.status === 'failed' ? (
            <EmptyState
              icon="alert"
              title="Could not load activity"
              body="Check your connection and try again."
              actionVariant="secondary"
              action={{ label: 'Try again', onPress: retry }}
            />
          ) : (
            <EmptyState
              icon="heart"
              title="No activity yet"
              body="When someone likes your post or follows you, it shows up here."
            />
          )
        }
        refreshing={reloading}
        onRefresh={onRefresh}
      />
    </View>
  );
}

/* ==================================================================== */
/* Rows                                                                 */
/* ==================================================================== */

/** The leading column: three 24pt faces in 2pt rings, 10pt of each overlapping the next. */
const FACE = 24;
const FACE_RING = 2;
const FACE_OVERLAP = 10;
const FACE_OUTER = FACE + 2 * FACE_RING;
const FACE_STEP = FACE - FACE_OVERLAP;
const MAX_FACES = 3;
const LEAD = FACE_OUTER + (MAX_FACES - 1) * FACE_STEP;
/** A single person's face: a follow, or a post only one person has liked. */
const AVATAR = 40;

/**
 * What a row is drawn on, before its content: the separator from the text
 * to the right edge (none on a section's first row), and on a new row the
 * 2pt wine edge at its leading side.
 */
function RowFrame({
  first,
  fresh,
  children,
}: {
  first: boolean;
  fresh: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      {/* Between rows of one section, inset to the text, as a list row's rule is. */}
      {first ? null : <View style={styles.separator} />}
      {fresh ? <View style={styles.freshEdge} /> : null}
      {children}
    </View>
  );
}

/**
 * Who, in the sentence: "ana", "ana and leo", "ana, leo and mia", then
 * "ana, leo and 3 others". Usernames on screen, each in SemiBold; the
 * spoken form uses display names, as the rows always have.
 */
function likersShown(people: readonly UserProfile[]): React.ReactNode {
  const name = (p: UserProfile) => (
    <Text key={p.id} style={styles.strong}>
      {p.username}
    </Text>
  );
  const [a, b, c] = people;
  if (!a) return null;
  if (!b) return name(a);
  if (!c) return [name(a), ' and ', name(b)];
  if (people.length === 3) return [name(a), ', ', name(b), ' and ', name(c)];
  return [name(a), ', ', name(b), ` and ${people.length - 2} others`];
}

function likersSpoken(people: readonly UserProfile[]): string {
  const names = people.map((p) => p.displayName);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/**
 * Every like on one of your posts, as one row: the faces (one person's
 * opens them; a group's opens the post), the sentence (opens the post),
 * and the photo that was liked. The faces are hidden from VoiceOver,
 * because the sentence beside them names the same people. With the drink
 * gone from the catalogue the sentence ends "liked your post", the noun
 * the rest of the app uses for the thing you shared (v3.1 §12).
 */
function LikesRow({
  likes,
  people,
  first,
  fresh,
  onOpenPerson,
  onOpenPost,
}: {
  likes: LikeItem[];
  people: UserProfile[];
  first: boolean;
  fresh: boolean;
  onOpenPerson: (id: string) => void;
  onOpenPost: (id: string) => void;
}) {
  const newest = likes[0]!;
  const drink = getDrink(newest.drinkId);
  const drinkName = drink?.name ?? 'post';
  const open = () => onOpenPost(newest.postId);
  const single = people.length === 1 ? people[0]! : null;

  return (
    <RowFrame first={first} fresh={fresh}>
      <Pressable
        onPress={single ? () => onOpenPerson(single.id) : open}
        hitSlop={2}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.lead}>
        {single ? (
          <Avatar
            name={single.displayName}
            accent={single.accent}
            size={AVATAR}
            avatarPath={single.avatarPath}
          />
        ) : (
          <FaceStack people={people.slice(0, MAX_FACES)} />
        )}
      </Pressable>
      <Pressable
        onPress={open}
        // Out to the row's own padding, so a one-line sentence is still 44pt to the finger.
        hitSlop={{ top: space.md, bottom: space.md }}
        accessibilityRole="button"
        accessibilityLabel={`${likersSpoken(people)} liked your ${drinkName}, ${timeAgoSpoken(newest.at)}`}
        style={({ pressed }) => [styles.rowText, pressed && styles.pressed]}>
        <Text style={styles.sentence}>
          {likersShown(people)} liked your{' '}
          {/* The drink in Playfair, as a name inside an Inter sentence is set. */}
          {drink ? <Text style={textRole.nameInline}>{drink.name}</Text> : 'post'}.{' '}
          <Text style={styles.when}>{timeAgo(newest.at)}</Text>
        </Text>
      </Pressable>
      <LikedThumb path={newest.photoPath} drinkId={newest.drinkId} onPress={open} />
    </RowFrame>
  );
}

/**
 * Up to three faces, the newest first and on top, each cut out of the
 * page by a 2pt paper ring so the overlap reads as one face in front of
 * the next.
 */
function FaceStack({ people }: { people: UserProfile[] }) {
  return (
    <View style={styles.faces}>
      {people.map((p, i) => (
        <View
          key={p.id}
          style={[styles.faceRing, i > 0 && styles.faceBehind, { zIndex: people.length - i }]}>
          <Avatar name={p.displayName} accent={p.accent} size={FACE} avatarPath={p.avatarPath} />
        </View>
      ))}
    </View>
  );
}

/**
 * A new follower: their face (opens them), the sentence (opens them), and
 * a Follow back, since they already follow you. The face is hidden from
 * VoiceOver, because the sentence beside it names the same person.
 */
function FollowRow({
  item,
  person,
  first,
  fresh,
  following,
  onToggleFollow,
  onOpenPerson,
}: {
  item: FollowItem;
  person: UserProfile;
  first: boolean;
  fresh: boolean;
  following: boolean;
  onToggleFollow: () => void;
  onOpenPerson: (id: string) => void;
}) {
  return (
    <RowFrame first={first} fresh={fresh}>
      <Pressable
        onPress={() => onOpenPerson(person.id)}
        hitSlop={2}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.lead}>
        <Avatar
          name={person.displayName}
          accent={person.accent}
          size={AVATAR}
          avatarPath={person.avatarPath}
        />
      </Pressable>
      <Pressable
        onPress={() => onOpenPerson(person.id)}
        hitSlop={{ top: space.md, bottom: space.md }}
        accessibilityRole="button"
        accessibilityLabel={`${person.displayName} started following you, ${timeAgoSpoken(item.at)}`}
        style={({ pressed }) => [styles.rowText, pressed && styles.pressed]}>
        <Text style={styles.sentence}>
          <Text style={styles.strong}>{person.username}</Text> started following you.{' '}
          <Text style={styles.when}>{timeAgo(item.at)}</Text>
        </Text>
      </Pressable>
      <FollowButton
        following={following}
        name={person.displayName}
        onToggle={onToggleFollow}
        back
      />
    </RowFrame>
  );
}

/**
 * The post that was liked, as a 44pt thumbnail of its photo. A post with
 * no photo, or one that will not sign, shows its drink mounted instead
 * (DexThumb, lit), never an empty square; while it signs, the frame holds
 * its place.
 */
function LikedThumb({
  path,
  drinkId,
  onPress,
}: {
  path: string | null;
  drinkId: string;
  onPress: () => void;
}) {
  const url = useSignedPhoto(path);
  const drink = getDrink(drinkId);
  // The drink to mount in place of the photo, once the photo is known to be missing.
  const mounted = url === null && drink ? drink : null;
  return (
    <PressableScale
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      noHaptic
      unstable_pressDelay={120}
      accessibilityRole="button"
      accessibilityLabel="Open the post"
      style={mounted ? undefined : styles.thumb}>
      {url ? (
        <Image
          source={{ uri: url, cacheKey: path ? `${path}#thumb` : undefined }}
          cachePolicy="memory-disk"
          /*
           * A 44pt thumbnail of a photo stored at up to 2048px: decoded at
           * the frame's size, or every row would hold a full-size decode and
           * redraw it on the main thread as it scrolls in (PostGridTile, in
           * profile/PostGrid, has the whole reason).
           */
          enforceEarlyResizing
          contentFit="cover"
          transition={motion.fast}
          style={StyleSheet.absoluteFill}
        />
      ) : mounted ? (
        <DexThumb drink={mounted} />
      ) : null}
    </PressableScale>
  );
}

/* ==================================================================== */

/** Where a row's text starts: the gutter, the leading column and the gap after it. */
const TEXT_INSET = layout.gutter + LEAD + space.md;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  /* Clear, so the screen's grain shows through. */
  list: { flex: 1 },
  notice: { marginHorizontal: layout.gutter, marginTop: space.sm },
  sectionHeader: { marginTop: space.lg, marginBottom: space.sm },

  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.md,
  },
  separator: {
    position: 'absolute',
    top: 0,
    left: TEXT_INSET,
    right: 0,
    height: stroke.hair,
    backgroundColor: colors.line,
  },
  /*
   * At the screen's leading edge, inset 8pt top and bottom so a run of new
   * rows reads as marks on each row rather than one bar down the section.
   */
  freshEdge: {
    position: 'absolute',
    left: 0,
    top: space.sm,
    bottom: space.sm,
    width: stroke.indicator,
    backgroundColor: colors.wine,
  },
  /*
   * One width for every row's faces, the widest stack's, so every sentence
   * starts on one line down the list; a single face sits at its left.
   * Stretched to the row's height: a 28pt stack alone was a 32pt target,
   * and the row's 40pt content plus the 2pt slop makes 44.
   */
  lead: { width: LEAD, alignSelf: 'stretch', alignItems: 'flex-start', justifyContent: 'center' },
  faces: { flexDirection: 'row' },
  faceRing: {
    width: FACE_OUTER,
    height: FACE_OUTER,
    // round-ok: avatar
    borderRadius: radius.round,
    borderWidth: FACE_RING,
    borderColor: colors.bg,
    backgroundColor: colors.bg,
  },
  // The next face starts FACE_STEP after the last one's disc, its ring over the overlap.
  faceBehind: { marginLeft: FACE_STEP - FACE_OUTER },
  rowText: { flex: 1 },
  pressed: { opacity: 0.5 },
  sentence: { ...textRole.prose, color: colors.text },
  strong: { fontFamily: fonts.bodySemiBold },
  when: { color: colors.textMuted },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.bgSunk,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
