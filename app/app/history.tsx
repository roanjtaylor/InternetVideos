import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { VideoRow } from '@/components/VideoList';
import { timeAgo } from '@/lib/api';
import { clearHistory, removeFromHistory, useWatchHistory } from '@/lib/history';
import { useTheme } from '@/lib/theme';

/** Everything the app has played, newest first. Swipe-free: a cross removes one entry. */
export default function HistoryScreen() {
  const t = useTheme();
  const history = useWatchHistory();

  const confirmClear = () =>
    Alert.alert('Clear watch history?', 'This removes the history kept on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearHistory() },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'History',
          headerRight: () =>
            history && history.length > 0 ? (
              <Pressable hitSlop={8} onPress={confirmClear} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
                <Ionicons name="trash-outline" size={22} color={t.text} />
              </Pressable>
            ) : null,
        }}
      />
      {history === null ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(e) => e.video.id}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <View>
              <VideoRow video={item.video} />
              <View style={styles.footer}>
                <Text style={[styles.watched, { color: t.secondary }]}>Watched {timeAgo(item.watchedAt)}</Text>
                <Pressable hitSlop={8} onPress={() => removeFromHistory(item.video.id)}>
                  <Text style={[styles.remove, { color: t.link }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: t.secondary }}>Nothing watched yet.</Text>
            </View>
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: 12, marginLeft: 184, marginTop: -6, marginBottom: 6, paddingRight: 16 },
  watched: { fontSize: 11 },
  remove: { fontSize: 11, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
