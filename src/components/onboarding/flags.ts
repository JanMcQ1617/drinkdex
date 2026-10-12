/* ==================================================================== */
/* Onboarding flags                                                     */
/* ==================================================================== */

/**
 * "How did you hear about Sipply?" (specs/v4.1-changes.md 1.2, step 2x;
 * v4-onboarding spec 9). Built, and OFF: no pick uses the answer, and the
 * privacy policy promises no analytics. On only when the build sets
 * EXPO_PUBLIC_HEARD_FROM=on, the pattern REELS_ENABLED uses (lib/reels.ts).
 * Turning it on ships the policy's analytics paragraph with it (spec 8).
 */
export const ASK_HEARD_FROM = process.env.EXPO_PUBLIC_HEARD_FROM === 'on';
