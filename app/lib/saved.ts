/**
 * Other people's playlists saved to your library, kept on the phone. The
 * YouTube Data API only lists playlists you created, never the ones you
 * saved, so the app remembers them itself (like history and pins). Each entry
 * is a snapshot, refreshed from the API whenever the library loads.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Playlist } from './youtube';

const KEY = 'saved-playlists';

let saved: Playlist[] | null = null;
let loading: Promise<Playlist[]> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

async function load(): Promise<Playlist[]> {
  if (saved) return saved;
  if (!loading) {
    loading = (async () => {
      try {
        saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
      } catch {
        saved = [];
      }
      notify();
      return saved!;
    })();
  }
  return loading;
}

function store(next: Playlist[]) {
  saved = next;
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  notify();
}

export const savedPlaylists = () => load();

/** Add to the library, newest first. `lastAdded` becomes the moment it was saved. */
export async function savePlaylist(p: Playlist) {
  const list = await load();
  store([{ ...p, saved: true, lastAdded: new Date().toISOString() }, ...list.filter((x) => x.id !== p.id)]);
}

export async function unsavePlaylist(playlistId: string) {
  const list = await load();
  store(list.filter((x) => x.id !== playlistId));
}

/** Fold fresh API data (title, count, thumbnail) into the snapshots. Returns the updated list. */
export async function refreshSaved(fresh: Playlist[]): Promise<Playlist[]> {
  const list = await load();
  const byId = new Map(fresh.map((p) => [p.id, p]));
  const next = list.map((old) => {
    const f = byId.get(old.id);
    return f ? { ...old, ...f, saved: true, lastAdded: old.lastAdded } : old;
  });
  if (JSON.stringify(next) !== JSON.stringify(list)) store(next);
  return saved!;
}

/** The saved playlists as React state: null until loaded. */
export function useSavedPlaylists(): Playlist[] | null {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => saved,
    () => saved,
  );
}
