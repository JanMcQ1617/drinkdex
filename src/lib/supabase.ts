import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
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

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No deep-link callback flow in this app, and on web this would try to
    // read a session out of the address bar.
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-client-info': `clink/${Platform.OS}` },
  },
});

/** True when the signed-in user's session is still valid. */
export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session != null;
}
