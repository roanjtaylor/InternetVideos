import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, TextInput, useColorScheme } from 'react-native';

import { Text, View } from '@/components/Themed';
import { api, Playlist } from '@/lib/api';

/** "Save to…" sheet for one video: like it, add to a playlist, or make a new one. */
export default function SaveScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // playlist id in flight
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlaylists((await api.playlists()).playlists.filter((p) => p.id !== 'LL'));
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const done = (message: string) => {
    Alert.alert(message, undefined, [{ text: 'OK', onPress: () => router.back() }]);
  };

  const act = async (key: string, fn: () => Promise<void>, okMessage: string) => {
    setBusy(key);
    try {
      await fn();
      done(okMessage);
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const createAndAdd = async () => {
    const t = newTitle.trim();
    if (!t) return;
    await act(
      'new',
      async () => {
        const p = await api.createPlaylist(t);
        await api.addToPlaylist(p.id, id);
      },
      `Created "${t}" and saved`,
    );
  };

  const dark = scheme === 'dark';
  const subColor = dark ? '#aaa' : '#606060';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Save to…', presentation: 'modal' }} />
      <Text style={[styles.videoTitle, { color: subColor }]} numberOfLines={2}>
        {title}
      </Text>

      <Pressable
        onPress={() => act('like', () => api.like(id), 'Liked')}
        disabled={!!busy}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
        <FontAwesome name="thumbs-o-up" size={20} color="#2f95dc" style={styles.icon} />
        <Text style={styles.rowText}>Like</Text>
        {busy === 'like' && <ActivityIndicator />}
      </Pressable>

      <View style={styles.row}>
        <FontAwesome name="plus" size={20} color="#2f95dc" style={styles.icon} />
        <TextInput
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={createAndAdd}
          placeholder="New playlist name"
          placeholderTextColor="#888"
          returnKeyType="done"
          style={[styles.input, dark ? { backgroundColor: '#222', color: '#fff' } : { backgroundColor: '#eee', color: '#000' }]}
        />
        {busy === 'new' ? (
          <ActivityIndicator />
        ) : (
          <Pressable onPress={createAndAdd} disabled={!newTitle.trim()}>
            <Text style={[styles.create, !newTitle.trim() && { opacity: 0.4 }]}>Create</Text>
          </Pressable>
        )}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={{ color: '#d33' }}>{error}</Text>
          <Pressable onPress={load}>
            <Text style={{ color: '#2f95dc', marginTop: 12 }}>Retry</Text>
          </Pressable>
        </View>
      ) : !playlists ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => act(item.id, () => api.addToPlaylist(item.id, id), `Saved to "${item.title}"`)}
              disabled={!!busy}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
              <FontAwesome name="list" size={18} color={subColor} style={styles.icon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ color: subColor, fontSize: 12 }}>{item.itemCount} videos</Text>
              </View>
              {busy === item.id && <ActivityIndicator />}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: subColor }}>No playlists yet. Create one above.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  videoTitle: { fontSize: 13, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  icon: { width: 24, textAlign: 'center' },
  rowText: { fontSize: 16, flex: 1 },
  input: { flex: 1, padding: 10, borderRadius: 8, fontSize: 15 },
  create: { color: '#2f95dc', fontSize: 16, fontWeight: '600' },
  center: { padding: 24, alignItems: 'center' },
});
