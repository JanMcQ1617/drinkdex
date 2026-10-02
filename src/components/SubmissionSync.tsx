import { useEffect } from 'react';
import { AppState } from 'react-native';

import { adoptOnLaunch, flushSubmissions, pullStatuses } from '@/lib/submissions';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* Keeps the drinks people add in step with Sipply                      */
/*                                                                      */
/* Renders nothing. Mounted once in the root layout, beside the invite  */
/* handler and outside the splash gate, because it never decides what   */
/* is on screen: it sends what is waiting and fetches Jan's answers, in */
/* the background (lib/submissions).                                    */
/*                                                                      */
/*   - at launch: adopts any drink an update has brought into the      */
/*     catalogue, signed in or not (no network)                         */
/*   - when someone signs in (the uid changes to a value): send, then   */
/*     fetch answers                                                    */
/*   - when the app comes back to the foreground: send at most once a   */
/*     minute, fetch at most every six hours. A suggestion is reviewed  */
/*     once a month; asking more often would only cost requests.         */
/*                                                                      */
/* Never blocks rendering and never throws: both calls swallow their    */
/* own failures, and a drink that did not go stays 'pending' for next   */
/* time.                                                                */
/* ==================================================================== */

const FLUSH_EVERY_MS = 60 * 1000;
const PULL_EVERY_MS = 6 * 60 * 60 * 1000;

/*
 * Module scope, not refs: the throttle is about the app's requests, not
 * this component's life, and a remount (a fast refresh in development)
 * must not reset it.
 */
let lastFlush = 0;
let lastPull = 0;

function flush() {
  lastFlush = Date.now();
  return flushSubmissions().catch(() => undefined);
}

function pull() {
  lastPull = Date.now();
  return pullStatuses().catch(() => undefined);
}

export function SubmissionSync() {
  const uid = useAuth((s) => s.session?.user.id ?? null);

  useEffect(() => {
    void adoptOnLaunch();
  }, []);

  useEffect(() => {
    if (!uid) return;
    void (async () => {
      await flush();
      await pull();
    })();
  }, [uid]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      void (async () => {
        if (now - lastFlush >= FLUSH_EVERY_MS) await flush();
        if (now - lastPull >= PULL_EVERY_MS) await pull();
      })();
    });
    return () => sub.remove();
  }, []);

  return null;
}
