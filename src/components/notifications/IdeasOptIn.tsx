import { Image } from 'expo-image';
import { useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/Sheet';
import { announce, Button } from '@/components/ui';
import { colors, radius, space, textRole } from '@/constants/theme';
import type { PlannedIdea } from '@/lib/dailyIdeas';
import { introHasPlayed } from '@/lib/intro';
import {
  askNotifications,
  formatIdeaTime,
  notificationsStatus,
  previewIdea,
  rescheduleDailyIdeas,
} from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { useCelebrate } from '@/store/celebrate';
import { useCollections } from '@/store/collections';
import { mayAsk, useNotificationPrefs, type NotificationsPermission } from '@/store/notificationPrefs';
import { useTaste } from '@/store/taste';

/* ==================================================================== */
/* Daily ideas: the ask (spec §3.2, frame `optin`)                      */
/*                                                                      */
/* App Store 4.5.4: notifications are never required, and the person    */
/* reads plain words about what they are agreeing to BEFORE iOS's own   */
/* prompt. So this sheet comes first: an example of exactly what they   */
/* would get (their own first planned idea, filled), what it is, how    */
/* often, how to change or stop it, and that iOS asks next. iOS's       */
/* prompt follows only a tap on Allow. Not now, a swipe, the scrim or   */
/* VoiceOver's escape all mean no, and nothing is asked of iOS.         */
/*                                                                      */
/* WHEN THE APP ASKS BY ITSELF (IdeasOptInHost, below): never on first  */
/* launch, never before the person has done something, and only while  */
/* signed in, since ideas come only then (lib/notifications: the off    */
/* switch is in Settings, which needs an account). A catch, a           */
/* post, a drink of their own, a save or a follow makes it due (store/  */
/* notificationPrefs noteDone); it then waits for a calm moment: a tab  */
/* root showing, no window, celebration, first run or save sheet up,    */
/* the app in front, the intro over, and 800ms more (a JS timer). So    */
/* after a first catch it comes once the celebration card is done and   */
/* the person is back on a tab, never over the + window. Settings also  */
/* opens it, when someone ticks Daily ideas before iOS has been asked.  */
/* ==================================================================== */

/** The calm moment's extra wait (spec §3.2): long enough that the ask never lands with the tap that caused it. */
const CALM_MS = 800;
/** While the cold-start film is still up, look again this often. */
const INTRO_RETRY_MS = 1000;
/** The example's app icon: the Home-screen icon at a notification's size. */
const ICON = 38;
const ICON_ASSET = require('../../../assets/images/icon.png');

/**
 * Allow, from either door: iOS's prompt, then on (and planned at once)
 * or a refusal remembered so the app never asks by itself again.
 * `own` is the app's own ask, which counts against its two.
 */
export async function allowDailyIdeas(own: boolean): Promise<boolean> {
  const granted = await askNotifications();
  const prefs = useNotificationPrefs.getState();
  if (granted) {
    prefs.setEnabled(true);
    prefs.answered('allowed', own);
    void rescheduleDailyIdeas('allowed');
    announce(`Daily ideas on, at ${formatIdeaTime(prefs.hour, prefs.minute)}`);
  } else {
    prefs.setEnabled(false);
    prefs.answered('denied', own);
  }
  return granted;
}

/** Not now, a swipe or the scrim. */
export function declineDailyIdeas(own: boolean): void {
  useNotificationPrefs.getState().answered('notNow', own);
}

export function IdeasOptIn({
  visible,
  preview,
  permission,
  onAllow,
  onNotNow,
}: {
  visible: boolean;
  /** The person's own first planned idea; null draws no example. */
  preview: PlannedIdea | null;
  /** iOS's answer so far: once granted, there is no prompt to warn of. */
  permission: NotificationsPermission | null;
  onAllow: () => Promise<unknown>;
  onNotNow: () => void;
}) {
  const hour = useNotificationPrefs((s) => s.hour);
  const minute = useNotificationPrefs((s) => s.minute);
  const time = formatIdeaTime(hour, minute);
  const [busy, setBusy] = useState(false);

  const allow = () => {
    if (busy) return;
    setBusy(true);
    void onAllow().finally(() => setBusy(false));
  };

  // Once iOS has already said yes there is no prompt to come, so the sentence would be untrue.
  const next =
    permission === 'granted'
      ? ''
      : Platform.OS === 'ios'
        ? ' Next, iOS asks you to allow them.'
        : ' Next, your phone asks you to allow them.';

  return (
    <BottomSheet visible={visible} onClose={busy ? () => {} : onNotNow}>
      <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
        {preview ? (
          <View
            accessible
            accessibilityLabel={`For example: ${preview.body}`}
            style={styles.preview}>
            <Image
              source={ICON_ASSET}
              style={styles.icon}
              contentFit="cover"
              transition={0}
              enforceEarlyResizing
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <View style={styles.previewText}>
              {/* As iOS draws a notification with no title: the app's name, then the body. */}
              <View style={styles.previewHead}>
                <Text style={[textRole.groupTitle, styles.ink, styles.previewTitle]} numberOfLines={1}>
                  Sipply
                </Text>
                <Text style={[textRole.small, styles.muted]}>{time}</Text>
              </View>
              <Text style={[textRole.small, styles.ink]}>{preview.body}</Text>
            </View>
          </View>
        ) : null}
        <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
          Get one idea a day?
        </Text>
        <Text style={[textRole.body, styles.ink]}>
          {`Sipply can send you one notification a day at ${time}: a drink to read about, a recipe to create, or something new in the Dex.`}
        </Text>
        <Text style={[textRole.small, styles.muted, styles.small]}>
          {`Never more than one a day. Change the time or turn it off in Settings, under Notifications.${next}`}
        </Text>
      </ScrollView>
      <Button label="Allow daily ideas" block loading={busy} onPress={allow} />
      <Button label="Not now" variant="text" muted onPress={onNotNow} disabled={busy} style={styles.notNow} />
    </BottomSheet>
  );
}

/* ==================================================================== */
/* The app's own ask                                                    */
/* ==================================================================== */

/** The first run is over the app (components/FirstRun's own rule). */
function useFirstRunUp(): boolean {
  const ready = useAuth((s) => s.ready);
  const signedIn = useAuth((s) => s.session !== null);
  const hydrated = useTaste((s) => s.hydrated);
  const done = useTaste((s) => s.done);
  const signInFirst = useTaste((s) => s.signInFirst);
  return ready && !signedIn && hydrated && !done && !signInFirst;
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Puts the ask up by itself, once it is due and the moment is calm (see
 * the head of this file). Mounted once, in components/notifications/
 * NotificationsHost, over the whole app.
 */
export function IdeasOptInHost() {
  const due = useNotificationPrefs((s) => s.due);
  const hydrated = useNotificationPrefs((s) => s.hydrated);
  const permission = useNotificationPrefs((s) => s.permission);
  const onTab = useSegments()[0] === '(tabs)';
  const celebrating = useCelebrate((s) => s.queue.length > 0);
  const saveSheet = useCollections((s) => s.sheet !== null);
  const firstRun = useFirstRunUp();
  const signedIn = useAuth((s) => s.session !== null);
  const active = useAppActive();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PlannedIdea | null>(null);
  const [tick, setTick] = useState(0);

  // Signed out, `due` waits: the first calm moment after signing in asks.
  const calm = hydrated && due && signedIn && onTab && !celebrating && !saveSheet && !firstRun && active;

  /*
   * `live` goes false the moment the calm does (this effect's cleanup), so
   * a moment that passes while iOS's status or the plan is being read
   * puts nothing up: the next calm moment starts again.
   */
  useEffect(() => {
    if (!calm || open || Platform.OS === 'web') return;
    let live = true;
    const id = setTimeout(async () => {
      if (!introHasPlayed()) {
        // The cold-start film is still up: look again shortly.
        setTimeout(() => live && setTick((t) => t + 1), INTRO_RETRY_MS);
        return;
      }
      const status = await notificationsStatus();
      if (!live) return;
      if (!mayAsk(useNotificationPrefs.getState(), status)) {
        useNotificationPrefs.getState().dropDue();
        return;
      }
      const idea = await previewIdea();
      if (!live) return;
      setPreview(idea);
      setOpen(true);
    }, CALM_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [calm, open, tick]);

  return (
    <IdeasOptIn
      visible={open}
      preview={preview}
      permission={permission}
      onAllow={async () => {
        await allowDailyIdeas(true);
        setOpen(false);
      }}
      onNotNow={() => {
        declineDailyIdeas(true);
        setOpen(false);
      }}
    />
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  preview: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.bgSunk,
    borderRadius: radius.sheet,
    padding: space.lg,
    marginBottom: space.xl,
  },
  icon: { width: ICON, height: ICON, borderRadius: radius.card },
  previewText: { flex: 1, gap: 2 },
  previewHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  previewTitle: { flex: 1 },
  title: { marginBottom: space.sm },
  small: { marginTop: space.lg, marginBottom: space.xl },
  notNow: { alignSelf: 'center', marginTop: space.sm },
});
