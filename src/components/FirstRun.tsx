import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { colors } from '@/constants/theme';
import { useFirstRunShowing } from '@/lib/firstRun';
import { useTaste } from '@/store/taste';

/* ==================================================================== */
/* The first run                                                        */
/*                                                                      */
/* Questions before sign-in, then picks, then the ways in (specs/v4.1-  */
/* changes.md 1.1, after Imprint's onboarding). Drawn over the whole    */
/* app rather than as a route: typed routes need Metro to learn a new   */
/* one, and over the tabs it covers the tab bar, so nothing under it    */
/* can be swiped or tapped while it is up.                              */
/*                                                                      */
/* WHEN. Signed out, once auth-js has restored (or not) the session,    */
/* once the taste store has read the phone back, until the first run is */
/* done (All set passed, Not now, or signed in) and unless "I already   */
/* have an account" was chosen in this runtime. A session arriving any  */
/* way hides it at once; the taste store marks the run done as it does  */
/* (store/taste). A signed-in launch never shows it.                    */
/*                                                                      */
/* WHERE. Mounted in the root layout straight after the Stack, so the   */
/* password-reset overlay, the celebrations and the cold-start film all */
/* draw above it, and the film plays first. A sibling of the Stack (the */
/* theme provider draws no view), so accessibilityViewIsModal keeps     */
/* VoiceOver off the app beside it. The flow lays out its own safe-area */
/* insets: it is the same component Settings opens full-screen in a     */
/* Modal for "Your tastes", where nothing else would pad it.            */
/*                                                                      */
/* No status bar of its own: the root's dark one already serves, and a  */
/* second one mounted while the film is up would unhide the bar over it. */
/* ==================================================================== */

/** The flow's own exit reasons, read off its props: a case below that the flow cannot send is a type error. */
type ExitReason = Parameters<NonNullable<ComponentProps<typeof OnboardingFlow>['onExit']>>[0];

/*
 * Read from the stores at the moment of the exit, so every render hands
 * the flow the same function.
 *
 *   signin   "I already have an account": no questions. Remembered for
 *            this runtime only, so the next cold start welcomes again;
 *            Home's gate shows Welcome back or the ways in, as it did.
 *   handoff  the sign-in step's email or phone was chosen: the shared
 *            sign-in flow has left 'entry', and Home's gate is already on
 *            that step, so the person carries on there.
 *   not-now  the app, signed out, on Home, whose gate heads the ways in
 *            with the picks (auth/SignInScreen, "Keep your picks").
 *
 * 'closed' and 'done' are the retake's (Settings), never this mode's.
 */
function exit(reason: ExitReason) {
  const taste = useTaste.getState();
  switch (reason) {
    case 'signin':
      taste.chooseSignIn();
      router.navigate('/');
      return;
    case 'handoff':
      taste.finish();
      router.navigate('/');
      return;
    case 'not-now':
      taste.finish();
      /*
       * Home, where the picks head the ways in. On a cold start Home is
       * already under the overlay; after an account deletion from Settings
       * it is not, and Profile's gate has no picks head.
       */
      router.navigate('/');
      return;
    default:
      return;
  }
}

export function FirstRun() {
  // The WHEN above, shared with sign-in's first step, which is covered while this is up (lib/firstRun).
  if (!useFirstRunShowing()) return null;

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <OnboardingFlow mode="first-run" onExit={exit} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* The page itself, edge to edge: an opaque ground, so nothing of the app under it shows or reads. */
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
});
