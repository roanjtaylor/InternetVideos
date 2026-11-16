import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { FilterButton, FilterSheet } from '@/components/FilterSheet';
import { VideoList } from '@/components/VideoList';
import { api, Video } from '@/lib/api';
import { useSavedPlaylists } from '@/lib/saved';
import { sharePlaylist } from '@/lib/share';
import { useTheme } from '@/lib/theme';

/** YouTube's playlist sort options, plus length since the app knows durations. */
type Sort = 'manual' | 'added-new' | 'added-old' | 'published-new' | 'published-old' | 'popular' | 'longest' | 'shortest';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'manual', label: 'Playlist order' },
  { key: 'added-new', label: 'Date added (newest)' },
  { key: 'added-old', label: 'Date added (oldest)' },
  { key: 'published-new', label: 'Date published (newest)' },
  { key: 'published-old', label: 'Date published (oldest)' },
  { key: 'popular', label: 'Most popular' },
  { key: 'longest', label: 'Longest' },
  { key: 'shortest', label: 'Shortest' },
];

const byString = (pick: (v: Video) => string | undefined, desc: boolean) => (a: Video, b: Video) => {
  const r = (pick(a) ?? '').localeCompare(pick(b) ?? '');
  return desc ? -r : r;
};
const byNumber = (pick: (v: Video) => number | undefined, desc: boolean) => (a: Video, b: Video) => {
  const r = (pick(a) ?? 0) - (pick(b) ?? 0);
  return desc ? -r : r;
};

const COMPARATORS: Record<Exclude<Sort, 'manual'>, (a: Video, b: Video) => number> = {
  'added-new': byString((v) => v.addedAt, true),
  'added-old': byString((v) => v.addedAt, false),
  'published-new': byString((v) => v.publishedAt, true),
  'published-old': byString((v) => v.publishedAt, false),
  popular: byNumber((v) => v.viewCount, true),
  longest: byNumber((v) => v.duration, true),
  shortest: byNumber((v) => v.duration, false),
};

export default function PlaylistScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [sort, setSort] = useState<Sort>('manual');
  const [sheet, setSheet] = useState(false);
  const key = `playlist-sort:${id}`;
  const t = useTheme();

  // Only your own playlists can be edited; anyone else's can be saved to the library instead.
  const [owned, setOwned] = useState<boolean | null>(id === 'LL' ? true : null);
  useEffect(() => {
    let alive = true;
    api
      .ownsPlaylist(id)
      .then((o) => alive && setOwned(o))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  const isSaved = !!useSavedPlaylists()?.some((p) => p.id === id);
  const [saving, setSaving] = useState(false);
  const toggleSaved = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (isSaved) await api.unsavePlaylist(id);
      else await api.savePlaylist(id);
    } catch (e: any) {
      Alert.alert('Could not save playlist', e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => raw && setSort(raw as Sort))
      .catch(() => {});
  }, [key]);

  const choose = (s: Sort) => {
    setSort(s);
    AsyncStorage.setItem(key, s).catch(() => {});
  };

  const load = useCallback((page?: string | null) => api.playlist(id, page), [id]);
  const comparator = useMemo(() => (sort === 'manual' ? undefined : COMPARATORS[sort]), [sort]);

  return (
    <>
      <Stack.Screen
        options={{
          title: title ?? 'Playlist',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {id !== 'LL' && (
                <Pressable
                  hitSlop={8}
                  accessibilityLabel="Share playlist"
                  onPress={() => sharePlaylist({ id, title })}
                  style={({ pressed }) => [{ paddingLeft: 16, paddingVertical: 6 }, pressed && { opacity: 0.5 }]}>
                  <Ionicons name="arrow-redo-outline" size={24} color={t.text} />
                </Pressable>
              )}
              {owned === false && (
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={isSaved ? 'Remove playlist from library' : 'Save playlist to library'}
                  onPress={toggleSaved}
                  style={({ pressed }) => [
                    { paddingLeft: 16, paddingVertical: 6 },
                    (pressed || saving) && { opacity: 0.5 },
                  ]}>
                  <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={24} color={t.text} />
                </Pressable>
              )}
              <FilterButton active={sort !== 'manual'} onPress={() => setSheet(true)} />
            </View>
          ),
        }}
      />
      <VideoList
        load={load}
        sort={comparator}
        playlistId={owned ? id : undefined}
        playlistTitle={title ?? 'playlist'}
        emptyText="This playlist is empty."
      />
      <FilterSheet
        visible={sheet}
        title="Sort"
        onClose={() => setSheet(false)}
        groups={[{ title: 'Sort by', value: sort, options: SORTS, onChange: choose }]}
      />
    </>
  );
}
