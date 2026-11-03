import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback } from 'react';

import { VideoList } from '@/components/VideoList';
import { api } from '@/lib/api';

export default function ChannelScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const load = useCallback((page?: string | null) => api.channel(id, page), [id]);
  return (
    <>
      <Stack.Screen options={{ title: title ?? 'Channel' }} />
      <VideoList load={load} queueTitle={title ?? 'Channel'} emptyText="No uploads yet." />
    </>
  );
}
