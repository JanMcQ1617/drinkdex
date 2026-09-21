import AsyncStorage from '@react-native-async-storage/async-storage';

/* ==================================================================== */
/* Onboarding state                                                     */
/*                                                                      */
/* Whether this account has been offered the "find your people" step     */
/* once. Deliberately NOT a single global flag: two accounts on one      */
/* phone are two people, and the second should be asked rather than      */
/* inherit whatever the first answered.                                  */
/*                                                                      */
/* Local, not a profile column. It is a fact about this install — the    */
/* same account on a new phone has not been offered anything there, and  */
/* asking again is the correct behaviour rather than a bug.              */
/* ==================================================================== */

const key = (userId: string) => `sipply.welcome.v1.${userId}`;

/**
 * Has this account already been through the welcome step?
 *
 * An unreadable store answers TRUE, which skips onboarding. The failure
 * has to fall that way: answering false on a read error shows the step
 * on every launch with no way to dismiss it permanently, because the
 * write that would dismiss it is going through the same broken storage.
 * A missed one-time prompt is recoverable — Settings carries every one
 * of these controls. A launch loop is not.
 */
export async function hasSeenWelcome(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(userId))) === '1';
  } catch {
    return true;
  }
}

/** Records that the step has been shown. Failing to record is not fatal. */
export async function markWelcomeSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), '1');
  } catch {
    /* Worst case it is offered once more. Not worth interrupting anyone for. */
  }
}
