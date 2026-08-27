import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Icon } from '@/components/icons';
import { MatchResults, type MatchEntry } from '@/components/PeopleList';
import { Button, Card, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import {
  forgetRememberedHandle,
  getRememberedHandle,
  rememberHandle,
} from '@/lib/discovery';
import {
  DYI_URL,
  connectionsFromText,
  hashHandle,
  normalizeHandle,
  pickExportFiles,
  sortByCloseness,
  type ImportedConnection,
} from '@/lib/instagram';
import { matchInstagram, setInstagramHash } from '@/lib/social';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';

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
 * Capped well under the 10k import ceiling — AsyncStorage is a single
 * JSON blob per key, and a 10k-entry write on every import is a stutter
 * nobody asked for.
 */
const CACHE_KEY = 'clink-ig-connections';
const CACHE_MAX = 5_000;

type Phase = 'idle' | 'reading' | 'matching' | 'done';

export function InstagramImport() {
  const myId = useAuth((s) => s.session?.user.id);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [connections, setConnections] = useState<ImportedConnection[]>([]);
  const [matches, setMatches] = useState<{ profile: UserProfile; hash: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState('');

  /* ---- restore a previous import ---- */
  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
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

  const runMatch = useCallback(async (list: ImportedConnection[]) => {
    setPhase('matching');
    try {
      const found = await matchInstagram(list.map((c) => c.hash));
      setMatches(found);
      setPhase('done');
    } catch (e) {
      setNotice((e as Error).message);
      setPhase('done');
    }
  }, []);

  const persist = useCallback(async (list: ImportedConnection[]) => {
    setConnections(list);
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, CACHE_MAX)));
    } catch {
      /* Cache is an optimisation; losing it only costs a re-import. */
    }
  }, []);

  const importFiles = useCallback(async () => {
    haptic.tap();
    setNotice(null);
    setPhase('reading');
    setProgress(null);
    try {
      const result = await pickExportFiles((done, total) => setProgress({ done, total }));
      if (!result) {
        setPhase(connections.length ? 'done' : 'idle');
        return;
      }
      if (result.empty || result.connections.length === 0) {
        setNotice(
          "That file didn't have any accounts in it. In the download, look inside connections › followers_and_following and pick followers_1.json and following.json.",
        );
        setPhase('idle');
        return;
      }
      await persist(result.connections);
      await runMatch(result.connections);
    } catch (e) {
      setNotice((e as Error).message);
      setPhase('idle');
    }
  }, [connections.length, persist, runMatch]);

  const importPasted = useCallback(async () => {
    haptic.tap();
    setNotice(null);
    setPhase('reading');
    try {
      const list = await connectionsFromText(pasted);
      if (list.length === 0) {
        setNotice("Couldn't find any usernames in that.");
        setPhase('idle');
        return;
      }
      setPasted('');
      setShowPaste(false);
      await persist(list);
      await runMatch(list);
    } catch (e) {
      setNotice((e as Error).message);
      setPhase('idle');
    }
  }, [pasted, persist, runMatch]);

  const recheck = useCallback(() => {
    haptic.tap();
    void runMatch(connections);
  }, [connections, runMatch]);

  /**
   * Drops the imported list from the device.
   *
   * Promised in docs/privacy.md, so it has to exist and has to actually
   * clear: the cache, the matches on screen, and the phase, not just the
   * visible list. Nothing server-side to delete — the handles were never
   * sent, only their hashes, and those were never stored.
   */
  const forget = useCallback(async () => {
    haptic.tap();
    await AsyncStorage.removeItem(CACHE_KEY);
    setConnections([]);
    setMatches([]);
    setNotice(null);
    setPhase('idle');
  }, []);

  /* ---- rows ---- */

  /*
   * Mutuals first: an Instagram following list is mostly brands and
   * strangers, and the people who follow you back are the ones worth
   * putting at the top. The note is built here rather than server-side
   * because the handle behind a hash only exists on this device.
   */
  const entries: MatchEntry[] = useMemo(() => {
    const byHash = new Map(connections.map((c) => [c.hash, c]));
    const enriched = matches
      .map((m) => ({ m, c: byHash.get(m.hash) }))
      .filter((x): x is { m: (typeof matches)[number]; c: ImportedConnection } => !!x.c);

    return sortByCloseness(enriched.map((x) => x.c)).map((c) => {
      const match = enriched.find((x) => x.c.hash === c.hash)!;
      const mutual = c.follower && c.followed;
      return {
        profile: match.m.profile,
        note: mutual ? `@${c.handle} · you follow each other` : `@${c.handle}`,
      };
    });
  }, [connections, matches]);

  if (!myId) return null;

  const working = phase === 'reading' || phase === 'matching';

  return (
    <View style={styles.wrap}>
      <FindableByHandle myId={myId} />

      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="instagram" size={18} color={colors.wine} />
          <Text style={styles.cardTitle}>Bring your Instagram friends</Text>
        </View>

        <Text style={styles.cardBody}>
          Instagram doesn’t let any app read your follower list — that’s a Meta rule, not a Sipply
          limitation. What it does let you do is download your own copy. Get it, hand it to Sipply,
          and we’ll show you everyone from it who’s already here.
        </Text>

        {/* Step 1 */}
        <View style={styles.step}>
          <Text style={styles.stepNum}>1</Text>
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
              onPress={() => {
                haptic.tap();
                void WebBrowser.openBrowserAsync(DYI_URL);
              }}
              style={styles.cardCta}
            />
          </View>
        </View>

        {/* Step 2 */}
        <View style={styles.step}>
          <Text style={styles.stepNum}>2</Text>
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
                  ? `Reading your list… ${progress.done} of ${progress.total}`
                  : 'Reading your list…'}
            </Text>
          </View>
        ) : null}

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {/* Paste fallback */}
        {!working && !showPaste ? (
          <Button
            label="Paste a list of usernames instead"
            variant="ghost"
            block
            onPress={() => {
              haptic.tap();
              setShowPaste(true);
            }}
          />
        ) : null}

        {showPaste ? (
          <View style={styles.pasteBox}>
            <TextInput
              value={pasted}
              onChangeText={setPasted}
              placeholder="@one, @two, instagram.com/three…"
              placeholderTextColor={colors.textFaint}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.pasteInput}
              accessibilityLabel="Paste Instagram usernames"
            />
            <Button
              label="Find these people"
              block
              disabled={pasted.trim().length === 0}
              onPress={importPasted}
              style={styles.cardCta}
            />
          </View>
        ) : null}

        {/* Results */}
        {phase === 'done' && !working ? (
          <View style={styles.results}>
            <Text style={styles.resultHead}>
              {matches.length > 0
                ? `${matches.length} of your ${connections.length} Instagram connections ${
                    matches.length === 1 ? 'is' : 'are'
                  } on Sipply`
                : `None of your ${connections.length} Instagram connections are here yet.`}
            </Text>
            <MatchResults
              entries={entries}
              emptyText="Share your invite link above — this list gets checked again every time you come back."
            />
          </View>
        ) : null}

        {connections.length > 0 && !working ? (
          <>
            <Button
              label={`Check my ${connections.length} connections again`}
              variant="ghost"
              block
              onPress={recheck}
              accessibilityHint="Re-checks your saved Instagram list for people who joined since last time"
            />
            <Button
              label="Forget my imported list"
              variant="ghost"
              block
              onPress={forget}
              accessibilityHint="Deletes the Instagram list saved on this device"
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
 * is why it is only ever compared as a hash and never displayed on a
 * profile as though Sipply had checked it.
 */
function FindableByHandle({ myId }: { myId: string }) {
  const [handle, setHandle] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRememberedHandle().then(setSaved);
  }, []);

  const save = useCallback(async () => {
    const normalized = normalizeHandle(handle);
    if (!normalized) return;
    setBusy(true);
    try {
      const hash = await hashHandle(normalized);
      if (!hash) return;
      await setInstagramHash(myId, hash);
      await rememberHandle(normalized);
      setSaved(normalized);
      setHandle('');
    } catch {
      /* Surfaced by the store's error channel. */
    } finally {
      setBusy(false);
    }
  }, [handle, myId]);

  const clear = useCallback(async () => {
    setBusy(true);
    try {
      await setInstagramHash(myId, null);
      await forgetRememberedHandle();
      setSaved(null);
    } finally {
      setBusy(false);
    }
  }, [myId]);

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Icon name="instagram" size={18} color={colors.wine} />
        <Text style={styles.cardTitle}>Let Instagram friends find you</Text>
      </View>

      {saved ? (
        <>
          <Text style={styles.cardBody}>
            Friends who import their Instagram list will find you as{' '}
            <Text style={styles.em}>@{saved}</Text>. We stored a one-way hash of it, not the handle
            — nobody can read it off your profile.
          </Text>
          <Button
            label="Stop being findable"
            variant="ghost"
            block
            disabled={busy}
            onPress={clear}
            style={styles.cardCta}
          />
        </>
      ) : (
        <>
          <Text style={styles.cardBody}>
            Add your Instagram username so the people importing their lists can find you. Only a
            one-way hash is stored, never the username itself.
          </Text>
          <View style={styles.searchWrap}>
            <Text style={styles.at}>@</Text>
            <TextInput
              value={handle}
              onChangeText={setHandle}
              placeholder="yourusername"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              style={styles.searchInput}
              accessibilityLabel="Your Instagram username"
            />
          </View>
          <Button
            label={busy ? 'Saving…' : 'Make me findable'}
            variant="secondary"
            block
            disabled={busy || !normalizeHandle(handle)}
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
  stepNum: {
    fontFamily: fonts.display,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 999,
    width: 24,
    height: 24,
    lineHeight: 22,
    textAlign: 'center',
    overflow: 'hidden',
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
  at: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.textFaint,
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
  hint: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textFaint,
  },
  notice: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: 19,
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: space.md,
  },

  results: { gap: space.sm },
  resultHead: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
});
