import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActionSheet, SheetAction } from '@/components/ActionSheet';
import { ListSkeleton } from '@/components/Skeleton';
import { api, formatDuration, Page, timeAgo, Video } from '@/lib/api';
import { useLoadingBar } from '@/lib/loading';
import { openVideo } from '@/lib/player';
import { useTheme } from '@/lib/theme';

export type RowLayout = 'compact' | 'card';

type RowProps = {
  video: Video;
  layout?: RowLayout;
  /** Channel avatar, shown on cards when known. */
  avatar?: string | null;
  /** When set, the menu offers "Remove from playlist". */
  playlistId?: string;
  playlistTitle?: string;
  queue?: Video[];
  queueTitle?: string | null;
  onRemoved?: (video: Video) => void;
  /** Highlighted (the one currently playing in an "Up next" list). */
  active?: boolean;
};

export function VideoRow({
  video,
  layout = 'compact',
  avatar,
  playlistId,
  playlistTitle,
  queue,
  queueTitle,
  onRemoved,
  active,
}: RowProps) {
  const router = useRouter();
  const t = useTheme();
  const [menu, setMenu] = useState(false);

  const remove = () => {
    if (!playlistId) return;
    Alert.alert(`Remove from ${playlistTitle ?? 'playlist'}?`, video.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeFromPlaylist(playlistId, video);
            onRemoved?.(video);
          } catch (e: any) {
            Alert.alert('Could not remove', e.message ?? String(e));
          }
        },
      },
    ]);
  };

  const actions: SheetAction[] = [
    {
      key: 'save',
      label: 'Save to playlist',
      icon: 'bookmark-outline',
      onPress: () => router.push({ pathname: '/save/[id]', params: { id: video.id, title: video.title } }),
    },
    ...(playlistId
      ? [
          {
            key: 'remove',
            label: `Remove from ${playlistTitle ?? 'playlist'}`,
            icon: 'trash-outline' as const,
            destructive: true,
            onPress: remove,
          },
        ]
      : []),
    {
      key: 'channel',
      label: 'Go to channel',
      icon: 'person-circle-outline',
      onPress: () =>
        router.push({ pathname: '/channel/[id]', params: { id: video.channelId, title: video.channelTitle } }),
    },
    {
      key: 'open',
      label: 'Open in YouTube',
      icon: 'open-outline',
      onPress: () => Linking.openURL(`https://www.youtube.com/watch?v=${video.id}`),
    },
  ];

  const kebab = (
    <Pressable
      hitSlop={10}
      onPress={() => setMenu(true)}
      style={({ pressed }) => [styles.kebab, pressed && { opacity: 0.5 }]}>
      <Ionicons name="ellipsis-vertical" size={18} color={t.text} />
    </Pressable>
  );

  const thumb = (style: any) =>
    video.thumbnail ? (
      <Image source={{ uri: video.thumbnail }} style={style} />
    ) : (
      <View style={[style, { backgroundColor: t.surfaceHigh }]} />
    );

  const duration = !!video.duration && <Text style={styles.duration}>{formatDuration(video.duration)}</Text>;

  const sheet = (
    <ActionSheet visible={menu} title={video.title} actions={actions} onClose={() => setMenu(false)} />
  );

  const open = () => openVideo(video, queue, queueTitle ?? null);

  if (layout === 'card') {
    return (
      <View style={styles.card}>
        <Pressable onPress={open} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <View style={styles.cardThumbWrap}>
            {thumb(styles.cardThumb)}
            {duration}
          </View>
        </Pressable>
        <View style={styles.cardMeta}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: t.surfaceHigh }]} />
          )}
          <Pressable onPress={open} style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: t.text }]} numberOfLines={2}>
              {video.title}
            </Text>
            <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
              {video.channelTitle} · {timeAgo(video.publishedAt)}
            </Text>
          </Pressable>
          {kebab}
        </View>
        {sheet}
      </View>
    );
  }

  return (
    <View style={[styles.row, active && { backgroundColor: t.surface }]}>
      <Pressable onPress={open} style={({ pressed }) => [styles.thumbWrap, pressed && { opacity: 0.8 }]}>
        {thumb(styles.thumb)}
        {duration}
      </Pressable>
      <Pressable onPress={open} style={styles.meta}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
          {video.channelTitle}
        </Text>
        <Text style={[styles.sub, { color: t.secondary, marginTop: 0 }]} numberOfLines={1}>
          {timeAgo(video.publishedAt)}
        </Text>
      </Pressable>
      {kebab}
      {sheet}
    </View>
  );
}

