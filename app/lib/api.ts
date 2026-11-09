/**
 * The screens' data layer. Same shape the old HTTP client exposed, now backed
 * by direct YouTube API calls on the device with caching in front.
 */
import { cached, clearCache } from './cache';
import * as yt from './youtube';
import type { Video } from './youtube';

export type { Channel, ChannelInfo, Me, Page, Playlist, PlaylistPrivacy, Quota, Rating, Video } from './youtube';

const MIN = 60;

export const api = {
  /** Newest subscription uploads, 3 on the first page then 6 at a time. Discovery is free; each page costs ~1 unit. */
  feed: async (page?: string | null) => {
    const offset = Number(page ?? 0) || 0;
    const index = await cached('feed:index', 15 * MIN, () => yt.subscriptionsIndex());
    return cached(`feed:p${offset}`, 15 * MIN, () => yt.subscriptionsFeedPage(index, offset, offset === 0 ? 3 : 6));
  },
  subscriptions: async () => ({ channels: await cached('subscriptions', 30 * MIN, yt.mySubscriptions) }),
  channel: (id: string, page?: string | null) =>
    cached(`ch:${id}:${page ?? ''}`, 5 * MIN, () =>
      yt.playlistVideos(yt.uploadsPlaylistId(id), page, { dropShorts: true }),
    ),
  playlists: async () => ({ playlists: await cached('playlists', 5 * MIN, yt.myPlaylists) }),
  playlist: (id: string, page?: string | null) =>
    cached(`pl:${id}:${page ?? ''}`, 5 * MIN, () => yt.playlistVideos(id, page)),
  search: (q: string, page?: string | null) =>
    cached(`q:${q.toLowerCase()}:${page ?? ''}`, 60 * MIN, () => yt.searchVideos(q, page)),

  /** YouTube's own search autocomplete. Free: not part of the Data API quota. */
  suggestions: async (q: string): Promise<string[]> => {
    const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&hl=en&q=${encodeURIComponent(q)}`;
    const text = await (await fetch(url)).text();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end < 0) return [];
    const data = JSON.parse(text.slice(start, end + 1));
    return ((data[1] ?? []) as any[]).map((s) => String(Array.isArray(s) ? s[0] : s)).slice(0, 10);
  },

  me: async () => cached('me', 24 * 60 * MIN, yt.myChannel),
  video: (id: string) => cached(`v:${id}`, 30 * MIN, () => yt.videoDetails(id)),
  channelInfo: (id: string) => cached(`chinfo2:${id}`, 24 * 60 * MIN, () => yt.channelInfo(id)),
  /** Not cached: the answer changes with every like. 1 unit. */
  rating: (videoId: string) => yt.getRating(videoId),
  /** The subscription row for a channel, from the cached list. Null when not subscribed. */
  subscription: async (channelId: string): Promise<string | null> => {
    const list = await cached('subscriptions', 30 * MIN, yt.mySubscriptions);
    return list.find((c) => c.id === channelId)?.subscriptionId ?? null;
  },
  subscribe: async (channelId: string) => {
    const id = await yt.subscribe(channelId);
    await Promise.all([clearCache('subscriptions'), clearCache('feed')]);
    return id;
  },
  unsubscribe: async (subscriptionId: string) => {
    await yt.unsubscribe(subscriptionId);
    await Promise.all([clearCache('subscriptions'), clearCache('feed')]);
  },

  /** Writes invalidate the playlist caches so the next view reflects them. */
  addToPlaylist: async (playlistId: string, videoId: string) => {
    await yt.addToPlaylist(playlistId, videoId);
    await Promise.all([clearCache('playlists'), clearCache(`pl:${playlistId}`)]);
  },
  /** Liked videos (LL) has no playlist items to delete: un-liking removes it. */
  removeFromPlaylist: async (playlistId: string, video: Video) => {
    if (playlistId === 'LL') await yt.rateVideo(video.id, 'none');
    else if (video.playlistItemId) await yt.removeFromPlaylist(video.playlistItemId);
    else throw new Error('This video cannot be removed from here.');
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
  unlike: async (videoId: string) => {
    await yt.rateVideo(videoId, 'none');
    await Promise.all([clearCache('playlists'), clearCache('pl:LL')]);
  },

  dislike: async (videoId: string) => {
    await yt.rateVideo(videoId, 'dislike');
    await Promise.all([clearCache('playlists'), clearCache('pl:LL')]);
  },

  refresh: () => clearCache(),
  quota: yt.quotaStatus,
  quotaReady: yt.quotaReady,
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

/** 1234 → "1.2K", 1200000 → "1.2M", like YouTube's counters. */
export function formatCount(n?: number | null): string {
  if (n === undefined || n === null) return '';
  if (n < 1000) return String(n);
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size;
      return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${suffix}`;
    }
  }
  return String(n);
}

/** "3 Nov 2026" for the player's date line. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
