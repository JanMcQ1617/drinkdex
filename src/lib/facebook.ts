import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type AuthError, type User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';

import { urlFields } from '@/lib/recovery';
import { fetchProfiles, matchFacebookFriends } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Facebook                                                             */
/*                                                                      */
/* Continue with Facebook exists for one thing email cannot do: find the */
/* people you already know. No Meta API lists anyone's Instagram         */
/* followers, and Facebook's user_friends is the closest real thing. It  */
/* is narrower than it sounds, and the copy never promises more: Graph's */
/* /me/friends returns only the friends who ALSO use Sipply and granted  */
/* it user_friends too, each as an app-scoped id that means nothing      */
/* outside Sipply's Meta app. match_facebook_friends (migration 015)     */
/* turns those ids into profiles against the Facebook identities         */
/* Supabase Auth holds, so nobody can claim someone else's account.      */
/*                                                                      */
/* THE BROWSER LEG. supabase-js builds the /authorize URL (or, to add    */
/* Facebook to an existing account, /user/identities/authorize), the     */
/* system auth sheet opens it, and GoTrue sends the browser back to      */
/* drinkdex://auth/callback with the session in the URL. The client is   */
/* on the default implicit flow, so that session is a FRAGMENT, as on a  */
/* reset link (lib/recovery), and is read by hand for the same reason:   */
/* detectSessionInUrl is off. Do not switch the client to PKCE for this; */
/* password recovery depends on the implicit flow.                      */
/*                                                                      */
/* THE FACEBOOK TOKEN. The fragment also carries provider_token, a       */
/* Facebook user token that can read the person's Facebook account for  */
/* an hour or two. It is used only to list friends (and, when that list  */
/* is empty, to ask whether it was shared), and lives only in this       */
/* module's memory: never in AsyncStorage (the store hands               */
/* setSession the two Supabase tokens alone, so supabase-js never sees   */
/* it), never in a log, never in an error message. Sign-out drops it.    */
/*                                                                      */
/* THE LIST. The matched profiles are cached per account with the time   */
/* they were matched, so the friends list survives a relaunch without    */
/* another trip through Facebook. Only the list is kept: never a         */
/* Facebook id. Every read refreshes those profiles through RLS, which   */
/* also drops anyone blocked or deleted since.                          */
/* ==================================================================== */

/** The OAuth return link's path. app/+native-intent keys on it too. */
export const AUTH_CALLBACK_PATH = 'auth/callback';

/** drinkdex://auth/callback in a release build. Must be on Supabase's
 *  Redirect URLs allow-list, or GoTrue sends the browser to the Site URL. */
export function authCallbackUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

/** Name and email to make the account; user_friends is the reason to ask. */
const SCOPES = 'public_profile email user_friends';

const GRAPH_ORIGIN = 'https://graph.facebook.com/';
const FRIENDS_URL = `${GRAPH_ORIGIN}v21.0/me/friends?fields=id&limit=500`;
const PERMISSIONS_URL = `${GRAPH_ORIGIN}v21.0/me/permissions`;
/** Facebook stops a personal account at 5,000 friends; so does the matcher. */
const MAX_FRIEND_IDS = 5000;
/*
 * A stop for the paging loop that does not depend on the ids adding up.
 * Graph may send a page with no ids and a `next` link (its docs say to
 * keep paging until `next` is gone), so the id cap alone could loop on a
 * misbehaving answer with the spinner up. Fifty pages is ten times what
 * 5,000 ids at 500 a page needs.
 */
const MAX_PAGES = 50;
const PAGE_TIMEOUT_MS = 15_000;

const CACHE_PREFIX = 'sipply-facebook-friends:';

const OFFLINE = 'Cannot reach Sipply. Check your connection and try again.';

/* ==================================================================== */
/* Identity                                                             */
/* ==================================================================== */

