import { useEffect } from 'react';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useNetInfo } from '@react-native-community/netinfo';
import { AuthProvider } from '@/context/AuthContext';
import { colors } from '@/theme';
import BackgroundBubbles from '@/components/ui/BackgroundBubbles';
import OfflineBanner from '@/components/ui/OfflineBanner';
import AlertWatcher from '@/features/alerts/AlertWatcher';
import { setFirestoreOfflineMode } from '@/lib/firebase';
import { flushOfflineQueue } from '@/lib/offlineQueue';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Syne_700Bold, Syne_800ExtraBold } from '@expo-google-fonts/syne';

// inside RootLayout:

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Syne_700Bold,
    Syne_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  const segments = useSegments() as string[];
  const netInfo = useNetInfo();
  const isWelcome = segments.includes('welcome');
  const isEstateChoice = segments.includes('estate-choice');
  const isAuth = segments.includes('(auth)') || segments.includes('auth');
  const isAdminHome = (segments as string[]).includes('(admin)') && (segments as string[]).includes('home');

  useEffect(() => {
    const isOffline = netInfo?.isConnected === false;
    void setFirestoreOfflineMode(isOffline);
    if (!isOffline) {
      void flushOfflineQueue();
    }
  }, [netInfo?.isConnected]);

  if (!loaded && !error) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />

      <Stack
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="(auth)/auth"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>

      <OfflineBanner />
      <AlertWatcher />

      {/* Render background bubbles on all routes except welcome, estate choice, and auth. Placed after Stack so bubbles appear above screen backgrounds (most screens use their own full-bleed backgrounds). */}
      {!isWelcome && !isEstateChoice && !isAuth && !isAdminHome && (
        <BackgroundBubbles />
      )}
    </AuthProvider>
  );
}