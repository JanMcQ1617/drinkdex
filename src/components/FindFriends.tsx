import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, Text, View } from 'react-native';

import { FacebookFriends } from '@/components/FacebookFriends';
import { Icon } from '@/components/icons';
import { InstagramImport } from '@/components/InstagramImport';
import { MatchResults, type MatchEntry } from '@/components/PeopleList';
import { Button, Card, Field, SearchField, announce } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
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
 * Every failure or notice here is drawn in a notice box with
 * accessibilityLiveRegion, which is Android-only: on iOS a VoiceOver user
 * tapped Try again, heard the button go busy and come back, and was never
 * told why nothing changed. So each handler that sets one also calls
 * announce (components/ui), which speaks it on iOS only. From the handler
 * rather than a useAnnounce on the state, so a failure that happens twice
 * is heard twice. Contacts access being off is not a failure, but it is
 * the same silent swap of a button for a sentence, so it is spoken too.
 */
const SEARCH_FAILED = 'Search failed. Try again.';
const CONTACTS_OFF = 'Contacts access is off. Turn it on for Sipply in Settings, then try again.';

/**
 * The discovery surface: your Facebook friends already here, match your
 * phone contacts, make yourself findable, invite a friend, search by
 * @username, or import your Instagram connections — in that order,
 * because the order is the recommendation. Rendered by the Find friends
 * screen and by the welcome step at signup, so both get Facebook first.
 *
 * Facebook leads because, for an account signed in with it, it is the
 * only source that asks nothing more: the sign-in already said which of
 * its friends are here. <FacebookFriends> decides for itself whether it has
 * anything to show — the friends, a row to connect Facebook, or nothing —
 * so this only gives it the first slot.
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
   * accounts arrive already findable and this card's job is to SHOW that
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
   * save left the card looking exactly like an untouched one, so the only
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
   */
  useEffect(() => {
    let alive = true;
    const read = () => {
      getRememberedPhone()
        .then((value) => {
          if (!alive) return;
          setSavedPhone(value);
          // Once it is saved the field is hidden; a prefill left in it would
          // reappear after "Stop being findable" as though typed.
          if (value) setPhone('');
        })
        .catch(() => {
          /* Unreadable storage reads as not saved; the card asks, which is safe. */
        });
    };
    read();
    getParkedClaims(email)
      .then((parked) => {
        const parkedPhone = parked?.phone;
        if (alive && parkedPhone) setPhone((typed) => typed || parkedPhone);
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
   * have neither — an offline tap was an unhandled rejection and the card
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
      <FacebookFriends />

      {/* Contacts — the recommended path, so it holds the card stack's filled button. */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="users" size={18} color={colors.wine} />
          <Text style={styles.cardTitle} accessibilityRole="header">Friends you already know</Text>
        </View>
        <Text style={styles.cardBody}>
          The fastest way to find people. Sipply checks your contacts against everyone here, with
          nothing to set up on their side. Numbers are scrambled on your phone before they are
          compared, and your address book is never uploaded.
        </Text>

        {contactsState === 'idle' ? (
          <Button
            label="Find from contacts"
            icon="users"
            block
            onPress={findFromContacts}
            style={styles.cardCta}
          />
        ) : null}

        {contactsState === 'working' ? (
          <View style={styles.working}>
            <ActivityIndicator color={colors.wine} />
            <Text style={styles.hint}>Checking your contacts…</Text>
          </View>
        ) : null}

        {contactsState === 'denied' ? (
          <View style={styles.deniedBox}>
            <Text style={styles.cardBody}>{CONTACTS_OFF}</Text>
            <Button
              label="Open Settings"
              variant="secondary"
              block
              onPress={() => Linking.openSettings()}
              style={styles.cardCta}
            />
          </View>
        ) : null}

        {contactsState === 'failed' ? (
          <View style={styles.deniedBox}>
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {contactsNotice}
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              block
              onPress={findFromContacts}
              style={styles.cardCta}
            />
          </View>
        ) : null}

        {contactsState === 'limited' ? (
          <Text style={styles.notice} accessibilityLiveRegion="polite">
            {contactsNotice}
          </Text>
        ) : null}

        {contactsState === 'done' ? (
          <>
            {/* Only set when the quota ran out part way: what is listed is not everyone. */}
            {contactsNotice ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {contactsNotice}
              </Text>
            ) : null}
            <MatchResults
              entries={contactEntries}
              emptyText={contactsNotice ? undefined : contactsEmptyText}
            />
          </>
        ) : null}
      </Card>

      {/* Discoverability */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          {/* The check is earned: it appears once the user actually is findable. */}
          <Icon name={savedPhone ? 'check' : 'eye'} size={18} color={colors.wine} />
          <Text style={styles.cardTitle} accessibilityRole="header">Let friends find you</Text>
        </View>
        {savedPhone ? (
          <>
            <Text style={styles.cardBody}>
              You’re findable by contacts. Your number is stored scrambled and never shown to
              anyone.
            </Text>
            {phoneError ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {phoneError}
              </Text>
            ) : null}
            <Button
              label="Stop being findable"
              variant="ghost"
              block
              loading={stoppingPhone}
              onPress={stopDiscoverable}
              style={styles.cardCta}
            />
          </>
        ) : (
          <>
            <Text style={styles.cardBody}>
              Add your number so friends who already have it can find you here. It is stored
              scrambled and never shown to anyone.
            </Text>
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
            {phoneError ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {phoneError}
              </Text>
            ) : null}
            <Button
              label="Make me findable"
              variant="secondary"
              block
              loading={savingPhone}
              disabled={phone.replace(/\D/g, '').length < 7}
              onPress={saveDiscoverable}
              style={styles.cardCta}
            />
          </>
        )}
      </Card>

      {/*
        Invite. The link is a custom-scheme deep link (see lib/invite.ts), so
        it only works on a phone that already has Sipply. The card says
        exactly that rather than promising a follow to someone the link
        cannot reach; the shared message carries the username to search.
      */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="share" size={18} color={colors.wine} />
          <Text style={styles.cardTitle} accessibilityRole="header">Invite a friend</Text>
        </View>
        <Text style={styles.cardBody}>
          Share your link. If they already have Sipply, opening it makes you follow each other.
        </Text>
        {inviteError ? (
          <Text style={styles.notice} accessibilityLiveRegion="polite">
            {inviteError}
          </Text>
        ) : null}
        <Button
          label="Share invite link"
          icon="share"
          variant="secondary"
          block
          loading={inviting}
          disabled={!profile}
          onPress={invite}
          style={styles.cardCta}
        />
      </Card>

      {/* Search */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="search" size={18} color={colors.wine} />
          <Text style={styles.cardTitle} accessibilityRole="header">Find by username</Text>
        </View>
        {/* The app's one search field, on the card's cream so its edge shows. */}
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder="Search @username or name"
          accessibilityLabel="Search for people by username"
          onCard
          trailing={
            showSearch && searching ? (
              <ActivityIndicator size="small" color={colors.wineSoft} />
            ) : null
          }
        />
        {searchFailed ? (
          <View style={styles.deniedBox}>
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {SEARCH_FAILED}
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              block
              onPress={() => setAttempt((n) => n + 1)}
              style={styles.cardCta}
            />
          </View>
        ) : showSearch ? (
          <MatchResults
            entries={searchEntries}
            emptyText={searching ? undefined : 'No one by that name yet.'}
          />
        ) : null}
      </Card>

      {/* Instagram */}
      <InstagramImport />

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg, paddingTop: space.sm },

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

  working: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  deniedBox: { gap: space.sm },
  /*
   * Failures, drawn the way the sign-in and edit-profile forms draw theirs:
   * danger ink on its wash (5.53:1). InstagramImport uses the same box, so
   * a failed check looks like a failure on every card of this screen.
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
  /*
   * textMuted, not textFaint: 13pt progress text on a white card is small
   * text, which the palette holds to 4.5:1. No top padding either — the
   * row centres it on its spinner, and padding pushed it 4pt below.
   */
  hint: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
});
