import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { Icon } from '@/components/icons';
import { useScrollEdges } from '@/components/log/scrollEdges';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { CodeCells } from '@/components/tournaments/JoinCode';
import {
  DaySpan,
  dayLong,
  differentDrinks,
  type Fact,
  Facts,
  lastMoment,
  peopleCount,
  TournamentRules,
} from '@/components/tournaments/TournamentRow';
import { announce, Avatar, Button, EmptyState, haptic, useAnnounce } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import {
  CODE_LENGTH,
  type CodeLookup,
  type CodePreview,
  type CodeTrouble,
  codeTroubleText,
  spokenCode,
  typedCode,
} from '@/lib/tournamentCode';
import { boardHref, joinWithCode, lookupJoinCode, tournamentHref } from '@/lib/tournaments';
import { useAuth } from '@/store/auth';
import { useTournaments } from '@/store/tournaments';

/* ==================================================================== */
/* Join with code (v4.12, specs/v4.12/join-codes.md)                    */
/*                                                                      */
/* Opened from the Tournaments tab's Join with code key, and by a join  */
/* link (drinkdex://join/ABC234, app/+native-intent) with the code       */
/* already in the boxes. A modal sheet, as hosting is: a task you       */
/* finish or abandon.                                                   */
/*                                                                      */
/* SIX BOXES, ONE REAL INPUT (auth/PhoneCodeStep's pattern). A single   */
/* TextInput lies over the row, its text and caret invisible, and the   */
/* boxes (JoinCode's CodeCells) draw what it holds: paste, the keyboard */
/* and VoiceOver all need one real field. Upper case as typed           */
/* (lib/tournamentCode's typedCode drops anything outside the 31), and  */
/* a paste of the whole shared message or its link gives its code.     */
/* The input's ancestors keep one style, ringed or not, so focus never  */
/* reparents it (build 35's keyboard, specs/v4.10/email-focus.md): the  */
/* rings are overlays inside the boxes, a sibling of the input.         */
/*                                                                      */
/* THE SIXTH CHARACTER LOOKS IT UP (tournament_by_code), and the sheet  */
/* shows the invitation before anyone joins: the name, its two days as  */
/* calendar pages, a facts line (on now or coming up, the goal, how     */
/* many are in it), and who hosts it, face and handle. Join is the one  */
/* key, at the foot where the thumb is. Someone already in it gets Open */
/* instead. The server checks everything again when Join is pressed.    */
/*                                                                      */
/* REFUSALS IN FEW WORDS, under the boxes (codeTroubleText): a wrong    */
/* code rings all six in ink, as a wrong phone code does; full,         */
/* finished, can't join, too many tries and no connection leave the     */
/* code alone. Twenty wrong codes in an hour and the server stops       */
/* looking (migration 028), which the line says ("Try again later": it  */
/* counts this clock hour and the last, so the wait is up to two). A    */
/* code that opens something is said too (VoiceOver hears the name and  */
/* the host, as the keyboard goes), not only a refusal.                 */
/*                                                                      */
/* WITHOUT 028 there is nothing to type a code into. The sheet asks the */
/* store as it opens (probeCodes, the host sheet's probe, once per      */
/* launch) and, told there are no codes, says joining with a code is    */
/* not here yet and draws no boxes; a lookup that finds no function     */
/* says the same, for a probe that had not answered. The rules are the  */
/* one line and its "i" key, at the foot, as on every tournament        */
/* screen.                                                              */
/* ==================================================================== */

/** The lookup and joining refusals that say the code itself is wrong: those ring the boxes. */
const RINGS: readonly CodeTrouble[] = ['not_found'];

export default function JoinWithCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const myId = useAuth((s) => s.session?.user.id);
  const given = typedCode(String(params.code ?? ''));

  /* Opened with nothing under it (a cold link), Cancel lands on the tab. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(boardHref());
  }, [router]);

  if (!myId) return <AuthGate onClose={close}>{null}</AuthGate>;
  // A second link while this is open brings its own code: a fresh sheet for it.
  return <JoinForm key={`${myId}:${given}`} given={given} onClose={close} />;
}

/** One lookup's answer, for the code and the attempt it was made for. */
type Answer = { code: string; attempt: number; lookup: CodeLookup };

