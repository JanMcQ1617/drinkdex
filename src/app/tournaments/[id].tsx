import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { InviteSheet } from '@/components/tournaments/InvitePicker';
import { Leaderboard, PendingInvites } from '@/components/tournaments/Leaderboard';
import {
  dateLong,
  dayLong,
  differentDrinks,
  lastMoment,
  peopleCount,
  TournamentRules,
  tournamentErrorText,
} from '@/components/tournaments/TournamentRow';
import { announce, Button, Card, EmptyState, haptic, Hold, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { REPORT_REASONS, reportUser, type ReportReason } from '@/lib/moderation';
import { fetchProfiles } from '@/lib/social';
import {
  deleteTournament,
  endTournament,
  leave,
  respond,
  type Result,
  TOURNAMENT_LIMITS,
  tournamentsHref,
} from '@/lib/tournaments';
import { useAuth } from '@/store/auth';
import { mergeProfiles, useSocial } from '@/store/social';
import { useTournaments } from '@/store/tournaments';
import type { TournamentBoard, UserProfile } from '@/types';

/* ==================================================================== */
/* A tournament (spec v3.1 §11.3)                                       */
/*                                                                      */
/* The head (name, when, the goal, who hosts), then what you can do     */
/* about it (post a drink while it is on, or answer an invitation), the */
/* standings, who is still invited, and the rules. Options in the bar:  */
/* the host invites, ends or deletes; a member leaves or reports the     */
/* host.                                                                */
/*                                                                      */
/* NO DAILY COUNTER. A "1 of 3 today" meter is a quota to fill, which is */
/* the shape App Review 1.4.3 reads as encouraging drinking. The one     */
/* line about the cap appears only once you have reached it, to say why  */
/* a drink posted later today will not count.                           */
/*                                                                      */
/* The board is the tournaments store's (refetched on focus, on a pull   */
/* and after every action); the people in it are merged into the social  */
/* store's profiles, as Activity does.                                  */
/* ==================================================================== */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHECK_CONNECTION = 'Check your connection and try again.';

export default function TournamentScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // Ids are lowercase wherever they are stored, and a link may not be.
  const id = String(params.id ?? '').toLowerCase();
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /* Back is the stack's back; opened cold, the list. */
  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(tournamentsHref());
  }, [router]);

  if (!myId) return <AuthGate onClose={onBack}>{null}</AuthGate>;
  return <TournamentPage key={`${myId}:${id}`} id={id} myId={myId} onBack={onBack} />;
}

/** How the last fetch went: 'gone' is deleted, left, declined, or never yours to see. */
type Outcome = 'ready' | 'gone' | 'failed';

/**
 * The board, then everyone on it, merged into the social store's
 * profiles while the same account is signed in. A failed profile read
 * fails the fetch (the rows would have no names); the board it brought
 * stays in the store, so a refresh failure keeps the page on screen.
 */
async function fetchBoardWithPeople(id: string): Promise<Outcome> {
  const gen = useSocial.getState().gen;
  const r = await useTournaments.getState().loadBoard(id);
  if (!r.ok) return r.reason === 'not_found' ? 'gone' : 'failed';
  const b = r.value;
  try {
    const people = await fetchProfiles(peopleOn(b));
    if (useSocial.getState().gen === gen) {
      useSocial.setState((s) => ({ profiles: mergeProfiles(s.profiles, people) }));
    }
  } catch {
    return 'failed';
  }
  return 'ready';
}

function ownEntry<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** Everyone a board names: the host, the members in the standings, the people still invited. */
function peopleOn(b: TournamentBoard): string[] {
  return [b.hostId, ...b.standings.map((s) => s.userId), ...b.invited];
}

type Busy = 'join' | 'decline' | 'end' | 'delete' | 'leave';

