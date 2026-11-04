/**
 * Playlists pinned to Home, kept on the phone. Until you pin anything, a
 * playlist of yours called "Watch later" (any case) is pinned for you, so
 * Home mirrors the queue YouTube keeps out of its API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Playlist } from './youtube';

const KEY = 'pinned-playlists';

/** null until loaded; `chosen` is false while the default (Watch later) still applies. */
type Pins = { ids: string[]; chosen: boolean };
let pins: Pins | null = null;
let loading: Promise<Pins> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

async function load(): Promise<Pins> {
  if (pins) return pins;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        pins = raw ? { chosen: true, ...JSON.parse(raw) } : { ids: [], chosen: false };
      } catch {
        pins = { ids: [], chosen: false };
      }
      notify();
      return pins!;
    })();
  }
  return loading;
}

function save(next: Pins) {
  pins = next;
  AsyncStorage.setItem(KEY, JSON.stringify({ ids: next.ids })).catch(() => {});
  notify();
}

export const isWatchLaterTitle = (title: string) => title.trim().toLowerCase() === 'watch later';

/** The pinned playlists, in pin order, resolved against the current playlist list. */
export function pinnedPlaylists(all: Playlist[], p: Pins | null): Playlist[] {
  if (!p) return [];
  const ids = p.chosen ? p.ids : all.filter((x) => x.id !== 'LL' && isWatchLaterTitle(x.title)).map((x) => x.id);
  return ids.map((id) => all.find((x) => x.id === id)).filter((x): x is Playlist => !!x);
}

export async function togglePin(playlistId: string, all: Playlist[]) {
  const p = await load();
  const current = pinnedPlaylists(all, p).map((x) => x.id);
  const ids = current.includes(playlistId) ? current.filter((id) => id !== playlistId) : [...current, playlistId];
  save({ ids, chosen: true });
}

export function usePins(): Pins | null {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pins,
    () => pins,
  );
}
