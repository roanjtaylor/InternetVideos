import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  useColorScheme,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { formatDuration, Page, timeAgo, Video } from '@/lib/api';

export function VideoRow({ video }: { video: Video }) {
  const router = useRouter();
  const scheme = useColorScheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/watch/[id]', params: { id: video.id, title: video.title } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.thumbWrap}>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: '#333' }]} />
        )}
        {!!video.duration && (
          <Text style={styles.duration}>{formatDuration(video.duration)}</Text>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.sub, { color: scheme === 'dark' ? '#aaa' : '#606060' }]} numberOfLines={1}>
          {video.channelTitle} · {timeAgo(video.publishedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

type Props = {
  /** Return one page. A plain Video[] means the whole list; a Page may carry a nextPage token. */
  load: (page?: string | null) => Promise<Video[] | Page>;
  emptyText?: string;
};

function asPage(r: Video[] | Page): Page {
  return Array.isArray(r) ? { videos: r, nextPage: null } : r;
}

export function VideoList({ load, emptyText = 'Nothing here.' }: Props) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    try {
      const page = asPage(await load());
      setVideos(page.videos);
      setNextPage(page.nextPage ?? null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextPage || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = asPage(await load(nextPage));
      setVideos((prev) => {
        const seen = new Set((prev ?? []).map((v) => v.id));
        return [...(prev ?? []), ...page.videos.filter((v) => !seen.has(v.id))];
      });
      setNextPage(page.nextPage ?? null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [load, nextPage]);

  useEffect(() => {
    run();
  }, [run]);

  if (error && !videos) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={run}>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!videos) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <FlatList
      data={videos}
      keyExtractor={(v) => v.id}
      renderItem={({ item }) => <VideoRow video={item} />}
      onEndReached={loadMore}
      onEndReachedThreshold={1.5}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text>{emptyText}</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator />
          </View>
        ) : error ? (
          <Pressable onPress={loadMore} style={styles.footer}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await run();
            setRefreshing(false);
          }}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 12, gap: 12 },
  thumbWrap: { width: 160, height: 90 },
  thumb: { width: 160, height: 90, borderRadius: 8 },
  duration: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 4,
    borderRadius: 3,
    overflow: 'hidden',
  },
  meta: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  footer: { alignItems: 'center', padding: 16 },
  error: { color: '#d33', textAlign: 'center', marginBottom: 12 },
  retry: { color: '#2f95dc', fontSize: 16 },
});
