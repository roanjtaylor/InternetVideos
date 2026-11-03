import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  useColorScheme,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { api, Channel } from '@/lib/api';
import { signOut } from '@/lib/auth';

const COLUMNS = 3;

/** Landing view: who you follow. Pick everyone's latest, or one channel. */
export default function SubscriptionsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setChannels((await api.subscriptions()).channels);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <View style={styles.center}>
        <Text style={{ color: '#d33' }}>{error}</Text>
        <Pressable onPress={load}>
          <Text style={{ color: '#2f95dc', marginTop: 12 }}>Retry</Text>
        </Pressable>
      </View>
    );
  if (!channels)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  const subColor = scheme === 'dark' ? '#aaa' : '#606060';
  const divider = scheme === 'dark' ? '#333' : '#e5e5e5';

  return (
    <FlatList
      data={channels}
      numColumns={COLUMNS}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <Pressable
          onPress={() => router.push('/feed')}
          style={({ pressed }) => [styles.allRow, { borderBottomColor: divider }, pressed && { opacity: 0.6 }]}>
          <View style={styles.allIcon}>
            <FontAwesome name="newspaper-o" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.allTitle}>Latest from everyone</Text>
            <Text style={[styles.sub, { color: subColor }]}>
              Newest uploads across {channels.length} channels
            </Text>
          </View>
          <FontAwesome name="chevron-right" size={14} color={subColor} />
        </Pressable>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/channel/[id]', params: { id: item.id, title: item.title } })
          }
          style={({ pressed }) => [styles.cell, pressed && { opacity: 0.6 }]}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: '#333' }]} />
          )}
          <Text style={styles.name} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text>No subscriptions yet. Subscribe in YouTube and pull to refresh.</Text>
        </View>
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <Text style={[styles.sub, { color: subColor }]}>
            API quota today: {api.quota().used} / {api.quota().limit}
          </Text>
          <Pressable
            onPress={() =>
              Alert.alert('Sign out?', 'You can sign back in any time.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
              ])
            }>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await api.refresh();
            await load();
            setRefreshing(false);
          }}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  allIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allTitle: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  cell: { flex: 1 / COLUMNS, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  name: { fontSize: 13, textAlign: 'center', marginTop: 8 },
  footer: { alignItems: 'center', padding: 24, gap: 8 },
  signOut: { color: '#d33', fontSize: 14 },
});
