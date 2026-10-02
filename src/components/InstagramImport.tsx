import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { MatchResults, type MatchEntry } from '@/components/PeopleList';
import { Button, Card, Divider, Field, Notice, SectionHeader, announce } from '@/components/ui';
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { formatCount } from '@/data';
import {
  IG_CONNECTIONS_KEY,
  RATE_LIMITED_IMPORT_MESSAGE,
  discoveryErrorMessage,
  dropParkedClaim,
  forgetInstagramRequest,
  forgetRememberedHandle,
  getInstagramRequest,
  getParkedClaims,
  getRememberedHandle,
  matchWithinQuota,
  rememberHandle,
  rememberInstagramRequest,
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
/* followers and following; we unzip and parse it on the device, hash    */
/* the handles, and match. Nothing but hashes leaves the phone, and the  */
/* handle -> hash map stays local, which is why this file can label a    */
/* matched row "@sarah.g" while the server cannot.                       */
/*                                                                      */
/* FOUR STEPS, NOT SEVEN, AND ONE CARD, NOT TWO. It was: open the page   */
/* in the in-app browser, sign in to Instagram again there, pick the     */
/* list, pick JSON, request it, unzip the download in Files, choose two  */
/* files out of it by name — then, in a separate card above, type your   */
/* own handle. Now: request (in Safari or the Instagram app, already     */
/* signed in), pick "Followers and following" for all time in any        */
/* format, choose the .zip as it arrived, and confirm the username the   */
/* download itself names. None of it can be one step: the list only      */
/* exists as that download, and Instagram takes its time making it.      */
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

const TOO_LARGE =
  'That download is too big to read here. Request your list again and choose only Followers and following.';
const NOTHING_FOUND =
  'Couldn’t find any followers in that. Choose the .zip Instagram gave you, or request your list again with Followers and following selected.';

/*
 * Roughly how long ago, in words. Rough on purpose: the only question it
 * answers is "should it be ready yet", and "about an hour ago" answers it
 * better than a timestamp.
 */
function sinceLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 2) return 'about an hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days < 2 ? 'a day ago' : `${days} days ago`;
}

/* How long Instagram usually takes, and the point after which the copy says so. */
const USUALLY_READY_MS = 30 * 60_000;

/*
 * A step's marker: its numeral, or a check once the step is done. Drawn as
 * a tag (22pt, a 4pt corner, a 1pt edge on bone, a muted label), because a
 * numbered marker is a label, and the disc it used to be was one more oval
 * on a screen of them.
 *
 * A View around the numeral, not a border on the Text. It was one Text at
 * a fixed 24 x 24 with a 22pt line height, so Larger Text grew the glyph
 * inside a box that could not grow and clipped it. Minimums here, so the
 * marker widens and deepens with the numeral; the numeral is capped at
 * 1.5x so a step marker never outgrows the step title beside it.
 */
