import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { getDrink, TOTAL } from '@/data';
import { dayKey, plan, type IdeasState, type PlannedIdea } from '@/lib/dailyIdeas';
import { recommend } from '@/lib/recommend';
import { fetchPostCount, tagsConfirmed } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { collectionsOn } from '@/store/collections';
import { useCustomDrinks } from '@/store/customDrinks';
import { useNotificationPrefs, type NotificationsPermission } from '@/store/notificationPrefs';
import { useSocial } from '@/store/social';
import { EMPTY_ANSWERS, hasAnswers, useTaste } from '@/store/taste';

/* ==================================================================== */
/* Notifications: permission, the daily ideas' schedule, and taps       */
/*                                                                      */
/* specs/v4.3/spec.md §3. LOCAL ONLY: every idea is written and         */
/* scheduled on the phone with expo-notifications. No server, no push   */
/* key, no device token, nothing sent anywhere (docs/privacy.md).       */
/*                                                                      */
/* THE SCHEDULE is lib/dailyIdeas' plan for the next 14 days, made      */
/* again (plan, cancel ours, schedule) at launch, on returning to the   */
/* app, on a Settings change and after anything that changes what the   */
/* plan would say (components/notifications/NotificationsHost). One run */
/* at a time: a request during a run queues one more pass, never a      */
/* second run beside it, so two passes can never interleave their       */
/* cancels and schedules and leave a day with two ideas. Each day has   */
/* one identifier (`daily:YYYY-MM-DD`), so even a cancel that failed is */
/* replaced, not doubled, when that day is scheduled again.             */
/*                                                                      */
/* ONLY OURS. A replan cancels the notifications whose data says        */
/* `kind: 'daily'` (or whose identifier is a day's), one by one, never  */
/* cancelAllScheduled…: a later kind of notification must survive a     */
/* daily replan.                                                        */
/*                                                                      */
/* SIGNED IN ONLY. Ideas are planned only while someone is signed in:  */
/* the in-app off switch is in Settings (App Store 4.5.4), and Settings */
/* is reached from the Profile tab, which needs an account. Signing out */
/* keeps the choice and cancels what is pending; signing in plans again. */
/* So nothing ever arrives that the person cannot turn off in Sipply.   */
/*                                                                      */
/* A TAP opens the notification's `data.url`, whatever its kind, once   */
/* it passes the allowlist below. So a later server push (a tag, spec   */
/* §2.5) that carries `url: '/post/<id>'` opens its post with no client */
/* change: build 25 already has the module, the entitlement and this    */
/* handler.                                                             */
/*                                                                      */
/* Web: every call is a no-op. Nothing here can schedule there.         */
/* ==================================================================== */

/** The `data.kind` of a daily idea. */
export const DAILY_KIND = 'daily';
/** Android's channel for them (created at startup: Android 13 asks only once a channel exists). */
const CHANNEL_ID = 'daily-ideas';
const OFF = Platform.OS === 'web';

/* ------------------------------------------------------------------ */
/* Setup and permission                                                */
/* ------------------------------------------------------------------ */

let setUp = false;

/**
 * The foreground handler and Android's channel. Once per runtime, before
 * any ask.
 *
 * While Sipply is open at the idea's time, the idea goes to Notification
 * Centre only: no banner over what the person is doing, and no sound. Any
 * other kind (a later tag push) shows its banner as usual.
 */
export function setupNotifications(): void {
  if (OFF || setUp) return;
  setUp = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const daily = n.request.content.data?.kind === DAILY_KIND;
      return {
        shouldShowBanner: !daily,
        shouldShowList: true,
        shouldPlaySound: !daily,
        shouldSetBadge: false,
      };
    },
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Daily ideas',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

/** What the OS says about Sipply's notifications now. Never throws. */
export async function notificationsStatus(): Promise<NotificationsPermission> {
  if (OFF) return 'undetermined';
  try {
    const p = await Notifications.getPermissionsAsync();
    const status: NotificationsPermission = p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
    useNotificationPrefs.getState().setPermission(status);
    return status;
  } catch {
    return useNotificationPrefs.getState().permission ?? 'undetermined';
  }
}

/**
 * The system prompt, after the in-app ask (App Store 4.5.4: the person
 * has read what they are agreeing to, and tapped Allow). Alerts and
 * sound, never the badge, and never provisional: iOS's quiet delivery
 * without asking would skip the consent the ask exists for. True when
 * granted. On iOS a second call after a refusal returns at once without
 * a prompt, so the caller sends the person to iOS Settings instead.
 */
