import {
  isAuthRetryableFetchError,
  type AuthError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { clearVideoCacheAsync } from 'expo-video';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { SIGNUP_ACCENTS } from '@/constants/theme';
import { revokeAppleAccess } from '@/lib/appleRevoke';
import { hashPhone } from '@/lib/contacts';
import {
  clearDiscoveryCache,
  clearPendingClaims,
  getPendingClaims,
  rememberHandle,
  rememberPhone,
} from '@/lib/discovery';
import {
  clearFacebookCache,
  hasFacebookIdentity,
  holdFacebookToken,
  openFacebookAuth,
  syncFacebookFriends,
} from '@/lib/facebook';
import { hashHandle } from '@/lib/instagram';
import { containsObjectionable, isObjectionableError } from '@/lib/moderation';
import { openOAuth, type OAuthOutcome } from '@/lib/oauth';
import {
  checkResetRequest,
  clearRecovering,
  forgetResetRequest,
  markRecovering,
  readTokenAccount,
  recoveringUserId,
  recoveryRedirectUrl,
  rememberResetRequest,
} from '@/lib/recovery';
import {
  disableAvatarColumn,
  isMissingAvatarColumn,
  profileCols,
  setInstagramHash,
  setPhoneHash,
} from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/database.types';
/* A type only, erased at build time, so no require cycle: at runtime store/signInFlow imports this file, never the reverse. */
import type { EmailStatus } from '@/store/signInFlow';
import { useSocial } from '@/store/social';
import { showNotice } from '@/utils/alerts';


interface AuthState {
  session: Session | null;
  profile: ProfileRow | null;
  /** False until the persisted session has been restored from storage. */
  ready: boolean;
  /** True while the profile row is in flight, so the screen can say so. */
  profileLoading: boolean;
  /**
   * Set when the profile row could not be fetched. Distinct from `error`,
   * which belongs to the sign-in form — this one is shown on the profile
   * screen with a retry, because a signed-in user with no profile row is
   * otherwise indistinguishable from a blank screen.
   */
  profileError: string | null;
  busy: boolean;
  error: string | null;
  /** Non-failure feedback, e.g. "confirm your email before signing in". */
  notice: string | null;
  /**
   * True between opening a valid reset link and choosing a new password.
   *
   * A recovery link is a real sign-in — GoTrue hands back an ordinary
   * session — so by the time this is set, AuthGate has already stopped
   * showing the form and the app is on screen behind it. That is why the
   * "choose a new password" step is an overlay at the root rather than
   * another mode of the sign-in form: there is no signed-out state left
   * to render it in. See components/PasswordResetOverlay.
   *
   * Persisted alongside the session (lib/recovery), and restored before
   * `ready` flips, so relaunching mid-reset brings the step back rather
   * than leaving the user signed in on a password they do not know.
   */
  recovering: boolean;

  init: () => () => void;
  /**
   * Makes an account from an email and a password, and nothing else: no
   * username, no name, no discovery claims. handle_new_user (migration
   * 015) gives it the placeholder handle, and AuthGate's username step
   * asks for a real one, as it does for an account made any other way.
   * A taken username then comes back as updateProfile's clean 23505
   * rather than the opaque 500 a username at sign-up could only ever be.
   *
   * Answers through `error` and `notice`, like signIn. A project that
   * wants the email confirmed returns no session, and the notice says to
   * confirm and come back to sign in.
   */
  signUpEmail: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * How an email signs in, for the sign-in screen's email step: 'new',
   * 'password' or 'other' from sign_in_method (migration 016), or
   * 'unknown' when it will not say (metered, missing, anything but the
   * two failures below). `error` is set, and `status` null, only for no
   * connection and an address the server cannot read; both keep the
   * person on the email step.
   */
  lookupEmail: (
    email: string,
  ) => Promise<
    { status: EmailStatus; error: null } | { status: null; error: string }
  >;
  /*
   * The two below answer like the providers further down: an error to
   * show, or null. Neither sets `busy`; the sign-in flow store tracks
   * them as its own requests.
   */
  /**
   * Texts a 6-digit code to an E.164 number (Supabase's phone OTP, sent
   * by Twilio Verify). Makes the account on first use. Null once the
   * text is on its way. Nothing about the number is logged, ever.
   */
  sendPhoneCode: (e164: string) => Promise<string | null>;
  /**
   * Checks the code. Null once signed in; CODE_WRONG for a wrong or
   * expired code, which the flow counts toward its lock; other copy for
   * anything else.
   */
  verifyPhoneCode: (e164: string, code: string) => Promise<string | null>;
  /*
   * The four below answer with an error to show, or null — null for a
   * success and for a cancel alike, because closing Apple's sheet or
   * Google's or Facebook's page is a decision, not a failure. A string
   * rather than the store's `error`, so the sign-in screen can put a
   * failure under the button that caused it instead of under the email
   * form's.
   *
   * None of them sets `busy`, which belongs to the email form: its button
   * would otherwise say "Signing in…" while Apple's sheet was up.
   */
  /** Sign in with Apple: makes the account on first use. iOS only. */
  signInWithApple: () => Promise<string | null>;
  /**
   * Continue with Google: makes the account on first use. Google's own
   * access token is dropped as it arrives; nothing here needs it.
   */
  signInWithGoogle: () => Promise<string | null>;
  /** Continue with Facebook: makes the account on first use. */
  signInWithFacebook: () => Promise<string | null>;
  /**
   * For the signed-in account: adds Facebook to it when it has none
   * (linkIdentity), or goes back through Facebook for a fresh friends list
   * when it has. Either way the friends check runs straight after.
   */
  connectFacebook: () => Promise<string | null>;
  /**
   * Signs out and forgets what this account left on the device: discovery
   * claims, the Facebook friends list, a half-finished reset. The Dex
   * collection stays; it is the phone's, not the account's. The sign-in
   * screen's flow and the Reels feed reset themselves when the session
   * ends (store/signInFlow, store/reels), so nothing here calls them.
   */
  signOut: () => Promise<void>;
  /**
   * Sends the reset email. Resolves the same way whether or not the address
   * has an account — see the implementation for why that is deliberate.
   */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Exchanges the tokens from a recovery link for a session, if the link is this phone's to use. */
  beginRecovery: (accessToken: string, refreshToken: string) => Promise<void>;
  /** Sets the new password and ends recovery. Returns true on success. */
  completePasswordReset: (password: string) => Promise<boolean>;
  /** Abandons a recovery without setting a password, and signs back out. */
  cancelRecovery: () => Promise<void>;
  /**
   * Reports a dead, malformed or refused reset link: on the sign-in form
   * when signed out, as an alert when someone is signed in (the form is not
   * on screen then, and the message would otherwise go nowhere). Says
   * nothing while a reset is already open; see the implementation.
   */
  failRecovery: (message: string) => void;
  /**
   * Irreversible. For an account that uses Sign in with Apple, first has
   * the person confirm with Apple and revokes Sipply's Apple tokens
   * (lib/appleRevoke). Then takes the account's reels off the feed, empties
   * its folders in both storage buckets (photos, reels), and removes the
   * auth user and every row that cascades from it.
   */
  deleteAccount: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  /**
   * Saves edits to your own profile row. Returns an error string to show,
   * or null on success.
   *
   * A string rather than a throw: every failure here is something the user
   * has to read and act on — a taken username, a name that is too long —
   * and the caller is the only thing that knows where to put it.
   *
   * One answer is not copy. A name, username or bio the content filter
   * refuses comes back as 'objectionable_content <column>', the server's
   * own marker and the column its error names, whether the refusal came
   * from the server or from the client's copy of the list. The caller
   * recognises it with isObjectionableError and shows OBJECTIONABLE_MESSAGE
   * under that field; a bare OBJECTIONABLE_MESSAGE could only have gone
   * under whichever field changed, or above the form.
   */
  updateProfile: (fields: {
    displayName: string;
    username: string;
    bio: string;
    accent: string;
    /** Object path from a fresh upload, or undefined to leave it alone. */
    avatarPath?: string | null;
  }) => Promise<string | null>;
  clearError: () => void;
}

/* ==================================================================== */
/* Profile rules                                                        */
/*                                                                      */
/* The database is the authority on every one of these: `profiles`       */
/* carries CHECK constraints for the name length, the bio length and     */
/* the username shape (003/004), a unique index on username, and the     */
/* content filter trigger (011). The client mirrors them to answer fast  */
/* and next to the field. One copy here, used by the forms and by        */
/* updateProfile, so they cannot drift.                                 */
/* ==================================================================== */

/** Mirrors profiles_username_shape. Lowercase alphanumerics, underscore and
 *  period only — which also blocks unicode lookalike homographs. */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,24}$/;
