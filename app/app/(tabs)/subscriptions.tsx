import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { VideoList } from '@/components/VideoList';
import { api, Channel, Video } from '@/lib/api';
import { latestByChannel, sortChannels } from '@/lib/channels';
import { useTheme } from '@/lib/theme';

const ACROSS = 5; // avatars visible across the width, like YouTube
const DAY = 86400 * 1000;

type Filter = 'all' | 'today' | 'week';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
];

/**
 * Subscriptions, YouTube style: a strip of the channels you follow ordered
 * by newest activity with "All" at the end, filter chips, then the latest
 * uploads across every channel.
 */
export default function SubscriptionsScreen() {
  const router = useRouter();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - 56) / ACROSS);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [activity, setActivity] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api
      .subscriptions()
      .then((r) => setChannels(r.channels))
      .catch(() => setChannels([]));
  }, []);

  const load = useCallback(async () => (await api.feed()).videos, []);
  const onVideos = useCallback((videos: Video[]) => setActivity(latestByChannel(videos)), []);

  const ordered = useMemo(() => (channels ? sortChannels(channels, 'activity', activity) : null), [channels, activity]);
  const avatars = useMemo(
    () => Object.fromEntries((channels ?? []).map((c) => [c.id, c.thumbnail])),
    [channels],
  );
  const since = filter === 'today' ? Date.now() - DAY : filter === 'week' ? Date.now() - 7 * DAY : 0;
  const filterFn = useCallback(
    (v: Video) => !since || new Date(v.publishedAt).getTime() >= since,
    [since],
  );

  const header = (
    <View>
      <View style={styles.stripRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 8 }}>
          {ordered
            ? ordered.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push({ pathname: '/channel/[id]', params: { id: c.id, title: c.title } })}
                  style={({ pressed }) => [styles.cell, { width: cell }, pressed && { opacity: 0.6 }]}>
                  {c.thumbnail ? (
                    <Image source={{ uri: c.thumbnail }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: t.surfaceHigh }]} />
                  )}
                  <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                    {c.title}
                  </Text>
                </Pressable>
              ))
            : Array.from({ length: ACROSS }, (_, i) => (
                <View key={i} style={[styles.cell, { width: cell }]}>
                  <Skeleton style={styles.avatar} />
                  <Skeleton style={{ height: 10, width: 44, marginTop: 8 }} />
                </View>
              ))}
        </ScrollView>
        <Pressable
          onPress={() => router.push('/channels')}
          hitSlop={8}
          style={({ pressed }) => [styles.all, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.allText, { color: t.link }]}>All</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, { backgroundColor: on ? t.text : t.surface }]}>
              <Text style={[styles.chipText, { color: on ? t.background : t.text }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <VideoList
      load={load}
      layout="card"
      avatars={avatars}
      header={header}
      onVideos={onVideos}
      filter={filterFn}
      queueTitle="Subscriptions"
      emptyText={
        filter === 'all'
          ? 'No uploads from your subscriptions yet. Subscribe in YouTube and pull to refresh.'
          : 'Nothing new in this period.'
      }
    />
  );
}

const styles = StyleSheet.create({
  stripRow: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  cell: { alignItems: 'center', paddingVertical: 6 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  name: { fontSize: 11, marginTop: 6, maxWidth: '100%' },
  all: { width: 48, alignItems: 'center', paddingTop: 24 },
  allText: { fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { height: 32, borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '500' },
});
