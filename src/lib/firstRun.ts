import { useAuth } from '@/store/auth';
import { useTaste } from '@/store/taste';

/*
 * Whether the first run (components/FirstRun) is drawn over the app now.
 * One predicate, read by FirstRun to draw itself and by whatever under it
 * must know it is covered: sign-in's first step, which Home's gate has
 * already mounted beneath the onboarding on a signed-out first launch,
 * and which must then be no destination for the cold-start film's Dock
 * (lib/introDock, PRIORITY). Kept out of FirstRun.tsx so a sign-in page
 * can read it without importing the whole onboarding.
 *
 * Signed out, once auth-js has restored (or not) the session, once the
 * taste store has read the phone back, until the first run is done, and
 * unless "I already have an account" was chosen in this runtime.
 */
export function useFirstRunShowing(): boolean {
  const ready = useAuth((s) => s.ready);
  const signedIn = useAuth((s) => s.session !== null);
  const hydrated = useTaste((s) => s.hydrated);
  const done = useTaste((s) => s.done);
  const signInFirst = useTaste((s) => s.signInFirst);
  return ready && !signedIn && hydrated && !done && !signInFirst;
}
