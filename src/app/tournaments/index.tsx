import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import {
  rowKind,
  TournamentRow,
  TournamentRules,
  tournamentErrorText,
  type RowKind,
} from '@/components/tournaments/TournamentRow';
import { announce, EmptyState, haptic, Hold, ListGroup, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
import { fetchProfiles } from '@/lib/social';
import { newTournamentHref, respond, tournamentHref } from '@/lib/tournaments';
import { useAuth } from '@/store/auth';
import { mergeProfiles, useSocial } from '@/store/social';
import { useTournaments } from '@/store/tournaments';
import type { TournamentSummary } from '@/types';

/* ==================================================================== */
/* Tournaments (spec v3.1 §11.3)                                        */
/*                                                                      */
/* Opened from the trophy on Home. Every tournament you host, are in or  */
/* are invited to, in four groups shown only when they hold something:   */
/* Invitations (answered right here), On now, Coming up, and the last    */
/* 20 Finished. A tournament counts the different drinks its members     */
/* post while it runs; how much anyone drinks is never counted.          */
/*                                                                      */
/* The list is the tournaments store's, so Home's badge and this screen  */
/* agree: refetched on every focus and pull, and after every answer.     */
/* ==================================================================== */

const FINISHED_SHOWN = 20;

export default function TournamentsScreen() {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /* Back is the stack's back; opened cold, Home, where the trophy is. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <TournamentsBody key={myId} myId={myId} onBack={leave} />;
}

type Section = { key: RowKind; title: string; rows: TournamentSummary[] };

const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);

/** The four groups, each in the order you need it: soonest first, newest finished first. */
function sectionsOf(list: readonly TournamentSummary[]): Section[] {
  const by: Record<RowKind, TournamentSummary[]> = { invite: [], live: [], upcoming: [], finished: [] };
  for (const t of list) {
    const kind = rowKind(t);
    if (kind) by[kind].push(t);
  }
  by.invite.sort((a, b) => time(a.startsAt) - time(b.startsAt));
  by.live.sort((a, b) => time(a.endsAt) - time(b.endsAt));
  by.upcoming.sort((a, b) => time(a.startsAt) - time(b.startsAt));
  by.finished.sort((a, b) => time(b.finishedAt ?? b.endsAt) - time(a.finishedAt ?? a.endsAt));
  const sections: Section[] = [
    { key: 'invite', title: 'Invitations', rows: by.invite },
    { key: 'live', title: 'On now', rows: by.live },
    { key: 'upcoming', title: 'Coming up', rows: by.upcoming },
    { key: 'finished', title: 'Finished', rows: by.finished.slice(0, FINISHED_SHOWN) },
  ];
  return sections.filter((s) => s.rows.length > 0);
}

function TournamentsBody({ myId, onBack }: { myId: string; onBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useTournaments((s) => s.list);
  const supported = useTournaments((s) => s.supported);
  const failed = useTournaments((s) => s.failed);
  const load = useTournaments((s) => s.load);
  const forget = useTournaments((s) => s.forget);
  const profiles = useSocial((s) => s.profiles);
  const [scrolled, onScroll] = useScrolledPast();

  /*
   * True once this screen's own first load has answered. Until then an
   * empty list is "not asked yet", never "No tournaments yet"; a list
   * Home already loaded shows at once.
   */
  const [settled, setSettled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [answering, setAnswering] = useState<{ id: string; join: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void load().finally(() => {
        if (alive) setSettled(true);
      });
      return () => {
        alive = false;
      };
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    setSettled(true);
  };

  const sections = sectionsOf(list);

  /*
   * The names a row needs (who hosts an invitation, who won), merged into
   * the social store's profiles as Activity does, and only while the same
   * account is signed in. A failed read leaves the rows on their fallbacks.
   */
  const wanted = [
    ...new Set(
      sections.flatMap((s) =>
        s.rows.flatMap((t) => (s.key === 'invite' ? [t.hostId] : s.key === 'finished' && t.winnerId ? [t.winnerId] : [])),
      ),
    ),
  ]
    .sort()
    .join(',');
  useEffect(() => {
    const held = useSocial.getState().profiles;
    const missing = wanted.split(',').filter((id) => id && !Object.prototype.hasOwnProperty.call(held, id));
    if (missing.length === 0) return;
    let alive = true;
    const gen = useSocial.getState().gen;
    fetchProfiles(missing).then(
      (people) => {
        if (!alive || useSocial.getState().gen !== gen) return;
        useSocial.setState((s) => ({ profiles: mergeProfiles(s.profiles, people) }));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [wanted]);

  const username = (id: string | null) =>
    id && Object.prototype.hasOwnProperty.call(profiles, id) ? profiles[id]!.username : undefined;

  const open = (t: TournamentSummary) => router.push(tournamentHref(t.id));
  const host = () => router.push(newTournamentHref());

  /*
   * Join or decline here, without opening it. Declining is final for that
   * tournament (the server never invites you to it again), so it asks
   * first, as Leave does; joining does not.
   */
  const answer = async (t: TournamentSummary, join: boolean) => {
    if (answering) return;
    setAnswering({ id: t.id, join });
    const r = await respond(t.id, join);
    setAnswering(null);
    if (r.ok) {
      haptic.success();
      announce(join ? `Joined ${t.name}` : `Declined ${t.name}`);
      if (!join) forget(t.id);
    } else {
      Alert.alert(
        join ? 'Could not join' : 'Could not decline',
        tournamentErrorText(r.reason, 'Check your connection and try again.'),
      );
    }
    void load();
  };

  const decline = (t: TournamentSummary) => {
    Alert.alert(`Decline ${t.name}?`, 'You cannot join it later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void answer(t, false) },
    ]);
  };

  const body = !supported ? (
    /*
     * The server has no tournaments yet (migration 020 not applied). Home
     * hides the trophy then, so only an old link lands here.
     */
    <EmptyState
      icon="trophy"
      title="Tournaments are not here yet"
      body="They arrive with an update on our side. Nothing to do on yours."
    />
  ) : sections.length > 0 ? (
    <>
      {failed ? (
        <Notice tone="error" style={styles.notice}>
          Could not refresh. Pull down to try again.
        </Notice>
      ) : null}
      {sections.map((s, n) => (
        <View key={s.key}>
          <SectionHeader title={s.title} size="group" style={n === 0 ? styles.firstHeader : styles.header} />
          <ListGroup>
            {s.rows.map((t, i) => (
              <TournamentRow
                key={t.id}
                tournament={t}
                kind={s.key}
                myId={myId}
                hostName={username(t.hostId)}
                winnerName={username(t.winnerId)}
                onOpen={() => open(t)}
                onJoin={() => void answer(t, true)}
                onDecline={() => decline(t)}
                answering={answering?.id === t.id ? (answering.join ? 'join' : 'decline') : null}
                separator={i < s.rows.length - 1}
              />
            ))}
          </ListGroup>
        </View>
      ))}
    </>
  ) : !settled ? (
    <Hold fill={false} slowMessage="Still loading your tournaments." />
  ) : failed ? (
    <EmptyState
      icon="alert"
      title="Could not load tournaments"
      body="Check your connection and try again."
      actionVariant="secondary"
      action={{ label: 'Try again', onPress: () => void refresh() }}
    />
  ) : (
    <EmptyState
      icon="trophy"
      title="No tournaments yet"
      body="Host one and invite people you follow. Whoever tries the most different drinks wins."
      action={{ label: 'Host a tournament', onPress: host }}
    />
  );

  return (
    <View style={styles.screen}>
      {/* The page's own grain, under everything. */}
      <Grain />
      <ScreenTopBar
        title="Tournaments"
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        right={supported ? <TopBarButton icon="plus" label="Host a tournament" onPress={host} /> : null}
      />
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.textMuted} />
        }
        showsVerticalScrollIndicator={false}>
        {body}
        {/* The rules, under the list on every visit, in the scroll body. */}
        <TournamentRules style={styles.rules} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  /* Clear, so the screen's grain shows through. */
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
  notice: { marginTop: space.lg },
  firstHeader: { marginTop: space.lg, marginBottom: space.sm },
  header: { marginTop: space.xl, marginBottom: space.sm },
  rules: { marginTop: space.xl },
});
