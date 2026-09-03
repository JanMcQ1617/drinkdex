import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { SipplyIntro } from '@/components/SipplyIntro';
import { InviteLinkHandler } from '@/components/InviteLinkHandler';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { PasswordResetOverlay } from '@/components/PasswordResetOverlay';
import { colors, fonts } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';

SplashScreen.preventAutoHideAsync();

/** Play the intro once per cold start (survives fast-refresh remounts). */
let introPlayed = false;

const SipplyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.cardBorder,
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
  const [fontsLoaded, fontError] = useFonts({
    // Latin-only subsets — see assets/fonts/README.md. Each key must match
    // its `fonts.*` value in theme.ts byte-for-byte or it silently falls back.
    PlayfairDisplayLatin_600SemiBold: require('../../assets/fonts/PlayfairDisplayLatin_600SemiBold.ttf'),
    PlayfairDisplayLatin_700Bold: require('../../assets/fonts/PlayfairDisplayLatin_700Bold.ttf'),
    InterLatin_400Regular: require('../../assets/fonts/InterLatin_400Regular.ttf'),
    InterLatin_500Medium: require('../../assets/fonts/InterLatin_500Medium.ttf'),
    InterLatin_600SemiBold: require('../../assets/fonts/InterLatin_600SemiBold.ttf'),
  });

  const hydrated = useCollection((s) => s.hydrated);
  const ready = (fontsLoaded || fontError != null) && hydrated;

  const [showIntro, setShowIntro] = useState(!introPlayed);

  // Restores the persisted Supabase session and keeps it refreshed. The
  // returned unsubscribe tears down the auth listener.
  const initAuth = useAuth((s) => s.init);
  useEffect(() => initAuth(), [initAuth]);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={SipplyTheme}>
      {/* Dark glyphs — the app is light-first now. */}
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
          The WINE atlas — reference, not collection. Distinct from the
          Atlas tab, which catalogues breweries. Edge-swipe only: this
          screen has a horizontally scrolling filter row, and a full-width
          back gesture would fight it on every drag.
        */}
        <Stack.Screen name="wine-atlas/index" options={{ gestureDirection: 'horizontal' }} />
        {/*
          Logging a pour. A modal, not a push: it is a task you complete or
          abandon, and the sheet's downward dismiss is the gesture that
          matches "never mind" — a back-chevron would imply it is a place
          you can wander out of half-finished.
        */}
        <Stack.Screen
          name="log"
          options={{ presentation: 'modal', gestureDirection: 'vertical' }}
        />
        {/*
          Settings pushes rather than presenting: it is a place you go and
          come back from, and it has a child (edit-profile) that needs
          somewhere to push onto.
        */}
        <Stack.Screen name="settings" options={{ gestureDirection: 'horizontal' }} />
        {/*
          Editing, on the other hand, is a task — modal, so the downward
          dismiss reads as "never mind" and the Cancel in its bar means the
          same thing as the gesture.
        */}
        <Stack.Screen
          name="edit-profile"
          options={{ presentation: 'modal', gestureDirection: 'vertical' }}
        />
      </Stack>
      {/* Redeems invite deep links; renders nothing. */}
      <InviteLinkHandler />
      {/*
        Password-recovery deep links. Renders nothing until one arrives,
        then covers the app with the "choose a new password" step — it has
        to sit outside the Stack because a recovery link signs the user in,
        so AuthGate is already showing the app by the time it is needed.

        Before the intro on purpose: a cold start from a reset link should
        still play the intro over the top and reveal this underneath, not
        have the overlay pop in above a half-finished animation.
      */}
      <PasswordResetOverlay />
      {/*
        Celebrations. Above the Stack so a catch logged from the tab bar's
        modal and one logged from a Dex card land on the same surface, and
        below the intro so a cold start never stacks the two.
      */}
      <CelebrationOverlay />
      {showIntro && (
        <SipplyIntro
          onDone={() => {
            introPlayed = true;
            setShowIntro(false);
          }}
        />
      )}
    </ThemeProvider>
  );
}
