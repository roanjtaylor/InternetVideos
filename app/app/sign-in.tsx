import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { GOOGLE_CLIENT_ID, signIn } from '@/lib/auth';

export default function SignInScreen() {
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
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={styles.title}>Videos</Text>
      <Text style={styles.sub}>
        Your subscriptions, playlists and search. Nothing recommended, no Shorts.
      </Text>
      <Pressable onPress={go} disabled={busy} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in with Google</Text>}
      </Pressable>
      {!GOOGLE_CLIENT_ID && (
        <Text style={styles.error}>
          Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in app/.env, then restart the dev server.
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.note}>
        The app talks to YouTube directly from this phone. Your sign-in stays in the iOS Keychain.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  title: { fontSize: 36, fontWeight: '800' },
  sub: { fontSize: 15, textAlign: 'center', color: '#888', marginBottom: 16 },
  button: {
    backgroundColor: '#2f95dc',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#d33', textAlign: 'center' },
  note: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 24 },
});
