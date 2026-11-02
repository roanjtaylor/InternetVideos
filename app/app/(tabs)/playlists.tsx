import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { api, Playlist } from '@/lib/api';

export default function PlaylistsScreen() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlaylists((await api.playlists()).playlists);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <View style={styles.center}>
        <Text style={{ color: '#d33' }}>{error}</Text>
        <Pressable onPress={load}>
          <Text style={{ color: '#2f95dc', marginTop: 12 }}>Retry</Text>
        </Pressable>
      </View>
    );
  if (!playlists)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <FlatList
      data={playlists}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id, title: item.title } })}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: '#333' }]} />
          )}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.sub}>{item.itemCount} videos</Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text>No playlists yet. Create one in YouTube and pull to refresh.</Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 12, gap: 12 },
  thumb: { width: 120, height: 68, borderRadius: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, color: '#888', marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
