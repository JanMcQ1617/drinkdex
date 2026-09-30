import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizePhone } from '@/lib/contacts';
import { normalizeHandle } from '@/lib/instagram';

/* ==================================================================== */
/* Discovery claims                                                     */
/*                                                                      */
/* Two ways to be findable — your phone number and your Instagram        */
/* handle — and both work the same way: the device hashes the value and  */
/* the server stores only the hash, in profile_secrets, which no client  */
/* can read (migration 008). That is deliberate, and it has one          */
/* consequence: the app cannot ask the server what it claimed. So the    */
/* plaintext is remembered here, or Find friends would keep asking       */
/* someone who already answered.                                         */
/*                                                                      */
/* Remembered for the account that is signed in, and only while it is:  */
/* clearDiscoveryCache at the bottom forgets all of it on sign-out and   */
/* on deletion. The keys carry no user id for that reason — nothing here */
/* outlives the session that wrote it.                                   */
/*                                                                      */
/* PHONE IS THE ONE THAT MATTERS. An Instagram import needs BOTH people  */
/* to have typed a handle, which almost nobody will. A phone number      */
/* needs only that the two of you are already in each other's address    */
/* books — which is the normal state of knowing someone. Collecting it   */
/* at signup is what turns contact matching from a two-sided chore into  */
/* one tap, and it is why signup asks.                                   */
/* ==================================================================== */

const PHONE_KEY = 'clink-my-phone';
const HANDLE_KEY = 'clink-ig-handle';

/*
 * Tells mounted cards that something here changed underneath them.
 *
 * The signup race is why. AuthGate shows the welcome step as soon as a
 * session exists, and the cards used to read the remembered phone and
 * handle once, on mount. The claims typed at signup only land here after
 * drainPendingClaims (store/auth.ts) has fetched the profile row and made
 * the RPC — two round trips later — so the one read always lost, and the
 * step asked for a number the user had typed seconds earlier and kept
 * asking. Every writer below notifies, including the two the drain
 * calls, so a card re-reads when the claim actually lands without the
 * auth store having to know the card exists.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

/** Runs `listener` after every write in this module. Returns the unsubscribe. */
export function subscribeDiscovery(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export async function rememberPhone(phone: string): Promise<void> {
  await AsyncStorage.setItem(PHONE_KEY, phone);
  notify();
}
export async function getRememberedPhone(): Promise<string | null> {
  return AsyncStorage.getItem(PHONE_KEY);
}
export async function forgetRememberedPhone(): Promise<void> {
  await AsyncStorage.removeItem(PHONE_KEY);
  notify();
}

export async function rememberHandle(handle: string): Promise<void> {
  await AsyncStorage.setItem(HANDLE_KEY, handle);
  notify();
}
export async function getRememberedHandle(): Promise<string | null> {
  return AsyncStorage.getItem(HANDLE_KEY);
}
export async function forgetRememberedHandle(): Promise<void> {
  await AsyncStorage.removeItem(HANDLE_KEY);
  notify();
}

/* ==================================================================== */
/* What was claimed at signup, pending a session                        */
/*                                                                      */
/* Neither hash can be written during signUp. When the project requires  */
/* email confirmation the call returns no session at all, and even when  */
/* it does return one, the profile row is still being written by the     */
/* on_auth_user_created trigger — profile_secrets references profiles,   */
/* so an insert before that lands violates the foreign key.              */
/*                                                                      */
/* So both claims are parked here and drained once the profile row is    */
/* confirmed to exist. See drainPendingClaims in src/store/auth.ts.      */
/*                                                                      */
/* NOT passed through auth user_metadata, which would be shorter:        */
/* metadata is a second copy living outside profile_secrets, and         */
/* "stop being findable" would clear the hash while leaving it behind.   */
/* An opt-out that leaves a copy is not one.                             */
/* ==================================================================== */

const PENDING_KEY = 'clink-pending-claims';

/**
 * The email is stored alongside the claims and checked before either hash
 * is written. Without it, a signup that is started but never confirmed
 * leaves claims parked on the device that would attach themselves to
 * whatever account signs in next — on a shared phone, someone else's.
 */
export interface PendingClaims {
  email: string;
  /** Normalized to its last 10 significant digits, as contacts.ts does. */
  phone?: string;
  /** Normalized: lowercased, '@' and URL wrappers stripped. */
  handle?: string;
}

export async function setPendingClaims(
  email: string,
  claims: { phone?: string; handle?: string },
): Promise<void> {
  const phone = claims.phone ? (normalizePhone(claims.phone) ?? undefined) : undefined;
  const handle = claims.handle ? (normalizeHandle(claims.handle) ?? undefined) : undefined;

  // Nothing worth parking. Clear rather than storing an empty record, so
  // a later drain does not see a claim-less entry and have to reason about it.
  if (!phone && !handle) {
    await clearPendingClaims();
    return;
  }

  await AsyncStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ email: email.trim().toLowerCase(), phone, handle } satisfies PendingClaims),
  );
}

