import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { Grain } from '@/components/Grain';
import { ACCOUNT_ID } from '@/components/PeerProfile';
import { PersonRow } from '@/components/PeopleList';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { TabStrip, type TabStripItem } from '@/components/TabStrip';
import { EmptyState, Hold, Notice } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { CONNECTIONS_PAGE, fetchConnections } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Followers and following                                              */
/*                                                                      */
/* Opened from the counts in a profile's header, yours or anyone's.      */
/* Follows are already readable by any signed-in account (the counts     */
/* need them), so the lists expose nothing new, and anyone blocked       */
/* either way is missing from them: RLS drops the edge and the profile.  */
/*                                                                      */
/* The two lists are tabs of one screen, and the tab is the `list`       */
/* param, so Back from a person returns to the list you were reading.   */
/*                                                                      */
/* Rows toggle Follow at once, with no confirmation: a list of people is */
/* a bulk tool. Only a profile's own header asks before an unfollow.     */
/* ==================================================================== */

type List = 'followers' | 'following';

const LISTS: readonly TabStripItem<List>[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'following', label: 'Following' },
];

const NO_PEOPLE: UserProfile[] = [];

function ownEntry<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

export default function ConnectionsScreen() {
  const params = useLocalSearchParams<{ id: string; list?: string }>();
  // Account ids are lowercase everywhere they are stored, and a link may not be.
  const id = String(params.id ?? '').toLowerCase();
  const list: List = params.list === 'following' ? 'following' : 'followers';
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /*
   * Back is the stack's back. Opened cold there is nothing under this
   * screen, and the sign-in form's close lands on the Dex, which works
   * signed out, rather than closing onto nothing.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <Connections id={id} list={list} myId={myId} onBack={leave} />;
}

function Connections({
  id,
  list,
  myId,
  onBack,
}: {
  id: string;
  list: List;
  myId: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const wellFormed = ACCOUNT_ID.test(id);
  const isSelf = id === myId.toLowerCase();
  const cached = useSocial((s) => ownEntry(s.profiles, id));
  const me = useAuth((s) => s.profile);
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);

  const username = cached?.username ?? (isSelf && me ? me.username : undefined);
  const whose = isSelf ? 'you' : username ? `@${username}` : 'this account';

  /*
   * Keyed by whose list and which, like every other async state here: a
   * switch of tab reads as loading at once, never as the other list for a
   * frame. A failed refetch keeps the rows already shown.
   */
  const who = `${id}|${list}`;
  const [asked, setAsked] = useState({ who: '', n: 0 });
  const request = `${who}#${asked.who === who ? asked.n : 0}`;
  const [loaded, setLoaded] = useState<{
    who: string;
    request: string;
    people: UserProfile[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    // A bad id cannot be an account: straight to the empty list, no request.
    if (!wellFormed) return;
    let alive = true;
    fetchConnections(id, list)
      .then((people) => {
        if (alive) setLoaded({ who, request, people, failed: false });
      })
      .catch(() => {
        if (!alive) return;
        setLoaded((prev) => ({
          who,
          request,
          people: prev?.who === who ? prev.people : NO_PEOPLE,
          failed: true,
        }));
      });
    return () => {
      alive = false;
    };
  }, [wellFormed, id, list, who, request]);

  const mine = loaded?.who === who ? loaded : null;
  const current = mine?.request === request;
  const status: 'loading' | 'ready' | 'error' = !wellFormed
    ? 'ready'
    : !mine || (mine.failed && !current)
      ? 'loading'
      : mine.failed
        ? 'error'
        : 'ready';
  const people = mine?.people ?? NO_PEOPLE;
  /*
   * Only over a list already held. Back on a tab you pulled earlier, its
   * rows are gone (one list is held at a time), and that first load is the
   * Hold's to show, not a second spinner in the pull slot.
   */
  const reloading = asked.who === who && asked.n > 0 && !!mine && !current;
  const reload = () => setAsked({ who, n: asked.who === who ? asked.n + 1 : 1 });

  const empty =
    status === 'loading' ? (
      <Hold fill={false} slowMessage="Still loading this list." />
    ) : status === 'error' ? (
      <EmptyState
        icon="alert"
        title="Could not load this list"
        body="Check your connection and try again."
        action={{ label: 'Try again', onPress: reload }}
        actionVariant="secondary"
      />
    ) : list === 'followers' ? (
      <EmptyState
        icon="users"
        title="No followers yet"
        body={`When someone follows ${whose}, they show up here.`}
      />
    ) : isSelf ? (
      <EmptyState
        icon="users"
        title="Not following anyone yet"
        body="Follow friends and their pours land on Home."
        action={{ label: 'Find friends', onPress: () => router.push('/find-friends') }}
      />
    ) : (
      <EmptyState
        icon="users"
        title="Not following anyone yet"
        body={`${username ? `@${username}` : 'This account'} hasn't followed anyone yet.`}
      />
    );

  return (
    <View style={styles.screen}>
      {/* The page's own grain, under everything: there is no global grain any more. */}
      <Grain />
      {/*
        No rule under the bar: the tab strip sits right below it and is
        fixed, so the list scrolls under the strip's own rule, never under
        the bar. The strip stays put because switching lists is the thing
        this screen is for, and scrolling back up two hundred rows to do it
        would not be.
      */}
      <ScreenTopBar
        title={username ?? 'People'}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        showRule={false}
      />
      <TabStrip
        items={LISTS}
        value={list}
        onChange={(next) => router.setParams({ list: next })}
      />
      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        renderItem={({ item, index }) => {
          const self = item.id === myId;
          return (
            <PersonRow
              person={item}
              following={following.includes(item.id)}
              onToggle={() => void toggleFollow(myId, item.id)}
              // You, in someone's list: no Follow, and your name opens your own tab.
              hideFollow={self}
              onOpen={self ? () => router.navigate('/profile') : undefined}
              gutter
              separator={index < people.length - 1}
            />
          );
        }}
        ListHeaderComponent={
          status === 'error' && people.length > 0 ? (
            <Notice tone="error" style={styles.notice}>
              Could not refresh. Pull down to try again.
            </Notice>
          ) : null
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          // A full page is the newest edges, not everyone; say so rather than stop.
          people.length >= CONNECTIONS_PAGE ? (
            <Text style={styles.footer}>
              Showing the latest {formatCount(CONNECTIONS_PAGE)}.
            </Text>
          ) : null
        }
        refreshing={reloading}
        onRefresh={wellFormed ? reload : undefined}
        initialNumToRender={12}
        windowSize={7}
        // Transparent, so the page's grain shows under the rows.
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  notice: { marginHorizontal: layout.gutter, marginTop: space.md, marginBottom: space.sm },
  footer: {
    ...textRole.helper,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },
});
