import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { Skeleton } from '@/components/Skeleton';
import { api, Playlist, PlaylistPrivacy, timeAgo } from '@/lib/api';
import { useLoadingBar } from '@/lib/loading';
import { pinnedPlaylists, togglePin, usePins } from '@/lib/pins';
import { useTheme } from '@/lib/theme';

type Sort = 'updated' | 'created' | 'alpha' | 'count';
const DEFAULT_SORT: Sort = 'updated';
const FILTER_KEY = 'playlist-filter';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Recently created' },
  { key: 'alpha', label: 'A to Z' },
  { key: 'count', label: 'Most videos' },
];
const PRIVACY_LABEL: Record<PlaylistPrivacy, string> = { private: 'Private', unlisted: 'Unlisted', public: 'Public' };

function arrange(shown: Playlist[], sort: Sort): Playlist[] {
  const byDate = (pick: (p: Playlist) => string | null | undefined) => (a: Playlist, b: Playlist) =>
    (pick(b) ?? '').localeCompare(pick(a) ?? '');
  switch (sort) {
    case 'alpha':
      return [...shown].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    case 'count':
      return [...shown].sort((a, b) => b.itemCount - a.itemCount);
    case 'created':
      return [...shown].sort(byDate((p) => p.createdAt ?? p.lastAdded));
    default:
      return [...shown].sort(byDate((p) => p.lastAdded));
  }
}

/**
 * Playlists: your own plus Liked videos, with a sort dropdown beside the
 * title. The kebab on a row pins it to Home.
 */
export default function PlaylistsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const t = useTheme();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [dropdown, setDropdown] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const [menuFor, setMenuFor] = useState<Playlist | null>(null);
  const pins = usePins();
  useLoadingBar(playlists === null && !error);

  useEffect(() => {
    AsyncStorage.getItem(FILTER_KEY)
      .then((raw) => {
        const saved = raw && JSON.parse(raw)?.sort;
        if (SORTS.some((o) => o.key === saved)) setSort(saved);
      })
      .catch(() => {});
  }, []);

  // Mounted only while open, so a stale overlay can never linger and eat taps.
  const mountedRef = useRef(false);
  const close = useCallback(() => {
    mountedRef.current = false;
    Animated.timing(anim, {
      toValue: 0,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !mountedRef.current) setDropdown(false);
    });
  }, [anim]);
  const toggle = useCallback(
    (open: boolean) => {
      if (!open) return close();
      mountedRef.current = true;
      anim.setValue(0);
      setDropdown(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [anim, close],
  );

  const pickSort = (next: Sort) => {
    setSort(next);
    toggle(false);
    AsyncStorage.setItem(FILTER_KEY, JSON.stringify({ sort: next })).catch(() => {});
  };

  const sortLabel = SORTS.find((o) => o.key === sort)!.label;

  // The sort dropdown sits at the right of the title banner.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Sort by: ${sortLabel}`}
          onPress={() => toggle(!mountedRef.current)}
          style={({ pressed }) => [styles.dropBtn, { backgroundColor: t.surface }, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.dropText, { color: t.text }]}>{sortLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={t.text} />
        </Pressable>
      ),
    });
  }, [navigation, sortLabel, t, toggle]);

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

  const shown = useMemo(() => (playlists ? arrange(playlists, sort) : null), [playlists, sort]);
  const pinnedIds = useMemo(
    () => new Set(pinnedPlaylists(playlists ?? [], pins).map((p) => p.id)),
    [playlists, pins],
  );

  if (error)
    return (
      <View style={styles.center}>
        <Text style={{ color: t.danger, textAlign: 'center' }}>{error}</Text>
        <Pressable onPress={load} style={[styles.retryBtn, { backgroundColor: t.text }]}>
          <Text style={{ color: t.background, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </View>
    );
  if (!shown || !playlists)
    return (
      <View style={{ paddingTop: 4 }}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={styles.row}>
            <Skeleton style={styles.thumb} />
            <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
              <Skeleton style={{ height: 14, width: '70%' }} />
              <Skeleton style={{ height: 12, width: '40%' }} />
            </View>
          </View>
        ))}
      </View>
    );

  const menuPinned = !!menuFor && pinnedIds.has(menuFor.id);

  return (
    <>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item }) => {
          const pinned = pinnedIds.has(item.id);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id, title: item.title } })}
              onLongPress={() => setMenuFor(item)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
              <View style={styles.thumbWrap}>
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: t.surfaceHigh }]} />
                )}
                <View style={styles.countBadge}>
                  <Ionicons name={item.id === 'LL' ? 'thumbs-up' : 'list'} size={12} color="#fff" />
                  <Text style={styles.countText}>{item.itemCount}</Text>
                </View>
              </View>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
                  {pinned ? 'Pinned to Home · ' : ''}
                  {PRIVACY_LABEL[item.privacy]}
                  {item.id !== 'LL' ? ' playlist' : ''}
                  {item.lastAdded ? ` · updated ${timeAgo(item.lastAdded)}` : ''}
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => setMenuFor(item)}
                style={({ pressed }) => [styles.kebab, pressed && { opacity: 0.5 }]}>
                <Ionicons name="ellipsis-vertical" size={18} color={t.text} />
              </Pressable>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: t.secondary }}>
              No playlists yet. Save a video to create one.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.secondary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
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
          {SORTS.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => pickSort(o.key)}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: t.surface }]}>
              <Text style={[styles.menuText, { color: t.text, fontWeight: o.key === sort ? '700' : '400' }]}>
                {o.label}
              </Text>
              {o.key === sort && <Ionicons name="checkmark" size={18} color={t.text} />}
            </Pressable>
          ))}
        </Animated.View>
      </View>
      )}
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        onClose={() => setMenuFor(null)}
        actions={[
          {
            key: 'pin',
            label: menuPinned ? 'Unpin from Home' : 'Pin to Home',
            icon: menuPinned ? 'pin' : 'pin-outline',
            onPress: () => menuFor && togglePin(menuFor.id, playlists),
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingLeft: 12, paddingVertical: 8, gap: 12 },
  thumbWrap: { width: 160, height: 90 },
  thumb: { width: 160, height: 90, borderRadius: 8 },
  countBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    top: 0,
    width: 56,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
  sub: { fontSize: 12, marginTop: 4 },
  kebab: { width: 40, alignItems: 'center', paddingTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
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
