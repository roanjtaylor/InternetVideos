/**
 * The screens' data layer. Same shape the old HTTP client exposed, now backed
 * by direct YouTube API calls on the device with caching in front.
 */
import { cached, clearCache } from './cache';
import * as yt from './youtube';

export type { Channel, Page, Playlist, Video } from './youtube';

const MIN = 60;

export const api = {
  feed: async () => ({ videos: await cached('feed', 15 * MIN, () => yt.subscriptionsFeed()) }),
  subscriptions: async () => ({ channels: await cached('subscriptions', 30 * MIN, yt.mySubscriptions) }),
  channel: (id: string, page?: string | null) =>
    cached(`ch:${id}:${page ?? ''}`, 5 * MIN, () =>
      yt.playlistVideos(yt.uploadsPlaylistId(id), page, { dropShorts: true }),
    ),
  playlists: async () => ({ playlists: await cached('playlists', 5 * MIN, yt.myPlaylists) }),
  playlist: (id: string, page?: string | null) =>
    cached(`pl:${id}:${page ?? ''}`, 5 * MIN, () => yt.playlistVideos(id, page)),
  search: async (q: string) => ({
    videos: await cached(`q:${q.toLowerCase()}`, 60 * MIN, () => yt.searchVideos(q)),
  }),

  /** Writes invalidate the playlist caches so the next view reflects them. */
  addToPlaylist: async (playlistId: string, videoId: string) => {
    await yt.addToPlaylist(playlistId, videoId);
    await Promise.all([clearCache('playlists'), clearCache(`pl:${playlistId}`)]);
  },
  createPlaylist: async (title: string) => {
    const p = await yt.createPlaylist(title);
    await clearCache('playlists');
    return p;
  },
  like: async (videoId: string) => {
    await yt.rateVideo(videoId, 'like');
    await Promise.all([clearCache('playlists'), clearCache('pl:LL')]);
  },

  refresh: () => clearCache(),
  quota: yt.quotaStatus,
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