function StepMarker({ step }: { step: number | 'done' }) {
  return (
    <View style={styles.stepMarker}>
      {step === 'done' ? (
        <Icon name="check" size={14} color={colors.textMuted} />
      ) : (
        <Text style={styles.stepNum} maxFontSizeMultiplier={1.5}>
          {step}
        </Text>
      )}
    </View>
  );
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
  /*
   * When the list was asked for, and when this screen last looked. The
   * second is state rather than a Date.now() in render so the render stays
   * pure; it is refreshed whenever the app comes back to the front, which
   * is exactly when someone returns from Instagram to see if it is ready.
   */
  const [request, setRequest] = useState<{ at: number; seenAt: number } | null>(null);
  /* The username the last download named as its owner, for the one-tap offer below. */
  const [ownHandle, setOwnHandle] = useState<string | null>(null);
  /* A list is cached, and the steps for a newer one were asked for anyway. */
  const [reimport, setReimport] = useState(false);

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

  /* ---- a request made on an earlier visit ---- */
  useEffect(() => {
    if (!myId) return;
    let alive = true;
    const read = () => {
      getInstagramRequest(myId)
        .then((at) => {
          if (alive) setRequest(at === null ? null : { at, seenAt: Date.now() });
        })
        .catch(() => {
          /* Unreadable storage reads as not requested; the card offers step one, which is safe. */
        });
    };
    read();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [myId]);

  /* ---- step one: ask Instagram ---- */

  /*
   * Linking, not WebBrowser. The in-app browser is SFSafariViewController,
   * which has had its own cookie jar since iOS 11, so the download page
   * opened there signed out and the first thing asked of the user was
   * their Instagram password. Safari, or the Instagram app when it claims
   * the address, is where they are already signed in. The cost is that
   * they leave Sipply; the request time below is what brings them back to
   * the right step.
   *
   * The same page is where the finished download waits, so once a request
   * is on record the page reopens without restamping it: going back to
   * fetch the file is not asking again, and "Requested just now" would
   * send someone to wait another half hour for a file already there.
   *
   * Stamped before leaving, and taken back if the page never opened.
   * openURL settles only once Sipply is on its way to the background, and
   * a stamp written after that can land late or, if the app is suspended
   * first, on the return — which would then read "Requested just now".
   */
  const openDownloadPage = useCallback(
    async (stamp: boolean) => {
      if (!myId) return;
      setNotice(null);
      if (stamp) {
        const now = Date.now();
        setRequest({ at: now, seenAt: now });
        void rememberInstagramRequest(myId).catch(() => undefined);
      }
      try {
        await Linking.openURL(DYI_URL);
      } catch {
        if (stamp) {
          setRequest(null);
          void forgetInstagramRequest().catch(() => undefined);
        }
        const message = 'Could not open Instagram’s download page. Try again in a moment.';
        setNotice(message);
        announce(message);
      }
    },
    [myId],
  );

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

  /* ---- step three: the download ---- */

  const importFiles = useCallback(async () => {
    /*
     * A cancelled picker goes back to where it was. It used to go to 'done'
     * whenever a list was cached, and a restored list has never been
     * matched — so cancelling "Choose the download" announced that none of
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
      // Worth keeping even from a download with no list in it: it is still theirs.
      if (result.ownHandle) setOwnHandle(result.ownHandle);
      if (result.empty || result.connections.length === 0) {
        const message = result.tooLarge ? TOO_LARGE : NOTHING_FOUND;
        setNotice(message);
        announce(message);
        setPhase(before);
        return;
      }
      // The list arrived, so nothing is waiting on Instagram any more.
      setRequest(null);
      setReimport(false);
      void forgetInstagramRequest().catch(() => undefined);
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
      setReimport(false);
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
   * Confirmed first, and drawn in danger red (Button's dangerText). It used
   * to be a quiet grey, the same as "Check my connections again" just above
   * it, and getting the list back means finding the download again — or, if
   * it is gone, another request and another wait.
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
    setOwnHandle(null);
    setReimport(false);
    setPhase('idle');
  }, []);

  const confirmForget = useCallback(() => {
    confirmDestructive(
      'Forget your imported list?',
      'To check it again you will need to choose the Instagram download again.',
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
   * THE HANDLE IS A CLAIM, AND THE ROW SAYS SO. Anyone can claim any handle
   * (see Findable below), and nothing stops two accounts claiming the same
   * one. So the row keeps the account's Sipply @username — the one
   * identifier Sipply controls — and words the Instagram handle as theirs
   * to claim. A handle more than one account claims says so, and stays out
   * of "Follow all": following everyone who says they are @sarah.g is how
   * an impostor gets followed.
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
  /*
   * The steps show until a list is in, and again when a newer one is on
   * its way. With a list cached they would be a page of instructions for
   * an errand already done, above the results it produced.
   */
  const showSteps = connections.length === 0 || reimport || request !== null;
  const waited = request ? request.seenAt - request.at : 0;

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Icon name="instagram" size={20} color={colors.text} />
        <SectionHeader title="Bring your Instagram friends" style={styles.cardTitle} />
      </View>

      {showSteps ? (
        <>
          {/* For deciding whether to start, so it goes once the list has been asked for. */}
          {connections.length === 0 && !request ? (
            <Text style={styles.cardBody}>
              Instagram doesn’t let any app read your follower list — that’s a Meta rule, not a
              Sipply limitation. It will give you a copy of your own, though. Hand it to Sipply and
              see who from it is already here. It is read on this phone, and the usernames are
              scrambled before anything is compared.
            </Text>
          ) : null}

          {/*
            Step one, or what came of it. Once asked for, it folds to one
            line, a check and when, and the download leads: someone coming
            back from Instagram wants the file picker and whether the file
            should be ready yet, not the errand they have already run.

            All time, because Instagram's own default (at the time of
            writing) is the last year, and the list then holds only the
            follows made within it: the oldest friends, the likeliest to be
            real ones, would be left out.
          */}
          {request ? (
            <View style={[styles.step, styles.stepFolded]}>
              <StepMarker step="done" />
              <Text style={[styles.stepTitle, styles.stepBody]}>Requested {sinceLabel(waited)}</Text>
            </View>
          ) : (
            <View style={styles.step}>
              <StepMarker step={1} />
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Ask Instagram for your list</Text>
                <Text style={styles.cardBody}>
                  On Instagram’s page, choose <Text style={styles.em}>Followers and following</Text>{' '}
                  only, and set the date range to <Text style={styles.em}>All time</Text>. Any format
                  works.
                </Text>
                <Button
                  label="Request your list"
                  variant="secondary"
                  block
                  onPress={() => void openDownloadPage(true)}
                  accessibilityHint="Opens Instagram’s download page"
                  style={styles.cardCta}
                />
              </View>
            </View>
          )}

          <View style={styles.step}>
            <StepMarker step={2} />
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>When it arrives</Text>
              <Text style={styles.cardBody}>
                {!request
                  ? 'It usually arrives within half an hour. Choose the .zip Instagram sends you, as it is. There is no need to unzip it.'
                  : waited < USUALLY_READY_MS
                    ? 'It usually arrives within half an hour. Download it from Instagram’s page, then choose the .zip here, as it is.'
                    : 'It is usually ready by now. Download it from Instagram’s page or the email Instagram sent, then choose the .zip here, as it is.'}
              </Text>
              <Button
                label="Choose the download"
                icon="plus"
                variant="secondary"
                block
                disabled={working}
                onPress={importFiles}
                style={styles.cardCta}
              />
              {request ? (
                <Button
                  label="Open Instagram’s page"
                  variant="text"
                  size="sm"
                  onPress={() => void openDownloadPage(false)}
                  accessibilityHint="Opens Instagram’s download page, where the file waits when it is ready"
                  style={styles.inlineAction}
                />
              ) : null}
            </View>
          </View>
        </>
      ) : null}

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

      {/*
        Every notice on this card is a failure or a refusal: an unreadable
        file, nothing found in it, a download too big, a dropped connection,
        the day's quota. An error Notice, as on every card of Find friends,
        so a failure looks like one wherever it lands. The Notice speaks it
        as it appears; each handler also announces it, for a failure that
        repeats while its Notice is still up, and announce drops the same
        words said twice within a moment, so the two never double up.
      */}
      {notice ? <Notice tone="error">{notice}</Notice> : null}

      {/* Paste fallback, for anyone who would rather not deal with a download. */}
      {showSteps && !working && !showPaste ? (
        <Button
          label="Paste a list of usernames instead"
          variant="text"
          block
          onPress={() => setShowPaste(true)}
        />
      ) : null}

      {showSteps && showPaste ? (
        <View style={styles.pasteBox}>
          <Field
            label="Instagram usernames"
            value={pasted}
            onChangeText={setPasted}
            placeholder="@one, @two, instagram.com/three…"
            multiline
          />
          {/* Secondary, like every boxed button on this card: of the cards' own buttons, only contacts' is filled. */}
          <Button
            label="Find these people"
            variant="secondary"
            block
            loading={working}
            disabled={pasted.trim().length === 0}
            onPress={importPasted}
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
                : `None of your ${formatCount(connections.length)} Instagram connections are here yet`}
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
            variant="text"
            block
            onPress={recheck}
            accessibilityHint="Re-checks your saved Instagram list for people who joined since last time"
          />
          {showSteps ? null : (
            <Button
              label="Import a newer list"
              variant="text"
              block
              onPress={() => setReimport(true)}
              accessibilityHint="Shows the steps for a fresh download from Instagram"
            />
          )}
          <Button
            label="Forget my imported list"
            variant="dangerText"
            block
            onPress={confirmForget}
            accessibilityHint="Asks first, then deletes the Instagram list saved on this device"
          />
        </>
      ) : null}

      <Findable myId={myId} offer={ownHandle} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The other half of the handshake                                     */
/* ------------------------------------------------------------------ */

/**
 * Claiming your own handle.
 *
 * Without this the import is one-directional and mostly empty: a match
 * needs BOTH people to have said which handle is theirs. It used to be a
 * card of its own above the import, asking everyone to type their
 * username. Now the download usually says it (its personal information,
 * or failing that the archive's own name), so the ask is one confirm with
 * the name already in it — "Let friends find you as @name" — and typing
 * is the fallback behind a link. A claim parked at signup is offered the
 * same way until the auth store's drain writes it.
 *
 * The handle is not verified. Instagram offers no way to prove ownership
 * without a Business account, so this is a claim, not a credential — which
 * is why it is only ever compared as a hash, never displayed on a profile,
 * and worded as a claim on the import rows that match it. That is also why
 * the name read from a download is offered, not saved: the person holding
 * the phone may be holding a friend's download.
 */
function Findable({ myId, offer }: { myId: string; offer: string | null }) {
  const email = useAuth((s) => s.session?.user.email);
  /* Undefined until storage has answered, so the offer never flashes up for someone already findable. */
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [parked, setParked] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  /* Local to this section — the import above has its own notice. */
  const [error, setError] = useState<string | null>(null);

  /*
   * Re-read on every change, and pick up a claim parked at signup — the
   * same signup race FindFriends' phone card handles; see
   * subscribeDiscovery.
   */
  useEffect(() => {
    let alive = true;
    const read = () => {
      getRememberedHandle()
        .then((value) => {
          if (alive) setSaved(value);
        })
        .catch(() => {
          /* Unreadable storage reads as not saved; the section asks, which is safe. */
          if (alive) setSaved(null);
        });
      getParkedClaims(email)
        .then((pending) => {
          if (alive) setParked(pending?.handle ?? null);
        })
        .catch(() => {
          /* Nothing parked is the normal case. */
        });
    };
    read();
    const unsubscribe = subscribeDiscovery(read);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [email]);

  const save = useCallback(
    async (raw: string) => {
      const normalized = normalizeHandle(raw);
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
        setManual(false);
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
    },
    [myId],
  );

  /*
   * The opt-out, and it fails out loud too. It was try/finally with no
   * catch, so offline it was an unhandled rejection and the section went
   * on saying "find you as @…" with nothing to explain why.
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

  if (saved === undefined) return null;

  /* Set off from the import by a rule: it is the other half of the same errand, not another card. */
  const section = (children: React.ReactNode) => (
    <>
      <Divider />
      <View style={styles.findable}>{children}</View>
    </>
  );

  const errorBox = error ? <Notice tone="error">{error}</Notice> : null;

  if (saved) {
    return section(
      <>
        <Text style={styles.cardBody}>
          Friends who import their Instagram list find you as{' '}
          <Text style={styles.em}>@{saved}</Text>. It is stored scrambled and never shown on your
          profile.
        </Text>
        {errorBox}
        {/* The way back out of being findable, as on the phone card: a quiet text button, muted. */}
        <Button
          label="Stop being findable"
          variant="text"
          muted
          block
          loading={clearing}
          onPress={clear}
        />
      </>,
    );
  }

  const suggestion = offer ?? parked;

  if (manual) {
    return section(
      <>
        {/*
          No autofill: iOS offers the saved Sipply sign-in for a username
          field, which is the one name that is certainly wrong here.
        */}
        <Field
          label="Your Instagram username"
          prefix="@"
          value={handle}
          onChangeText={setHandle}
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={() => void save(handle)}
          hint="So friends who import their list can find you. Stored scrambled, never shown on your profile."
        />
        {errorBox}
        <Button
          label="Make me findable"
          variant="secondary"
          block
          loading={saving}
          disabled={!normalizeHandle(handle)}
          onPress={() => void save(handle)}
        />
      </>,
    );
  }

  if (suggestion) {
    return section(
      <>
        <Text style={styles.cardBody}>
          Friends who import their list only find you if Sipply knows your username. It is stored
          scrambled and never shown on your profile.
        </Text>
        {errorBox}
        <Button
          label={`Let friends find you as @${suggestion}`}
          variant="secondary"
          block
          loading={saving}
          onPress={() => void save(suggestion)}
        />
        <Button
          label="Use a different username"
          variant="text"
          size="sm"
          onPress={() => {
            setHandle(suggestion);
            setManual(true);
          }}
          style={styles.inlineAction}
        />
      </>,
    );
  }

  return section(
    <Button
      label="Let Instagram friends find you"
      variant="text"
      block
      onPress={() => setManual(true)}
      accessibilityHint="Asks for your Instagram username"
    />,
  );
}

/*
 * Find friends' card styles, so this card reads as one of them: the glyph
 * and a sentence-case heading in ink, 13pt muted body. Of the cards' own
 * buttons only contacts' is filled wine.
 */
const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1 },
  cardBody: { ...textRole.helper, color: colors.textMuted },
  cardCta: { marginTop: space.xs },
  /* A quiet second action under a step, sized to its words rather than the card. */
  inlineAction: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  em: { fontFamily: fonts.bodySemiBold, color: colors.text },

  /* Numbered steps — the download is a two-visit errand, and a wall of
     prose loses people between the two halves. The marker's 22pt matches
     the title's line, so the two share a top edge. */
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  /* A step already done: the check and one line beside it, centred on each other. */
  stepFolded: { alignItems: 'center' },
  /* The tag anatomy (ui.tsx's Tag), with minimums so it grows; see StepMarker. */
  stepMarker: {
    minWidth: layout.tag,
    minHeight: layout.tag,
    paddingHorizontal: 6,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Set as a tag's label is; a figure, so tabular. textMuted on bone is 4.5:1 or better. */
  stepNum: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.tag,
    ...tabular,
    color: colors.textMuted,
    textAlign: 'center',
  },
  stepBody: { flex: 1, gap: space.xs },
  stepTitle: { ...textRole.sectionTitle, color: colors.text },

  pasteBox: { gap: space.sm },
  findable: { gap: space.sm },

  working: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  /* Small text on a white card: textMuted, which holds 4.5:1 there. */
  hint: { flex: 1, ...textRole.helper, color: colors.textMuted },

  results: { gap: space.sm },
  resultHead: { ...textRole.sectionTitle, color: colors.text },
});
