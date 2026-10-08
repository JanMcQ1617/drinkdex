import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { VideoIntro } from '@/components/VideoIntro';
import { InviteLinkHandler } from '@/components/InviteLinkHandler';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { PasswordResetOverlay } from '@/components/PasswordResetOverlay';
import { SubmissionSync } from '@/components/SubmissionSync';
import { colors, fonts } from '@/constants/theme';
import { introHasPlayed, markIntroPlayed } from '@/lib/intro';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';

SplashScreen.preventAutoHideAsync();
/*
 * Fade the native splash out rather than cutting it. iOS defaults to no
 * fade, so the bone launch screen vanished in one frame and the film (or,
 * under Reduce Motion, the drawn intro) was simply there — a hard cut at
 * the one moment the app is making its first impression. A quarter-second
 * dissolve covers the change of ground instead.
 */
SplashScreen.setOptions({ fade: true, duration: 250 });

/*
 * A ceiling on expo-image's in-memory cache, which has none by default
 * (maxMemoryCost 0 means unlimited). Feed photos, grids, reel posters and
 * every avatar are drawn with cachePolicy "memory-disk", and iOS keeps the
 * FULL decoded bitmap there: expo-image only shrinks a picture to its view
 * after the load. A pour photo is up to 2048px, so 12 to 16 MB once
 * decoded, even in a 40pt avatar. Each new post or face scrolled past added
 * another one and nothing gave any back, so memory climbed with use until
 * iOS slowed the app and then killed it. With the ceiling, the oldest
 * bitmaps go first and come back from the disk cache when they are needed
 * again. A picture already on screen is unaffected: its view holds its own
 * drawn copy, which the cache never touches. iOS only: the Android module
 * has no configureCache, and calling it there would throw.
 */
const IMAGE_MEMORY_CACHE_BYTES = 256 * 1024 * 1024;
if (Platform.OS === 'ios') Image.configureCache({ maxMemoryCost: IMAGE_MEMORY_CACHE_BYTES });

/*
 * Lifts the native splash. Safe to call any number of times: the native
 * side does nothing once the splash is gone, which is what lets the film
 * call it from its first frame and from its fallback timer both.
 */
function liftSplash() {
  void SplashScreen.hideAsync();
}

const SipplyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    // The v2 edge. cardBorder measured 1.08:1 on the page: an edge nobody saw.
    border: colors.line,
    primary: colors.wine,
    notification: colors.danger,
  },
  fonts: {
    ...DefaultTheme.fonts,
    regular: { ...DefaultTheme.fonts.regular, fontFamily: fonts.body },
    medium: { ...DefaultTheme.fonts.medium, fontFamily: fonts.bodyMedium },
    bold: { ...DefaultTheme.fonts.bold, fontFamily: fonts.bodySemiBold },
    heavy: { ...DefaultTheme.fonts.heavy, fontFamily: fonts.bodyBold },
  },
};

