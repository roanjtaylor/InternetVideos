/**
 * The one video player's state. The player itself lives in the root layout
 * so it can keep playing (as a mini player) while you browse the tabs.
 */
import { useSyncExternalStore } from 'react';

import type { Video } from './youtube';

export type PlayerMode = 'full' | 'mini';

export type PlayerState = {
  video: Video | null;
  /** The list the video was opened from; "Up next" and autoplay use it. */
  queue: Video[];
  queueTitle: string | null;
  mode: PlayerMode;
  /** Bumped on every open so the player restarts even for the same video. */
  session: number;
};

let state: PlayerState = { video: null, queue: [], queueTitle: null, mode: 'full', session: 0 };
const listeners = new Set<() => void>();

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function openVideo(video: Video, queue: Video[] = [], queueTitle: string | null = null) {
  set({ video, queue, queueTitle, mode: 'full', session: state.session + 1 });
}

export const minimizePlayer = () => set({ mode: 'mini' });
export const expandPlayer = () => set({ mode: 'full' });
export const closePlayer = () => set({ video: null, queue: [], queueTitle: null, mode: 'full' });

/** The video after the current one in the queue, if any. */
export function nextInQueue(): Video | null {
  const { video, queue } = state;
  if (!video) return null;
  const i = queue.findIndex((v) => v.id === video.id);
  return i >= 0 && i + 1 < queue.length ? queue[i + 1] : null;
}

export function playNext(): boolean {
  const next = nextInQueue();
  if (!next) return false;
  set({ video: next, session: state.session + 1 });
  return true;
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
