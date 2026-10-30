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
import { useScrollEdges } from '@/components/log/scrollEdges';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { GoalPicker, type GoalKind } from '@/components/tournaments/GoalPicker';
import { InvitePicker } from '@/components/tournaments/InvitePicker';
import { RangeCalendar } from '@/components/tournaments/RangeCalendar';
import {
  DaySpan,
  dayLong,
  TournamentRules,
  tournamentErrorText,
} from '@/components/tournaments/TournamentRow';
import { Button, Field, haptic, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import {
  cleanTournamentName,
  createTournament,
  TOURNAMENT_LIMITS,
  tournamentHref,
  tournamentsHref,
  type TournamentError,
} from '@/lib/tournaments';
import {
  caughtUp,
  clampGoal,
  type DayRange,
  defaultRange,
  maxGoal,
  rangeDays,
  toSend,
  WINDOW_RULES,
} from '@/lib/tournamentWindow';
import { useAuth } from '@/store/auth';
import { useTournaments } from '@/store/tournaments';
import { confirmDestructive } from '@/utils/alerts';

/* ==================================================================== */
/* Host a tournament (spec v3.1 §11.3)                                  */
/*                                                                      */
/* A modal sheet: a task you finish or abandon, like posting. A name,   */
/* the dates, the goal, and who to ask.                                 */
/*                                                                      */
/* A CALENDAR, NOT CHIPS (v4.11, specs/v4.11/tournaments.md; Jan, 30    */
/* Oct 2026). Until build 37 the dates were chips (Now, Tomorrow, Next  */
/* Monday; 3 days to 30 days), each a valid window by construction, and */
/* a "Runs Fri 30 Oct to Fri 6 Nov" line. Now the host taps any first   */
/* day and any last day on a month calendar (RangeCalendar), and the    */
/* two pages over it show them, with the days they make as a figure and */
/* the server's 31 beside it. lib/tournamentWindow enables only the     */
/* days create_tournament accepts (a start within its 30 days, a window */
/* of 1 to 31 days, measured as the instants sent). Opened, it is today */
/* to today + 6, the chips' "Now, 1 week".                              */
/*                                                                      */
/* WHAT IS SENT IS WHAT WAS SHOWN. The sheet measures from the moment   */
/* it opened, Create from the press. When the two part (a sheet left    */
/* open past midnight, a clock change taking a day from the goal's      */
/* ceiling: lib/tournamentWindow's toSend), Create sends nothing, the   */
/* sheet measures itself again from the press and says so, and the      */
/* host looks and presses again. A later start or a smaller goal than   */
/* the one on screen is never sent quietly.                             */
/*                                                                      */
/* A GOAL THE HOST SETS (GoalPicker): Most entries, or First to any N   */
/* from 2 to 3 x the days picked (100 at most), with the old 5, 10 and  */
/* 20 as quick picks. N is held as picked and shown clamped to what the */
/* dates allow, so shorter dates lower it and longer ones give it back; */
/* the ceiling is a figure under it, where a sentence used to explain   */
/* the daily cap.                                                       */
/*                                                                      */
/* The rules are the one line and its "i" key (TournamentRules), as     */
/* on every tournament screen.                                          */
/* ==================================================================== */

/** The goal a "First to" opens on, held to what the dates allow. */
const FIRST_TO = 10;

/** The host plus 49. */
const MAX_INVITEES = TOURNAMENT_LIMITS.maxMembers - 1;

const CREATE_FAILED = 'Could not create the tournament. Check your connection and try again.';

/** Create found the sheet out of date (toSend), sent nothing, and measured it again. */
const CAUGHT_UP = 'Time moved on while this was open, so the dates and goal are updated. Check them, then try again.';

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

/** The dates as VoiceOver says them, for the two pages and the figure beside them. */
function spokenDates(range: DayRange, days: number | null, now: Date): string {
  const at = now.getTime();
  if (!range.last) return `Starts ${dayLong(range.first, at)}. Pick the last day.`;
  return `${dayLong(range.first, at)} to ${dayLong(range.last, at)}, ${days} ${days === 1 ? 'day' : 'days'}, ${WINDOW_RULES.maxDays} at most`;
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
  const edges = useScrollEdges();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  /*
   * The moment the sheet measures today and the server's 30 days from.
   * Create measures again, and moves this to the press when the two part.
   */
  const [opened, setOpened] = useState(() => new Date());
  const [range, setRange] = useState<DayRange>(() => defaultRange(opened));
  /* The last whole range: the goal's ceiling while the second tap is still to come. */
  const [settled, setSettled] = useState<{ first: Date; last: Date }>(() => {
    const r = defaultRange(opened);
    return { first: r.first, last: r.last ?? r.first };
  });
  const [goalKind, setGoalKind] = useState<GoalKind>('most');
  /* N as picked; shown clamped to what the dates allow, and sent as shown. */
  const [target, setTarget] = useState(FIRST_TO);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the server has made it: the sheet then gives way to its page. */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const ceiling = maxGoal(settled.first, settled.last, opened);
  const shownTarget = clampGoal(target, ceiling) ?? WINDOW_RULES.minTarget;
  const days = range.last ? rangeDays(range.first, range.last) : null;
  const named = cleanTournamentName(name).length > 0;
  const dated = range.last !== null;
  const canCreate = named && dated && invitees.length > 0;

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

  const chooseDates = (next: DayRange) => {
    setRange(next);
    if (next.last) setSettled({ first: next.first, last: next.last });
    setError(null);
  };

  const create = async () => {
    if (!canCreate || creating) return;
    /*
     * The dates measured now, not when the sheet opened: a first day of
     * today starts at this moment, which is what the server will measure.
     * The goal goes as shown. When either is no longer what the sheet
     * shows (toSend), nothing is sent: the sheet catches up with this
     * moment (the calendar, its pages, the days and the goal's ceiling)
     * and says so, rather than make a different tournament quietly.
     */
    const last = range.last ?? range.first;
    const at = new Date();
    const sent = toSend({ first: range.first, last }, goalKind === 'first' ? shownTarget : null, at);
    if (!sent) {
      const next = caughtUp(range, at);
      setOpened(at);
      setRange(next);
      if (next.last) setSettled({ first: next.first, last: next.last });
      haptic.error();
      setError(CAUGHT_UP);
      return;
    }
    setCreating(true);
    setError(null);
    setNameError(null);
    const r = await createTournament({ name, ...sent, invitees });
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
      <ScreenTopBar
        title="Host a tournament"
        inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}
        showRule={edges.under}
        left={<TopBarTextButton label="Cancel" muted onPress={onClose} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={edges.onScroll}
        onLayout={edges.onLayout}
        onContentSizeChange={edges.onContentSizeChange}
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
          placeholder="September field notes"
          maxLength={TOURNAMENT_LIMITS.nameMax}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="done"
          error={nameError}
        />

        {/* 2. The dates: the two pages and the days they make, then the month. */}
        <SectionHeader title="Dates" size="group" style={styles.header} />
        <View style={styles.dates} accessible accessibilityLabel={spokenDates(range, days, opened)}>
          <DaySpan first={range.first} last={range.last} />
          <View style={styles.days}>
            <Text style={[styles.daysFigure, !days && styles.daysNone]} maxFontSizeMultiplier={1.3}>
              {days ?? '–'}
            </Text>
            <Text style={styles.daysUnder} maxFontSizeMultiplier={1.3}>
              {days === 1 ? 'day' : 'days'} · max {WINDOW_RULES.maxDays}
            </Text>
          </View>
        </View>
        <View style={styles.calendar}>
          {/* Caught up, a new calendar: its page opens on the first day again, not on a month midnight has left. */}
          <RangeCalendar key={opened.getTime()} range={range} now={opened} onChange={chooseDates} />
        </View>

        {/* 3. Goal */}
        <SectionHeader title="Goal" size="group" style={styles.header} />
        <GoalPicker
          kind={goalKind}
          onKind={(next) => {
            setGoalKind(next);
            setError(null);
          }}
          value={shownTarget}
          max={ceiling}
          onStep={(by) => {
            // From the figure shown, and as an update: a held key steps from the last step, not the first.
            setTarget((t) => (clampGoal((clampGoal(t, ceiling) ?? WINDOW_RULES.minTarget) + by, ceiling) ?? t));
            setError(null);
          }}
          onPick={(n) => {
            setTarget(n);
            setError(null);
          }}
        />

        {/* 4. Invite */}
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

        {/* 5. The rules: one line, and the "i" key for the whole of them. */}
        <TournamentRules style={styles.rules} />
      </ScrollView>

      {/* 6. The footer, outside the scroll, where the thumb is: a bar at the foot, ruled only while the form runs under it. */}
      <View style={[styles.footer, edges.moreBelow && styles.footerRuled, { paddingBottom: insets.bottom + space.md }]}>
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
                : !dated
                  ? 'Pick the last day first'
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
  /* The two pages at the left, the days they make at the right; under Larger Text the figure wraps below. */
  dates: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  days: { alignItems: 'flex-end', flexShrink: 1 },
  daysFigure: { ...textRole.heroFigure, color: colors.text },
  daysNone: { color: colors.textMuted },
  daysUnder: { ...textRole.small, color: colors.textMuted, textAlign: 'right' },
  calendar: { marginTop: space.lg },
  rules: { marginTop: space.xl },
  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.md,
    // Always laid out, transparent until the form runs under it, so showing it moves nothing.
    borderTopWidth: stroke.edge,
    borderTopColor: 'transparent',
    backgroundColor: colors.bg,
  },
  footerRuled: { borderTopColor: colors.line },
});
