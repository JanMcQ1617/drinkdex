import AsyncStorage from '@react-native-async-storage/async-storage';

/* ==================================================================== */
/* Discovery claims                                                     */
/*                                                                      */
/* One way to be findable — your phone number: the device hashes it and */
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
/* There were two until v4.14: an Instagram handle too, for the import   */
/* Find friends no longer has. It was always the weaker one (a match     */
/* needed BOTH people to have claimed a handle, where a number needs     */
/* only that you are in each other's address books), and                */
/* retireInstagram at the bottom takes back what it left.                */
/* ==================================================================== */

const PHONE_KEY = 'clink-my-phone';

/*
 * Tells mounted cards that something here changed underneath them.
 *
 * The signup race is why. AuthGate shows the welcome step as soon as a
 * session exists, and the cards used to read the remembered phone and
 * handle once, on mount. The claims typed at signup only land here after
 * drainPendingClaims (store/auth.ts) has fetched the profile row and made
 * the RPC — two round trips later — so the one read always lost, and the
 * step asked for a number the user had typed seconds earlier and kept
 * asking. Every writer below notifies, including the one the drain
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

/* ==================================================================== */
/* What was claimed at signup, pending a session                        */
/*                                                                      */
/* The hash cannot be written during signUp. When the project requires   */
/* email confirmation the call returns no session at all, and even when  */
/* it does return one, the profile row is still being written by the     */
/* on_auth_user_created trigger — profile_secrets references profiles,   */
/* so an insert before that lands violates the foreign key.              */
/*                                                                      */
/* So the claim was parked here and drained once the profile row is      */
/* confirmed to exist. See drainPendingClaims in src/store/auth.ts.      */
/* Nothing parks one any more (the old email form did); what is read     */
/* below is what builds 8 to 11 left on phones still waiting on an email */
/* confirmation. Those records can hold an Instagram handle too, which   */
/* is no longer written anywhere: it goes when the record does.          */
/*                                                                      */
/* NOT passed through auth user_metadata, which would be shorter:        */
/* metadata is a second copy living outside profile_secrets, and         */
/* "stop being findable" would clear the hash while leaving it behind.   */
/* An opt-out that leaves a copy is not one.                             */
/* ==================================================================== */

const PENDING_KEY = 'clink-pending-claims';

/**
 * The email is stored alongside the claim and checked before the hash is
 * written. Without it, a signup that is started but never confirmed
 * leaves claims parked on the device that would attach themselves to
 * whatever account signs in next — on a shared phone, someone else's.
 */
export interface PendingClaims {
  email: string;
  /** Normalized to its last 10 significant digits, as contacts.ts does. */
  phone?: string;
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
 * Takes the parked number away, once the user has settled it by hand on a
 * card.
 *
 * A claim stays parked when the drain fails offline, and the drain tries
 * again on every profile load. Left in place, a parked number would be
 * written back on the next launch after the user had tapped "Stop being
 * findable" — an opt-out quietly undone. The card's own save or opt-out is
 * the newer answer, so the parked one goes. It is the only claim still
 * drained (the handle went with the Instagram import), so the whole record
 * goes with it.
 */
export async function dropParkedClaim(field: 'phone'): Promise<void> {
  const pending = await getPendingClaims();
  if (!pending?.[field]) return;
  await clearPendingClaims();
}

/* ==================================================================== */
/* Matching within the daily quota                                      */
/*                                                                      */
/* The server answers at most 500 hashes per call and 3,000 per account   */
/* per rolling day (migration 011). Past that a call raises              */
/* 'rate_limited' and is not charged.                                    */
/*                                                                      */
/* matchContacts already chunks, but it throws on the first refusal and  */
/* everything the earlier chunks found goes with it. For a large address */
/* book that is every check, every day: 3,000 hashes are spent, the      */
/* eleventh call is refused, and the user is told to come back tomorrow  */
/* to hit the same wall. So the slicing happens here as well, and a      */
/* refusal keeps what was already found. (The Instagram import, which    */
/* shared the quota until v4.14, was the list that hit it most.)         */
/* ==================================================================== */

/** What a refused contacts check says. The quota is the account's, not the screen's. */
export const RATE_LIMITED_MESSAGE = 'You have checked a lot of numbers today. Try again tomorrow.';

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
/* Instagram, retired                                                   */
/*                                                                      */
/* v4.14 took the Instagram import out of Find friends (Jan: "remove     */
/* the Instagram part"; specs/v4.14/find-friends.md). A phone that used  */
/* it still holds what it wrote: the imported list, up to 5,000 other    */
/* people's usernames; when that list was asked for; and the handle the  */
/* account claimed, whose hash is on the server. The keys and buttons    */
/* that let a person forget them went with the section, and a privacy   */
/* promise with no button behind it is not one, so this forgets them by  */
/* itself, on the first profile load after the update; on every load     */
/* after that it finds nothing to do.                                    */
/*                                                                      */
/* The handle is taken back on the server too, not only here: build 39  */
/* and older can still match against it, and nothing on screen can say  */
/* "Stop being findable" for it any more. Only when this phone remembers */
/* making a claim, so no other account pays a round trip. Its key goes   */
/* only once the server has agreed; offline, the next load tries again.  */
/* A claim made on another phone, or forgotten by a sign-out, cannot be  */
/* seen from here: that is the server cleanup the spec lists for later.  */
/* ==================================================================== */

const HANDLE_KEY = 'clink-ig-handle';
const IG_CONNECTIONS_KEY = 'clink-ig-connections';
const IG_REQUEST_KEY = 'clink-ig-requested';

/**
 * Forgets what the Instagram import left on this phone, and takes back
 * its handle claim through `withdraw` (the auth store passes the RPC, so
 * this file stays free of lib/social). A no-op on every phone that never
 * used it, which is nearly all of them.
 */
export async function retireInstagram(withdraw: () => Promise<void>): Promise<void> {
  await AsyncStorage.multiRemove([IG_CONNECTIONS_KEY, IG_REQUEST_KEY]);
  if (!(await AsyncStorage.getItem(HANDLE_KEY))) return;
  await withdraw();
  await AsyncStorage.removeItem(HANDLE_KEY);
}

/* ==================================================================== */
/* Forgetting                                                           */
/* ==================================================================== */

/**
 * Everything discovery remembers on the device, cleared together: the
 * phone number, claims parked at signup, and anything the Instagram
 * import left behind that retireInstagram has not yet cleared.
 *
 * Called by the auth store on sign-out and after account deletion.
 * Without it the previous account's number — and, on a phone that used
 * the import, its handle and up to 5,000 other people's usernames —
 * survive on the phone and are shown to whoever signs in next, as
 * "you're findable" claims that are not theirs.
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
    PENDING_KEY,
    HANDLE_KEY,
    IG_CONNECTIONS_KEY,
    IG_REQUEST_KEY,
  ]);
  notify();
}
