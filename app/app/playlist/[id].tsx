import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback } from 'react';

import { VideoList } from '@/components/VideoList';
import { api } from '@/lib/api';

export default function PlaylistScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const load = useCallback(async () => (await api.playlist(id)).videos, [id]);
  return (
    <>
      <Stack.Screen options={{ title: title ?? 'Playlist' }} />
      <VideoList load={load} emptyText="This playlist is empty." />
    </>
  );
}
