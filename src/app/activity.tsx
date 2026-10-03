import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
import { AuthGate } from '@/components/AuthGate';
import { FollowButton } from '@/components/PeopleList';
import { timeAgo, timeAgoSpoken } from '@/components/PostCard';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Avatar, EmptyState, haptic, Hold, Notice, PressableScale, SectionHeader } from '@/components/ui';
import { CATEGORY_META, colors, fonts, layout, motion, radius, space, stroke } from '@/constants/theme';
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
/* Where Home's heart goes: likes on your pours and new followers, one  */
/* row per event, newest first, from the last 30 days. Built from the   */
/* likes and follows tables as they are; nothing new is stored, and     */
/* nothing is grouped ("Ana and 3 others") in this first version.       */
/*                                                                      */
/* "New" is everything since you last opened this screen, by the mark   */
/* in the seen store, which lives on this phone only. The mark is taken */
/* once, as the screen opens, and moved on once the rows have loaded,   */
/* so what was new stays under "New" while you read it and the heart's  */
/* dot on Home goes out.                                                */
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

type Row =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'item'; key: string; item: ActivityItem; first: boolean };

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
   * rows go at once, with their posts and their pours tile).
   */
  const visible = (items ?? []).filter((i) => profiles[i.actorId]);
  const isNew = (i: ActivityItem) => !seenAtOnOpen || isLater(i.at, seenAtOnOpen);
  const fresh = visible.filter(isNew);
  const earlier = visible.filter((i) => !isNew(i));
  const rows: Row[] = [];
  const section = (title: string, list: ActivityItem[]) => {
    if (list.length === 0) return;
    rows.push({ kind: 'header', key: `header:${title}`, title });
    list.forEach((item, n) => rows.push({ kind: 'item', key: item.key, item, first: n === 0 }));
  };
  section('New', fresh);
  section('Earlier', earlier);

  const renderItem = ({ item: row }: { item: Row }) => {
    if (row.kind === 'header') {
      return <SectionHeader title={row.title} size="group" style={styles.sectionHeader} />;
    }
    const person = profiles[row.item.actorId]!;
    return (
      <ActivityRow
        item={row.item}
        person={person}
        first={row.first}
        following={following.includes(person.id)}
        onToggleFollow={() => void toggleFollow(myId, person.id)}
        onOpenPerson={openPerson}
        onOpenPost={openPost}
      />
    );
  };

  return (
    <View style={styles.screen}>
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
              body="When someone likes your pour or follows you, it shows up here."
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
/* A row                                                                */
/* ==================================================================== */

/**
 * One event: the person's face (opens them), the sentence (opens the post,
 * or the person for a follow), and on the right the pour that was liked or
 * a Follow button for a new follower. The face is hidden from VoiceOver,
 * because the sentence beside it names the same person.
 */
function ActivityRow({
  item,
  person,
  first,
  following,
  onToggleFollow,
  onOpenPerson,
  onOpenPost,
}: {
  item: ActivityItem;
  person: UserProfile;
  first: boolean;
  following: boolean;
  onToggleFollow: () => void;
  onOpenPerson: (id: string) => void;
  onOpenPost: (id: string) => void;
}) {
  const drink = item.kind === 'like' ? getDrink(item.drinkId) : undefined;
  const what =
    item.kind === 'like' ? ` liked your pour of ${drink?.name ?? 'a drink'}.` : ' started following you.';
  const spoken = `${person.displayName}${what.slice(0, -1)}, ${timeAgoSpoken(item.at)}`;

  return (
    <View style={styles.row}>
      {/* Between rows of one section, inset to the text, as a list row's rule is. */}
      {first ? null : <View style={styles.separator} />}
      <Pressable
        onPress={() => onOpenPerson(person.id)}
        hitSlop={2}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Avatar
          name={person.displayName}
          accent={person.accent}
          size={40}
          avatarPath={person.avatarPath}
        />
      </Pressable>
      <Pressable
        onPress={() => (item.kind === 'like' ? onOpenPost(item.postId) : onOpenPerson(person.id))}
        // Out to the row's own padding, so a one-line sentence is still 44pt to the finger.
        hitSlop={{ top: space.md, bottom: space.md }}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        style={({ pressed }) => [styles.rowText, pressed && styles.pressed]}>
        <Text style={styles.sentence}>
          <Text style={styles.strong}>{person.username}</Text>
          {what} <Text style={styles.when}>{timeAgo(item.at)}</Text>
        </Text>
      </Pressable>
      {item.kind === 'like' ? (
        <LikedThumb
          path={item.photoPath}
          drinkId={item.drinkId}
          onPress={() => onOpenPost(item.postId)}
        />
      ) : (
        <FollowButton following={following} name={person.displayName} onToggle={onToggleFollow} />
      )}
    </View>
  );
}

/** The pour that was liked, as a 44pt thumbnail: its photo, or its drink's art on the wash. */
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
      style={[
        styles.thumb,
        { backgroundColor: url === null && drink ? CATEGORY_META[drink.category].wash : colors.bgSunk },
      ]}>
      {url ? (
        <Image
          source={{ uri: url, cacheKey: path ?? undefined }}
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
      ) : url === null && drink ? (
        <DrinkArt drink={drink} size={30} flat />
      ) : null}
    </PressableScale>
  );
}

/* ==================================================================== */

/** Where a row's text starts: the gutter, the 40pt face and the gap after it. */
const TEXT_INSET = layout.gutter + 40 + space.md;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
  rowText: { flex: 1 },
  pressed: { opacity: 0.5 },
  sentence: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  strong: { fontFamily: fonts.bodySemiBold },
  when: { color: colors.textMuted },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