function TournamentPage({ id, myId, onBack }: { id: string; myId: string; onBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wellFormed = UUID.test(id);
  const board = useTournaments((s) => ownEntry(s.boards, id));
  const loadList = useTournaments((s) => s.load);
  const forget = useTournaments((s) => s.forget);
  const profiles = useSocial((s) => s.profiles);
  const [scrolled, onScroll] = useScrolledPast();

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [inviting, setInviting] = useState(false);
  /*
   * The board as it stood when you deleted, left or declined it. Those
   * take it out of the store at once, and without this the page would
   * flip to its empty state under the Back animation.
   */
  const [leaving, setLeaving] = useState<TournamentBoard | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!wellFormed) return;
      let alive = true;
      void fetchBoardWithPeople(id).then((o) => {
        if (alive) setOutcome(o);
      });
      return () => {
        alive = false;
      };
    }, [id, wellFormed]),
  );

  const refetch = async () => setOutcome(await fetchBoardWithPeople(id));
  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const shown = board ?? leaving;
  const gone = !wellFormed || (outcome === 'gone' && !shown);
  /*
   * The store holds the board a round trip before the names on it. On a
   * first visit the page waits for both, rather than drawing "Someone won"
   * and rows of "Someone" for a moment. A board seen before has its names
   * in hand already and draws at once; a failed name read draws it anyway.
   */
  const named = !!shown && peopleOn(shown).every((p) => ownEntry(profiles, p) !== undefined);

  /* ---- Before there is a board to draw, with its names ---- */
  if (!shown || (outcome === null && !named)) {
    return (
      <View style={styles.screen}>
        <Grain />
        <ScreenTopBar
          title="Tournament"
          showRule={false}
          left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        />
        <View style={styles.center}>
          {gone ? (
            <EmptyState
              icon="trophy"
              title="This tournament is not available"
              body="The host may have deleted it, or you are no longer in it."
              action={{ label: 'Back to tournaments', onPress: onBack }}
            />
          ) : outcome === 'failed' ? (
            <EmptyState
              icon="alert"
              title="Could not load this tournament"
              body={CHECK_CONNECTION}
              actionVariant="secondary"
              action={{
                label: 'Try again',
                onPress: () => {
                  setOutcome(null);
                  void refetch();
                },
              }}
            />
          ) : (
            <Hold fill={false} slowMessage="Still loading this tournament." />
          )}
        </View>
      </View>
    );
  }

  return (
    <BoardView
      board={shown}
      myId={myId}
      profiles={profiles}
      refreshFailed={outcome === 'failed'}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      scrolled={scrolled}
      onScroll={onScroll}
      bottomInset={insets.bottom}
      busy={busy}
      inviting={inviting}
      onBack={onBack}
      onInvite={() => setInviting(true)}
      onCloseInvite={() => setInviting(false)}
      onInvited={(n) => {
        setInviting(false);
        announce(`Invited ${peopleCount(n)}`);
        void refetch();
        void loadList();
      }}
      onFindFriends={() => {
        setInviting(false);
        router.push('/find-friends');
      }}
      run={async (kind, call, failTitle) => {
        if (busy) return;
        setBusy(kind);
        const r = await call();
        setBusy(null);
        if (!r.ok) {
          haptic.error();
          Alert.alert(failTitle, tournamentErrorText(r.reason, CHECK_CONNECTION));
          // Whatever refused it may have changed the page (it finished, or was deleted).
          void refetch();
          void loadList();
          return;
        }
        if (kind === 'delete' || kind === 'leave' || kind === 'decline') {
          haptic.select();
          announce(
            kind === 'delete'
              ? 'Tournament deleted'
              : kind === 'leave'
                ? `You left ${shown.name}`
                : `Declined ${shown.name}`,
          );
          // It is no longer yours to see: off this page, and out of the list at once.
          setLeaving(shown);
          onBack();
          forget(id);
          void loadList();
          return;
        }
        haptic.success();
        announce(kind === 'join' ? `Joined ${shown.name}` : `${shown.name} has ended`);
        void refetch();
        void loadList();
      }}
    />
  );
}

