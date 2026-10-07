import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarTextButton, useScrolledPast } from '@/components/ScreenTopBar';
import { InvitePicker } from '@/components/tournaments/InvitePicker';
import {
  lastMoment,
  shortDay,
  TournamentRules,
  tournamentErrorText,
} from '@/components/tournaments/TournamentRow';
import { Button, Chip, Field, haptic, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import {
  cleanTournamentName,
  createTournament,
  endFor,
  maxGoalFor,
  startChoice,
  TOURNAMENT_LIMITS,
  tournamentHref,
  tournamentsHref,
  type TournamentError,
  type TournamentLength,
  type TournamentStart,
} from '@/lib/tournaments';
import { useAuth } from '@/store/auth';
import { useTournaments } from '@/store/tournaments';
import { confirmDestructive } from '@/utils/alerts';

/* ==================================================================== */
/* Host a tournament (spec v3.1 §11.3)                                  */
/*                                                                      */
/* A modal sheet: a task you finish or abandon, like posting. A name,   */
/* when it starts, how long it runs, the goal, and who to ask.          */
/*                                                                      */
/* CHIPS, NOT A CALENDAR. There is no date picker in the binary and none */
/* may be added, and every chip is a valid window by construction: a    */
/* start of now, tomorrow or next Monday (at 00:00 on this phone), a    */
/* length of 3 days to 30. The server checks again (create_tournament). */
/*                                                                      */
/* A goal the daily cap makes unreachable is greyed out, not refused    */
/* after the fact: three new drinks count a day, so "First to 10" needs */
/* four days. A length that rules out the goal already chosen moves it  */
/* back to "Most by the end".                                           */
/* ==================================================================== */

const STARTS: readonly { key: TournamentStart; label: string }[] = [
  { key: 'now', label: 'Now' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'nextMonday', label: 'Next Monday' },
];

const LENGTHS: readonly { key: TournamentLength; label: string }[] = [
  { key: '3d', label: '3 days' },
  { key: '1w', label: '1 week' },
  { key: '2w', label: '2 weeks' },
  { key: '30d', label: '30 days' },
];

/** null is "Most by the end": the most different drinks when it ends wins. */
const GOALS: readonly (number | null)[] = [null, ...TOURNAMENT_LIMITS.targetChoices];

/** The host plus 49. */
const MAX_INVITEES = TOURNAMENT_LIMITS.maxMembers - 1;

const CREATE_FAILED = 'Could not create the tournament. Check your connection and try again.';

/*
 * The refusals create_tournament can give, each with its own sentence.
 * Anything else is the generic one: a not_found here means the server has
 * no create_tournament yet (migration 020 missing), and "This tournament
 * is no longer there" would be wrong for one that never existed.
 */
const CREATE_REASONS: readonly TournamentError[] = [
  'invalid_dates',
  'invalid_goal',
  'too_many',
  'no_invitees',
];

/** "Runs Mon 6 Oct to Sun 12 Oct": the end shown inclusive, the last day that counts. */
function runsLine(start: TournamentStart, length: TournamentLength): string {
  const startsAt = startChoice(start);
  return `Runs ${shortDay(startsAt)} to ${shortDay(lastMoment(endFor(startsAt, length)))}`;
}

export default function HostTournamentScreen() {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  /* Opened with nothing under it (a cold link), Cancel lands on the list. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(tournamentsHref());
  }, [router]);

  if (!myId) return <AuthGate onClose={close}>{null}</AuthGate>;
  return <HostForm key={myId} myId={myId} onClose={close} />;
}

function HostForm({ myId, onClose }: { myId: string; onClose: () => void }) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const loadList = useTournaments((s) => s.load);
  const [scrolled, onScroll] = useScrolledPast();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [start, setStart] = useState<TournamentStart>('now');
  const [length, setLength] = useState<TournamentLength>('1w');
  const [goal, setGoal] = useState<number | null>(null);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the server has made it: the sheet then gives way to its page. */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const maxGoal = maxGoalFor(length);
  const someGoalOff = GOALS.some((g) => g !== null && g > maxGoal);
  const named = cleanTournamentName(name).length > 0;
  const canCreate = named && invitees.length > 0;

  /*
   * A sheet closes on a downward swipe, and a name and a list of people
   * would go with it. Both that and Cancel ask first while anything is
   * filled in; mid-create the dismissal is held rather than offered.
   */
  const dirty = !createdId && (name.trim().length > 0 || invitees.length > 0);
  usePreventRemove(dirty, ({ data }) => {
    if (creating) return;
    confirmDestructive(
      'Discard this tournament?',
      'Nothing on this screen has been saved yet.',
      'Discard',
      () => navigation.dispatch(data.action),
    );
  });

  /*
   * Replaced by its page once made. From an effect, after the render that
   * set createdId, so the discard guard above has already let go.
   */
  useEffect(() => {
    if (createdId) router.replace(tournamentHref(createdId));
  }, [createdId, router]);

  /* The sheet's offset from the top of the window, for the keyboard (log.tsx has the whole reason). */
  const { height: windowH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(windowH);

  const chooseLength = (next: TournamentLength) => {
    setLength(next);
    if (goal !== null && goal > maxGoalFor(next)) setGoal(null);
    setError(null);
  };

  const create = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);
    setNameError(null);
    // The dates from the chips as they stand now, not as they stood when the sheet opened.
    const startsAt = startChoice(start);
    const r = await createTournament({
      name,
      startsAt,
      endsAt: endFor(startsAt, length),
      target: goal,
      invitees,
    });
    if (r.ok) {
      // The button keeps its spinner until the page replaces the sheet.
      haptic.success();
      void loadList();
      setCreatedId(r.value);
      return;
    }
    setCreating(false);
    haptic.error();
    // The filter's refusal belongs under the field it is about; the rest above the button.
    if (r.reason === 'objectionable') setNameError(tournamentErrorText(r.reason, CREATE_FAILED));
    else if (CREATE_REASONS.includes(r.reason)) setError(tournamentErrorText(r.reason, CREATE_FAILED));
    else setError(CREATE_FAILED);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheetH : 0}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        setSheetH((prev) => (prev === h ? prev : h));
      }}>
      {/* iOS presents the sheet above the React root, so it carries its own paper grain, first. */}
      <Grain />
      <ScreenTopBar
        title="Host a tournament"
        inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}
        showRule={scrolled}
        left={<TopBarTextButton label="Cancel" muted onPress={onClose} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        {/* 1. Name. Prose, so capitals and autocorrect are on; one line (the server refuses a break). */}
        <Field
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setNameError(null);
          }}
          placeholder="September tasting"
          maxLength={TOURNAMENT_LIMITS.nameMax}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="done"
          error={nameError}
        />

        {/* 2. Starts */}
        <SectionHeader title="Starts" size="group" style={styles.header} />
        <View style={styles.chips}>
          {STARTS.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected={start === c.key}
              onPress={() => {
                setStart(c.key);
                setError(null);
              }}
            />
          ))}
        </View>

        {/* 3. Length, and the window it makes */}
        <SectionHeader title="Length" size="group" style={styles.header} />
        <View style={styles.chips}>
          {LENGTHS.map((c) => (
            <Chip key={c.key} label={c.label} selected={length === c.key} onPress={() => chooseLength(c.key)} />
          ))}
        </View>
        <Text style={styles.helper}>{runsLine(start, length)}</Text>

        {/* 4. Goal */}
        <SectionHeader title="Goal" size="group" style={styles.header} />
        <View style={styles.chips}>
          {GOALS.map((g) => (
            <Chip
              key={g ?? 'most'}
              label={g === null ? 'Most by the end' : `First to ${g}`}
              selected={goal === g}
              disabled={g !== null && g > maxGoal}
              onPress={() => {
                setGoal(g);
                setError(null);
              }}
            />
          ))}
        </View>
        {someGoalOff ? (
          <Text style={styles.helper}>
            Up to {TOURNAMENT_LIMITS.dailyCap} new drinks count a day, so longer goals need a longer
            tournament.
          </Text>
        ) : null}

        {/* 5. Invite */}
        <SectionHeader title="Invite" size="group" style={styles.header} />
        <InvitePicker
          myId={myId}
          selected={invitees}
          onChange={(next) => {
            setInvitees(next);
            setError(null);
          }}
          max={MAX_INVITEES}
          // Nobody to ask: this sheet gives way to Find friends, and Back from there is the list.
          onFindFriends={() => router.replace('/find-friends')}
        />

        {/* 6. The rules */}
        <TournamentRules style={styles.rules} />
      </ScrollView>

      {/* 7. The footer: paper and its grain, outside the scroll, where the thumb is. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Grain />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          label="Create and invite"
          onPress={() => void create()}
          disabled={!canCreate}
          loading={creating}
          block
          accessibilityHint={
            canCreate
              ? undefined
              : !named
                ? 'Give the tournament a name first'
                : 'Invite at least one person first'
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xl },
  /* Flush with the chips and the field at the gutter, not inset like a ListGroup's header. */
  header: { paddingHorizontal: 0, marginTop: space.xl, marginBottom: space.sm },
  /* 12pt between wrapped rows, so each chip's 6pt slop above and below never overlaps the next row's. */
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, rowGap: space.md },
  helper: { ...textRole.helper, color: colors.textMuted, marginTop: space.sm },
  rules: { marginTop: space.xl },
  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
});
