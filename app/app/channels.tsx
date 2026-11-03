import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { Skeleton } from '@/components/Skeleton';
import { api, Channel, timeAgo } from '@/lib/api';
import { ChannelSort, latestByChannel, sortChannels } from '@/lib/channels';
import { useLoadingBar } from '@/lib/loading';
import { useTheme } from '@/lib/theme';

const SORT_LABEL: Record<ChannelSort, string> = { activity: 'New activity', alpha: 'A to Z' };

/** Every subscription as a list, by new activity or A to Z. */
export default function ChannelsScreen() {
  const router = useRouter();
  const t = useTheme();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [activity, setActivity] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<ChannelSort>('activity');
  const [sortSheet, setSortSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLoadingBar(channels === null && !error);

  useEffect(() => {
    api
      .subscriptions()
      .then((r) => setChannels(r.channels))
      .catch((e) => setError(e.message ?? String(e)));
    api
      .feed()
      .then((r) => setActivity(latestByChannel(r.videos)))
      .catch(() => {});
  }, []);

  const ordered = useMemo(() => (channels ? sortChannels(channels, sort, activity) : null), [channels, sort, activity]);

  const header = (
    <Pressable onPress={() => setSortSheet(true)} style={styles.sortRow}>
      <Text style={[styles.sortLabel, { color: t.secondary }]}>Sort by</Text>
      <Text style={[styles.sortValue, { color: t.text }]}>{SORT_LABEL[sort]} ▾</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'All subscriptions' }} />
      {error ? (
        <View style={styles.center}>
          <Text style={{ color: t.danger }}>{error}</Text>
        </View>
      ) : !ordered ? (
        <View>
          {header}
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={styles.row}>
              <Skeleton style={styles.avatar} />
              <Skeleton style={{ height: 14, width: '50%' }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/channel/[id]', params: { id: item.id, title: item.title } })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: t.surfaceHigh }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!!activity[item.id] && (
                  <Text style={[styles.sub, { color: t.secondary }]}>Uploaded {timeAgo(activity[item.id])}</Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
      <ActionSheet
        visible={sortSheet}
        title="Sort by"
        onClose={() => setSortSheet(false)}
        actions={[
          {
            key: 'activity',
            label: 'New activity',
            icon: 'flash-outline',
            selected: sort === 'activity',
            onPress: () => setSort('activity'),
          },
          {
            key: 'alpha',
            label: 'A to Z',
            icon: 'text-outline',
            selected: sort === 'alpha',
            onPress: () => setSort('alpha'),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  sortLabel: { fontSize: 14 },
  sortValue: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  name: { fontSize: 15, fontWeight: '500' },
  sub: { fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
