import type { AuthError, Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { SIGNUP_ACCENTS } from '@/constants/theme';
import { hashPhone } from '@/lib/contacts';
import {
  clearPendingClaims,
  getPendingClaims,
  rememberHandle,
  rememberPhone,
  setPendingClaims,
} from '@/lib/discovery';
import { hashHandle } from '@/lib/instagram';
import { recoveryRedirectUrl } from '@/lib/recovery';
import { PROFILE_COLS, setInstagramHash, setPhoneHash } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/database.types';


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
  signOut: () => Promise<void>;
  /**
   * Sends the reset email. Resolves the same way whether or not the address
   * has an account — see the implementation for why that is deliberate.
   */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Exchanges the tokens from a recovery link for a session. */
  beginRecovery: (accessToken: string, refreshToken: string) => Promise<void>;
  /** Sets the new password and ends recovery. Returns true on success. */
  completePasswordReset: (password: string) => Promise<boolean>;
  /** Abandons a recovery without setting a password, and signs back out. */
  cancelRecovery: () => Promise<void>;
  /** Surfaces a dead or malformed reset link on the sign-in form. */
  failRecovery: (message: string) => void;
  /** Irreversible. Removes the auth user, every row that cascades from it, and the photos storage does not cascade. */
  deleteAccount: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  /**
   * Saves edits to your own profile row. Returns an error string to show,
   * or null on success.
   *
   * A string rather than a throw: every failure here is something the user
   * has to read and act on — a taken username, a name that is too long —
   * and the caller is the only thing that knows where to put it.
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

/** Supabase error copy is developer-facing; translate the common ones. */
function humanize(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password do not match.';
  if (m.includes('already registered')) return 'That email already has an account. Try signing in.';
  if (m.includes('duplicate key') && m.includes('username'))
    return 'That username is taken. Pick another.';
  if (m.includes('password')) return 'Password must be at least 6 characters.';
  if (m.includes('email')) return 'That email address does not look right.';
  if (m.includes('network') || m.includes('fetch')) return 'Cannot reach Sipply. Check your connection.';
  return message;
}

/**
 * Sign-up errors need their own translation because a taken username
 * arrives as an opaque 500 rather than anything readable.
 *
 * The profile row is written by the on_auth_user_created trigger, and
 * `profiles.username` is `unique not null`. A taken name makes that
 * insert raise a unique violation *inside* the trigger, and GoTrue
 * reports any trigger failure as an unexpected server error.
 *
 * Match on `status`, never on `message`. The wire body is a perfectly
 * clear Postgres 23505 on `profiles_username_key`, but supabase-js
 * never parses it: it raises AuthRetryableFetchError, whose message is
 * "{}" under Node and a stringified Response on React Native. Reading
 * the message is what put a raw JSON blob on the signup screen.
 *
 * That trigger insert has exactly one unique constraint it can violate,
 * so a 500 here means the name is spoken for. An unreachable server
 * fails as a fetch error and a busy one answers 502/503, so neither
 * lands in this branch.
 */
function humanizeSignUp(error: AuthError): string {
  // Checked first: a duplicate email is a clean, readable 400.
  if (error.message.toLowerCase().includes('already registered'))
    return 'That email already has an account. Try signing in.';

  if (error.status === 500) return 'That username is taken. Pick another one.';

  return humanize(error.message);
}

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
      .then(({ data }) => {
        set({ session: data.session, ready: true });
        if (data.session) void get().refreshProfile();
      })
      /*
       * `ready` gates every AuthGate in the app, so a rejection here used to
       * hang Home, Stats and Profile on a spinner forever. Failing open to the
       * sign-in form is the honest fallback: if the persisted session cannot
       * be read, we genuinely do not know that anyone is signed in.
       */
      .catch(() => set({ ready: true }));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, ready: true });
      if (session) void get().refreshProfile();
      else set({ profile: null });
    });

    return () => sub.subscription.unsubscribe();
  },

  signUp: async (email, password, username, displayName, instagram, phone) => {
    set({ busy: true, error: null, notice: null });
    const accent = SIGNUP_ACCENTS[Math.floor(Math.random() * SIGNUP_ACCENTS.length)]!;

    /*
     * Parked before the request, not after: on a project that requires email
     * confirmation this call returns without a session, and the handle would
     * otherwise be gone by the time the user comes back to sign in.
     * Cleared again below if the signup itself fails.
     */
    await setPendingClaims(email, { phone: phone?.trim(), handle: instagram?.trim() });

    // The profile row is created by the on_auth_user_created trigger,
    // which reads these values out of user_metadata.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: username.trim().toLowerCase(),
          display_name: displayName.trim() || username.trim(),
          accent,
        },
      },
    });

    if (error) {
      // Nothing was created, so nothing should be waiting to attach itself
      // to the next account that signs in on this device.
      await clearPendingClaims();
      set({ busy: false, error: humanizeSignUp(error) });
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
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null, notice: null });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    set({ busy: false, error: error ? humanize(error.message) : null });
  },

  signOut: async () => {
    set({ busy: true });
    await supabase.auth.signOut();
    set({ busy: false, session: null, profile: null, recovering: false });
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
   */
  requestPasswordReset: async (email) => {
    set({ busy: true, error: null, notice: null });

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: recoveryRedirectUrl(),
    });

    if (error) {
      /*
       * Rate limiting is the one failure worth showing as itself. Everything
       * else — including "user not found", which GoTrue does not report
       * anyway — collapses into the same reassuring notice, so the screen
       * cannot be used to probe for accounts.
       */
      const rateLimited = error.status === 429 || /rate limit/i.test(error.message);
      set({
        busy: false,
        error: rateLimited
          ? 'Too many reset emails just now. Wait a minute and try again.'
          : null,
        notice: rateLimited ? null : 'If that email has an account, a reset link is on its way.',
      });
      return;
    }

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
   */
  beginRecovery: async (accessToken, refreshToken) => {
    set({ busy: true, error: null, notice: null });

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      set({
        busy: false,
        recovering: false,
        error: 'That reset link has expired or already been used. Request a new one.',
      });
      return;
    }

    set({ busy: false, session: data.session, recovering: true });
    void get().refreshProfile();
  },

  completePasswordReset: async (password) => {
    set({ busy: true, error: null, notice: null });

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      set({ busy: false, error: humanize(error.message) });
      return false;
    }

    /*
     * Stays signed in. updateUser leaves the session valid, and signing out
     * here to make the user type the password they just chose would be
     * ceremony, not security.
     */
    set({ busy: false, recovering: false, notice: null });
    return true;
  },

  cancelRecovery: async () => {
    set({ recovering: false });
    await get().signOut();
  },

  failRecovery: (message) => set({ recovering: false, busy: false, error: message }),

  /**
   * Deletes the signed-in account. Returns true on success.
   *
   * The server does the work in public.delete_own_account(), which takes
   * no arguments on purpose — it reads auth.uid() itself, so this call
   * cannot be aimed at anyone else's account. See migration 005.
   *
   * Signs out afterwards regardless: once the auth row is gone the local
   * session is a token for a user that no longer exists, and leaving it
   * in place would leave the app in a signed-in state with every query
   * failing.
   */
  deleteAccount: async () => {
    set({ busy: true, error: null });

    const { error } = await supabase.rpc('delete_own_account');

    if (error) {
      set({ busy: false, error: humanize(error.message) });
      return false;
    }

    await supabase.auth.signOut();
    set({ busy: false, session: null, profile: null, profileError: null });
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
  /*
   * The database is the authority on every rule here, not this function.
   * `profiles` carries CHECK constraints for the name length, the bio
   * length and the username shape, plus a unique index on username — so
   * the client validates to give a fast answer and the server validates to
   * make it true. Anything that gets past the checks below still comes
   * back as a readable error rather than a silent no-op.
   */
  updateProfile: async ({ displayName, username, bio, accent, avatarPath }) => {
    const uid = get().session?.user.id;
    if (!uid) return 'You are signed out.';

    const name = displayName.trim();
    const handle = username.trim().toLowerCase();
    const about = bio.trim();

    // Mirrors profiles_display_name_len.
    if (name.length < 1 || name.length > 40) return 'Display name must be 1–40 characters.';
    // Mirrors profiles_username_shape. Lowercase alphanumerics, underscore
    // and period only — which also blocks unicode lookalike homographs.
    if (!/^[a-z0-9._]{3,24}$/.test(handle))
      return 'Usernames are 3–24 characters: lowercase letters, numbers, dots and underscores.';
    // Mirrors profiles_bio_len.
    if (about.length > 300) return 'Your about is longer than 300 characters.';

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
       * 23505 is the unique violation on username. supabase-js surfaces
       * the Postgres code, so this does not have to match on message text
       * — which is the thing that changes between versions.
       */
      if (error.code === '23505') return 'That username is taken. Pick another.';
      return humanize(error.message);
    }

    await get().refreshProfile();
    return null;
  },

  refreshProfile: async () => {
    const uid = get().session?.user.id;
    if (!uid) return;

    set({ profileLoading: true, profileError: null });

    const DELAYS_MS = [0, 400, 1200];
    for (let attempt = 0; attempt < DELAYS_MS.length; attempt++) {
      if (DELAYS_MS[attempt]) await new Promise((r) => setTimeout(r, DELAYS_MS[attempt]));

      // The session can end mid-retry; a signed-out user has no profile to load.
      if (get().session?.user.id !== uid) {
        set({ profileLoading: false });
        return;
      }

      /*
       * Explicit columns rather than '*'. Not required any more — migration
       * 008 moved the discovery hashes out of profiles — but this call ran
       * `select('*')` on every launch, and that is precisely how we learned
       * 002's column revoke never bit: had it worked, this would have been
       * failing for every user since 002 shipped.
       */
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLS)
        .eq('id', uid)
        .single();

      if (data) {
        set({ profile: data, profileLoading: false, profileError: null });
        // Safe to write only now: the row the update targets is confirmed
        // to exist, which is the whole reason this is not done in signUp.
        void drainPendingClaims(uid, get().session?.user.email ?? null);
        return;
      }

      // Last attempt: report it instead of leaving the screen blank.
      if (attempt === DELAYS_MS.length - 1) {
        set({
          profileLoading: false,
          profileError: error
            ? humanize(error.message)
            : 'Could not load your profile. Pull to retry.',
        });
      }
    }
  },

  clearError: () => set({ error: null, notice: null }),
}));
