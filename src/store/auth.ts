import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { SIGNUP_ACCENTS } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/database.types';


interface AuthState {
  session: Session | null;
  profile: ProfileRow | null;
  /** False until the persisted session has been restored from storage. */
  ready: boolean;
  busy: boolean;
  error: string | null;
  /** Non-failure feedback, e.g. "confirm your email before signing in". */
  notice: string | null;

  init: () => () => void;
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
  if (m.includes('network') || m.includes('fetch')) return 'Cannot reach Clink. Check your connection.';
  return message;
}

export const useAuth = create<AuthState>()((set, get) => ({
  session: null,
  profile: null,
  ready: false,
  busy: false,
  error: null,
  notice: null,

  /**
   * Restores the persisted session, then keeps the store in sync with
   * token refreshes and sign-outs. Returns an unsubscribe function.
   */
  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, ready: true });
      if (data.session) void get().refreshProfile();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, ready: true });
      if (session) void get().refreshProfile();
      else set({ profile: null });
    });

    return () => sub.subscription.unsubscribe();
  },

  signUp: async (email, password, username, displayName) => {
    set({ busy: true, error: null, notice: null });
    const accent = SIGNUP_ACCENTS[Math.floor(Math.random() * SIGNUP_ACCENTS.length)]!;

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
      set({ busy: false, error: humanize(error.message) });
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

  refreshProfile: async () => {
    const uid = get().session?.user.id;
    if (!uid) return;

    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();

    // A missing row right after signup means the trigger hasn't committed
    // yet; the next auth event will retry.
    if (!error && data) set({ profile: data });
  },

  clearError: () => set({ error: null, notice: null }),
}));