export const USERNAME_MAX = 24;
/** Mirrors profiles_display_name_len. */
export const DISPLAY_NAME_MAX = 40;
/** Mirrors profiles_bio_len. */
const BIO_MAX = 300;
/** The username rule as the forms state it. */
export const USERNAME_RULE = 'Lowercase letters, numbers, dots and underscores. 3–24 characters.';
/** updateProfile's answer for a username someone else has; the username
 *  step compares against it to put the message under the right field. */
export const USERNAME_TAKEN = 'That username is taken. Pick another.';

/**
 * The content filter's verdict on a username. `glued` because the server
 * checks usernames that way — 'the_<term>' has no spaces to find a word
 * between — and a client check that let those through would leave them for
 * the server to refuse, a round trip after the person has moved on.
 * Exported so AuthGate's username step asks the same question this file
 * does.
 */
export function usernameObjectionable(handle: string): boolean {
  return containsObjectionable(handle, { glued: true });
}

/** The first shape rule a name and username break, or null. Both already
 *  trimmed, and the username lowercased. The word list is asked separately
 *  (refusedColumn), because the two callers report its answer differently. */
function profileFieldProblem(name: string, handle: string): string | null {
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX) return 'Display name must be 1–40 characters.';
  if (!USERNAME_PATTERN.test(handle))
    return 'Usernames are 3–24 characters: lowercase letters, numbers, dots and underscores.';
  return null;
}

/** A profile column the content filter reads, spelled as its error's DETAIL spells it (011). */
type FilteredColumn = 'display_name' | 'username' | 'bio';

/** The first field the client's copy of the word list refuses, or null. */
function refusedColumn(name: string, handle: string, about = ''): FilteredColumn | null {
  if (containsObjectionable(name)) return 'display_name';
  if (usernameObjectionable(handle)) return 'username';
  if (containsObjectionable(about)) return 'bio';
  return null;
}

/**
 * updateProfile's answer for a refused field: the marker the server raises
 * and the column it names, in the shape isObjectionableError recognises.
 * Never shown; see updateProfile in AuthState.
 */
function filterRefusal(column: string | null | undefined): string {
  return ['objectionable_content', column].filter(Boolean).join(' ');
}

/* ==================================================================== */
/* New accounts                                                         */
/*                                                                      */
/* No way of signing up sends a username: not a phone number, an email   */
/* (signUpEmail), Apple, Google or Facebook. So handle_new_user         */
/* (migration 015) gives the account 'pour_' and 8 hex digits of its    */
/* id, and a display name from Google or Facebook, or 'New collector'   */
/* when there is none — always for a phone number, an email, and Apple, */
/* whose identity token carries no name. AuthGate asks for a real       */
/* username once, before anything else, whenever the handle still has   */
/* that shape.                                                          */
/* ==================================================================== */

/** The handle handle_new_user makes. The step that replaces it keys on this shape. */
const PLACEHOLDER_USERNAME = /^pour_[0-9a-f]{8}$/;
/** handle_new_user's name when the provider sent none (migration 015). */
const PLACEHOLDER_NAME = 'New collector';

export function isPlaceholderUsername(handle: string): boolean {
  return PLACEHOLDER_USERNAME.test(handle);
}

/**
 * Said when someone types the placeholder shape themselves. It is refused
 * by the client (the username step and updateProfile), not by the server:
 * an account that chose it would be asked to choose a username again on
 * every launch.
 */
export const PLACEHOLDER_USERNAME_RULE =
  'That is the kind of name Sipply gives new accounts. Choose one of your own.';

/** Collapsed and cut to what profiles_display_name_len allows. */
function tidyName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX).trim();
}

/*
 * The name Apple gave this session, by account. Apple sends it on the very
 * first authorisation only — never again, on any phone — so it is written
 * to the profile at once (adoptProviderName) and kept here to prefill the
 * username step even if that write has not landed.
 */
const providerNames = new Map<string, string>();

/**
 * The display name the username step starts from: Apple's name from this
 * session, then the profile's own unless it is the placeholder (Google's
 * or Facebook's name is already there, from migration 015), then the name
 * Google or Facebook gave the auth user. Empty when nobody sent one.
 */
export function suggestedDisplayName(profile: ProfileRow | null, user: User | null | undefined): string {
  const fromApple = user ? providerNames.get(user.id) : undefined;
  if (fromApple) return fromApple;
  if (profile && profile.display_name !== PLACEHOLDER_NAME) return profile.display_name;
  const meta = (user?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const named = [meta.full_name, meta.name].find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return named ? tidyName(named) : '';
}

/**
 * Replaces 'New collector' with the name Apple sent, straight away, so the
 * account has it even if the username step is abandoned. Only over the
 * placeholder, so a name someone chose is never overwritten, and not at
 * all when the word list would refuse it: the step shows it for editing.
 */
async function adoptProviderName(uid: string, name: string): Promise<void> {
  providerNames.set(uid, name);
  if (containsObjectionable(name)) return;
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', uid)
    .eq('display_name', PLACEHOLDER_NAME);
  if (!error && useAuth.getState().session?.user.id === uid) void useAuth.getState().refreshProfile();
}

/** Apple's name parts as one line, or null when the person shared none. */
function appleName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  if (!fullName) return null;
  let formatted = '';
  try {
    formatted = AppleAuthentication.formatFullName(fullName);
  } catch {
    formatted = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ');
  }
  const name = tidyName(formatted);
  return name.length > 0 ? name : null;
}

