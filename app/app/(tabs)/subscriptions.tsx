import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { VideoList } from '@/components/VideoList';
import { api, Channel, Video } from '@/lib/api';
import { latestByChannel, sortChannels } from '@/lib/channels';
import { useTheme } from '@/lib/theme';

const ACROSS = 5; // avatars visible across the width, like YouTube
const DAY = 86400 * 1000;

type Filter = 'all' | 'today' | 'week';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
];

/**
 * Subscriptions, YouTube style: a strip of the channels you follow in
 * YouTube's relevance order (most watched first) with "All" at the end,
 * filter chips, then the latest uploads across every channel.
 */
export default function SubscriptionsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - 56) / ACROSS);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [activity, setActivity] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [dropdown, setDropdown] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const toggle = useCallback(
    (open: boolean) => {
      openRef.current = open;
      if (open) {
        anim.setValue(0);
        setDropdown(true);
        Animated.timing(anim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      } else {
        Animated.timing(anim, { toValue: 0, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished && !openRef.current) setDropdown(false);
          },
        );
      }
    },
    [anim],
  );

  const filterLabel = FILTERS.find((f) => f.key === filter)!.label;
  // The filter dropdown sits at the right of the title banner, like Playlists' sort.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Show: ${filterLabel}`}
          onPress={() => toggle(!openRef.current)}
          style={({ pressed }) => [styles.dropBtn, { backgroundColor: t.surface }, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.dropText, { color: t.text }]}>{filterLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={t.text} />
        </Pressable>
      ),
    });
  }, [navigation, filterLabel, t, toggle]);

  useEffect(() => {
    api
      .subscriptions()
      .then((r) => setChannels(r.channels))
      .catch(() => setChannels([]));
  }, []);

  const load = useCallback((page?: string | null) => api.feed(page), []);
  const onVideos = useCallback((videos: Video[]) => setActivity(latestByChannel(videos)), []);

  // YouTube's own ranking: the channels you watch most, first.
  const ordered = useMemo(() => (channels ? sortChannels(channels, 'relevance', activity) : null), [channels, activity]);
  const avatars = useMemo(
    () => Object.fromEntries((channels ?? []).map((c) => [c.id, c.thumbnail])),
    [channels],
  );
  const since = filter === 'today' ? Date.now() - DAY : filter === 'week' ? Date.now() - 7 * DAY : 0;
  const filterFn = useCallback(
    (v: Video) => !since || new Date(v.publishedAt).getTime() >= since,
    [since],
  );

  const header = (
    <View>
      <View style={styles.stripRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 8 }}>
          {ordered
            ? ordered.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push({ pathname: '/channel/[id]', params: { id: c.id, title: c.title } })}
                  style={({ pressed }) => [styles.cell, { width: cell }, pressed && { opacity: 0.6 }]}>
                  {c.thumbnail ? (
                    <Image source={{ uri: c.thumbnail }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: t.surfaceHigh }]} />
                  )}
                  <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                    {c.title}
                  </Text>
                </Pressable>
              ))
            : Array.from({ length: ACROSS }, (_, i) => (
                <View key={i} style={[styles.cell, { width: cell }]}>
                  <Skeleton style={styles.avatar} />
                  <Skeleton style={{ height: 10, width: 44, marginTop: 8 }} />
                </View>
              ))}
        </ScrollView>
        <Pressable
          onPress={() => router.push('/channels')}
          hitSlop={8}
          style={({ pressed }) => [styles.all, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.allText, { color: t.link }]}>All</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <VideoList
        load={load}
        layout="card"
        avatars={avatars}
        header={header}
        onVideos={onVideos}
        filter={filterFn}
        emptyText={
          filter === 'all'
            ? 'No uploads from your subscriptions yet. Subscribe in YouTube and pull to refresh.'
            : 'Nothing new in this period.'
        }
      />
      {dropdown && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => toggle(false)} />
          <Animated.View
            style={[
              styles.menu,
              {
                backgroundColor: t.dark ? '#212121' : '#fff',
                borderColor: t.divider,
                opacity: anim,
                transform: [
                  { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                  { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}>
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => {
                  setFilter(f.key);
                  toggle(false);
                }}
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: t.surface }]}>
                <Text style={[styles.menuText, { color: t.text, fontWeight: f.key === filter ? '700' : '400' }]}>
                  {f.label}
                </Text>
                {f.key === filter && <Ionicons name="checkmark" size={18} color={t.text} />}
              </Pressable>
            ))}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stripRow: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  cell: { alignItems: 'center', paddingVertical: 6 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  name: { fontSize: 11, marginTop: 6, maxWidth: '100%' },
  all: { width: 48, alignItems: 'center', paddingTop: 24 },
  allText: { fontSize: 14, fontWeight: '600' },
  dropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 12,
  },
  dropText: { fontSize: 14, fontWeight: '500' },
  menu: {
    position: 'absolute',
    top: 4,
    right: 12,
    minWidth: 190,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, height: 44 },
  menuText: { fontSize: 15 },
});
