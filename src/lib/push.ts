import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createGuardedStorage } from '@/lib/guardedStorage';
import { notificationsStatus } from '@/lib/notifications';
import { isMissingFunction } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useNotificationPrefs } from '@/store/notificationPrefs';

/* ==================================================================== */
/* Push: this phone's address for other people's news                   */
/*                                                                      */
/* specs/v4.9/push.md; migration 027; supabase/functions/push. Daily    */
/* ideas stay local (lib/notifications). This is the one thing Sipply   */
/* sends from a server: "ana tagged you in a post.", "ana invited you   */
/* to Negroni week.", "ana started following you." Three switches, per  */
/* ACCOUNT, all on until changed, in Settings → Notifications.          */
/*                                                                      */
/* THE TOKEN is the address Apple's Push Notification service needs to  */
/* reach this phone. It is registered (register_push_token) while, and  */
/* only while, all of these hold: someone is signed in, that account    */
/* said yes to these alerts on this phone (`consent`, below), iOS       */
/* allows Sipply's notifications, 027 is on the server, and at least    */
/* one of the three switches is on. It is taken off                     */
/* (unregister_push_token) the moment one stops holding that this phone */
/* can see: signing out, another account signing in, the last switch    */
/* turned off, or iOS's permission withdrawn (read on returning to the  */
/* app). Account deletion takes it off on the server by cascade.        */
/*                                                                      */
/* CONSENT is its own, never borrowed from iOS's answer (App Store      */
/* 4.5.4). iOS's Allow may have been given to the daily ideas' ask,     */
/* whose words promise one idea a day and nothing else, so iOS allowing */
/* Sipply is never enough by itself. Only a tap on Allow in the alerts' */
/* own ask (components/notifications/AlertsOptIn), which names the      */
/* three kinds, says yes. Not now, or the ask going up and never        */
/* answered, is kept as a no that only that person's own Allow later    */
/* turns round, never daily ideas or iOS Settings. Per account and per  */
/* phone: another account signed in here has not said yes.              */
/*                                                                      */
/* SIGNING OUT needs no hook in the auth store: unregister takes the    */
/* token alone and is open to a signed-out phone (knowing a token means */
/* being the phone), so it runs after the session has gone, from the    */
/* auth store's own change. The token is kept on the phone until the    */
/* server says it is gone, so a sign-out with no connection is finished */
/* on a later launch; and another account registering the same token    */
/* moves it on the server anyway.                                       */
/*                                                                      */
/* WHEN. At launch once the stores are read, on returning to the app,   */
/* on any sign-in, sign-out or account change, on an answer to the      */
/* alerts' ask, when iOS's answer changes (any door: daily ideas, the   */
/* alerts' own ask, iOS Settings), when Apple rolls the token           */
/* (addPushTokenListener), and after a switch changes. One run at a     */
/* time, a request during a run queues one more, as lib/notifications'  */
/* replan does. Registered once per run of the app even when nothing    */
/* changed, so the server's updated_at says which phones are still in   */
/* use and the five-phone cap trims the rest.                           */
/*                                                                      */
/* NEVER BLOCKS ANYTHING. Every call is bounded, never throws, and a    */
/* failure simply leaves the next trigger to try again. Before 027      */
/* (PGRST202 / 42883) the switches are not shown and nothing is sent.   */
/* iOS only: the server speaks APNs alone. Web and Android: no-ops.     */
/*                                                                      */
/* THE ENVIRONMENT goes with the token: TestFlight and the App Store    */
/* sign with aps-environment production, a development build with       */
/* development, and Apple accepts a token only on its own host. A       */
/* release bundle is production, a __DEV__ one sandbox.                 */
/* ==================================================================== */

const ON = Platform.OS === 'ios';

/** The three switches, as the server names them (027 push_settings). */
export type AlertKind = 'tags' | 'invites' | 'follows';
export const ALERT_KINDS: readonly AlertKind[] = ['tags', 'invites', 'follows'];
export type AlertSettings = Record<AlertKind, boolean>;
const ALL_ON: AlertSettings = { tags: true, invites: true, follows: true };

