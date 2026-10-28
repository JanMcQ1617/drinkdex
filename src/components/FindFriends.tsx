import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, View } from 'react-native';

import { FacebookFriends } from '@/components/FacebookFriends';
import { InstagramImport } from '@/components/InstagramImport';
import { MatchResults, type MatchEntry } from '@/components/PeopleList';
import { FindNote, FindSection } from '@/components/profile/FindSection';
import { Button, Field, Notice, SearchField, announce } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
import { formatCount } from '@/data';
import { hashPhone, normalizePhone, readContactHashes, requestContactsPermission } from '@/lib/contacts';
import {
  RATE_LIMITED_MESSAGE,
  discoveryErrorMessage,
  dropParkedClaim,
  forgetRememberedPhone,
  getParkedClaims,
  getRememberedPhone,
  matchWithinQuota,
  rememberPhone,
  subscribeDiscovery,
} from '@/lib/discovery';
import { buildInviteMessage, createInviteUrl } from '@/lib/invite';
import { matchContacts, searchPeople, setPhoneHash } from '@/lib/social';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';

/* ------------------------------------------------------------------ */
/* FindFriends                                                         */
/* ------------------------------------------------------------------ */

/*
 * Every failure here is drawn in a Notice, which speaks an error as it
 * appears (iOS has no live regions; the region stays for Android). Each
 * handler that sets one ALSO calls announce, so a failure that happens
 * twice while its Notice stays on screen is heard twice; announce drops
 * the same words said twice within a moment, so the two never double up.
 * Contacts access being off is not a failure and has no Notice, but it is
 * the same silent swap of a button for a sentence, so it is spoken too.
 */
const SEARCH_FAILED = 'Search failed. Try again.';
const CONTACTS_OFF = 'Contacts access is off. Turn it on for Sipply in Settings, then try again.';

/**
 * The discovery surface: match your phone contacts, your Facebook friends
 * already here, make yourself findable, invite a friend, search by
 * @username, or import your Instagram connections — in that order,
 * because the order is the recommendation. Rendered by the Find friends
 * screen and by the welcome step at signup, so both open on contacts.
 *
 * Contacts lead: the one source that works for every account, and the
 * recommended path, so its key is the one ink key in the column and every
 * other section's is the wash key. Six equal sections with six equal keys
 * read as a wall of instructions with no way in.
 *
 * Facebook follows it because, for an account signed in with it, it asks
 * nothing more: the sign-in already said which of its friends are here.
 * <FacebookFriends> decides for itself whether it has anything to show —
 * the friends, a row to connect Facebook, or nothing, which is all it
 * ever is while lib/facebook's friends flag is off.
 *
 * Every list ends in <MatchResults>, which leads with "Follow all" —
 * finding forty people is worthless if acting on them is forty taps.
 *
 * There is no "Log in with Instagram" button because no such thing can
 * exist for this: Meta returns follower COUNTS to third-party apps and
 * never lists, and the only API that covered personal accounts was shut
 * off in December 2024. See src/lib/instagram.ts.
 */
