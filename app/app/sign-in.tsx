import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { RED } from '@/constants/Colors';
import { GOOGLE_CLIENT_ID, signIn } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function SignInScreen() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.logo}>
        <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 4 }} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>Internet Vids</Text>
      <Text style={[styles.sub, { color: t.secondary }]}>
        Your subscriptions, playlists and search. Nothing recommended, no Shorts, no ads.
      </Text>
      <Pressable onPress={go} disabled={busy} style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in with Google</Text>}
      </Pressable>
      {!GOOGLE_CLIENT_ID && (
        <Text style={[styles.error, { color: t.danger }]}>
          Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in app/.env, then restart the dev server.
        </Text>
      )}
      {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
      <Text style={[styles.note, { color: t.secondary }]}>
        The app talks to YouTube directly from this phone. Your sign-in stays in the iOS Keychain.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  logo: {
    width: 72,
    height: 50,
    borderRadius: 16,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 15, textAlign: 'center', marginBottom: 16, lineHeight: 21 },
  button: {
    backgroundColor: RED,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
    minWidth: 240,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { textAlign: 'center' },
  note: { fontSize: 12, textAlign: 'center', marginTop: 24 },
});
