import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { api, Playlist } from '@/lib/api';
import { useTheme } from '@/lib/theme';

/** "Save video to…" sheet: like it, add to a playlist, or make a new one. */
export default function SaveScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const t = useTheme();
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
    const name = newTitle.trim();
    if (!name) return;
    await act(
      'new',
      async () => {
        const p = await api.createPlaylist(name);
        await api.addToPlaylist(p.id, id);
      },
      `Created "${name}" and saved`,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Save video to…', presentation: 'modal' }} />
      <Text style={[styles.videoTitle, { color: t.secondary }]} numberOfLines={2}>
        {title}
      </Text>

      <Pressable
        onPress={() => act('like', () => api.like(id), 'Liked')}
        disabled={!!busy}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
        <Ionicons name="thumbs-up-outline" size={24} color={t.text} style={styles.icon} />
        <Text style={[styles.rowText, { color: t.text }]}>Liked videos</Text>
        {busy === 'like' && <ActivityIndicator color={t.secondary} />}
      </Pressable>

      <View style={styles.row}>
        <Ionicons name="add" size={24} color={t.text} style={styles.icon} />
        <TextInput
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={createAndAdd}
          placeholder="New playlist"
          placeholderTextColor={t.secondary}
          returnKeyType="done"
          style={[styles.input, { backgroundColor: t.surface, color: t.text }]}
        />
        {busy === 'new' ? (
          <ActivityIndicator color={t.secondary} />
        ) : (
          <Pressable onPress={createAndAdd} disabled={!newTitle.trim()}>
            <Text style={[styles.create, { color: t.link }, !newTitle.trim() && { opacity: 0.4 }]}>Create</Text>
          </Pressable>
        )}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={{ color: t.danger }}>{error}</Text>
          <Pressable onPress={load}>
            <Text style={{ color: t.link, marginTop: 12 }}>Retry</Text>
          </Pressable>
        </View>
      ) : !playlists ? (
        <View>
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} style={styles.row}>
              <Skeleton style={{ width: 24, height: 24, borderRadius: 4 }} />
              <Skeleton style={{ height: 14, width: '55%' }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => act(item.id, () => api.addToPlaylist(item.id, id), `Saved to "${item.title}"`)}
              disabled={!!busy}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
              <Ionicons name="list" size={24} color={t.text} style={styles.icon} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: t.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ color: t.secondary, fontSize: 12 }}>{item.itemCount} videos</Text>
              </View>
              {busy === item.id && <ActivityIndicator color={t.secondary} />}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: t.secondary }}>No playlists yet. Create one above.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  videoTitle: { fontSize: 13, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  icon: { width: 28, textAlign: 'center' },
  rowText: { fontSize: 16, flex: 1 },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, fontSize: 15 },
  create: { fontSize: 15, fontWeight: '600' },
  center: { padding: 24, alignItems: 'center' },
});
