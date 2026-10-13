/**
 * My Bar is hidden for now. Jan, 13 Oct 2026: "I want to remove the my bar
 * section for now since i dont have a good layout for it and dont like it
 * for now". Off unless the build sets EXPO_PUBLIC_MY_BAR=on, the pattern
 * REELS_ENABLED uses (lib/reels.ts).
 *
 * Off means: no tab and no page to swipe to ((tabs)/_layout.tsx wraps it in
 * TopTabs.Protected, so the + sits between Dex and Profile), no "Do you make
 * drinks at home?" or bar step in the first run (onboarding/path.ts), and no
 * "You can make it" on the picks (lib/recommend.ts). The screen, the store
 * and everyone's saved shelf stay as they are, so turning it back on loses
 * nothing.
 */
export const MY_BAR_ENABLED = process.env.EXPO_PUBLIC_MY_BAR === 'on';
