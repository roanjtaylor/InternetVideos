import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { LoadingBar } from '@/components/LoadingBar';
import { Player } from '@/components/Player';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/lib/auth';
import { lockPortrait } from '@/lib/orientation';
import { closePlayer } from '@/lib/player';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

/** Sends signed-out users to /sign-in and signed-in users away from it. */
function AuthGate({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!signedIn && pathname !== '/sign-in') {
      closePlayer();
      router.replace('/sign-in');
    }
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

  // Portrait everywhere; the player lifts this while a video is open.
  useEffect(() => {
    lockPortrait();
  }, []);

  useEffect(() => {
    if (loaded && auth.ready) SplashScreen.hideAsync();
  }, [loaded, auth.ready]);

  if (!loaded || !auth.ready) return null;

  const dark = colorScheme === 'dark';
  const c = dark ? Colors.dark : Colors.light;
  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      primary: c.text,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.divider,
      notification: c.red,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <AuthGate signedIn={auth.signedIn} />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: c.text,
            headerBackTitle: 'Back',
            headerTitleStyle: { fontSize: 17, fontWeight: '600' },
            headerStyle: { backgroundColor: c.background },
            contentStyle: { backgroundColor: c.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="save/[id]" options={{ presentation: 'modal', title: 'Save video to…' }} />
          <Stack.Screen name="playlist/[id]" />
          <Stack.Screen name="channel/[id]" />
          <Stack.Screen name="channels" options={{ title: 'All subscriptions' }} />
          <Stack.Screen name="history" options={{ title: 'History' }} />
        </Stack>
        <LoadingBar />
        <Player />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
