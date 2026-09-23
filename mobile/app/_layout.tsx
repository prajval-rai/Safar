import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { applyAppFontDefault, useAppFont } from '@/lib/fonts';
import { AuthProvider } from '@/lib/auth';
import { useHandlePushNotificationTaps, useRegisterPushNotifications } from '@/lib/pushNotifications';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// The splash screen hides itself once the first frame is ready — nothing in
// this app depends on a custom font or another asset that needs loading
// first, so there's no reason to hold it open (and no single point of
// failure that could leave the app on a blank screen if that load hangs).
SplashScreen.hideAsync().catch(() => {
  // Already hidden, or hiding isn't supported here (e.g. web) — fine either way.
});

export default function RootLayout() {
  const fontLoaded = useAppFont();
  useEffect(() => {
    if (fontLoaded) applyAppFontDefault();
  }, [fontLoaded]);

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  useRegisterPushNotifications();
  useHandlePushNotificationTaps();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Log in' }} />
        <Stack.Screen name="signup" options={{ title: 'Sign up' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="trips/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="tracks/[id]" options={{ title: 'Track' }} />
        <Stack.Screen name="u/[username]" options={{ title: 'Profile' }} />
      </Stack>
    </ThemeProvider>
  );
}
