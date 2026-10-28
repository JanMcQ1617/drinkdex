import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

/* ==================================================================== */
/* A bare page over the tab bar                                         */
/*                                                                      */
/* The tab bar's slab carries the page's paper (FloatingTabBar, v4.9    */
/* A.5; the sweep since v4.10, specs/v4.10/spec.md G), so on a tab root */
/* that lays the sweep the slab meets the page as one sheet. The pages  */
/* a signed-out phone meets in the gated tabs are bare on purpose: the  */
/* sign-in page and the steps after it (auth/CabinetBackdrop's          */
/* CabinetSheet) and the hold while auth starts (auth/AuthHold) stay    */
/* plain white, as sign-in and onboarding always have (G.1). Under one  */
/* of those the slab's sweep ended in a hard step at the bar's top, 255 */
/* over 251, the band G.7's third check says no tab root shows (found   */
/* on the integration pass's proof, specs/v4.10/board-final; build 34's */
/* grain made the same step at its mean).                               */
/*                                                                      */
/* So a bare page HOLDS the ground bare while its screen is focused,    */
/* and the slab draws no paper while any hold is out: plain white under */
/* plain white. A count, not a flag, since two gated screens can both   */
/* be focused for a frame as one tab hands over to the next. Leaving    */
/* the screen (another tab, a push over it) releases the hold, and the  */
/* slab has its paper back under the next tab root. Signed in, nothing  */
/* holds it, and the slab is exactly as v4.10 G draws it.               */
/* ==================================================================== */

let holds = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => holds > 0;

/** Whether a bare page is focused over the tab bar: the slab then draws no paper. */
export function useBareGround(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}

/** Hold the ground bare while this screen is focused; released on blur and on unmount. */
export function useHoldBareGround() {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    holds += 1;
    emit();
    return () => {
      holds -= 1;
      emit();
    };
  }, [focused]);
}