/* ==================================================================== */
/* Which sign-in methods this build shows                               */
/*                                                                      */
/* All off until the setup listed in .env is done (Apple's and Meta's    */
/* consoles, Twilio, Google Cloud, the Supabase providers): a method     */
/* whose provider is not configured fails on the first tap. 'on' in .env */
/* shows it; anything else hides it. Read with static dot access, which  */
/* is what lets Expo inline them into the bundle. Email has no flag: it  */
/* is always offered.                                                   */
/* ==================================================================== */

/** Sign in with Apple: iOS only. The sign-in screen also asks isAvailableAsync. */
export const APPLE_SIGN_IN_ENABLED =
  Platform.OS === 'ios' && process.env.EXPO_PUBLIC_APPLE_SIGN_IN === 'on';

/**
 * Continue with Facebook, and Connect Facebook for an account without it.
 * The sign-in screen shows the sign-in button only beside Apple's: App
 * Review guideline 4.8 requires Sign in with Apple wherever another
 * third-party sign-in is offered.
 */
export const FACEBOOK_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_FACEBOOK_SIGN_IN === 'on';

/**
 * Sign in with a phone number and a texted code. First-party, so 4.8 does
 * not tie it to Apple; with it off, the sign-in screen's top field is the
 * email instead.
 */
export const PHONE_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_PHONE_SIGN_IN === 'on';

/** Continue with Google. Third-party, so like Facebook it shows only beside Apple (4.8). */
export const GOOGLE_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === 'on';

const APPLE_FAILED = 'Apple did not sign you in. Try again, or use your email.';
const GOOGLE_FAILED = 'Google did not sign you in. Try again, or use another way.';
const OTHER_ACCOUNT =
  'That Facebook account belongs to a different Sipply account. Sign out first to use it.';

/* ==================================================================== */
/* Error copy                                                           */
/* ==================================================================== */

const OFFLINE = 'Cannot reach Sipply. Check your connection and try again.';
const TOO_MANY = 'Too many attempts just now. Wait a minute and try again.';

/*
 * Exported because the sign-in flow (store/signInFlow) compares the
 * store's answer against them to decide its next step, as the username
 * step compares against USERNAME_TAKEN. Copy, not codes, because that is
 * what the store holds; keep each written once, here.
 */
/** A password sign-in GoTrue refused as invalid_credentials. */
export const WRONG_PASSWORD = 'That email and password do not match.';
/** A sign-up for an address that already has an account. */
export const EMAIL_HAS_ACCOUNT = 'That email already has an account. Try signing in.';
/** A wrong or expired phone code: the one verify failure the flow counts toward its lock. */
export const CODE_WRONG = 'That code is wrong or has expired. Check it, or send a new one.';
/** A number that cannot be a mobile number, from the field's own check or GoTrue's. */
export const PHONE_INVALID = 'That number doesn’t look right. Check the country and the number.';
/** An address the email step's check, or the lookup, refuses. */
export const EMAIL_INVALID = 'That email address doesn’t look right.';

const SIGN_UP_FAILED = 'Could not create your account. Try again.';
const CODE_FAILED = 'Couldn’t check that code. Try again.';
const SEND_FAILED = 'Couldn’t send a code just now. Try again.';

/**
 * GoTrue errors, in words a person can act on.
 *
 * Keyed on `error.code`, which auth-js sets from GoTrue's stable error
 * codes, never on the message. The old version matched substrings, and
 * "any message containing 'email'" caught "Email not confirmed" — the
 * state signUpEmail's own notice sends people into — and told them their
 * address looked wrong. "Any message containing 'password'" turned
 * same_password into "must be at least 6 characters" for a password of
 * twelve. What no code covers gets the caller's `fallback`, never the raw
 * server text, which is written for developers.
 *
 * The two message checks are for GoTrue versions that predate codes.
 */
function humanizeAuth(error: AuthError, fallback: string): string {
  if (isAuthRetryableFetchError(error) && !error.status) return OFFLINE;
  switch (error.code) {
    case 'invalid_credentials':
      return WRONG_PASSWORD;
    case 'email_not_confirmed':
      return 'Confirm your email first. The link is in your inbox.';
    case 'same_password':
      return 'That is already your password. Choose a different one.';
    case 'weak_password':
      return 'That password is too easy to guess. Try a longer one.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return TOO_MANY;
    case 'email_address_invalid':
      return 'That email address does not look right.';
    case 'user_already_exists':
    case 'email_exists':
      return EMAIL_HAS_ACCOUNT;
  }
  if (error.status === 429) return TOO_MANY;
  if (/invalid login credentials/i.test(error.message)) return WRONG_PASSWORD;
  if (/email not confirmed/i.test(error.message))
    return 'Confirm your email first. The link is in your inbox.';
  return fallback;
}

/**
 * signUpEmail's errors. It sends no username and no name, so the
 * on_auth_user_created trigger only ever writes the placeholder handle
 * and 'New collector', which nothing refuses: a 500 can no longer mean
 * "that username is taken", only that the server failed.
 *
 * The 500 is matched on `status`, never on `message`. GoTrue reports a
 * failure inside that trigger as an unexpected server error, and
 * supabase-js never parses the body: it raises AuthRetryableFetchError,
 * whose message is "{}" under Node and a stringified Response on React
 * Native. Reading the message is what once put a raw JSON blob on the
 * sign-up screen. The one message check, "already registered", is for a
 * duplicate email from GoTrue versions that predate codes.
 */
function humanizeSignUp(error: AuthError): string {
  // Checked first: a duplicate email is a clean, readable 4xx.
  if (
    error.code === 'user_already_exists' ||
    error.code === 'email_exists' ||
    /already registered/i.test(error.message)
  )
    return EMAIL_HAS_ACCOUNT;
  if (error.status === 500) return SIGN_UP_FAILED;
  return humanizeAuth(error, SIGN_UP_FAILED);
}

/**
 * Sending a phone code, in words. GoTrue's codes, never its text, as in
 * humanizeAuth. An unserved country fails as sms_send_failed and is told
 * to use another way: SMS pumping is stopped by Twilio's Fraud Guard and
 * geo permissions on the server, where it can be, not by a client list.
 */
function humanizePhone(error: AuthError): string {
  if (isAuthRetryableFetchError(error) && !error.status) return OFFLINE;
  switch (error.code) {
    case 'validation_failed':
      return PHONE_INVALID;
    case 'sms_send_failed':
      return 'Couldn’t text that number. Check it, or use another way to sign in.';
    case 'phone_provider_disabled':
      return 'Phone sign-in isn’t switched on for Sipply yet.';
    case 'over_sms_send_rate_limit':
      return 'Too many codes sent just now. Wait a few minutes and try again.';
    case 'over_request_rate_limit':
      return TOO_MANY;
    case 'signup_disabled':
    case 'otp_disabled':
      return 'New accounts are paused right now. Try again later.';
  }
  if (error.status === 429) return TOO_MANY;
  return SEND_FAILED;
}

/**
 * Checking a phone code, in words. otp_expired is GoTrue's answer for a
 * wrong code and an expired one alike, so the copy names both. The
 * message check is for GoTrue versions that predate codes.
 */
