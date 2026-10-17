import { useRootNavigationState } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  ideasReady,
  listenForTaps,
  type NotificationTap,
  replanOnForeground,
  rescheduleDailyIdeas,
  routeNotification,
  setupNotifications,
  takeLaunchTap,
} from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useCollections } from '@/store/collections';
import { useCustomDrinks } from '@/store/customDrinks';
import { type DoneKind, useNotificationPrefs } from '@/store/notificationPrefs';
import { useSocial } from '@/store/social';
import { useTaste } from '@/store/taste';

import { IdeasOptInHost } from './IdeasOptIn';

/* ==================================================================== */
/* Notifications, over the whole app (spec §3.7, §3.8)                  */
/*                                                                      */
/* Mounted once in the root layout. Draws only the ask                  */
/* (IdeasOptInHost); everything else here is wiring:                    */
/*                                                                      */
/*   SETUP     the foreground handler and Android's channel, before any */
/*             ask (lib/notifications setupNotifications).              */
/*   TAPS      a tap while running, and the tap that cold-started the   */
/*             app, read once the root navigator can take a route.      */
/*             Each is acted on once: iOS can report a cold-start tap   */
/*             both ways.                                               */
/*   REPLANS   once every store the plan reads is back from the phone;  */
/*             on returning to the app (lib/notifications says when);   */
/*             at once on signing out, which cancels them; and 3s after */
/*             anything that changes what the plan would say: a catch,  */
/*             a post, a drink of your own, a save, a follow, your      */
/*             tastes, the feed arriving, signing in, or collections.   */
/*             Debounced, so a burst of changes is one replan.          */
/*   FIRSTS    the same changes, when they are the person's own doing,  */
/*             tell store/notificationPrefs that the ask may now be     */
/*             fair (noteDone). Hydration, a sign-in's sync and a feed  */
/*             load are not anyone's doing and never count, nor does    */
/*             anything done inside the first run.                      */
/*                                                                      */
/* Watched from here rather than called from each store: the stores     */
/* stay unaware of notifications, and one place says what counts.       */
/* ==================================================================== */

/** Between the last change and the replan it asks for. */
const SETTLE_MS = 3000;

/** The first run is over the app (components/FirstRun's own rule), read once. */
function firstRunUp(): boolean {
  const auth = useAuth.getState();
  const taste = useTaste.getState();
  return auth.ready && auth.session === null && taste.hydrated && !taste.done && !taste.signInFirst;
}

const count = (o: object) => Object.keys(o).length;

export function NotificationsHost() {
  const navReady = useRootNavigationState()?.key != null;
  const handled = useRef(new Set<string>());
  // A tap that arrived before the navigator could take it.
  const waiting = useRef<NotificationTap | null>(null);
  const navReadyNow = useRef(navReady);

  useEffect(() => {
    setupNotifications();
  }, []);

  /* ---- Taps ---- */

  useEffect(() => {
    navReadyNow.current = navReady;
    if (!navReady) return;
    const tap = waiting.current ?? takeLaunchTap();
    waiting.current = null;
    if (tap && !handled.current.has(tap.key)) {
      handled.current.add(tap.key);
      routeNotification(tap.data);
    }
  }, [navReady]);

  useEffect(
    () =>
      listenForTaps((tap) => {
        if (handled.current.has(tap.key)) return;
        if (!navReadyNow.current) {
          waiting.current = tap;
          return;
        }
        handled.current.add(tap.key);
        routeNotification(tap.data);
      }),
    [],
  );

  /* ---- Replans ---- */

  useEffect(() => {
    // At launch, as soon as every store the plan reads is back (now, or when the last one lands).
    let launched = ideasReady();
    if (launched) void rescheduleDailyIdeas('launch');
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (!launched) {
        if (!ideasReady()) return;
        launched = true;
        void rescheduleDailyIdeas('launch');
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void rescheduleDailyIdeas('change');
      }, SETTLE_MS);
    };
    const done = (kind: DoneKind) => {
      if (!firstRunUp()) useNotificationPrefs.getState().noteDone(kind);
    };

    const offs = [
      useNotificationPrefs.subscribe((s, p) => {
        if (s.hydrated !== p.hydrated) soon();
      }),
      useCollection.subscribe((s, p) => {
        if (s.hydrated !== p.hydrated) return soon();
        if (s.unlocks === p.unlocks) return;
        // A drink joining the Dex (unlock, or a submission adopted): the catalogue count went up.
        if (count(s.unlocks) > count(p.unlocks)) done('catch');
        soon();
      }),
      useCustomDrinks.subscribe((s, p) => {
        if (s.hydrated !== p.hydrated) return soon();
        if (s.drinks !== p.drinks) {
          if (count(s.drinks) > count(p.drinks)) done('create');
          soon();
        } else if (s.pours !== p.pours) soon();
      }),
      useTaste.subscribe((s, p) => {
        if (s.hydrated !== p.hydrated) return soon();
        if (s.saved !== p.saved) {
          // The person's own bookmark, not an account's saves arriving with a sign-in.
          if (s.saved.length > p.saved.length && s.syncedFor === p.syncedFor) done('save');
          soon();
        } else if (s.answers !== p.answers) soon();
      }),
      useSocial.subscribe((s, p) => {
        let changed = false;
        /*
         * Deleting a post bumps both versions too, in the same write that
         * takes it out of the feed; a post or a save bumps them with the
         * feed left as it was. Taking something away is not a first.
         */
        const removal = s.feed !== p.feed;
        if (s.postsVersion > p.postsVersion) {
          if (!removal) done('post');
          changed = true;
        }
        if (s.savesVersion > p.savesVersion) {
          if (!removal) done('save');
          changed = true;
        }
        if (s.following !== p.following) {
          /*
           * A follow made here grows the list with no load landing; a load
           * writes `following` and clears `loadingFeed` in one set, so the
           * one before it was loading.
           */
          if (s.following.length > p.following.length && !p.loadingFeed && !s.loadingFeed) done('follow');
          changed = true;
        }
        // The feed arriving (or failing) settles whether posts and follows are known.
        if (s.poursStatus !== p.poursStatus || s.feedError !== p.feedError) changed = true;
        if (changed) soon();
      }),
      useAuth.subscribe((s, p) => {
        /*
         * Signing out cancels what is pending (lib/notifications: ideas
         * come only while signed in), so that one is not left to the
         * debounce: an app closed in those 3s would keep a fortnight of
         * ideas the person can no longer turn off in Sipply.
         */
        if (launched && p.session !== null && s.session === null) {
          void rescheduleDailyIdeas('signed out');
          return;
        }
        if (s.ready !== p.ready || s.session?.user.id !== p.session?.user.id) soon();
      }),
      useCollections.subscribe((s, p) => {
        if (s.status !== p.status) soon();
      }),
    ];

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && launched) void replanOnForeground();
    });

    return () => {
      for (const off of offs) off();
      appState.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <IdeasOptInHost />;
}
