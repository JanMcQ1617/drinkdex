import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Icon } from '@/components/icons';
import { MatchResults, type MatchEntry } from '@/components/PeopleList';
import { Button, Card } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { formatCount } from '@/data';
import {
  IG_CONNECTIONS_KEY,
  RATE_LIMITED_IMPORT_MESSAGE,
  discoveryErrorMessage,
  dropParkedClaim,
  forgetRememberedHandle,
  getParkedClaims,
  getRememberedHandle,
  matchWithinQuota,
  rememberHandle,
  subscribeDiscovery,
} from '@/lib/discovery';
import {
  DYI_URL,
  compareCloseness,
  connectionsFromText,
  hashHandle,
  normalizeHandle,
  pickExportFiles,
  type ImportedConnection,
} from '@/lib/instagram';
import { matchInstagram, setInstagramHash } from '@/lib/social';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';
import { confirmDestructive } from '@/utils/alerts';

/* ==================================================================== */
/* Instagram import                                                     */
/*                                                                      */
/* The closest thing to "connect Instagram and get all your friends"     */
/* that can actually be built. See src/lib/instagram.ts for why there is */
/* no OAuth button here: no Meta API returns a follower or following     */
/* list to a third-party app, and the one that covered personal accounts */
/* was switched off at the end of 2024.                                  */
/*                                                                      */
/* So the list comes from the only party entitled to it — the user.      */
/* Instagram's "Download your information" gives them their own          */
/* followers and following as JSON; we parse it on the device, hash the  */
/* handles, and match. Nothing but hashes leaves the phone, and the      */
/* handle -> hash map stays local, which is why this file can label a    */
/* matched row "@sarah.g" while the server cannot.                       */
/* ==================================================================== */

/*
 * The parsed list is cached so "Check again" costs one tap instead of
 * another download. It is the reason the feature keeps paying off: the
 * list is stale the moment it is made, and the people worth finding are
 * the ones who join next month.
 *
 * The key lives in lib/discovery.ts, beside clearDiscoveryCache, so the
 * cache and the sign-out that forgets it cannot drift onto two names.
 *
 * Capped well under the 10k import ceiling — AsyncStorage is a single
 * JSON blob per key, and a 10k-entry write on every import is a stutter
 * nobody asked for.
 */
const CACHE_MAX = 5_000;

/*
 * Speaks a notice to VoiceOver as it is set. The notice boxes carry
 * accessibilityLiveRegion, which is Android-only, so on iOS a failed or
 * refused check changed the screen and said nothing. Gated to iOS so
 * Android does not hear it twice; queued so a button's own label change
 * does not cut it off.
 *
 * A copy of the one in FindFriends rather than AuthGate's useAnnounce:
 * AuthGate renders WelcomeConnect, which renders FindFriends, which
 * renders this, so importing from AuthGate is a require cycle.
 */
function announce(message: string) {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  }
}

type Phase = 'idle' | 'reading' | 'matching' | 'done';