function humanizeCode(error: AuthError): string {
  if (isAuthRetryableFetchError(error) && !error.status) return OFFLINE;
  if (error.code === 'otp_expired') return CODE_WRONG;
  if (error.code === 'over_request_rate_limit' || error.status === 429) return TOO_MANY;
  if (!error.code && /expired|invalid/i.test(error.message)) return CODE_WRONG;
  return CODE_FAILED;
}

/** Continue with Google's failures, from the API call or the return link (lib/oauth). */
function describeGoogle(code?: string): string {
  switch (code) {
    case 'provider_disabled':
      return 'Google sign-in isn’t switched on for Sipply yet.';
    case 'email_exists':
    case 'user_already_exists':
      return 'That email already has a Sipply account. Sign in with your email and password.';
    case 'over_request_rate_limit':
      return TOO_MANY;
    default:
      return GOOGLE_FAILED;
  }
}

/* ==================================================================== */
/* Helpers                                                              */
/* ==================================================================== */

/**
 * A new account's profile colour, sent as user_metadata.accent, which
 * handle_new_user copies onto the profile row. Every way of signing up
 * that can send metadata sends one (email, a phone number); Apple,
 * Google and Facebook cannot, and get the trigger's default.
 */
function randomAccent(): string {
  return SIGNUP_ACCENTS[Math.floor(Math.random() * SIGNUP_ACCENTS.length)]!;
}

/**
 * Writes the discovery hashes given at signup, once there is a profile row
 * to hang them off. No-ops when nothing is parked, which is every launch
 * after the first.
 *
 * Nothing parks claims any more: only the old email form's sign-up did,
 * and it went with that form. This stays for claims builds 8 to 11 parked
 * on phones that are still waiting on an email confirmation.
 *
 * The email check guards a signup that was started but never confirmed:
 * without it, claims parked on this device would attach themselves to
 * whichever account signs in next, which on a shared phone is someone
 * else's. A mismatch discards them rather than holding them — the same
 * two fields exist on the Accounts screen, and silently carrying a stale
 * claim around is worse than losing it.
 *
 * The two hashes are written independently on purpose. They go to separate
 * columns through separate RPCs, and a user who gave a phone number but a
 * malformed handle should still end up findable by phone.
 *
 * Failures are swallowed. This is optional discoverability running behind
 * a profile fetch; an error here must not surface as "could not load your
 * profile", and the Accounts screen is the retry.
 */
async function drainPendingClaims(uid: string, email: string | null): Promise<void> {
  try {
    const pending = await getPendingClaims();
    if (!pending) return;

    if (!email || email.trim().toLowerCase() !== pending.email) {
      await clearPendingClaims();
      return;
    }

    if (pending.phone) {
      const hash = await hashPhone(pending.phone);
      if (hash) {
        await setPhoneHash(uid, hash);
        // Remembered locally too: the server hash cannot be read back, so
        // without this the Accounts screen would ask for it again.
        await rememberPhone(pending.phone);
      }
    }

    if (pending.handle) {
      const hash = await hashHandle(pending.handle);
      if (hash) {
        await setInstagramHash(uid, hash);
        await rememberHandle(pending.handle);
      }
    }

    await clearPendingClaims();
  } catch {
    /* Left parked; the next profile load retries it. */
  }
}

/**
 * What an account leaves on the device, forgotten on sign-out and after
 * deletion: the discovery claims and imported list (lib/discovery says why
 * those go on every sign-out), the Facebook friends list and token, a
 * half-finished reset, and the record of a reset this phone asked for.
 * Each part swallows its own failure; a full disk must not stop anyone
 * signing out.
 */
async function forgetAccountOnDevice(): Promise<void> {
  await Promise.all([
    clearDiscoveryCache().catch(() => undefined),
    clearFacebookCache(),
    clearRecovering(),
    forgetResetRequest(),
  ]);
}

/*
 * Who to tell once an account has been deleted, for what is kept of it
 * past a sign-out (auth/rememberedAccount's Welcome back record). A
 * registry rather than an import: those modules import this one, and
 * importing them back would run their module-level useAuth.subscribe
 * before useAuth exists. A plain sign-out never calls these.
 */
const deletedListeners = new Set<(uid: string) => void>();

/** Runs `listener` with the account's id after deleteAccount succeeds. Returns the unsubscribe. */
export function onAccountDeleted(listener: (uid: string) => void): () => void {
  deletedListeners.add(listener);
  return () => {
    deletedListeners.delete(listener);
  };
}

/**
 * Turns what came back from the browser leg (lib/oauth) into a session.
 * Shared by Google and Facebook; only the provider token differs, and
 * `onProviderToken` decides what happens to it. Facebook keeps it in
 * memory for the friends check (keepFacebookToken, below). Google passes
 * nothing, so Google's token is dropped here, unread.
 *
 * `expected` is the signed-in account when a provider is being connected
 * to it (only Facebook, today). The tokens are refused, before
 * setSession, unless they are for that same account: an identity that
 * already belongs to someone else would otherwise swap the person into
 * that other account mid-session. The same check, and the same reason,
 * as a reset link (lib/recovery).
 *
 * setSession is handed the two Supabase tokens and nothing else, which is
 * what keeps any provider token out of the session supabase-js persists.
 */
async function finishOAuth(
  outcome: OAuthOutcome,
  expected: string | null,
  failed: string,
  onProviderToken?: (uid: string, token: string) => void,
): Promise<string | null> {
  if (outcome.kind === 'cancelled') return null;
  if (outcome.kind === 'error') return outcome.message;

  let session: Session;
  let providerToken: string | null = outcome.providerToken;

  if (outcome.kind === 'code') {
    /*
     * PKCE only, which this client is not on; read in case GoTrue ever
     * answers that way. Never while connecting: the exchange signs in
     * before the account can be checked.
     */
    if (expected) return failed;
    const exchanged = await supabase.auth.exchangeCodeForSession(outcome.code);
    if (exchanged.error || !exchanged.data.session) {
      return exchanged.error ? humanizeAuth(exchanged.error, failed) : failed;
    }
    providerToken = exchanged.data.session.provider_token ?? null;
    /*
     * The exchange saved a session with the provider token inside it.
     * Setting it again from its two Supabase tokens saves it without.
     */
    const resaved = await supabase.auth.setSession({
      access_token: exchanged.data.session.access_token,
      refresh_token: exchanged.data.session.refresh_token,
    });
    session = resaved.data.session ?? exchanged.data.session;
  } else {
    const account = readTokenAccount(outcome.accessToken);
    if (!account) return failed;
    if (expected && account.id !== expected) return OTHER_ACCOUNT;
    const { data, error } = await supabase.auth.setSession({
      access_token: outcome.accessToken,
      refresh_token: outcome.refreshToken,
    });
    if (error || !data.session) return error ? humanizeAuth(error, failed) : failed;
    session = data.session;
  }

  // As after a password sign-in: a stale reset flag is void now.
  await clearRecovering();

  if (providerToken && onProviderToken) onProviderToken(session.user.id, providerToken);
  return null;
}

/** Facebook's onProviderToken: held in memory, then the friends check starts with it. */
function keepFacebookToken(uid: string, token: string): void {
  holdFacebookToken(uid, token);
  void syncFacebookFriends(uid);
}

