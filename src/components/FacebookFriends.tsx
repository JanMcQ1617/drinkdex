import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { MatchResults } from '@/components/PeopleList';
import { Button, Card, Notice, SectionHeader } from '@/components/ui';
import { colors, space, textRole } from '@/constants/theme';
import {
  canCheckWithoutFacebook,
  hasFacebookIdentity,
  loadFacebookFriends,
  syncFacebookFriends,
  useFacebookFriends,
} from '@/lib/facebook';
import { FACEBOOK_SIGN_IN_ENABLED, useAuth } from '@/store/auth';

/* ==================================================================== */
/* Friends from Facebook                                                */
/*                                                                      */
/* The signed-in person's Facebook friends who are already on Sipply,    */
/* with one "Follow all". It decides for itself what to be, so a screen  */
/* only has to mount it:                                                 */
/*                                                                      */
/*   • an account with Facebook: the matched friends (MatchResults, the  */
/*     rows and Follow all every list of people uses), one quiet line    */
/*     when none of them are here, or a Check Facebook button when this  */
/*     phone has never asked;                                            */
/*   • an account without it, while Facebook sign-in is switched on:     */
/*     Connect Facebook, which adds it (supabase.auth.linkIdentity) and  */
/*     checks straight after;                                            */
/*   • otherwise nothing.                                                */
/*                                                                      */
/* A card of its own, like each section of Find friends it opens, so it  */
/* belongs in a stack of cards and never inside one.                     */
/*                                                                      */
/* What it can find is honest about its limit: Facebook lists only the   */
/* friends who ALSO connected Sipply, never everyone (lib/facebook). The */
/* copy says so rather than promising a friends list it cannot have.     */
/* ==================================================================== */

export function FacebookFriends() {
  const user = useAuth((s) => s.session?.user);
  const connectFacebook = useAuth((s) => s.connectFacebook);
  const myId = user?.id;
  const linked = hasFacebookIdentity(user);

  const list = useFacebookFriends((s) => (myId ? s.lists[myId] : undefined));
  const checking = useFacebookFriends((s) => (myId ? !!s.checking[myId] : false));
  const failure = useFacebookFriends((s) => (myId ? (s.failures[myId] ?? null) : null));

  /* The browser leg is this component's own wait; the check after it is
     the store's (`checking`), since it can start from a sign-in elsewhere. */
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  /* Drawn in a Notice, which speaks an error as it appears (iOS has no live regions). */
  const error = connectError ?? failure;

  useEffect(() => {
    if (myId && linked) void loadFacebookFriends(myId);
  }, [myId, linked]);

  if (!myId) return null;
  if (!linked && !FACEBOOK_SIGN_IN_ENABLED) return null;
  /* Storage answers within a frame; an empty card for that frame would
     only flash. A check or a failure already running shows at once, and so
     does a connect still finishing: Connect Facebook's session lands (and
     makes the account linked) a moment before the check it starts, and
     returning nothing in between made the card blink out mid-connect. */
  if (linked && list === undefined && !checking && !connecting && !error) return null;

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      setConnectError(await connectFacebook());
    } finally {
      setConnecting(false);
    }
  };

  /*
   * A token from this session's Facebook sign-in is still in memory for an
   * hour or two, so a retry uses it. Once it has expired, or Graph said it
   * carries no friends list, lib/facebook drops it: only Facebook can issue
   * another, and the retry goes back through it.
   */
  const checkAgain = () => {
    setConnectError(null);
    if (canCheckWithoutFacebook(myId)) void syncFacebookFriends(myId);
    else void connect();
  };

  const busy = connecting || checking;

  let body: ReactNode;
  let action: ReactNode = null;

  if (!linked) {
    body = (
      <Text style={styles.cardBody}>
        Connect Facebook to see which of your Facebook friends are already here. Facebook only
        shows Sipply the friends who connected it too, and Sipply never posts anything there.
      </Text>
    );
    action = (
      <Button
        label="Connect Facebook"
        variant="secondary"
        block
        loading={busy}
        onPress={() => void connect()}
        style={styles.cardCta}
      />
    );
  } else if (checking) {
    body = (
      <View style={styles.working}>
        <ActivityIndicator color={colors.wine} />
        <Text style={styles.hint}>Checking your Facebook friends…</Text>
      </View>
    );
  } else if (!list) {
    body = (
      <Text style={styles.cardBody}>
        See which of your Facebook friends are already on Sipply. Facebook only shows the friends
        who connected Sipply too.
      </Text>
    );
    action = (
      <Button
        label={error ? 'Try again' : 'Check Facebook'}
        variant="secondary"
        block
        loading={busy}
        onPress={checkAgain}
        style={styles.cardCta}
      />
    );
  } else {
    body =
      list.friends.length === 0 ? (
        <Text style={styles.hint}>None of your Facebook friends have connected Sipply yet.</Text>
      ) : (
        <MatchResults entries={list.friends.map((profile) => ({ profile }))} />
      );
    /*
     * Quiet, under the list: the list is the content, and friends who join
     * later only appear once Facebook is asked again. A text button, so it
     * answers a press as every other one does. Only a connect can be under
     * way here (a check in flight shows the row above instead of the
     * list), and that is this button's own tap working, so it shows a
     * spinner at full strength rather than fading as if it could not be
     * pressed yet.
     */
    action = (
      <Button
        label={error ? 'Try again' : 'Check Facebook again'}
        variant="text"
        size="sm"
        block
        loading={busy}
        onPress={checkAgain}
      />
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Icon name="facebook" size={20} color={colors.text} />
        <SectionHeader title="Friends from Facebook" style={styles.cardTitle} />
      </View>

      {body}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {action}
    </Card>
  );
}

/*
 * The section styles Find friends' other cards use, so this one reads as
 * one of them: the glyph and a sentence-case heading in ink (of the
 * cards' own buttons only contacts' is filled wine), 13pt muted body, and
 * failures in an error Notice.
 */
const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1 },
  cardBody: { ...textRole.helper, color: colors.textMuted },
  cardCta: { marginTop: space.xs },

  working: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  /* textMuted: 13pt on a white card is small text, held to 4.5:1. */
  hint: { flex: 1, ...textRole.helper, color: colors.textMuted },
});