function BoardView({
  board,
  myId,
  profiles,
  refreshFailed,
  refreshing,
  onRefresh,
  scrolled,
  onScroll,
  bottomInset,
  busy,
  inviting,
  onBack,
  onInvite,
  onCloseInvite,
  onInvited,
  onFindFriends,
  run,
}: {
  board: TournamentBoard;
  myId: string;
  profiles: Record<string, UserProfile>;
  refreshFailed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  scrolled: boolean;
  onScroll: ReturnType<typeof useScrolledPast>[1];
  bottomInset: number;
  busy: Busy | null;
  inviting: boolean;
  onBack: () => void;
  onInvite: () => void;
  onCloseInvite: () => void;
  onInvited: (count: number) => void;
  onFindFriends: () => void;
  run: (kind: Busy, call: () => Promise<Result<void>>, failTitle: string) => Promise<void>;
}) {
  const router = useRouter();
  const host = ownEntry(profiles, board.hostId);
  const isHost = board.myStatus === 'host';
  const member = isHost || board.myStatus === 'accepted';
  const invitedMe = board.myStatus === 'invited';
  const live = board.state === 'live';
  const finished = board.state === 'finished';
  const mine = board.standings.find((s) => s.userId === myId);
  const hostLabel = host ? `@${host.username}` : null;

  /* ---- The head's three lines ---- */
  const status = live
    ? `On now · ends ${dayLong(lastMoment(board.endsAt))}`
    : finished
      ? `Finished ${dateLong(lastMoment(board.finishedAt ?? board.endsAt))}`
      : `Starts ${dayLong(new Date(board.startsAt))}`;
  const goalLine =
    board.target === null
      ? 'Most different drinks by the end wins'
      : `First to ${differentDrinks(board.target)} wins`;
  const hostedLine = isHost ? 'Hosted by you' : hostLabel ? `Hosted by ${hostLabel}` : 'Hosted by another member';

  /* ---- Who won ---- */
  const winnerStanding = board.winnerId ? board.standings.find((s) => s.userId === board.winnerId) : undefined;
  const winnerProfile = board.winnerId ? ownEntry(profiles, board.winnerId) : undefined;
  const winnerName = board.winnerId === myId ? 'You' : winnerProfile ? `@${winnerProfile.username}` : 'Someone';
  // The count is the winner's frozen row; without it the panel names the winner and claims no figure.
  const winnerLine = board.winnerHidden
    ? 'The winner is hidden.'
    : board.winnerId
      ? winnerStanding
        ? `${winnerName} won with ${differentDrinks(winnerStanding.distinct)}`
        : `${winnerName} won`
      : 'Nobody posted a drink, so there is no winner.';

  /* ---- The options sheet ---- */
  const confirm = (title: string, body: string, action: string, onConfirm: () => void) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: onConfirm },
    ]);

  const confirmEnd = () =>
    confirm(`End ${board.name} now?`, 'Standings freeze and whoever is ahead wins.', 'End', () =>
      void run('end', () => endTournament(board.id), 'Could not end the tournament'),
    );
  const confirmDelete = () =>
    confirm(`Delete ${board.name}?`, 'It disappears for everyone in it. This cannot be undone.', 'Delete', () =>
      void run('delete', () => deleteTournament(board.id), 'Could not delete the tournament'),
    );
  const confirmLeave = () =>
    confirm(`Leave ${board.name}?`, 'Your drinks stop counting and you cannot rejoin.', 'Leave', () =>
      void run('leave', () => leave(board.id), 'Could not leave the tournament'),
    );
  /* Declining is final for this tournament, so it asks first, as Leave does. */
  const confirmDecline = () =>
    confirm(`Decline ${board.name}?`, 'You cannot join it later.', 'Decline', () =>
      void run('decline', () => respond(board.id, false), 'Could not decline'),
    );

  /*
   * The existing reason sheet, as a profile's Report is built: the same
   * reasons, an action sheet on iOS, not styled destructive (filing one
   * removes nothing). The tournament rides along in the report's note.
   */
  const openReport = () => {
    const file = (reason: ReportReason) => {
      void reportUser(myId, board.hostId, reason, `Tournament: ${board.name}`)
        .then(() =>
          Alert.alert('Thanks', 'The host has been reported. You can also block them from their profile.'),
        )
        .catch(() => Alert.alert('Could not report', CHECK_CONNECTION));
    };
    const title = hostLabel ? `Report ${hostLabel}` : 'Report the host';
    const message =
      'What is wrong with this tournament? Reports are reviewed privately; the host is not told who reported them.';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [...REPORT_REASONS.map((r) => r.label), 'Cancel'],
          cancelButtonIndex: REPORT_REASONS.length,
        },
        (i) => {
          const reason = REPORT_REASONS[i];
          if (reason) file(reason.key);
        },
      );
      return;
    }
    Alert.alert(title, message, [
      ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => file(r.key) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  /*
   * The host, before it finishes: invite, end (only while it is on: one
   * that has not started is deleted, not ended), delete. Anyone else in
   * it: leave (a member, before it finishes) and report the host. Nothing
   * to offer, no button.
   */
  const options: { label: string; destructive?: boolean; onPress: () => void }[] = [];
  if (isHost) {
    // A finished tournament can still be deleted (delete_tournament allows
    // it in any state); inviting and ending only make sense before the end.
    if (!finished) options.push({ label: 'Invite people', onPress: onInvite });
    if (live) options.push({ label: 'End tournament', onPress: confirmEnd });
    options.push({ label: 'Delete tournament', destructive: true, onPress: confirmDelete });
  } else if (!isHost && (member || invitedMe)) {
    if (member && !finished) options.push({ label: 'Leave tournament', destructive: true, onPress: confirmLeave });
    options.push({ label: hostLabel ? `Report ${hostLabel}` : 'Report the host', onPress: openReport });
  }

  const openOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: board.name,
          options: [...options.map((o) => o.label), 'Cancel'],
          cancelButtonIndex: options.length,
          destructiveButtonIndex: options.flatMap((o, i) => (o.destructive ? [i] : [])),
        },
        (i) => options[i]?.onPress(),
      );
      return;
    }
    Alert.alert(board.name, undefined, [
      ...options.map((o) => ({
        text: o.label,
        style: o.destructive ? ('destructive' as const) : ('default' as const),
        onPress: o.onPress,
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const openPerson = (id: string) => {
    if (id === myId) router.navigate('/profile');
    else router.navigate({ pathname: '/user/[id]', params: { id } });
  };

  /* Everyone already in it or asked is not offered again; the seats left are the server's 50 less them. */
  const inIt = new Set([board.hostId, ...board.standings.map((s) => s.userId), ...board.invited]);
  const seatsLeft = Math.max(0, TOURNAMENT_LIMITS.maxMembers - board.standings.length - board.invited.length);

  return (
    <View style={styles.screen}>
      <Grain />
      {/* The name in the bar is one line and truncates: it is a tournament's name, not a drink's. */}
      <ScreenTopBar
        title={board.name}
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        right={
          options.length > 0 ? (
            <TopBarButton icon="more" label="Tournament options" onPress={openOptions} />
          ) : null
        }
      />
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + space.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        showsVerticalScrollIndicator={false}>
        {refreshFailed ? (
          <Notice tone="error" style={styles.notice}>
            Could not refresh. Pull down to try again.
          </Notice>
        ) : null}

        {/* ---- Head ---- */}
        <View style={styles.head}>
          <Text style={styles.name} accessibilityRole="header">
            {board.name}
          </Text>
          <Text style={styles.line}>{status}</Text>
          <Text style={styles.line}>{goalLine}</Text>
          <Text style={styles.line}>{hostedLine}</Text>
        </View>

        {/* ---- Finished: who won ---- */}
        {finished ? (
          <Card style={styles.winner}>
            <View style={styles.winnerRow} accessible accessibilityLabel={winnerLine}>
              {board.winnerId || board.winnerHidden ? (
                <Icon name="trophy" size={28} color={colors.wine} />
              ) : null}
              <Text style={styles.winnerText}>{winnerLine}</Text>
            </View>
          </Card>
        ) : null}

        {/* ---- On now, for someone in it: post. The cap is said only once it is reached. ---- */}
        {live && member ? (
          <View style={styles.actions}>
            <Button label="Post a drink" icon="plus" block onPress={() => router.navigate('/log')} />
            {mine && mine.today >= board.dailyCap ? (
              <Text style={styles.line}>
                {board.dailyCap} new drinks counted today. Drinks you post later today will not count in
                this tournament.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ---- An invitation ---- */}
        {invitedMe && !finished ? (
          <View style={styles.actions}>
            <Button
              label="Join"
              block
              loading={busy === 'join'}
              disabled={busy === 'decline'}
              onPress={() => void run('join', () => respond(board.id, true), 'Could not join')}
            />
            <Button
              label="Decline"
              variant="secondary"
              block
              loading={busy === 'decline'}
              disabled={busy === 'join'}
              onPress={confirmDecline}
            />
          </View>
        ) : null}

        {/* ---- Standings ---- */}
        {board.standings.length > 0 ? (
          <>
            <SectionHeader title="Standings" size="group" style={styles.header} />
            {board.state === 'upcoming' ? (
              <Text style={[styles.line, styles.groupNote]}>
                Coming up: drinks count from {dayLong(new Date(board.startsAt))}
              </Text>
            ) : null}
            <Leaderboard
              standings={board.standings}
              people={profiles}
              myId={myId}
              state={board.state}
              winnerId={board.winnerId}
              onOpenPerson={openPerson}
            />
          </>
        ) : null}

        {/* ---- Still invited: for the people in it, while it can still be joined ---- */}
        {member && !finished && board.invited.length > 0 ? (
          <>
            <SectionHeader title="Invited" size="group" style={styles.header} />
            <PendingInvites ids={board.invited} people={profiles} />
          </>
        ) : null}

        <TournamentRules cap={board.dailyCap} style={styles.rules} />
      </ScrollView>

      {isHost && !finished ? (
        <InviteSheet
          visible={inviting}
          tournamentId={board.id}
          myId={myId}
          exclude={inIt}
          max={seatsLeft}
          onClose={onCloseInvite}
          onInvited={onInvited}
          onFindFriends={onFindFriends}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  /* Clear, so the screen's grain shows through. */
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
  center: { flex: 1, justifyContent: 'center' },
  notice: { marginTop: space.lg },

  head: { paddingTop: space.lg, gap: space.xs },
  name: { ...textRole.emptyTitle, color: colors.text, marginBottom: space.xs },
  line: { ...textRole.helper, color: colors.textMuted },

  winner: { marginTop: space.xl, padding: space.lg },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  winnerText: { ...textRole.sectionTitle, flex: 1, color: colors.text },

  actions: { marginTop: space.xl, gap: space.md },

  header: { marginTop: space.xl, marginBottom: space.sm },
  /* Under a group header, in line with it and with the rows below. */
  groupNote: { paddingHorizontal: space.lg, marginBottom: space.sm },
  rules: { marginTop: space.xl },
});