/** The buckets that keep files under the account's id: <bucket>/<uid>/<file>. */
const SWEPT_BUCKETS = ['pours', 'reels'] as const;

/*
 * A bucket the project does not have yet holds nothing of anyone's, so it
 * counts as empty: a project without migration 019 has no `reels` bucket,
 * and deleting an account must not depend on a feature that is switched
 * off. Depending on the Storage version, listing it answers an empty list
 * (handled by the loop as it is) or "Bucket not found" (this).
 */
function isMissingBucket(error: unknown): boolean {
  const e = error as { message?: unknown; statusCode?: unknown } | null;
  return (
    (typeof e?.message === 'string' && /bucket not found/i.test(e.message)) ||
    e?.statusCode === 'NoSuchBucket'
  );
}

/**
 * Empties the account's folder in one bucket. `pours` holds pour photos,
 * avatars and custom-drink photos at pours/<uid>/<file> (migrations 007
 * and 010); `reels` holds each reel's video and poster at reels/<uid>/<file>
 * (migration 019).
 *
 * The client has to do this, not delete_own_account. SQL cannot delete
 * stored bytes — Supabase guards storage.objects against it — so since
 * migration 011 the function refuses with 'photos_remaining' while the
 * folder has anything in it, rather than deleting the account and
 * orphaning the files for good. Since 019 that covers both buckets,
 * under the same error string.
 *
 * Always lists at offset 0, because paging forward while deleting skips
 * files. A remove that fails, or that reports removing nothing, throws:
 * the listing would come back the same and this would never finish. The
 * error says photos for both buckets, as delete_own_account's does since
 * 019, so deleteAccount's one mapping catches either.
 */
async function emptyStorageFolder(
  bucketName: (typeof SWEPT_BUCKETS)[number],
  uid: string,
): Promise<void> {
  const bucket = supabase.storage.from(bucketName);
  for (;;) {
    const { data: listed, error: listError } = await bucket.list(uid, { limit: 1000 });
    if (listError) {
      if (isMissingBucket(listError)) return;
      throw listError;
    }
    if (!listed || listed.length === 0) return;

    const { data: removed, error: removeError } = await bucket.remove(
      listed.map((object) => `${uid}/${object.name}`),
    );
    if (removeError) throw removeError;
    if (!removed || removed.length === 0) throw new Error('photos_not_removed');
  }
}

/** Every bucket's folder for the account, one after the other. */
async function emptyAccountStorage(uid: string): Promise<void> {
  for (const bucketName of SWEPT_BUCKETS) await emptyStorageFolder(bucketName, uid);
}

/*
 * The account a recovery link is being exchanged for, while setSession is
 * in flight, so the auth listener can raise the reset step in the same
 * update that delivers the session.
 *
 * setSession announces the new session to that listener before it
 * returns. Setting `recovering` afterwards, in beginRecovery, left a gap
 * in which the session was in the store and the flag was not: the app,
 * signed in off a mailed link, rendered unguarded until the flag caught
 * up. That is the frame init takes care never to render on a relaunch.
 */
let recoveryInFlight: string | null = null;

/** Resolves once the persisted session has been read back. */
function whenReady(): Promise<void> {
  if (useAuth.getState().ready) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAuth.subscribe((s) => {
      if (!s.ready) return;
      unsubscribe();
      resolve();
    });
  });
}

/* ==================================================================== */
/* Store                                                                */
/* ==================================================================== */

