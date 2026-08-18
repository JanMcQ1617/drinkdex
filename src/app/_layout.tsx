import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_900Black,
} from '@expo-google-fonts/fraunces';
import { GowunBatang_700Bold } from '@expo-google-fonts/gowun-batang';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { ClinkIntro } from '@/components/ClinkIntro';
import { InviteLinkHandler } from '@/components/InviteLinkHandler';
import { colors, fonts } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';

SplashScreen.preventAutoHideAsync();

/** Play the intro once per cold start (survives fast-refresh remounts). */
let introPlayed = false;

const ClinkTheme = {
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
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    GowunBatang_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_700Bold,
    SpaceMono_400Regular,
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
    <ThemeProvider value={ClinkTheme}>
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
      </Stack>
      {/* Redeems invite deep links; renders nothing. */}
      <InviteLinkHandler />
      {showIntro && (
        <ClinkIntro
          onDone={() => {
            introPlayed = true;
            setShowIntro(false);
          }}
        />
      )}
    </ThemeProvider>
  );
}
