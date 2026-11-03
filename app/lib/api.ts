export type Video = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string | null;
  duration?: number; // seconds
};

export type Playlist = {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string | null;
};

// Set in app/.env (gitignored); see .env.example.
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8788').replace(/\/$/, '');
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY ?? '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'X-App-Key': APP_KEY } });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Bad response from ${path}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  health: () => get<{ ok: boolean; authorized: boolean }>('/health'),
  feed: () => get<{ videos: Video[] }>('/feed'),
  playlists: () => get<{ playlists: Playlist[] }>('/playlists'),
  playlist: (id: string) => get<{ videos: Video[] }>(`/playlist?id=${encodeURIComponent(id)}`),
  search: (q: string) => get<{ videos: Video[] }>(`/search?q=${encodeURIComponent(q)}`),
  refresh: () => get<{ ok: boolean }>('/refresh'),
};

export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, string][] = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [secs, name] of units) {
    const n = Math.floor(diff / secs);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