export const useAuth = create<AuthState>()((set, get) => ({
  session: null,
  profile: null,
  ready: false,
  profileLoading: false,
  profileError: null,
  busy: false,
  error: null,
  notice: null,
  recovering: false,

  /**
   * Restores the persisted session, then keeps the store in sync with
   * token refreshes and sign-outs. Returns an unsubscribe function.
   */
  init: () => {
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const session = data.session;
        /*
         * The recovery flag is read BEFORE `ready` flips. Setting the session
         * first and the flag a tick later rendered the app, unguarded, for
         * the frames in between — the one screen a half-finished reset must
         * never show.
         */
        const resuming = session != null && (await recoveringUserId()) === session.user.id;
        set({ session, ready: true, recovering: resuming });
        if (session) void get().refreshProfile();
      })
      /*
       * `ready` gates every AuthGate in the app, so a rejection here used to
       * hang Home, Stats and Profile on a spinner forever. Failing open to the
       * sign-in form is the honest fallback: if the persisted session cannot
       * be read, we genuinely do not know that anyone is signed in.
       */
      .catch(() => set({ ready: true }));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      /*
       * The restored session is getSession's to deliver, above, because it
       * restores the recovery flag with it, and only getSession marks the
       * store ready. INITIAL_SESSION carries the same session and can arrive
       * first, and so can a TOKEN_REFRESHED from a token that expired while
       * the app was closed; letting either set `ready` rendered the app
       * without the flag for the frames in between.
       */
      if (event === 'INITIAL_SESSION') return;

      /*
       * A different account — or none — means the social store holds
       * someone else's follows, feed and people list. Settings resets it on
       * its own sign-out button, but a cancelled reset, a revoked refresh
       * token, account deletion and a reset link for another account all
       * change the account without going through that button. Token
       * refreshes keep the same id and do not reset anything.
       */
      if ((session?.user.id ?? null) !== (get().session?.user.id ?? null)) {
        useSocial.getState().reset();
      }

      // See recoveryInFlight: a reset link's session arrives with its guard.
      if (session && session.user.id === recoveryInFlight) set({ session, recovering: true });
      else set({ session });
      if (session) {
        void get().refreshProfile();
      } else {
        set({ profile: null, recovering: false });
        void clearRecovering();
      }
    });

    return () => sub.subscription.unsubscribe();
  },

  signUpEmail: async (email, password) => {
    set({ busy: true, error: null, notice: null });

    /*
     * Everything after `busy: true` sits in one try, so no rejection can
     * leave the screen stuck on "Creating account…": the sign-in flow
     * awaits this, and a throw would otherwise leave `busy` set.
     */
    try {
      // Only the colour: handle_new_user makes the rest (see "New accounts").
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { accent: randomAccent() } },
      });

      if (error) {
        set({ busy: false, error: humanizeSignUp(error) });
        return;
      }

      /*
       * With email confirmation on, GoTrue answers a sign-up for an address
       * that already has an account the way it answers a new one, so that
       * the endpoint cannot be used to find accounts: no error, no session,
       * and a user with no identities. The lookup already said this
       * address was new, so this is the race where it was taken in
       * between; it is told as the taken address it is, rather than as an
       * account that was made.
       */
      if (!data.session && data.user?.identities?.length === 0) {
        set({ busy: false, error: EMAIL_HAS_ACCOUNT });
        return;
      }

      /*
       * A successful signUp returns no session when the project requires
       * email confirmation. Without saying so the screen just sits there
       * looking broken, because there's nothing for the gate to switch to.
       */
      if (!data.session) {
        set({
          busy: false,
          notice:
            'Account created. Check your email for a confirmation link, then come back and sign in.',
        });
        return;
      }

      set({ busy: false });
    } catch {
      set({ busy: false, error: SIGN_UP_FAILED });
    }
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null, notice: null });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      /*
       * A password sign-in proves the user knows a password, so any reset
       * flag left from an abandoned recovery on this phone is void. Keeping
       * it would reopen "choose a new password" on the next launch.
       */
      if (!error) await clearRecovering();
      set({
        busy: false,
        error: error ? humanizeAuth(error, 'Could not sign you in. Try again.') : null,
      });
    } catch {
      set({ busy: false, error: OFFLINE });
    }
  },

  /*
   * The answer the email step moves on. A lookup that is refused (the
   * meter, rate_limited), missing (016 not applied) or anything else the
   * server says is not a failure the person can act on, so it becomes
   * 'unknown', whose password step offers both sign-in and sign-up. Only
   * no connection and an unreadable address stop them on the email step.
   * PostgREST reports a failed fetch as an error rather than a throw;
   * the catch is for anything stranger, and errs toward letting them on.
   */
  lookupEmail: async (email) => {
    try {
      const { data, error } = await supabase.rpc('sign_in_method', { e: email.trim() });
      if (!error && (data === 'new' || data === 'password' || data === 'other')) {
        return { status: data, error: null };
      }
      if (error && /network|fetch|timed? ?out/i.test(error.message ?? '')) {
        return { status: null, error: OFFLINE };
      }
      if (error && /invalid_email/.test(`${error.message} ${error.details ?? ''}`)) {
        return { status: null, error: EMAIL_INVALID };
      }
      return { status: 'unknown', error: null };
    } catch {
      return { status: 'unknown', error: null };
    }
  },

  /*
   * shouldCreateUser: one Continue for a new number and a known one alike,
   * which is the whole point of the phone row. The accent is the only
   * metadata sent; handle_new_user makes the rest, and the username step
   * follows. The number and the code are never logged or stored by the
   * app, not even under __DEV__: supabase-js persists only the session.
   */
  sendPhoneCode: async (e164) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: { channel: 'sms', shouldCreateUser: true, data: { accent: randomAccent() } },
      });
      return error ? humanizePhone(error) : null;
    } catch {
      return OFFLINE;
    }
  },

  verifyPhoneCode: async (e164, code) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
      if (error || !data.session) return error ? humanizeCode(error) : CODE_FAILED;
      // As after a password sign-in: a stale reset flag is void now.
      await clearRecovering();
      return null;
    } catch {
      return OFFLINE;
    }
  },

  /**
   * Apple's sheet, then GoTrue.
   *
   * The nonce is what stops a stolen identity token being replayed here:
   * Apple signs the SHA-256 of a random value into the token, and GoTrue
   * checks the raw value against it. So Apple is given the hash (hex, as
   * GoTrue compares it) and signInWithIdToken the raw value.
   *
   * Apple sends the person's name on the first authorisation only — see
   * providerNames — so it is taken now or never.
   */
  signInWithApple: async () => {
    set({ error: null, notice: null });
    try {
      const rawNonce = Crypto.randomUUID();
      const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      if (!credential.identityToken) return APPLE_FAILED;

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error || !data.user) {
        if (error?.code === 'provider_disabled') return 'Sign in with Apple is not switched on for Sipply yet.';
        return error ? humanizeAuth(error, APPLE_FAILED) : APPLE_FAILED;
      }

      /*
       * Taken before anything else is awaited. The sign-in has already
       * started the profile fetch, and the username step that fetch opens
       * reads its prefill from providerNames as it mounts.
       */
      const name = appleName(credential.fullName);
      if (name) void adoptProviderName(data.user.id, name);
      await clearRecovering();
      return null;
    } catch (e) {
      // Closing Apple's sheet. Nothing went wrong, so nothing is said.
      if ((e as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED') return null;
      return APPLE_FAILED;
    }
  },

  /*
   * The same browser leg as Facebook (lib/oauth), with Google's scopes and
   * its account chooser forced open (prompt=select_account), so a phone
   * signed in to two Google accounts is asked which one rather than
   * silently using the last. Supabase links a Google account whose
   * verified email matches an existing account into that account by
   * itself; nothing here decides that.
   */
  signInWithGoogle: async () => {
    set({ error: null, notice: null });
    try {
      const outcome = await openOAuth('google', 'sign-in', {
        scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' },
        describe: describeGoogle,
      });
      // No onProviderToken: Google's token is dropped.
      return await finishOAuth(outcome, null, GOOGLE_FAILED);
    } catch {
      return GOOGLE_FAILED;
    }
  },

  signInWithFacebook: async () => {
    set({ error: null, notice: null });
    const failed = 'Facebook did not sign you in. Try again, or use your email.';
    try {
      return await finishOAuth(await openFacebookAuth('sign-in'), null, failed, keepFacebookToken);
    } catch {
      return failed;
    }
  },

  /*
   * An account that already has Facebook goes through Facebook's sign-in
   * again rather than linkIdentity, which refuses an identity the account
   * already holds. That comes back as a session for whichever account owns
   * the Facebook identity chosen in the browser: this one, or finishOAuth
   * refuses it before setSession. One cost of that route: choosing a
   * Facebook account that is on nobody's Sipply account makes GoTrue create
   * a new, empty Sipply account for it, which is then refused here and left
   * unused. linkIdentity has no way to fetch a fresh Facebook token for an
   * identity already linked, so there is no quieter route to take.
   */
  connectFacebook: async () => {
    const user = get().session?.user;
    if (!user) return 'You are signed out.';
    const mode = hasFacebookIdentity(user) ? 'sign-in' : 'link';
    const failed = 'Could not connect Facebook. Try again.';
    try {
      return await finishOAuth(await openFacebookAuth(mode), user.id, failed, keepFacebookToken);
    } catch {
      return failed;
    }
  },

  signOut: async () => {
    set({ busy: true });
    try {
      // auth-js removes the local session even when the server call fails.
      await supabase.auth.signOut();
    } catch {
      /* Still signed out locally; see above. */
    }
    await forgetAccountOnDevice();
    set({
      busy: false,
      session: null,
      profile: null,
      profileError: null,
      recovering: false,
      error: null,
      notice: null,
    });
  },

  /**
   * Sends a password reset email.
   *
   * Reports success even when the address has no account, and that is not
   * laziness — Supabase answers identically either way on purpose. A form
   * that said "no account with that email" would turn the sign-in screen
   * into an oracle for which of your users exist, which for an app with
   * public profiles is a real disclosure. The copy therefore promises only
   * that a link was sent *if* there is an account.
   *
   * The link is one-time and expires (an hour by default). Note that some
   * corporate mail scanners follow links before the recipient does, which
   * burns the token and makes a perfectly good email look broken — the
   * expired-link path in lib/recovery exists to say so in plain words
   * rather than failing blankly.
   *
   * A successful request is recorded on the device. beginRecovery honours
   * a link only for the address this phone asked about; see lib/recovery.
   */
  requestPasswordReset: async (email) => {
    set({ busy: true, error: null, notice: null });

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: recoveryRedirectUrl(),
    });

    if (error) {
      /*
       * A request that never got an answer is shown as what it is. The
       * reassuring notice below is for answers from GoTrue; after a failed
       * fetch it told an offline user an email was coming that was never
       * sent. Saying so reveals nothing about accounts: a 5xx from a broken
       * mail sender only happens for addresses that exist, but the endpoint
       * is public, so hiding it here would protect nobody.
       */
      if (isAuthRetryableFetchError(error)) {
        set({
          busy: false,
          error: error.status
            ? 'Could not send the email just now. Try again in a minute.'
            : OFFLINE,
        });
        return;
      }

      /*
       * Rate limiting is the other failure worth showing as itself.
       * Everything else — including "user not found", which GoTrue does not
       * report anyway — collapses into the same reassuring notice, so the
       * screen cannot be used to probe for accounts.
       */
      const rateLimited =
        error.status === 429 ||
        error.code === 'over_email_send_rate_limit' ||
        error.code === 'over_request_rate_limit' ||
        /rate limit/i.test(error.message);
      set({
        busy: false,
        error: rateLimited ? 'Too many reset emails just now. Wait a minute and try again.' : null,
        notice: rateLimited ? null : 'If that email has an account, a reset link is on its way.',
      });
      return;
    }

    await rememberResetRequest(email);
    set({
      busy: false,
      notice: 'If that email has an account, a reset link is on its way. It expires in an hour.',
    });
  },

  /**
   * Turns the tokens out of a recovery link into a session.
   *
   * This genuinely signs the user in — a recovery link is an authentication
   * factor, which is why the overlay it opens cannot simply be dismissed.
   * Backing out calls cancelRecovery, which signs back out again.
   *
   * Refused before setSession, which would otherwise replace whatever
   * session is here: a link for another account while someone is signed
   * in, and — signed out — a link for any address this phone did not ask
   * to reset in the last hour. lib/recovery explains the attack that
   * closes.
   */
  beginRecovery: async (accessToken, refreshToken) => {
    // On a cold start the link can arrive before the session is read back.
    await whenReady();

    const account = readTokenAccount(accessToken);
    if (!account) {
      get().failRecovery('That reset link is not valid. Request a new one.');
      return;
    }

    const current = get().session?.user.id;
    if (current && current !== account.id) {
      get().failRecovery(
        'That reset link is for a different account from the one signed in here. Sign out first, then open it again.',
      );
      return;
    }
    if (!current) {
      const request = await checkResetRequest(account.email);
      if (request !== 'ok') {
        get().failRecovery(
          request === 'expired'
            ? 'That reset link has expired. Request a new one.'
            : 'That reset link was not requested on this phone. Request a new one here.',
        );
        return;
      }
    }

    set({ busy: true, error: null, notice: null });

    let session: Session | null = null;
    let offline = false;
    recoveryInFlight = account.id;
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      session = error ? null : data.session;
      offline = !!error && isAuthRetryableFetchError(error) && !error.status;
    } catch {
      /* Reported below, as a link that could not be used. */
    } finally {
      recoveryInFlight = null;
    }

    if (!session) {
      set({ busy: false });
      get().failRecovery(
        offline
          ? 'Cannot reach Sipply. Check your connection, then open the link again.'
          : 'That reset link has expired or already been used. Request a new one.',
      );
      return;
    }

    /*
     * The listener has normally raised the flag already, with the session
     * (recoveryInFlight). Set again here for the case it was not, and only
     * then persisted: the step goes up first, and the write that brings it
     * back after a relaunch follows.
     */
    set({ busy: false, session, recovering: true });
    await markRecovering(session.user.id);
    void get().refreshProfile();
  },

  completePasswordReset: async (password) => {
    set({ busy: true, error: null, notice: null });

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      set({ busy: false, error: humanizeAuth(error, 'Could not set that password. Try again.') });
      return false;
    }

    await Promise.all([clearRecovering(), forgetResetRequest()]);

    /*
     * Stays signed in. updateUser leaves the session valid, and signing out
     * here to make the user type the password they just chose would be
     * ceremony, not security.
     */
    set({ busy: false, recovering: false, notice: null });
    return true;
  },

  /*
   * The flag comes down with the session, inside signOut, not before it.
   * Lowering it first put the app on screen, still signed in off the link,
   * for as long as the sign-out request took.
   */
  cancelRecovery: async () => {
    await get().signOut();
  },

  /*
   * Never lowers `recovering`. Nothing before a successful setSession raises
   * it, so the only reset this could close is one already open — and a dead
   * link must not close that. Tapping the same email twice is the common
   * way here: the second tap brings GoTrue's "expired" error, and clearing
   * the flag took the overlay down and left the user signed in off the
   * first tap without a password they know. While a reset is open the open
   * step is the answer, so nothing is said either.
   *
   * Leaves `busy` alone too: beginRecovery releases its own, and a link
   * arriving mid-sign-in must not re-enable a button whose request is out.
   */
  failRecovery: (message) => {
    void whenReady().then(() => {
      if (get().recovering) return;
      if (get().session) showNotice('Could not use that reset link', message);
      else set({ error: message, notice: null });
    });
  },

  /**
   * Deletes the signed-in account. Returns true on success.
   *
   * Apple comes before anything is removed. An account with an Apple ID is
   * deleted only once its Apple tokens are revoked (App Review 5.1.1(v);
   * lib/appleRevoke), and doing it first means closing Apple's sheet stops
   * the deletion before a reel or photo is gone. If a later step fails
   * after the revoke, the account still works (Supabase never used Apple's
   * tokens) and the retry asks Apple again.
   *
   * Then three steps, in this order. The account's reels come off the feed
   * first, so nobody is left watching one whose file is about to vanish.
   * Then the client empties the account's folders in both buckets through
   * the Storage API (emptyAccountStorage above), and the server does the
   * rest in public.delete_own_account(), which takes no arguments on
   * purpose — it reads auth.uid() itself, so this call cannot be aimed at
   * anyone else's account. See migrations 005, 011 and 019.
   *
   * The function refuses with 'photos_remaining' if a file arrived between
   * the sweep and the call — a photo or reel uploaded from another phone —
   * so that case gets one more sweep before giving up.
   *
   * Signs out afterwards regardless: once the auth row is gone the local
   * session is a token for a user that no longer exists, and leaving it
   * in place would leave the app in a signed-in state with every query
   * failing.
   */
  deleteAccount: async () => {
    const user = get().session?.user;
    if (!user) return false;
    const uid = user.id;

    set({ busy: true, error: null });

    // Never throws; its message is the alert body, like the ones below.
    const apple = await revokeAppleAccess(user);
    if (!apple.ok) {
      set({ busy: false, error: apple.message });
      return false;
    }

    try {
      /*
       * Best effort, and its answer is ignored: the rows cascade from the
       * profile anyway when delete_own_account runs, and a project without
       * migration 019 has no such table. This only makes them disappear
       * from other people's feeds before the files under them do.
       */
      try {
        await supabase.from('reels').delete().eq('author_id', uid);
      } catch {
        /* See above. */
      }

      await emptyAccountStorage(uid);
      let { error } = await supabase.rpc('delete_own_account');
      if (error?.message.includes('photos_remaining')) {
        await emptyAccountStorage(uid);
        ({ error } = await supabase.rpc('delete_own_account'));
      }
      if (error) throw error;
    } catch (e) {
      const message = (e as { message?: unknown } | null)?.message;
      /*
       * Written as the body of Settings' "Could not delete your account"
       * alert, which is the only place this is read, so it does not repeat
       * the title.
       */
      set({
        busy: false,
        error:
          typeof message === 'string' && /photos_(remaining|not_removed)/.test(message)
            ? 'Some of your photos could not be removed, so your account is still here. Try again.'
            : 'Check your connection and try again.',
      });
      return false;
    }

    /*
     * The account is gone. Told before signOut, whose auth event clears the
     * session: told after, the first signed-out frame could still offer
     * Welcome back to the deleted account.
     */
    deletedListeners.forEach((listener) => {
      try {
        listener(uid);
      } catch {
        /* One listener's failure must not stop the sign-out below. */
      }
    });

    try {
      await supabase.auth.signOut();
    } catch {
      /* The auth user is gone; the local session is removed either way. */
    }
    await forgetAccountOnDevice();
    set({ busy: false, session: null, profile: null, profileError: null, recovering: false });
    /*
     * Every reel this account watched (anyone's) is cached on disk by the
     * video player. The account is gone, so what it watched goes too. Not
     * awaited, and a refusal is ignored: expo-video declines while any
     * player exists, and the account is already deleted either way.
     * Wrapped so that a throw before the promise exists is caught as well.
     */
    void Promise.resolve()
      .then(() => clearVideoCacheAsync())
      .catch(() => undefined);
    return true;
  },

  /**
   * Fetches the signed-in user's profile row.
   *
   * Right after signup the row may not exist yet — it is written by the
   * on_auth_user_created trigger, which can land after the session does — so a
   * miss is retried on a short backoff rather than waiting for the next auth
   * event, which might be hours away. Anything still failing after that is
   * surfaced on the screen with a retry; swallowing it is what left the
   * profile permanently headless with no spinner and no explanation.
   */
  refreshProfile: async () => {
    const uid = get().session?.user.id;
    if (!uid) return;

    set({ profileLoading: true, profileError: null });

    /*
     * Checked after every await, not just before the fetch. A response that
     * lands after the account changed used to write the previous account's
     * row under the new session. When another account has taken over, its
     * own refresh owns the loading flag, so a stale one leaves it alone.
     */
    const stillCurrent = () => {
      if (get().session?.user.id === uid) return true;
      if (!get().session) set({ profileLoading: false });
      return false;
    };

    const DELAYS_MS = [0, 400, 1200];
    for (let attempt = 0; attempt < DELAYS_MS.length; attempt++) {
      if (DELAYS_MS[attempt]) await new Promise((r) => setTimeout(r, DELAYS_MS[attempt]));

      // The session can end mid-retry; a signed-out user has no profile to load.
      if (!stillCurrent()) return;

      /*
       * Explicit columns rather than '*'. Not required any more — migration
       * 008 moved the discovery hashes out of profiles — but this call ran
       * `select('*')` on every launch, and that is precisely how we learned
       * 002's column revoke never bit: had it worked, this would have been
       * failing for every user since 002 shipped.
       */
      // Cast for the same reason as the list queries: profileCols() is
      // chosen at runtime, so the client cannot infer the row from it.
      let { data, error } = (await supabase
        .from('profiles')
        .select(profileCols())
        .eq('id', uid)
        .single()) as { data: ProfileRow | null; error: { code?: string; message?: string } | null };

      /*
       * The avatar column is optional — the client can be ahead of the
       * migration that adds it. PostgREST fails the whole select on an
       * unknown column, so without this a missing `avatar_path` costs the
       * entire profile: no name, no bio, no counts, just an error where a
       * person should be.
       *
       * One retry, and the flag makes it once per session rather than
       * once per fetch.
       */
      if (error && isMissingAvatarColumn(error)) {
        disableAvatarColumn();
        ({ data, error } = (await supabase
          .from('profiles')
          .select(profileCols())
          .eq('id', uid)
          .single()) as { data: ProfileRow | null; error: { code?: string; message?: string } | null });
      }

      if (!stillCurrent()) return;

      if (data) {
        set({ profile: data, profileLoading: false, profileError: null });
        // Safe to write only now: the row the update targets is confirmed
        // to exist, which is the whole reason this is not done at sign-up.
        void drainPendingClaims(uid, get().session?.user.email ?? null);
        return;
      }

      /*
       * Last attempt: report it instead of leaving the screen blank. Fixed
       * copy rather than the server's text, which is PostgREST's ("JSON
       * object requested, multiple (or no) rows returned") and means nothing
       * to anyone reading a profile. The screen puts a Try again button
       * under it and can be pulled to refresh, so the copy names neither,
       * and it does not guess at a cause: after three attempts a missing
       * row is as likely as a dropped connection.
       */
      if (attempt === DELAYS_MS.length - 1) {
        set({ profileLoading: false, profileError: 'Could not load your profile.' });
      }
    }
  },

  updateProfile: async ({ displayName, username, bio, accent, avatarPath }) => {
    const uid = get().session?.user.id;
    if (!uid) return 'You are signed out.';

    const name = displayName.trim();
    const handle = username.trim().toLowerCase();
    const about = bio.trim();

    const problem = profileFieldProblem(name, handle);
    if (problem) return problem;
    /*
     * Changing TO the placeholder shape is refused, as the forms refuse it:
     * the account would be sent back to the username step on every launch.
     * Keeping it is not, so an account still on it can save a bio.
     */
    if (isPlaceholderUsername(handle) && handle !== get().profile?.username)
      return PLACEHOLDER_USERNAME_RULE;
    if (about.length > BIO_MAX) return 'Your about is longer than 300 characters.';
    const refused = refusedColumn(name, handle, about);
    if (refused) return filterRefusal(refused);

    set({ busy: true });
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name,
        username: handle,
        // Empty clears it, rather than storing a blank string the UI would
        // then render as an empty line under your name.
        bio: about.length > 0 ? about : null,
        accent,
        /*
         * Omitted entirely when undefined, so saving a bio does not wipe a
         * picture. `null` is a real value here and means "remove it".
         */
        ...(avatarPath !== undefined ? { avatar_path: avatarPath } : {}),
      })
      .eq('id', uid);
    set({ busy: false });

    if (error) {
      /*
       * The content filter's refusal is recognised by its marker, the
       * shared way every writer does it (lib/moderation), and passed on
       * with the column the trigger names in DETAIL rather than turned into
       * copy here; see updateProfile in AuthState.
       *
       * 23505 is the unique violation on username. supabase-js surfaces
       * the Postgres code, so this does not have to match on message text
       * — which is the thing that changes between versions.
       */
      if (isObjectionableError(error)) return filterRefusal(error.details);
      if (error.code === '23505') return USERNAME_TAKEN;
      return 'Could not save your profile. Check your connection and try again.';
    }

    await get().refreshProfile();
    return null;
  },

  clearError: () => set({ error: null, notice: null }),
}));
