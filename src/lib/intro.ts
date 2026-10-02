/* ==================================================================== */
/* Launch intro lifecycle, per JS runtime                               */
/*                                                                      */
/* Module scope IS the definition of a cold start: iOS makes a new JS   */
/* runtime only when the process starts (swiped away, rebooted, or      */
/* reclaimed while in the background) and keeps this module alive       */
/* across every background/foreground in between. So the intro plays on */
/* every cold start and never on a resume (Jan, 30 Sep 2026; confirmed  */
/* 1 Oct 2026).                                                         */
/*                                                                      */
/* Nothing is stored. The old once-per-install flag lived in            */
/* AsyncStorage; a flag that has to survive the process is exactly what */
/* "every cold start" must not have. Editing this file in development   */
/* resets it on Fast Refresh, so the intro can play again; harmless.    */
/* ==================================================================== */

let played = false;
const waiters: (() => void)[] = [];

/** True once the intro has finished in this runtime. */
export function introHasPlayed(): boolean {
  return played;
}

/** Called by RootLayout when the intro ends, however it ends. */
export function markIntroPlayed(): void {
  if (played) return;
  played = true;
  for (const resolve of waiters.splice(0)) resolve();
}

/**
 * Resolves once the intro is off the screen; at once if it already is.
 *
 * For anything that would otherwise surface over the film: an invite
 * link usually cold-starts the app, and its Alert raised mid-intro landed
 * on top of a film the user had not finished (or skipped) yet.
 */
export function whenIntroPlayed(): Promise<void> {
  return played ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve));
}
