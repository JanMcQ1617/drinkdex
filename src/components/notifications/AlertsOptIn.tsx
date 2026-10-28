import { useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { BottomSheet } from '@/components/Sheet';
import { announce, Button } from '@/components/ui';
import { colors, radius, space, textRole } from '@/constants/theme';
import { askNotifications, notificationsStatus } from '@/lib/notifications';
import { declineAlerts, syncPush, usePush } from '@/lib/push';
import { useAuth } from '@/store/auth';
import { useNotificationPrefs, type NotificationsPermission } from '@/store/notificationPrefs';

/* ==================================================================== */
/* Alerts from people: the ask (specs/v4.9/push.md §3)                  */
/*                                                                      */
/* App Store 4.5.4, as the daily ideas' ask keeps it. That ask's words  */
/* promise one idea a day and nothing else, so these alerts have their  */
/* own: what they are (three kinds, each named), that each has its own  */
/* switch and where, and, while iOS has never been asked, that iOS asks */
/* next. iOS's prompt follows only a tap on Allow; Not now, a swipe,    */
/* the scrim or VoiceOver's escape all mean no, and nothing is asked of */
/* iOS.                                                                 */
/*                                                                      */
/* ITS OWN YES, WHATEVER iOS SAYS. Someone who allowed daily ideas said */
/* yes to Sipply's notifications in iOS's words, but to one idea a day  */
/* and nothing else, so iOS allowing Sipply never stands in for this    */
/* ask (lib/push `consent`). Allow is this account's yes on this phone, */
/* and then iOS asks only if it never has; once iOS allows Sipply the   */
/* sheet says nothing of iOS. Not now is kept as a no. Someone who      */
/* refused in iOS is never asked by the app again; Settings sends them  */
/* to iOS Settings.                                                     */
/*                                                                      */
/* WHEN THE APP ASKS BY ITSELF (AlertsOptInHost): once per account on   */
/* this phone, ever, the first time Activity is open (where tags,       */
/* invites' people and new followers already show) while signed in,     */
/* with 027 on the server, the app in front, no answer yet and iOS not  */
/* refusing, 800ms after Activity arrives (a JS timer). Never on first  */
/* launch: Activity needs an account and is reached from the heart.     */
/* Settings also opens it, when someone ticks one of the three without  */
/* having said yes here.                                                */
/* ==================================================================== */

/** As the daily ideas' ask: long enough that it never lands with the tap that opened Activity. */
const CALM_MS = 800;

/**
 * Allow, from either door: this account's yes, kept on the phone first,
 * then iOS's prompt (at once, with no prompt, when iOS already allows
 * Sipply), then the phone's address goes to the server (lib/push) and the
 * switches already on start to count. True when iOS allows them.
 */
export async function allowAlerts(): Promise<boolean> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) return false;
  usePush.getState().setConsent(uid, 'yes');
  const granted = await askNotifications();
  if (granted) {
    void syncPush('allowed');
    announce('Notifications on for tags, invites and new followers');
  }
  return granted;
}

/* The three kinds, in Settings' order, as the ask lists them. */
const KINDS: { icon: IconName; text: string }[] = [
  { icon: 'users', text: 'Someone tags you in a post' },
  { icon: 'trophy', text: 'Someone invites you to a tournament' },
  { icon: 'addPerson', text: 'Someone starts following you' },
];

export function AlertsOptIn({
  visible,
  permission,
  onAllow,
  onNotNow,
}: {
  visible: boolean;
  /** iOS's answer so far: once granted, there is no prompt to warn of. */
  permission: NotificationsPermission | null;
  onAllow: () => Promise<unknown>;
  onNotNow: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const allow = () => {
    if (busy) return;
    setBusy(true);
    void onAllow().finally(() => setBusy(false));
  };

  const next =
    permission === 'granted'
      ? ''
      : Platform.OS === 'ios'
        ? ' Next, iOS asks you to allow them.'
        : ' Next, your phone asks you to allow them.';

  return (
    <BottomSheet visible={visible} onClose={busy ? () => {} : onNotNow}>
      <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
          Hear when someone tags, invites or follows you?
        </Text>
        <Text style={[textRole.body, styles.ink]}>
          Sipply can send you a notification when one of these happens:
        </Text>
        {/* What arrives, one line a kind, in a wash panel like the daily ideas' example. */}
        <View
          accessible
          accessibilityLabel={KINDS.map((k) => k.text).join(', ')}
          style={styles.kinds}>
          {KINDS.map((k) => (
            <View key={k.icon} style={styles.kind}>
              <Icon name={k.icon} size={22} color={colors.text} />
              <Text style={[textRole.small, styles.ink, styles.kindText]}>{k.text}</Text>
            </View>
          ))}
        </View>
        <Text style={[textRole.small, styles.muted, styles.small]}>
          {`Each has its own switch in Settings, under Notifications. Daily ideas stay as they are.${next}`}
        </Text>
      </ScrollView>
      <Button label="Allow these notifications" block loading={busy} onPress={allow} />
      <Button label="Not now" variant="text" muted onPress={onNotNow} disabled={busy} style={styles.notNow} />
    </BottomSheet>
  );
}

/* ==================================================================== */
/* The app's own ask                                                    */
/* ==================================================================== */

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Puts the ask up by itself, once, on the first calm visit to Activity
 * (see the head of this file). Mounted once, in components/notifications/
 * NotificationsHost, over the whole app.
 */
export function AlertsOptInHost() {
  const hydrated = usePush((s) => s.hydrated);
  const supported = usePush((s) => s.supported === true);
  const permission = useNotificationPrefs((s) => s.permission);
  const myId = useAuth((s) => s.session?.user.id ?? null);
  const answered = usePush((s) => myId !== null && s.consent[myId] !== undefined);
  const onActivity = useSegments()[0] === 'activity';
  const active = useAppActive();
  const [open, setOpen] = useState(false);

  // Granted is no reason to skip it: iOS may have said yes to daily ideas alone.
  const calm =
    Platform.OS === 'ios' && hydrated && myId !== null && !answered && supported && onActivity && active && permission !== 'denied';

  /* As IdeasOptInHost: a moment that passes while iOS's answer is read puts nothing up. */
  useEffect(() => {
    if (!calm || open || !myId) return;
    let live = true;
    const id = setTimeout(async () => {
      const status = await notificationsStatus();
      if (!live || status === 'denied' || useAuth.getState().session?.user.id !== myId) return;
      // Spent as it goes up, as a no until Allow: at most once per account here, whatever the answer.
      usePush.getState().setConsent(myId, 'no');
      setOpen(true);
    }, CALM_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [calm, open, myId]);

  return (
    <AlertsOptIn
      visible={open}
      permission={permission}
      onAllow={async () => {
        await allowAlerts();
        setOpen(false);
      }}
      onNotNow={() => {
        declineAlerts();
        setOpen(false);
      }}
    />
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  title: { marginBottom: space.sm },
  kinds: {
    backgroundColor: colors.bgSunk,
    borderRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginTop: space.lg,
    gap: space.md,
  },
  kind: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  kindText: { flex: 1 },
  small: { marginTop: space.lg, marginBottom: space.xl },
  notNow: { alignSelf: 'center', marginTop: space.sm },
});