export function FindFriends() {
  const myId = useAuth((s) => s.session?.user.id);
  const email = useAuth((s) => s.session?.user.email);
  /* A number the account signed in with, already proven by its SMS code. GoTrue stores digits, no '+'. */
  const verifiedPhone = useAuth((s) => s.session?.user.phone);
  const profile = useAuth((s) => s.profile);

  /* ---- invite ---- */
  /*
   * The link is minted per share (lib/invite.ts), which makes it a round
   * trip that can fail. It says so next to the button rather than opening
   * the share sheet with a link that leads nowhere.
   */
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const invite = useCallback(async () => {
    if (!profile) return;
    setInviting(true);
    setInviteError(null);
    let url: string;
    try {
      url = await createInviteUrl();
    } catch (e) {
      const message = discoveryErrorMessage(e, 'Could not make an invite link. Try again.');
      setInviteError(message);
      announce(message);
      return;
    } finally {
      setInviting(false);
    }
    try {
      await Share.share({ message: buildInviteMessage({ username: profile.username, url }) });
    } catch {
      /* dismissed */
    }
  }, [profile]);

  /* ---- username search ---- */
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  /*
   * The query whose search failed, not a flag. A failure used to land as
   * an empty result, so a dropped connection read "No one by that name
   * yet", which is an answer about the person being looked for rather
   * than about the network. Keyed on the query, the failure belongs to
   * what was typed: editing the field puts it away without an effect to
   * clear it. Bumping `attempt` re-runs the same query from Try again.
   */
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const searchSeq = useRef(0);

  useEffect(() => {
    const q = term.trim();
    // Too short to search — results are gated on length at render time, so
    // there's nothing to clear here (and no synchronous setState in-effect).
    if (!myId || q.length < 2) return;

    const seq = ++searchSeq.current;
    let cancelled = false;

    const run = async () => {
      // Debounce past the await so state only changes asynchronously.
      await new Promise((resolve) => setTimeout(resolve, 280));
      if (cancelled || seq !== searchSeq.current) return;
      setSearching(true);
      try {
        const found = await searchPeople(myId, q);
        if (!cancelled && seq === searchSeq.current) {
          setResults(found);
          setFailedQuery(null);
        }
      } catch {
        if (!cancelled && seq === searchSeq.current) {
          setResults([]);
          setFailedQuery(q);
          announce(SEARCH_FAILED);
        }
      } finally {
        if (!cancelled && seq === searchSeq.current) setSearching(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [term, myId, attempt]);

  const showSearch = term.trim().length >= 2;
  const searchFailed = showSearch && !searching && failedQuery === term.trim();

  /* ---- contacts ---- */
  /*
   * A failed check is its own state, not 'done' with an empty list. It used
   * to land in 'done' and read "None of your 212 contacts are on Sipply
   * yet" — a confident answer to a question that never reached the server,
   * with no way to ask again short of leaving the screen. blocked.tsx calls
   * that the quiet lie that makes people distrust a feature.
   *
   * 'limited' is the day's matching quota running out before anything was
   * found (migration 011). It gets no retry button: the honest next step is
   * tomorrow, and a button that fails the same way is not one.
   */
  type ContactsState = 'idle' | 'working' | 'denied' | 'done' | 'failed' | 'limited';
  const [contactsState, setContactsState] = useState<ContactsState>('idle');
  const [matches, setMatches] = useState<UserProfile[]>([]);
  const [scanned, setScanned] = useState(0);
  /* Why the check failed, or that the quota ran out part way through it. */
  const [contactsNotice, setContactsNotice] = useState<string | null>(null);

  const findFromContacts = useCallback(async () => {
    setContactsState('working');
    setContactsNotice(null);
    try {
      // Inside the try: a permission call that throws would otherwise leave the spinner up.
      const perm = await requestContactsPermission();
      if (perm !== 'granted') {
        setContactsState('denied');
        announce(CONTACTS_OFF);
        return;
      }
      const { hashes, contactCount } = await readContactHashes();
      setScanned(contactCount);
      const { found, limited } = await matchWithinQuota(hashes, matchContacts);
      setMatches(found.filter((p) => p.id !== myId));
      setContactsNotice(limited ? RATE_LIMITED_MESSAGE : null);
      setContactsState(limited && found.length === 0 ? 'limited' : 'done');
      if (limited) announce(RATE_LIMITED_MESSAGE);
    } catch (e) {
      const message = discoveryErrorMessage(
        e,
        'Could not check your contacts. Try again in a moment.',
      );
      setMatches([]);
      setContactsNotice(message);
      setContactsState('failed');
      announce(message);
    }
  }, [myId]);

  /* ---- discoverability ---- */
  /*
   * The saved number, not a boolean. Signup now collects this, so most
   * accounts arrive already findable and this section's job is to SHOW that
   * rather than ask again — which needs the value, and the server hash
   * cannot be read back.
   */
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [stoppingPhone, setStoppingPhone] = useState(false);
  /*
   * Shown, not swallowed. This used to be an empty catch commented
   * "surfaced by the store elsewhere", which was simply untrue —
   * setPhoneHash is a direct call and nothing was surfacing it. A failed
   * save left the section looking exactly like an untouched one, so the only
   * way to discover it had not worked was to query the database by hand.
   * Rendered in both states, because turning it OFF can fail too.
   */
  const [phoneError, setPhoneError] = useState<string | null>(null);

  /*
   * Re-read on every change, not once. Right after signup the number is
   * still parked and only lands when the auth store's drain has fetched
   * the profile and made the RPC, long after this mounts; see
   * subscribeDiscovery. Until then the field is filled with what was typed
   * at signup, so nobody is asked to type it twice — and if the drain fails
   * offline, one tap here finishes the job.
   *
   * An account that signed in with its phone number is offered that number
   * the same way when nothing is parked. Only offered: becoming findable
   * stays a tap on "Make me findable", never a side effect of signing in.
   *
   * The prefill waits for the saved number to be read, and is skipped when
   * there is one. Once it is saved the field is hidden, and a prefill
   * landing in it afterwards would reappear after "Stop being findable" as
   * though typed.
   */
  useEffect(() => {
    let alive = true;
    const read = () =>
      getRememberedPhone()
        .then((value) => {
          if (!alive) return value;
          setSavedPhone(value);
          if (value) setPhone('');
          return value;
        })
        .catch(() => {
          /* Unreadable storage reads as not saved; the section asks, which is safe. */
          return null;
        });
    void read().then(async (saved) => {
      if (saved || !alive) return;
      const parked = await getParkedClaims(email).catch(() => {
        /* Nothing parked is the normal case. */
        return null;
      });
      const offer = parked?.phone ?? (verifiedPhone ? `+${verifiedPhone}` : undefined);
      if (alive && offer) setPhone((typed) => typed || offer);
    });
    const unsubscribe = subscribeDiscovery(() => void read());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [email, verifiedPhone]);

  const saveDiscoverable = useCallback(async () => {
    if (!myId) return;
    setSavingPhone(true);
    setPhoneError(null);
    try {
      const h = await hashPhone(phone);
      if (!h) {
        const message = 'That number is too short to use. Include the area code.';
        setPhoneError(message);
        announce(message);
        return;
      }
      await setPhoneHash(myId, h);
      const normalized = normalizePhone(phone);
      if (normalized) await rememberPhone(normalized);
      // Settled by hand; see dropParkedClaim. A storage failure here is not the save's.
      await dropParkedClaim('phone').catch(() => undefined);
      setSavedPhone(normalized);
      setPhone('');
    } catch (e) {
      const message = discoveryErrorMessage(e, 'Could not save your number. Try again.');
      setPhoneError(message);
      announce(message);
    } finally {
      setSavingPhone(false);
    }
  }, [myId, phone]);

  /*
   * The privacy direction, so it gets the same care as saving: a busy
   * state against a second tap, and a failure said out loud. It used to
   * have neither — an offline tap was an unhandled rejection and the section
   * went on saying "You're findable" as if nothing had been asked.
   */
  const stopDiscoverable = useCallback(async () => {
    if (!myId) return;
    setStoppingPhone(true);
    setPhoneError(null);
    try {
      await setPhoneHash(myId, null);
      await forgetRememberedPhone();
      // Or a number parked at signup is written back on the next launch.
      await dropParkedClaim('phone').catch(() => undefined);
      setSavedPhone(null);
    } catch (e) {
      const message = discoveryErrorMessage(e, 'Could not turn this off. Try again.');
      setPhoneError(message);
      announce(message);
    } finally {
      setStoppingPhone(false);
    }
  }, [myId]);

  if (!myId) return null;

  const searchEntries: MatchEntry[] = results.map((p) => ({ profile: p }));
  const contactEntries: MatchEntry[] = matches.map((p) => ({ profile: p }));

  const contactsEmptyText =
    scanned === 0
      ? 'None of your contacts have a phone number saved. Share your invite link below instead.'
      : `None of your ${formatCount(scanned)} ${
          scanned === 1 ? 'contact is' : 'contacts are'
        } on Sipply yet. Share your invite link below.`;

  return (
    <View style={styles.wrap}>
      {/*
        Contacts, the recommended path, first, with the column's one ink
        key. The people it finds are listed straight under it, as rows of
        people are everywhere else.
      */}
      <FindSection
        title="Friends you already know"
        body="The fastest way to find people. Numbers are scrambled on your phone before they are compared, and your address book is never uploaded.">
        {contactsState === 'idle' ? (
          <Button label="Find from contacts" variant="primary" block onPress={findFromContacts} />
        ) : null}

        {contactsState === 'working' ? (
          <View style={styles.working}>
            <ActivityIndicator color={colors.text} />
            <View style={styles.flex}>
              <FindNote>Checking your contacts…</FindNote>
            </View>
          </View>
        ) : null}

        {contactsState === 'denied' ? (
          <>
            <FindNote>{CONTACTS_OFF}</FindNote>
            <Button
              label="Open Settings"
              variant="secondary"
              block
              onPress={() => Linking.openSettings()}
            />
          </>
        ) : null}

        {contactsState === 'failed' ? (
          <>
            <Notice tone="error">{contactsNotice}</Notice>
            <Button label="Try again" variant="secondary" block onPress={findFromContacts} />
          </>
        ) : null}

        {contactsState === 'limited' ? <Notice tone="error">{contactsNotice}</Notice> : null}

        {contactsState === 'done' ? (
          <>
            {/* Only set when the quota ran out part way: what is listed is not everyone. */}
            {contactsNotice ? <Notice tone="error">{contactsNotice}</Notice> : null}
            {contactEntries.length > 0 ? (
              <MatchResults entries={contactEntries} />
            ) : contactsNotice ? null : (
              <FindNote>{contactsEmptyText}</FindNote>
            )}
          </>
        ) : null}
      </FindSection>

      <FacebookFriends />

      {/* Discoverability. Whether you are findable is said in words, not by a glyph. */}
      {savedPhone ? (
        <FindSection
          title="Let friends find you"
          body="You’re findable by contacts. Your number is stored scrambled and never shown to anyone.">
          {phoneError ? <Notice tone="error">{phoneError}</Notice> : null}
          {/* The way back out of being findable: a quiet text key, muted. */}
          <Button
            label="Stop being findable"
            variant="text"
            muted
            block
            loading={stoppingPhone}
            onPress={stopDiscoverable}
          />
        </FindSection>
      ) : (
        <FindSection
          title="Let friends find you"
          body="Add your number so friends who already have it can find you here. It is stored scrambled and never shown to anyone.">
          {/* A visible label, not a placeholder standing in for one; see Field. */}
          <Field
            label="Your phone number"
            value={phone}
            onChangeText={setPhone}
            inputMode="tel"
            autoComplete="tel"
            textContentType="telephoneNumber"
            accessibilityLabel="Your phone number, to be findable by contacts"
          />
          {phoneError ? <Notice tone="error">{phoneError}</Notice> : null}
          <Button
            label="Make me findable"
            variant="secondary"
            block
            loading={savingPhone}
            disabled={phone.replace(/\D/g, '').length < 7}
            onPress={saveDiscoverable}
          />
        </FindSection>
      )}

      {/*
        Invite. The link is a custom-scheme deep link (see lib/invite.ts), so
        it only works on a phone that already has Sipply. The line says
        exactly that rather than promising a follow to someone the link
        cannot reach; the shared message carries the username to search.
      */}
      <FindSection
        title="Invite a friend"
        body="Share your link. If they already have Sipply, opening it makes you follow each other.">
        {inviteError ? <Notice tone="error">{inviteError}</Notice> : null}
        <Button
          label="Share invite link"
          variant="secondary"
          block
          loading={inviting}
          disabled={!profile}
          onPress={invite}
        />
      </FindSection>

      {/* Search. The app's one search field, wash on the page. */}
      <FindSection title="Find by username">
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder="Search @username or name"
          accessibilityLabel="Search for people by username"
          trailing={
            showSearch && searching ? <ActivityIndicator size="small" color={colors.text} /> : null
          }
        />
        {searchFailed ? (
          <>
            <Notice tone="error">{SEARCH_FAILED}</Notice>
            <Button
              label="Try again"
              variant="secondary"
              block
              onPress={() => setAttempt((n) => n + 1)}
            />
          </>
        ) : showSearch ? (
          <MatchResults
            entries={searchEntries}
            emptyText={searching ? undefined : 'No one by that name yet.'}
          />
        ) : null}
      </FindSection>

      <InstagramImport />
    </View>
  );
}

const styles = StyleSheet.create({
  // Sections parted by space alone (layout.section, 32), never by cards or rules.
  wrap: { gap: layout.section, paddingTop: space.lg },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  flex: { flex: 1 },
});
