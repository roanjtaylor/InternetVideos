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
  description?: string;
  duration?: number; // seconds
  viewCount?: number;
  likeCount?: number;
  /** Set when the video came from a playlist: the row to delete to remove it. */
  playlistItemId?: string;
  /** Set when the video came from a playlist: when it was added there. */
  addedAt?: string;
  /** Channel avatar, filled in for search results. */
  channelThumbnail?: string | null;
};

export type Page = { videos: Video[]; nextPage?: string | null };

export type PlaylistPrivacy = 'private' | 'unlisted' | 'public';

export type Playlist = {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string | null;
  lastAdded?: string | null; // ISO date of the newest addition
  createdAt?: string | null; // ISO date the playlist was made
  privacy: PlaylistPrivacy;
};

export type Channel = {
  id: string;
  title: string;
  thumbnail: string | null;
  /** The subscriptions.list row id, needed to unsubscribe. */
  subscriptionId?: string;
};

export type ChannelInfo = Channel & { subscriberCount: number | null; handle?: string | null };

export type Rating = 'like' | 'dislike' | 'none';

export type Me = { id: string; title: string; handle: string | null; thumbnail: string | null };

// ---- Quota bookkeeping (resets midnight Pacific) --------------------------

export type QuotaKind = 'search' | 'writes' | 'reads';
export type Quota = { day: string; used: number; search: number; writes: number; reads: number };

const emptyQuota = (day: string): Quota => ({ day, used: 0, search: 0, writes: 0, reads: 0 });
let quota: Quota = emptyQuota('');

