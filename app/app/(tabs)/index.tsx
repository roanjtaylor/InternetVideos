import React, { useCallback } from 'react';

import { VideoList } from '@/components/VideoList';
import { api } from '@/lib/api';

export default function SubscriptionsScreen() {
  const load = useCallback(async () => (await api.feed()).videos, []);
  return <VideoList load={load} emptyText="No new uploads from your subscriptions." />;
}
