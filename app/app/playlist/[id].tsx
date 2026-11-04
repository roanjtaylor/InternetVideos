import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { FilterButton, FilterSheet } from '@/components/FilterSheet';
import { VideoList } from '@/components/VideoList';
import { api, Video } from '@/lib/api';

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
          headerRight: () => <FilterButton active={sort !== 'manual'} onPress={() => setSheet(true)} />,
        }}
      />
      <VideoList
        load={load}
        sort={comparator}
        playlistId={id}
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
