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
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { ClinkIntro } from '@/components/ClinkIntro';
import { colors, fonts } from '@/constants/theme';
import { useCollection } from '@/store/collection';

SplashScreen.preventAutoHideAsync();

/** Play the intro once per cold start (survives fast-refresh remounts). */
let introPlayed = false;

const DexTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.cardBorder,
    primary: colors.gold,
    notification: colors.danger,
  },
  fonts: {
    ...DarkTheme.fonts,
    regular: { ...DarkTheme.fonts.regular, fontFamily: fonts.body },
    medium: { ...DarkTheme.fonts.medium, fontFamily: fonts.bodyMedium },
    bold: { ...DarkTheme.fonts.bold, fontFamily: fonts.bodySemiBold },
    heavy: { ...DarkTheme.fonts.heavy, fontFamily: fonts.bodyBold },
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

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={DexTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="drink/[id]" />
      </Stack>
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
