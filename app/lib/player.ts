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

// ---- Playback: what the embed is doing right now ------------------------------
// Kept apart from the state above because it changes several times a second,
// and only the controls should re-render for it.

export type PlaybackStatus = 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export type Playback = {
  /** Seconds. */
  time: number;
  duration: number;
  /** 0..1 of the video downloaded. */
  buffered: number;
  status: PlaybackStatus;
  rate: number;
};

let playback: Playback = { time: 0, duration: 0, buffered: 0, status: 'loading', rate: 1 };
const playbackListeners = new Set<() => void>();
/** After a seek, ignore the embed's stale times until it reports the new position. */
let seekGuard: { target: number; until: number } | null = null;

export function setPlayback(patch: Partial<Playback>) {
  playback = { ...playback, ...patch };
  playbackListeners.forEach((l) => l());
}

export const getPlayback = () => playback;

/** A new video is loading: start the clock again (the speed carries over, as the embed's does). */
export function resetPlayback(time = 0, duration = 0) {
  seekGuard = null;
  setPlayback({ time, duration, buffered: 0, status: 'loading' });
}

/** The embed's regular report of where it is. */
export function playbackTick(time: number, duration: number, buffered: number) {
  if (seekGuard) {
    if (Date.now() < seekGuard.until && Math.abs(time - seekGuard.target) > 2) time = playback.time;
    else seekGuard = null;
  }
  setPlayback({ time, duration: duration || playback.duration, buffered });
}

/** We asked for a seek: show the new position at once rather than when the embed catches up. */
export function playbackSeek(target: number) {
  seekGuard = { target, until: Date.now() + 1500 };
  setPlayback({ time: target });
}

export function usePlayback(): Playback {
  return useSyncExternalStore(
    (l) => {
      playbackListeners.add(l);
      return () => playbackListeners.delete(l);
    },
    () => playback,
    () => playback,
  );
}