/** The APNs host this build's tokens belong to (see the head of this file). */
const ENV: 'production' | 'sandbox' = __DEV__ ? 'sandbox' : 'production';
/** An APNs device token, lower-case hex (027 push_tokens_token_shape). */
const TOKEN_SHAPE = /^[0-9a-f]{64,200}$/;
/** iOS answers the token request in well under a second; past this, the next trigger tries again. */
const TOKEN_WAIT_MS = 15_000;
/** Any one server call, past which it counts as failed. */
const CALL_WAIT_MS = 10_000;

/* ------------------------------------------------------------------ */
/* The store                                                           */
/* ------------------------------------------------------------------ */

interface Registered {
  token: string;
  userId: string;
}

/** An account's answer to the alerts' own ask, on this phone. */
export type AlertsConsent = 'yes' | 'no';
/** Accounts whose answer this phone keeps: past this many, the longest unchanged goes. */
const CONSENT_KEEP = 5;

interface PushState {
  /** False until the saved state has been read back. */
  hydrated: boolean;
  /**
   * Each account's answer to the alerts' own ask (components/
   * notifications/AlertsOptIn), by user id. 'yes' only after its Allow;
   * 'no' once it has gone up without one. No entry: never asked here, so
   * the app may ask once (AlertsOptInHost) and nothing is registered.
   */
  consent: Record<string, AlertsConsent>;
  /** The token this phone last registered, and for whom; kept until the server has taken it off. */
  registered: Registered | null;
  /** NOT persisted. The signed-in account's switches; null until read. */
  settings: AlertSettings | null;
  /** NOT persisted. Whose `settings` those are. */
  settingsFor: string | null;
  /** NOT persisted. 027 is on the server (true), is not (false), or not known yet (null). */
  supported: boolean | null;

  setConsent: (userId: string, answer: AlertsConsent) => void;
  setRegistered: (r: Registered | null) => void;
  setSettings: (userId: string, settings: AlertSettings | null, supported: boolean) => void;
}

type Persisted = Pick<PushState, 'consent' | 'registered'>;

/** The answers, newest last, at most CONSENT_KEEP of them. */
function keepConsent(all: Record<string, AlertsConsent>): Record<string, AlertsConsent> {
  const ids = Object.keys(all);
  return Object.fromEntries(ids.slice(Math.max(0, ids.length - CONSENT_KEEP)).map((id) => [id, all[id]]));
}

function consentOf(v: unknown): Record<string, AlertsConsent> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, AlertsConsent> = {};
  for (const [id, answer] of Object.entries(v as Record<string, unknown>)) {
    if (id && (answer === 'yes' || answer === 'no')) out[id] = answer;
  }
  return keepConsent(out);
}

function registeredOf(v: unknown): Registered | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  return o && typeof o.token === 'string' && TOKEN_SHAPE.test(o.token) && typeof o.userId === 'string' && o.userId
    ? { token: o.token, userId: o.userId }
    : null;
}

export const usePush = create<PushState>()(
  persist(
    (set) => ({
      hydrated: false,
      consent: {},
      registered: null,
      settings: null,
      settingsFor: null,
      supported: null,

      // Moved to the end, so the trim keeps the accounts answered most recently.
      setConsent: (userId, answer) =>
        set((s) => {
          const { [userId]: _was, ...rest } = s.consent;
          return { consent: keepConsent({ ...rest, [userId]: answer }) };
        }),
      setRegistered: (registered) => set({ registered }),
      setSettings: (settingsFor, settings, supported) => set({ settingsFor, settings, supported }),
    }),
    {
      name: 'sipply-push.v1',
      storage: createJSONStorage(createGuardedStorage),
      partialize: (s): Persisted => ({ consent: s.consent, registered: s.registered }),
      // Read through a check (store/notificationPrefs' rule): anything unreadable falls back to the default.
      merge: (saved, current) => {
        const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof Persisted, unknown>>;
        return { ...current, consent: consentOf(s.consent), registered: registeredOf(s.registered), hydrated: true };
      },
      onRehydrateStorage: () => (_state, error) => {
        // The failure path never reaches merge; the guarded storage refuses the write, so nothing saved is lost.
        if (error) usePush.setState({ hydrated: true });
      },
    },
  ),
);

