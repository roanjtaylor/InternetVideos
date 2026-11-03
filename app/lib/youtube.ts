/**
 * The YouTube Data API client that used to be the Lisp backend. Everything
 * here runs on the phone with the signed-in user's token. Quota costs are
 * noted per call; the project allows 10,000 units a day.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAccessToken } from './auth';
import { cached } from './cache';
import { judgeShort, knownVerdict, rememberVerdict } from './shorts';

const API = 'https://www.googleapis.com/youtube/v3/';

export type Video = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string | null;
  duration?: number; // seconds
  /** Set when the video came from a playlist: the row to delete to remove it. */
  playlistItemId?: string;
};

export type Page = { videos: Video[]; nextPage?: string | null };

export type Playlist = {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string | null;
  lastAdded?: string | null; // ISO date of the newest addition
};

export type Channel = { id: string; title: string; thumbnail: string | null };

export type Me = { id: string; title: string; handle: string | null; thumbnail: string | null };

// ---- Quota bookkeeping (resets midnight Pacific) --------------------------

export type QuotaKind = 'search' | 'writes' | 'reads';
export type Quota = { day: string; used: number; search: number; writes: number; reads: number };

const emptyQuota = (day: string): Quota => ({ day, used: 0, search: 0, writes: 0, reads: 0 });
let quota: Quota = emptyQuota('');
let quotaLoaded = false;

function pacificDay(): string {
  return new Date(Date.now() - 8 * 3600 * 1000).toISOString().slice(0, 10);
}

async function chargeQuota(units: number, kind: QuotaKind) {
  if (!quotaLoaded) {
    quotaLoaded = true;
    try {
      const raw = await AsyncStorage.getItem('quota');
      if (raw) quota = { ...emptyQuota(''), ...JSON.parse(raw) };
    } catch {
      // ignore
    }
  }
  const day = pacificDay();
  if (quota.day !== day) quota = emptyQuota(day);
  quota.used += units;
  quota[kind] += units;
  AsyncStorage.setItem('quota', JSON.stringify(quota)).catch(() => {});
}

export function quotaStatus() {
  return { ...quota, limit: 10000 };
}

// ---- Raw calls -------------------------------------------------------------

type Params = Record<string, string | number | undefined>;

