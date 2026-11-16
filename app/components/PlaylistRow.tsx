import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Playlist } from '@/lib/api';
import { useTheme } from '@/lib/theme';

type Props = {
  playlist: Playlist;
  subtitle: string;
  onPress: () => void;
  /** Opens the row's menu (kebab and long press). */
  onMenu?: () => void;
};

/** A playlist in a list: thumbnail with YouTube's count strip, title, one line of detail. */
export function PlaylistRow({ playlist, subtitle, onPress, onMenu }: Props) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMenu}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
      <View style={styles.thumbWrap}>
        {playlist.thumbnail ? (
          <Image source={{ uri: playlist.thumbnail }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: t.surfaceHigh }]} />
        )}
        <View style={styles.countBadge}>
          <Ionicons name={playlist.id === 'LL' ? 'thumbs-up' : 'list'} size={12} color="#fff" />
          <Text style={styles.countText}>{playlist.itemCount}</Text>
        </View>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
          {playlist.title}
        </Text>
        <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {onMenu ? (
        <Pressable hitSlop={10} onPress={onMenu} style={({ pressed }) => [styles.kebab, pressed && { opacity: 0.5 }]}>
          <Ionicons name="ellipsis-vertical" size={18} color={t.text} />
        </Pressable>
      ) : (
        <View style={{ width: 12 }} />
      )}
    </Pressable>
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
});