function pacificDay(): string {
  // en-CA formats as YYYY-MM-DD; the zone handles daylight saving.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/**
 * Today's tally is read from storage once, at startup. Every charge waits for
 * it, so calls made in parallel right after launch cannot be lost to (or wipe)
 * the stored count, and the profile can wait for it before drawing.
 */
export const quotaReady: Promise<void> = (async () => {
  try {
    const raw = await AsyncStorage.getItem('quota');
    if (raw) quota = { ...emptyQuota(''), ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  if (quota.day !== pacificDay()) quota = emptyQuota(pacificDay());
})();

async function chargeQuota(units: number, kind: QuotaKind) {
  await quotaReady;
  const day = pacificDay();
  if (quota.day !== day) quota = emptyQuota(day);
  quota.used += units;
  quota[kind] += units;
  AsyncStorage.setItem('quota', JSON.stringify(quota)).catch(() => {});
}

export function quotaStatus() {
  const q = quota.day === pacificDay() ? quota : emptyQuota(pacificDay());
  return { ...q, limit: 10000 };
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
  const th = sn?.thumbnails;
  // Largest first: a full-width card on a phone is ~1000 physical pixels across.
  return th?.maxres?.url ?? th?.standard?.url ?? th?.high?.url ?? th?.medium?.url ?? th?.default?.url ?? null;
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
    description: sn.description || undefined,
    playlistItemId: item.id,
    addedAt: sn.publishedAt,
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
    description: sn.description || undefined,
  };
}

export function parseIsoDuration(s?: string): number {
  if (!s) return 0;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function applyStats(v: Video, st: any) {
  if (!st) return;
  if (st.viewCount !== undefined) v.viewCount = Number(st.viewCount);
  if (st.likeCount !== undefined) v.likeCount = Number(st.likeCount);
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
    ytGet('videos', { part: 'contentDetails,player,statistics', id: batch.join(','), maxWidth: 320 }),
  );
  for (const resp of results) {
    if (resp instanceof Error) continue;
    for (const it of resp.items ?? []) {
      const v = byId.get(it.id);
      if (!v) continue;
      v.duration = parseIsoDuration(it.contentDetails?.duration);
      applyStats(v, it.statistics);
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

/**
 * Subscribed channels in YouTube's relevance order: the channels you watch
 * most come first, the same ranking the official app's strip uses. 1 unit per 50.
 */
export async function mySubscriptions(): Promise<Channel[]> {
  const subs = await ytGetAll('subscriptions', {
    part: 'snippet',
    mine: 'true',
    order: 'relevance',
    maxResults: 50,
  });
  return subs.map((s) => ({
    id: s.snippet?.resourceId?.channelId,
    title: s.snippet?.title,
    thumbnail: s.snippet?.thumbnails?.medium?.url ?? s.snippet?.thumbnails?.default?.url ?? null,
    subscriptionId: s.id,
  }));
}

/** A channel's avatar and subscriber count. 1 unit. */
export async function channelInfo(channelId: string): Promise<ChannelInfo> {
  const resp = await ytGet('channels', { part: 'snippet,statistics', id: channelId });
  const c = resp.items?.[0];
  if (!c) throw new Error('Channel not found.');
  return {
    id: c.id,
    title: c.snippet?.title ?? '',
    thumbnail: c.snippet?.thumbnails?.medium?.url ?? c.snippet?.thumbnails?.default?.url ?? null,
    subscriberCount: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? 0),
    handle: c.snippet?.customUrl ?? null,
  };
}

/** Everything the player shows for one video: description, duration, views and likes. 1 unit. */
export async function videoDetails(videoId: string): Promise<Partial<Video>> {
  const resp = await ytGet('videos', { part: 'snippet,contentDetails,statistics', id: videoId });
  const it = resp.items?.[0];
  if (!it) throw new Error('Video not found.');
  const v: Partial<Video> = {
    id: it.id,
    title: it.snippet?.title,
    channelId: it.snippet?.channelId,
    channelTitle: it.snippet?.channelTitle,
    publishedAt: it.snippet?.publishedAt,
    description: it.snippet?.description || undefined,
    duration: parseIsoDuration(it.contentDetails?.duration),
  };
  applyStats(v as Video, it.statistics);
  return v;
}

/** Your rating of a video. 1 unit. */
export async function getRating(videoId: string): Promise<Rating> {
  const resp = await ytGet('videos/getRating', { id: videoId });
  return (resp.items?.[0]?.rating as Rating) ?? 'none';
}

/** A channel's uploads playlist is its id with UC swapped for UU. */
export const uploadsPlaylistId = (channelId: string) => 'UU' + channelId.slice(2);

const xmlDecode = (t: string) =>
  t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

/** A channel's latest ~15 uploads from its public Atom feed. Not the Data API: costs no quota. */
async function channelFeed(channelId: string): Promise<Video[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const xml = await res.text();
  const out: Video[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = /<yt:videoId>([^<]+)</.exec(e)?.[1];
    const published = /<published>([^<]+)</.exec(e)?.[1];
    if (!id || !published) continue;
    out.push({
      id,
      title: xmlDecode(/<title>([^<]*)</.exec(e)?.[1] ?? ''),
      channelId,
      channelTitle: xmlDecode(/<author>\s*<name>([^<]*)</.exec(e)?.[1] ?? ''),
      publishedAt: published,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return out;
}

/**
 * Every subscription's recent uploads, newest first, found through the free
 * channel feeds (0 quota units). Only the pages the user actually scrolls to
 * are then looked up with the Data API (see subscriptionsFeedPage).
 */
export async function subscriptionsIndex(limit = 200): Promise<Video[]> {
  const channels = await cached('subscriptions', 30 * 60, mySubscriptions);
  const results = await pool(channels, 8, (c) => channelFeed(c.id));
  const videos: Video[] = [];
  for (const r of results) if (!(r instanceof Error)) videos.push(...r);
  return sortNewest(videos).slice(0, limit);
}

/** The next `want` non-Short videos from the index starting at `offset`. ~1 unit per page. */
export async function subscriptionsFeedPage(index: Video[], offset: number, want: number): Promise<Page> {
  const out: Video[] = [];
  let i = offset;
  while (out.length < want && i < index.length) {
    const batch = index.slice(i, i + Math.max(want, 4));
    i += batch.length;
    out.push(...(await enrich(batch.map((v) => ({ ...v })), true)));
  }
  return { videos: out, nextPage: i < index.length ? String(i) : null };
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
    createdAt: null,
    privacy: 'private',
  };
}


/** Liked videos plus your own playlists, newest addition first. */
export async function myPlaylists(): Promise<Playlist[]> {
  const [liked, own] = await Promise.all([
    likedVideosPlaylist().catch(() => null),
    ytGetAll('playlists', { part: 'snippet,contentDetails,status', mine: 'true', maxResults: 50 }),
  ]);
  const playlists: Playlist[] = own.map((p) => ({
    id: p.id,
    title: p.snippet?.title,
    itemCount: p.contentDetails?.itemCount ?? 0,
    thumbnail: bestThumb(p.snippet),
    lastAdded: p.snippet?.publishedAt ?? null,
    createdAt: p.snippet?.publishedAt ?? null,
    privacy: (p.status?.privacyStatus as PlaylistPrivacy) ?? 'private',
  }));
  const dates = await pool(playlists, 6, (p) => playlistLastAdded(p.id, 5));
  dates.forEach((d, i) => {
    if (!(d instanceof Error) && d) playlists[i].lastAdded = d;
  });
  if (liked) playlists.push(liked);
  return playlists.sort((a, b) => (b.lastAdded ?? '').localeCompare(a.lastAdded ?? ''));
}

/** 100 units per call: only on explicit submit. Shorts removed. */
const SEARCH_BATCH = 18;

/**
 * One "page" is at least SEARCH_BATCH videos: Shorts are dropped after the
 * fact, so a raw 25-result page can shrink to a handful. Fetches up to 3 raw
 * pages (100 units each) to fill the batch, then adds channel avatars (1 unit).
 */
export async function searchVideos(query: string, pageToken?: string | null): Promise<Page> {
  const out: Video[] = [];
  const seen = new Set<string>();
  let token: string | null = pageToken ?? null;
  for (let i = 0; i < 3; i++) {
    const resp = await ytGet(
      'search',
      { part: 'snippet', q: query, type: 'video', maxResults: 25, ...(token ? { pageToken: token } : {}) },
      100,
    );
    const raw = (resp.items ?? []).map(videoFromSearchItem).filter((v: Video) => !!v.id && !seen.has(v.id));
    raw.forEach((v: Video) => seen.add(v.id));
    out.push(...(await enrich(raw, true)));
    token = resp.nextPageToken ?? null;
    if (!token || out.length >= SEARCH_BATCH) break;
  }
  await addChannelAvatars(out);
  return { videos: out, nextPage: token };
}

/** channels.list in batches of 50 (1 unit each): fills `channelThumbnail`. */
async function addChannelAvatars(videos: Video[]): Promise<void> {
  const ids = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const results = await pool(batches, 2, (b) => ytGet('channels', { part: 'snippet', id: b.join(','), maxResults: 50 }));
  const thumbs = new Map<string, string | null>();
  for (const r of results) {
    if (r instanceof Error) continue;
    for (const c of r.items ?? [])
      thumbs.set(c.id, c.snippet?.thumbnails?.medium?.url ?? c.snippet?.thumbnails?.default?.url ?? null);
  }
  for (const v of videos) v.channelThumbnail = thumbs.get(v.channelId) ?? null;
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

export async function rateVideo(videoId: string, rating: 'like' | 'dislike' | 'none'): Promise<void> {
  await ytPost('videos/rate', { id: videoId, rating }, undefined, 50);
}

/** Returns the new subscription's row id. */
export async function subscribe(channelId: string): Promise<string> {
  const resp = await ytPost(
    'subscriptions',
    { part: 'snippet' },
    { snippet: { resourceId: { kind: 'youtube#channel', channelId } } },
  );
  return resp.id as string;
}

export async function unsubscribe(subscriptionId: string): Promise<void> {
  await ytDelete('subscriptions', { id: subscriptionId });
}