function url(endpoint: string, params: Params): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${API}${endpoint}?${q}`;
}

async function ytFetch(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  params: Params,
  units: number,
  body?: unknown,
) {
  await chargeQuota(units, method !== 'GET' ? 'writes' : units >= 100 ? 'search' : 'reads');
  const token = await getAccessToken();
  const res = await fetch(url(endpoint, params), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`YouTube API ${endpoint}: bad response ${res.status}`);
  }
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`YouTube API ${endpoint}: ${msg}`);
  }
  return json;
}

const ytGet = (endpoint: string, params: Params, units = 1) => ytFetch('GET', endpoint, params, units);
const ytPost = (endpoint: string, params: Params, body: unknown, units = 50) =>
  ytFetch('POST', endpoint, params, units, body);
const ytDelete = (endpoint: string, params: Params, units = 50) => ytFetch('DELETE', endpoint, params, units);

async function ytGetAll(endpoint: string, params: Params, maxPages = 10): Promise<any[]> {
  const items: any[] = [];
  let token: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const resp = await ytGet(endpoint, { ...params, pageToken: token });
    items.push(...(resp.items ?? []));
    token = resp.nextPageToken;
    if (!token) break;
  }
  return items;
}

/** Run fn over items with at most `limit` in flight. Errors are returned, not thrown. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<(R | Error)[]> {
  const out: (R | Error)[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e: any) {
        out[i] = e instanceof Error ? e : new Error(String(e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---- Shaping ---------------------------------------------------------------

function bestThumb(sn: any): string | null {
  return sn?.thumbnails?.medium?.url ?? sn?.thumbnails?.high?.url ?? sn?.thumbnails?.default?.url ?? null;
}

function videoFromPlaylistItem(item: any): Video {
  const sn = item.snippet ?? {};
  return {
    id: item.contentDetails?.videoId,
    title: sn.title,
    channelId: sn.videoOwnerChannelId ?? sn.channelId,
    channelTitle: sn.videoOwnerChannelTitle ?? sn.channelTitle,
    publishedAt: item.contentDetails?.videoPublishedAt ?? sn.publishedAt,
    thumbnail: bestThumb(sn),
    playlistItemId: item.id,
  };
}

function videoFromSearchItem(item: any): Video {
  const sn = item.snippet ?? {};
  return {
    id: item.id?.videoId,
    title: sn.title,
    channelId: sn.channelId,
    channelTitle: sn.channelTitle,
    publishedAt: sn.publishedAt,
    thumbnail: bestThumb(sn),
  };
}

export function parseIsoDuration(s?: string): number {
  if (!s) return 0;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const sortNewest = (videos: Video[]) =>
  [...videos].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));

const isPlaceholder = (v: Video) => v.title === 'Private video' || v.title === 'Deleted video';

/**
 * videos.list in batches of 50 (1 unit each): adds duration, and judges
 * Shorts from the embed aspect ratio. Returns the videos with Shorts removed
 * when `dropShorts` is set.
 */
async function enrich(videos: Video[], dropShorts: boolean): Promise<Video[]> {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const shortIds = new Set<string>();
  const needLookup: string[] = [];
  for (const v of videos) {
    const known = dropShorts ? await knownVerdict(v.id) : undefined;
    if (known === true) shortIds.add(v.id);
    // Known-not-short still needs a duration; only skip when we already have one.
    if (known === undefined || v.duration === undefined) needLookup.push(v.id);
  }
  const batches: string[][] = [];
  for (let i = 0; i < needLookup.length; i += 50) batches.push(needLookup.slice(i, i + 50));
  const results = await pool(batches, 4, (batch) =>
    ytGet('videos', { part: 'contentDetails,player', id: batch.join(','), maxWidth: 320 }),
  );
  for (const resp of results) {
    if (resp instanceof Error) continue;
    for (const it of resp.items ?? []) {
      const v = byId.get(it.id);
      if (!v) continue;
      v.duration = parseIsoDuration(it.contentDetails?.duration);
      const short = judgeShort({
        title: v.title,
        duration: v.duration,
        embedWidth: it.player?.embedWidth,
        embedHeight: it.player?.embedHeight,
      });
      rememberVerdict(v.id, short);
      if (short) shortIds.add(v.id);
    }
  }
  return dropShorts ? videos.filter((v) => !shortIds.has(v.id)) : videos;
}

// ---- Queries ---------------------------------------------------------------

/** Subscribed channels, alphabetical. 1 unit per 50. */
export async function mySubscriptions(): Promise<Channel[]> {
  const subs = await ytGetAll('subscriptions', {
    part: 'snippet',
    mine: 'true',
    order: 'alphabetical',
    maxResults: 50,
  });
  return subs.map((s) => ({
    id: s.snippet?.resourceId?.channelId,
    title: s.snippet?.title,
    thumbnail: s.snippet?.thumbnails?.medium?.url ?? s.snippet?.thumbnails?.default?.url ?? null,
  }));
}

/** A channel's uploads playlist is its id with UC swapped for UU. */
export const uploadsPlaylistId = (channelId: string) => 'UU' + channelId.slice(2);

/** Latest uploads across every subscription. ~1 unit per channel. Shorts removed. */
export async function subscriptionsFeed(perChannel = 5, limit = 120): Promise<Video[]> {
  const channels = await cached('subscriptions', 30 * 60, mySubscriptions);
  const results = await pool(channels, 6, (c) =>
    ytGet('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId(c.id),
      maxResults: perChannel,
    }),
  );
  const videos: Video[] = [];
  for (const r of results) {
    if (r instanceof Error) continue; // a channel with no uploads 404s
    for (const it of r.items ?? []) videos.push(videoFromPlaylistItem(it));
  }
  const newest = sortNewest(videos).slice(0, limit);
  return enrich(newest, true);
}

/** One page of a playlist: up to `pages` API pages of 50 from `pageToken`. */
export async function playlistVideos(
  playlistId: string,
  pageToken?: string | null,
  opts: { pages?: number; dropShorts?: boolean } = {},
): Promise<Page> {
  const { pages = 2, dropShorts = false } = opts;
  const items: any[] = [];
  let token = pageToken ?? undefined;
  for (let i = 0; i < pages; i++) {
    const resp = await ytGet('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: 50,
      pageToken: token,
    });
    items.push(...(resp.items ?? []));
    token = resp.nextPageToken;
    if (!token) break;
  }
  const videos = items.map(videoFromPlaylistItem).filter((v) => !isPlaceholder(v));
  return { videos: await enrich(videos, dropShorts), nextPage: token ?? null };
}

/**
 * ISO date of the newest addition: max playlistItem snippet.publishedAt,
 * the moment the video was saved to the playlist. 1 unit per 50 items.
 */
async function playlistLastAdded(playlistId: string, maxPages: number): Promise<string | null> {
  let latest = '';
  let token: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const resp = await ytGet('playlistItems', { part: 'snippet', playlistId, maxResults: 50, pageToken: token });
    for (const it of resp.items ?? []) {
      const added = it.snippet?.publishedAt ?? '';
      if (added > latest) latest = added;
    }
    token = resp.nextPageToken;
    if (!token) break;
  }
  return latest || null;
}

/**
 * YouTube omits the system playlists (LL = Liked videos, WL = Watch Later)
 * from playlists.list, but playlistItems.list still serves LL. WL has been
 * API-inaccessible since 2016.
 */
async function likedVideosPlaylist(): Promise<Playlist> {
  const resp = await ytGet('playlistItems', { part: 'snippet', playlistId: 'LL', maxResults: 1 });
  const first = resp.items?.[0];
  return {
    id: 'LL',
    title: 'Liked videos',
    itemCount: resp.pageInfo?.totalResults ?? 0,
    thumbnail: first ? bestThumb(first.snippet) : null,
    lastAdded: first?.snippet?.publishedAt ?? null,
  };
}

/** Liked videos plus your own playlists, newest addition first. */
export async function myPlaylists(): Promise<Playlist[]> {
  const [liked, own] = await Promise.all([
    likedVideosPlaylist().catch(() => null),
    ytGetAll('playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: 50 }),
  ]);
  const playlists: Playlist[] = own.map((p) => ({
    id: p.id,
    title: p.snippet?.title,
    itemCount: p.contentDetails?.itemCount ?? 0,
    thumbnail: bestThumb(p.snippet),
    lastAdded: p.snippet?.publishedAt ?? null,
  }));
  const dates = await pool(playlists, 6, (p) => playlistLastAdded(p.id, 5));
  dates.forEach((d, i) => {
    if (!(d instanceof Error) && d) playlists[i].lastAdded = d;
  });
  if (liked) playlists.push(liked);
  return playlists.sort((a, b) => (b.lastAdded ?? '').localeCompare(a.lastAdded ?? ''));
}

/** 100 units per call: only on explicit submit. Shorts removed. */
export async function searchVideos(query: string): Promise<Video[]> {
  const resp = await ytGet('search', { part: 'snippet', q: query, type: 'video', maxResults: 25 }, 100);
  const videos = (resp.items ?? []).map(videoFromSearchItem).filter((v: Video) => !!v.id);
  return enrich(videos, true);
}

/** The signed-in user's own channel: name, handle and avatar. 1 unit. */
export async function myChannel(): Promise<Me> {
  const resp = await ytGet('channels', { part: 'snippet', mine: 'true' });
  const c = resp.items?.[0];
  if (!c) throw new Error('This Google account has no YouTube channel.');
  return {
    id: c.id,
    title: c.snippet?.title ?? '',
    handle: c.snippet?.customUrl ?? null,
    thumbnail: c.snippet?.thumbnails?.high?.url ?? c.snippet?.thumbnails?.default?.url ?? null,
  };
}

// ---- Writes (50 units each) ------------------------------------------------

export async function removeFromPlaylist(playlistItemId: string): Promise<void> {
  await ytDelete('playlistItems', { id: playlistItemId });
}

export async function addToPlaylist(playlistId: string, videoId: string): Promise<void> {
  await ytPost(
    'playlistItems',
    { part: 'snippet' },
    { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
  );
}

export async function createPlaylist(title: string, privacy: 'private' | 'unlisted' | 'public' = 'private') {
  const resp = await ytPost(
    'playlists',
    { part: 'snippet,status' },
    { snippet: { title }, status: { privacyStatus: privacy } },
  );
  return { id: resp.id as string, title: resp.snippet?.title as string };
}

export async function rateVideo(videoId: string, rating: 'like' | 'none'): Promise<void> {
  await ytPost('videos/rate', { id: videoId, rating }, undefined, 50);
}
