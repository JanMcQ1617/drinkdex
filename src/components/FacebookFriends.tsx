import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { MatchResults } from '@/components/PeopleList';
import { FindNote, FindSection } from '@/components/profile/FindSection';
import { Button, Notice } from '@/components/ui';
import { colors, space } from '@/constants/theme';
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
/* A section of its own (FindSection), like every section of Find       */
/* friends, on the page.                                                 */
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
  /* Storage answers within a frame; an empty section for that frame would
     only flash. A check or a failure already running shows at once, and so
     does a connect still finishing: Connect Facebook's session lands (and
     makes the account linked) a moment before the check it starts, and
     returning nothing in between made the section blink out mid-connect. */
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
      <FindNote>
        Connect Facebook to see which of your Facebook friends are already here. Facebook only
        shows Sipply the friends who connected it too, and Sipply never posts anything there.
      </FindNote>
    );
    action = (
      <Button label="Connect Facebook" variant="secondary" block loading={busy} onPress={() => void connect()} />
    );
  } else if (checking) {
    body = (
      <View style={styles.working}>
        <ActivityIndicator color={colors.text} />
        <View style={styles.flex}>
          <FindNote>Checking your Facebook friends…</FindNote>
        </View>
      </View>
    );
  } else if (!list) {
    body = (
      <FindNote>
        See which of your Facebook friends are already on Sipply. Facebook only shows the friends
        who connected Sipply too.
      </FindNote>
    );
    action = (
      <Button
        label={error ? 'Try again' : 'Check Facebook'}
        variant="secondary"
        block
        loading={busy}
        onPress={checkAgain}
      />
    );
  } else {
    body =
      list.friends.length === 0 ? (
        <FindNote>None of your Facebook friends have connected Sipply yet.</FindNote>
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
    <FindSection title="Friends from Facebook">
      {body}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {action}
    </FindSection>
  );
}

const styles = StyleSheet.create({
  working: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  flex: { flex: 1 },
});