export async function getPendingClaims(): Promise<PendingClaims | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingClaims;
    return typeof parsed?.email === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingClaims(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
  notify();
}

/**
 * The claims parked at signup for this signed-in email, if the drain has
 * not written them yet.
 *
 * Lets a card fill its field with what the user already typed instead of
 * an empty box, for the window before the drain lands — and for the case
 * where it failed offline and is waiting for the next profile load. The
 * email check is the same guard the drain applies: a claim parked by a
 * signup that was never confirmed belongs to someone else.
 */
export async function getParkedClaims(
  email: string | null | undefined,
): Promise<PendingClaims | null> {
  if (!email) return null;
  const pending = await getPendingClaims();
  return pending && pending.email === email.trim().toLowerCase() ? pending : null;
}

/**
 * Takes one field out of what is parked, once the user has settled it by
 * hand on a card.
 *
 * A claim stays parked when the drain fails offline, and the drain tries
 * again on every profile load. Left in place, a parked number would be
 * written back on the next launch after the user had tapped "Stop being
 * findable" — an opt-out quietly undone. The card's own save or opt-out is
 * the newer answer, so the parked one goes. The other field stays parked
 * for the drain.
 */
export async function dropParkedClaim(field: 'phone' | 'handle'): Promise<void> {
  const pending = await getPendingClaims();
  if (!pending || !pending[field]) return;
  const rest: PendingClaims = { ...pending, [field]: undefined };
  if (!rest.phone && !rest.handle) {
    await clearPendingClaims();
    return;
  }
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(rest));
  notify();
}

/* ==================================================================== */
/* Matching within the daily quota                                      */
/*                                                                      */
/* The server answers at most 500 hashes per call and 3,000 per account   */
/* per rolling day, across contacts and Instagram together (migration    */
/* 011). Past that a call raises 'rate_limited' and is not charged.      */
/*                                                                      */
/* matchContacts and matchInstagram already chunk, but they throw on the */
/* first refusal and everything the earlier chunks found goes with it.   */
/* For an Instagram list that is every large import, every day: 3,000     */
/* hashes are spent, the eleventh call is refused, and the user is told  */
/* to come back tomorrow to hit the same wall. So the slicing happens    */
/* here as well, and a refusal keeps what was already found.             */
/* ==================================================================== */

/** What a refused contacts check says. The quota is the account's, not the screen's. */
export const RATE_LIMITED_MESSAGE = 'You have checked a lot of numbers today. Try again tomorrow.';

/*
 * The same meter, worded for the Instagram card. "Numbers" means nothing
 * there, but "usernames" would be just as wrong after a contacts check has
 * spent the day's quota, since the two share it. This says only what is
 * true either way.
 */
export const RATE_LIMITED_IMPORT_MESSAGE = 'You have run a lot of checks today. Try again tomorrow.';

/*
 * Mirrors HASHES_PER_CALL in lib/social.ts, so each slice is exactly one
 * RPC. Smaller than the server's 500 on purpose: slices are charged whole,
 * and a smaller one wastes less of the day when it is the one refused.
 */
const MATCH_SLICE = 300;

/** True when the server refused a match because the daily quota is spent. */
export function isRateLimited(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { message, details, hint } = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [message, details, hint].some((v) => typeof v === 'string' && v.includes('rate_limited'));
}

/**
 * Runs `match` over `hashes` one slice at a time, in the order given.
 *
 * Order is the caller's lever: pass the likeliest friends first and a
 * refused day still spent itself on them. Resolves with everything found
 * and `limited: true` when the quota ran out part way; any other failure
 * throws, because a network error says nothing about who is here.
 */
export async function matchWithinQuota<T>(
  hashes: string[],
  match: (slice: string[]) => Promise<T[]>,
): Promise<{ found: T[]; limited: boolean }> {
  const unique = [...new Set(hashes)].filter(Boolean);
  const found: T[] = [];
  for (let i = 0; i < unique.length; i += MATCH_SLICE) {
    try {
      found.push(...(await match(unique.slice(i, i + MATCH_SLICE))));
    } catch (e) {
      if (isRateLimited(e)) return { found, limited: true };
      throw e;
    }
  }
  return { found, limited: false };
}