export async function askNotifications(): Promise<boolean> {
  if (OFF) return false;
  setupNotifications();
  try {
    const p = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    const status: NotificationsPermission = p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
    useNotificationPrefs.getState().setPermission(status);
    return p.granted;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* The person, as the planner reads them                               */
/* ------------------------------------------------------------------ */

/*
 * Your own posts, counted once per account and per change of your posts
 * (useSocial.postsVersion), when the feed on the phone shows none of
 * them: the feed is the newest posts of everyone you follow, so someone
 * who posted long ago can be missing from it, and "Post your first drink"
 * must never reach them. One head-only count; a failure leaves it unknown,
 * which leaves the first-post lines out. The request itself is kept, not
 * just its answer, so a replan, the ask's example and Settings asking at
 * once share one count rather than each waiting on its own.
 */
let postCount: { key: string; n: Promise<number | null> } | null = null;

function countMyPosts(myId: string, version: number): Promise<number | null> {
  const key = `${myId}:${version}`;
  if (postCount?.key !== key) postCount = { key, n: fetchPostCount(myId).catch(() => null) };
  return postCount.n;
}

/** True when `iso` falls on the same local day as `now`. */
function sameDay(iso: string | undefined, now: Date): boolean {
  const t = iso ? Date.parse(iso) : NaN;
  return !Number.isNaN(t) && dayKey(new Date(t)) === dayKey(now);
}

/**
 * Everything the plan depends on, from the stores already on the phone.
 * `posts` and `following` stay null until this session's feed has loaded:
 * an empty list before then means "not read yet", not "none".
 */
export async function readIdeasState(now: Date = new Date()): Promise<IdeasState> {
  const auth = useAuth.getState();
  const myId = auth.session?.user.id ?? null;
  const unlocks = useCollection.getState().unlocks;
  const custom = useCustomDrinks.getState();
  const taste = useTaste.getState();
  const social = useSocial.getState();

  const feedKnown = myId !== null && social.poursStatus !== 'idle' && social.feedError === null;
  const mine = feedKnown ? social.feed.filter((p) => p.mine) : [];
  let posts: number | null = null;
  if (feedKnown) posts = mine.length > 0 ? mine.length : await countMyPosts(myId, social.postsVersion);

  return {
    account: myId !== null,
    caught: Object.keys(unlocks).length,
    total: TOTAL,
    posts,
    custom: Object.keys(custom.drinks).length,
    following: feedKnown ? social.following.length : null,
    saved: taste.saved.length + (feedKnown ? social.feed.filter((p) => p.savedByMe).length : 0),
    tastes: hasAnswers(taste.answers),
    collectionsLive: collectionsOn(),
    // Answered, not merely not refused yet: a fortnight of ideas must not promise tags a server lacks.
    tagsLive: myId !== null && tagsConfirmed(),
    loggedToday: [...Object.values(unlocks), ...Object.values(custom.pours)].some((r) => sameDay(r.date, now)),
    postedToday: mine.some((p) => sameDay(p.createdAt, now)),
  };
}

/**
 * The day's suggested cocktails, best first (spec §3.5): the first run's
 * own recommender over the person's answers, or with none its plain
 * classics order. Cocktails only, so every "recipe" and "glass" line is
 * true of it; nothing caught or saved, since "take a look" at a drink
 * already in the Dex or the saves says nothing.
 */
function suggestionIds(): string[] {
  const taste = useTaste.getState();
  const answers = hasAnswers(taste.answers) ? taste.answers : EMPTY_ANSWERS;
  const exclude = [...Object.keys(useCollection.getState().unlocks), ...taste.saved];
  return recommend({ ...answers, drinks: 'cocktails', exclude }, 30)
    .filter((p) => p.category === 'cocktail')
    .map((p) => p.id);
}

/** The next fortnight for this person, as it would be scheduled now. */
export async function planIdeas(now: Date = new Date()): Promise<PlannedIdea[]> {
  const prefs = useNotificationPrefs.getState();
  return plan({
    state: await readIdeasState(now),
    hour: prefs.hour,
    minute: prefs.minute,
    history: prefs.history,
    now,
    installId: prefs.installId,
    suggestions: suggestionIds(),
    nameOf: (id) => getDrink(id)?.name,
  });
}

/** How long the ask waits for its example before it goes up without one. */
const PREVIEW_WAIT_MS = 1500;

/**
 * The ask's example: the first idea the plan would schedule, or null. The
 * plan can wait on the network (countMyPosts), and a tap on Settings' box
 * must never sit there for a minute on a bad connection with nothing on
 * screen, so past PREVIEW_WAIT_MS the ask goes up with no example rather
 * than late. Never throws.
 */
export function previewIdea(): Promise<PlannedIdea | null> {
  return Promise.race([
    planIdeas()
      .then((ideas) => ideas[0] ?? null)
      .catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), PREVIEW_WAIT_MS)),
  ]);
}

