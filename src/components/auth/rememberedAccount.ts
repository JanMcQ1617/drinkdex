import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createGuardedStorage } from '@/lib/guardedStorage';
import { isPlaceholderUsername, onAccountDeleted, useAuth } from '@/store/auth';

/* ==================================================================== */
/* The account this phone signed in with last                           */
/*                                                                      */
/* So a person coming back on the same phone gets "Welcome back" and     */
/* one tap with the way in they used last time, instead of a question    */
/* meant for someone new (auth/WelcomeBack).                             */
/*                                                                      */
/* AS LITTLE AS WILL DO. The account id, the display name, its accent    */
/* and avatar path (for the face beside the name) and the method name.   */
/* Never the email address or the phone number: nothing a person types   */
/* into sign-in is ever written to the device (store/signInFlow). Never  */
/* a Dex count, and the @handle only stands in as the name for an       */
/* account with no display name: on a shared phone those say more than  */
/* "someone signed in here". "Not you? Forget this account" clears      */
/* it, and so does deleting the account (onAccountDeleted, below).      */
/*                                                                      */
/* WRITTEN ONLY FOR A FINISHED ACCOUNT. A new account still on its       */
/* placeholder handle is not remembered: its username step offers "Not   */
/* your account? Sign out", and the person who takes it meant another    */
/* account.                                                              */
/*                                                                      */
/* Read once at module load, like Apple's availability, so the first    */
/* signed-out render already knows; `primed` covers the frames before.  */
/* ==================================================================== */

export type RememberedMethod = 'apple' | 'google' | 'facebook' | 'phone' | 'email';

export interface RememberedAccount {
  userId: string;
  name: string;
  accent: string;
  avatarPath: string | null;
  /** Null when it could not be told (an account restored from before this was kept). */
  method: RememberedMethod | null;
}

interface RememberedState {
  account: RememberedAccount | null;
  /** True once the saved record has been read (or could not be). */
  primed: boolean;
}

const METHODS: readonly RememberedMethod[] = ['apple', 'google', 'facebook', 'phone', 'email'];
const isMethod = (v: unknown): v is RememberedMethod =>
  typeof v === 'string' && (METHODS as readonly string[]).includes(v);

/** Only a well-formed record survives a read; anything else is no record. */
function parse(saved: unknown): RememberedAccount | null {
  if (!saved || typeof saved !== 'object') return null;
  const a = saved as Record<string, unknown>;
  if (typeof a.userId !== 'string' || typeof a.name !== 'string' || typeof a.accent !== 'string') {
    return null;
  }
  return {
    userId: a.userId,
    name: a.name,
    accent: a.accent,
    avatarPath: typeof a.avatarPath === 'string' ? a.avatarPath : null,
    method: isMethod(a.method) ? a.method : null,
  };
}

export const useRemembered = create<RememberedState>()(
  persist((): RememberedState => ({ account: null, primed: false }), {
    name: 'sipply.lastAccount.v1',
    storage: createJSONStorage(createGuardedStorage),
    partialize: (s) => ({ account: s.account }),
    // `primed` is set here so marking it costs no write (as collection.ts does).
    merge: (saved, current) => ({
      ...current,
      account: parse((saved as { account?: unknown } | undefined)?.account),
      primed: true,
    }),
    onRehydrateStorage: () => (_state, error) => {
      if (error) useRemembered.setState({ primed: true });
      // A sign-in that landed before the read finished was overwritten by it.
      sync();
    },
  }),
);

/** "Not you? Forget this account", and account deletion. */
export function forgetRememberedAccount() {
  useRemembered.setState({ account: null });
}

/*
 * A deleted account is not offered back. Only when it is the one remembered:
 * a new account deleted from its username step leaves the last finished
 * account's record alone.
 */
onAccountDeleted((uid) => {
  if (useRemembered.getState().account?.userId === uid) forgetRememberedAccount();
});

/* -------------------------------------------------------------------- */
/* Which way in was used                                                 */
/* -------------------------------------------------------------------- */

/**
 * The method of the request now out, noted by the sign-in flow as it sends
 * one, and cleared again when it ends without a session. A session that
 * arrives with one noted was made by it.
 */
let attempt: RememberedMethod | null = null;

export function noteSignInAttempt(method: RememberedMethod | null) {
  attempt = method;
}

/**
 * For a session that arrived with no attempt noted (restored at launch, a
 * reset link): the identity signed in with most recently, else the first.
 */
function methodOf(user: User): RememberedMethod | null {
  const latest = [...(user.identities ?? [])].sort((a, b) =>
    (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? ''),
  )[0];
  const provider: unknown = latest?.provider ?? user.app_metadata?.provider;
  return isMethod(provider) ? provider : null;
}

const same = (a: RememberedAccount | null, b: RememberedAccount) =>
  !!a &&
  a.userId === b.userId &&
  a.name === b.name &&
  a.accent === b.accent &&
  a.avatarPath === b.avatarPath &&
  a.method === b.method;

/** Keeps the record in step with the signed-in account's own profile row. */
function sync() {
  if (!useRemembered.getState().primed) return;
  const { session, profile } = useAuth.getState();
  const user = session?.user;
  if (!user || !profile || profile.id !== user.id || isPlaceholderUsername(profile.username)) return;
  const current = useRemembered.getState().account;
  const method =
    attempt ?? (current?.userId === user.id ? current.method : null) ?? methodOf(user);
  const next: RememberedAccount = {
    userId: user.id,
    name: profile.display_name.trim() || profile.username,
    accent: profile.accent,
    avatarPath: profile.avatar_path ?? null,
    method,
  };
  attempt = null;
  if (!same(current, next)) useRemembered.setState({ account: next });
}

useAuth.subscribe((state, prev) => {
  /*
   * A session that ends before its account was remembered (the username
   * step's "Not your account? Sign out") takes its noted way in with it, so
   * a later reset-link sign-in is not credited to it.
   */
  if (!state.session && prev.session) attempt = null;
  if (state.session !== prev.session || state.profile !== prev.profile) sync();
});
