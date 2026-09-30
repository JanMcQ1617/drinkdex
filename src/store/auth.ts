import { isAuthRetryableFetchError, type AuthError, type Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { SIGNUP_ACCENTS } from '@/constants/theme';
import { hashPhone } from '@/lib/contacts';
import {
  clearDiscoveryCache,
  clearPendingClaims,
  getPendingClaims,
  rememberHandle,
  rememberPhone,
  setPendingClaims,
} from '@/lib/discovery';
import { hashHandle } from '@/lib/instagram';
import { containsObjectionable, isObjectionableError, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
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
   * `phone` and `instagram` are both optional and neither blocks the
   * account — they only decide whether other people can find this one.
   *
   * Phone is the one that carries the feature. Contact matching needs
   * only that two people are already in each other's address books;
   * asking here is what removes the separate "make me findable" step that
   * almost nobody would have taken. Instagram needs both parties to have
   * typed a handle, so it stays a secondary path.
   *
   * Both are stored as hashes, and not until the profile row exists — see
   * setPendingClaims in src/lib/discovery.ts for why they take a detour.
   */
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    instagram?: string,
    phone?: string,
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Signs out and forgets what this account left on the device: discovery
   * claims, a half-finished reset. The Dex collection stays; it is the
   * phone's, not the account's.
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
   * Irreversible. Empties the account's photo folder, then removes the auth
   * user and every row that cascades from it.
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
/* and next to the field, and — at signup — because the server cannot    */
/* answer readably at all (see humanizeSignUp). One copy here, used by   */
/* the sign-up form and by updateProfile, so the two cannot drift.       */
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

/**
 * The content filter's verdict on a username. `glued` because the server
 * checks usernames that way — 'the_<term>' has no spaces to find a word
 * between — and a client check that let those through would leave them for
 * the server to refuse, which at signup it can only do as an opaque 500.
 * Exported so the sign-up form asks the same question this file does.
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
/* Error copy                                                           */
/* ==================================================================== */

const OFFLINE = 'Cannot reach Sipply. Check your connection and try again.';
const TOO_MANY = 'Too many attempts just now. Wait a minute and try again.';

/**
 * GoTrue errors, in words a person can act on.
 *
 * Keyed on `error.code`, which auth-js sets from GoTrue's stable error
 * codes, never on the message. The old version matched substrings, and
 * "any message containing 'email'" caught "Email not confirmed" — the
 * state signUp's own notice sends people into — and told them their
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
      return 'That email and password do not match.';
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
      return 'That email already has an account. Try signing in.';
  }
  if (error.status === 429) return TOO_MANY;
  if (/invalid login credentials/i.test(error.message)) return 'That email and password do not match.';
  if (/email not confirmed/i.test(error.message))
    return 'Confirm your email first. The link is in your inbox.';
  return fallback;
}

/**
 * Sign-up errors need their own translation because a rejected profile
 * arrives as an opaque 500 rather than anything readable.
 *
 * The profile row is written by the on_auth_user_created trigger, and
 * GoTrue reports any failure inside that trigger as an unexpected server
 * error. Four things can fail there: the unique index on username, the
 * username-shape and display-name-length CHECKs (003), and the content
 * filter (011), which runs on that insert like any other.
 *
 * Match on `status`, never on `message`. The wire body is a perfectly
 * clear Postgres error, but supabase-js never parses it: it raises
 * AuthRetryableFetchError, whose message is "{}" under Node and a
 * stringified Response on React Native. Reading the message is what put a
 * raw JSON blob on the signup screen.
 *
 * So signUp rules out three of the four before sending anything: the two
 * CHECKs and the client's copy of the word list locally, then the server's
 * own list through is_objectionable, which catches terms added from the
 * dashboard since this build shipped. That pre-check is what lets a 500
 * mean "taken" — the one failure nobody can ask about ahead of time,
 * because another signup can claim the name in between. `screened` says
 * whether it answered. When it did not (an older server, a dropped
 * request) the copy allows for "not allowed" rather than insisting the
 * name is spoken for. An unreachable server fails as a fetch error and a
 * busy one answers 502/503, so neither lands in this branch.
 */
function humanizeSignUp(error: AuthError, screened: boolean): string {
  // Checked first: a duplicate email is a clean, readable 4xx.
  if (
    error.code === 'user_already_exists' ||
    error.code === 'email_exists' ||
    /already registered/i.test(error.message)
  )
    return 'That email already has an account. Try signing in.';

  if (isObjectionableError(error)) return OBJECTIONABLE_MESSAGE;

  if (error.status === 500)
    return screened
      ? 'That username is taken. Try another.'
      : 'That username is taken or not allowed. Try another.';

  return humanizeAuth(error, 'Could not create your account. Try again.');
}

/* ==================================================================== */
/* Helpers                                                              */
/* ==================================================================== */

/**
 * Writes the discovery hashes given at signup, once there is a profile row
 * to hang them off. No-ops when nothing is parked, which is every launch
 * after the first.
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
 * those go on every sign-out), a half-finished reset, and the record of a
 * reset this phone asked for. Each part swallows its own failure; a full
 * disk must not stop anyone signing out.
 */
async function forgetAccountOnDevice(): Promise<void> {
  await Promise.all([
    clearDiscoveryCache().catch(() => undefined),
    clearRecovering(),
    forgetResetRequest(),
  ]);
}

/**
 * Empties the account's folder in the `pours` bucket: pour photos and
 * avatars both live at pours/<uid>/<file> (migrations 007 and 010).
 *
 * The client has to do this, not delete_own_account. SQL cannot delete
 * stored bytes — Supabase guards storage.objects against it — so since
 * migration 011 the function refuses with 'photos_remaining' while the
 * folder has anything in it, rather than deleting the account and
 * orphaning the files for good.
 *
 * Always lists at offset 0, because paging forward while deleting skips
 * files. A remove that fails, or that reports removing nothing, throws:
 * the listing would come back the same and this would never finish.
 */
async function emptyPhotoFolder(uid: string): Promise<void> {
  const bucket = supabase.storage.from('pours');
  for (;;) {
    const { data: listed, error: listError } = await bucket.list(uid, { limit: 1000 });
    if (listError) throw listError;
    if (!listed || listed.length === 0) return;

    const { data: removed, error: removeError } = await bucket.remove(
      listed.map((object) => `${uid}/${object.name}`),
    );
    if (removeError) throw removeError;
    if (!removed || removed.length === 0) throw new Error('photos_not_removed');
  }
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

  signUp: async (email, password, username, displayName, instagram, phone) => {
    const handle = username.trim().toLowerCase();
    const name = displayName.trim();

    // The form already blocks these; this is the backstop, and it keeps a
    // 500 from being the only thing the server can say.
    const problem =
      profileFieldProblem(name, handle) ?? (refusedColumn(name, handle) ? OBJECTIONABLE_MESSAGE : null);
    if (problem) {
      set({ error: problem, notice: null });
      return;
    }

    set({ busy: true, error: null, notice: null });
    const accent = SIGNUP_ACCENTS[Math.floor(Math.random() * SIGNUP_ACCENTS.length)]!;

    /*
     * Everything after `busy: true` sits in one try, so no rejection can
     * leave the form stuck on its busy label: AuthForm calls this with
     * `void`, and a throw used to go nowhere with `busy` still set.
     */
    try {
      /*
       * The server's word list, asked before the account is. The client's
       * copy above can be behind it, and a refusal from the trigger comes
       * back as the bare 500 humanizeSignUp describes. is_objectionable is
       * granted to anon, so it answers before there is a session.
       *
       * Asked before the discovery claims are parked, so a refusal here
       * leaves nothing on the device to clear. A check that does not answer
       * is not a verdict: signup goes ahead unscreened.
       */
      const [nameCheck, handleCheck] = await Promise.all([
        supabase.rpc('is_objectionable', { t: name }),
        supabase.rpc('is_objectionable', { t: handle, glued: true }),
      ]);
      if (nameCheck.data === true || handleCheck.data === true) {
        set({ busy: false, error: OBJECTIONABLE_MESSAGE });
        return;
      }
      const screened = nameCheck.data === false && handleCheck.data === false;

      /*
       * Parked before the request, not after: on a project that requires
       * email confirmation this call returns without a session, and the
       * handle would otherwise be gone by the time the user comes back to
       * sign in. Cleared again below if the signup itself fails.
       *
       * Best effort. A full or corrupt store must not turn two optional
       * fields into a reason the account cannot be made.
       */
      try {
        await setPendingClaims(email, { phone: phone?.trim(), handle: instagram?.trim() });
      } catch {
        /* Signs up without them; the Accounts screen can add them later. */
      }

      // The profile row is created by the on_auth_user_created trigger,
      // which reads these values out of user_metadata.
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: handle, display_name: name, accent },
        },
      });

      if (error) {
        // Nothing was created, so nothing should be waiting to attach itself
        // to the next account that signs in on this device.
        await clearPendingClaims().catch(() => undefined);
        set({ busy: false, error: humanizeSignUp(error, screened) });
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
      set({ busy: false, error: 'Could not create your account. Try again.' });
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
   * Two halves, in this order. The client empties the photo folder through
   * the Storage API (emptyPhotoFolder above), then the server does the rest
   * in public.delete_own_account(), which takes no arguments on purpose — it
   * reads auth.uid() itself, so this call cannot be aimed at anyone else's
   * account. See migrations 005 and 011.
   *
   * The function refuses with 'photos_remaining' if a file arrived between
   * the sweep and the call — a photo uploaded from another phone — so that
   * case gets one more sweep before giving up.
   *
   * Signs out afterwards regardless: once the auth row is gone the local
   * session is a token for a user that no longer exists, and leaving it
   * in place would leave the app in a signed-in state with every query
   * failing.
   */
  deleteAccount: async () => {
    const uid = get().session?.user.id;
    if (!uid) return false;

    set({ busy: true, error: null });

    try {
      await emptyPhotoFolder(uid);
      let { error } = await supabase.rpc('delete_own_account');
      if (error?.message.includes('photos_remaining')) {
        await emptyPhotoFolder(uid);
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

    try {
      await supabase.auth.signOut();
    } catch {
      /* The auth user is gone; the local session is removed either way. */
    }
    await forgetAccountOnDevice();
    set({ busy: false, session: null, profile: null, profileError: null, recovering: false });
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
        // to exist, which is the whole reason this is not done in signUp.
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
      if (error.code === '23505') return 'That username is taken. Pick another.';
      return 'Could not save your profile. Check your connection and try again.';
    }

    await get().refreshProfile();
    return null;
  },

  clearError: () => set({ error: null, notice: null }),
}));