/** Whether every store the plan reads has been read back from the phone. */
export function ideasReady(): boolean {
  return (
    useNotificationPrefs.getState().hydrated &&
    useAuth.getState().ready &&
    useCollection.getState().hydrated &&
    useTaste.getState().hydrated &&
    useCustomDrinks.getState().hydrated
  );
}

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

/** The identifier of the idea for a local day: one per day, so a second schedule for it replaces the first. */
const ideaIdentifier = (day: string) => `${DAILY_KIND}:${day}`;

/**
 * Cancels every scheduled daily idea, and only those: by the data's kind,
 * or by the identifier, should a request come back without its data.
 * Never throws.
 */
export async function cancelDailyIdeas(): Promise<void> {
  if (OFF) return;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      pending
        .filter((r) => r.content.data?.kind === DAILY_KIND || r.identifier.startsWith(`${DAILY_KIND}:`))
        .map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier).catch(() => {})),
    );
  } catch {
    // Nothing to cancel that can be reached; the next replan tries again.
  }
}

/** The phone's time zone now; null where Intl cannot say. */
function zone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** One pass: settle what fired, then cancel ours and schedule the new plan (or nothing). */
async function replan(): Promise<void> {
  const prefs = useNotificationPrefs.getState();
  if (!prefs.hydrated) return;
  const now = new Date();
  prefs.settle(now);

  const status = await notificationsStatus();
  const allowed = useNotificationPrefs.getState().enabled && status === 'granted';
  /*
   * Not ready yet (a store still reading the phone back) leaves the last
   * plan in place; the host replans once everything is read. Checked
   * before the session, because auth is one of those stores: a session
   * not yet restored must not read as signed out and cancel the plan.
   */
  if (allowed && !ideasReady()) return;
  if (!allowed || useAuth.getState().session === null) {
    // Off, iOS says no, or signed out (see the head of this file): nothing of ours stays pending.
    await cancelDailyIdeas();
    useNotificationPrefs.getState().setPlan([], zone());
    return;
  }

  const ideas = await planIdeas(now);
  /*
   * The plan can wait on the network. Turned off meanwhile: schedule
   * nothing; the pass that Settings queued behind this one cancels.
   */
  if (!useNotificationPrefs.getState().enabled || useAuth.getState().session === null) return;
  await cancelDailyIdeas();
  const scheduled: PlannedIdea[] = [];
  for (const idea of ideas) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: ideaIdentifier(idea.day),
        content: {
          // Body only (data/dailyIdeas): iOS's first line is already the app's name.
          body: idea.body,
          sound: 'default',
          data: { kind: DAILY_KIND, id: idea.id, day: idea.day, url: idea.url },
          interruptionLevel: 'active',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: idea.at, channelId: CHANNEL_ID },
      });
      scheduled.push(idea);
    } catch {
      // A day that would not schedule is simply not planned: it never reaches history.
    }
  }
  useNotificationPrefs
    .getState()
    .setPlan(
      scheduled.map(({ id, cat, day, drink, at }) => ({ id, cat, day, drink, at: at.toISOString() })),
      zone(),
    );
}

let running: Promise<void> | null = null;
let again = false;

/**
 * Makes the schedule match the person and their settings now. `reason`
 * names the caller, for reading a trace; it changes nothing. Safe to call
 * as often as anything changes: one run at a time, and a call during a run
 * makes it go round once more when it ends.
 */