/** Whether any of the three is on. */
const anyOn = (s: AlertSettings) => ALERT_KINDS.some((k) => s[k]);

/** Whether the signed-in account said yes to these alerts on this phone. */
export function alertsConsented(userId: string | null | undefined): boolean {
  return !!userId && usePush.getState().consent[userId] === 'yes';
}

/**
 * Not now, from either door: kept as this account's no, unless it had
 * already said yes (a later Not now is only closing the sheet). Returns
 * nothing; no server call, since nothing was registered.
 */
export function declineAlerts(): void {
  const uid = useAuth.getState().session?.user.id;
  if (uid && usePush.getState().consent[uid] !== 'yes') usePush.getState().setConsent(uid, 'no');
}

/* ------------------------------------------------------------------ */
/* The server                                                          */
/* ------------------------------------------------------------------ */

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };

/*
 * One of 027's RPCs, through the typed client (lib/database.types.ts
 * names their arguments). Every answer is still shape-checked here
 * rather than trusted, as lib/tournaments does: the two settings calls
 * return jsonb, which no type describes, and a server ahead of or behind
 * this build may answer anything. Bounded, and never throws: a timeout or
 * a throw is an error with no code, which no caller reads as "missing".
 */
async function rpc(run: () => PromiseLike<RpcResult>): Promise<RpcResult> {
  try {
    return await Promise.race([
      Promise.resolve(run()),
      new Promise<RpcResult>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'timed out' } }), CALL_WAIT_MS),
      ),
    ]);
  } catch {
    return { data: null, error: { message: 'failed' } };
  }
}

function settingsOf(data: unknown): AlertSettings | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  return ALERT_KINDS.every((k) => typeof o[k] === 'boolean')
    ? { tags: o.tags as boolean, invites: o.invites as boolean, follows: o.follows as boolean }
    : null;
}

/**
 * Reads the signed-in account's three switches. True when they were read;
 * false when 027 is missing (remembered: the switches are not shown) or
 * the read failed (left unknown, so the next trigger reads again).
 */
export async function loadAlertSettings(): Promise<boolean> {
  if (!ON) return false;
  const uid = useAuth.getState().session?.user.id;
  if (!uid) return false;
  const { data, error } = await rpc(() => supabase.rpc('my_push_settings'));
  if (useAuth.getState().session?.user.id !== uid) return false;
  if (error) {
    if (isMissingFunction(error)) usePush.getState().setSettings(uid, null, false);
    return false;
  }
  const settings = settingsOf(data);
  if (!settings) return false;
  usePush.getState().setSettings(uid, settings, true);
  return true;
}

/**
 * Turns one switch on or off for the account. Shown at once, put back if
 * the server refuses, and the phone's address follows (the last one off
 * takes it off the server). True when saved.
 */
export async function setAlertSetting(kind: AlertKind, on: boolean): Promise<boolean> {
  const uid = useAuth.getState().session?.user.id;
  const before = usePush.getState().settings;
  if (!ON || !uid || !before) return false;
  usePush.getState().setSettings(uid, { ...before, [kind]: on }, true);
  const { data, error } = await rpc(() => supabase.rpc('set_push_setting', { p_kind: kind, p_on: on }));
  if (useAuth.getState().session?.user.id !== uid) return false;
  const saved = error ? null : settingsOf(data);
  if (!saved) {
    usePush.getState().setSettings(uid, before, !(error && isMissingFunction(error)));
    return false;
  }
  usePush.getState().setSettings(uid, saved, true);
  void syncPush('setting');
  return true;
}

/* ------------------------------------------------------------------ */
/* The token                                                           */
/* ------------------------------------------------------------------ */

/** The token iOS last gave, this run. Apple rolling it arrives through the listener. */
let latestToken: string | null = null;
/** `${userId}:${token}` registered this run: once is enough until something changes. */
let refreshed: string | null = null;

const tokenOf = (data: unknown): string | null => {
  const t = typeof data === 'string' ? data.toLowerCase() : '';
  return TOKEN_SHAPE.test(t) ? t : null;
};