/**
 * Whether this account can sign in with Facebook. Two fields of the user
 * say so, and either is enough: `identities`, which not every GoTrue
 * response fills in, and app_metadata.providers, which GoTrue keeps on the
 * user row itself and updates whenever an identity is linked. Both are as
 * old as the session's user object, so a link made on another phone shows
 * here once this session refreshes.
 */
export function hasFacebookIdentity(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.identities?.some((identity) => identity.provider === 'facebook')) return true;
  const providers: unknown = user.app_metadata?.providers;
  return Array.isArray(providers) && providers.includes('facebook');
}

/* ==================================================================== */
/* Browser leg                                                          */
/* ==================================================================== */

export type FacebookAuthOutcome =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; providerToken: string | null }
  /** Only under PKCE, which this client does not use; handled rather than dropped. */
  | { kind: 'code'; code: string; providerToken: null }
  /** Closed the sheet, or said no on Facebook's own page. Nothing to say. */
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/**
 * 'sign-in' makes or opens the account the Facebook identity belongs to.
 * 'link' adds Facebook to the signed-in account (supabase.auth.linkIdentity),
 * which needs "Allow manual linking" on in the Supabase dashboard.
 */
export type FacebookMode = 'sign-in' | 'link';

function failedCopy(mode: FacebookMode): string {
  return mode === 'link'
    ? 'Could not connect Facebook. Try again.'
    : 'Facebook did not sign you in. Try again, or use your email.';
}

/**
 * GoTrue's answer in words, keyed on its stable error codes, never on the
 * text, which is written for developers. Shared by an error the API call
 * returns and one the return link carries, since GoTrue reports the same
 * failures both ways.
 */
function describe(code: string | undefined, mode: FacebookMode): string {
  switch (code) {
    case 'manual_linking_disabled':
      // Said plainly, because only the dashboard can fix it.
      return 'Connecting Facebook to an existing account is switched off on Sipply’s server.';
    case 'identity_already_exists':
      return 'That Facebook account is already connected to a different Sipply account.';
    case 'provider_disabled':
      return 'Facebook sign-in is not switched on for Sipply yet.';
    case 'email_exists':
    case 'user_already_exists':
      return 'That email already has a Sipply account. Sign in with your email and password.';
    case 'provider_email_needs_verification':
      // GoTrue sends this email itself, to the address Facebook gave it.
      return 'Sipply sent a confirmation link to the email on your Facebook account. Open it, then try again.';
    case 'over_request_rate_limit':
      return 'Too many attempts just now. Wait a minute and try again.';
    default:
      return failedCopy(mode);
  }
}

function describeApiError(error: AuthError, mode: FacebookMode): string {
  if (isAuthRetryableFetchError(error) && !error.status) return OFFLINE;
  return describe(error.code, mode);
}

/**
 * Reads the return link. Never throws: urlFields skips anything that will
 * not decode, and this runs on a URL a web page could have written.
 */
export function parseAuthCallback(url: string, mode: FacebookMode): FacebookAuthOutcome {
  const fields = urlFields(url);

  if (fields.error || fields.error_code || fields.error_description) {
    /*
     * Cancel on Facebook's own dialog comes back as access_denied with the
     * reason user_denied, or, once GoTrue has passed it on without the
     * reason, with Facebook's description of it ("Permissions error"). It is
     * the same decision as closing the sheet, so it is answered the same
     * way: with nothing. An access_denied that carries one of GoTrue's own
     * error codes is a real refusal and falls through to be described.
     */
    const denied =
      fields.error_reason === 'user_denied' ||
      (fields.error === 'access_denied' &&
        !/[a-z]/i.test(fields.error_code ?? '') &&
        /denied|cancel|permission/i.test(fields.error_description ?? ''));
    if (denied) return { kind: 'cancelled' };
    return { kind: 'error', message: describe(fields.error_code || fields.error, mode) };
  }

  if (fields.access_token && fields.refresh_token) {
    return {
      kind: 'tokens',
      accessToken: fields.access_token,
      refreshToken: fields.refresh_token,
      providerToken: fields.provider_token || null,
    };
  }
  if (fields.code) return { kind: 'code', code: fields.code, providerToken: null };

  return { kind: 'error', message: failedCopy(mode) };
}

