import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, Playlist } from '@/lib/api';
import { isWatchLaterTitle } from '@/lib/pins';
import { useTheme } from '@/lib/theme';

/**
 * YouTube's "Save to…" bottom sheet: rounded top corners over a dimmed
 * screen, one checkbox row per playlist (ticked when the video is in it;
 * tapping adds or removes at once), and a New playlist button.
 *
 * Adding to a playlist other than Watch later while the video is in Watch
 * later asks whether to take it out of there, since that is usually a move.
 */
export default function SaveSheet() {
  const { id } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  /** playlist id -> the video's playlist item there, or null when it is not in it. */
  const [member, setMember] = useState<Record<string, string | null>>({});
  const [liked, setLiked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // ---- Sheet motion: slide up on open, down on close ----
  const y = useSharedValue(height);
  const dim = useSharedValue(0);
  useEffect(() => {
    y.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
    dim.value = withTiming(1, { duration: 260 });
  }, [y, dim]);
  const close = useCallback(() => {
    dim.value = withTiming(0, { duration: 200 });
    y.value = withTiming(height, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(router.back)();
    });
  }, [y, dim, height, router]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = (await api.playlists()).playlists.filter((p) => p.id !== 'LL');
      setPlaylists(list);
      api
        .rating(id)
        .then((r) => setLiked(r === 'like'))
        .catch(() => setLiked(false));
      // Which playlists already hold the video: one cheap lookup each.
      const found = await Promise.all(
        list.map((p) =>
          api
            .findInPlaylist(p.id, id)
            .then((item) => [p.id, item] as const)
            .catch(() => [p.id, null] as const),
        ),
      );
      setMember(Object.fromEntries(found));
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (e: any) => Alert.alert('Could not save', e.message ?? String(e));

  /** After adding somewhere other than Watch later: offer to take it out of Watch later. */
  const offerMove = (addedTo: Playlist, current: Record<string, string | null>) => {
    if (isWatchLaterTitle(addedTo.title)) return;
    const wl = playlists?.find((p) => isWatchLaterTitle(p.title));
    const item = wl && current[wl.id];
    if (!wl || !item) return;
    Alert.alert(`Saved to “${addedTo.title}”`, 'Remove it from Watch later?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          try {
            await api.removePlaylistItem(wl.id, item);
            setMember((m) => ({ ...m, [wl.id]: null }));
          } catch (e) {
            fail(e);
          }
        },
      },
    ]);
  };

  const toggle = async (p: Playlist) => {
    if (busy) return;
    setBusy(p.id);
    try {
      const item = member[p.id];
      if (item) {
        await api.removePlaylistItem(p.id, item);
        setMember((m) => ({ ...m, [p.id]: null }));
      } else {
        const newItem = await api.addToPlaylist(p.id, id);
        const next = { ...member, [p.id]: newItem };
        setMember(next);
        offerMove(p, next);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const toggleLike = async () => {
    if (busy || liked === null) return;
    setBusy('like');
    try {
      if (liked) await api.unlike(id);
      else await api.like(id);
      setLiked(!liked);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const createAndAdd = async () => {
    const name = newTitle.trim();
    if (!name || busy) return;
    setBusy('new');
    try {
      const p = await api.createPlaylist(name);
      const item = await api.addToPlaylist(p.id, id);
      const created: Playlist = { id: p.id, title: p.title ?? name, itemCount: 1 } as Playlist;
      setPlaylists((list) => [created, ...(list ?? [])]);
      const next = { ...member, [p.id]: item };
      setMember(next);
      setNewTitle('');
      setCreating(false);
      offerMove(created, next);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const bg = t.dark ? '#212121' : '#fff';

  const Check = ({ on, loading }: { on: boolean; loading: boolean }) =>
    loading ? (
      <ActivityIndicator color={t.secondary} style={styles.check} />
    ) : (
      <Ionicons
        name={on ? 'checkbox' : 'square-outline'}
        size={26}
        color={on ? (t.dark ? '#3ea6ff' : '#065fd4') : t.secondary}
        style={styles.check}
      />
    );

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottom}
        pointerEvents="box-none">
        <Animated.View
          style={[styles.sheet, { backgroundColor: bg, maxHeight: height * 0.75, paddingBottom: insets.bottom + 8 }, sheetStyle]}>
          <View style={[styles.grabber, { backgroundColor: t.secondary }]} />
          <View style={styles.header}>
            <Text style={[styles.heading, { color: t.text }]}>Save to…</Text>
            <Pressable
              onPress={() => setCreating((c) => !c)}
              style={({ pressed }) => [styles.newBtn, { borderColor: t.secondary }, pressed && { opacity: 0.6 }]}>
              <Ionicons name="add" size={18} color={t.link} />
              <Text style={[styles.newText, { color: t.link }]}>New playlist</Text>
            </Pressable>
          </View>

          {creating && (
            <View style={styles.createRow}>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                onSubmitEditing={createAndAdd}
                placeholder="Playlist name"
                placeholderTextColor={t.secondary}
                returnKeyType="done"
                autoFocus
                style={[styles.input, { backgroundColor: t.surface, color: t.text }]}
              />
              {busy === 'new' ? (
                <ActivityIndicator color={t.secondary} />
              ) : (
                <Pressable onPress={createAndAdd} disabled={!newTitle.trim()} hitSlop={8}>
                  <Text style={[styles.newText, { color: t.link }, !newTitle.trim() && { opacity: 0.4 }]}>Create</Text>
                </Pressable>
              )}
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
            <Pressable
              onPress={toggleLike}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
              <Check on={!!liked} loading={busy === 'like' || liked === null} />
              <Text style={[styles.rowText, { color: t.text }]}>Liked videos</Text>
              <Ionicons name="lock-closed-outline" size={18} color={t.secondary} />
            </Pressable>

            {error ? (
              <View style={styles.center}>
                <Text style={{ color: t.danger }}>{error}</Text>
                <Pressable onPress={load}>
                  <Text style={{ color: t.link, marginTop: 12 }}>Retry</Text>
                </Pressable>
              </View>
            ) : !playlists ? (
              <ActivityIndicator color={t.secondary} style={{ margin: 24 }} />
            ) : (
              playlists.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => toggle(p)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
                  <Check on={!!member[p.id]} loading={busy === p.id || !(p.id in member)} />
                  <Text style={[styles.rowText, { color: t.text }]} numberOfLines={1}>
                    {p.title}
                  </Text>
                  {p.privacy === 'private' && <Ionicons name="lock-closed-outline" size={18} color={t.secondary} />}
                </Pressable>
              ))
            )}
          </ScrollView>

          <Pressable
            onPress={close}
            style={({ pressed }) => [styles.done, { backgroundColor: t.text }, pressed && { opacity: 0.8 }]}>
            <Text style={[styles.doneText, { color: bg }]}>Done</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { backgroundColor: 'rgba(0,0,0,0.55)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: 8, opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  heading: { fontSize: 18, fontWeight: '600' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 34,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  newText: { fontSize: 14, fontWeight: '600' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  check: { width: 26 },
  rowText: { fontSize: 16, flex: 1 },
  center: { padding: 24, alignItems: 'center' },
  done: { marginHorizontal: 16, marginTop: 8, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 15, fontWeight: '600' },
});
