/**
 * Your like/dislike on the open video, shared by the portrait details and the
 * full screen controls so they always agree.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import { api, Rating } from './api';
import { updateVideo } from './player';

let state: { id: string | null; rating: Rating | undefined; busy: boolean } = { id: null, rating: undefined, busy: false };
const listeners = new Set<() => void>();

function set(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useRating(videoId: string | undefined) {
  useEffect(() => {
    if (!videoId || state.id === videoId) return;
    set({ id: videoId, rating: undefined, busy: false });
    api
      .rating(videoId)
      .then((r) => state.id === videoId && set({ rating: r }))
      .catch(() => state.id === videoId && set({ rating: 'none' }));
  }, [videoId]);

  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  return { rating: s.id === videoId ? s.rating : undefined, busy: s.busy };
}

export async function rateVideo(video: { id: string; likeCount?: number }, target: 'like' | 'dislike') {
  if (state.id !== video.id || state.busy || state.rating === undefined) return;
  const prev = state.rating;
  const next: Rating = prev === target ? 'none' : target;
  set({ rating: next, busy: true });
  try {
    if (next === 'like') await api.like(video.id);
    else if (next === 'dislike') await api.dislike(video.id);
    else await api.unlike(video.id);
    if (video.likeCount !== undefined) {
      const delta = (next === 'like' ? 1 : 0) - (prev === 'like' ? 1 : 0);
      if (delta) updateVideo({ likeCount: Math.max(0, video.likeCount + delta) });
    }
  } catch (e: any) {
    if (state.id === video.id) set({ rating: prev });
    Alert.alert('Could not update rating', e.message ?? String(e));
  } finally {
    set({ busy: false });
  }
}
