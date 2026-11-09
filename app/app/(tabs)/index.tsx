import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HiResImage } from '@/components/HiResImage';
import { Skeleton } from '@/components/Skeleton';
import { VideoRow } from '@/components/VideoList';
import { api, formatDuration, Playlist, timeAgo, Video } from '@/lib/api';
import { lastIncomplete, useWatchHistory, watchedFraction } from '@/lib/history';
import { useLoadingBar } from '@/lib/loading';
import { pinnedPlaylists, usePins } from '@/lib/pins';
import { openVideo } from '@/lib/player';
import { useTheme } from '@/lib/theme';

const TOTAL = 3; // the hero plus two rows

/**
 * Home: the video you were part-way through as a big card, then the next
 * videos in your Watch later queue (oldest addition first). The video being
 * resumed is skipped in the queue, so a third queued video fills its place.
 */
export default function HomeScreen() {
  const router = useRouter();
  const t = useTheme();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pins = usePins();
  const history = useWatchHistory();
  useLoadingBar((playlists === null && !error) || history === null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlaylists((await api.playlists()).playlists);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pinned = playlists && pins ? pinnedPlaylists(playlists, pins) : null;
  const resume = lastIncomplete(history)?.video ?? null;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 80 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.secondary}
          onRefresh={async () => {
            setRefreshing(true);
            await api.refresh();
            await load();
            setRefreshing(false);
          }}
        />
      }>
      {error ? (
        <Pressable onPress={load} style={[styles.notice, { backgroundColor: t.surface }]}>
          <Ionicons name="alert-circle-outline" size={28} color={t.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.noticeTitle, { color: t.text }]}>Could not load playlists</Text>
            <Text style={[styles.noticeText, { color: t.secondary }]}>{error} Tap to retry.</Text>
          </View>
        </Pressable>
      ) : pinned === null ? (
        <>
          <SectionHeader title="Watch later" />
          <Skeleton style={styles.hero} />
        </>
      ) : pinned.length === 0 ? (
        <Pressable
          onPress={() => router.push('/playlists')}
          style={({ pressed }) => [styles.notice, { backgroundColor: t.surface }, pressed && { opacity: 0.8 }]}>
          <Ionicons name="pin-outline" size={28} color={t.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.noticeTitle, { color: t.text }]}>Nothing pinned yet</Text>
            <Text style={[styles.noticeText, { color: t.secondary }]}>
              Make a playlist called &ldquo;Watch later&rdquo; or pin any playlist from its menu in the Playlists tab.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.secondary} />
        </Pressable>
      ) : (
        pinned.slice(0, 1).map((p, i) => <PinnedPlaylist key={p.id} playlist={p} resume={i === 0 ? resume : null} historyReady={history !== null} />)
      )}
    </ScrollView>
  );
}

/** The home feed: the resume video (if any) as the card, then queued videos. */
function PinnedPlaylist({
  playlist,
  resume,
  historyReady,
}: {
  playlist: Playlist;
  resume: Video | null;
  historyReady: boolean;
}) {
  const router = useRouter();
  const t = useTheme();
  const [queue, setQueue] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .playlist(playlist.id)
      .then((page) => {
        if (!alive) return;
        // Oldest addition first: a queue, so what you saved first is up next.
        const sorted = [...page.videos].sort((a, b) => (a.addedAt ?? '').localeCompare(b.addedAt ?? ''));
        setQueue(sorted);
      })
      .catch((e) => alive && setError(e.message ?? String(e)));
    return () => {
      alive = false;
    };
  }, [playlist.id]);

  const videos = queue && historyReady ? [...(resume ? [resume] : []), ...queue.filter((v) => v.id !== resume?.id)].slice(0, TOTAL) : null;

  const open = () => router.push({ pathname: '/playlist/[id]', params: { id: playlist.id, title: playlist.title } });

  return (
    <View>
      <SectionHeader
        title={resume ? 'Continue watching' : playlist.title}
        action={{ label: 'View all', onPress: open }}
      />
      {error ? (
        <Text style={[styles.noticeText, { color: t.danger, paddingHorizontal: 16 }]}>{error}</Text>
      ) : videos === null ? (
        <Skeleton style={styles.hero} />
      ) : videos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: t.secondary }}>This playlist is empty.</Text>
        </View>
      ) : (
        <>
          <HeroVideo video={videos[0]} />
          {videos.slice(1).map((v) => (
            <VideoRow key={v.playlistItemId ?? v.id} video={v} />
          ))}
        </>
      )}
    </View>
  );
}

function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: t.text }]} numberOfLines={1}>
        {title}
      </Text>
      {action && (
        <Pressable hitSlop={8} onPress={action.onPress}>
          <Text style={[styles.sectionAction, { color: t.link }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The first video in a pinned playlist's queue, full width like a YouTube card. */
function HeroVideo({ video }: { video: Video }) {
  const t = useTheme();
  const history = useWatchHistory();
  const watched = watchedFraction(video.id, history);
  return (
    <Pressable onPress={() => openVideo(video)} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <View style={styles.hero}>
        <HiResImage videoId={video.id} fallback={video.thumbnail} style={StyleSheet.absoluteFill} />
        {!!video.duration && <Text style={styles.duration}>{formatDuration(video.duration)}</Text>}
        {watched !== null && watched > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(watched * 100)}%`, backgroundColor: t.red }]} />
          </View>
        )}
      </View>
      <View style={styles.heroMeta}>
        <Text style={[styles.heroTitle, { color: t.text }]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
          {video.channelTitle} · {timeAgo(video.publishedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  sectionAction: { fontSize: 14, fontWeight: '600' },
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: 0 },
  heroMeta: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  heroTitle: { fontSize: 16, fontWeight: '500', lineHeight: 22 },
  sub: { fontSize: 12, marginTop: 4 },
  duration: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressFill: { height: 4 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 14,
    borderRadius: 12,
  },
  noticeTitle: { fontSize: 15, fontWeight: '600' },
  noticeText: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  empty: { padding: 24, alignItems: 'center' },
});
