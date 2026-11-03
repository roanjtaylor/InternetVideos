import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { api, Playlist, timeAgo } from '@/lib/api';
import { useLoadingBar } from '@/lib/loading';
import { useTheme } from '@/lib/theme';

/** Home: your playlists, newest addition first. Liked videos is one of them. */
export default function PlaylistsScreen() {
  const router = useRouter();
  const t = useTheme();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useLoadingBar(playlists === null && !error);

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
        <Text style={{ color: t.danger, textAlign: 'center' }}>{error}</Text>
        <Pressable onPress={load} style={[styles.retryBtn, { backgroundColor: t.text }]}>
          <Text style={{ color: t.background, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </View>
    );
  if (!playlists)
    return (
      <View style={{ paddingTop: 4 }}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={styles.row}>
            <Skeleton style={styles.thumb} />
            <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
              <Skeleton style={{ height: 14, width: '70%' }} />
              <Skeleton style={{ height: 12, width: '40%' }} />
            </View>
          </View>
        ))}
      </View>
    );

  return (
    <FlatList
      data={playlists}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ paddingBottom: 80 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id, title: item.title } })}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
          <View style={styles.thumbWrap}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: t.surfaceHigh }]} />
            )}
            <View style={styles.countBadge}>
              <Ionicons name={item.id === 'LL' ? 'thumbs-up' : 'list'} size={12} color="#fff" />
              <Text style={styles.countText}>{item.itemCount}</Text>
            </View>
          </View>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.sub, { color: t.secondary }]}>
              {item.id === 'LL' ? 'Private' : 'Playlist'}
              {item.lastAdded ? ` · updated ${timeAgo(item.lastAdded)}` : ''}
            </Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={{ color: t.secondary }}>No playlists yet. Save a video to create one.</Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.secondary}
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
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 12 },
  thumbWrap: { width: 160, height: 90 },
  thumb: { width: 160, height: 90, borderRadius: 8 },
  countBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    top: 0,
    width: 56,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
  sub: { fontSize: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
});
