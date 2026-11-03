import type { Channel, Video } from './youtube';

/** Newest upload date per channel, from any list of videos. */
export function latestByChannel(videos: Video[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of videos) {
    if (!out[v.channelId] || v.publishedAt > out[v.channelId]) out[v.channelId] = v.publishedAt;
  }
  return out;
}

export type ChannelSort = 'activity' | 'alpha';

/** Channels by newest activity (unknown activity last, then A to Z) or A to Z. */
export function sortChannels(channels: Channel[], sort: ChannelSort, activity: Record<string, string>): Channel[] {
  const alpha = (a: Channel, b: Channel) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  if (sort === 'alpha') return [...channels].sort(alpha);
  return [...channels].sort((a, b) => {
    const da = activity[a.id] ?? '';
    const db = activity[b.id] ?? '';
    if (da !== db) return db.localeCompare(da);
    return alpha(a, b);
  });
}
