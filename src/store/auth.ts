import type { AuthError, Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { SIGNUP_ACCENTS } from '@/constants/theme';
import {
  clearPendingHandle,
  getPendingHandle,
  hashHandle,
  rememberHandle,
  setPendingHandle,
} from '@/lib/instagram';
import { PROFILE_COLS, setInstagramHash } from '@/lib/social';
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

  init: () => () => void;
  /**
   * `instagram` is optional and never blocks the account: it only decides
   * whether friends importing their Instagram list can find this person.
   * Stored as a hash, and not until the profile row exists — see
   * setPendingHandle in src/lib/instagram.ts for why it takes a detour.
   */
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    instagram?: string,
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Irreversible. Removes the auth user, every row that cascades from it, and the photos storage does not cascade. */
  deleteAccount: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
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
 * Writes the handle given at signup, once there is a profile row to write it
 * to. No-ops when nothing is parked, which is every launch after the first.
 *
 * The email check is the guard against a signup that was started but never
 * confirmed: without it, a handle parked on this device would attach itself
 * to whichever account signs in next, which on a shared phone is someone
 * else's. A mismatch discards the handle rather than holding it — the user
 * can add it in one field on the Accounts screen, and silently carrying a
 * stale claim around is worse than losing it.
 *
 * Failures are swallowed on purpose. This is an optional discoverability
 * setting running behind a profile fetch; an error here must not surface as
 * "could not load your profile", and the same field on the Accounts screen
 * is the retry.
 */
async function drainPendingHandle(uid: string, email: string | null): Promise<void> {
  try {
    const pending = await getPendingHandle();
    if (!pending) return;

    if (!email || email.trim().toLowerCase() !== pending.email) {
      await clearPendingHandle();
      return;
    }

    const hash = await hashHandle(pending.handle);
    if (!hash) {
      await clearPendingHandle();
      return;
    }

    await setInstagramHash(uid, hash);
    // Remembered locally too, so Accounts shows it as set rather than
    // asking for it again — the hash on the server cannot be read back.
    await rememberHandle(pending.handle);
    await clearPendingHandle();
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

  signUp: async (email, password, username, displayName, instagram) => {
    set({ busy: true, error: null, notice: null });
    const accent = SIGNUP_ACCENTS[Math.floor(Math.random() * SIGNUP_ACCENTS.length)]!;

    /*
     * Parked before the request, not after: on a project that requires email
     * confirmation this call returns without a session, and the handle would
     * otherwise be gone by the time the user comes back to sign in.
     * Cleared again below if the signup itself fails.
     */
    if (instagram?.trim()) await setPendingHandle(instagram, email);
    else await clearPendingHandle();

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
      await clearPendingHandle();
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
    set({ busy: false, session: null, profile: null });
  },

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
       * Explicit columns, never '*'. Migration 008 revokes table-level
       * SELECT on profiles, so `select *` now fails outright rather than
       * quietly returning the hash columns. This call ran on every launch,
       * which is how we know 002's original column-level revoke never took
       * effect: had it worked, this would have been failing for everyone.
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
        void drainPendingHandle(uid, get().session?.user.email ?? null);
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