type Props = {
  /** Return one page. A plain Video[] means the whole list; a Page may carry a nextPage token. */
  load: (page?: string | null) => Promise<Video[] | Page>;
  emptyText?: string;
  layout?: RowLayout;
  avatars?: Record<string, string | null>;
  playlistId?: string;
  playlistTitle?: string;
  queueTitle?: string | null;
  header?: React.ReactElement | null;
  /** Called with the full list whenever it changes (the subscriptions tab orders its channels by it). */
  onVideos?: (videos: Video[]) => void;
  filter?: (v: Video) => boolean;
};

function asPage(r: Video[] | Page): Page {
  return Array.isArray(r) ? { videos: r, nextPage: null } : r;
}

export function VideoList({
  load,
  emptyText = 'Nothing here.',
  layout = 'compact',
  avatars,
  playlistId,
  playlistTitle,
  queueTitle,
  header,
  onVideos,
  filter,
}: Props) {
  const t = useTheme();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  useLoadingBar(videos === null && !error);

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

  useEffect(() => {
    if (videos) onVideos?.(videos);
  }, [videos, onVideos]);

  if (error && !videos) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={styles.center}>
          <Text style={[styles.error, { color: t.danger }]}>{error}</Text>
          <Pressable onPress={run} style={[styles.retryBtn, { backgroundColor: t.text }]}>
            <Text style={[styles.retry, { color: t.background }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!videos) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <ListSkeleton layout={layout} />
      </View>
    );
  }
  const shown = filter ? videos.filter(filter) : videos;
  return (
    <FlatList
      data={shown}
      keyExtractor={(v) => v.playlistItemId ?? v.id}
      renderItem={({ item }) => (
        <VideoRow
          video={item}
          layout={layout}
          avatar={avatars?.[item.channelId]}
          playlistId={playlistId}
          playlistTitle={playlistTitle}
          queue={shown}
          queueTitle={queueTitle}
          onRemoved={(v) => setVideos((prev) => (prev ?? []).filter((x) => x !== v))}
        />
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={1.5}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: 80 }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={{ color: t.secondary }}>{emptyText}</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator color={t.secondary} />
          </View>
        ) : error ? (
          <Pressable onPress={loadMore} style={styles.footer}>
            <Text style={[styles.error, { color: t.danger }]}>{error}</Text>
            <Text style={[styles.retry, { color: t.link }]}>Retry</Text>
          </Pressable>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.secondary}
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
  row: { flexDirection: 'row', paddingLeft: 12, paddingVertical: 8, gap: 12 },
  thumbWrap: { width: 160, height: 90 },
  thumb: { width: 160, height: 90, borderRadius: 8 },
  duration: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  meta: { flex: 1, paddingTop: 2 },
  title: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  sub: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  kebab: { width: 40, alignItems: 'center', paddingTop: 2 },
  card: { marginBottom: 12 },
  cardThumbWrap: { width: '100%', aspectRatio: 16 / 9 },
  cardThumb: { width: '100%', height: '100%' },
  cardMeta: { flexDirection: 'row', paddingLeft: 12, paddingTop: 12, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '500', lineHeight: 21 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  footer: { alignItems: 'center', padding: 16 },
  error: { textAlign: 'center', marginBottom: 12 },
  retry: { fontSize: 14, fontWeight: '600' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
});
