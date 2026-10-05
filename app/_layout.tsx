import { useEffect } from 'react';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '@/context/AuthContext';
import { colors } from '@/theme';
import BackgroundBubbles from '@/components/ui/BackgroundBubbles';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

// inside RootLayout:

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
const [loaded, error] = useFonts({
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
});


  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  const segments = useSegments();
  const isWelcome = segments.includes('welcome');
  const isEstateChoice = segments.includes('estate-choice');
  const isAuth = segments.includes('(auth)') || segments.includes('auth');

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

      {/* Render background bubbles on all routes except welcome, estate choice, and auth. Placed after Stack so bubbles appear above screen backgrounds (most screens use their own full-bleed backgrounds). */}
      {!isWelcome && !isEstateChoice && !isAuth && (
        <BackgroundBubbles />
      )}
    </AuthProvider>
  );
}