export function InstagramImport() {
  const myId = useAuth((s) => s.session?.user.id);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [connections, setConnections] = useState<ImportedConnection[]>([]);
  const [matches, setMatches] = useState<{ profile: UserProfile; hash: string }[]>([]);
  /* True when the day's match quota ran out before the whole list was checked. */
  const [partial, setPartial] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState('');

  /* ---- restore a previous import ---- */
  useEffect(() => {
    AsyncStorage.getItem(IG_CONNECTIONS_KEY)
      .then((raw) => {
        if (!raw) return;
        const cached = JSON.parse(raw) as ImportedConnection[];
        if (Array.isArray(cached) && cached.length) setConnections(cached);
      })
      .catch(() => {
        /* A corrupt cache is not worth surfacing — the next import replaces it. */
      });
  }, []);

  /* ---- matching ---- */

  /*
   * A failure never lands in 'done'. It used to, and 'done' is what draws
   * "None of your 1,843 Instagram connections are here yet" — so a dropped
   * connection was reported as a confident empty result, right under the
   * error. Back to 'idle' instead, where "Check my connections again" is
   * the retry.
   *
   * Sent closest first, a slice at a time (see matchWithinQuota): a large
   * list is more than a day's quota, and when it runs out it should run
   * out on brands and strangers, with the mutuals already checked and
   * shown.
   *
   * A refusal that found nothing is not a failure either, and lands on the
   * phase the caller passes as `refused`. A re-check passes 'done', so the
   * people the last check found stay on screen under the notice instead of
   * vanishing until tomorrow. A new list passes nothing and lands on 'idle'.
   */
  const runMatch = useCallback(async (list: ImportedConnection[], refused: Phase = 'idle') => {
    setPhase('matching');
    setNotice(null);
    try {
      const ordered = [...list].sort(compareCloseness).map((c) => c.hash);
      const { found, limited } = await matchWithinQuota(ordered, matchInstagram);
      if (limited) {
        setNotice(RATE_LIMITED_IMPORT_MESSAGE);
        announce(RATE_LIMITED_IMPORT_MESSAGE);
      }
      if (limited && found.length === 0) {
        if (refused === 'idle') setMatches([]);
        setPhase(refused);
        return;
      }
      setMatches(found);
      setPartial(limited);
      setPhase('done');
    } catch (e) {
      const message = discoveryErrorMessage(
        e,
        'Could not check your list right now. Try again in a moment.',
      );
      setMatches([]);
      setPartial(false);
      setNotice(message);
      announce(message);
      setPhase('idle');
    }
  }, []);

  const persist = useCallback(async (list: ImportedConnection[]) => {
    setConnections(list);
    try {
      await AsyncStorage.setItem(IG_CONNECTIONS_KEY, JSON.stringify(list.slice(0, CACHE_MAX)));
    } catch {
      /* Cache is an optimisation; losing it only costs a re-import. */
    }
  }, []);

  const importFiles = useCallback(async () => {
    /*
     * A cancelled picker goes back to where it was. It used to go to 'done'
     * whenever a list was cached, and a restored list has never been
     * matched — so cancelling "Choose a newer file" announced that none of
     * the user's connections were here, having checked nobody.
     */
    const before: Phase = phase === 'done' ? 'done' : 'idle';
    setNotice(null);
    setPhase('reading');
    setProgress(null);
    try {
      const result = await pickExportFiles((done, total) => setProgress({ done, total }));
      if (!result) {
        setPhase(before);
        return;
      }
      if (result.empty || result.connections.length === 0) {
        const message =
          "That file didn't have any accounts in it. In the download, look inside connections › followers_and_following and pick followers_1.json and following.json.";
        setNotice(message);
        announce(message);
        setPhase('idle');
        return;
      }
      await persist(result.connections);
      await runMatch(result.connections);
    } catch (e) {
      // runMatch catches its own failures; what reaches here is the file.
      const message = discoveryErrorMessage(e, 'Could not read that file. Try choosing it again.');
      setNotice(message);
      announce(message);
      setPhase('idle');
    }
  }, [phase, persist, runMatch]);

  const importPasted = useCallback(async () => {
    setNotice(null);
    setPhase('reading');
    try {
      const list = await connectionsFromText(pasted);
      if (list.length === 0) {
        const message = "Couldn't find any usernames in that.";
        setNotice(message);
        announce(message);
        setPhase('idle');
        return;
      }
      setPasted('');
      setShowPaste(false);
      await persist(list);
      await runMatch(list);
    } catch (e) {
      const message = discoveryErrorMessage(e, 'Could not read that list. Try again.');
      setNotice(message);
      announce(message);
      setPhase('idle');
    }
  }, [pasted, persist, runMatch]);

  const recheck = useCallback(() => {
    void runMatch(connections, phase === 'done' ? 'done' : 'idle');
  }, [connections, phase, runMatch]);

  /**
   * Drops the imported list from the device.
   *
   * Promised in docs/privacy.md, so it has to exist and has to actually
   * clear: the cache, the matches on screen, and the phase, not just the
   * visible list. Nothing server-side to delete — the handles were never
   * sent, only their hashes, and those were never stored.
   *
   * Confirmed first. It sits directly under "Check my connections again",
   * drawn the same way, and getting the list back means finding the
   * export again — or, if it is gone, another request and another wait.
   */
  const forget = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(IG_CONNECTIONS_KEY);
    } catch {
      /* The on-screen list still goes; a stale cache is replaced by the next import. */
    }
    setConnections([]);
    setMatches([]);
    setPartial(false);
    setNotice(null);
    setPhase('idle');
  }, []);

  const confirmForget = useCallback(() => {
    confirmDestructive(
      'Forget your imported list?',
      'To check it again you will need to choose the Instagram files again.',
      'Forget',
      () => void forget(),
    );
  }, [forget]);

  /* ---- rows ---- */

  /*
   * Mutuals first: an Instagram following list is mostly brands and
   * strangers, and the people who follow you back are the ones worth
   * putting at the top. The note is built here rather than server-side
   * because the handle behind a hash only exists on this device.
   *
   * THE HANDLE IS A CLAIM, AND THE ROW SAYS SO. Anyone can type any handle
   * into "Let Instagram friends find you" (see FindableByHandle), and
   * nothing stops two accounts typing the same one. So the row keeps the
   * account's Sipply @username — the one identifier Sipply controls — and
   * words the Instagram handle as theirs to claim. A handle more than one
   * account claims says so, and stays out of "Follow all": following
   * everyone who says they are @sarah.g is how an impostor gets followed.
   *
   * One row per match, built from the matches themselves. It used to walk
   * the connections and look each one's match up by hash, which found the
   * FIRST claimant twice and never the second.
   */
  const entries: MatchEntry[] = useMemo(() => {
    const byHash = new Map(connections.map((c) => [c.hash, c]));
    const claimants = new Map<string, number>();
    for (const m of matches) claimants.set(m.hash, (claimants.get(m.hash) ?? 0) + 1);

    return matches
      .flatMap((m) => {
        const c = byHash.get(m.hash);
        return c ? [{ m, c }] : [];
      })
      .sort((a, b) => compareCloseness(a.c, b.c))
      .map(({ m, c }) => {
        const username = `@${m.profile.username}`;
        const claimedBy = claimants.get(m.hash) ?? 1;
        if (claimedBy > 1) {
          return {
            profile: m.profile,
            note: `${username} · one of ${claimedBy} accounts claiming @${c.handle}`,
            bulk: false,
          };
        }
        const mutual = c.follower && c.followed;
        return {
          profile: m.profile,
          note: `${username} · says they’re @${c.handle}${mutual ? ' · you follow each other' : ''}`,
        };
      });
  }, [connections, matches]);

  /* People, not accounts: a contested handle is one connection, however many claim it. */
  const matchedConnections = new Set(matches.map((m) => m.hash)).size;

  if (!myId) return null;

  const working = phase === 'reading' || phase === 'matching';

  return (
    <View style={styles.wrap}>
      <FindableByHandle myId={myId} />

      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="instagram" size={18} color={colors.wine} />
          <Text style={styles.cardTitle} accessibilityRole="header">
            Bring your Instagram friends
          </Text>
        </View>

        <Text style={styles.cardBody}>
          Instagram doesn’t let any app read your follower list — that’s a Meta rule, not a Sipply
          limitation. What it does let you do is download your own copy. Get it, hand it to Sipply,
          and we’ll show you everyone from it who’s already here.
        </Text>

        {/* Step 1 */}
        <View style={styles.step}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNum} maxFontSizeMultiplier={1.5}>1</Text>
          </View>
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Ask Instagram for your list</Text>
            <Text style={styles.cardBody}>
              Pick <Text style={styles.em}>Followers and following</Text>, choose{' '}
              <Text style={styles.em}>JSON</Text>, and request the download. It usually lands in
              your email within half an hour.
            </Text>
            <Button
              label="Open Instagram download page"
              variant="secondary"
              block
              onPress={() => void WebBrowser.openBrowserAsync(DYI_URL)}
              style={styles.cardCta}
            />
          </View>
        </View>

        {/* Step 2 */}
        <View style={styles.step}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNum} maxFontSizeMultiplier={1.5}>2</Text>
          </View>
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Open the file here</Text>
            <Text style={styles.cardBody}>
              Tap the .zip in Files to unpack it, then choose{' '}
              <Text style={styles.em}>followers_1.json</Text> and{' '}
              <Text style={styles.em}>following.json</Text>. You can select both at once.
            </Text>
            <Button
              label={connections.length ? 'Choose a newer file' : 'Choose export file'}
              icon="plus"
              variant="secondary"
              block
              disabled={working}
              onPress={importFiles}
              style={styles.cardCta}
            />
          </View>
        </View>

        {working ? (
          <View style={styles.working}>
            <ActivityIndicator color={colors.wine} />
            <Text style={styles.hint}>
              {phase === 'matching'
                ? 'Checking who’s already on Sipply…'
                : progress
                  ? `Reading your list… ${formatCount(progress.done)} of ${formatCount(progress.total)}`
                  : 'Reading your list…'}
            </Text>
          </View>
        ) : null}

        {notice ? (
          <Text style={styles.notice} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}

        {/* Paste fallback */}
        {!working && !showPaste ? (
          <Button
            label="Paste a list of usernames instead"
            variant="ghost"
            block
            onPress={() => setShowPaste(true)}
          />
        ) : null}

        {showPaste ? (
          <View style={styles.pasteBox}>
            <TextInput
              value={pasted}
              onChangeText={setPasted}
              placeholder="@one, @two, instagram.com/three…"
              placeholderTextColor={colors.textMuted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.pasteInput}
              accessibilityLabel="Paste Instagram usernames"
            />
            <Button
              label="Find these people"
              block
              loading={working}
              disabled={pasted.trim().length === 0}
              onPress={importPasted}
              style={styles.cardCta}
            />
          </View>
        ) : null}

        {/* Results */}
        {/*
          Nothing re-checks the list on its own. Coming back used to promise
          it did; it never ran, and running it on every visit would spend
          most of the day's matching quota on a list that has not changed.
          The copy points at the button that does it instead.
        */}
        {phase === 'done' && !working ? (
          <View style={styles.results}>
            <Text style={styles.resultHead}>
              {partial
                ? `${formatCount(matchedConnections)} ${
                    matchedConnections === 1 ? 'person' : 'people'
                  } from your list ${matchedConnections === 1 ? 'is' : 'are'} on Sipply so far`
                : matchedConnections > 0
                  ? `${formatCount(matchedConnections)} of your ${formatCount(
                      connections.length,
                    )} Instagram connections ${matchedConnections === 1 ? 'is' : 'are'} on Sipply`
                  : `None of your ${formatCount(connections.length)} Instagram connections are here yet.`}
            </Text>
            <MatchResults
              entries={entries}
              emptyText="Share your invite link above. People who join later show up when you check your list again."
            />
          </View>
        ) : null}

        {connections.length > 0 && !working ? (
          <>
            <Button
              label={`Check my ${formatCount(connections.length)} connections again`}
              variant="ghost"
              block
              onPress={recheck}
              accessibilityHint="Re-checks your saved Instagram list for people who joined since last time"
            />
            <Button
              label="Forget my imported list"
              variant="ghost"
              block
              onPress={confirmForget}
              accessibilityHint="Asks first, then deletes the Instagram list saved on this device"
            />
          </>
        ) : null}
      </Card>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The other half of the handshake                                     */
/* ------------------------------------------------------------------ */

/**
 * Claiming your own handle.
 *
 * Without this the import is one-directional and mostly empty: a match
 * needs BOTH people to have said which handle is theirs. It sits above the
 * import for that reason — it takes five seconds and it is what makes
 * everyone else's import find you.
 *
 * The handle is not verified. Instagram offers no way to prove ownership
 * without a Business account, so this is a claim, not a credential — which
 * is why it is only ever compared as a hash, never displayed on a profile,
 * and worded as a claim on the import rows that match it.
 */
function FindableByHandle({ myId }: { myId: string }) {
  const email = useAuth((s) => s.session?.user.email);
  const [handle, setHandle] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  /* Local to this card — the import card below has its own notice. */
  const [error, setError] = useState<string | null>(null);

  /*
   * Re-read on every change, and fill the field from a claim parked at
   * signup — the same signup race FindFriends' phone card handles; see
   * subscribeDiscovery.
   */
  useEffect(() => {
    let alive = true;
    const read = () => {
      getRememberedHandle()
        .then((value) => {
          if (!alive) return;
          setSaved(value);
          // Once it is saved the field is hidden; a prefill left in it would
          // reappear after "Stop being findable" as though typed.
          if (value) setHandle('');
        })
        .catch(() => {
          /* Unreadable storage reads as not saved; the card asks, which is safe. */
        });
    };
    read();
    getParkedClaims(email)
      .then((parked) => {
        const parkedHandle = parked?.handle;
        if (alive && parkedHandle) setHandle((typed) => typed || parkedHandle);
      })
      .catch(() => {
        /* Nothing parked is the normal case. */
      });
    const unsubscribe = subscribeDiscovery(read);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [email]);

  const save = useCallback(async () => {
    const normalized = normalizeHandle(handle);
    if (!normalized) return;
    setSaving(true);
    setError(null);
    try {
      const hash = await hashHandle(normalized);
      if (!hash) return;
      await setInstagramHash(myId, hash);
      await rememberHandle(normalized);
      // Settled by hand; see dropParkedClaim. A storage failure here is not the save's.
      await dropParkedClaim('handle').catch(() => undefined);
      setSaved(normalized);
      setHandle('');
    } catch (e) {
      /*
       * Shown, not swallowed. This was an empty catch commented "surfaced
       * by the store's error channel" — which was false, since
       * setInstagramHash is a direct call. A failure looked identical to
       * never having tapped the button.
       */
      const message = discoveryErrorMessage(e, 'Could not save your username. Try again.');
      setError(message);
      announce(message);
    } finally {
      setSaving(false);
    }
  }, [handle, myId]);

  /*
   * The opt-out, and it fails out loud too. It was try/finally with no
   * catch, so offline it was an unhandled rejection and the card went on
   * saying "find you as @…" with nothing to explain why.
   */
  const clear = useCallback(async () => {
    setClearing(true);
    setError(null);
    try {
      await setInstagramHash(myId, null);
      await forgetRememberedHandle();
      // Or a claim parked at signup writes the handle back on the next launch.
      await dropParkedClaim('handle').catch(() => undefined);
      setSaved(null);
    } catch (e) {
      const message = discoveryErrorMessage(e, 'Could not turn this off. Try again.');
      setError(message);
      announce(message);
    } finally {
      setClearing(false);
    }
  }, [myId]);

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Icon name="instagram" size={18} color={colors.wine} />
        <Text style={styles.cardTitle} accessibilityRole="header">
          Let Instagram friends find you
        </Text>
      </View>

      {saved ? (
        <>
          <Text style={styles.cardBody}>
            Friends who import their Instagram list will find you as{' '}
            <Text style={styles.em}>@{saved}</Text>. It is stored scrambled and never shown on your
            profile.
          </Text>
          {error ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            label="Stop being findable"
            variant="ghost"
            block
            loading={clearing}
            onPress={clear}
            style={styles.cardCta}
          />
        </>
      ) : (
        <>
          <Text style={styles.cardBody}>
            Add your Instagram username so the people importing their lists can find you. It is
            stored scrambled and never shown on your profile.
          </Text>
          <View style={styles.searchWrap}>
            <Text style={styles.at}>@</Text>
            <TextInput
              value={handle}
              onChangeText={setHandle}
              placeholder="yourusername"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              style={styles.searchInput}
              accessibilityLabel="Your Instagram username"
            />
          </View>
          {error ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            label="Make me findable"
            variant="secondary"
            block
            loading={saving}
            disabled={!normalizeHandle(handle)}
            onPress={save}
            style={styles.cardCta}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },

  card: { padding: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.bodyLg.fontSize,
    color: colors.text,
  },
  cardBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 19,
    color: colors.textMuted,
  },
  cardCta: { marginTop: space.xs },
  em: { fontFamily: fonts.bodySemiBold, color: colors.text },

  /* Numbered steps — the download is a two-part errand, and a wall of
     prose loses people between the two halves. */
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  /*
   * The ring is a View around the numeral, not a border on the Text. It
   * was one Text at a fixed 24 x 24 with a 22pt line height, so Larger Text
   * grew the glyph inside a box that could not grow and clipped it. Minimums
   * here, so the ring widens and deepens with the numeral; the numeral is
   * capped at 1.5x so a step marker never outgrows the step title beside it.
   */
  stepBadge: {
    minWidth: 24,
    minHeight: 24,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontFamily: fonts.display,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
    textAlign: 'center',
  },
  stepBody: { flex: 1, gap: space.xs },
  stepTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  /* 16pt regular is not large text, so the prefix takes the 4.5:1 ink. */
  at: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.textMuted,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
  },

  pasteBox: { gap: space.sm },
  pasteInput: {
    minHeight: 96,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    textAlignVertical: 'top',
  },

  working: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  /* Small text on a white card: textMuted, which holds 4.5:1 there. */
  hint: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  /*
   * Every notice on this card is a failure or a refusal — an unreadable
   * file, nothing found in it, a dropped connection, the day's quota. It
   * was espresso on a neutral box, which read as help text one card below
   * FindFriends' red one. Same box as FindFriends now.
   */
  notice: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 19,
    color: colors.danger,
    backgroundColor: colors.dangerWash,
    borderRadius: radius.md,
    padding: space.md,
    overflow: 'hidden',
  },

  results: { gap: space.sm },
  resultHead: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
});