async function deviceToken(): Promise<string | null> {
  if (latestToken) return latestToken;
  try {
    const t = await Promise.race([
      Notifications.getDevicePushTokenAsync(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_WAIT_MS)),
    ]);
    latestToken = t ? tokenOf(t.data) : null;
  } catch {
    // No aps-environment (a build without the entitlement), or APNs unreachable: the next trigger asks again.
  }
  return latestToken;
}

/** Takes a token off the server. True once it is gone (or 027 never held it). */
async function forget(token: string): Promise<boolean> {
  const { error } = await rpc(() => supabase.rpc('unregister_push_token', { p_token: token }));
  return !error || isMissingFunction(error);
}

/* ------------------------------------------------------------------ */
/* Keeping the server in step                                          */
/* ------------------------------------------------------------------ */

/** One pass: what the server should hold for this phone now, made so. */
async function syncOnce(): Promise<void> {
  const auth = useAuth.getState();
  if (!usePush.getState().hydrated || !auth.ready) return;
  const uid = auth.session?.user.id ?? null;

  // A previous account's address (signed out, or someone else signed in): off first.
  const before = usePush.getState().registered;
  if (before && before.userId !== uid && (await forget(before.token))) {
    usePush.getState().setRegistered(null);
    refreshed = null;
  }
  if (uid === null) return;

  // Read once per account, and again while 027 is missing or unknown, so applying it shows on the next return.
  if (usePush.getState().settingsFor !== uid || usePush.getState().supported !== true) await loadAlertSettings();
  const push = usePush.getState();
  if (push.supported !== true || push.settingsFor !== uid) return;

  // Consent first: iOS allowing Sipply (perhaps for daily ideas alone) is never enough by itself.
  const permission = await notificationsStatus();
  const want = permission === 'granted' && push.consent[uid] === 'yes' && anyOn(push.settings ?? ALL_ON);
  const reg = usePush.getState().registered;

  if (!want) {
    if (reg && reg.userId === uid && (await forget(reg.token))) {
      usePush.getState().setRegistered(null);
      refreshed = null;
    }
    return;
  }

  const token = await deviceToken();
  if (!token || useAuth.getState().session?.user.id !== uid) return;
  if (refreshed === `${uid}:${token}` && reg?.token === token && reg.userId === uid) return;
  // Apple rolled the token: the old one is dead, so it comes off rather than wait for a 410.
  if (reg && reg.userId === uid && reg.token !== token) await forget(reg.token);

  const { error } = await rpc(() => supabase.rpc('register_push_token', { p_token: token, p_env: ENV }));
  if (error) {
    if (isMissingFunction(error)) usePush.getState().setSettings(uid, null, false);
    return;
  }
  if (useAuth.getState().session?.user.id !== uid) return;
  usePush.getState().setRegistered({ token, userId: uid });
  refreshed = `${uid}:${token}`;
}

let running: Promise<void> | null = null;
let again = false;

/**
 * Makes the server's copy of this phone's address match now. `reason`
 * names the caller, for reading a trace; it changes nothing. Safe to call
 * as often as anything changes.
 */
export function syncPush(reason: string): Promise<void> {
  if (!ON) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce().catch(() => {});
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * The wiring, once, from components/notifications/NotificationsHost.
 * Returns the cleanup.
 */
export function startPush(): () => void {
  if (!ON) return () => {};
  const offs = [
    usePush.subscribe((s, p) => {
      if (s.hydrated !== p.hydrated) void syncPush('launch');
      else if (s.consent !== p.consent) void syncPush('consent');
    }),
    useAuth.subscribe((s, p) => {
      if (s.ready !== p.ready || s.session?.user.id !== p.session?.user.id) void syncPush('account');
    }),
    useNotificationPrefs.subscribe((s, p) => {
      if (s.permission !== p.permission) void syncPush('permission');
    }),
  ];
  const token = Notifications.addPushTokenListener((t) => {
    const next = tokenOf(t.data);
    if (!next || next === latestToken) return;
    latestToken = next;
    void syncPush('token');
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncPush('foreground');
  });
  void syncPush('launch');
  return () => {
    for (const off of offs) off();
    token.remove();
    appState.remove();
  };
}
