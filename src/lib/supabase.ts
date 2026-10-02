import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
// Supabase's auth client builds URLs internally; React Native's URL is
// incomplete, so this must be imported before createClient runs.
import 'react-native-url-polyfill/auto';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY. ' +
      'They live in .env and are inlined at build time — if this fires in a ' +
      'release build, the bundle was built without the .env present.',
  );
}

/*
 * The project URL and publishable key, for the one upload that cannot go
 * through supabase-js: a reel's video is sent by expo-file-system's native
 * File.upload() straight to the Storage REST endpoint (lib/reels), so it
 * streams from disk with progress instead of loading 5 MB into the JS heap.
 * That request needs the same two values the client below is built from.
 * The key is public by design (RLS is what protects the data), so exporting
 * it widens nothing.
 */
export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Off on purpose. The two links that carry a session are read by hand:
    // a password reset (lib/recovery), so it can be checked against the
    // reset this phone asked for before it replaces anyone's session, and
    // the Facebook return link (lib/facebook), so its Facebook token never
    // reaches the persisted session. On web this would also try to read a
    // session out of the address bar.
    //
    // flowType is left at the default, implicit, which is what puts both
    // sessions in a URL fragment. Both readers depend on that; see
    // lib/recovery before switching this client to PKCE.
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-client-info': `clink/${Platform.OS}` },
  },
});

/*
 * Supabase's React Native setup: refresh only while in the foreground.
 * startAutoRefresh runs a tick at once, so a token that expired while the
 * app was away is refreshed on return rather than inside the first query a
 * screen makes, which every other query would then wait behind. Web has
 * its own visibility handling inside auth-js.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/** True when the signed-in user's session is still valid. */
export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session != null;
}
