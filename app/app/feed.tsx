import { Stack } from 'expo-router';
import React, { useCallback } from 'react';

import { VideoList } from '@/components/VideoList';
import { api } from '@/lib/api';

export default function FeedScreen() {
  const load = useCallback(async () => (await api.feed()).videos, []);
  return (
    <>
      <Stack.Screen options={{ title: 'Latest uploads' }} />
      <VideoList load={load} emptyText="No new uploads from your subscriptions." />
    </>
  );
}
