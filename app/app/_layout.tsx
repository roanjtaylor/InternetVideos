import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/lib/auth';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();

/** Sends signed-out users to /sign-in and signed-in users away from it. */
function AuthGate({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!signedIn && pathname !== '/sign-in') router.replace('/sign-in');
    if (signedIn && pathname === '/sign-in') router.replace('/');
  }, [signedIn, pathname, router]);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ ...FontAwesome.font });
  const colorScheme = useColorScheme();
  const auth = useAuth();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && auth.ready) SplashScreen.hideAsync();
  }, [loaded, auth.ready]);

  if (!loaded || !auth.ready) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthGate signedIn={auth.signedIn} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="save/[id]" options={{ presentation: 'modal', title: 'Save to…' }} />
        <Stack.Screen name="watch/[id]" />
        <Stack.Screen name="playlist/[id]" />
        <Stack.Screen name="feed" options={{ title: 'Latest uploads' }} />
        <Stack.Screen name="channel/[id]" />
      </Stack>
    </ThemeProvider>
  );
}