/**
 * Turns a failed discovery call into something a person can act on.
 *
 * Supabase error copy is developer-facing, and these RPCs raise their own
 * ("not signed in: set_phone_hash got no auth.uid()"). An offline call is
 * never an empty message either — postgrest-js reports it as
 * "TypeError: Network request failed" — so an `error.message || fallback`
 * never reached its fallback. The raw text still goes to the console in
 * development, where it is the useful part.
 */
export function discoveryErrorMessage(error: unknown, fallback: string): string {
  const message =
    typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';
  if (__DEV__ && message) console.warn(`[discovery] ${message}`);
  if (/network|fetch|timed? ?out/i.test(message)) {
    return 'Cannot reach Sipply. Check your connection and try again.';
  }
  if (/jwt|not signed in|auth\.uid/i.test(message)) {
    return 'Your session has ended. Sign in again, then try once more.';
  }
  return fallback;
}

/* ==================================================================== */
/* Forgetting                                                           */
/* ==================================================================== */

/**
 * Where InstagramImport caches the parsed export. Exported so the cache
 * and the code that clears it cannot name two different keys.
 */
export const IG_CONNECTIONS_KEY = 'clink-ig-connections';

/* ==================================================================== */
/* When the Instagram list was asked for                                 */
/*                                                                      */
/* Instagram makes the download in the background and it usually takes   */
/* about half an hour, so the import is two visits: ask, leave, come     */
/* back. Remembering when "Request your list" was tapped is what lets    */
/* the second visit lead with choosing the download, and say how long    */
/* ago it was asked for, instead of starting the errand over.            */
/*                                                                      */
/* The one key here that names its account, inside the value rather      */
/* than in the key, so clearDiscoveryCache still removes it by name.     */
/* Sign-out clears it, but that clear is best-effort; if it failed, the  */
/* next account on this phone would be told it had asked for a list it   */
/* never asked for, and led straight past the step that asks.            */
/* ==================================================================== */

const IG_REQUEST_KEY = 'clink-ig-requested';

/*
 * Instagram keeps a finished download for a few days (four, at the time
 * of writing) and then it is gone. A request older than that has nothing
 * waiting behind it, so it reads as never made and the card asks again.
 */
const IG_REQUEST_TTL_MS = 4 * 24 * 60 * 60 * 1000;

/** Records that `userId` has just asked Instagram for their list. */
export async function rememberInstagramRequest(userId: string): Promise<void> {
  await AsyncStorage.setItem(IG_REQUEST_KEY, JSON.stringify({ userId, at: Date.now() }));
  notify();
}

/**
 * When `userId` asked Instagram for their list, as epoch milliseconds, or
 * null: never, another account's, or too long ago to still be waiting.
 */
export async function getInstagramRequest(userId: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(IG_REQUEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: unknown; at?: unknown };
    if (parsed.userId !== userId || typeof parsed.at !== 'number') return null;
    return Date.now() - parsed.at > IG_REQUEST_TTL_MS ? null : parsed.at;
  } catch {
    return null;
  }
}

/** The list arrived and was read, so nothing is waiting any more. */
export async function forgetInstagramRequest(): Promise<void> {
  await AsyncStorage.removeItem(IG_REQUEST_KEY);
  notify();
}

/**
 * Everything discovery remembers on the device, cleared together: the
 * phone number, the Instagram handle, claims parked at signup, the
 * imported Instagram list, and when that list was last asked for.
 *
 * Called by the auth store on sign-out and after account deletion.
 * Without it the previous account's number, handle and imported list —
 * up to 5,000 other people's usernames — survive on the phone and are
 * shown to whoever signs in next, as "you're findable" claims that are
 * not theirs.
 *
 * Cleared rather than kept per account. Keying by user id would spare a
 * returning user one question, at the cost of leaving their number in
 * plaintext on a phone they may have signed out of in order to hand it
 * over. After signing back in, Find friends asks for the number again;
 * answering rewrites the hash that is already there.
 *
 * NOT to be called from the auth state listener. That fires with a null
 * session on a cold start in the middle of an email-confirmation signup,
 * and this removes the claims parked for exactly that signup.
 */
export async function clearDiscoveryCache(): Promise<void> {
  await AsyncStorage.multiRemove([
    PHONE_KEY,
    HANDLE_KEY,
    PENDING_KEY,
    IG_CONNECTIONS_KEY,
    IG_REQUEST_KEY,
  ]);
  notify();
}