/**
 * Runs Facebook's sign-in page in the system auth sheet and reads what
 * GoTrue sends back. Changes no session: the auth store decides what to do
 * with the tokens, including refusing them (see connectFacebook there).
 */
export async function openFacebookAuth(mode: FacebookMode): Promise<FacebookAuthOutcome> {
  const redirectTo = authCallbackUrl();
  const options = {
    redirectTo,
    scopes: SCOPES,
    skipBrowserRedirect: true,
    /*
     * Passed on to Facebook by GoTrue. Facebook never asks again for a
     * permission someone once declined unless told to, so without this a
     * friends list left unticked the first time could never be shared
     * afterwards. With nothing declined it is the ordinary dialog.
     */
    queryParams: { auth_type: 'rerequest' },
  };

  try {
    const { data, error } =
      mode === 'link'
        ? await supabase.auth.linkIdentity({ provider: 'facebook', options })
        : await supabase.auth.signInWithOAuth({ provider: 'facebook', options });
    if (error) return { kind: 'error', message: describeApiError(error, mode) };
    if (!data?.url) return { kind: 'error', message: failedCopy(mode) };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { kind: 'cancelled' };
    return parseAuthCallback(result.url, mode);
  } catch {
    // A second sheet while one is open throws, as does a failed fetch.
    return { kind: 'error', message: failedCopy(mode) };
  }
}

/* ==================================================================== */
/* The Facebook token                                                   */
/* ==================================================================== */

/** The one provider token this session holds, and whose it is. Memory only. */
let held: { userId: string; token: string } | null = null;

/** Keeps a Facebook token from a sign-in or link for the friends check. */
export function holdFacebookToken(userId: string, token: string): void {
  held = { userId, token };
}

/**
 * True when the friends list can be read again without sending the person
 * back through Facebook: a token from this session is still in memory.
 */
export function canCheckWithoutFacebook(userId: string): boolean {
  return held?.userId === userId;
}

/* ==================================================================== */
/* Friends list                                                         */
/* ==================================================================== */

export interface FacebookFriendsList {
  /** When Facebook was last asked, in ms. */
  at: number;
  friends: UserProfile[];
}

interface FacebookFriendsState {
  /** Per account. undefined: not read yet; null: never checked on this phone. */
  lists: Record<string, FacebookFriendsList | null | undefined>;
  /** Per account: a check against Facebook is running. */
  checking: Record<string, boolean>;
  /** Per account: why the last check failed, or null. */
  failures: Record<string, string | null>;
}

/**
 * What FacebookFriends renders from. A store rather than a return value,
 * because the check that fills it starts in the auth store right after a
 * sign-in, while the screen that shows it is mounting somewhere else.
 */
export const useFacebookFriends = create<FacebookFriendsState>()(() => ({
  lists: {},
  checking: {},
  failures: {},
}));

function patch(userId: string, part: Partial<{ list: FacebookFriendsList | null; checking: boolean; failure: string | null }>) {
  useFacebookFriends.setState((s) => ({
    lists: 'list' in part ? { ...s.lists, [userId]: part.list } : s.lists,
    checking: 'checking' in part ? { ...s.checking, [userId]: !!part.checking } : s.checking,
    failures: 'failure' in part ? { ...s.failures, [userId]: part.failure ?? null } : s.failures,
  }));
}

/*
 * Bumped by clearFacebookCache. A check or a read that started before a
 * sign-out finishes after it, and without this it would write the previous
 * account's friends back into storage and onto the screen.
 */
let generation = 0;

