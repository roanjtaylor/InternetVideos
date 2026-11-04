/**
 * The one video player's state. The player itself lives in the root layout
 * so it can keep playing (as a mini player) while you browse the tabs.
 */
import { useSyncExternalStore } from 'react';

import { recordWatch, resumePosition } from './history';
import { allowRotation } from './orientation';
import type { Video } from './youtube';

export type PlayerMode = 'full' | 'mini';

export type PlayerState = {
  video: Video | null;
  mode: PlayerMode;
  /** Bumped on every open so the player restarts even for the same video. */
  session: number;
  /** What we asked the embed to do; the embed's own state changes feed back here. */
  playing: boolean;
  /** Seconds to start from: where you left this video last time. */
  resumeAt: number;
};

let state: PlayerState = { video: null, mode: 'full', session: 0, playing: true, resumeAt: 0 };
const listeners = new Set<() => void>();

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function openVideo(video: Video) {
  set({ video, mode: 'full', session: state.session + 1, playing: true, resumeAt: resumePosition(video.id) });
  recordWatch(video);
  // Let the screen follow the phone right away, before the player has mounted.
  allowRotation();
}

/** Merge freshly fetched details (views, likes, description) into the open video. */
export function updateVideo(patch: Partial<Video>) {
  if (!state.video) return;
  set({ video: { ...state.video, ...patch, id: state.video.id } });
}

export const minimizePlayer = () => set({ mode: 'mini' });
export const expandPlayer = () => {
  set({ mode: 'full' });
  allowRotation();
};
export const closePlayer = () => set({ video: null, mode: 'full', playing: true });
export const setPlaying = (playing: boolean) => {
  if (state.playing !== playing) set({ playing });
};
export const togglePlaying = () => set({ playing: !state.playing });

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
