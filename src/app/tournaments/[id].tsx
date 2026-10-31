import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { Paper } from '@/components/details/Paper';
import { PenSwash } from '@/components/details/PenMarks';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { InviteSheet } from '@/components/tournaments/InvitePicker';
import { JoinCodeCard } from '@/components/tournaments/JoinCode';
import { Leaderboard, PendingInvites } from '@/components/tournaments/Leaderboard';
import {
  dateLong,
  DaySpan,
  dayLong,
  differentDrinks,
  type Fact,
  Facts,
  lastMoment,
  peopleCount,
  TournamentRules,
  tournamentErrorText,
} from '@/components/tournaments/TournamentRow';
import { announce, Avatar, Button, Card, EmptyState, haptic, Hold, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space, tabular, textRole } from '@/constants/theme';
import { REPORT_REASONS, reportUser, type ReportReason } from '@/lib/moderation';
import { fetchProfiles } from '@/lib/social';
import {
  deleteTournament,
  endTournament,
  fetchJoinCode,
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
/* standings, who is still invited, and the rules. Options sit beside  */
/* the name (the bar holds only the back chevron): the host invites,    */
/* ends or deletes; a member leaves or reports the host.                */
/*                                                                      */
/* THE HEAD IN FIGURES (v4.11, specs/v4.11/tournaments.md 3). Under the */
/* name, its first and last day as two calendar pages and a facts line  */
/* (on now, the goal, who hosts, how many are in it), where two lines   */
/* of sentences were; the winner as the trophy, a face and the count.   */
/* Each still says its sentence to VoiceOver ("On now, ends Sunday.     */
/* First to 10 entries wins. Hosted by @ana. 5 people."). The rules are */
/* the one line and its "i" key, at the foot as before.                 */
/*                                                                      */
/* NO DAILY COUNTER. A "1 of 3 today" meter is a quota to fill, which   */
/* is the shape App Review 1.4.3 reads as encouraging drinking. The one */
/* line about the cap appears only once you have reached it, to say why */
/* a drink posted later today will not count, in plain words: no tick   */
/* or other glyph beside it, which would mark the cap as a quota met.   */
/*                                                                      */
/* The board is the tournaments store's (refetched on focus, on a pull   */
/* and after every action); the people in it are merged into the social  */
/* store's profiles, as Activity does.                                  */
/*                                                                      */
/* THE SWASH UNDER THE NAME (v4.7, specs/v4.7/spec.md 6.1 #11). The     */
/* name is a page title (textRole.title, Archivo 600 28), the one       */
/* pushed screen with a title of its own in the body rather than in the */
/* bar, so it is signed the way a tab root's title is: the pen's swash, */
/* from the title's own box (3pt lower than a tab root's, clear of a    */
/* typed name's descenders). It is ornament, never a state: it reads    */
/* the same on now, coming up or finished; VoiceOver never meets it.    */
/* It stays static (v4.9 B): this is a pushed page, not a tab opening.  */
/* The standings get no rule (a margin rule beside them would sit 3.4pt */
/* from your row's wash and read as its border).                        */
/*                                                                      */
/* v4.9 (specs/v4.9/details/spec.md C.7, A.5). While it is on, the      */
/* leader's face wears the pen's crown (Leaderboard), the screen's one  */
/* other mark. The page and its bar lie on the paper (the sweep since   */
/* v4.10, specs/v4.10/spec.md G), meeting as one sheet, and so does the */
/* page that waits for the board, so the sweep is already there when    */
/* the board draws. A tournament that is not available and a load that  */
/* failed stay bare, as every dead end and error does.                  */
/*                                                                      */
/* THE JOIN CODE (v4.12, specs/v4.12/join-codes.md). For the host and   */
/* everyone in it, while it has not finished: a "Join code" head, the   */
/* six boxes, Copy and Share (JoinCodeCard), after what you can do and   */
/* before the standings, so the way to bring someone in is near the top */
/* while it is coming up. Read from the tournament's row once per visit */
/* (lib/tournaments' fetchJoinCode; it never changes), and again with   */
/* the next board load (a pull, a return) while a read has come back    */
/* empty, so a weak connection costs it only until the next pull. Not   */
/* shown to someone only invited (Join first), nor once it has finished */
/* (nobody can join then), nor without migration 028 (no code to read). */
/* ==================================================================== */

/**
 * The swash's length follows the name's text scale up to here, as the
 * swash under a typed title in a tab's bar does (your profile's handle;
 * a tab root's own title, in the marker, never scales since v4.10,
 * specs/v4.10/spec.md T.8): past it a longer stroke stops reading as a
 * signature and starts reading as an underline.
 */
const NAME_SWASH_CAP = 1.3;

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
  /* The join code, for the people in it while it runs (null: none to show, or not read yet). */
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const wantCode =
    !!board && (board.myStatus === 'host' || board.myStatus === 'accepted') && board.state !== 'finished';
  /*
   * A read that came back empty (offline, a failed call, or no 028) is
   * asked again by the next board load, a pull or a return to the page,
   * or the code never came until the page was opened afresh. Only after
   * an empty one, so a first visit, whose board load and code read are
   * out together, asks once.
   */
  const [codeTry, setCodeTry] = useState(0);
  const codeMissed = useRef(false);
  useEffect(() => {
    if (!wantCode || joinCode) return;
    let alive = true;
    void fetchJoinCode(id).then((c) => {
      if (!alive) return;
      codeMissed.current = c === null;
      setJoinCode(c);
    });
    return () => {
      alive = false;
    };
  }, [id, wantCode, joinCode, codeTry]);
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
        if (!alive) return;
        setOutcome(o);
        if (codeMissed.current) {
          codeMissed.current = false;
          setCodeTry((n) => n + 1);
        }
      });
      return () => {
        alive = false;
      };
    }, [id, wellFormed]),
  );

  const refetch = async () => {
    setOutcome(await fetchBoardWithPeople(id));
    if (codeMissed.current) {
      codeMissed.current = false;
      setCodeTry((n) => n + 1);
    }
  };
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
    // Waiting for the board: on the paper it will draw on. The dead end and the error stay bare (v4.9 A.5).
    const holding = !gone && outcome !== 'failed';
    return (
      <View style={styles.screen}>
        {holding ? <Paper /> : null}
        <ScreenTopBar
          title="Tournament"
          showRule={false}
          left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
          paper={holding}
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
      joinCode={wantCode ? joinCode : null}
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
  joinCode,
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
  /** The code to share, for someone in it while it runs; null hides it. */
  joinCode: string | null;
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
  const { fontScale } = useWindowDimensions();
  const host = ownEntry(profiles, board.hostId);
  const isHost = board.myStatus === 'host';
  const member = isHost || board.myStatus === 'accepted';
  const invitedMe = board.myStatus === 'invited';
  const live = board.state === 'live';
  const finished = board.state === 'finished';
  const mine = board.standings.find((s) => s.userId === myId);
  const hostLabel = host ? `@${host.username}` : null;

  /* ---- The head: two pages and a facts line, said as the sentences they were ---- */
  const status = live
    ? `On now, ends ${dayLong(lastMoment(board.endsAt))}`
    : finished
      ? `Finished ${dateLong(lastMoment(board.finishedAt ?? board.endsAt))}`
      : `Starts ${dayLong(new Date(board.startsAt))}`;
  const goal =
    board.target === null
      ? 'Most entries by the end wins'
      : `First to ${differentDrinks(board.target)} wins`;
  const hosted = isHost ? 'Hosted by you' : hostLabel ? `Hosted by ${hostLabel}` : 'Hosted by another member';
  const members = board.standings.length;
  const headSpoken = `${status}. ${goal}. ${hosted}. ${peopleCount(members)}.`;
  const headFacts: Fact[] = [
    live
      ? { key: 'state', icon: 'play', text: 'On now' }
      : finished
        ? { key: 'state', icon: 'check', text: 'Finished' }
        : { key: 'state', icon: 'calendar', text: 'Coming up' },
    board.target === null
      ? { key: 'goal', icon: 'trophy', text: 'Most entries' }
      : { key: 'goal', icon: 'flag', text: `First to ${board.target}` },
    { key: 'host', icon: 'profile', text: isHost ? 'You' : (hostLabel ?? 'Host') },
    { key: 'people', icon: 'users', text: String(members) },
  ];

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
      : 'Nobody posted an entry, so there is no winner.';

  /* ---- The options sheet ---- */
  const confirm = (title: string, body: string, action: string, onConfirm: () => void) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: onConfirm },
    ]);

  const confirmEnd = () =>
    confirm(`End ${board.name} now?`, 'Standings freeze now, and whoever has the most entries wins.', 'End', () =>
      void run('end', () => endTournament(board.id), 'Could not end the tournament'),
    );
  const confirmDelete = () =>
    confirm(`Delete ${board.name}?`, 'It disappears for everyone in it. This cannot be undone.', 'Delete', () =>
      void run('delete', () => deleteTournament(board.id), 'Could not delete the tournament'),
    );
  const confirmLeave = () =>
    confirm(`Leave ${board.name}?`, 'Your entries stop counting and you cannot rejoin.', 'Leave', () =>
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
          // In ink, as the options sheet is: the system's default tint is the one blue in the app.
          tintColor: colors.text,
          userInterfaceStyle: 'light',
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
          // The system's sheet, in ink: its default tint is the one blue in a black-and-white app.
          tintColor: colors.text,
          userInterfaceStyle: 'light',
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
      {/* The paper first, under everything: fixed while the page scrolls over it. */}
      <Paper />
      {/*
        A pushed screen's bar holds Back and nothing else (layout principle
        8). The name is the head's, not the bar's (a name appears once), and
        the bar still speaks it as its header; the options sit beside the
        name, as a post's ••• sits in its author row.
      */}
      <ScreenTopBar
        title={board.name}
        titleVisible={false}
        showRule={scrolled}
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        paper
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
          <View style={styles.nameRow}>
            {/*
             * The wrapper is the name's own box (it takes the row's flex,
             * so the ••• keeps its place beside it), and the swash is
             * placed from its foot: under the last line of a name that
             * wraps, at that line's start, as under a tab root's title.
             */}
            <View style={styles.nameBox}>
              <Text style={styles.name} accessibilityRole="header">
                {board.name}
              </Text>
              <PenSwash scale={Math.min(fontScale, NAME_SWASH_CAP)} style={styles.swash} />
            </View>
            {options.length > 0 ? (
              <View style={styles.more}>
                <TopBarButton icon="more" label="Tournament options" onPress={openOptions} />
              </View>
            ) : null}
          </View>
          <View style={styles.headFacts} accessible accessibilityLabel={headSpoken}>
            <DaySpan first={new Date(board.startsAt)} last={lastMoment(board.endsAt)} />
            <Facts items={headFacts} />
          </View>
        </View>

        {/* ---- Finished: who won ---- */}
        {finished ? (
          <Card style={styles.winner}>
            {/* The trophy, the face and the count; the sentence is what VoiceOver says. */}
            <View style={styles.winnerRow} accessible accessibilityLabel={winnerLine}>
              {board.winnerId || board.winnerHidden ? (
                <Icon name="trophy" size={28} color={colors.text} />
              ) : null}
              {board.winnerId && winnerProfile ? (
                <Avatar
                  name={winnerProfile.displayName}
                  accent={winnerProfile.accent}
                  size={WINNER_FACE}
                  avatarPath={winnerProfile.avatarPath}
                />
              ) : null}
              <Text style={styles.winnerText}>
                {board.winnerHidden ? 'Winner hidden' : board.winnerId ? winnerName : 'No winner'}
              </Text>
              {board.winnerId && winnerStanding ? (
                <View style={styles.winnerCount}>
                  <Text style={styles.winnerFigure} maxFontSizeMultiplier={1.3}>
                    {winnerStanding.distinct}
                  </Text>
                  <Text style={styles.line} maxFontSizeMultiplier={1.3}>
                    {winnerStanding.distinct === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* ---- On now, for someone in it: post. The cap is said only once it is reached. ---- */}
        {live && member ? (
          <View style={styles.actions}>
            <Button label="Post a drink you've had" icon="plus" block onPress={() => router.navigate('/log')} />
            {/*
             * Only once the cap is reached, never as a count toward it, and
             * plain words with no glyph: a tick beside a day's count reads as
             * a quota met (NO DAILY COUNTER above). Why a later post will not
             * count, nothing more.
             */}
            {mine && mine.today >= board.dailyCap ? (
              <Text
                style={styles.line}
                accessibilityLabel={`${board.dailyCap} entries counted today. Entries you post later today will not count in this tournament.`}>
                {`${board.dailyCap} counted today · later posts today won't count here`}
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

        {/* ---- The join code: for the people in it, while it can still be joined ---- */}
        {joinCode && member && !finished ? (
          <>
            <SectionHeader title="Join code" size="group" style={styles.header} />
            <JoinCodeCard code={joinCode} name={board.name} hosting={isHost} />
          </>
        ) : null}

        {/* ---- Standings ---- */}
        {board.standings.length > 0 ? (
          <>
            {/* Before the start: no note under the head (the first page above says when), and no ranks. */}
            <SectionHeader title="Standings" size="group" style={styles.header} />
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

/** TopBarButton's glyph, for the ••• beside the name. */
const MORE_GLYPH = 26;
/** The winner's face in the panel: the Friends rows' 40. */
const WINNER_FACE = 40;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
  center: { flex: 1, justifyContent: 'center' },
  notice: { marginTop: space.lg },

  head: { paddingTop: space.lg, gap: space.xs },
  /* 8 under the name (not the head's 4): room for the swash's ink below the descenders. */
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.sm },
  nameBox: { flex: 1 },
  name: { ...textRole.title, color: colors.text },
  /*
   * 1 in from the name, its foot 7 under the name's line box: 3 lower than
   * a tab root's swash. A tab root's title is the app's own word, with no
   * descender under the swash's first 56pt; a tournament's name is typed by
   * people and often has one ("Negroni week"), and at 4 the rising right
   * end met the g's tail with 0 to 1pt between them. At 7 the ink sits
   * below Archivo 28's descender line. Since v4.11 the calendar pages
   * start 20 under the box (nameRow's 8, the head's 4 gap, headFacts' 8),
   * so the ink keeps 13 clear of their wash.
   */
  swash: { position: 'absolute', left: 1, bottom: -7 },
  /*
   * The ••• glyph's right edge on the gutter (its 44 box overhangs by the
   * glyph's slack), centred on the name's first line.
   */
  more: {
    marginRight: -(layout.hit - MORE_GLYPH) / 2,
    marginTop: ((textRole.title.lineHeight ?? layout.hit) - layout.hit) / 2,
  },
  line: { ...textRole.small, color: colors.textMuted },
  /*
   * The pages and the facts, 8 under the head's gap: the swash's ink
   * reaches 7 under the name's box and the pages' wash starts 20 under it
   * (nameRow's 8, the head's 4, this 8), so the two never meet.
   */
  headFacts: { marginTop: space.sm, gap: space.md },

  winner: { marginTop: space.xl, padding: space.lg },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  winnerText: { ...textRole.bodyStrong, flex: 1, color: colors.text },
  winnerCount: { alignItems: 'flex-end' },
  winnerFigure: { ...textRole.heroFigure, ...tabular, color: colors.text },

  actions: { marginTop: space.xl, gap: space.md },

  /* A group head insets its own 16 (it was drawn for a panel); this puts its words on the gutter. */
  header: { marginTop: space.xl, marginBottom: space.xs, marginHorizontal: -space.lg },
  rules: { marginTop: space.xl },
});
