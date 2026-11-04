import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { FilterButton, FilterSheet } from '@/components/FilterSheet';
import { Skeleton } from '@/components/Skeleton';
import { api, Playlist, PlaylistPrivacy, timeAgo } from '@/lib/api';
import { useLoadingBar } from '@/lib/loading';
import { pinnedPlaylists, togglePin, usePins } from '@/lib/pins';
import { useTheme } from '@/lib/theme';

type Sort = 'updated' | 'created' | 'alpha' | 'count';
type Privacy = 'all' | PlaylistPrivacy;
type Filter = { sort: Sort; privacy: Privacy };

const DEFAULT_FILTER: Filter = { sort: 'updated', privacy: 'all' };
const FILTER_KEY = 'playlist-filter';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Recently created' },
  { key: 'alpha', label: 'A to Z' },
  { key: 'count', label: 'Most videos' },
];
const PRIVACIES: { key: Privacy; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'private', label: 'Private' },
  { key: 'unlisted', label: 'Unlisted' },
  { key: 'public', label: 'Public' },
];

const PRIVACY_LABEL: Record<PlaylistPrivacy, string> = { private: 'Private', unlisted: 'Unlisted', public: 'Public' };

function arrange(playlists: Playlist[], f: Filter): Playlist[] {
  const shown = f.privacy === 'all' ? playlists : playlists.filter((p) => p.privacy === f.privacy);
  const byDate = (pick: (p: Playlist) => string | null | undefined) => (a: Playlist, b: Playlist) =>
    (pick(b) ?? '').localeCompare(pick(a) ?? '');
  switch (f.sort) {
    case 'alpha':
      return [...shown].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    case 'count':
      return [...shown].sort((a, b) => b.itemCount - a.itemCount);
    case 'created':
      return [...shown].sort(byDate((p) => p.createdAt ?? p.lastAdded));
    default:
      return [...shown].sort(byDate((p) => p.lastAdded));
  }
}

/**
 * Playlists: your own plus Liked videos, with a sort and privacy filter in
 * the header. The kebab on a row pins it to Home.
 */
export default function PlaylistsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const t = useTheme();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [sheet, setSheet] = useState(false);
  const [menuFor, setMenuFor] = useState<Playlist | null>(null);
  const pins = usePins();
  useLoadingBar(playlists === null && !error);

  useEffect(() => {
    AsyncStorage.getItem(FILTER_KEY)
      .then((raw) => raw && setFilter({ ...DEFAULT_FILTER, ...JSON.parse(raw) }))
      .catch(() => {});
  }, []);

  const applyFilter = (patch: Partial<Filter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    AsyncStorage.setItem(FILTER_KEY, JSON.stringify(next)).catch(() => {});
  };

  const filtered = filter.sort !== DEFAULT_FILTER.sort || filter.privacy !== DEFAULT_FILTER.privacy;

  // The filter button sits at the right of the title banner, as in YouTube.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FilterButton active={filtered} onPress={() => setSheet(true)} />,
    });
  }, [navigation, filtered]);

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

  const shown = useMemo(() => (playlists ? arrange(playlists, filter) : null), [playlists, filter]);
  const pinnedIds = useMemo(
    () => new Set(pinnedPlaylists(playlists ?? [], pins).map((p) => p.id)),
    [playlists, pins],
  );

  if (error)
    return (
      <View style={styles.center}>
        <Text style={{ color: t.danger, textAlign: 'center' }}>{error}</Text>
        <Pressable onPress={load} style={[styles.retryBtn, { backgroundColor: t.text }]}>
          <Text style={{ color: t.background, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </View>
    );
  if (!shown || !playlists)
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

  const sortLabel = SORTS.find((s) => s.key === filter.sort)!.label;
  const privacyLabel = PRIVACIES.find((p) => p.key === filter.privacy)!.label;
  const menuPinned = !!menuFor && pinnedIds.has(menuFor.id);

  return (
    <>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          filtered ? (
            <Pressable onPress={() => setSheet(true)} style={styles.summary}>
              <Text style={[styles.summaryText, { color: t.secondary }]}>
                {sortLabel}
                {filter.privacy !== 'all' ? ` · ${privacyLabel}` : ''}
              </Text>
              <Pressable hitSlop={8} onPress={() => applyFilter(DEFAULT_FILTER)}>
                <Text style={[styles.summaryText, { color: t.link }]}>Reset</Text>
              </Pressable>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const pinned = pinnedIds.has(item.id);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id, title: item.title } })}
              onLongPress={() => setMenuFor(item)}
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
                <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
                  {pinned ? 'Pinned to Home · ' : ''}
                  {PRIVACY_LABEL[item.privacy]}
                  {item.id !== 'LL' ? ' playlist' : ''}
                  {item.lastAdded ? ` · updated ${timeAgo(item.lastAdded)}` : ''}
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => setMenuFor(item)}
                style={({ pressed }) => [styles.kebab, pressed && { opacity: 0.5 }]}>
                <Ionicons name="ellipsis-vertical" size={18} color={t.text} />
              </Pressable>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: t.secondary }}>
              {playlists.length === 0
                ? 'No playlists yet. Save a video to create one.'
                : `No ${privacyLabel.toLowerCase()} playlists.`}
            </Text>
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
      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        groups={[
          { title: 'Sort by', value: filter.sort, options: SORTS, onChange: (sort: Sort) => applyFilter({ sort }) },
          {
            title: 'Privacy',
            value: filter.privacy,
            options: PRIVACIES,
            onChange: (privacy: Privacy) => applyFilter({ privacy }),
          },
        ]}
      />
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        onClose={() => setMenuFor(null)}
        actions={[
          {
            key: 'pin',
            label: menuPinned ? 'Unpin from Home' : 'Pin to Home',
            icon: menuPinned ? 'pin' : 'pin-outline',
            onPress: () => menuFor && togglePin(menuFor.id, playlists),
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingLeft: 12, paddingVertical: 8, gap: 12 },
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
  kebab: { width: 40, alignItems: 'center', paddingTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  summaryText: { fontSize: 13, fontWeight: '500' },
});
