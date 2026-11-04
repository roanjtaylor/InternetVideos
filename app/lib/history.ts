/**
 * Watch history, kept on the phone. The YouTube Data API stopped serving
 * history in 2016, so the app records every video it plays itself: newest
 * first, one entry per video, capped so storage stays small.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Video } from './youtube';

export type HistoryEntry = {
  video: Video;
  watchedAt: string;
  /** Playback position in seconds the last time this video was open. */
  position?: number;
  /** The video's length in seconds, kept with the position so lists can draw progress bars. */
  duration?: number;
};

/** Ignore the first and last few seconds: those are "not started" and "finished". */
const RESUME_MARGIN = 10;

const KEY = 'watch-history';
const MAX = 300;

let entries: HistoryEntry[] | null = null;
let loading: Promise<HistoryEntry[]> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function load(): Promise<HistoryEntry[]> {
  if (entries) return entries;
  if (!loading) {
    loading = (async () => {
      try {
        entries = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
      } catch {
        entries = [];
      }
      notify();
      return entries!;
    })();
  }
  return loading;
}

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(entries ?? [])).catch(() => {});
}

/** Move (or add) a video to the top of the history. Called when playback opens. */
export async function recordWatch(video: Video) {
  const list = await load();
  const { playlistItemId: _drop, addedAt: _drop2, ...plain } = video; // playlist rows are not part of the memory
  const prev = list.find((e) => e.video.id === video.id);
  entries = [
    { video: plain, watchedAt: new Date().toISOString(), position: prev?.position, duration: prev?.duration },
    ...list.filter((e) => e.video.id !== video.id),
  ].slice(0, MAX);
  persist();
  notify();
}

/** Remember where playback is. Called every few seconds while a video plays. */
export function saveProgress(videoId: string, position: number, duration?: number) {
  if (!entries) return;
  const e = entries.find((x) => x.video.id === videoId);
  if (!e) return;
  const d = duration || e.duration || e.video.duration;
  const finished = !!d && position >= d - RESUME_MARGIN;
  e.position = finished ? 0 : Math.max(0, Math.floor(position));
  if (d) e.duration = d;
  persist();
  notify();
}

/** Seconds to resume from, or 0 to start at the beginning. Synchronous: reads the loaded history. */
export function resumePosition(videoId: string): number {
  const e = entries?.find((x) => x.video.id === videoId);
  if (!e?.position || e.position < RESUME_MARGIN) return 0;
  return e.position;
}

/** 0..1 watched fraction for a video, or null when unknown. */
export function watchedFraction(videoId: string, entries_ = entries): number | null {
  const e = entries_?.find((x) => x.video.id === videoId);
  const d = e?.duration || e?.video.duration;
  if (!e?.position || !d) return null;
  return Math.min(1, e.position / d);
}

export async function removeFromHistory(videoId: string) {
  const list = await load();
  entries = list.filter((e) => e.video.id !== videoId);
  persist();
  notify();
}

export async function clearHistory() {
  await load();
  entries = [];
  persist();
  notify();
}

export const watchHistory = () => load();

/** The history as React state: null until loaded, then newest first. */
export function useWatchHistory(): HistoryEntry[] | null {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
    () => entries,
  );
}
