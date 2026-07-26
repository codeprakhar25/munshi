import { Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari';
import { NotoSansTamil_400Regular } from '@expo-google-fonts/noto-sans-tamil';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { Urbanist_500Medium, Urbanist_600SemiBold, Urbanist_700Bold, Urbanist_800ExtraBold } from '@expo-google-fonts/urbanist';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Porcelain } from '@/constants/theme';
import { useOnboardingStore } from '@/store/onboarding-store';

SplashScreen.preventAutoHideAsync();

const lightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Porcelain.paper,
    card: Porcelain.white,
    text: Porcelain.ink,
    border: Porcelain.line,
    primary: Porcelain.saffronDeep,
  },
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const onboardingComplete = useOnboardingStore((s) => s.onboardingComplete);
  const hasRedirected = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
    Urbanist_800ExtraBold,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    NotoSansDevanagari_400Regular,
    NotoSansTamil_400Regular,
  });

  useEffect(() => {
    console.log('[RootLayout] fonts', { fontsLoaded, fontError: fontError?.message });
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (!hasHydrated) return;
    const inOnboarding = segments[0] === 'onboarding';
    const inScan = segments[0] === 'scan';

    if (!onboardingComplete && !inOnboarding && !inScan) {
      if (!hasRedirected.current) hasRedirected.current = true;
      router.replace('/onboarding');
      return;
    }

    if (onboardingComplete && (segments[0] === 'index' || segments[0] === '(tabs)' || !segments[0])) {
      router.replace('/home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, onboardingComplete, segments]);

  return (
    <ThemeProvider value={lightTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Porcelain.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}
