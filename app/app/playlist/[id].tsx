import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback } from 'react';

import { VideoList } from '@/components/VideoList';
import { api } from '@/lib/api';

export default function PlaylistScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const load = useCallback((page?: string | null) => api.playlist(id, page), [id]);
  return (
    <>
      <Stack.Screen options={{ title: title ?? 'Playlist' }} />
      <VideoList load={load} emptyText="This playlist is empty." />
    </>
  );
}
