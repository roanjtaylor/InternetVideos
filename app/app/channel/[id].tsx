import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { PlaylistRow } from '@/components/PlaylistRow';
import { ListSkeleton } from '@/components/Skeleton';
import { VideoList } from '@/components/VideoList';
import { api, Playlist, timeAgo } from '@/lib/api';
import { useLoadingBar } from '@/lib/loading';
import { useSavedPlaylists } from '@/lib/saved';
import { afterSheet, sharePlaylist } from '@/lib/share';
import { useTheme } from '@/lib/theme';

type Tab = 'videos' | 'playlists';
const TABS: { key: Tab; label: string }[] = [
  { key: 'videos', label: 'Videos' },
  { key: 'playlists', label: 'Playlists' },
];

/** A channel: its uploads, or its playlists (which can be saved to your library). */
export default function ChannelScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('videos');
  const load = useCallback((page?: string | null) => api.channel(id, page), [id]);

  const chips = (
    <View style={styles.chips}>
      {TABS.map((o) => {
        const on = o.key === tab;
        return (
          <Pressable
            key={o.key}
            onPress={() => setTab(o.key)}
            style={[styles.chip, { backgroundColor: on ? t.text : t.surface }]}>
            <Text style={[styles.chipText, { color: on ? t.background : t.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: title ?? 'Channel' }} />
      {tab === 'videos' ? (
        <VideoList load={load} emptyText="No uploads yet." header={chips} />
      ) : (
        <ChannelPlaylists channelId={id} header={chips} />
      )}
    </>
  );
}

function ChannelPlaylists({ channelId, header }: { channelId: string; header: React.ReactElement }) {
  const router = useRouter();
  const t = useTheme();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Playlist | null>(null);
  const saved = useSavedPlaylists();
  useLoadingBar(playlists === null && !error);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlaylists(await api.channelPlaylists(channelId));
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, [channelId]);

  useEffect(() => {
    load();
  }, [load]);

  const isSaved = (p: Playlist | null) => !!p && !!saved?.some((s) => s.id === p.id);
  const menuSaved = isSaved(menuFor);

  if (!playlists)
    return (
      <View style={{ flex: 1 }}>
        {header}
        {error ? (
          <Pressable onPress={load} style={styles.center}>
            <Text style={{ color: t.danger, textAlign: 'center' }}>{error}</Text>
            <Text style={{ color: t.link, fontWeight: '600' }}>Retry</Text>
          </Pressable>
        ) : (
          <ListSkeleton layout="compact" />
        )}
      </View>
    );

  return (
    <>
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item }) => (
          <PlaylistRow
            playlist={item}
            subtitle={
              (isSaved(item) ? 'Saved · ' : '') +
              'Playlist' +
              (item.createdAt ? ` · created ${timeAgo(item.createdAt)}` : '')
            }
            onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id, title: item.title } })}
            onMenu={() => setMenuFor(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: t.secondary }}>This channel has no public playlists.</Text>
          </View>
        }
      />
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        onClose={() => setMenuFor(null)}
        actions={[
          {
            key: 'save',
            label: menuSaved ? 'Remove from library' : 'Save to library',
            icon: menuSaved ? 'bookmark' : 'bookmark-outline',
            onPress: () => {
              if (!menuFor) return;
              (menuSaved ? api.unsavePlaylist(menuFor.id) : api.savePlaylist(menuFor)).catch(() => {});
            },
          },
          {
            key: 'share',
            label: 'Share',
            icon: 'arrow-redo-outline',
            onPress: () => menuFor && afterSheet(() => sharePlaylist(menuFor)),
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '500' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
});