function JoinForm({ given, onClose }: { given: string; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const edges = useScrollEdges();
  const loadList = useTournaments((s) => s.load);
  const codes = useTournaments((s) => s.codes);
  const probeCodes = useTournaments((s) => s.probeCodes);
  const setCodes = useTournaments((s) => s.setCodes);

  /* Whether the server has codes, once per launch (the host sheet may have asked already): without them, no boxes. */
  useEffect(() => {
    void probeCodes();
  }, [probeCodes]);

  const [code, setCode] = useState(given);
  const [focused, setFocused] = useState(false);
  /* Bumped by Try again, so the same code is looked up once more. */
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinTrouble, setJoinTrouble] = useState<CodeTrouble | null>(null);

  /*
   * The sixth character looks the code up, once per code and attempt. An
   * answer for a code that has since changed is dropped (alive), so a
   * slow answer never lands on the next code typed.
   */
  useEffect(() => {
    if (code.length !== CODE_LENGTH) return;
    let alive = true;
    void lookupJoinCode(code).then((lookup) => {
      if (!alive) return;
      setAnswer({ code, attempt, lookup });
      if (lookup.kind === 'unsupported') setCodes(false);
      if (lookup.kind === 'open' || lookup.kind === 'member' || lookup.kind === 'full') {
        // The invitation, whole, above the key: the keyboard has done its job.
        Keyboard.dismiss();
        /*
         * And VoiceOver hears what the code opened, as it hears a refusal
         * (full is one: its line under the boxes says it), or the field
         * would only lose its keyboard under the finger.
         */
        const p = lookup.preview;
        if (lookup.kind === 'open') announce(`${p.name}, hosted by ${p.host.displayName}. Join is at the bottom.`);
        if (lookup.kind === 'member') announce(`You're already in ${p.name}. Open tournament is at the bottom.`);
      } else if (lookup.kind !== 'unsupported') {
        haptic.error();
      }
    });
    return () => {
      alive = false;
    };
  }, [code, attempt, setCodes]);

  /* The answer for what the boxes hold now, or null while it is asked (or not whole yet). */
  const current = answer && answer.code === code && answer.attempt === attempt ? answer.lookup : null;
  const checking = code.length === CODE_LENGTH && current === null;
  const preview: CodePreview | null =
    current && (current.kind === 'open' || current.kind === 'member' || current.kind === 'full')
      ? current.preview
      : null;
  const lookupTrouble: CodeTrouble | null =
    current === null || current.kind === 'open' || current.kind === 'member' ? null : current.kind;
  const trouble = joinTrouble ?? lookupTrouble;
  /* Told before anything was typed (the probe), or by the lookup itself. */
  const unsupported = codes === false || trouble === 'unsupported';
  const troubleText = trouble ? codeTroubleText(trouble) : null;
  // Spoken: the line under the boxes is not a field's own error, which would say it itself.
  useAnnounce(troubleText);

  const type = (raw: string) => {
    const next = typedCode(raw, code);
    if (next === code) return;
    setCode(next);
    setJoinTrouble(null);
  };

  const join = async () => {
    if (!preview || current?.kind !== 'open' || joining) return;
    setJoining(true);
    setJoinTrouble(null);
    const r = await joinWithCode(code);
    if (r.kind === 'joined' || r.kind === 'member') {
      // The key keeps its spinner until the tournament's page replaces the sheet.
      haptic.success();
      announce(r.kind === 'joined' ? `Joined ${preview.name}` : `You're already in ${preview.name}`);
      void loadList();
      router.replace(tournamentHref(r.id));
      return;
    }
    setJoining(false);
    haptic.error();
    if (r.kind === 'unsupported') setCodes(false);
    setJoinTrouble(r.kind);
  };

  const open = () => {
    if (preview) router.replace(tournamentHref(preview.id));
  };

  /* The sheet's offset from the top of the window, for the keyboard (log.tsx has the whole reason). */
  const { height: windowH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(windowH);

  const retry = trouble === 'offline' || trouble === 'failed';
  const nextCell = Math.min(code.length, CODE_LENGTH - 1);
  const ringed = trouble !== null && RINGS.includes(trouble);

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
        title="Join with code"
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
        {unsupported ? (
          /* 028 is not on the server: no boxes to type into. */
          <EmptyState
            icon="trophy"
            title="Not here yet"
            body="Joining with a code arrives with an update on our side. Nothing to do on yours."
          />
        ) : (
          <>
            {/* 1. The boxes, and the one real input over them. */}
            <View style={styles.codeRow}>
              <CodeCells code={code} ringAt={focused && !ringed ? nextCell : null} error={ringed} />
              <TextInput
                value={code}
                onChangeText={type}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus={!given}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                keyboardType="ascii-capable"
                returnKeyType="join"
                onSubmitEditing={() => void join()}
                caretHidden
                selectionColor="transparent"
                style={styles.codeInput}
                accessibilityLabel="Join code, 6 characters"
                accessibilityValue={{ text: spokenCode(code) }}
                accessibilityHint={troubleText ?? 'From whoever shared the tournament'}
              />
            </View>

            {/* 2. What the code did: a refusal in few words, or the wait. */}
            {troubleText ? (
              <View style={styles.line}>
                <Icon name="alert" size={14} color={colors.text} />
                <Text style={styles.lineText}>{troubleText}</Text>
                {retry ? (
                  <Button
                    label="Try again"
                    variant="text"
                    size="sm"
                    onPress={() => {
                      setJoinTrouble(null);
                      setAttempt((a) => a + 1);
                    }}
                  />
                ) : null}
              </View>
            ) : checking ? (
              <Text style={styles.checking}>Checking the code…</Text>
            ) : null}

            {/* 3. The invitation. */}
            {preview ? <Invitation preview={preview} /> : null}
          </>
        )}

        {/* 4. The rules: one line, and the "i" key for the whole of them. */}
        <TournamentRules style={styles.rules} />
      </ScrollView>

      {/* 5. The one key, where the thumb is: Join, or Open for someone already in it. */}
      {preview && current?.kind !== 'full' ? (
        <View style={[styles.footer, edges.moreBelow && styles.footerRuled, { paddingBottom: insets.bottom + space.md }]}>
          {current?.kind === 'member' ? (
            <Button label="Open tournament" block onPress={open} accessibilityHint="You're already in it" />
          ) : (
            <Button
              label="Join"
              block
              loading={joining}
              disabled={joinTrouble !== null}
              onPress={() => void join()}
              accessibilityLabel={`Join ${preview.name}`}
            />
          )}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** The host's face beside their handle. */
const HOST_FACE = 40;

/**
 * The tournament a code opens, before anyone joins: its name, its first
 * and last day as calendar pages, the facts (on now or coming up, the
 * goal, how many are in it), and who hosts it. Said to VoiceOver as the
 * sentences the facts stand for, as a tournament's head is.
 */
function Invitation({ preview: p }: { preview: CodePreview }) {
  const live = p.state === 'live';
  const facts: Fact[] = [
    live ? { key: 'state', icon: 'play', text: 'On now' } : { key: 'state', icon: 'calendar', text: 'Coming up' },
    p.target === null
      ? { key: 'goal', icon: 'trophy', text: 'Most entries' }
      : { key: 'goal', icon: 'flag', text: `First to ${p.target}` },
    { key: 'people', icon: 'users', text: String(p.members) },
  ];
  const spoken = [
    live ? `On now, ends ${dayLong(lastMoment(p.endsAt))}` : `Starts ${dayLong(new Date(p.startsAt))}`,
    p.target === null ? 'Most entries by the end wins' : `First to ${differentDrinks(p.target)} wins`,
    peopleCount(p.members),
  ].join('. ');
  return (
    <View style={styles.invitation}>
      <Text style={styles.name} accessibilityRole="header">
        {p.name}
      </Text>
      <View style={styles.facts} accessible accessibilityLabel={`${spoken}.`}>
        <DaySpan first={new Date(p.startsAt)} last={lastMoment(p.endsAt)} />
        <Facts items={facts} />
      </View>
      <View style={styles.host} accessible accessibilityLabel={`Hosted by ${p.host.displayName}, @${p.host.username}`}>
        <Avatar name={p.host.displayName} accent={p.host.accent} size={HOST_FACE} avatarPath={p.host.avatarPath} />
        <View style={styles.hostText}>
          <Text style={styles.hostName} numberOfLines={1}>
            {p.host.displayName}
          </Text>
          <Text style={styles.hostHandle} numberOfLines={1}>
            @{p.host.username} · host
          </Text>
        </View>
      </View>
    </View>
  );
}

/** The phone code's row height (JoinCode's CELL_H), so the input covers exactly the boxes. */
const CODE_ROW = 56;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: space.xl, paddingBottom: space.xl },

  codeRow: { height: CODE_ROW },
  /* The real input: the whole row, drawing nothing of its own. */
  codeInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    fontSize: textRole.body.fontSize,
  },

  line: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, minHeight: layout.controlSm },
  lineText: { ...textRole.small, flex: 1, color: colors.text },
  checking: { ...textRole.small, marginTop: space.sm, color: colors.textMuted },

  invitation: { marginTop: space.xl, gap: space.md },
  name: { ...textRole.title, color: colors.text },
  facts: { gap: space.md },
  host: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hostText: { flex: 1 },
  hostName: { ...textRole.bodyStrong, color: colors.text },
  hostHandle: { ...textRole.small, color: colors.textMuted },

  rules: { marginTop: space.xxl },

  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    // Always ruled the same width, transparent until the page runs under it, so showing it moves nothing.
    borderTopWidth: stroke.edge,
    borderTopColor: 'transparent',
    backgroundColor: colors.bg,
  },
  footerRuled: { borderTopColor: colors.line },
});