export default function RootLayout() {
  // For the log window's entrance. Above the splash gate's early return, like every hook here.
  const reducedMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({
    // Latin-only subsets — see assets/fonts/README.md. Each key must match
    // its `fonts.*` value in theme.ts byte-for-byte or it silently falls back.
    PlayfairDisplayLatin_600SemiBold: require('../../assets/fonts/PlayfairDisplayLatin_600SemiBold.ttf'),
    PlayfairDisplayLatin_700Bold: require('../../assets/fonts/PlayfairDisplayLatin_700Bold.ttf'),
    InterLatin_400Regular: require('../../assets/fonts/InterLatin_400Regular.ttf'),
    InterLatin_500Medium: require('../../assets/fonts/InterLatin_500Medium.ttf'),
    InterLatin_600SemiBold: require('../../assets/fonts/InterLatin_600SemiBold.ttf'),
  });

  /*
   * Every cold start plays the intro; a resume never does (lib/intro: the
   * JS runtime's own lifetime is the test, so there is nothing to read).
   * Known from the first render, so the splash never has to wait on a
   * question, and a fast-refresh remount after the film has ended does not
   * replay it.
   */
  const [showIntro, setShowIntro] = useState(() => !introHasPlayed());

  const hydrated = useCollection((s) => s.hydrated);
  const ready = (fontsLoaded || fontError != null) && hydrated;

  // Restores the persisted Supabase session and keeps it refreshed. The
  // returned unsubscribe tears down the auth listener.
  const initAuth = useAuth((s) => s.init);
  useEffect(() => initAuth(), [initAuth]);

  /*
   * Every cold start plays the intro, which lifts the splash itself
   * (`onVisible` below) — for the film, once its first frame is drawn, so
   * the splash dissolves onto the film rather than onto the ground under
   * it. So this lifts nothing while the intro is up. When the intro ends it
   * runs again, a no-op unless nothing lifted the splash yet, and it is
   * what lifts it if the intro has already played in this runtime (a fast
   * refresh of this file in development).
   */
  useEffect(() => {
    if (ready && !showIntro) liftSplash();
  }, [ready, showIntro]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={SipplyTheme}>
      {/*
        Dark glyphs, the default: most screens stand on cream paper. A
        screen on a dark ground (Home's lining bar, the drink page, the
        sign-in shell) asks for light glyphs while it is focused
        (ScreenTopBar's FocusedStatusBar), and this takes over again the
        moment it leaves. The intros hide the bar while they play and hand
        it back as they leave (see VideoIntro).
      */}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          /*
           * The native iOS push — the outgoing screen parallax-slides at a
           * third of the incoming screen's speed under a dimming layer.
           * Reimplementing that in JS is a classic way to make an app feel
           * off; react-native-screens hands us the real one.
           */
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="drink/[id]"
          options={{
            // Full-width back swipe, not just the 20pt edge. A drink card
            // is a browse-and-dismiss surface with nothing horizontally
            // scrollable in it, so there is no gesture to steal.
            gestureDirection: 'horizontal',
            fullScreenGestureEnabled: true,
          }}
        />
        {/*
          A drink someone added themselves: the same kind of page as a Dex
          entry, browsed and dismissed the same way, so the same swipe.
        */}
        <Stack.Screen
          name="custom/[id]"
          options={{ gestureDirection: 'horizontal', fullScreenGestureEnabled: true }}
        />
        {/*
          Stats. It was a tab; it is a report on the Dex rather than a place
          visited every day, so it left the bar and pushes from the Dex's
          top bar. Edge swipe only: its rows and the Dex button are
          tappable, and a full-width back gesture would fire on a mistimed
          tap at either.
        */}
        <Stack.Screen name="stats" options={{ gestureDirection: 'horizontal' }} />
        {/*
          user/[id], a person's profile, is not listed on purpose: the stack
          defaults are all it needs — a push, so Back returns to whatever
          opened it, with the standard edge swipe. An entry here would only
          repeat them. The same goes for activity, post/[id], saved,
          connections/[id], tournaments/index and tournaments/[id], which
          are plain pushes too.
        */}
        {/*
          Posting a drink, from the bar's + and every other Post button. A
          full-screen window that rises from the bottom (UIKit's cover
          vertical; a fade under Reduce Motion), like Instagram's create
          screen (Jan, build 17). It was a page sheet, a card with the app
          showing above it; as the whole screen, its search and the results
          under it have all the room the keyboard leaves (log.tsx).

          Closed by its X, which asks before discarding a photo or a choice
          (log.tsx's usePreventRemove). No swipe-down: a full-screen window
          has no sheet to pull, and a drag through the results list must
          never throw a half-made post away. Still a modal, not a push: it
          is a task you finish or abandon, not a place you wander out of.
        */}
        <Stack.Screen
          name="log"
          options={{
            presentation: 'fullScreenModal',
            animation: reducedMotion ? 'fade' : 'default',
            gestureEnabled: false,
          }}
        />
        {/*
          Today's pours, one person after another, opened from Home's row
          of them. A sheet you look through and swipe down to close; it is
          not a place with somewhere further to go.
        */}
        <Stack.Screen
          name="pours/[authorId]"
          options={{ presentation: 'modal', gestureDirection: 'vertical' }}
        />
        {/*
          Adding a drink the Dex does not have. A task, like posting, so a
          modal for the same reason: the downward dismiss means "never mind".
        */}
        <Stack.Screen
          name="add-drink"
          options={{ presentation: 'modal', gestureDirection: 'vertical' }}
        />
        {/*
          Settings pushes rather than presenting: it is a place you go and
          come back from, and it has a child (edit-profile) that needs
          somewhere to push onto.
        */}
        <Stack.Screen name="settings" options={{ gestureDirection: 'horizontal' }} />
        {/*
          Settings' two children. Both push rather than presenting, and both
          take the edge-swipe rather than the full-width one: Find friends
          holds text inputs and a horizontally scrolling result row, and a
          full-width back gesture would fire on a mistimed tap at either.

          They are screens rather than expanding rows because there is a
          screen's worth behind each — Find friends alone is six cards with
          headings. Nested inside a settings group they boxed bordered cards
          inside another and pushed "Sign out" out of reach.
        */}
        <Stack.Screen name="blocked" options={{ gestureDirection: 'horizontal' }} />
        <Stack.Screen name="find-friends" options={{ gestureDirection: 'horizontal' }} />
        {/* Hosting a tournament: a task, like posting, so a modal. */}
        <Stack.Screen
          name="tournaments/new"
          options={{ presentation: 'modal', gestureDirection: 'vertical' }}
        />
        {/*
          Editing, on the other hand, is a task — modal, so the downward
          dismiss reads as "never mind" and the Cancel in its bar means the
          same thing as the gesture.
        */}
        <Stack.Screen
          name="edit-profile"
          options={{ presentation: 'modal', gestureDirection: 'vertical' }}
        />
        {/*
          Filming a reel. Full-screen, not a sheet: a sheet's swipe-down
          would fight hold-to-record, so the gesture is off and the recorder
          has its own close button. While Reels is switched off nothing opens
          it, and the route sends anyone who reaches it back to Home.
        */}
        <Stack.Screen
          name="record"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
        {/*
          One person's reels, opened from a tile on their profile. A push
          with the edge swipe: the pager scrolls vertically, so nothing
          competes with the swipe back.
        */}
        <Stack.Screen name="reel/[id]" options={{ gestureDirection: 'horizontal' }} />
      </Stack>
      {/*
        No grain here. It used to be one paper overlay over the whole app,
        which dusted every photograph with noise and could not tell paper
        from the cabinet's lining. Each screen's root now mounts its own
        Grain as its first child, under its content, in its ground's tone
        (Grain.tsx), as the natively presented modals always had to.
      */}
      {/* Redeems invite deep links; renders nothing. */}
      <InviteLinkHandler />
      {/*
        Sends the drinks people add to Sipply and fetches Jan's answers;
        renders nothing. Not part of the splash gate above: nothing on
        screen waits for the custom-drinks store, and one more thing the
        splash waited on would be one more way to hold a blank page.
      */}
      <SubmissionSync />
      {/*
        Password-recovery deep links. Renders nothing until one arrives,
        then covers the app with the "choose a new password" step — it has
        to sit outside the Stack because a recovery link signs the user in,
        so AuthGate is already showing the app by the time it is needed.

        Before the intro on purpose: on a cold start, a reset link plays the
        intro over the top and reveals this underneath, rather than having
        the overlay pop in above a half-finished film.
      */}
      <PasswordResetOverlay />
      {/*
        Celebrations. Above the Stack so a catch posted from the tab bar's
        modal and one posted from a Dex card land on the same surface, and
        below the intro so a cold start never stacks the two.
      */}
      <CelebrationOverlay />
      {showIntro && (
        <VideoIntro
          onVisible={liftSplash}
          onDone={() => {
            // Recorded first, so an invite's Alert waiting on it
            // (InviteLinkHandler) is raised as the film leaves.
            markIntroPlayed();
            setShowIntro(false);
          }}
        />
      )}
    </ThemeProvider>
  );
}
