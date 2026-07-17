import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_900Black,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '@/constants/theme';
import { useCollection } from '@/store/collection';

SplashScreen.preventAutoHideAsync();

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
  });

  const hydrated = useCollection((s) => s.hydrated);
  const ready = (fontsLoaded || fontError != null) && hydrated;

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
    </ThemeProvider>
  );
}