async function readCache(userId: string): Promise<FacebookFriendsList | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown; friends?: unknown };
    if (typeof parsed.at !== 'number' || !Array.isArray(parsed.friends)) return null;
    return { at: parsed.at, friends: parsed.friends as UserProfile[] };
  } catch {
    return null;
  }
}

async function writeCache(userId: string, list: FacebookFriendsList): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(list));
  } catch {
    /* Shown for this launch either way; the next check writes it again. */
  }
}

class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
  ) {
    // Never the URL: it carries the token.
    super(`graph_${status}_${code ?? 'none'}`);
  }
}

/**
 * The person left "friends list" unticked in Facebook's dialog, or the Meta
 * app cannot ask for it yet (App Review). Told apart from an empty list by
 * asking Graph which permissions the token carries (friendsShared).
 */
class FriendsNotShared extends Error {
  constructor() {
    super('user_friends_not_granted');
  }
}

type GraphBody = {
  data?: { id?: unknown; permission?: unknown; status?: unknown }[];
  paging?: { next?: unknown };
  error?: { code?: unknown };
};

/** One Graph GET, with a timeout: a hung request must not hold the spinner forever. */
async function graphGet(url: string): Promise<GraphBody> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = (await res.json().catch(() => null)) as GraphBody | null;
    if (!res.ok || !body || body.error) {
      const code = typeof body?.error?.code === 'number' ? body.error.code : null;
      throw new GraphError(res.status, code);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** One page of /me/friends. */
async function fetchPage(url: string): Promise<{ ids: string[]; next: string | null }> {
  const body = await graphGet(url);
  const ids = (body.data ?? [])
    .map((friend) => friend?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const next = typeof body.paging?.next === 'string' ? body.paging.next : null;
  /*
   * Followed only back to Graph itself. `next` carries the token in its
   * query string, and a response that pointed anywhere else would send the
   * token there.
   */
  return { ids, next: next?.startsWith(GRAPH_ORIGIN) ? next : null };
}

/**
 * Whether the token carries user_friends. Asked only when the list comes
 * back empty: without the permission Graph can answer with an empty list
 * rather than an error, and "none of your friends are here" would then be
 * said to someone who never shared their friends at all.
 */
async function friendsShared(token: string): Promise<boolean> {
  const body = await graphGet(`${PERMISSIONS_URL}?access_token=${encodeURIComponent(token)}`);
  return (body.data ?? []).some(
    (entry) => entry?.permission === 'user_friends' && entry.status === 'granted',
  );
}

async function fetchFriendIds(token: string): Promise<string[]> {
  const ids: string[] = [];
  let url: string | null = `${FRIENDS_URL}&access_token=${encodeURIComponent(token)}`;
  for (let pages = 0; url && ids.length < MAX_FRIEND_IDS && pages < MAX_PAGES; pages++) {
    const page: { ids: string[]; next: string | null } = await fetchPage(url);
    ids.push(...page.ids);
    url = page.next;
  }
  return ids.slice(0, MAX_FRIEND_IDS);
}

/** 190: a token that has expired or been revoked. */
function tokenDead(e: unknown): boolean {
  return e instanceof GraphError && e.code === 190;
}

/**
 * A permission not granted: 200-range Graph codes, or an empty list from a
 * token without user_friends. That is what an unticked "friends list" in
 * Facebook's dialog, or a Meta app still waiting on App Review for
 * user_friends, looks like from here.
 */
function notShared(e: unknown): boolean {
  if (e instanceof FriendsNotShared) return true;
  return e instanceof GraphError && e.code !== null && e.code >= 200 && e.code < 300;
}

/** Graph's refusals, in words. */
function friendsFailure(e: unknown): string {
  if (tokenDead(e)) return 'Facebook needs you to confirm again before Sipply can check.';
  if (notShared(e))
    return 'Facebook did not share your friends list. Check again and allow it when Facebook asks.';
  return 'Could not check your Facebook friends. Try again.';
}

/**
 * Asks Facebook who of this person's friends use Sipply, matches them, and
 * caches the answer. Needs the token from a sign-in or link in this
 * session (holdFacebookToken); returns false without one, or on failure,
 * which is recorded for the screen in `failures`.
 */
export async function syncFacebookFriends(userId: string): Promise<boolean> {
  const token = held?.userId === userId ? held.token : null;
  if (!token) return false;
  if (useFacebookFriends.getState().checking[userId]) return false;

  const gen = generation;
  patch(userId, { checking: true, failure: null });
  try {
    const ids = await fetchFriendIds(token);
    if (ids.length === 0 && !(await friendsShared(token))) throw new FriendsNotShared();
    const friends = ids.length > 0 ? await matchFacebookFriends(ids) : [];
    if (gen !== generation) return false;
    const list = { at: Date.now(), friends };
    await writeCache(userId, list);
    if (gen !== generation) return false;
    patch(userId, { list, checking: false, failure: null });
    return true;
  } catch (e) {
    if (gen !== generation) return false;
    /*
     * Neither a dead token nor one without user_friends is retried with:
     * the same token would fail the same way on every Try again. Dropping
     * it sends the next check back through Facebook, which asks for the
     * friends list again (auth_type=rerequest, in openFacebookAuth).
     */
    if ((tokenDead(e) || notShared(e)) && held?.userId === userId) held = null;
    patch(userId, { checking: false, failure: friendsFailure(e) });
    return false;
  }
}

/**
 * The cached list for this account, read into the store, with each profile
 * refreshed. Refreshing goes through RLS, which hides anyone blocked either
 * way, and a deleted account simply does not come back, so both drop out
 * of a list that was matched before. Offline, the cached rows stand.
 */
export async function loadFacebookFriends(userId: string): Promise<FacebookFriendsList | null> {
  const gen = generation;
  const stored = await readCache(userId);
  if (gen !== generation) return null;

  // A check that finished while storage was being read is newer; keep it.
  const current = useFacebookFriends.getState().lists[userId];
  if (current && (!stored || current.at >= stored.at)) return current;

  patch(userId, { list: stored });
  if (!stored || stored.friends.length === 0) return stored;

  try {
    const fresh = await fetchProfiles(stored.friends.map((friend) => friend.id));
    if (gen !== generation) return null;
    const list = {
      at: stored.at,
      friends: stored.friends.flatMap((friend) => (fresh[friend.id] ? [fresh[friend.id]!] : [])),
    };
    // Only over the same list: a check that landed meanwhile wins.
    if (useFacebookFriends.getState().lists[userId]?.at !== stored.at) return stored;
    await writeCache(userId, list);
    patch(userId, { list });
    return list;
  } catch {
    return stored;
  }
}

/**
 * The signed-in account's Sipply friends from Facebook: null when the
 * account has no Facebook identity, otherwise the cached list — empty when
 * none of those friends are here, and also when nothing has been checked
 * on this phone yet (useFacebookFriends tells those apart, with null).
 * A list is made right after a Facebook sign-in or link; this reads it.
 */
export async function fetchFacebookFriends(): Promise<UserProfile[] | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || !hasFacebookIdentity(user)) return null;

  let list = useFacebookFriends.getState().lists[user.id];
  if (list === undefined) list = await loadFacebookFriends(user.id);
  if (!list && canCheckWithoutFacebook(user.id) && (await syncFacebookFriends(user.id))) {
    list = useFacebookFriends.getState().lists[user.id];
  }
  return list?.friends ?? [];
}

/**
 * Forgets every account's cached list and the token. Called on sign-out and
 * after account deletion (store/auth), so a shared phone never shows the
 * next person whom the last one knew.
 */
export async function clearFacebookCache(): Promise<void> {
  generation += 1;
  held = null;
  useFacebookFriends.setState({ lists: {}, checking: {}, failures: {} });
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CACHE_PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {
    /* A leftover list is only ever read back for its own account id. */
  }
}