export function rescheduleDailyIdeas(reason: string): Promise<void> {
  if (OFF) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await replan().catch(() => {});
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Returning to the app within this long of the last plan replans only if something moved. */
const FOREGROUND_REPLAN_MS = 10 * 60_000;

/**
 * On returning to the app (spec §3.8, rules 2 and 6): iOS's permission is
 * read again, since it can be changed in iOS Settings at any time, and the
 * plan is made again when that changed, when the local day or the time
 * zone has moved since the last plan, or when that plan is over ten
 * minutes old. iOS holds each idea as a moment, not a clock time, so
 * after a move across zones the ideas already planned come at 6:00 PM
 * where the person was, until Sipply is opened where they are; the plan
 * made then puts them back at 6:00 PM local, and never a second one on a
 * day that already had its idea (lib/dailyIdeas plan).
 */
export async function replanOnForeground(): Promise<void> {
  if (OFF) return;
  const before = useNotificationPrefs.getState().permission;
  const status = await notificationsStatus();
  const { plannedAt, tz } = useNotificationPrefs.getState();
  const now = Date.now();
  const due =
    status !== before ||
    plannedAt === null ||
    now - plannedAt > FOREGROUND_REPLAN_MS ||
    dayKey(new Date(plannedAt)) !== dayKey(new Date(now)) ||
    tz !== zone();
  if (due) await rescheduleDailyIdeas('foreground');
}

/* ------------------------------------------------------------------ */
/* Taps                                                                */
/* ------------------------------------------------------------------ */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/*
 * Every path a notification may open (spec §3.7). Anything else opens
 * Home: a notification's data is input like a link's, and a path the app
 * never wrote must not reach the router. A drink id the catalogue lost
 * still passes, and the drink page says it is not there.
 */
const ALLOWED = new RegExp(
  '^/(|log|dex|saved|profile|activity|stats|find-friends|add-drink\\?from=shelf|settings\\?open=tastes' +
    `|drink/[a-z0-9][a-z0-9-]{0,79}|post/${UUID}|user/${UUID})$`,
);

/** The allowed path a notification's data asks for, or Home. */
export function notificationPath(data: unknown): string {
  const url = data && typeof data === 'object' ? (data as { url?: unknown }).url : undefined;
  return typeof url === 'string' && ALLOWED.test(url) ? url : '/';
}

/**
 * Opens what a tapped notification points at. Tabs are navigated to;
 * pages are pushed so Back returns to where the app was. Adding a drink
 * opens over the Dex, which takes the form's handoff and opens the new
 * drink, as it does from the Dex's own add (app/add-drink `from=shelf`).
 */
export function routeNotification(data: unknown): void {
  const path = notificationPath(data);
  const [head = '', id = ''] = path.slice(1).split('/');
  switch (head) {
    case '':
      router.navigate('/');
      return;
    case 'log':
      router.navigate('/log');
      return;
    case 'dex':
      router.navigate('/dex');
      return;
    case 'saved':
      router.navigate('/saved');
      return;
    case 'profile':
      router.navigate('/profile');
      return;
    case 'activity':
      router.push('/activity');
      return;
    case 'stats':
      router.push('/stats');
      return;
    case 'find-friends':
      router.push('/find-friends');
      return;
    case 'add-drink?from=shelf':
      router.navigate('/dex');
      router.push({ pathname: '/add-drink', params: { from: 'shelf' } });
      return;
    case 'settings?open=tastes':
      router.push({ pathname: '/settings', params: { open: 'tastes' } });
      return;
    case 'drink':
      router.push({ pathname: '/drink/[id]', params: { id } });
      return;
    case 'post':
      router.push({ pathname: '/post/[id]', params: { id } });
      return;
    case 'user':
      router.push({ pathname: '/user/[id]', params: { id } });
      return;
    default:
      router.navigate('/');
  }
}

/** A tap, as the host needs it: what it opens, and a key so it is acted on once. */
export interface NotificationTap {
  key: string;
  data: unknown;
}

function tapOf(r: Notifications.NotificationResponse | null): NotificationTap | null {
  // A tap on the notification itself; a later action button would bring its own handling.
  if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const n = r.notification;
  return { key: `${n.request.identifier}@${n.date}`, data: n.request.content.data };
}

/*
 * The module keeps the last response for as long as the process lives, and
 * a JS reload (an over-the-air update applying) would read it back as if it
 * had just been tapped. So every tap handed over is also cleared there.
 */
function forgetLastTap(): void {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Nothing kept to forget.
  }
}

/** Taps while the app is running (in front or behind). Returns the unsubscribe. */
export function listenForTaps(onTap: (tap: NotificationTap) => void): () => void {
  if (OFF) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const tap = tapOf(r);
    if (!tap) return;
    forgetLastTap();
    onTap(tap);
  });
  return () => sub.remove();
}

/**
 * The tap that cold-started the app, if one did, taken once: it is
 * cleared as it is read, so it is never opened again.
 */
export function takeLaunchTap(): NotificationTap | null {
  if (OFF) return null;
  try {
    const tap = tapOf(Notifications.getLastNotificationResponse());
    if (tap) forgetLastTap();
    return tap;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/**
 * "6:00 PM" in the phone's own format, with the space before AM or PM a
 * no-break space (U+00A0), so the time never breaks across two lines in
 * the ask's sentence or a Settings row.
 */
export function formatIdeaTime(hour: number, minute: number): string {
  const text = new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  // "PM", "pm" or "p. m." (Puerto Rico's Spanish): every space in and before it holds.
  return text.replace(
    /\s+([AaPp]\.?\s?[Mm]\.?)$/,
    (_, period: string) => `\u00A0${period.replace(/\s/g, '\u00A0')}`,
  );
}
