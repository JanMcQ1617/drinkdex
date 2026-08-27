import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/icons';
import { InstagramImport } from '@/components/InstagramImport';
import { MatchResults, type MatchEntry } from '@/components/PeopleList';
import { Button, Card, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { hashPhone, normalizePhone, readContactHashes, requestContactsPermission } from '@/lib/contacts';
import { forgetRememberedPhone, getRememberedPhone, rememberPhone } from '@/lib/discovery';
import { buildInviteMessage, buildInviteUrl } from '@/lib/invite';
import { matchContacts, searchPeople, setPhoneHash } from '@/lib/social';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';

/* ------------------------------------------------------------------ */
/* FindFriends                                                         */
/* ------------------------------------------------------------------ */

/**
 * The discovery surface: invite a friend, import your Instagram
 * connections, search by @username, or match your phone contacts.
 * Rendered inside the profile's Accounts segment.
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
  const profile = useAuth((s) => s.profile);

  /* ---- invite ---- */
  const invite = useCallback(async () => {
    if (!myId || !profile) return;
    haptic.tap();
    const url = buildInviteUrl(myId);
    try {
      await Share.share({ message: buildInviteMessage(profile.display_name, url) });
    } catch {
      /* dismissed */
    }
  }, [myId, profile]);

  /* ---- username search ---- */
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
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
        if (!cancelled && seq === searchSeq.current) setResults(found);
      } catch {
        if (!cancelled && seq === searchSeq.current) setResults([]);
      } finally {
        if (!cancelled && seq === searchSeq.current) setSearching(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [term, myId]);

  const showSearch = term.trim().length >= 2;

  /* ---- contacts ---- */
  type ContactsState = 'idle' | 'working' | 'denied' | 'done';
  const [contactsState, setContactsState] = useState<ContactsState>('idle');
  const [matches, setMatches] = useState<UserProfile[]>([]);
  const [scanned, setScanned] = useState(0);

  const findFromContacts = useCallback(async () => {
    haptic.tap();
    setContactsState('working');
    const perm = await requestContactsPermission();
    if (perm !== 'granted') {
      setContactsState('denied');
      return;
    }
    try {
      const { hashes, contactCount } = await readContactHashes();
      setScanned(contactCount);
      const found = await matchContacts(hashes);
      setMatches(found.filter((p) => p.id !== myId));
      setContactsState('done');
    } catch {
      setContactsState('done');
      setMatches([]);
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

  useEffect(() => {
    getRememberedPhone().then(setSavedPhone);
  }, []);

  const saveDiscoverable = useCallback(async () => {
    if (!myId) return;
    setSavingPhone(true);
    try {
      const h = await hashPhone(phone);
      if (!h) {
        setSavingPhone(false);
        return;
      }
      await setPhoneHash(myId, h);
      const normalized = normalizePhone(phone);
      if (normalized) await rememberPhone(normalized);
      setSavedPhone(normalized);
      setPhone('');
    } catch {
      /* surfaced by the store elsewhere */
    } finally {
      setSavingPhone(false);
    }
  }, [myId, phone]);

  const stopDiscoverable = useCallback(async () => {
    if (!myId) return;
    await setPhoneHash(myId, null);
    await forgetRememberedPhone();
    setSavedPhone(null);
  }, [myId]);

  if (!myId) return null;

  const searchEntries: MatchEntry[] = results.map((p) => ({ profile: p }));
  const contactEntries: MatchEntry[] = matches.map((p) => ({ profile: p }));

  return (
    <View style={styles.wrap}>
      {/* Contacts */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="users" size={18} color={colors.wine} />
          <Text style={styles.cardTitle}>Friends you already know</Text>
        </View>
        <Text style={styles.cardBody}>
          The fastest way to find people. Sipply checks your contacts against everyone here — no
          setup on their side beyond having signed up. Numbers never leave your phone; only
          scrambled one-way hashes are compared.
        </Text>

        {contactsState === 'idle' ? (
          <Button
            label="Find from contacts"
            icon="users"
            variant="secondary"
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
            <Text style={styles.cardBody}>
              Contacts access is off. Turn it on for Sipply in Settings, then try again.
            </Text>
            <Button
              label="Open Settings"
              variant="secondary"
              block
              onPress={() => Linking.openSettings()}
              style={styles.cardCta}
            />
          </View>
        ) : null}

        {contactsState === 'done' ? (
          <MatchResults
            entries={contactEntries}
            emptyText={`None of your ${scanned} contacts are on Sipply yet. Invite them above.`}
          />
        ) : null}
      </Card>

      {/* Discoverability */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="check" size={18} color={colors.wine} />
          <Text style={styles.cardTitle}>Let friends find you</Text>
        </View>
        {savedPhone ? (
          <>
            <Text style={styles.cardBody}>
              You’re findable by contacts. We stored a scrambled hash of your number, never the
              number itself.
            </Text>
            <Button
              label="Stop being findable"
              variant="ghost"
              block
              onPress={stopDiscoverable}
              style={styles.cardCta}
            />
          </>
        ) : (
          <>
            <Text style={styles.cardBody}>
              Add your number so friends who already have it find you here. This is normally set
              when you sign up. Only a one-way hash is stored, never the number.
            </Text>
            <View style={styles.searchWrap}>
              <Icon name="users" size={18} color={colors.textFaint} />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Your phone number"
                placeholderTextColor={colors.textFaint}
                inputMode="tel"
                autoComplete="tel"
                textContentType="telephoneNumber"
                style={styles.searchInput}
                accessibilityLabel="Your phone number, to be findable by contacts"
              />
            </View>
            <Button
              label={savingPhone ? 'Saving…' : 'Make me findable'}
              variant="secondary"
              block
              disabled={savingPhone || phone.replace(/\D/g, '').length < 7}
              onPress={saveDiscoverable}
              style={styles.cardCta}
            />
          </>
        )}
      </Card>
      {/* Invite */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="share" size={18} color={colors.wine} />
          <Text style={styles.cardTitle}>Invite a friend</Text>
        </View>
        <Text style={styles.cardBody}>
          Share your link. When they open it and sign up, you both follow each other automatically.
        </Text>
        <Button label="Share invite link" icon="share" block onPress={invite} style={styles.cardCta} />
      </Card>

      {/* Search */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="search" size={18} color={colors.wine} />
          <Text style={styles.cardTitle}>Find by username</Text>
        </View>
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search @username or name"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Search for people by username"
          />
          {showSearch && searching ? (
            <ActivityIndicator size="small" color={colors.wineSoft} />
          ) : null}
        </View>
        {showSearch ? (
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
  },

  working: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  deniedBox: { gap: space.sm },
  hint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textFaint,
    paddingTop: space.sm,
  },
});
